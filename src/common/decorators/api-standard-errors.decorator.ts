import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-response.dto';

/** Documents the application's globally consistent error body. */
export function ApiStandardErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, type: ApiErrorResponseDto }),
    ),
  );
}
