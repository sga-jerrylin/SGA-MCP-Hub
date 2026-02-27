import type { Package, PaginatedList } from '@sga/shared';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type * as Minio from 'minio';
import { Repository } from 'typeorm';
import { MinioService } from '../storage/minio.service';
import { MarketService } from '../market/market.service';
import { ToolCatalogEntity } from './entities/tool-catalog.entity';

interface ManifestSidecar {
  packageId: string;
  manifest: Package;
  pushedAt: string;
}

let repoCatalogVersion = 0;

export function invalidateRepoCatalog(): void {
  repoCatalogVersion += 1;
}

@Injectable()
export class RepoService implements OnModuleInit {
  private readonly logger = new Logger(RepoService.name);
  private cachedCatalog: { version: number; items: Package[] } | null = null;

  public constructor(
    private readonly minio: MinioService,
    private readonly marketService: MarketService,
    @InjectRepository(ToolCatalogEntity)
    private readonly toolCatalogRepo: Repository<ToolCatalogEntity>
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.minio.ensureBucket('packages');
  }

  public async listPackages(page = 1, size = 20): Promise<PaginatedList<Package>> {
    const packages = await this.loadCatalog();
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 20;
    const start = (safePage - 1) * safeSize;
    const items = packages.slice(start, start + safeSize);

    return {
      items,
      total: packages.length,
      page: safePage,
      pageSize: safeSize
    };
  }

  public async getPackage(id: string): Promise<Package> {
    const packages = await this.loadCatalog();
    const pkg = packages.find((item) => item.id === id);
    if (pkg) {
      return pkg;
    }

    const sidecar = await this.loadManifestSidecar(id).catch(() => null);
    if (sidecar) {
      return sidecar.manifest;
    }

    throw new NotFoundException(`Package ${id} not found`);
  }

  public async installPackage(
    id: string
  ): Promise<{ packageId: string; pullUrl: string; manifest: Package }> {
    const manifest = await this.marketService.fetchPackageById(id);
    if (!manifest) {
      throw new NotFoundException(`Package ${id} not found in Market`);
    }

    const tarball = await this.marketService.downloadPackageTarball(id);
    if (!tarball) {
      throw new NotFoundException(`Package ${id} tarball not found in Market`);
    }

    const tarballKey = `packages/${id}/package.tgz`;
    const manifestKey = `packages/${id}/manifest.json`;

    // Force reinstall behavior: remove previous artifacts then store fresh download.
    await this.minio.removeObject('packages', tarballKey).catch(() => {});
    await this.minio.removeObject('packages', manifestKey).catch(() => {});

    await this.minio.putObject('packages', tarballKey, tarball);
    const sidecar = Buffer.from(
      JSON.stringify(
        {
          packageId: id,
          manifest,
          pushedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
    await this.minio.putObject('packages', manifestKey, sidecar);
    await this.ingestToolCatalog(id, manifest).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ToolCatalog] Ingest failed for ${id}: ${message}`);
    });
    invalidateRepoCatalog();

    return {
      packageId: id,
      pullUrl: `/api/sync/pull/${id}`,
      manifest
    };
  }

  private async loadCatalog(): Promise<Package[]> {
    if (this.cachedCatalog && this.cachedCatalog.version === repoCatalogVersion) {
      return this.cachedCatalog.items;
    }

    const manifestKeys = await this.listManifestKeys();
    const packageList: Package[] = [];

    for (const key of manifestKeys) {
      try {
        const sidecar = await this.readManifestSidecarByKey(key);
        packageList.push(sidecar.manifest);
      } catch {
        // Skip malformed sidecar and continue loading catalog.
      }
    }

    packageList.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
    this.cachedCatalog = {
      version: repoCatalogVersion,
      items: packageList
    };

    return packageList;
  }

  private async loadManifestSidecar(packageId: string): Promise<ManifestSidecar> {
    const key = `packages/${packageId}/manifest.json`;
    return this.readManifestSidecarByKey(key);
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

    return new Promise<string[]>((resolve, reject) => {
      const keys: string[] = [];

      stream.on('data', (item: Minio.BucketItem) => {
        if (typeof item.name === 'string' && item.name.endsWith('/manifest.json')) {
          keys.push(item.name);
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(keys));
    });
  }

  public async uninstallPackage(id: string): Promise<void> {
    // Verify package exists
    await this.getPackage(id);

    // Delete from Minio
    const tarballKey = `packages/${id}/package.tgz`;
    const manifestKey = `packages/${id}/manifest.json`;

    await this.minio.removeObject('packages', tarballKey).catch(() => {});
    await this.minio.removeObject('packages', manifestKey).catch(() => {});

    // Invalidate cache
    invalidateRepoCatalog();
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

  private parseToolsFromManifest(manifest: Record<string, unknown>): Array<Record<string, unknown>> {
    if (Array.isArray(manifest.tools)) {
      return manifest.tools.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      );
    }

    if (Array.isArray(manifest.toolsSummary)) {
      return manifest.toolsSummary.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      );
    }

    if (typeof manifest.toolsSummary === 'string') {
      try {
        const parsed = JSON.parse(manifest.toolsSummary) as unknown;
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        );
      } catch {
        return [];
      }
    }

    return [];
  }

  private async ingestToolCatalog(packageId: string, manifest: Package): Promise<void> {
    const manifestRecord = manifest as unknown as Record<string, unknown>;
    const tools = this.parseToolsFromManifest(manifestRecord);
    if (tools.length === 0) {
      return;
    }

    const schemaVersion = manifestRecord.manifestSchemaVersion === 'v2' ? 'v2' : 'legacy';
    const source = schemaVersion === 'v2' ? 'manifest' : 'summary';
    const rawTags = Array.isArray(manifestRecord.tags) ? manifestRecord.tags : [];
    const tags = rawTags.filter((item): item is string => typeof item === 'string');

    for (const tool of tools) {
      const toolName = typeof tool.name === 'string' ? tool.name.trim() : '';
      if (!toolName) {
        continue;
      }

      const fullName = `${packageId}.${toolName}`;
      const inputSchemaValue =
        tool.inputSchema && typeof tool.inputSchema === 'object'
          ? (tool.inputSchema as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const upsertPayload = {
        packageId,
        packageName: manifest.name ?? packageId,
        category: manifest.category ?? null,
        tags,
        toolName,
        fullName,
        description: typeof tool.description === 'string' ? tool.description : null,
        inputSchema: inputSchemaValue,
        schemaVersion,
        source,
        updatedAt: new Date()
      };

      await this.toolCatalogRepo.upsert(
        upsertPayload as any,
        {
          conflictPaths: ['packageId', 'toolName'],
          skipUpdateIfNoValuesChanged: true
        }
      );
    }

    this.logger.log(`[ToolCatalog] Ingested ${tools.length} tools for ${packageId} (${schemaVersion})`);
  }
}
