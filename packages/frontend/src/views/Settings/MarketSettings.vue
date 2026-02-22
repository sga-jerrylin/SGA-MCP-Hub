<template>
  <div class="market-settings">
    <a-card title="Market 连接设置" :bordered="false">
      <template #extra>
        <a-space>
          <a-button @click="testConnection" :loading="testing">
            测试连接
          </a-button>
          <a-button type="primary" @click="saveConfig" :loading="saving">
            保存配置
          </a-button>
        </a-space>
      </template>

      <a-alert
        message="Market 是 Hub 的工具包来源。配置后可在「配置仓库」页面浏览和安装 Market 工具包。"
        type="info"
        show-icon
        style="margin-bottom: 24px"
      />

      <a-form layout="vertical" :model="config">
        <a-form-item label="Market URL" required>
          <a-input
            v-model:value="config.marketUrl"
            placeholder="http://localhost:3100"
            size="large"
          />
        </a-form-item>

        <a-form-item label="Market Token（可选）">
          <a-input-password
            v-model:value="config.marketToken"
            placeholder="留空则不携带认证信息"
            size="large"
          />
          <template #help>
            <span v-if="hasToken" style="color: #16a34a">已配置 Token</span>
          </template>
        </a-form-item>
      </a-form>

      <a-divider />

      <div v-if="testResult" class="test-result">
        <a-result
          :status="testResult.ok ? 'success' : 'error'"
          :title="testResult.ok ? '连接成功' : '连接失败'"
        >
          <template #subTitle>
            <div v-if="testResult.ok">
              <p>延迟: {{ testResult.latencyMs }}ms</p>
              <p v-if="testResult.packageCount != null">
                可用工具包: {{ testResult.packageCount }} 个
              </p>
            </div>
            <div v-else>
              <p>请检查 Market URL 是否正确且 Market 服务已启动</p>
            </div>
          </template>
        </a-result>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import http from '@/utils/http';
  import type { ApiResponse } from '@sga/shared';

  interface MarketConfig {
    marketUrl: string;
    marketToken: string;
  }

  const config = reactive<MarketConfig>({
    marketUrl: '',
    marketToken: ''
  });

  const hasToken = ref(false);
  const testing = ref(false);
  const saving = ref(false);
  const testResult = ref<{ ok: boolean; latencyMs: number; packageCount?: number } | null>(null);

  const loadConfig = async (): Promise<void> => {
    try {
      const res = (await http.get<
        ApiResponse<{ marketUrl: string; hasToken: boolean }>
      >('/admin/settings/market')) as unknown as ApiResponse<{
        marketUrl: string;
        hasToken: boolean;
      }>;
      config.marketUrl = res.data.marketUrl;
      hasToken.value = res.data.hasToken;
    } catch {
      // fallback
    }
  };

  const saveConfig = async (): Promise<void> => {
    if (!config.marketUrl.trim()) {
      message.warning('请输入 Market URL');
      return;
    }
    saving.value = true;
    try {
      const payload: { marketUrl: string; marketToken?: string } = {
        marketUrl: config.marketUrl.trim()
      };
      if (config.marketToken) {
        payload.marketToken = config.marketToken;
      }
      await http.put('/admin/settings/market', payload);
      message.success('Market 配置已保存');
      hasToken.value = !!config.marketToken || hasToken.value;
      config.marketToken = '';
    } catch {
      // Error handled by http interceptor
    } finally {
      saving.value = false;
    }
  };

  const testConnection = async (): Promise<void> => {
    testing.value = true;
    testResult.value = null;
    try {
      const res = (await http.post<
        ApiResponse<{ ok: boolean; latencyMs: number; packageCount?: number }>
      >('/admin/settings/market/test')) as unknown as ApiResponse<{
        ok: boolean;
        latencyMs: number;
        packageCount?: number;
      }>;
      testResult.value = res.data;
    } catch {
      testResult.value = { ok: false, latencyMs: 0 };
    } finally {
      testing.value = false;
    }
  };

  onMounted(() => {
    void loadConfig();
  });
</script>

<style scoped lang="less">
  .market-settings {
    padding: 0;
  }

  .test-result {
    margin-top: 16px;

    :deep(.ant-result) {
      padding: 24px 0;
    }
  }
</style>
