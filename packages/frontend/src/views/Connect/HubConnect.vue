<template>
  <div class="hub-connect">
    <!-- Hub 状态卡片 -->
    <a-card class="hub-status-card">
      <a-row :gutter="24" align="middle">
        <a-col :span="16">
          <h2 class="hub-title">
            <ApiOutlined />
            Hub MCP Gateway
          </h2>
          <p class="hub-desc">
            一个连接，所有工具。将下方配置添加到您的 AI 客户端即可使用 Hub 中全部已安装的 MCP 工具。
          </p>
          <div class="hub-url-row">
            <code class="hub-url">{{ hubSseUrl }}</code>
            <a-button size="small" @click="copyText(hubSseUrl)">
              <CopyOutlined /> 复制
            </a-button>
          </div>
        </a-col>
        <a-col :span="8" class="hub-stats">
          <a-statistic title="聚合工具数" :value="toolCount" class="stat-item">
            <template #prefix><ToolOutlined /></template>
          </a-statistic>
          <a-tag :color="connected ? 'green' : 'red'" class="status-tag">
            {{ connected ? 'Gateway 在线' : '检测中...' }}
          </a-tag>
        </a-col>
      </a-row>
    </a-card>

    <!-- 客户端选择 -->
    <a-card class="client-config-card">
      <template #title>
        <span>选择您的客户端</span>
      </template>

      <div class="client-selector">
        <div
          v-for="client in clientList"
          :key="client.key"
          :class="['client-chip', { 'client-chip--active': selectedClient === client.key }]"
          @click="selectedClient = client.key"
        >
          <component :is="client.icon" />
          <span>{{ client.label }}</span>
        </div>
      </div>

      <!-- 配置展示区 -->
      <div class="config-display" v-if="currentConfig">
        <div class="config-header">
          <h3>{{ currentConfig.label }}</h3>
          <a-tag v-if="currentConfig.category === 'ide'" color="blue">IDE 插件</a-tag>
          <a-tag v-else-if="currentConfig.category === 'platform'" color="purple">AI 平台</a-tag>
          <a-tag v-else-if="currentConfig.category === 'cli'" color="green">CLI 工具</a-tag>
          <a-tag v-else color="default">通用</a-tag>
        </div>

        <!-- 命令类型 -->
        <div v-if="currentConfig.type === 'command'" class="config-block">
          <div class="config-label">在终端运行以下命令：</div>
          <div class="config-code">
            <pre>{{ currentConfig.command }}</pre>
            <a-button
              type="primary"
              size="small"
              @click="copyText(currentConfig.command!)"
            >
              <CopyOutlined /> 复制命令
            </a-button>
          </div>
        </div>

        <!-- JSON 配置类型 -->
        <div v-if="currentConfig.type === 'json'" class="config-block">
          <div class="config-label">
            将以下 JSON 添加到配置文件：
            <code class="file-path">{{ currentConfig.filePath }}</code>
          </div>
          <div class="config-code">
            <pre>{{ currentConfig.json }}</pre>
            <a-button
              type="primary"
              size="small"
              @click="copyText(currentConfig.json!)"
            >
              <CopyOutlined /> 复制配置
            </a-button>
          </div>
        </div>

        <!-- 指引类型 -->
        <div v-if="currentConfig.type === 'instruction'" class="config-block">
          <div class="config-label">操作步骤：</div>
          <div class="instruction-steps">
            <ol>
              <li v-for="(step, i) in currentConfig.steps" :key="i">
                <span v-html="step" />
              </li>
            </ol>
          </div>
          <div class="config-code" v-if="currentConfig.urlToCopy">
            <div class="config-label">SSE URL：</div>
            <pre>{{ currentConfig.urlToCopy }}</pre>
            <a-button
              type="primary"
              size="small"
              @click="copyText(currentConfig.urlToCopy!)"
            >
              <CopyOutlined /> 复制 URL
            </a-button>
          </div>
        </div>

        <!-- URL 类型 -->
        <div v-if="currentConfig.type === 'url'" class="config-block">
          <div class="config-label">SSE 端点地址：</div>
          <div class="config-code">
            <pre>{{ hubSseUrl }}</pre>
            <a-button
              type="primary"
              size="small"
              @click="copyText(hubSseUrl)"
            >
              <CopyOutlined /> 复制
            </a-button>
          </div>
          <div class="config-hint">
            任何支持 MCP SSE Transport 的客户端都可以使用此地址连接到 Hub。
          </div>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue';
  import {
    ApiOutlined,
    CopyOutlined,
    ToolOutlined,
    CodeOutlined,
    DesktopOutlined,
    AppstoreOutlined,
    CloudServerOutlined,
    LinkOutlined,
    ThunderboltOutlined,
    RocketOutlined,
    GlobalOutlined,
    ConsoleSqlOutlined
  } from '@ant-design/icons-vue';
  import { message } from 'ant-design-vue';
  import http from '@/utils/http';

  interface ConnectResponse {
    hubName: string;
    hubSseUrl: string;
    toolCount: number;
  }

  interface ClientConfig {
    key: string;
    label: string;
    icon: ReturnType<typeof CodeOutlined>;
    category: 'ide' | 'platform' | 'cli' | 'generic';
    type: 'command' | 'json' | 'instruction' | 'url';
    command?: string;
    json?: string;
    filePath?: string;
    steps?: string[];
    urlToCopy?: string;
  }

  const hubSseUrl = ref('');
  const toolCount = ref(0);
  const connected = ref(false);
  const selectedClient = ref('claudeCode');

  const clientList = [
    { key: 'claudeCode', label: 'Claude Code', icon: CodeOutlined },
    { key: 'claudeDesktop', label: 'Claude Desktop', icon: DesktopOutlined },
    { key: 'cursor', label: 'Cursor', icon: ThunderboltOutlined },
    { key: 'windsurf', label: 'Windsurf', icon: RocketOutlined },
    { key: 'vscode', label: 'VS Code', icon: AppstoreOutlined },
    { key: 'augment', label: 'Augment', icon: CloudServerOutlined },
    { key: 'dify', label: 'Dify', icon: GlobalOutlined },
    { key: 'hiagent', label: 'HiAgent', icon: ConsoleSqlOutlined },
    { key: 'mcpClaw', label: 'mcp-claw', icon: LinkOutlined },
    { key: 'genericSse', label: 'Generic SSE', icon: ApiOutlined },
  ];

  const buildConfigs = (url: string): Record<string, ClientConfig> => ({
    claudeCode: {
      key: 'claudeCode',
      label: 'Claude Code (CLI)',
      icon: CodeOutlined,
      category: 'ide',
      type: 'command',
      command: `claude mcp add sga-hub --transport sse --url ${url}`,
    },
    claudeDesktop: {
      key: 'claudeDesktop',
      label: 'Claude Desktop',
      icon: DesktopOutlined,
      category: 'ide',
      type: 'json',
      json: JSON.stringify({
        mcpServers: {
          'sga-hub': { url, transport: 'sse' }
        }
      }, null, 2),
      filePath: '~/Library/Application Support/Claude/claude_desktop_config.json',
    },
    cursor: {
      key: 'cursor',
      label: 'Cursor',
      icon: ThunderboltOutlined,
      category: 'ide',
      type: 'json',
      json: JSON.stringify({
        mcpServers: {
          'sga-hub': { url, transport: 'sse' }
        }
      }, null, 2),
      filePath: '.cursor/mcp.json',
    },
    windsurf: {
      key: 'windsurf',
      label: 'Windsurf',
      icon: RocketOutlined,
      category: 'ide',
      type: 'json',
      json: JSON.stringify({
        mcpServers: {
          'sga-hub': { url, transport: 'sse' }
        }
      }, null, 2),
      filePath: '~/.codeium/windsurf/mcp_config.json',
    },
    vscode: {
      key: 'vscode',
      label: 'VS Code (GitHub Copilot)',
      icon: AppstoreOutlined,
      category: 'ide',
      type: 'json',
      json: JSON.stringify({
        servers: {
          'sga-hub': { type: 'sse', url }
        }
      }, null, 2),
      filePath: '.vscode/mcp.json',
    },
    augment: {
      key: 'augment',
      label: 'Augment Code',
      icon: CloudServerOutlined,
      category: 'ide',
      type: 'instruction',
      steps: [
        '打开 Augment Code 设置面板',
        '找到 <strong>MCP Servers</strong> 配置项',
        '点击 <strong>Add Server</strong>',
        `填入 SSE URL: <code>${url}</code>`,
        '保存并重启 Augment',
      ],
      urlToCopy: url,
    },
    dify: {
      key: 'dify',
      label: 'Dify',
      icon: GlobalOutlined,
      category: 'platform',
      type: 'instruction',
      steps: [
        '进入 Dify 应用编辑页',
        '在工具栏中点击 <strong>添加工具</strong>',
        '选择 <strong>MCP SSE</strong> 工具类型',
        `填入 Server URL: <code>${url}</code>`,
        '点击保存，Hub 中的所有工具将自动加载',
      ],
      urlToCopy: url,
    },
    hiagent: {
      key: 'hiagent',
      label: 'HiAgent',
      icon: ConsoleSqlOutlined,
      category: 'platform',
      type: 'instruction',
      steps: [
        '进入 HiAgent 工具管理页',
        '点击 <strong>添加 MCP 工具源</strong>',
        '选择传输方式为 <strong>SSE</strong>',
        `填入端点地址: <code>${url}</code>`,
        '确认后 Hub 工具将自动同步到 HiAgent',
      ],
      urlToCopy: url,
    },
    mcpClaw: {
      key: 'mcpClaw',
      label: 'mcp-claw CLI',
      icon: LinkOutlined,
      category: 'cli',
      type: 'command',
      command: `mcp-claw hub connect ${url}`,
    },
    genericSse: {
      key: 'genericSse',
      label: 'Generic SSE',
      icon: ApiOutlined,
      category: 'generic',
      type: 'url',
    },
  });

  const configs = ref<Record<string, ClientConfig>>({});

  const currentConfig = computed(() => {
    return configs.value[selectedClient.value] ?? null;
  });

  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  const fetchConnectConfig = async (): Promise<void> => {
    try {
      const res = (await http.get('/mcp/connect')) as unknown as {
        code: number;
        data: ConnectResponse;
      };
      if (res.code === 0) {
        hubSseUrl.value = res.data.hubSseUrl;
        toolCount.value = res.data.toolCount;
        connected.value = true;
        configs.value = buildConfigs(res.data.hubSseUrl);
        return;
      }
    } catch {
      // Fallback to constructed URL
    }

    // Fallback: construct from current origin
    const fallbackUrl = `${window.location.origin}/api/mcp`;
    hubSseUrl.value = fallbackUrl;
    configs.value = buildConfigs(fallbackUrl);
    connected.value = true;
  };

  onMounted(() => {
    void fetchConnectConfig();
  });
