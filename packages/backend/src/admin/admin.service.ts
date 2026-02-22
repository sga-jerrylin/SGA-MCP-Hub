import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import type {
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  CreateTenantRequest,
  Tenant
} from '@sga/shared';
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { HubSettingEntity } from './entities/hub-setting.entity';

type StoredApiKey = ApiKey & { hash: string };

const MARKET_URL_KEY = 'market.url';
const MARKET_TOKEN_KEY = 'market.token';

@Injectable()
export class AdminService {
  public constructor(
    @Optional()
    @InjectRepository(HubSettingEntity)
    private readonly settingsRepo?: Repository<HubSettingEntity>,
    @Optional()
    private readonly config?: AppConfigService
  ) {}

  private readonly tenants: Tenant[] = [
    {
      id: 'tenant-default',
      name: 'Default Tenant',
      contact: 'admin@example.com',
      status: 'active',
      createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString()
    }
  ];

  private readonly keyStore = new Map<string, StoredApiKey[]>();
  private readonly inMemorySettings = new Map<string, string>();

  public listTenants(): Tenant[] {
    return [...this.tenants];
  }

  public createTenant(req: CreateTenantRequest): Tenant {
    const tenant: Tenant = {
      id: `tenant-${Date.now()}`,
      name: req.name,
      contact: req.contact,
      status: 'active',
      createdAt: new Date().toISOString()
    };
    this.tenants.push(tenant);
    return tenant;
  }

  public listKeys(tenantId: string): ApiKey[] {
    const keys = this.keyStore.get(tenantId) ?? [];
    return keys.map(({ hash: _hash, ...rest }) => rest);
  }

  public createKey(tenantId: string, req: CreateApiKeyRequest): CreateApiKeyResponse {
    const rawKey = `mcp_${randomBytes(16).toString('hex')}`;
    const expiresAt = this.resolveExpiry(req.expiresIn);
    const prefix = rawKey.slice(0, 8);
    const key: StoredApiKey = {
      id: `key-${Date.now()}`,
      name: req.name,
      prefix,
      expiresAt,
      status: 'active',
      hash: this.hash(rawKey)
    };

    const existing = this.keyStore.get(tenantId) ?? [];
    existing.push(key);
    this.keyStore.set(tenantId, existing);

    return {
      id: key.id,
      name: key.name,
      key: rawKey,
      prefix,
      expiresAt
    };
  }

  public revokeKey(tenantId: string, keyId: string): void {
    const keys = this.keyStore.get(tenantId) ?? [];
    const target = keys.find((key) => key.id === keyId);
    if (target) {
      target.status = 'revoked';
    }
  }

  public getSystemInfo(): { appVersion: string; uptimeSeconds: number } {
    const pkgPath = require.resolve('../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return {
      appVersion: pkg.version ?? '0.0.0',
      uptimeSeconds: Math.floor(process.uptime())
    };
  }

  public async getSetting(key: string): Promise<string | null> {
    if (this.settingsRepo) {
      const found = await this.settingsRepo.findOne({ where: { key } });
      return found?.value ?? null;
    }
    return this.inMemorySettings.get(key) ?? null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    if (this.settingsRepo) {
      const existing = await this.settingsRepo.findOne({ where: { key } });
      if (existing) {
        existing.value = value;
        await this.settingsRepo.save(existing);
        return;
      }
      const created = this.settingsRepo.create({ key, value });
      await this.settingsRepo.save(created);
      return;
    }

    this.inMemorySettings.set(key, value);
  }

  public async getMarketConfig(): Promise<{ marketUrl: string; hasToken: boolean }> {
    const storedUrl = (await this.getSetting(MARKET_URL_KEY))?.trim() ?? '';
    const envUrl = this.config?.get('MARKET_URL')?.trim() ?? '';
    const storedLooksLocal = storedUrl.includes('localhost') || storedUrl.includes('127.0.0.1');
    const marketUrl = storedUrl
      ? storedLooksLocal && envUrl
        ? envUrl
        : storedUrl
      : envUrl || 'http://localhost:3100';
    const token = (await this.getSetting(MARKET_TOKEN_KEY))?.trim() ?? '';

    return {
      marketUrl,
      hasToken: token.length > 0
    };
  }

  public async setMarketConfig(url: string, token?: string): Promise<void> {
    await this.setSetting(MARKET_URL_KEY, url.trim());
    if (token !== undefined) {
      await this.setSetting(MARKET_TOKEN_KEY, token.trim());
    }
  }

  public async testMarketConnection(): Promise<{
    ok: boolean;
    latencyMs: number;
    packageCount?: number;
  }> {
    const { marketUrl } = await this.getMarketConfig();
    const token = (await this.getSetting(MARKET_TOKEN_KEY))?.trim();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const startMs = Date.now();
    try {
      const response = await fetch(new URL('/packages', marketUrl).toString(), {
        headers,
        signal: AbortSignal.timeout(10_000)
      });
      const latencyMs = Date.now() - startMs;

      if (!response.ok) {
        return { ok: false, latencyMs };
      }

      const body = (await response.json()) as {
        data?: {
          total?: number;
          items?: unknown[];
        };
      };

      if (typeof body.data?.total === 'number') {
        return { ok: true, latencyMs, packageCount: body.data.total };
      }

      if (Array.isArray(body.data?.items)) {
        return { ok: true, latencyMs, packageCount: body.data.items.length };
      }

      return { ok: true, latencyMs };
    } catch {
      return { ok: false, latencyMs: Date.now() - startMs };
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private resolveExpiry(expiresIn?: string): string {
    const fallbackDays = 90;
    const normalized = expiresIn ?? `${fallbackDays}d`;
    const match = /^(\d+)([dh])$/.exec(normalized);

    if (!match) {
      return new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000).toISOString();
    }

    const value = Number(match[1]);
    const unit = match[2];
    const durationMs = unit === 'h' ? value * 60 * 60 * 1000 : value * 24 * 60 * 60 * 1000;

    return new Date(Date.now() + durationMs).toISOString();
  }
}
