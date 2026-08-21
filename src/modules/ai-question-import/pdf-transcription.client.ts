import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { OpenRouterQuestionImportError } from './openrouter-question-import.client';

export type PdfVisualType =
  | 'DIAGRAM'
  | 'CHART'
  | 'MAP'
  | 'TABLE'
  | 'EQUATION'
  | 'PHOTO'
  | 'OPTION_IMAGE'
  | 'OTHER_INSTRUCTIONAL';
export interface PdfVisualRegion {
  type: PdfVisualType;
  bounds: { left: number; top: number; right: number; bottom: number };
  confidence: number;
  description: string;
  warnings: string[];
}
export interface PdfLayoutEnvelope {
  kind:
    | 'QUESTION_STEM'
    | 'OPTION_GROUP'
    | 'OPTION'
    | 'SHARED_CONTEXT'
    | 'TABLE'
    | 'TEXT';
  text: string;
  bounds: { left: number; top: number; right: number; bottom: number };
  optionIndex: number | null;
}
export interface PdfTranscribedPage {
  content: string;
  confidence: number;
  uncertainSpans: string[];
  warnings: string[];
  visualRegions: PdfVisualRegion[];
  layoutEnvelopes: PdfLayoutEnvelope[];
}
export type PdfTranscriptionAttemptMode =
  'PRIMARY' | 'STRICT_RETRY' | 'FALLBACK';
export interface PdfTranscriptionRequestOptions {
  model?: string;
  mode?: PdfTranscriptionAttemptMode;
}
const pageSchema = {
  name: 'visual_arabic_exam_page_transcription_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'content',
      'confidence',
      'uncertainSpans',
      'warnings',
      'visualRegions',
      'layoutEnvelopes',
    ],
    properties: {
      content: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      uncertainSpans: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } },
      visualRegions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'bounds', 'confidence', 'description', 'warnings'],
          properties: {
            type: {
              type: 'string',
              enum: [
                'DIAGRAM',
                'CHART',
                'MAP',
                'TABLE',
                'EQUATION',
                'PHOTO',
                'OPTION_IMAGE',
                'OTHER_INSTRUCTIONAL',
              ],
            },
            bounds: {
              type: 'object',
              additionalProperties: false,
              required: ['left', 'top', 'right', 'bottom'],
              properties: {
                left: { type: 'integer', minimum: 0, maximum: 1000 },
                top: { type: 'integer', minimum: 0, maximum: 1000 },
                right: { type: 'integer', minimum: 0, maximum: 1000 },
                bottom: { type: 'integer', minimum: 0, maximum: 1000 },
              },
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            description: { type: 'string' },
            warnings: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      layoutEnvelopes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text', 'bounds', 'optionIndex'],
          properties: {
            kind: {
              type: 'string',
              enum: [
                'QUESTION_STEM',
                'OPTION_GROUP',
                'OPTION',
                'SHARED_CONTEXT',
                'TABLE',
                'TEXT',
              ],
            },
            text: { type: 'string' },
            bounds: {
              type: 'object',
              additionalProperties: false,
              required: ['left', 'top', 'right', 'bottom'],
              properties: {
                left: { type: 'integer', minimum: 0, maximum: 1000 },
                top: { type: 'integer', minimum: 0, maximum: 1000 },
                right: { type: 'integer', minimum: 0, maximum: 1000 },
                bottom: { type: 'integer', minimum: 0, maximum: 1000 },
              },
            },
            optionIndex: { type: ['integer', 'null'], minimum: 0 },
          },
        },
      },
    },
  },
};

@Injectable()
export class PdfTranscriptionClient {
  private readonly config: AppConfig['ai'];
  constructor(config: ConfigService<AppConfig, true>) {
    this.config = config.get('ai', { infer: true });
  }

