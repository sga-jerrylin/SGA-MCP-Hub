<template>
  <div class="dashboard-view">
    <div class="dash-header">
      <h2 class="dash-title">系统状态</h2>
      <div class="dash-status-pill">
        <span class="status-indicator">
          <span class="status-indicator-dot" />
          Runtime Active
        </span>
        <span class="status-divider" />
        <span class="status-info">v{{ appVersion }}</span>
        <span class="status-divider" />
        <span class="status-info">{{ uptimeLabel }}</span>
      </div>
    </div>

    <a-card :bordered="false" class="glass-card topology-card">
      <div class="topology-layout">
        <!-- Upstream Section -->
        <div class="topo-column">
          <div class="topo-header">
            <span class="topo-label">UPSTREAM SYSTEMS</span>
            <a-badge :count="upstreamSystems.length" :number-style="{ backgroundColor: '#2563eb' }" />
          </div>
          <div
            class="topo-list"
            :class="{
              'topo-list--grid': upstreamSystems.length >= 4 && upstreamSystems.length <= 8,
              'topo-list--scroll': upstreamSystems.length > 8
            }"
          >
            <div
              v-for="sys in upstreamSystems"
              :key="sys.id"
              class="glass-item"
              :class="{ 'glass-item--active': sys.configured === true, 'glass-item--warning': sys.configured === false }"
            >
              <div class="glass-item-icon">
                <img v-if="sys.logo" :src="normalizeImage(sys.logo)" class="sys-logo" />
                <div v-else class="sys-avatar" :style="{ background: getGradient(sys.name) }">
                  {{ sys.name.charAt(0).toUpperCase() }}
                </div>
              </div>
              <div class="glass-item-content">
                <div class="item-name">{{ sys.name }}</div>
                <div class="item-meta">
                  <span class="tool-badge">{{ sys.toolCount }} Tools</span>
                  <span class="status-pill" :class="sys.configured === true ? 'pill--ready' : 'pill--pending'">
                    {{ sys.statusLabel }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="upstreamSystems.length === 0" class="topo-empty">No active upstreams</div>
          </div>
        </div>

        <!-- Connection Central Area -->
        <div class="topo-bridge">
          <div class="data-flow-line" :class="{ 'line--active': upstreamSystems.length > 0 }">
            <svg class="ecg-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
              <path class="ecg-path" d="M0,20 L35,20 L38,15 L42,25 L45,5 L50,35 L55,20 L100,20" />
            </svg>
          </div>
        </div>

        <!-- Central Core -->
        <div class="topo-center">
          <div class="core-node">
            <div class="orbital-ring ring--1" />
            <div class="orbital-ring ring--2" />
            <div class="orbital-ring ring--3" />
            <div class="node-content">
              <div class="node-icon">🦀</div>
              <div class="node-label">HUB</div>
            </div>
          </div>
          <div class="core-metrics">
            <div class="core-num">{{ summary?.activeServers ?? 0 }}</div>
            <div class="core-sub">ACTIVE SERVERS</div>
          </div>
        </div>

        <div class="topo-bridge">
          <div class="data-flow-line reverse" :class="{ 'line--active': downstreamAgents.length > 0 }">
            <svg class="ecg-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
              <path class="ecg-path" d="M0,20 L35,20 L38,15 L42,25 L45,5 L50,35 L55,20 L100,20" />
            </svg>
          </div>
        </div>

        <!-- Downstream Section -->
        <div class="topo-column">
          <div class="topo-header">
            <span class="topo-label">DOWNSTREAM AGENTS</span>
            <a-badge :count="downstreamAgents.length" :number-style="{ backgroundColor: '#8b5cf6' }" />
          </div>
          <div class="topo-list">
            <div
              v-for="agent in downstreamAgents"
              :key="agent.id"
              class="glass-item glass-item--agent"
            >
              <div class="glass-item-icon agent-icon">
                {{ agent.icon }}
              </div>
              <div class="glass-item-content">
                <div class="item-name">{{ agent.name }}</div>
                <div class="item-meta">
                  <span class="agent-sub">{{ agent.sub }}</span>
                  <span class="agent-time">{{ agent.lastSeen }}</span>
                </div>
              </div>
            </div>
            <div v-if="downstreamAgents.length === 0" class="topo-empty">Waiting for connections...</div>
          </div>
        </div>
      </div>
    </a-card>

    <!-- Metrics Section -->
    <a-row :gutter="[16, 16]" class="metrics-section">
      <a-col v-for="m in metrics" :key="m.label" :xs="24" :sm="12" :xl="6">
        <a-card :bordered="false" class="glass-card metric-card" :loading="loading">
          <div class="metric-top">
            <span class="metric-icon" :style="{ background: m.color + '15', color: m.color }">{{ m.icon }}</span>
            <span class="metric-trend" v-if="m.trend">{{ m.trend }}</span>
          </div>
          <div class="metric-body">
            <div class="metric-val" :style="{ color: m.color }">{{ m.value }}</div>
            <div class="metric-lab">{{ m.label }}</div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :lg="14">
        <a-card title="Request Performance (24h)" :bordered="false" class="glass-card chart-card" :loading="loading">
          <div v-if="trendBars.length > 0" class="modern-chart">
            <div v-for="bar in trendBars" :key="bar.hour" class="chart-col">
              <div class="bar-container">
                <div class="bar-fill" :style="{ height: `${bar.heightPercent}%` }">
                  <div class="bar-glow" />
                  <span class="bar-value">{{ bar.count }}</span>
                </div>
              </div>
              <span class="bar-label">{{ bar.label }}</span>
            </div>
          </div>
          <a-empty v-else description="No data available" />
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="10">
        <a-card title="Trending Tools" :bordered="false" class="glass-card trending-card" :loading="loading">
          <div class="trending-list">
            <div v-for="(tool, index) in topFiveTools" :key="tool.toolName" class="trending-row">
              <div class="trending-rank" :class="`rank--${index + 1}`">{{ index + 1 }}</div>
              <div class="trending-info">
                <div class="t-name">{{ tool.toolName }}</div>
                <div class="t-server">{{ tool.serverName }}</div>
              </div>
              <div class="trending-stat">
                <span class="t-count">{{ tool.callCount }}</span>
                <span class="t-unit">calls</span>
              </div>
            </div>
            <a-empty v-if="topFiveTools.length === 0" description="No activity found" />
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
  import type { ApiResponse, DashboardSummary, ToolCallStat } from '@sga/shared';
  import dayjs from 'dayjs';
  import relativeTime from 'dayjs/plugin/relativeTime';
  import { computed, onMounted, onUnmounted, ref } from 'vue';
  import http from '@/utils/http';

  dayjs.extend(relativeTime);

  interface McpSession {
    sessionId: string;
    connectedAt: string;
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
    status: string;
    toolCount: number;
    credentialsConfigured: boolean;
  }

  interface RepoPackage {
    id: string;
    name: string;
    logoBase64?: string | null;
    cardImageBase64?: string | null;
  }

  const loading = ref(false);
  const summary = ref<DashboardSummary | null>(null);
  const appVersion = ref('--');
  const installedServers = ref<RuntimeServer[]>([]);
  const repoPackages = ref<RepoPackage[]>([]);
  const downstreamAgents = ref<DownstreamAgent[]>([]);

  const topFiveTools = computed<ToolCallStat[]>(() => (summary.value?.topTools ?? []).slice(0, 5));

  const uptimeLabel = computed(() => {
    const s = summary.value?.uptimeSeconds ?? 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  });

  const successRate = computed(() => {
    const rate = summary.value?.successRate;
    return rate != null ? `${rate.toFixed(1)}%` : '--';
  });

  const trendBars = computed(() => {
    const points = summary.value?.hourlyTrend ?? [];
    const max = Math.max(1, ...points.map((p) => p.count));
    return points.map((p) => ({
      hour: p.hour,
      label: dayjs(p.hour).format('HH'),
      count: p.count,
      heightPercent: Math.max(8, Math.round((p.count / max) * 100))
    }));
  });

  const upstreamSystems = computed(() =>
    installedServers.value.map((s) => {
      const pkg = repoPackages.value.find((p) => p.id === s.id);
      const logo = pkg?.logoBase64;
      let statusLabel = 'Active';
      if (s.credentialsConfigured === true) statusLabel = 'Ready';
      else if (s.credentialsConfigured === false) statusLabel = 'Config Pending';
      return {
        id: s.id,
        name: s.name,
        logo: logo || null,
        toolCount: s.toolCount ?? 0,
        configured: s.credentialsConfigured,
        statusLabel
      };
    })
  );

  const metrics = computed(() => [
    { label: 'Deployed Tools', value: summary.value?.totalPackages ?? 0, icon: '🛠', color: '#2563eb', trend: '' },
    { label: 'Success Rate', value: successRate.value, icon: '📈', color: '#16a34a', trend: '' },
    { label: 'Daily Requests', value: summary.value?.totalCallsLast24h ?? 0, icon: '⚡', color: '#8b5cf6', trend: '' },
    { label: 'Avg Latency', value: `${summary.value?.avgLatencyMs ?? 0}ms`, icon: '⏱', color: '#ea580c', trend: '' }
  ]);

  const fetchDashboard = async (): Promise<void> => {
    loading.value = true;
    try {
      const res = (await http.get<ApiResponse<DashboardSummary>>('/monitor/dashboard')) as unknown as ApiResponse<DashboardSummary>;
      summary.value = res.data;
    } finally {
      loading.value = false;
    }
  };

  const fetchRuntimeServers = async (): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<RuntimeServer[]>>('/runtime/servers')) as unknown as ApiResponse<RuntimeServer[]>;
      installedServers.value = res.data;
    } catch {
      installedServers.value = [];
    }
  };

  const fetchRepoPackages = async (): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<{ items: RepoPackage[] } | RepoPackage[]>>(
        '/repo/packages'
      )) as unknown as ApiResponse<{ items: RepoPackage[] } | RepoPackage[]>;
      const raw = res.data;
      repoPackages.value = Array.isArray(raw) ? raw : (raw as { items: RepoPackage[] }).items ?? [];
    } catch {
      repoPackages.value = [];
    }
  };

  const fetchMcpSessions = async (): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<{ count: number; sessions: McpSession[] }>>(
        '/mcp/sessions'
      )) as unknown as ApiResponse<{ count: number; sessions: McpSession[] }>;
      
      downstreamAgents.value = res.data.sessions.map((s, idx) => ({
        id: s.sessionId,
        name: `Agent #${idx + 1}`,
        icon: '🤖',
        sub: s.sessionId.slice(0, 8),
        lastSeen: dayjs(s.connectedAt).fromNow()
      }));
    } catch {
      // Keep existing list on error
    }
  };

  const fetchSystemInfo = async (): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<{ appVersion: string }>>('/admin/system-info')) as unknown as ApiResponse<{ appVersion: string }>;
      appVersion.value = res.data.appVersion;
    } catch {
      appVersion.value = '--';
    }
  };

  const normalizeImage = (value: string): string =>
    value.startsWith('data:') ? value : `data:image/png;base64,${value}`;

  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #2af598 0%, #009efd 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
  ];

  const getGradient = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length]!;
  };

  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    void fetchDashboard();
    void fetchSystemInfo();
    void fetchRuntimeServers();
    void fetchRepoPackages();
    void fetchMcpSessions();

    pollingTimer = setInterval(() => {
      void fetchMcpSessions();
    }, 10000);
  });

  onUnmounted(() => {
    if (pollingTimer) clearInterval(pollingTimer);
  });
