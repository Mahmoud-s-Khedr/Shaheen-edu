import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Student360PaginationQueryDto } from './student-360-pagination-query.dto';

describe('Student360PaginationQueryDto', () => {
  it('accepts a support reason alongside pagination parameters', () => {
    const query = plainToInstance(Student360PaginationQueryDto, {
      page: '2', limit: '25', reason: 'phase5-acceptance-coverage',
    });

    expect(validateSync(query, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
});
