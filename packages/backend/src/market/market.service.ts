import type { Package } from '@sga/shared';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { AdminService } from '../admin/admin.service';

export interface MarketPackageResult {
  items: Package[];
  total: number;
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  public constructor(
    private readonly config: AppConfigService,
    @Optional() private readonly adminService?: AdminService
  ) {}

  public async searchPackages(q?: string, category?: string): Promise<MarketPackageResult> {
    const marketUrl = await this.getMarketUrl();
    const headers = await this.getMarketHeaders();
    const url = new URL('/packages', marketUrl);
    if (q) url.searchParams.set('q', q);
    if (category) url.searchParams.set('category', category);

    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(10_000)
      });

      if (!response.ok) {
        this.logger.warn(`Market returned ${response.status} from ${url}`);
        return { items: [], total: 0 };
      }

      const body = (await response.json()) as { data?: MarketPackageResult };
      return body.data ?? { items: [], total: 0 };
    } catch (error) {
      this.logger.warn(`Failed to reach Market at ${marketUrl}: ${error}`);
      return { items: [], total: 0 };
    }
  }

  public async fetchPackageById(packageId: string): Promise<Package | null> {
    const marketUrl = await this.getMarketUrl();
    const headers = await this.getMarketHeaders();
    const url = new URL(`/packages/${encodeURIComponent(packageId)}`, marketUrl);

    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(10_000)
      });

      if (!response.ok) {
        this.logger.warn(`Market package fetch returned ${response.status}`);
        return null;
      }

      const body = (await response.json()) as { data?: Package };
      return body.data ?? null;
    } catch (error) {
      this.logger.warn(`Failed to fetch package ${packageId} from Market: ${error}`);
      return null;
    }
  }

  public async downloadPackageTarball(packageId: string): Promise<Buffer | null> {
    const marketUrl = await this.getMarketUrl();
    const headers = await this.getMarketHeaders();
    const url = new URL(`/packages/${encodeURIComponent(packageId)}/download`, marketUrl);

    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        this.logger.warn(`Market download returned ${response.status} for ${packageId}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.warn(`Failed to download package ${packageId} from Market: ${error}`);
      return null;
    }
  }

  private async getMarketUrl(): Promise<string> {
    if (!this.adminService) {
      return this.config.get('MARKET_URL');
    }

    const savedUrl = (await this.adminService.getSetting('market.url'))?.trim();
    if (savedUrl) {
      return savedUrl;
    }
    return this.config.get('MARKET_URL');
  }

  private async getMarketHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!this.adminService) {
      return headers;
    }

    const token = (await this.adminService.getSetting('market.token'))?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }
}