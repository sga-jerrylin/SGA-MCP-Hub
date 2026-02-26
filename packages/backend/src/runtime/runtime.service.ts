import type {
  McpServer,
  McpServerDetail,
  McpTool,
  Package,
  ToolsListResponse
} from '@sga/shared';
import { ChildProcess, execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type * as Minio from 'minio';
import { AuthVaultService } from '../auth-vault/auth-vault.service';
import { MinioService } from '../storage/minio.service';

const execFileAsync = promisify(execFile);

interface ManifestSidecar {
  packageId: string;
  manifest: Package;
  pushedAt: string;
}

interface ManagedProcess {
  child: ChildProcess;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  nextId: number;
  stdoutBuf: string;
}

interface McpCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);
  private readonly runningProcesses = new Map<string, ManagedProcess>();

  public constructor(
    private readonly minio: MinioService,
    private readonly vault: AuthVaultService
  ) {}

  public async listServers(): Promise<McpServer[]> {
    const sidecars = await this.loadAllSidecars();

    return sidecars.map((sidecar) => this.toServer(sidecar.manifest, sidecar.pushedAt));
  }

  public async getServer(id: string): Promise<
    McpServerDetail & {
      credentialsConfigured: boolean;
      credentialStatus: Array<{ keyName: string; description?: string; configured: boolean }>;
    }
  > {
    const sidecar = await this.readManifestSidecarById(id).catch(() => null);
    if (!sidecar) {
      throw new NotFoundException(`Server ${id} not found`);
    }

    const base = this.toServer(sidecar.manifest, sidecar.pushedAt);
    const tools = this.toTools(sidecar.manifest);
    // CLI manifest uses "credentials" with {key, label, type, required, description}
    // Map to {keyName, description} for credential status check
    const manifestAny = sidecar.manifest as unknown as Record<string, unknown>;
    const rawCreds = Array.isArray(manifestAny.credentials)
      ? manifestAny.credentials
      : Array.isArray(manifestAny.requiredCredentials)
        ? manifestAny.requiredCredentials
        : [];
    const requiredCreds: Array<{ keyName: string; description?: string }> = rawCreds
      .filter((c): c is Record<string, unknown> => isRecord(c))
      .map((c) => ({
        keyName: String(c.key ?? c.keyName ?? ''),
        description:
          typeof c.description === 'string'
            ? c.description
            : typeof c.label === 'string'
              ? c.label
              : undefined
      }))
      .filter((c) => c.keyName.length > 0);

    const configuredKeys = await this.vault.listKeys('default', id).catch(() => []);
    const configuredKeyNames = new Set(configuredKeys.map((k) => k.keyName));

    const credentialStatus = requiredCreds.map((rc) => ({
      keyName: rc.keyName,
      description: rc.description,
      configured: configuredKeyNames.has(rc.keyName)
    }));

    return {
      ...base,
      credentialsConfigured:
        requiredCreds.length === 0 || credentialStatus.every((c) => c.configured),
      credentialStatus,
      tools,
      metrics: {
        qps: 0,
        p95Latency: 0,
        errorRate: 0
      }
    };
  }

  public async findServerIdByName(name: string): Promise<string | null> {
    const sidecars = await this.loadAllSidecars();
    const found = sidecars.find((s) => s.manifest.name === name);
    return found ? found.manifest.id : null;
  }

  public async listTools(serverId: string): Promise<ToolsListResponse> {
    const detail = await this.getServer(serverId);
    return {
      tools: detail.tools,
      tokenUsage: detail.tokenUsage,
      tokenBudget: detail.tokenBudget
    };
  }

  public async callTool(
    serverId: string,
    bareToolName: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    const managed = await this.ensurePackageProcess(serverId);
    const requestId = managed.nextId++;

    const response = (await this.sendRpc(
      managed,
      {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: bareToolName,
          arguments: args
        }
      },
      30_000
    )) as {
      result?: unknown;
      error?: { code?: number; message?: string; data?: unknown };
    };

    if (response.error) {
      throw new Error(response.error.message ?? 'Tool call failed');
    }

    if (
      isRecord(response.result) &&
      Array.isArray((response.result as { content?: unknown[] }).content)
    ) {
      return response.result as unknown as McpCallResult;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(response.result ?? null, null, 2) }]
    };
  }

  private async loadAllSidecars(): Promise<ManifestSidecar[]> {
    const keys = await this.listManifestKeys();
    const sidecars: ManifestSidecar[] = [];

    for (const key of keys) {
      try {
        const sidecar = await this.readManifestSidecarByKey(key);
        sidecars.push(sidecar);
      } catch {
        // Skip malformed sidecar.
      }
    }

    sidecars.sort((left, right) => right.pushedAt.localeCompare(left.pushedAt));
    return sidecars;
  }

  private async readManifestSidecarById(packageId: string): Promise<ManifestSidecar> {
    return this.readManifestSidecarByKey(`packages/${packageId}/manifest.json`);
  }

  private async readManifestSidecarByKey(key: string): Promise<ManifestSidecar> {
    const stream = await this.minio.getObject('packages', key);
    const buffer = await this.readStream(stream);
    const parsed = JSON.parse(buffer.toString('utf8')) as Partial<ManifestSidecar>;

    if (
      typeof parsed.packageId !== 'string' ||
      !parsed.manifest ||
      typeof parsed.manifest !== 'object'
    ) {
      throw new Error(`Invalid manifest sidecar: ${key}`);
    }

    return {
      packageId: parsed.packageId,
      manifest: parsed.manifest as Package,
      pushedAt: typeof parsed.pushedAt === 'string' ? parsed.pushedAt : new Date().toISOString()
    };
  }

  private async listManifestKeys(): Promise<string[]> {
    const client = this.minio.getClient();
    const stream = client.listObjectsV2('packages', 'packages/', true);

    return new Promise<string[]>((resolve) => {
      const keys: string[] = [];

      stream.on('data', (item: Minio.BucketItem) => {
        if (typeof item.name === 'string' && item.name.endsWith('/manifest.json')) {
          keys.push(item.name);
        }
      });
      stream.on('error', () => resolve([]));
      stream.on('end', () => resolve(keys));
    });
  }

  private async ensurePackageProcess(serverId: string): Promise<ManagedProcess> {
    const existing = this.runningProcesses.get(serverId);
    if (existing && existing.child.exitCode === null && !existing.child.killed) {
      return existing;
    }

    if (existing) {
      this.runningProcesses.delete(serverId);
    }

    const workRoot = join(tmpdir(), 'hub-packages', serverId);
    const appDir = join(workRoot, 'app');
    const archivePath = join(workRoot, 'package.tgz');

    await fs.rm(workRoot, { recursive: true, force: true });
    await fs.mkdir(appDir, { recursive: true });

    const archiveStream = await this.minio.getObject('packages', `packages/${serverId}/package.tgz`);
    const archiveBuffer = await this.readStream(archiveStream);
    await fs.writeFile(archivePath, archiveBuffer);

    try {
      await execFileAsync('tar', ['-xzf', archivePath, '-C', appDir], { timeout: 60_000 });
    } catch (error) {
      throw new Error(
        `Failed to start package process: extract failed (${error instanceof Error ? error.message : String(error)})`
      );
    }

    const runDir = await this.resolveRunDir(appDir);

    try {
      await execFileAsync('npm', ['install', '--production', '--ignore-scripts'], {
        cwd: runDir,
        timeout: 180_000
      });
    } catch (error) {
      throw new Error(
        `Failed to start package process: npm install failed (${error instanceof Error ? error.message : String(error)})`
      );
    }

    const entryPath = await this.resolveEntryPath(runDir);
    const credentialEnv = await this.loadCredentialEnv(serverId);

    const child = spawn('node', [entryPath], {
      cwd: runDir,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...process.env,
        ...credentialEnv
      }
    });

    if (!child.stdin || !child.stdout) {
      throw new Error('Failed to start package process: stdio pipe unavailable');
    }

    const managed: ManagedProcess = {
      child,
      pending: new Map(),
      nextId: 1,
      stdoutBuf: ''
    };

    child.stdout.on('data', (chunk: Buffer) => {
      managed.stdoutBuf += chunk.toString('latin1');
      this.drainStdoutBuffer(managed);
    });

    child.on('exit', (code, signal) => {
      this.runningProcesses.delete(serverId);
      for (const [, pending] of managed.pending) {
        pending.reject(
          new Error(
            `Package process exited before response (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
          )
        );
      }
      managed.pending.clear();
    });

    this.runningProcesses.set(serverId, managed);
    this.logger.log(`Started package process for ${serverId}`);

    try {
      const initializeId = managed.nextId++;
      const initResponse = (await this.sendRpc(
        managed,
        {
          jsonrpc: '2.0',
          id: initializeId,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'sga-mcp-hub',
              version: '0.1.0'
            }
          }
        },
        15_000
      )) as { error?: { message?: string } };

      if (initResponse.error) {
        throw new Error(initResponse.error.message ?? 'initialize failed');
      }

      this.writeMessage(managed, {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });
    } catch (error) {
      this.runningProcesses.delete(serverId);
      try {
        managed.child.kill();
      } catch {
        // no-op
      }
      throw new Error(
        `Failed to start package process: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return managed;
  }

  private toServer(pkg: Package, pushedAt: string): McpServer {
    const rawToolCount = (pkg as Package & { toolsCount?: unknown }).toolsCount ?? pkg.toolCount ?? 0;
    const toolCount = Number.isFinite(Number(rawToolCount)) ? Number(rawToolCount) : 0;

    return {
      id: pkg.id,
      name: pkg.name,
      shardIndex: 0,
      status: 'pending',
      toolCount,
      tokenUsage: Math.min(toolCount * 120, 8000),
      tokenBudget: 8000,
      endpoint: '/api/mcp',
      port: 0,
      createdAt: pushedAt || pkg.publishedAt
    };
  }

  private toTools(pkg: Package): McpTool[] {
    const rawTools = (pkg as Package & { tools?: unknown[] }).tools;
    const manifestTools = Array.isArray(rawTools) ? rawTools : [];
    const rawToolsSummary = (pkg as Package & { toolsSummary?: unknown }).toolsSummary;
    let summaryTools: unknown[] = [];
    if (Array.isArray(rawToolsSummary)) {
      summaryTools = rawToolsSummary;
    } else if (typeof rawToolsSummary === 'string' && rawToolsSummary.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawToolsSummary) as unknown;
        if (Array.isArray(parsed)) {
          summaryTools = parsed;
        }
      } catch {
        summaryTools = [];
      }
    }
    const sourceTools = manifestTools.length > 0 ? manifestTools : summaryTools;

    const normalizedTools = sourceTools
      .filter(
        (
          tool
        ): tool is { name: string; description?: string; inputSchema?: Record<string, unknown> } =>
          isRecord(tool) && typeof tool.name === 'string' && tool.name.trim().length > 0
      )
      .map((tool) => {
        const trimmed = tool.name.trim();
        const parts = trimmed.split('.');
        const bareName = (parts[parts.length - 1] || trimmed).trim();

        return {
          name: `${pkg.name}.${bareName}`,
          ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
          inputSchema: isRecord(tool.inputSchema)
            ? tool.inputSchema
            : { type: 'object', properties: {} }
        };
      });

    if (normalizedTools.length > 0) {
      return normalizedTools;
    }

    const rawCount = (pkg as Package & { toolsCount?: unknown }).toolsCount ?? pkg.toolCount ?? 0;
    const countNumber = Number.isFinite(Number(rawCount)) ? Number(rawCount) : 0;
    const count = Math.max(0, Math.min(countNumber, 20));
    const tools: McpTool[] = [];

    for (let index = 0; index < count; index += 1) {
      tools.push({
        name: `${pkg.name}.tool_${index + 1}`,
        description: `Generated tool ${index + 1} for ${pkg.name}`
      });
    }

    return tools;
  }

  private drainStdoutBuffer(managed: ManagedProcess): void {
    const buffer = Buffer.from(managed.stdoutBuf, 'latin1');
    let offset = 0;

    while (offset < buffer.length) {
      const headerEnd = buffer.indexOf('\r\n\r\n', offset, 'utf8');
      if (headerEnd < 0) {
        break;
      }

      const headerText = buffer.toString('utf8', offset, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!match) {
        offset = headerEnd + 4;
        continue;
      }

      const length = Number(match[1]);
      if (!Number.isFinite(length) || length < 0) {
        offset = headerEnd + 4;
        continue;
      }

      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) {
        break;
      }

      const body = buffer.toString('utf8', bodyStart, bodyEnd);
      offset = bodyEnd;

      try {
        const message = JSON.parse(body) as { id?: number | string | null };
        if (typeof message.id === 'number' || typeof message.id === 'string') {
          const responseId = Number(message.id);
          if (Number.isFinite(responseId)) {
            const pending = managed.pending.get(responseId);
            if (pending) {
              managed.pending.delete(responseId);
              pending.resolve(message);
            }
          }
        }
      } catch {
        // Ignore malformed message and continue parsing subsequent frames.
      }
    }

    managed.stdoutBuf = buffer.subarray(offset).toString('latin1');
  }

  private writeMessage(managed: ManagedProcess, message: Record<string, unknown>): void {
    if (!managed.child.stdin) {
      throw new Error('Failed to write RPC message: stdin unavailable');
    }
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    managed.child.stdin.write(Buffer.concat([header, body]));
  }

  private async sendRpc(
    managed: ManagedProcess,
    request: { jsonrpc: '2.0'; id: number; method: string; params?: Record<string, unknown> },
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        managed.pending.delete(request.id);
        reject(new Error('Tool call timeout'));
      }, timeoutMs);

      managed.pending.set(request.id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });

      try {
        this.writeMessage(managed, request as unknown as Record<string, unknown>);
      } catch (error) {
        managed.pending.delete(request.id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async resolveRunDir(appDir: string): Promise<string> {
    const rootPackageJson = join(appDir, 'package.json');
    if (await this.pathExists(rootPackageJson)) {
      return appDir;
    }

    const entries = await fs.readdir(appDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = join(appDir, entry.name, 'package.json');
      if (await this.pathExists(candidate)) {
        return join(appDir, entry.name);
      }
    }

    throw new Error('Failed to start package process: package.json not found after extract');
  }

  private async resolveEntryPath(runDir: string): Promise<string> {
    const pkgPath = join(runDir, 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const pkgJson = JSON.parse(pkgRaw) as { main?: unknown };

    if (typeof pkgJson.main === 'string' && pkgJson.main.trim().length > 0) {
      const mainPath = join(runDir, pkgJson.main);
      if (await this.pathExists(mainPath)) {
        return mainPath;
      }
    }

    const fallback = join(runDir, 'dist', 'index.js');
    if (await this.pathExists(fallback)) {
      return fallback;
    }

    throw new Error('Failed to start package process: entrypoint not found');
  }

  private async loadCredentialEnv(serverId: string): Promise<Record<string, string>> {
    const keys = await this.vault.listKeys('default', serverId).catch(() => []);
    const env: Record<string, string> = {};

    for (const key of keys) {
      const value = await this.vault
        .getCredentialPlaintext('default', serverId, key.keyName)
        .catch(() => null);
      if (typeof value === 'string') {
        env[key.keyName] = value;
      }
    }

    return env;
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: unknown) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}

