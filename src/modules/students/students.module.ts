import { Module } from '@nestjs/common';
import { AdminStudentsController, StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [StudentsController, AdminStudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
