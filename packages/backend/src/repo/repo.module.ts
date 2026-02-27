import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MinioModule } from '../storage/minio.module';
import { MarketModule } from '../market/market.module';
import { PackageBuilderService } from './package-builder.service';
import { PackageSignerService } from './package-signer.service';
import { RepoController } from './repo.controller';
import { RepoService } from './repo.service';
import { SbomService } from './sbom.service';
import { RuntimeModule } from '../runtime/runtime.module';
import { ToolCatalogEntity } from './entities/tool-catalog.entity';

@Module({
  imports: [
    MinioModule,
    RuntimeModule,
    TypeOrmModule.forFeature([ToolCatalogEntity]),
    forwardRef(() => MarketModule)
  ],
  controllers: [RepoController],
  providers: [RepoService, PackageBuilderService, PackageSignerService, SbomService],
  exports: [RepoService, PackageBuilderService, PackageSignerService, SbomService]
})
export class RepoModule {}
