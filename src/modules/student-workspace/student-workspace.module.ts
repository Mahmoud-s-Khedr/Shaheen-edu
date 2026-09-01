import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import {
  StudentNotebookController,
  StudentQuestionHighlightsController,
} from './student-workspace.controller';
import { StudentWorkspaceService } from './student-workspace.service';

@Module({
  imports: [AssessmentsModule],
  controllers: [StudentQuestionHighlightsController, StudentNotebookController],
  providers: [StudentWorkspaceService],
})
export class StudentWorkspaceModule {}