  async transcribeImage(
    image: Buffer,
    options: PdfTranscriptionRequestOptions = {},
  ): Promise<{ page: PdfTranscribedPage; raw: unknown; usage: unknown }> {
    const strict =
      options.mode === 'STRICT_RETRY' || options.mode === 'FALLBACK';
    const strictContract = strict
      ? ' Return exactly one JSON object with content (non-empty string), confidence (number 0..1), uncertainSpans (array; use []), warnings (array; use []), visualRegions (array; use []), and layoutEnvelopes (array; use []). Do not omit any field. Every visual/layout bounds object must contain integer left, top, right, and bottom values from 0 to 1000, with left < right and top < bottom. If a visual or layout item is uncertain, omit that item rather than returning malformed data.'
      : '';
    return this.request(
      image,
      `You are transcribing a high-resolution image of a visual Arabic exam document page. Preserve the RTL visual reading order, exact wording, punctuation, headings, page numbers, question numbering, and option layout (including columns). Transcribe all meaningful document text, including cover, index, instructions, answer forms, headers, and footers when they contain text. Also propose each instructional visual that should survive as a reusable crop: diagrams, charts, maps, tables, equations, photos, or image-based answer choices. Use normalized 0..1000 bounds relative to the rendered page. Return layoutEnvelopes for stems, option groups/options, bounded shared contexts, and tables; they are geometry evidence, not a second transcription. Do not propose logos, seals, watermarks, page decorations, or ordinary text. Never invent, normalize, solve, or silently repair text. For every unreadable fragment write [غير مقروء] in content and include that exact placeholder or unclear fragment in uncertainSpans.${strictContract}`,
      options,
    );
  }

  async verifyImage(
    image: Buffer,
    first: PdfTranscribedPage,
  ): Promise<{ page: PdfTranscribedPage; raw: unknown; usage: unknown }> {
    return this.request(
      image,
      `You are the independent verification pass for a visual Arabic exam document OCR result. Compare the image against the first attempt below, correct only discrepancies, and return the complete revised transcription and instructional visual proposals. Preserve all meaningful RTL content and layout, including headings, page numbers, question numbering, options, answer forms, headers, and footers. Propose diagrams, charts, maps, tables, equations, photos, and image-based answer choices using normalized 0..1000 bounds; exclude decorative elements. Never guess: render unreadable text as [غير مقروء] and list each unclear fragment in uncertainSpans.\n\nFIRST ATTEMPT:\n${first.content}`,
    );
  }

