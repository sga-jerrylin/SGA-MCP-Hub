import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { HubSettingEntity } from './entities/hub-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HubSettingEntity])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService]
})
export class AdminModule {}