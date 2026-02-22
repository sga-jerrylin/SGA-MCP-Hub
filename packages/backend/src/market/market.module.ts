import { forwardRef, Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MinioModule } from '../storage/minio.module';
import { AdminModule } from '../admin/admin.module';
import { RepoModule } from '../repo/repo.module';
import { MonitorModule } from '../monitor/monitor.module';

@Module({
  imports: [MinioModule, AdminModule, forwardRef(() => RepoModule), MonitorModule],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
