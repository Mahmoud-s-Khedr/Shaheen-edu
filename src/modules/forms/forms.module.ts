import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminFormsController } from './admin-forms.controller';
import { ParentFormsController } from './parent-forms.controller';
import { StudentFormsController } from './student-forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [AuditModule],
  controllers: [
    AdminFormsController,
    StudentFormsController,
    ParentFormsController,
  ],
  providers: [FormsService],
})
export class FormsModule {}
