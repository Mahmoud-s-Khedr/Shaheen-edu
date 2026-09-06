import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { PublicTestimonialsController } from './public-testimonials.controller';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';

@Module({
  imports: [AssetsModule, AuditModule],
  controllers: [TestimonialsController, PublicTestimonialsController],
  providers: [TestimonialsService],
})
export class TestimonialsModule {}
