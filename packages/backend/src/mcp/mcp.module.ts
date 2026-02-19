import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { RuntimeModule } from '../runtime/runtime.module';

@Module({
  imports: [RuntimeModule],
  controllers: [McpController],
})
export class McpModule {}
