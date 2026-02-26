import type { PaginatedList } from '@sga/shared';
import { Injectable } from '@nestjs/common';
import { RuntimeService } from '../runtime/runtime.service';

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  resource: string;
  createdAt: string;
}

export interface SystemMetricsSnapshot {
  uptime: number;
  memUsed: number;
  activeRequests: number;
  totalPackages: number;
  totalServers: number;
}

interface ToolCallRecord {
  serverId: string;
  serverName: string;
  toolName: string;
  calledAt: Date;
  durationMs?: number;
}

export interface ToolCallStat {
  toolName: string;
  serverId: string;
  serverName: string;
  callCount: number;
  lastCalledAt: string;
}

export interface HourlyCount {
  hour: string;
  count: number;
}

export interface DashboardSummary {
  topTools: ToolCallStat[];
  totalCallsLast24h: number;
  successRate: number;
  avgLatencyMs: number;
  downstreamCount: number;
  hourlyTrend: HourlyCount[];
  activeServers: number;
  totalPackages: number;
  uptimeSeconds: number;
  memUsedMb: number;
}

@Injectable()
export class MonitorService {
  public constructor(private readonly runtimeService: RuntimeService) {}

  private readonly auditLogs: AuditLog[] = [];
  private readonly toolCalls: ToolCallRecord[] = [];
  private readonly downstreamSessions = new Map<
    string,
    {
      connectedAt: Date;
      userAgent?: string;
    }
  >();

  public async getMetrics(): Promise<SystemMetricsSnapshot> {
    const memoryUsage = process.memoryUsage();
    const servers = await this.runtimeService.listServers().catch(() => []);
    const totalServers = servers.length;

    return {
      uptime: Math.floor(process.uptime()),
      memUsed: memoryUsage.heapUsed,
      activeRequests: 0,
      totalPackages: totalServers,
      totalServers
    };
  }

  public getAuditLogs(page = 1, pageSize = 20): PaginatedList<AuditLog> {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 20;
    const start = (safePage - 1) * safePageSize;

    return {
      items: this.auditLogs.slice(start, start + safePageSize),
      total: this.auditLogs.length,
      page: safePage,
      pageSize: safePageSize
    };
  }

  public recordAuditLog(action: string, userId: string, resource: string): void {
    this.auditLogs.push({
      id: `audit-${Date.now()}`,
      action,
      userId,
      resource,
      createdAt: new Date().toISOString()
    });
  }

  public recordDownstreamSessionConnected(sessionId: string, userAgent?: string): void {
    this.downstreamSessions.set(sessionId, {
      connectedAt: new Date(),
      userAgent
    });
  }

  public recordDownstreamSessionDisconnected(sessionId: string): void {
    this.downstreamSessions.delete(sessionId);
  }

  public getDownstreamSessions(): {
    count: number;
    sessions: Array<{ sessionId: string; connectedAt: string; userAgent?: string }>;
  } {
    const sessions = Array.from(this.downstreamSessions.entries())
      .map(([sessionId, info]) => ({
        sessionId,
        connectedAt: info.connectedAt.toISOString(),
        ...(info.userAgent ? { userAgent: info.userAgent } : {})
      }))
      .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt));

    return {
      count: sessions.length,
      sessions
    };
  }

  public recordToolCall(
    serverId: string,
    serverName: string,
    toolName: string,
    durationMs?: number
  ): void {
    this.toolCalls.push({
      serverId,
      serverName,
      toolName,
      calledAt: new Date(),
      durationMs
    });
  }

  public getToolStats(): ToolCallStat[] {
    const grouped = new Map<
      string,
      {
        toolName: string;
        serverId: string;
        serverName: string;
        callCount: number;
        lastCalledAtMs: number;
      }
    >();

    for (const call of this.toolCalls) {
      const existing = grouped.get(call.toolName);
      const calledAtMs = call.calledAt.getTime();

      if (!existing) {
        grouped.set(call.toolName, {
          toolName: call.toolName,
          serverId: call.serverId,
          serverName: call.serverName,
          callCount: 1,
          lastCalledAtMs: calledAtMs
        });
        continue;
      }

      existing.callCount += 1;
      if (calledAtMs > existing.lastCalledAtMs) {
        existing.lastCalledAtMs = calledAtMs;
        existing.serverId = call.serverId;
        existing.serverName = call.serverName;
      }
    }

    return Array.from(grouped.values())
      .sort((left, right) => {
        if (right.callCount === left.callCount) {
          return right.lastCalledAtMs - left.lastCalledAtMs;
        }
        return right.callCount - left.callCount;
      })
      .slice(0, 10)
      .map((entry) => ({
        toolName: entry.toolName,
        serverId: entry.serverId,
        serverName: entry.serverName,
        callCount: entry.callCount,
        lastCalledAt: new Date(entry.lastCalledAtMs).toISOString()
      }));
  }

  public async getDashboardSummary(): Promise<DashboardSummary> {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const since = now - oneDayMs;
    const callsLast24h = this.toolCalls.filter((call) => call.calledAt.getTime() >= since);

    const bucketCounts = new Map<string, number>();
    for (const call of callsLast24h) {
      const hourKey = this.toHourKey(call.calledAt);
      bucketCounts.set(hourKey, (bucketCounts.get(hourKey) ?? 0) + 1);
    }

    const hourlyTrend: HourlyCount[] = [];
    for (let offset = 23; offset >= 0; offset -= 1) {
      const bucketDate = new Date(now - offset * 60 * 60 * 1000);
      bucketDate.setUTCMinutes(0, 0, 0);
      const hourKey = this.toHourKey(bucketDate);
      hourlyTrend.push({
        hour: hourKey,
        count: bucketCounts.get(hourKey) ?? 0
      });
    }

    const callsWithDuration = callsLast24h.filter((call) => typeof call.durationMs === 'number');
    const successRate =
      callsLast24h.length === 0
        ? 0
        : Math.round((callsWithDuration.length / callsLast24h.length) * 10000) / 100;
    const avgLatencyMs =
      callsWithDuration.length === 0
        ? 0
        : Math.round(
            callsWithDuration.reduce((sum, call) => sum + (call.durationMs ?? 0), 0) /
              callsWithDuration.length
          );

    const metrics = await this.getMetrics();
    const servers = await this.runtimeService.listServers().catch(() => []);
    let readyServers = 0;
    for (const server of servers) {
      try {
        const detail = await this.runtimeService.getServer(server.id);
        if (detail.credentialsConfigured) {
          readyServers++;
        }
      } catch {
        // skip broken server
      }
    }
    const activeServers = readyServers;

    return {
      topTools: this.getToolStats(),
      totalCallsLast24h: callsLast24h.length,
      successRate,
      avgLatencyMs,
      downstreamCount: this.downstreamSessions.size,
      hourlyTrend,
      activeServers,
      totalPackages: metrics.totalPackages,
      uptimeSeconds: metrics.uptime,
      memUsedMb: Math.round(metrics.memUsed / (1024 * 1024))
    };
  }

  private toHourKey(input: Date): string {
    return `${input.toISOString().slice(0, 13)}:00`;
  }
}
