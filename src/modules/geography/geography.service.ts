import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { GeographyNameDto } from './geography.dto';

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  async listGovernorates() { const items = await this.prisma.governorate.findMany({ include: { centers: { orderBy: { nameAr: 'asc' } } }, orderBy: { nameAr: 'asc' } }); return items.map((item) => this.governorateDto(item)); }
  async createGovernorate(name: GeographyNameDto) {
    try { return this.governorateDto(await this.prisma.governorate.create({ data: { nameAr: name.ar.trim(), nameEn: name.en.trim() } })); }
    catch { throw new ConflictException('Governorate already exists'); }
  }
  async createCenter(governorateId: string, name: GeographyNameDto) {
    const governorate = await this.prisma.governorate.findUnique({ where: { id: governorateId } });
    if (!governorate) throw new NotFoundException('Governorate not found');
    try { return this.centerDto(await this.prisma.center.create({ data: { governorateId, nameAr: name.ar.trim(), nameEn: name.en.trim() } })); }
    catch { throw new ConflictException('Center already exists in this governorate'); }
  }
  async deleteCenter(id: string) {
    try { await this.prisma.center.delete({ where: { id } }); return { id, deleted: true }; }
    catch { throw new ConflictException('Center cannot be deleted while referenced'); }
  }
  async deleteGovernorate(id: string) {
    try { await this.prisma.governorate.delete({ where: { id } }); return { id, deleted: true }; }
    catch { throw new ConflictException('Governorate cannot be deleted while referenced'); }
  }

  private centerDto(center: any) { const { nameAr, nameEn, ...rest } = center; return { ...rest, name: { ar: nameAr, en: nameEn } }; }
  private governorateDto(governorate: any) { const { nameAr, nameEn, centers, ...rest } = governorate; return { ...rest, name: { ar: nameAr, en: nameEn }, centers: centers?.map((center: any) => this.centerDto(center)) ?? [] }; }
}
