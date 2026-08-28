import { Module } from '@nestjs/common';
import { CompletionService } from './completion.service';

@Module({ providers: [CompletionService], exports: [CompletionService] })
export class CompletionModule {}
