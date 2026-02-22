import type { ApiResponse, Package } from '@sga/shared';
import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { MarketService } from './market.service';
import { invalidateRepoCatalog, RepoService } from '../repo/repo.service';
import { MinioService } from '../storage/minio.service';
import { MonitorService } from '../monitor/monitor.service';

export interface MarketPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  toolsCount: number;
  downloads: number;
  publishedAt: string;
  enhancedDescription?: string | null;
  cardImageBase64?: string | null;
  logoBase64?: string | null;
  autoCategory?: string | null;
  toolsSummary?: string | null;
  pipelineStatus?: string | null;
  installedInHub?: boolean;
}

@Controller()
export class MarketController {
  public constructor(
    private readonly marketService: MarketService,
    private readonly minio: MinioService,
    private readonly repoService: RepoService,
    private readonly monitorService: MonitorService,
  ) {}

  @Get('market/packages')
  public async listMarketPackages(
    @Query('q') q?: string,
    @Query('category') category?: string,
  ): Promise<ApiResponse<{ items: MarketPackage[]; total: number }>> {
    const result = await this.marketService.searchPackages(q, category);

    // Cross-reference with local repo to mark installed packages
    const localPackages = await this.repoService.listPackages(1, 1000).catch(() => ({
      items: [] as Package[],
      total: 0,
      page: 1,
      pageSize: 1000
    }));
    const localIds = new Set(localPackages.items.map((p) => p.id));

    const items: MarketPackage[] = (result.items as unknown as MarketPackage[]).map((pkg) => ({
      ...pkg,
      installedInHub: localIds.has(pkg.id),
    }));

    return { code: 0, message: 'ok', data: { items, total: result.total } };
  }

  @Get('market/packages/:id')
  public async getMarketPackage(
    @Param('id') id: string,
  ): Promise<ApiResponse<MarketPackage>> {
    const pkg = await this.marketService.fetchPackageById(id);
    if (!pkg) {
      throw new NotFoundException(`Package ${id} not found in Market`);
    }

    // Check if installed locally
    const isInstalled = await this.repoService.getPackage(id).then(() => true).catch(() => false);

    return {
      code: 0,
      message: 'ok',
      data: { ...(pkg as unknown as MarketPackage), installedInHub: isInstalled },
    };
  }

  @Post('packages/install')
  public async installFromMarket(
    @Body() body: { packageId: string },
  ): Promise<ApiResponse<{ packageId: string; manifest: Package }>> {
    const pkg = await this.marketService.fetchPackageById(body.packageId);
    if (!pkg) {
      throw new NotFoundException(`Package ${body.packageId} not found in Market`);
    }

    // Write manifest sidecar to local MinIO so the package appears in Hub's repo
    const sidecar = {
      packageId: pkg.id,
      manifest: pkg,
      pushedAt: new Date().toISOString(),
    };
    const buffer = Buffer.from(JSON.stringify(sidecar), 'utf8');
    await this.minio.putObject(
      'packages',
      `packages/${pkg.id}/manifest.json`,
      buffer,
    );

    invalidateRepoCatalog();

    // Record audit log
    this.monitorService.recordAuditLog('market.install', 'system', pkg.id);

    return {
      code: 0,
      message: 'ok',
      data: { packageId: pkg.id, manifest: pkg },
    };
  }
}
