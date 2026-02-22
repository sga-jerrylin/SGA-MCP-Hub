import type { ApiResponse, PaginatedList } from '@sga/shared';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuditLog, DashboardSummary, MonitorService, SystemMetricsSnapshot, ToolCallStat } from './monitor.service';

interface RecordToolCallRequest {
  serverId: string;
  serverName: string;
  toolName: string;
  durationMs?: number;
}

@Controller('monitor')
export class MonitorController {
  public constructor(private readonly monitorService: MonitorService) {}

  @Get('metrics')
  public async getMetrics(): Promise<ApiResponse<SystemMetricsSnapshot>> {
    return {
      code: 0,
      message: 'ok',
      data: await this.monitorService.getMetrics()
    };
  }

  @Get('audit-logs')
  public getAuditLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ): ApiResponse<PaginatedList<AuditLog>> {
    const parsedPage = Number(page ?? '1');
    const parsedPageSize = Number(pageSize ?? '20');

    return {
      code: 0,
      message: 'ok',
      data: this.monitorService.getAuditLogs(parsedPage, parsedPageSize)
    };
  }

  @Post('tool-calls')
  public recordToolCall(@Body() body: RecordToolCallRequest): ApiResponse<{ ok: boolean }> {
    this.monitorService.recordToolCall(
      body.serverId,
      body.serverName,
      body.toolName,
      body.durationMs
    );

    return {
      code: 0,
      message: 'ok',
      data: { ok: true }
    };
  }

  @Get('tool-stats')
  public getToolStats(): ApiResponse<ToolCallStat[]> {
    return {
      code: 0,
      message: 'ok',
      data: this.monitorService.getToolStats()
    };
  }

  @Get('dashboard')
  public async getDashboard(): Promise<ApiResponse<DashboardSummary>> {
    return {
      code: 0,
      message: 'ok',
      data: await this.monitorService.getDashboardSummary()
    };
  }
}
