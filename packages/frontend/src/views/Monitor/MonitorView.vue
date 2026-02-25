<template>
  <div class="monitor-view">
    <a-card title="系统概览" :bordered="false" class="block">
      <a-skeleton v-if="loadingMetrics" active />
      <a-row v-else :gutter="16">
        <a-col :span="6">
          <a-statistic title="运行时长" :value="metrics.uptime" suffix="s" />
        </a-col>
        <a-col :span="6">
          <a-statistic
            title="内存使用"
            :value="Math.round(metrics.memUsed / 1024 / 1024)"
            suffix="MB"
          />
        </a-col>
        <a-col :span="6">
          <a-statistic title="活跃服务" :value="metrics.totalServers" />
        </a-col>
        <a-col :span="6">
          <a-statistic title="工具包总数" :value="metrics.totalPackages" />
        </a-col>
      </a-row>
    </a-card>

    <a-card title="工具调用统计" :bordered="false" class="block">
      <template #extra>
        <a-button :loading="loadingTools" @click="fetchToolStats">刷新</a-button>
      </template>
      <a-table
        row-key="toolName"
        size="small"
        :columns="toolColumns"
        :data-source="toolStats"
        :loading="loadingTools"
        :pagination="{ pageSize: 10 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'avgDurationMs'">
            {{ typeof (record as ToolCallStat).avgDurationMs === 'number' ? `${(record as ToolCallStat).avgDurationMs}ms` : '-' }}
          </template>
          <template v-else-if="column.key === 'lastCalledAt'">
            {{ formatDate((record as ToolCallStat).lastCalledAt) }}
          </template>
        </template>
      </a-table>
    </a-card>

    <a-card title="审计日志" :bordered="false" class="block">
      <a-table
        row-key="id"
        size="small"
        :columns="auditColumns"
        :data-source="auditLogs"
        :loading="loadingAudit"
        :pagination="{
          current: auditPage,
          pageSize: auditPageSize,
          total: auditTotal,
          showSizeChanger: true,
          onChange: onAuditPageChange,
          onShowSizeChange: onAuditPageChange
        }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            {{ formatDate((record as AuditLog).createdAt) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs';
  import { onMounted, ref } from 'vue';
  import type { ApiResponse, PaginatedList } from '@sga/shared';
  import http from '@/utils/http';

  interface SystemMetricsSnapshot {
    uptime: number;
    memUsed: number;
    activeRequests: number;
    totalPackages: number;
    totalServers: number;
  }

  interface ToolCallStat {
    toolName: string;
    serverId: string;
    serverName: string;
    callCount: number;
    avgDurationMs?: number;
    lastCalledAt: string;
  }

  interface AuditLog {
    id: string;
    action: string;
    userId: string;
    resource: string;
    createdAt: string;
  }

  const metrics = ref<SystemMetricsSnapshot>({
    uptime: 0,
    memUsed: 0,
    activeRequests: 0,
    totalPackages: 0,
    totalServers: 0
  });
  const loadingMetrics = ref(false);

  const toolStats = ref<ToolCallStat[]>([]);
  const loadingTools = ref(false);

  const auditLogs = ref<AuditLog[]>([]);
  const loadingAudit = ref(false);
  const auditPage = ref(1);
  const auditPageSize = ref(20);
  const auditTotal = ref(0);

  const toolColumns = [
    { title: '服务名', dataIndex: 'serverName', key: 'serverName' },
    { title: '工具名', dataIndex: 'toolName', key: 'toolName' },
    { title: '调用次数', dataIndex: 'callCount', key: 'callCount', width: 120 },
    { title: '平均耗时', key: 'avgDurationMs', width: 120 },
    { title: '最后调用时间', dataIndex: 'lastCalledAt', key: 'lastCalledAt', width: 200 }
  ];

  const auditColumns = [
    { title: '操作', dataIndex: 'action', key: 'action', width: 180 },
    { title: '用户', dataIndex: 'userId', key: 'userId', width: 180 },
    { title: '资源', dataIndex: 'resource', key: 'resource' },
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 200 }
  ];

  const fetchMetrics = async (): Promise<void> => {
    loadingMetrics.value = true;
    try {
      const res = (await http.get<ApiResponse<SystemMetricsSnapshot>>(
        '/monitor/metrics'
      )) as unknown as ApiResponse<SystemMetricsSnapshot>;
      metrics.value = res.data;
    } finally {
      loadingMetrics.value = false;
    }
  };

  const fetchToolStats = async (): Promise<void> => {
    loadingTools.value = true;
    try {
      const res = (await http.get<ApiResponse<ToolCallStat[]>>(
        '/monitor/tool-stats'
      )) as unknown as ApiResponse<ToolCallStat[]>;
      toolStats.value = res.data;
    } finally {
      loadingTools.value = false;
    }
  };

  const fetchAuditLogs = async (): Promise<void> => {
    loadingAudit.value = true;
    try {
      const res = (await http.get<ApiResponse<PaginatedList<AuditLog>>>('/monitor/audit-logs', {
        params: {
          page: auditPage.value,
          pageSize: auditPageSize.value
        }
      })) as unknown as ApiResponse<PaginatedList<AuditLog>>;

      auditLogs.value = res.data.items;
      auditTotal.value = res.data.total;
    } finally {
      loadingAudit.value = false;
    }
  };

  const onAuditPageChange = (page: number, pageSize: number): void => {
    auditPage.value = page;
    auditPageSize.value = pageSize;
    void fetchAuditLogs();
  };

  const formatDate = (value: string): string => dayjs(value).format('YYYY-MM-DD HH:mm:ss');

  onMounted(() => {
    void fetchMetrics();
    void fetchToolStats();
    void fetchAuditLogs();
  });
</script>

<style scoped lang="less">
  .monitor-view {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .block {
    :deep(.ant-card-body) {
      padding-top: 16px;
    }
  }
</style>
