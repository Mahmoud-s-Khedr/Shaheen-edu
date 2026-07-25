import { Module } from '@nestjs/common';
import { PublicationService } from './publication.service';

@Module({ providers: [PublicationService], exports: [PublicationService] })
export class PublicationModule {}