</script>

<style scoped lang="less">
  @blue: #2563eb;
  @purple: #8b5cf6;
  @green: #10b981;
  @orange: #f59e0b;
  @glass-bg: rgba(255, 255, 255, 0.7);
  @glass-border: rgba(226, 232, 240, 0.8);
  @text-main: #1e293b;
  @text-dim: #64748b;

  .dashboard-view {
    display: flex;
    flex-direction: column;
    gap: 20px;
    color: @text-main;
  }

  .dash-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .dash-title {
    font-size: 24px;
    font-weight: 800;
    margin: 0;
    background: linear-gradient(to right, @blue, @purple);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .dash-status-pill {
    background: #fff;
    padding: 6px 16px;
    border-radius: 30px;
    border: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    color: @green;
    font-weight: 600;
  }

  .status-indicator-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: @green;
    box-shadow: 0 0 10px @green;
    animation: status-pulse 2s infinite;
  }

  @keyframes status-pulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.2); }
    100% { opacity: 1; transform: scale(1); }
  }

  .status-divider {
    width: 1px;
    height: 14px;
    background: #e2e8f0;
  }

  .status-info {
    color: @text-dim;
  }

  /* Glassmorphism Styles */
  .glass-card {
    background: @glass-bg !important;
    backdrop-filter: blur(10px);
    border: 1px solid @glass-border !important;
    border-radius: 16px !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.04) !important;
  }

  /* Topology Visualization */
  .topology-card {
    padding: 24px;
    :deep(.ant-card-body) { padding: 0; }
  }

  .topology-layout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 320px;
  }

  .topo-column {
    flex: 1;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .topo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
  }

  .topo-label {
    font-size: 11px;
    font-weight: 800;
    color: @text-dim;
    letter-spacing: 1px;
  }

  .topo-list {
    display: flex;
    flex-direction: column;
    gap: 10px;

    &--grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    &--scroll {
      max-height: 240px;
      overflow-y: auto;
      padding-right: 6px;
      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    }
  }

  .glass-item {
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid #fff;
    border-radius: 12px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);

    &:hover {
      transform: translateY(-2px);
      background: #fff;
      box-shadow: 0 10px 15px rgba(0, 0, 0, 0.05);
      border-color: @blue;
    }

    &--active { border-left: 4px solid @green; }
    &--warning { border-left: 4px solid @orange; }
    &--agent { border-left: 4px solid @purple; }
  }

  .glass-item-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;

    .sys-logo { width: 100%; height: 100%; object-fit: cover; }
    .sys-avatar {
      width: 100%; height: 100%; display: flex; align-items: center;
      justify-content: center; color: #fff; font-weight: 800;
    }
  }

  .agent-icon {
    background: @purple;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: #fff;
  }

  .glass-item-content { flex: 1; min-width: 0; }

  .item-name {
    font-size: 13px; font-weight: 700; color: @text-main;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .item-meta {
    display: flex; align-items: center; gap: 8px; margin-top: 2px;
  }

  .tool-badge { font-size: 10px; color: @text-dim; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }

  .status-pill {
    font-size: 9px; font-weight: 800; text-transform: uppercase;
    &.pill--ready { color: @green; }
    &.pill--pending { color: @orange; }
  }

  .agent-sub { font-size: 10px; color: @text-dim; }
  .agent-time { font-size: 10px; color: #94a3b8; margin-left: auto; }

  .topo-bridge {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
  }

  .data-flow-line {
    width: 100%;
    height: 40px;
    position: relative;
    display: flex;
    align-items: center;

    .ecg-svg {
      width: 100%;
      height: 100%;
      opacity: 0.2;
      transition: opacity 0.5s;
    }

    .ecg-path {
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke: @blue;
      stroke-dasharray: 200;
      stroke-dashoffset: 200;
    }

    &.line--active {
      .ecg-svg { opacity: 1; }
      .ecg-path {
        animation: ecg-flow 3s infinite linear;
      }
    }

    &.reverse {
      .ecg-path { stroke: @purple; }
    }
  }

  @keyframes ecg-flow {
    0% { stroke-dashoffset: 200; }
    100% { stroke-dashoffset: -200; }
  }

  /* Core Node Style */
  .topo-center {
    display: flex; flex-direction: column; align-items: center; gap: 16px;
  }

  .core-node {
    width: 120px; height: 120px; position: relative;
    display: flex; align-items: center; justify-content: center;
  }

  .node-content {
    width: 76px; height: 76px; border-radius: 50%;
    background: #1e293b; color: #fff; z-index: 10;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    box-shadow: 0 0 40px rgba(37, 99, 235, 0.3);
  }

  .node-icon { font-size: 24px; line-height: 1; }
  .node-label { font-size: 10px; font-weight: 800; letter-spacing: 2px; margin-top: 2px; color: #93c5fd; }

  .orbital-ring {
    position: absolute; border-radius: 50%; border: 1px solid rgba(37, 99, 235, 0.2);
    &.ring--1 { width: 90px; height: 90px; animation: ring-spin 10s linear infinite; }
    &.ring--2 { width: 120px; height: 120px; border-style: dashed; animation: ring-spin-reverse 15s linear infinite; }
    &.ring--3 { width: 160px; height: 160px; border-color: rgba(37, 99, 235, 0.1); animation: ring-breathe 4s ease-in-out infinite; }
  }

  @keyframes ring-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes ring-spin-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
  @keyframes ring-breathe { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 0.8; } }

  .core-metrics { text-align: center; line-height: 1; }
  .core-num { font-size: 28px; font-weight: 900; color: @blue; }
  .core-sub { font-size: 10px; font-weight: 800; color: @text-dim; letter-spacing: 1px; }

  /* Metrics Cards */
  .metric-card {
    padding: 20px;
    .metric-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .metric-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
    .metric-val { font-size: 32px; font-weight: 800; line-height: 1; }
    .metric-lab { font-size: 13px; font-weight: 600; color: @text-dim; margin-top: 4px; }
  }

  /* Charts & Trending */
  .chart-col {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 180px;
    .bar-container { flex: 1; width: 60%; display: flex; align-items: flex-end; position: relative; }
    .bar-fill {
      width: 100%; background: linear-gradient(to top, @blue, @purple); border-radius: 4px 4px 0 0;
      position: relative; transition: height 1s ease-out;
      &:hover .bar-value { opacity: 1; }
    }
    .bar-glow { position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: #fff; filter: blur(4px); opacity: 0.5; }
    .bar-value { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: 800; opacity: 0; transition: 0.2s; }
    .bar-label { font-size: 10px; font-weight: 600; color: @text-dim; }
  }

  .modern-chart { display: flex; align-items: flex-end; gap: 4px; height: 180px; }

  .trending-list { display: flex; flex-direction: column; gap: 12px; }
  .trending-row {
    display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; background: rgba(255, 255, 255, 0.4);
    &:hover { background: #fff; }
  }
  .trending-rank {
    width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 900; color: #fff;
    &.rank--1 { background: #ef4444; }
    &.rank--2 { background: #f59e0b; }
    &.rank--3 { background: @blue; }
    &.rank--4, &.rank--5 { background: #64748b; }
  }
  .trending-info { flex: 1; min-width: 0; .t-name { font-size: 14px; font-weight: 700; } .t-server { font-size: 11px; color: @text-dim; } }
  .trending-stat { text-align: right; .t-count { font-size: 16px; font-weight: 800; color: @blue; display: block; } .t-unit { font-size: 10px; color: @text-dim; } }

  .topo-empty { text-align: center; color: @text-dim; font-size: 12px; font-style: italic; padding: 20px 0; }
</style>
