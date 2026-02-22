<template>
  <div class="dashboard-view">
    <div class="dash-header">
      <h2 class="dash-title">系统概览</h2>
      <div class="dash-status">
        <span class="status-dot" />
        <span>MCP Runtime: 运行中</span>
        <span class="status-sep">|</span>
        <span>版本: v{{ appVersion }}</span>
        <span class="status-sep">|</span>
        <span>运行时间: {{ uptimeLabel }}</span>
      </div>
    </div>

    <a-row :gutter="[16, 16]" class="metrics-row">
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :bordered="false" :loading="loading">
          <div class="metric-value">{{ summary?.totalPackages ?? 0 }}</div>
          <div class="metric-label">已发布工具</div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :bordered="false" :loading="loading">
          <div class="metric-value metric-value--green">{{ successRate }}</div>
          <div class="metric-label">成功率</div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :bordered="false" :loading="loading">
          <div class="metric-value">{{ summary?.totalCallsLast24h ?? 0 }}</div>
          <div class="metric-label">今日请求</div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :bordered="false" :loading="loading">
          <div class="metric-value metric-value--blue">{{ avgLatencyMs }}ms</div>
          <div class="metric-label">平均耗时</div>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :lg="12">
        <a-card title="24h 调用量趋势" :bordered="false" :loading="loading">
          <div v-if="trendBars.length > 0" class="trend-chart">
            <div v-for="bar in trendBars" :key="bar.hour" class="trend-col">
              <div class="trend-bar-wrap">
                <div class="trend-bar" :style="{ height: `${bar.heightPercent}%` }">
                  <span v-if="bar.count > 0" class="trend-tip">{{ bar.count }}</span>
                </div>
              </div>
              <span class="trend-label">{{ bar.label }}</span>
            </div>
          </div>
          <a-empty v-else description="暂无数据" />
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="12">
        <a-card title="Top 5 热门工具" :bordered="false" :loading="loading">
          <div class="top-tools">
            <div v-for="(tool, index) in topFiveTools" :key="tool.toolName" class="top-tool-row">
              <span class="tool-rank" :class="`tool-rank--${index + 1}`">{{ index + 1 }}</span>
              <div class="tool-info">
                <div class="tool-name">{{ tool.toolName }}</div>
                <div class="tool-server">{{ tool.serverName }}</div>
              </div>
              <span class="tool-count">{{ tool.callCount }}</span>
            </div>
            <a-empty v-if="topFiveTools.length === 0" description="暂无数据" />
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
  import type { ApiResponse, DashboardSummary, ToolCallStat } from '@sga/shared';
  import dayjs from 'dayjs';
  import { computed, onMounted, ref } from 'vue';
  import http from '@/utils/http';

  const loading = ref(false);
  const summary = ref<DashboardSummary | null>(null);
  const appVersion = ref('--');

  const avgLatencyMs = computed(() => summary.value?.avgLatencyMs ?? 0);

  const successRate = computed(() => {
    const rate = summary.value?.successRate;
    return rate != null ? `${rate.toFixed(1)}%` : '--';
  });

  const uptimeLabel = computed(() => {
    const s = summary.value?.uptimeSeconds ?? 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  });

  const topFiveTools = computed<ToolCallStat[]>(() => (summary.value?.topTools ?? []).slice(0, 5));

  const trendBars = computed(() => {
    const points = summary.value?.hourlyTrend ?? [];
    const max = Math.max(1, ...points.map((p) => p.count));
    return points.map((p) => ({
      hour: p.hour,
      label: dayjs(p.hour).format('HH'),
      count: p.count,
      heightPercent: Math.max(4, Math.round((p.count / max) * 100))
    }));
  });

  const fetchDashboard = async (): Promise<void> => {
    loading.value = true;
    try {
      const res = (await http.get<ApiResponse<DashboardSummary>>(
        '/monitor/dashboard'
      )) as unknown as ApiResponse<DashboardSummary>;
      summary.value = res.data;
    } finally {
      loading.value = false;
    }
  };

  const fetchSystemInfo = async (): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<{ appVersion: string }>>(
        '/admin/system-info'
      )) as unknown as ApiResponse<{ appVersion: string }>;
      appVersion.value = res.data.appVersion;
    } catch {
      appVersion.value = '--';
    }
  };

  onMounted(() => {
    void fetchDashboard();
    void fetchSystemInfo();
  });
</script>

<style scoped lang="less">
  @blue: #2563eb;
  @green: #16a34a;
  @text-primary: #0f172a;
  @text-secondary: #64748b;
  @card-radius: 12px;

  .dashboard-view {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .dash-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 4px;
  }

  .dash-title {
    font-size: 20px;
    font-weight: 700;
    color: @text-primary;
    margin: 0;
  }

  .dash-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: @text-secondary;
    background: #f8fafc;
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: @green;
    box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25);
  }

  .status-sep {
    color: #e2e8f0;
    font-size: 14px;
  }

  .metrics-row :deep(.ant-card) {
    border-radius: @card-radius;
  }

  .metric-value {
    font-size: 32px;
    font-weight: 800;
    color: @text-primary;
    line-height: 1.1;

    &--green {
      color: @green;
    }

    &--blue {
      color: @blue;
    }
  }

  .metric-label {
    margin-top: 4px;
    font-size: 13px;
    color: @text-secondary;
  }

  .trend-chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 160px;
    padding-bottom: 24px;
  }

  .trend-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    justify-content: flex-end;
  }

  .trend-bar-wrap {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .trend-bar {
    width: 100%;
    background: @blue;
    border-radius: 3px 3px 0 0;
    min-height: 3px;
    position: relative;

    &:hover .trend-tip {
      opacity: 1;
    }
  }

  .trend-tip {
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    background: @text-primary;
    color: #fff;
    padding: 1px 5px;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
    white-space: nowrap;
  }

  .trend-label {
    font-size: 10px;
    color: @text-secondary;
    width: 100%;
    text-align: center;
    line-height: 1;
  }

  .top-tools {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .top-tool-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tool-rank {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    color: #fff;
    flex-shrink: 0;

    &--1 {
      background: #ef4444;
    }
    &--2 {
      background: #f59e0b;
    }
    &--3 {
      background: @blue;
    }
    &--4 {
      background: #8b5cf6;
    }
    &--5 {
      background: #64748b;
    }
  }

  .tool-info {
    flex: 1;
    min-width: 0;
  }

  .tool-name {
    font-size: 13px;
    font-weight: 600;
    color: @text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tool-server {
    font-size: 11px;
    color: @text-secondary;
  }

  .tool-count {
    font-size: 14px;
    font-weight: 700;
    color: @blue;
    flex-shrink: 0;
  }
</style>
