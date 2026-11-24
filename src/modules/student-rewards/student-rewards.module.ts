import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StudentCreditService } from './student-credit.service';
import { StudentRewardsService } from './student-rewards.service';
import { PublicStudentRewardsController } from './public-student-rewards.controller';
import {
  AdminStudentRewardsController,
  StudentRewardsController,
} from './student-rewards.controller';
@Module({
  imports: [AuditModule],
  controllers: [
    AdminStudentRewardsController,
    StudentRewardsController,
    PublicStudentRewardsController,
  ],
  providers: [StudentCreditService, StudentRewardsService],
  exports: [StudentCreditService, StudentRewardsService],
})
export class StudentRewardsModule {}
