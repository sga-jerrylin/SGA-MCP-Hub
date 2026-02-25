<template>
  <div class="repo-view">
    <a-tabs v-model:activeKey="activeTab" size="large" class="repo-tabs">
      <a-tab-pane key="local" tab="本地仓库">
        <div class="search-section">
          <a-input-search
            v-model:value="localSearch"
            placeholder="搜索本地 MCP 工具包..."
            enter-button="搜索"
            size="large"
            @search="() => void fetchLocalPackages(1)"
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
                  <div v-if="getLocalCardImage(item)" class="card-cover card-cover--image">
                    <img :src="normalizeImage(getLocalCardImage(item)!)" alt="cover" />
                    <img
                      v-if="getLocalLogoImage(item)"
                      :src="normalizeImage(getLocalLogoImage(item)!)"
                      alt="logo"
                      class="card-logo-overlay"
                    />
                  </div>
                  <div v-else class="card-cover" :style="{ background: getGradient(item.name) }">
                    <img
                      v-if="getLocalLogoImage(item)"
                      :src="normalizeImage(getLocalLogoImage(item)!)"
                      alt="logo"
                      class="logo-img"
                    />
                    <span v-else class="icon">{{ item.name.charAt(0).toUpperCase() }}</span>
                  </div>
                </template>

                <a-card-meta :title="item.name">
                  <template #description>
                    <div class="desc" :title="item.description || ''">{{ item.description || '-' }}</div>
                    <div class="tags">
                      <span class="version">v{{ item.version }}</span>
                      <div class="right-badges">
                        <a-tag size="small">{{ item.category }}</a-tag>
                        <a-badge
                          :status="credentialConfiguredMap[item.id] ? 'success' : 'warning'"
                          :text="credentialConfiguredMap[item.id] ? '就绪' : '待配置'"
                        />
                      </div>
                    </div>
                  </template>
                </a-card-meta>

                <template #actions>
                  <div class="local-card-actions">
                    <div class="left">
                      <a-button type="link" size="small" @click="showInstallConfig(item)">接入配置</a-button>
                      <a-button type="link" size="small" @click="openCredentialModal(item)">凭证配置</a-button>
                    </div>
                    <a-space :size="4">
                      <a-popconfirm
                        :title="`确认停用 ${item.name}？`"
                        @confirm="() => handleDisablePackage(item)"
                      >
                        <a-button type="link" size="small" class="btn-warning">停用</a-button>
                      </a-popconfirm>
                      <a-popconfirm
                        :title="`确认删除 ${item.name}？`"
                        ok-text="删除"
                        ok-type="danger"
                        @confirm="() => handleDeletePackage(item)"
                      >
                        <a-button type="link" size="small" danger>删除</a-button>
                      </a-popconfirm>
                    </a-space>
                  </div>
                </template>
              </a-card>
            </a-list-item>
          </template>
        </a-list>
      </a-tab-pane>

      <a-tab-pane key="market" tab="Market 商店">
        <div class="search-section">
          <a-input-search
            v-model:value="marketSearch"
            placeholder="搜索 Market 工具包..."
            enter-button="搜索"
            size="large"
            @search="() => void fetchMarketPackages(1)"
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
                  <div v-if="item.cardImageBase64" class="card-cover card-cover--image">
                    <img :src="normalizeImage(item.cardImageBase64)" alt="cover" />
                    <img
                      v-if="item.logoBase64"
                      :src="normalizeImage(item.logoBase64)"
                      alt="logo"
                      class="card-logo-overlay"
                    />
                  </div>
                  <div v-else class="card-cover" :style="{ background: getGradient(item.name) }">
                    <img v-if="item.logoBase64" :src="normalizeImage(item.logoBase64)" alt="logo" class="logo-img" />
                    <span v-else class="icon">{{ item.name.charAt(0).toUpperCase() }}</span>
                  </div>
                </template>

                <a-card-meta :title="item.name">
                  <template #description>
                    <div class="desc" :title="item.enhancedDescription || item.description">
                      {{ item.enhancedDescription || item.description }}
                    </div>
                    <div class="tags">
                      <span class="tool-count" v-if="item.toolsCount">{{ item.toolsCount }} tools</span>
                      <span class="version" v-if="item.downloads > 0">{{ item.downloads }} downloads</span>
                      <div class="right-badges">
                        <a-tag size="small" :color="item.autoCategory ? 'purple' : undefined">
                          {{ item.autoCategory || item.category }}
                        </a-tag>
                      </div>
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
          description="暂无 Market 工具包，请在「系统管理 -> Market 连接」中配置 Market 地址"
        />
      </a-tab-pane>
    </a-tabs>

    <a-modal v-model:open="configModalVisible" title="接入配置" :footer="null" width="640px">
      <div v-if="installConfig">
        <p class="config-desc">
          选择您的客户端，复制以下配置即可接入 <strong>{{ installConfig.packageName }}</strong>
        </p>
        <a-tabs v-model:activeKey="configTab" size="small">
          <a-tab-pane key="claude" tab="Claude Code">
            <div class="config-block">
              <pre>{{ installConfig.configs.claudeCode }}</pre>
              <a-button size="small" @click="copyText(installConfig.configs.claudeCode)">复制</a-button>
            </div>
          </a-tab-pane>
          <a-tab-pane key="cursor" tab="Cursor">
            <div class="config-block">
              <pre>{{ JSON.stringify(installConfig.configs.cursor, null, 2) }}</pre>
              <a-button size="small" @click="copyText(JSON.stringify(installConfig.configs.cursor, null, 2))">复制</a-button>
            </div>
          </a-tab-pane>
          <a-tab-pane key="openclaw" tab="OpenClaw">
            <div class="config-block">
              <pre>{{ installConfig.configs.openClaw }}</pre>
              <a-button size="small" @click="copyText(installConfig.configs.openClaw)">复制</a-button>
            </div>
          </a-tab-pane>
          <a-tab-pane key="sse" tab="SSE URL">
            <div class="config-block">
              <pre>{{ installConfig.configs.genericSse }}</pre>
              <a-button size="small" @click="copyText(installConfig.configs.genericSse)">复制</a-button>
            </div>
          </a-tab-pane>
        </a-tabs>
      </div>
    </a-modal>

    <a-modal
      v-model:open="credentialModalVisible"
      :title="`凭证配置 - ${credentialTarget?.name ?? ''}`"
      :confirm-loading="credentialsSaving"
      :footer="null"
      width="760px"
    >
      <div class="credential-section">
        <div class="credential-header">
          <h4>已配置凭证</h4>
          <a-button size="small" :loading="credentialsLoading" @click="refreshCredentialList">刷新</a-button>
        </div>

        <a-empty
          v-if="!credentialsLoading && existingCredentials.length === 0"
          description="暂无已配置的凭证，请在下方新增"
        />

        <div v-else class="credential-existing-list">
          <div v-for="item in existingCredentials" :key="item.keyName" class="credential-existing-item">
            <div>
              <strong>{{ item.keyName }}</strong>
              <div class="credential-date">更新时间：{{ formatDate(item.updatedAt) }}</div>
            </div>
            <a-popconfirm title="确认删除该凭证？" @confirm="() => removeCredential(item.keyName)">
              <a-button danger size="small">删除</a-button>
            </a-popconfirm>
          </div>
        </div>
      </div>

      <div v-if="requiredCredentials.length > 0" class="credential-manifest-info">
        <a-alert type="info" show-icon>
          <template #message>此工具包需要以下凭证</template>
          <template #description>
            <div v-for="rc in requiredCredentials" :key="rc.keyName" class="manifest-cred-item">
              <code>{{ rc.keyName }}</code>
              <span v-if="rc.description" class="manifest-cred-desc">{{ rc.description }}</span>
              <a-tag v-if="rc.configured" color="green" size="small">已配置</a-tag>
              <a-tag v-else color="orange" size="small">待配置</a-tag>
            </div>
          </template>
        </a-alert>
      </div>

      <div v-else class="credential-manifest-info">
        <a-alert type="info" show-icon message="此工具包未声明凭证要求，如需配置可手动新增" />
      </div>

      <div class="credential-section">
        <div class="credential-header">
          <h4>{{ requiredCredentials.length > 0 ? '配置凭证' : '新增凭证' }}</h4>
          <a-button size="small" type="dashed" @click="addCredentialRow">新增一行</a-button>
        </div>

        <div v-for="(row, index) in credentialRows" :key="index" class="credential-row">
          <a-input
            v-model:value="row.keyName"
            :disabled="isManifestKey(row.keyName)"
            :placeholder="isManifestKey(row.keyName) ? '' : '凭证键名'"
          />
          <a-input-password v-model:value="row.value" placeholder="请输入凭证值" />
          <a-button
            danger
            type="text"
            :disabled="isManifestKey(row.keyName)"
            @click="removeCredentialRow(index)"
          >
            删除
          </a-button>
        </div>
      </div>

      <div class="credential-footer">
        <a-button :loading="testingConnection" @click="testCredentialConnection">测试连接</a-button>
        <a-button @click="credentialModalVisible = false">取消</a-button>
        <a-button type="primary" :loading="credentialsSaving" @click="saveCredentialRows">保存</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
  import type { ApiResponse, PaginatedList, Package } from '@sga/shared';
  import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons-vue';
  import { message } from 'ant-design-vue';
  import dayjs from 'dayjs';
  import { onMounted, ref, watch } from 'vue';
  import http from '@/utils/http';

  interface LocalPackage extends Package {
    cardImageBase64?: string | null;
    logoBase64?: string | null;
  }

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

  interface CredentialKey {
    keyName: string;
    updatedAt: string;
  }

  interface CredentialRow {
    keyName: string;
    value: string;
  }

  interface CredentialStatusItem {
    keyName: string;
    description?: string;
    configured: boolean;
  }

  interface RuntimeServerDetail {
    credentialsConfigured?: boolean;
    credentialStatus?: CredentialStatusItem[];
  }

  interface MarketImageMeta {
    cardImageBase64?: string | null;
    logoBase64?: string | null;
  }

  const activeTab = ref('local');
  const categories = ['全部', 'ERP', 'CRM', '通用', 'AI模型', '文档', '办公工具'];

  const localSearch = ref('');
  const localCat = ref('全部');
  const localPackages = ref<LocalPackage[]>([]);
  const localLoading = ref(false);
  const credentialConfiguredMap = ref<Record<string, boolean>>({});
  const marketImageMap = ref<Record<string, MarketImageMeta>>({});
  const localPagination = ref({
    onChange: (page: number) => {
      void fetchLocalPackages(page);
    },
    current: 1,
    pageSize: 12,
    total: 0
  });

  const marketSearch = ref('');
  const marketCat = ref('全部');
  const marketPackages = ref<MarketPackage[]>([]);
  const marketLoading = ref(false);
  const installingId = ref<string | null>(null);
  const marketPagination = ref({
    onChange: (page: number) => {
      void fetchMarketPackages(page);
    },
    current: 1,
    pageSize: 12,
    total: 0
  });

  const configModalVisible = ref(false);
  const configTab = ref('claude');
  const installConfig = ref<InstallConfig | null>(null);

  const credentialModalVisible = ref(false);
  const credentialTarget = ref<LocalPackage | null>(null);
  const credentialsLoading = ref(false);
  const credentialsSaving = ref(false);
  const testingConnection = ref(false);
  const existingCredentials = ref<CredentialKey[]>([]);
  const requiredCredentials = ref<CredentialStatusItem[]>([]);
  const credentialRows = ref<CredentialRow[]>([{ keyName: '', value: '' }]);

  const fetchLocalPackages = async (page = 1): Promise<void> => {
    localLoading.value = true;
    try {
      const res = (await http.get<ApiResponse<PaginatedList<LocalPackage>>>('/repo/packages', {
        params: {
          page,
          pageSize: localPagination.value.pageSize,
          search: localSearch.value || undefined,
          category: localCat.value !== '全部' ? localCat.value : undefined
        }
      })) as unknown as ApiResponse<PaginatedList<LocalPackage>>;

      localPackages.value = res.data.items;
      localPagination.value.current = res.data.page;
      localPagination.value.total = res.data.total;

      await Promise.all([
        refreshCredentialBadges(res.data.items.map((pkg) => pkg.id)),
        fetchMarketImageMap()
      ]);
    } finally {
      localLoading.value = false;
    }
  };

  const fetchMarketImageMap = async (): Promise<void> => {
    try {
      const res = (await http.get<ApiResponse<{ items: MarketPackage[]; total: number }>>(
        '/market/packages'
      )) as unknown as ApiResponse<{ items: MarketPackage[]; total: number }>;

      const map: Record<string, MarketImageMeta> = {};
      for (const item of res.data.items) {
        map[item.id] = {
          cardImageBase64: item.cardImageBase64,
          logoBase64: item.logoBase64
        };
      }
      marketImageMap.value = map;
    } catch {
      marketImageMap.value = {};
    }
  };

  const getLocalCardImage = (pkg: LocalPackage): string | null => {
    if (pkg.cardImageBase64) {
      return pkg.cardImageBase64;
    }
    return marketImageMap.value[pkg.id]?.cardImageBase64 ?? null;
  };

  const getLocalLogoImage = (pkg: LocalPackage): string | null => {
    if (pkg.logoBase64) {
      return pkg.logoBase64;
    }
    return marketImageMap.value[pkg.id]?.logoBase64 ?? null;
  };

  const refreshCredentialBadges = async (packageIds: string[]): Promise<void> => {
    const results = await Promise.all(
      packageIds.map(async (packageId) => {
        try {
          const res = (await http.get<ApiResponse<RuntimeServerDetail>>(
            `/runtime/servers/${packageId}`
          )) as unknown as ApiResponse<RuntimeServerDetail>;
          return { packageId, configured: res.data.credentialsConfigured ?? false };
        } catch {
          return { packageId, configured: false };
        }
      })
    );

    const nextMap: Record<string, boolean> = { ...credentialConfiguredMap.value };
    for (const item of results) {
      nextMap[item.packageId] = item.configured;
    }
    credentialConfiguredMap.value = nextMap;
  };

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

      marketPackages.value = res.data.items;
      marketPagination.value.total = res.data.total;
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
      await fetchLocalPackages();
    } finally {
      installingId.value = null;
    }
  };

  const handleDeletePackage = async (pkg: LocalPackage): Promise<void> => {
    try {
      await http.delete(`/repo/packages/${pkg.id}`);
      message.success(`${pkg.name} 已删除`);
      await fetchLocalPackages(localPagination.value.current);
    } catch {
      message.error('删除失败，请重试');
    }
  };

  const handleDisablePackage = async (pkg: LocalPackage): Promise<void> => {
    try {
      await http.delete(`/repo/packages/${pkg.id}`, { params: { disabled: true } });
      message.success(`${pkg.name} 已停用`);
      await fetchLocalPackages(localPagination.value.current);
    } catch {
      message.error('停用失败，请重试');
    }
  };

  const showInstallConfig = async (pkg: LocalPackage): Promise<void> => {
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

  const openCredentialModal = async (pkg: LocalPackage): Promise<void> => {
    credentialTarget.value = pkg;
    credentialRows.value = [];
    requiredCredentials.value = [];
    credentialModalVisible.value = true;

    // Fetch manifest-defined credentials from runtime
    try {
      const rtRes = (await http.get<ApiResponse<RuntimeServerDetail>>(
        `/runtime/servers/${pkg.id}`
      )) as unknown as ApiResponse<RuntimeServerDetail>;
      requiredCredentials.value = rtRes.data.credentialStatus ?? [];
    } catch {
      requiredCredentials.value = [];
    }

    // Pre-fill credential rows from manifest definitions (unconfigured ones)
    await refreshCredentialList();

    if (requiredCredentials.value.length > 0) {
      const configuredKeyNames = new Set(existingCredentials.value.map((c) => c.keyName));
      credentialRows.value = requiredCredentials.value
        .filter((rc) => !configuredKeyNames.has(rc.keyName))
        .map((rc) => ({ keyName: rc.keyName, value: '' }));
    }
    if (credentialRows.value.length === 0) {
      credentialRows.value = [{ keyName: '', value: '' }];
    }
  };

  const refreshCredentialList = async (): Promise<void> => {
    if (!credentialTarget.value) {
      return;
    }

    credentialsLoading.value = true;
    try {
      const res = (await http.get<ApiResponse<CredentialKey[]>>(
        `/credentials/${credentialTarget.value.id}`,
        { params: { tenantId: 'default' } }
      )) as unknown as ApiResponse<CredentialKey[]>;

      existingCredentials.value = res.data;
      credentialConfiguredMap.value = {
        ...credentialConfiguredMap.value,
        [credentialTarget.value.id]: res.data.length > 0
      };
    } catch {
      existingCredentials.value = [];
      message.error('读取凭证列表失败');
    } finally {
      credentialsLoading.value = false;
    }
  };

  const saveCredentialRows = async (): Promise<void> => {
    if (!credentialTarget.value) {
      return;
    }

    const rows = credentialRows.value.filter((row) => row.keyName.trim() && row.value.trim());
    if (rows.length === 0) {
      message.warning('请至少填写一条凭证');
      return;
    }

    credentialsSaving.value = true;
    try {
      await Promise.all(
        rows.map((row) =>
          http.put('/credentials', {
            tenantId: 'default',
            serverId: credentialTarget.value!.id,
            keyName: row.keyName.trim(),
            value: row.value
          })
        )
      );

      message.success('凭证保存成功');
      credentialRows.value = [{ keyName: '', value: '' }];
      await refreshCredentialList();

      // Refresh credential badge + manifest status after save
      if (credentialTarget.value) {
        try {
          const rtRes = (await http.get<ApiResponse<RuntimeServerDetail>>(
            `/runtime/servers/${credentialTarget.value.id}`
          )) as unknown as ApiResponse<RuntimeServerDetail>;
          credentialConfiguredMap.value = {
            ...credentialConfiguredMap.value,
            [credentialTarget.value.id]: rtRes.data.credentialsConfigured ?? false
          };
          requiredCredentials.value = rtRes.data.credentialStatus ?? [];
          // Update credential rows for remaining unconfigured keys
          const configuredKeyNames = new Set(existingCredentials.value.map((c) => c.keyName));
          credentialRows.value = requiredCredentials.value
            .filter((rc) => !rc.configured && !configuredKeyNames.has(rc.keyName))
            .map((rc) => ({ keyName: rc.keyName, value: '' }));
          if (credentialRows.value.length === 0) {
            credentialRows.value = [{ keyName: '', value: '' }];
          }
        } catch {
          // fallback: already updated by refreshCredentialList
        }
      }
    } finally {
      credentialsSaving.value = false;
    }
  };

  const removeCredential = async (keyName: string): Promise<void> => {
    if (!credentialTarget.value) {
      return;
    }

    await http.delete('/credentials', {
      data: {
        tenantId: 'default',
        serverId: credentialTarget.value.id,
        keyName
      }
    });
    message.success('凭证已删除');
    await refreshCredentialList();
  };

  const testCredentialConnection = async (): Promise<void> => {
    if (!credentialTarget.value) {
      return;
    }

    testingConnection.value = true;
    try {
      const res = (await http.get<ApiResponse<RuntimeServerDetail>>(
        `/runtime/servers/${credentialTarget.value.id}`
      )) as unknown as ApiResponse<RuntimeServerDetail>;

      if (res.data.credentialsConfigured) {
        message.success('凭证配置通过，连接可用');
      } else {
        message.warning('仍有必填凭证未配置，请继续补充');
      }
    } catch {
      message.error('测试连接失败，请检查服务状态和凭证配置');
    } finally {
      testingConnection.value = false;
    }
  };

  const isManifestKey = (keyName: string): boolean =>
    requiredCredentials.value.some((rc) => rc.keyName === keyName);

  const addCredentialRow = (): void => {
    credentialRows.value.push({ keyName: '', value: '' });
  };

  const removeCredentialRow = (index: number): void => {
    if (credentialRows.value.length === 1) {
      return;
    }
    credentialRows.value.splice(index, 1);
  };

  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

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
    for (let i = 0; i < name.length; i += 1) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length]!;
  };

  const normalizeImage = (value: string): string =>
    value.startsWith('data:') ? value : `data:image/png;base64,${value}`;

  const formatDate = (value: string): string => dayjs(value).format('YYYY-MM-DD HH:mm:ss');

  watch(localCat, () => {
    void fetchLocalPackages(1);
  });

  watch(marketCat, () => {
    void fetchMarketPackages(1);
  });

  onMounted(() => {
    void fetchLocalPackages();
  });

  watch(activeTab, (tab) => {
    if (tab === 'market' && marketPackages.value.length === 0) {
      void fetchMarketPackages();
    }
  });
