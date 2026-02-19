import { Module } from '@nestjs/common';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';
import { AuthVaultModule } from '../auth-vault/auth-vault.module';
import { MinioModule } from '../storage/minio.module';

@Module({
  imports: [MinioModule, AuthVaultModule],
  controllers: [RuntimeController],
  providers: [RuntimeService],
  exports: [RuntimeService]
})
export class RuntimeModule {}
