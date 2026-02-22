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
    if (path === '/api/auth/login') {
      return method === 'POST';
    }

    if (path === '/api/health') {
      return method === 'GET';
    }

    if (path === '/api/monitor/tool-calls') {
      return method === 'POST';
    }

    if (path === '/api/mcp') {
      return method === 'GET';
    }

    if (path.startsWith('/api/market/')) {
      return method === 'GET';
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