  private validBounds(value: any) {
    return (
      value &&
      ['left', 'top', 'right', 'bottom'].every(
        (key) =>
          Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 1000,
      ) &&
      value.left < value.right &&
      value.top < value.bottom
    );
  }
  private normalizedPage(value: any, raw: unknown): PdfTranscribedPage {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.content !== 'string' ||
      !value.content.trim() ||
      !Number.isFinite(value.confidence) ||
      value.confidence < 0 ||
      value.confidence > 1
    )
      throw new OpenRouterQuestionImportError(
        'OpenRouter returned invalid image transcription',
        {
          raw,
          validation:
            'content must be non-empty and confidence must be a number from 0 to 1',
        },
      );
    const warnings = Array.isArray(value.warnings)
      ? value.warnings.filter((item: any) => typeof item === 'string')
      : [];
    if (value.warnings != null && !Array.isArray(value.warnings))
      warnings.push(
        'OCR provider returned malformed page warnings; normalized to an empty list.',
      );
    const uncertainSpans = Array.isArray(value.uncertainSpans)
      ? value.uncertainSpans.filter((item: any) => typeof item === 'string')
      : [];
    if (value.uncertainSpans != null && !Array.isArray(value.uncertainSpans))
      warnings.push(
        'OCR provider returned malformed uncertain spans; normalized to an empty list.',
      );
    const visualRegions = (
      Array.isArray(value.visualRegions) ? value.visualRegions : []
    ).flatMap((item: any, index: number) => {
      if (
        !item ||
        ![
          'DIAGRAM',
          'CHART',
          'MAP',
          'TABLE',
          'EQUATION',
          'PHOTO',
          'OPTION_IMAGE',
          'OTHER_INSTRUCTIONAL',
        ].includes(item.type) ||
        !this.validBounds(item.bounds) ||
        !Number.isFinite(item.confidence) ||
        item.confidence < 0 ||
        item.confidence > 1 ||
        typeof item.description !== 'string'
      ) {
        warnings.push(`Dropped malformed visual region ${index + 1}.`);
        return [];
      }
      return [
        {
          type: item.type,
          bounds: item.bounds,
          confidence: item.confidence,
          description: item.description,
          warnings: Array.isArray(item.warnings)
            ? item.warnings.filter(
                (warning: any) => typeof warning === 'string',
              )
            : [],
        },
      ];
    });
    if (value.visualRegions != null && !Array.isArray(value.visualRegions))
      warnings.push(
        'OCR provider returned malformed visual regions; normalized to an empty list.',
      );
    const layoutEnvelopes = (
      Array.isArray(value.layoutEnvelopes) ? value.layoutEnvelopes : []
    ).flatMap((item: any, index: number) => {
      if (
        !item ||
        ![
          'QUESTION_STEM',
          'OPTION_GROUP',
          'OPTION',
          'SHARED_CONTEXT',
          'TABLE',
          'TEXT',
        ].includes(item.kind) ||
        typeof item.text !== 'string' ||
        !this.validBounds(item.bounds) ||
        !(
          item.optionIndex === null ||
          (Number.isInteger(item.optionIndex) && item.optionIndex >= 0)
        )
      ) {
        warnings.push(`Dropped malformed layout envelope ${index + 1}.`);
        return [];
      }
      return [
        {
          kind: item.kind,
          text: item.text,
          bounds: item.bounds,
          optionIndex: item.optionIndex,
        },
      ];
    });
    if (value.layoutEnvelopes != null && !Array.isArray(value.layoutEnvelopes))
      warnings.push(
        'OCR provider returned malformed layout envelopes; normalized to an empty list.',
      );
    return {
      content: value.content,
      confidence: value.confidence,
      uncertainSpans,
      warnings,
      visualRegions,
      layoutEnvelopes,
    };
  }
  private async request(
    image: Buffer,
    instruction: string,
    options: PdfTranscriptionRequestOptions = {},
  ): Promise<{ page: PdfTranscribedPage; raw: unknown; usage: unknown }> {
    if (!this.config.openRouterApiKey || !this.config.pdfTranscriptionModel)
      throw new ServiceUnavailableException(
        'PDF transcription is not configured',
      );
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.pdfTranscriptionTimeoutMs,
    );
    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.config.openRouterApiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model ?? this.config.pdfTranscriptionModel,
            provider: { require_parameters: true, data_collection: 'deny' },
            response_format: { type: 'json_schema', json_schema: pageSchema },
            messages: [
              { role: 'system', content: instruction },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Return the transcription JSON.' },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${image.toString('base64')}`,
                    },
                  },
                ],
              },
            ],
          }),
        },
      );
      const rawText = await response.text();
      let raw: any;
      try {
        raw = JSON.parse(rawText);
      } catch {
        throw new OpenRouterQuestionImportError(
          `OpenRouter returned a non-JSON response (${response.status})`,
          rawText.slice(0, 100000),
        );
      }
      if (!response.ok)
        throw new OpenRouterQuestionImportError(
          raw?.error?.message ?? 'OpenRouter image transcription failed',
          raw,
          raw?.usage ?? null,
        );
      const content = raw?.choices?.[0]?.message?.content;
      let parsed: any;
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        throw new OpenRouterQuestionImportError(
          'OpenRouter returned invalid transcription JSON',
          raw,
          raw?.usage ?? null,
        );
      }
      const page = this.normalizedPage(parsed, raw);
      return { page, raw, usage: raw.usage ?? null };
    } catch (error) {
      if (error instanceof OpenRouterQuestionImportError) throw error;
      if (error instanceof SyntaxError)
        throw new OpenRouterQuestionImportError(
          'OpenRouter returned invalid transcription JSON',
        );
      throw new OpenRouterQuestionImportError(
        'PDF transcription model request failed',
        { message: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