</script>

<style scoped lang="less">
  .repo-tabs {
    :deep(.ant-tabs-nav) {
      margin-bottom: 24px;
    }
  }

  .search-section {
    max-width: 800px;
    margin: 0 auto 32px;
    text-align: center;
  }

  .categories {
    margin-top: 16px;
  }

  .cat-tag {
    cursor: pointer;
    padding: 4px 12px;
  }

  .package-card {
    .card-cover {
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      overflow: hidden;
      position: relative;

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
        position: relative;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .card-logo-overlay {
          position: absolute;
          bottom: 8px;
          left: 8px;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          object-fit: cover;
          background: rgba(255, 255, 255, 0.9);
          padding: 3px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
      }
    }

    .card-delete-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      opacity: 0;
      transition: opacity 0.18s;
      background: rgba(255, 255, 255, 0.92) !important;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
      z-index: 10;
    }

    &:hover .card-delete-btn {
      opacity: 1;
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
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;

    .version,
    .tool-count {
      color: #999;
      font-size: 12px;
    }

    .right-badges {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }

  .local-card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0 4px;

    .left {
      display: flex;
      gap: 4px;
    }
  }

  .btn-warning {
    color: #faad14 !important;
    &:hover {
      color: #ffc53d !important;
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

  .credential-section {
    margin-bottom: 18px;
  }

  .credential-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;

    h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
  }

  .credential-existing-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .credential-existing-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid #f0f0f0;
    border-radius: 8px;
  }

  .credential-date {
    margin-top: 4px;
    font-size: 12px;
    color: #999;
  }

  .credential-manifest-info {
    margin-bottom: 16px;

    .manifest-cred-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;

      code {
        background: #f0f5ff;
        border: 1px solid #d6e4ff;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 600;
        color: #1890ff;
      }

      .manifest-cred-desc {
        color: #666;
        font-size: 12px;
      }
    }
  }

  .credential-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
    margin-bottom: 8px;
  }

  .credential-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #f0f0f0;
  }
</style>
