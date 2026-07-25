import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  listGovernorates() { return this.prisma.governorate.findMany({ include: { centers: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }); }
  async createGovernorate(name: string) {
    try { return await this.prisma.governorate.create({ data: { name: name.trim() } }); }
    catch { throw new ConflictException('Governorate already exists'); }
  }
  async createCenter(governorateId: string, name: string) {
    const governorate = await this.prisma.governorate.findUnique({ where: { id: governorateId } });
    if (!governorate) throw new NotFoundException('Governorate not found');
    try { return await this.prisma.center.create({ data: { governorateId, name: name.trim() } }); }
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
}
