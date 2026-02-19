import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MinioModule } from '../storage/minio.module';

@Module({
  imports: [MinioModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
