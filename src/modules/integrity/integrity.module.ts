import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../../database/database.module';
import { IntegrityScanService } from './integrity-scan.service';

@Module({
  imports: [DatabaseModule, ScheduleModule.forRoot()],
  providers: [IntegrityScanService],
})
export class IntegrityModule {}
