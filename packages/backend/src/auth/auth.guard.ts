import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: {
    authorization?: string;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(private readonly authService: AuthService) {}

  private readonly pathWhitelist = new Set(['/api/auth/login', '/api/health', '/api/auth/me']);

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const method = (request.method ?? 'GET').toUpperCase();
    const path = this.normalizePath(request.originalUrl ?? request.url ?? '');

    if (this.isWhitelisted(path, method)) {
      return true;
    }

    const token = this.extractBearerToken(request.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    this.authService.getMe(token);
    return true;
  }

  private isWhitelisted(path: string, method: string): boolean {
    // Hub is a local/enterprise product — all GET requests are open
    // Only write operations (POST/PUT/DELETE) require auth
    if (method === 'GET') {
      return true;
    }

    if (path === '/api/auth/login' && method === 'POST') {
      return true;
    }

    // MCP Gateway and monitoring ingestion
    if (path === '/api/monitor/tool-calls' && method === 'POST') {
      return true;
    }

    // CLI sync/push
    if (path === '/api/sync/push' && method === 'POST') {
      return true;
    }

    // Package install from Market
    if (path === '/api/packages/install' && method === 'POST') {
      return true;
    }

    // MCP SSE transport: JSON-RPC messages from clients
    if (path === '/api/mcp' && method === 'POST') {
      return true;
    }

    return this.pathWhitelist.has(path);
  }

  private normalizePath(url: string): string {
    const queryIndex = url.indexOf('?');
    return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  }

  private extractBearerToken(authorization?: string): string {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return '';
    }

    return authorization.slice('Bearer '.length).trim();
  }
}
