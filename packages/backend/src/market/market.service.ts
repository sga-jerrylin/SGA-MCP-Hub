import type { Package } from '@sga/shared';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

export interface MarketPackageResult {
  items: Package[];
  total: number;
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  public constructor(private readonly config: AppConfigService) {}

  public async searchPackages(q?: string, category?: string): Promise<MarketPackageResult> {
    const marketUrl = this.config.get('MARKET_URL');
    const url = new URL('/api/packages', marketUrl);
    if (q) url.searchParams.set('q', q);
    if (category) url.searchParams.set('category', category);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
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
    const marketUrl = this.config.get('MARKET_URL');
    const url = new URL(`/api/packages/${encodeURIComponent(packageId)}`, marketUrl);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
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
}
