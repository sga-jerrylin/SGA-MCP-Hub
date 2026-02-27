import type { ApiResponse } from '@sga/shared';
import { Controller, Get, Post, Body, Query, Req, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/config.service';
import { RuntimeService } from '../runtime/runtime.service';
import { MonitorService } from '../monitor/monitor.service';

interface SseResponse {
  setHeader(name: string, value: string): void;
  flushHeaders(): void;
  write(data: string): void;
  status(code: number): SseResponse;
  json(body: unknown): void;
}

interface IncomingRequest {
  query: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface HubConnectClientConfig {
  claudeCode: { label: 'Claude Code'; command: string };
  claudeDesktop: {
    label: 'Claude Desktop';
    config: Record<string, unknown>;
    filePath: string;
  };
  cursor: { label: 'Cursor'; config: Record<string, unknown>; filePath: string };
  windsurf: { label: 'Windsurf'; config: Record<string, unknown>; filePath: string };
  vscode: { label: 'VS Code (Copilot)'; config: Record<string, unknown>; filePath: string };
  augment: { label: 'Augment Code'; instruction: string };
  dify: { label: 'Dify'; instruction: string };
  hiagent: { label: 'HiAgent'; instruction: string };
  mcpClaw: { label: 'mcp-claw'; command: string };
  genericSse: { label: 'Generic SSE'; url: string };
}

interface HubConnectConfig {
  hubName: string;
  hubSseUrl: string;
  toolCount: number;
  clients: HubConnectClientConfig;
}

interface McpSessionsResponse {
  count: number;
  sessions: Array<{ sessionId: string; connectedAt: string }>;
}

@Controller('mcp')
export class McpController {
  private readonly sessions = new Map<string, SseResponse>();

  public constructor(
    private readonly runtimeService: RuntimeService,
    private readonly monitorService: MonitorService,
    private readonly config: AppConfigService
  ) {}

  @Get('connect')
  public async getConnectConfig(): Promise<ApiResponse<HubConnectConfig>> {
    const hubName = 'sga-mcp-hub';
    const hubSseUrl = this.resolveHubSseUrl();
    const servers = await this.runtimeService.listServers().catch(() => []);
    const toolCount = servers.reduce(
      (sum, server) => sum + (typeof server.toolCount === 'number' ? server.toolCount : 0),
      0
    );

    const transportConfig = {
      url: hubSseUrl,
      transport: 'sse'
    };

    return {
      code: 0,
      message: 'ok',
      data: {
        hubName,
        hubSseUrl,
        toolCount,
        clients: {
          claudeCode: {
            label: 'Claude Code',
            command: `claude mcp add ${hubName} --transport sse ${hubSseUrl}`
          },
          claudeDesktop: {
            label: 'Claude Desktop',
            filePath: '~/.claude_desktop_config.json',
            config: {
              mcpServers: {
                [hubName]: transportConfig
              }
            }
          },
          cursor: {
            label: 'Cursor',
            filePath: '.cursor/mcp.json',
            config: {
              mcpServers: {
                [hubName]: transportConfig
              }
            }
          },
          windsurf: {
            label: 'Windsurf',
            filePath: '~/.codeium/windsurf/mcp_config.json',
            config: {
              mcpServers: {
                [hubName]: transportConfig
              }
            }
          },
          vscode: {
            label: 'VS Code (Copilot)',
            filePath: '.vscode/mcp.json',
            config: {
              mcpServers: {
                [hubName]: transportConfig
              }
            }
          },
          augment: {
            label: 'Augment Code',
            instruction: `Open Augment settings and add an MCP SSE server URL: ${hubSseUrl}`
          },
          dify: {
            label: 'Dify',
            instruction: `Use MCP connector in Dify and set endpoint to ${hubSseUrl}`
          },
          hiagent: {
            label: 'HiAgent',
            instruction: `Configure HiAgent MCP integration with SSE URL ${hubSseUrl}`
          },
          mcpClaw: {
            label: 'mcp-claw',
            command: `mcp-claw hub connect ${hubSseUrl}`
          },
          genericSse: {
            label: 'Generic SSE',
            url: hubSseUrl
          }
        }
      }
    };
  }

  @Get()
  public handleSse(@Req() req: IncomingRequest, @Res() res: SseResponse): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sessionId = randomUUID();
    this.sessions.set(sessionId, res);
    const rawUserAgent = req.headers?.['user-agent'];
    const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;
    this.monitorService.recordDownstreamSessionConnected(sessionId, userAgent);

    // MCP SSE protocol: endpoint event data is a plain URL string
    res.write(`event: endpoint\ndata: /api/mcp?sessionId=${sessionId}\n\n`);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat as unknown as number);
      this.sessions.delete(sessionId);
      this.monitorService.recordDownstreamSessionDisconnected(sessionId);
    });
  }

  @Get('sessions')
  public getSessions(): ApiResponse<McpSessionsResponse> {
    const snapshot = this.monitorService.getDownstreamSessions();
    return {
      code: 0,
      message: 'ok',
      data: {
        count: snapshot.count,
        sessions: snapshot.sessions.map((item) => ({
          sessionId: item.sessionId,
          connectedAt: item.connectedAt
        }))
      }
    };
  }

  @Post()
  public async handleMcpPost(
    @Query('sessionId') sessionId: string,
    @Body() body: JsonRpcRequest,
    @Res() res: SseResponse
  ): Promise<void> {
    const sseRes = this.sessions.get(sessionId);
    if (!sseRes) {
      res.status(400).json({ error: 'Invalid or expired sessionId' });
      return;
    }

    const rpcResponse = await this.handleJsonRpc(body);
    this.sendSseEvent(sseRes, 'message', rpcResponse);
    res.status(202).json({ ok: true });
  }

  private async handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'sga-mcp-hub', version: '0.1.0' }
          }
        };

      case 'tools/list':
        return this.handleToolsList(id);

      case 'tools/call':
        return this.handleToolsCall(
          id,
          params as { name?: string; arguments?: Record<string, unknown> } | undefined
        );

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }

  private async handleToolsList(id: number | string): Promise<JsonRpcResponse> {
    const servers = await this.runtimeService.listServers();
    const allTools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> = [];

    for (const server of servers) {
      try {
        const detail = await this.runtimeService.getServer(server.id);
        for (const tool of detail.tools) {
          allTools.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema ?? { type: 'object', properties: {} }
          });
        }
      } catch {
        // Skip servers that fail to load
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      result: { tools: allTools }
    };
  }

  private async handleToolsCall(
    id: number | string,
    params?: { name?: string; arguments?: Record<string, unknown> }
  ): Promise<JsonRpcResponse> {
    const toolName = params?.name;
    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Missing tool name' }
      };
    }

    const sepIndex = toolName.indexOf('__');
    if (sepIndex < 0) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Invalid tool name format: ${toolName}` }
      };
    }

    const serverName = toolName.slice(0, sepIndex);

    try {
      const serverId = await this.runtimeService.findServerIdByName(serverName);
      if (!serverId) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Server not found: ${serverName}` }
        };
      }
      const detail = await this.runtimeService.getServer(serverId);
      const matchedTool = detail.tools.find((tool) => tool.name === toolName);
      if (!matchedTool) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Tool not found: ${toolName}` }
        };
      }

      const bareName = toolName.slice(sepIndex + 2);
      const startedAt = Date.now();
      const callResult = await this.runtimeService.callTool(
        detail.id,
        bareName,
        params?.arguments ?? {}
      );
      const durationMs = Date.now() - startedAt;
      this.monitorService.recordToolCall(detail.id, detail.name, toolName, durationMs);

      return {
        jsonrpc: '2.0',
        id,
        result: callResult
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message }
      };
    }
  }

  private resolveHubSseUrl(): string {
    const configured = this.config.get('HUB_PUBLIC_URL')?.trim();
    if (!configured) {
      return 'http://localhost:8080/api/mcp';
    }

    if (configured.endsWith('/api/mcp')) {
      return configured;
    }

    return `${configured.replace(/\/+$/, '')}/api/mcp`;
  }

  private sendSseEvent(res: SseResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
