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

    <a-card :bordered="false" class="hub-card">
      <div class="hub-layout">
        <div class="hub-side">
          <div class="hub-side-header">
            上游业务系统
            <span class="hub-badge">{{ upstreamSystems.length }}</span>
          </div>
          <div class="hub-list">
            <div
              v-for="sys in upstreamSystems"
              :key="sys.id"
              class="hub-item"
              :class="{ 'hub-item--active': sys.configured }"
            >
              <div class="hub-item-icon">
                <img v-if="sys.logo" :src="normalizeImage(sys.logo)" class="sys-logo" />
                <span v-else>🔌</span>
              </div>
              <div class="hub-item-info">
                <div class="hub-item-name">{{ sys.name }}</div>
                <div class="hub-item-meta">
                  <a-badge
                    :status="sys.configured ? 'success' : 'warning'"
                    :text="sys.configured ? '就绪' : '待配置'"
                  />
                </div>
              </div>
            </div>
            <div v-if="upstreamSystems.length === 0" class="hub-empty">暂无接入</div>
          </div>
        </div>

        <div class="hub-connector">
          <div class="hub-line" />
          <div class="hub-arrow-head">▶</div>
        </div>

        <div class="hub-center">
          <div class="hub-ring hub-ring--outer">
            <div class="hub-ring hub-ring--middle">
              <div class="hub-core">
                <span class="hub-core-icon">🦀</span>
                <span class="hub-core-label">Runtime</span>
              </div>
            </div>
          </div>
          <div class="hub-shards">
            <span class="hub-shards-num">{{ summary?.activeServers ?? 0 }}</span>
            <span class="hub-shards-label">SERVERS</span>
          </div>
          <div class="hub-center-title">MCP HUB（本机）</div>
        </div>

        <div class="hub-connector">
          <div class="hub-arrow-head">▶</div>
          <div class="hub-line" />
        </div>

        <div class="hub-side">
          <div class="hub-side-header">
            下游 AGENT
            <span class="hub-badge">{{ downstreamAgents.length }}</span>
          </div>
          <div class="hub-list">
            <div
              v-for="agent in downstreamAgents"
              :key="agent.id"
              class="hub-item hub-item--agent"
            >
              <span class="hub-item-icon">{{ agent.icon }}</span>
              <div class="hub-item-info">
                <div class="hub-item-name">{{ agent.name }}</div>
                <div class="hub-item-meta">{{ agent.sub }}</div>
              </div>
              <span class="hub-item-time">{{ agent.lastSeen }}</span>
            </div>
            <div v-if="downstreamAgents.length === 0" class="hub-empty">暂无连接</div>
          </div>
        </div>
      </div>
    </a-card>

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

  interface UpstreamSystem {
    id: string;
    name: string;
    env: string;
    auth: string;
    icon: string;
    online: boolean;
  }

  interface DownstreamAgent {
    id: string;
    name: string;
    sub: string;
    icon: string;
    lastSeen: string;
  }

  interface RuntimeServer {
    id: string;
    name: string;
    version: string;
    description: string;
    credentialsConfigured: boolean;
    cardImageBase64?: string | null;
    logoBase64?: string | null;
  }

  const loading = ref(false);
  const summary = ref<DashboardSummary | null>(null);
  const appVersion = ref('--');
  const installedServers = ref<RuntimeServer[]>([]);

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

  const upstreamSystems = computed(() =>
    installedServers.value.map((s) => ({
      id: s.id,
      name: s.name,
      logo: s.logoBase64 || s.cardImageBase64,
      configured: s.credentialsConfigured
    }))
  );

  const downstreamAgents = ref<DownstreamAgent[]>([]);

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

  const fetchRuntimeServers = async (): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<RuntimeServer[]>>(
        '/runtime/servers'
      )) as unknown as ApiResponse<RuntimeServer[]>;
      installedServers.value = res.data;
    } catch {
      installedServers.value = [];
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

  const normalizeImage = (value: string): string =>
    value.startsWith('data:') ? value : `data:image/png;base64,${value}`;

  onMounted(() => {
    void fetchDashboard();
    void fetchSystemInfo();
    void fetchRuntimeServers();
  });
</script>

<style scoped lang="less">
  @blue: #2563eb;
  @blue-light: #eff6ff;
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
    animation: pulse 2s infinite;
  }

  .status-sep {
    color: #e2e8f0;
    font-size: 14px;
  }

  .hub-card {
    border-radius: @card-radius !important;

    :deep(.ant-card-body) {
      padding: 20px 24px;
    }
  }

  .hub-layout {
    display: flex;
    align-items: center;
    min-height: 240px;
    gap: 0;
  }

  .hub-side {
    flex: 1;
    min-width: 0;
  }

  .hub-side-header {
    font-size: 13px;
    font-weight: 600;
    color: @text-secondary;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hub-badge {
    background: @blue;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 10px;
  }

  .hub-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hub-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #fafafa;
    transition: border-color 0.2s;

    &--active {
      border-color: #bfdbfe;
      background: @blue-light;
    }

    &--agent {
      background: #f9fafb;
    }
  }

  .hub-item-icon {
    font-size: 18px;
    line-height: 1;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;

    .sys-logo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 4px;
    }
  }

  .hub-item-info {
    flex: 1;
    min-width: 0;
  }

  .hub-item-name {
    font-size: 13px;
    font-weight: 600;
    color: @text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hub-item-meta {
    font-size: 11px;
    color: @text-secondary;
    margin-top: 1px;
  }

  .hub-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    &--green {
      background: @green;
    }

    &--gray {
      background: #cbd5e1;
    }
  }

  .hub-item-time {
    font-size: 11px;
    color: @text-secondary;
    white-space: nowrap;
  }

  .hub-empty {
    font-size: 12px;
    color: @text-secondary;
    text-align: center;
    padding: 12px 0;
    font-style: italic;
  }

  .hub-connector {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 8px;
  }

  .hub-line {
    width: 40px;
    height: 2px;
    background: repeating-linear-gradient(
      90deg,
      @blue 0px,
      @blue 6px,
      transparent 6px,
      transparent 12px
    );
  }

  .hub-arrow-head {
    color: @blue;
    font-size: 12px;
    line-height: 1;
  }

  .hub-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    padding: 0 8px;
  }

  .hub-ring {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;

    &--outer {
      width: 120px;
      height: 120px;
      border: 2px dashed #bfdbfe;
      background: transparent;
      animation: spin 12s linear infinite;
    }

    &--middle {
      width: 92px;
      height: 92px;
      border: 2px solid @blue;
      background: @blue-light;
      animation: breathe 3s ease-in-out infinite;
    }
  }

  .hub-core {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: #1e3a5f;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .hub-core-icon {
    font-size: 20px;
    line-height: 1;
  }

  .hub-core-label {
    font-size: 10px;
    font-weight: 700;
    color: #93c5fd;
    letter-spacing: 0.5px;
  }

  .hub-shards {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
  }

  .hub-shards-num {
    font-size: 22px;
    font-weight: 800;
    color: @blue;
  }

  .hub-shards-label {
    font-size: 10px;
    font-weight: 600;
    color: @text-secondary;
    letter-spacing: 1px;
  }

  .hub-center-title {
    font-size: 12px;
    font-weight: 600;
    color: @text-secondary;
    white-space: nowrap;
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

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25);
    }

    50% {
      box-shadow: 0 0 0 5px rgba(22, 163, 74, 0.08);
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes breathe {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.04);
    }
  }
</style>
