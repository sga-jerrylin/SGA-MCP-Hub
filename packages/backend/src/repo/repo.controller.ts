import type { ApiResponse, Package, PaginatedList } from '@sga/shared';
import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { RepoService } from './repo.service';
import { AppConfigService } from '../config/config.service';
import { RuntimeService } from '../runtime/runtime.service';

interface InstallConfig {
  packageId: string;
  packageName: string;
  hubSseUrl: string;
  configs: {
    claudeCode: string;
    cursor: Record<string, unknown>;
    openClaw: string;
    genericSse: string;
  };
}

interface ToolsCatalogPackage {
  packageId: string;
  packageName: string;
  tools: Array<{
    toolName: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

@Controller('repo')
export class RepoController {
  public constructor(
    private readonly repoService: RepoService,
    private readonly config: AppConfigService,
    private readonly runtimeService: RuntimeService
  ) {}

  @Get('packages')
  public async listPackages(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ): Promise<ApiResponse<PaginatedList<Package>>> {
    const parsedPage = Number(page ?? '1');
    const parsedPageSize = Number(pageSize ?? '20');

    return {
      code: 0,
      message: 'ok',
      data: await this.repoService.listPackages(parsedPage, parsedPageSize)
    };
  }

  @Get('packages/:id')
  public async getPackage(@Param('id') id: string): Promise<ApiResponse<Package>> {
    return {
      code: 0,
      message: 'ok',
      data: await this.repoService.getPackage(id)
    };
  }

  @Get('tools/catalog')
  public async getToolsCatalog(): Promise<
    ApiResponse<{
      totalTools: number;
      packages: ToolsCatalogPackage[];
    }>
  > {
    const packageList = await this.repoService.listPackages(1, 1000);

    const packages = await Promise.all(
      packageList.items.map(async (pkg) => {
        const detail = await this.runtimeService.getServer(pkg.id).catch(() => null);
        const tools = (detail?.tools ?? []).map((tool) => ({
          toolName: tool.name,
          ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
          ...(tool.inputSchema && typeof tool.inputSchema === 'object'
            ? { inputSchema: tool.inputSchema }
            : {})
        }));

        return {
          packageId: pkg.id,
          packageName: pkg.name,
          tools
        };
      })
    );

    const totalTools = packages.reduce((sum, pkg) => sum + pkg.tools.length, 0);

    return {
      code: 0,
      message: 'ok',
      data: {
        totalTools,
        packages
      }
    };
  }

  @Get('packages/:id/install-config')
  public async getInstallConfig(@Param('id') id: string): Promise<ApiResponse<InstallConfig>> {
    const pkg = await this.repoService.getPackage(id);
    const configured = this.config.get('HUB_PUBLIC_URL')?.trim();
    const hubSseUrl = configured
      ? configured.endsWith('/api/mcp')
        ? configured
        : `${configured.replace(/\/+$/, '')}/api/mcp`
      : 'http://localhost:8080/api/mcp';

    return {
      code: 0,
      message: 'ok',
      data: {
        packageId: pkg.id,
        packageName: pkg.name,
        hubSseUrl,
        configs: {
          claudeCode: `claude mcp add ${pkg.name} --transport sse ${hubSseUrl}`,
          cursor: {
            mcpServers: {
              [pkg.name]: {
                url: hubSseUrl,
                transport: 'sse'
              }
            }
          },
          openClaw: `mcp-claw connect ${hubSseUrl}`,
          genericSse: hubSseUrl
        }
      }
    };
  }

  @Post('packages/:id/install')
  public async installPackage(
    @Param('id') id: string
  ): Promise<ApiResponse<{ packageId: string; pullUrl: string; manifest: Package }>> {
    return {
      code: 0,
      message: 'ok',
      data: await this.repoService.installPackage(id)
    };
  }

  @Delete('packages/:id')
  public async uninstallPackage(
    @Param('id') id: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    await this.repoService.uninstallPackage(id);
    return {
      code: 0,
      message: 'ok',
      data: { deleted: true }
    };
  }
}

