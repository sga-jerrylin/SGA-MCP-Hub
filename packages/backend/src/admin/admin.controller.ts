import type {
  ApiKey,
  ApiResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  CreateTenantRequest,
  Tenant
} from '@sga/shared';
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AdminService } from './admin.service';

interface UpdateMarketConfigRequest {
  marketUrl: string;
  marketToken?: string;
}

@Controller('admin')
export class AdminController {
  public constructor(private readonly adminService: AdminService) {}

  @Get('tenants')
  public listTenants(): ApiResponse<Tenant[]> {
    return {
      code: 0,
      message: 'ok',
      data: this.adminService.listTenants()
    };
  }

  @Post('tenants')
  public createTenant(@Body() req: CreateTenantRequest): ApiResponse<Tenant> {
    return {
      code: 0,
      message: 'ok',
      data: this.adminService.createTenant(req)
    };
  }

  @Get('tenants/:tenantId/keys')
  public listKeys(@Param('tenantId') tenantId: string): ApiResponse<ApiKey[]> {
    return {
      code: 0,
      message: 'ok',
      data: this.adminService.listKeys(tenantId)
    };
  }

  @Post('tenants/:tenantId/keys')
  public createKey(
    @Param('tenantId') tenantId: string,
    @Body() req: CreateApiKeyRequest
  ): ApiResponse<CreateApiKeyResponse> {
    return {
      code: 0,
      message: 'ok',
      data: this.adminService.createKey(tenantId, req)
    };
  }

  @Delete('tenants/:tenantId/keys/:keyId')
  public revokeKey(
    @Param('tenantId') tenantId: string,
    @Param('keyId') keyId: string
  ): ApiResponse<{ revoked: boolean }> {
    this.adminService.revokeKey(tenantId, keyId);
    return {
      code: 0,
      message: 'ok',
      data: { revoked: true }
    };
  }

  @Get('system-info')
  public getSystemInfo(): ApiResponse<{ appVersion: string; uptimeSeconds: number }> {
    return {
      code: 0,
      message: 'ok',
      data: this.adminService.getSystemInfo()
    };
  }

  @Get('settings/market')
  public async getMarketConfig(): Promise<ApiResponse<{ marketUrl: string; hasToken: boolean }>> {
    return {
      code: 0,
      message: 'ok',
      data: await this.adminService.getMarketConfig()
    };
  }

  @Put('settings/market')
  public async setMarketConfig(
    @Body() req: UpdateMarketConfigRequest
  ): Promise<ApiResponse<{ saved: boolean }>> {
    await this.adminService.setMarketConfig(req.marketUrl, req.marketToken);
    return {
      code: 0,
      message: 'ok',
      data: { saved: true }
    };
  }

  @Post('settings/market/test')
  public async testMarketConnection(): Promise<
    ApiResponse<{ ok: boolean; latencyMs: number; packageCount?: number }>
  > {
    return {
      code: 0,
      message: 'ok',
      data: await this.adminService.testMarketConnection()
    };
  }
}