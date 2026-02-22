import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { RuntimeModule } from '../runtime/runtime.module';
import { MonitorModule } from '../monitor/monitor.module';

@Module({
  imports: [RuntimeModule, MonitorModule],
  controllers: [McpController],
})
export class McpModule {}
