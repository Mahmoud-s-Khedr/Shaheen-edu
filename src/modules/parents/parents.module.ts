import { Module } from '@nestjs/common';
import { ParentsService } from './parents.service';

@Module({
  providers: [ParentsService],
  exports: [ParentsService],
})
export class ParentsModule {}
