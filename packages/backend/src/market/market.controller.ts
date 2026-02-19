import type { ApiResponse, Package } from '@sga/shared';
import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { MarketService } from './market.service';
import { invalidateRepoCatalog } from '../repo/repo.service';
import { MinioService } from '../storage/minio.service';

@Controller()
export class MarketController {
  public constructor(
    private readonly marketService: MarketService,
    private readonly minio: MinioService,
  ) {}

  @Get('market/packages')
  public async listMarketPackages(
    @Query('q') q?: string,
    @Query('category') category?: string,
  ): Promise<ApiResponse<{ items: Package[]; total: number }>> {
    const result = await this.marketService.searchPackages(q, category);
    return { code: 0, message: 'ok', data: result };
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

    return {
      code: 0,
      message: 'ok',
      data: { packageId: pkg.id, manifest: pkg },
    };
  }
}
