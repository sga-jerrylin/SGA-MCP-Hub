import type {
  McpServer,
  McpServerDetail,
  McpTool,
  Package,
  ToolsListResponse
} from '@sga/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import type * as Minio from 'minio';
import { AuthVaultService } from '../auth-vault/auth-vault.service';
import { MinioService } from '../storage/minio.service';

interface ManifestSidecar {
  packageId: string;
  manifest: Package;
  pushedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class RuntimeService {
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
        description: typeof c.description === 'string' ? c.description : typeof c.label === 'string' ? c.label : undefined
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

  public async listTools(serverId: string): Promise<ToolsListResponse> {
    const detail = await this.getServer(serverId);
    return {
      tools: detail.tools,
      tokenUsage: detail.tokenUsage,
      tokenBudget: detail.tokenBudget
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

  private toServer(pkg: Package, pushedAt: string): McpServer {
    return {
      id: pkg.id,
      name: pkg.name,
      shardIndex: 0,
      status: 'pending',
      toolCount: pkg.toolCount,
      tokenUsage: Math.min(pkg.toolCount * 120, 8000),
      tokenBudget: 8000,
      endpoint: '/api/mcp',
      port: 0,
      createdAt: pushedAt || pkg.publishedAt
    };
  }

  private toTools(pkg: Package): McpTool[] {
    const rawTools = (pkg as Package & { tools?: unknown[] }).tools;
    const manifestTools = Array.isArray(rawTools) ? rawTools : [];

    const normalizedTools = manifestTools
      .filter(
        (
          tool
        ): tool is { name: string; description?: string; inputSchema?: Record<string, unknown> } =>
          isRecord(tool) && typeof tool.name === 'string' && tool.name.trim().length > 0
      )
      .map((tool) => ({
        name: tool.name.startsWith(`${pkg.id}.`) ? tool.name : `${pkg.id}.${tool.name}`,
        ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
        ...(isRecord(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {})
      }));

    if (normalizedTools.length > 0) {
      return normalizedTools;
    }

    const count = Math.max(0, Math.min(pkg.toolCount, 20));
    const tools: McpTool[] = [];

    for (let index = 0; index < count; index += 1) {
      tools.push({
        name: `${pkg.id}.tool_${index + 1}`,
        description: `Generated tool ${index + 1} for ${pkg.name}`
      });
    }

    return tools;
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
