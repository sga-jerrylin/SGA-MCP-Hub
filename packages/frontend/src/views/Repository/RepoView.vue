<template>
  <div class="repo-view">
    <a-tabs v-model:activeKey="activeTab" size="large" class="repo-tabs">
      <!-- ── 本地仓库标签 ─────────────────────────── -->
      <a-tab-pane key="local" tab="本地仓库">
        <div class="search-section">
          <a-input-search
            v-model:value="localSearch"
            placeholder="搜索本地 MCP 服务包..."
            enter-button="搜索"
            size="large"
            @search="fetchLocalPackages"
          />
          <div class="categories">
            <a-tag
              v-for="cat in categories"
              :key="cat"
              :color="localCat === cat ? 'blue' : 'default'"
              class="cat-tag"
              @click="localCat = cat"
            >
              {{ cat }}
            </a-tag>
          </div>
        </div>

        <a-list
          :grid="{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }"
          :data-source="localPackages"
          :loading="localLoading"
          :pagination="localPagination"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-card hoverable class="package-card">
                <template #cover>
                  <div class="card-cover" :style="{ background: getGradient(item.name) }">
                    <span class="icon">{{ item.name.charAt(0).toUpperCase() }}</span>
                  </div>
                </template>
                <a-card-meta :title="item.name">
                  <template #description>
                    <div class="desc" :title="item.description">{{ item.description }}</div>
                    <div class="tags">
                      <a-tag size="small">{{ item.category }}</a-tag>
                      <span class="version">v{{ item.version }}</span>
                    </div>
                  </template>
                </a-card-meta>
                <template #actions>
                  <div class="downloads"><DownloadOutlined /> {{ item.downloads }}</div>
                  <a-button type="link" size="small" @click="showInstallConfig(item)">
                    接入配置
                  </a-button>
                </template>
              </a-card>
            </a-list-item>
          </template>
        </a-list>
      </a-tab-pane>

      <!-- ── Market 商店标签 ────────────────────────── -->
      <a-tab-pane key="market" tab="Market 商店">
        <div class="search-section">
          <a-input-search
            v-model:value="marketSearch"
            placeholder="搜索 Market 工具包..."
            enter-button="搜索"
            size="large"
            @search="fetchMarketPackages"
          />
          <div class="categories">
            <a-tag
              v-for="cat in categories"
              :key="cat"
              :color="marketCat === cat ? 'blue' : 'default'"
              class="cat-tag"
              @click="marketCat = cat"
            >
              {{ cat }}
            </a-tag>
          </div>
        </div>

        <a-list
          :grid="{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }"
          :data-source="marketPackages"
          :loading="marketLoading"
          :pagination="marketPagination"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-card hoverable class="package-card package-card--market">
                <template #cover>
                  <div
                    v-if="item.cardImageBase64"
                    class="card-cover card-cover--image"
                  >
                    <img :src="'data:image/png;base64,' + item.cardImageBase64" alt="cover" />
                  </div>
                  <div v-else class="card-cover" :style="{ background: getGradient(item.name) }">
                    <img
                      v-if="item.logoBase64"
                      :src="'data:image/png;base64,' + item.logoBase64"
                      alt="logo"
                      class="logo-img"
                    />
                    <span v-else class="icon">{{ item.name.charAt(0).toUpperCase() }}</span>
                  </div>
                </template>
                <a-card-meta :title="item.name">
                  <template #description>
                    <div class="desc" :title="item.enhancedDescription || item.description">
                      {{ item.enhancedDescription || item.description }}
                    </div>
                    <div class="tags">
                      <a-tag size="small" :color="item.autoCategory ? 'purple' : undefined">
                        {{ item.autoCategory || item.category }}
                      </a-tag>
                      <span class="tool-count" v-if="item.toolsCount">
                        {{ item.toolsCount }} tools
                      </span>
                      <span class="version">{{ item.downloads }} downloads</span>
                    </div>
                  </template>
                </a-card-meta>
                <template #actions>
                  <a-badge v-if="item.installedInHub" status="success" text="已安装" />
                  <a-button
                    v-else
                    type="link"
                    :loading="installingId === item.id"
                    @click="handleInstallFromMarket(item)"
                  >
                    安装到 Hub
                  </a-button>
                </template>
              </a-card>
            </a-list-item>
          </template>
        </a-list>

        <a-empty
          v-if="!marketLoading && marketPackages.length === 0"
          description="暂无 Market 工具包，请在「系统管理 → Market 连接」中配置 Market 地址"
        />
      </a-tab-pane>
    </a-tabs>

    <!-- ── 接入配置弹窗 ──────────────────────────── -->
    <a-modal
      v-model:open="configModalVisible"
      title="接入配置"
      :footer="null"
      width="640px"
    >
      <div v-if="installConfig">
        <p class="config-desc">
          选择您的客户端，复制以下命令即可接入 <strong>{{ installConfig.packageName }}</strong>
        </p>
        <a-tabs v-model:activeKey="configTab" size="small">
          <a-tab-pane key="claude" tab="Claude Code">
            <div class="config-block">
              <pre>{{ installConfig.configs.claudeCode }}</pre>
              <a-button size="small" @click="copyText(installConfig!.configs.claudeCode)">
                复制
              </a-button>
            </div>
          </a-tab-pane>
          <a-tab-pane key="cursor" tab="Cursor">
            <div class="config-block">
              <pre>{{ JSON.stringify(installConfig.configs.cursor, null, 2) }}</pre>
              <a-button
                size="small"
                @click="copyText(JSON.stringify(installConfig!.configs.cursor, null, 2))"
              >
                复制
              </a-button>
            </div>
          </a-tab-pane>
          <a-tab-pane key="openclaw" tab="OpenClaw">
            <div class="config-block">
              <pre>{{ installConfig.configs.openClaw }}</pre>
              <a-button size="small" @click="copyText(installConfig!.configs.openClaw)">
                复制
              </a-button>
            </div>
          </a-tab-pane>
          <a-tab-pane key="sse" tab="SSE URL">
            <div class="config-block">
              <pre>{{ installConfig.configs.genericSse }}</pre>
              <a-button size="small" @click="copyText(installConfig!.configs.genericSse)">
                复制
              </a-button>
            </div>
          </a-tab-pane>
        </a-tabs>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, watch } from 'vue';
  import { DownloadOutlined } from '@ant-design/icons-vue';
  import { message } from 'ant-design-vue';
  import http from '@/utils/http';
  import type { ApiResponse, PaginatedList, Package } from '@sga/shared';

  // ── Market 增强类型 ──────────────────────────────
  interface MarketPackage {
    id: string;
    name: string;
    version: string;
    description: string;
    category: string;
    toolsCount: number;
    downloads: number;
    publishedAt: string;
    enhancedDescription?: string | null;
    cardImageBase64?: string | null;
    logoBase64?: string | null;
    autoCategory?: string | null;
    toolsSummary?: string | null;
    pipelineStatus?: string | null;
    installedInHub?: boolean;
  }

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

  // ── 共享 ─────────────────────────────────────────
  const activeTab = ref('local');
  const categories = ['全部', 'ERP', 'CRM', '通用', 'AI模型', '文档', '办公工具'];

  // ── 本地仓库 ─────────────────────────────────────
  const localSearch = ref('');
  const localCat = ref('全部');
  const localPackages = ref<Package[]>([]);
  const localLoading = ref(false);
  const localPagination = ref({
    onChange: (page: number) => { void fetchLocalPackages(page); },
    current: 1,
    pageSize: 12,
    total: 0
  });

  const fetchLocalPackages = async (page = 1): Promise<void> => {
    localLoading.value = true;
    try {
      const res = (await http.get<ApiResponse<PaginatedList<Package>>>('/repo/packages', {
        params: {
          page,
          pageSize: localPagination.value.pageSize,
          search: localSearch.value,
          category: localCat.value !== '全部' ? localCat.value : undefined
        }
      })) as unknown as ApiResponse<PaginatedList<Package>>;

      if (res.code === 0) {
        localPackages.value = res.data.items;
        localPagination.value.current = res.data.page;
        localPagination.value.total = res.data.total;
      }
    } finally {
      localLoading.value = false;
    }
  };

  // ── Market 商店 ──────────────────────────────────
  const marketSearch = ref('');
  const marketCat = ref('全部');
  const marketPackages = ref<MarketPackage[]>([]);
  const marketLoading = ref(false);
  const installingId = ref<string | null>(null);
  const marketPagination = ref({
    onChange: (page: number) => { void fetchMarketPackages(page); },
    current: 1,
    pageSize: 12,
    total: 0
  });

  const fetchMarketPackages = async (_page = 1): Promise<void> => {
    marketLoading.value = true;
    try {
      const res = (await http.get<ApiResponse<{ items: MarketPackage[]; total: number }>>(
        '/market/packages',
        {
          params: {
            q: marketSearch.value || undefined,
            category: marketCat.value !== '全部' ? marketCat.value : undefined
          }
        }
      )) as unknown as ApiResponse<{ items: MarketPackage[]; total: number }>;

      if (res.code === 0) {
        marketPackages.value = res.data.items;
        marketPagination.value.total = res.data.total;
      }
    } finally {
      marketLoading.value = false;
    }
  };

  const handleInstallFromMarket = async (pkg: MarketPackage): Promise<void> => {
    installingId.value = pkg.id;
    try {
      await http.post('/packages/install', { packageId: pkg.id });
      pkg.installedInHub = true;
      message.success(`${pkg.name} 已安装到 Hub`);
      // Refresh local packages
      void fetchLocalPackages();
    } catch {
      // Error handled by http interceptor
    } finally {
      installingId.value = null;
    }
  };

  // ── 接入配置 ─────────────────────────────────────
  const configModalVisible = ref(false);
  const configTab = ref('claude');
  const installConfig = ref<InstallConfig | null>(null);

  const showInstallConfig = async (pkg: Package): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<InstallConfig>>(
        `/repo/packages/${pkg.id}/install-config`
      )) as unknown as ApiResponse<InstallConfig>;
      installConfig.value = res.data;
      configModalVisible.value = true;
    } catch {
      message.error('获取接入配置失败');
    }
  };

  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  // ── 渐变色 ───────────────────────────────────────
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #2af598 0%, #009efd 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
  ];

  const getGradient = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length]!;
  };

  // ── 监听分类切换 ─────────────────────────────────
  watch(localCat, () => { void fetchLocalPackages(1); });
  watch(marketCat, () => { void fetchMarketPackages(1); });

  onMounted(() => {
    void fetchLocalPackages();
  });

  watch(activeTab, (tab) => {
    if (tab === 'market' && marketPackages.value.length === 0) {
      void fetchMarketPackages();
    }
  });
</script>

<style lang="less" scoped>
  .repo-view {
    .repo-tabs {
      :deep(.ant-tabs-nav) {
        margin-bottom: 24px;
      }
    }

    .search-section {
      max-width: 800px;
      margin: 0 auto 32px;
      text-align: center;

      .categories {
        margin-top: 16px;

        .cat-tag {
          cursor: pointer;
          padding: 4px 12px;
        }
      }
    }

    .package-card {
      .card-cover {
        height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        overflow: hidden;

        .icon {
          font-size: 48px;
          font-weight: bold;
        }

        .logo-img {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          object-fit: cover;
          background: rgba(255, 255, 255, 0.15);
          padding: 4px;
        }

        &--image {
          padding: 0;

          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
        }
      }

      .desc {
        height: 44px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        margin-bottom: 12px;
      }

      .tags {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;

        .version,
        .tool-count {
          color: #999;
          font-size: 12px;
        }
      }
    }
  }

  .config-desc {
    margin-bottom: 16px;
    color: #666;
  }

  .config-block {
    position: relative;

    pre {
      background: #f5f5f5;
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      padding: 16px;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .ant-btn {
      position: absolute;
      top: 8px;
      right: 8px;
    }
  }
</style>
