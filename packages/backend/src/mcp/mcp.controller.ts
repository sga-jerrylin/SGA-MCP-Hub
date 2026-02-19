import { Controller, Get, Req, Res } from '@nestjs/common';
import { RuntimeService } from '../runtime/runtime.service';

interface SseResponse {
  setHeader(name: string, value: string): void;
  flushHeaders(): void;
  write(data: string): void;
}

interface IncomingRequest {
  query: Record<string, string | undefined>;
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

@Controller('mcp')
export class McpController {
  public constructor(private readonly runtimeService: RuntimeService) {}

  @Get()
  public async handleMcp(
    @Req() req: IncomingRequest,
    @Res() res: SseResponse,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.sendSseEvent(res, 'endpoint', { url: '/api/mcp' });

    const rpcParam = req.query['rpc'];

    if (rpcParam) {
      try {
        const rpcRequest = JSON.parse(rpcParam) as JsonRpcRequest;
        const rpcResponse = await this.handleJsonRpc(rpcRequest);
        this.sendSseEvent(res, 'message', rpcResponse);
      } catch {
        this.sendSseEvent(res, 'message', {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        });
      }
    }

    let body = '';
    req.on('data', (chunk: unknown) => {
      body += String(chunk);
    });

    req.on('end', () => {
      if (body.trim()) {
        try {
          const rpcRequest = JSON.parse(body) as JsonRpcRequest;
          void this.handleJsonRpc(rpcRequest).then((rpcResponse) => {
            this.sendSseEvent(res, 'message', rpcResponse);
          });
        } catch {
          this.sendSseEvent(res, 'message', {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          });
        }
      }
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat as unknown as number);
    });
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
            serverInfo: { name: 'sga-mcp-hub', version: '0.1.0' },
          },
        };

      case 'tools/list':
        return this.handleToolsList(id);

      case 'tools/call':
        return this.handleToolsCall(id, params as { name?: string; arguments?: Record<string, unknown> } | undefined);

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
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
            inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
          });
        }
      } catch {
        // Skip servers that fail to load
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      result: { tools: allTools },
    };
  }

  private async handleToolsCall(
    id: number | string,
    params?: { name?: string; arguments?: Record<string, unknown> },
  ): Promise<JsonRpcResponse> {
    const toolName = params?.name;
    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Missing tool name' },
      };
    }

    const dotIndex = toolName.indexOf('.');
    if (dotIndex < 0) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Invalid tool name format: ${toolName}` },
      };
    }

    const serverId = toolName.slice(0, dotIndex);

    try {
      const detail = await this.runtimeService.getServer(serverId);
      const matchedTool = detail.tools.find((tool) => tool.name === toolName);
      if (!matchedTool) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Tool not found: ${toolName}` },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Tool ${toolName} executed successfully (stub)`,
            },
          ],
        },
      };
    } catch {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Server ${serverId} not available` },
      };
    }
  }

  private sendSseEvent(res: SseResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
