import { Module } from '@nestjs/common';
import { GeographyController } from './geography.controller';
import { PublicGeographyController } from './public-geography.controller';
import { GeographyService } from './geography.service';

@Module({
  controllers: [GeographyController, PublicGeographyController],
  providers: [GeographyService],
})
export class GeographyModule {}
