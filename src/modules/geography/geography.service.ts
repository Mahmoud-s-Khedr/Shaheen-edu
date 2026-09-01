import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  arabicMatch,
  paginateArabicSearch,
} from '../../common/search/arabic-search';
import { PrismaService } from '../../database/prisma.service';
import type { GeographyNameDto } from './geography.dto';
import {
  toPaginationMeta,
  type SearchPaginationQueryDto,
} from '../../common/dto/pagination-query.dto';

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  async listGovernorates(query: SearchPaginationQueryDto) {
    const needle = query.q?.trim();
    const { data: items, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.governorate,
      target: 'governorate',
      q: query.q,
      scope: {
        // A governorate also matches when one of its centers does, mirroring
        // the `centers: { some: ... }` branch of the Prisma filter.
        alsoMatches: needle
          ? Prisma.sql`EXISTS (
              SELECT 1 FROM "Center" c
              WHERE c."governorateId" = t.id
                AND ${arabicMatch('center', needle, 'c')}
            )`
          : undefined,
      },
      orderBySql: Prisma.sql`t."nameAr" ASC, t.id ASC`,
      orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
      where: {},
      args: {
        include: { centers: { orderBy: [{ nameAr: 'asc' }, { id: 'asc' }] } },
      },
      page: query.page,
      limit: query.limit,
    });
    return {
      data: items.map((item) => this.governorateDto(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
  async createGovernorate(name: GeographyNameDto) {
    try {
      return this.governorateDto(
        await this.prisma.governorate.create({
          data: { nameAr: name.ar.trim(), nameEn: name.en.trim() },
        }),
      );
    } catch {
      throw new ConflictException('Governorate already exists');
    }
  }
  async createCenter(governorateId: string, name: GeographyNameDto) {
    const governorate = await this.prisma.governorate.findUnique({
      where: { id: governorateId },
    });
    if (!governorate) throw new NotFoundException('Governorate not found');
    try {
      return this.centerDto(
        await this.prisma.center.create({
          data: {
            governorateId,
            nameAr: name.ar.trim(),
            nameEn: name.en.trim(),
          },
        }),
      );
    } catch {
      throw new ConflictException('Center already exists in this governorate');
    }
  }
  async deleteCenter(id: string) {
    try {
      await this.prisma.center.delete({ where: { id } });
      return { id, deleted: true };
    } catch {
      throw new ConflictException('Center cannot be deleted while referenced');
    }
  }
  async deleteGovernorate(id: string) {
    try {
      await this.prisma.governorate.delete({ where: { id } });
      return { id, deleted: true };
    } catch {
      throw new ConflictException(
        'Governorate cannot be deleted while referenced',
      );
    }
  }

  private centerDto(center: any) {
    const { nameAr, nameEn, ...rest } = center;
    return { ...rest, name: { ar: nameAr, en: nameEn } };
  }
  private governorateDto(governorate: any) {
    const { nameAr, nameEn, centers, ...rest } = governorate;
    return {
      ...rest,
      name: { ar: nameAr, en: nameEn },
      centers: centers?.map((center: any) => this.centerDto(center)) ?? [],
    };
  }
}
