import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { QuestionBanksModule } from '../question-banks/question-banks.module';
import { DocumentTextExtractor } from './document-text-extractor.service';
import { OpenRouterQuestionImportClient } from './openrouter-question-import.client';
import { PdfPageRangeService } from './pdf-page-range.service';
import { PdfTranscriptionClient } from './pdf-transcription.client';
import { QuestionImportController } from './question-import.controller';
import { QuestionImportQueue } from './question-import.queue';
import { QuestionImportService } from './question-import.service';
import { QuestionImportWorker } from './question-import.worker';

@Module({ imports: [AssetsModule, AuditModule, QuestionBanksModule], controllers: [QuestionImportController], providers: [QuestionImportService, QuestionImportQueue, QuestionImportWorker, DocumentTextExtractor, OpenRouterQuestionImportClient, PdfPageRangeService, PdfTranscriptionClient], exports: [QuestionImportWorker] })
export class QuestionImportModule {}
