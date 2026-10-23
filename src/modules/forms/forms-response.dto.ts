import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FormQuestionType,
  FormRespondentType,
  FormStatus,
} from '@prisma/client';

export class FormOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() questionId!: string;
  @ApiProperty() label!: string;
  @ApiProperty() sortOrder!: number;
}
export class FormQuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() formId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: FormQuestionType }) type!: FormQuestionType;
  @ApiProperty() required!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: [FormOptionDto] }) options!: FormOptionDto[];
}
export class FormContentDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) confirmationMessage!:
    string | null;
  @ApiProperty({ type: [FormQuestionDto] }) questions!: FormQuestionDto[];
}
export class FormDetailDto extends FormContentDto {
  @ApiProperty({ enum: FormStatus }) status!: FormStatus;
  @ApiProperty() createdById!: string;
  @ApiProperty() updatedById!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  activatedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;
}
export class ActiveFormDto {
  @ApiProperty({ type: FormContentDto, nullable: true })
  form!: FormContentDto | null;
  @ApiProperty() hasSubmitted!: boolean;
  @ApiProperty({ type: String, nullable: true }) submissionId!: string | null;
}
export class FormAnswerDto {
  @ApiProperty() id!: string;
  @ApiProperty() submissionId!: string;
  @ApiProperty() questionId!: string;
  @ApiProperty({ type: String, nullable: true }) text!: string | null;
  @ApiProperty({ type: [String] }) optionIds!: string[];
}
export class FormSubmissionSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() formId!: string;
  @ApiProperty({ enum: FormRespondentType })
  respondentType!: FormRespondentType;
  @ApiProperty({ type: String, nullable: true }) studentUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) parentPhoneNormalized!:
    string | null;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
}
export class FormSubmissionDto extends FormSubmissionSummaryDto {
  @ApiProperty({ type: [FormAnswerDto] }) answers!: FormAnswerDto[];
}
export class FormSubmittedDto extends FormSubmissionDto {
  @ApiProperty({ type: String, nullable: true }) confirmationMessage!:
    string | null;
}
export class FormSubmissionListItemDto extends FormSubmissionSummaryDto {
  @ApiProperty({ type: String, nullable: true }) studentName!: string | null;
}
export class FormPaginationDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
export class FormListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) confirmationMessage!:
    string | null;
  @ApiProperty({ enum: FormStatus }) status!: FormStatus;
  @ApiProperty() createdById!: string;
  @ApiProperty() updatedById!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  activatedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;
  @ApiProperty() submissionCount!: number;
}
export class FormsPageDto {
  @ApiProperty({ type: [FormListItemDto] }) data!: FormListItemDto[];
  @ApiProperty({ type: FormPaginationDto }) meta!: FormPaginationDto;
}
export class FormSubmissionsPageDto {
  @ApiProperty({ type: [FormSubmissionListItemDto] })
  data!: FormSubmissionListItemDto[];
  @ApiProperty({ type: FormPaginationDto }) meta!: FormPaginationDto;
}
export class FormOptionResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() count!: number;
  @ApiProperty({
    description:
      'Percentage of respondents who answered this question. Multi-select percentages may sum above 100.',
  })
  percentage!: number;
}
export class FormQuestionResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: FormQuestionType }) type!: FormQuestionType;
  @ApiProperty() answerCount!: number;
  @ApiProperty({ type: [FormOptionResultDto] }) options!: FormOptionResultDto[];
}
export class FormResultsDto {
  @ApiProperty() formId!: string;
  @ApiPropertyOptional({ enum: FormRespondentType, nullable: true })
  respondentType!: FormRespondentType | null;
  @ApiProperty() totalSubmissions!: number;
  @ApiProperty({ type: [FormQuestionResultDto] })
  questions!: FormQuestionResultDto[];
}
export class FormDeletedDto {
  @ApiProperty() id!: string;
  @ApiProperty() deleted!: boolean;
}
