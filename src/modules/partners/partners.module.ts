import { Module } from '@nestjs/common';
import { AdminPartnersController } from './controllers/admin-partners.controller';
import { PartnersController } from './controllers/partners.controller';
import { PartnersService } from './partners.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminPartnersController, PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