</script>

<style lang="less" scoped>
  .hub-connect {
    max-width: 960px;
    margin: 0 auto;
  }

  .hub-status-card {
    margin-bottom: 24px;

    .hub-title {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .hub-desc {
      color: #666;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .hub-url-row {
      display: flex;
      align-items: center;
      gap: 12px;

      .hub-url {
        background: #f0f5ff;
        border: 1px solid #d6e4ff;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        color: #1890ff;
        flex: 1;
        word-break: break-all;
      }
    }

    .hub-stats {
      text-align: center;

      .stat-item {
        margin-bottom: 12px;
      }

      .status-tag {
        font-size: 13px;
      }
    }
  }

  .client-config-card {
    .client-selector {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #f0f0f0;
    }

    .client-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: 1px solid #d9d9d9;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
      user-select: none;

      &:hover {
        border-color: #1890ff;
        color: #1890ff;
      }

      &--active {
        background: #1890ff;
        border-color: #1890ff;
        color: #fff;

        &:hover {
          background: #40a9ff;
          border-color: #40a9ff;
          color: #fff;
        }
      }
    }
  }

  .config-display {
    .config-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
    }

    .config-block {
      margin-bottom: 16px;
    }

    .config-label {
      color: #666;
      margin-bottom: 8px;
      font-size: 14px;

      code {
        background: #f5f5f5;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 12px;
      }
    }

    .file-path {
      margin-left: 4px;
      color: #8c8c8c;
    }

    .config-code {
      position: relative;
      margin-bottom: 12px;

      pre {
        background: #1e1e2e;
        color: #cdd6f4;
        border-radius: 8px;
        padding: 16px 20px;
        font-size: 13px;
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        margin: 0;
        line-height: 1.6;
      }

      .ant-btn {
        position: absolute;
        top: 8px;
        right: 8px;
      }
    }

    .config-hint {
      color: #8c8c8c;
      font-size: 13px;
      margin-top: 8px;
    }

    .instruction-steps {
      background: #fafafa;
      border: 1px solid #f0f0f0;
      border-radius: 8px;
      padding: 16px 16px 16px 8px;
      margin-bottom: 16px;

      ol {
        margin: 0;
        padding-left: 24px;

        li {
          padding: 6px 0;
          font-size: 14px;
          line-height: 1.8;

          code {
            background: #e6f7ff;
            border: 1px solid #91d5ff;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            color: #1890ff;
          }
        }
      }
    }
  }
</style>
