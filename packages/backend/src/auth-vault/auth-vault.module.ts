import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthVaultController } from './auth-vault.controller';
import { AuthVaultService } from './auth-vault.service';
import { CredentialEntity } from './entities/credential.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CredentialEntity])],
  controllers: [AuthVaultController],
  providers: [
    {
      provide: 'VAULT_MASTER_KEY',
      useFactory: () => {
        const raw = (process.env.VAULT_MASTER_KEY ?? 'a'.repeat(64)).trim();
        return Buffer.from(raw, 'hex');
      }
    },
    AuthVaultService
  ],
  exports: [AuthVaultService]
})
export class AuthVaultModule {}
