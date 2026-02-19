import type { ApiResponse } from '@sga/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query
} from '@nestjs/common';
import { AuthVaultService } from './auth-vault.service';

interface UpsertCredentialBody {
  tenantId: string;
  serverId: string;
  keyName: string;
  value: string;
}

interface DeleteCredentialBody {
  tenantId: string;
  serverId: string;
  keyName: string;
}

@Controller()
export class AuthVaultController {
  public constructor(private readonly vault: AuthVaultService) {}

  @Put('credentials')
  public async upsertCredential(
    @Body() body: UpsertCredentialBody
  ): Promise<ApiResponse<{ ok: boolean }>> {
    await this.vault.setCredential({
      tenantId: body.tenantId,
      serverId: body.serverId,
      keyName: body.keyName,
      plaintext: body.value,
      keyVersion: 1
    });

    return {
      code: 0,
      message: 'ok',
      data: { ok: true }
    };
  }

  @Get('credentials/:serverId')
  public async listCredentialKeys(
    @Param('serverId') serverId: string,
    @Query('tenantId') tenantId?: string
  ): Promise<ApiResponse<Array<{ keyName: string; updatedAt: Date }>>> {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return {
      code: 0,
      message: 'ok',
      data: await this.vault.listKeys(tenantId, serverId)
    };
  }

  @Delete('credentials')
  public async deleteCredential(
    @Body() body: DeleteCredentialBody
  ): Promise<ApiResponse<{ ok: boolean }>> {
    const ok = await this.vault.deleteCredential(body.tenantId, body.serverId, body.keyName);
    return {
      code: 0,
      message: 'ok',
      data: { ok }
    };
  }
}
