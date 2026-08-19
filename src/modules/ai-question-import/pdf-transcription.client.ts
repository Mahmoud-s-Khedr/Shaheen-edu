import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { OpenRouterQuestionImportError } from './openrouter-question-import.client';

export type PdfVisualType = 'DIAGRAM' | 'CHART' | 'MAP' | 'TABLE' | 'EQUATION' | 'PHOTO' | 'OPTION_IMAGE' | 'OTHER_INSTRUCTIONAL';
export interface PdfVisualRegion {
  type: PdfVisualType;
  bounds: { left: number; top: number; right: number; bottom: number };
  confidence: number;
  description: string;
  warnings: string[];
}
export interface PdfTranscribedPage { content: string; confidence: number; uncertainSpans: string[]; warnings: string[]; visualRegions: PdfVisualRegion[]; }
const pageSchema = {
  name: 'visual_arabic_exam_page_transcription_v1', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['content', 'confidence', 'uncertainSpans', 'warnings', 'visualRegions'], properties: {
    content: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 },
    uncertainSpans: { type: 'array', items: { type: 'string' } }, warnings: { type: 'array', items: { type: 'string' } },
    visualRegions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'bounds', 'confidence', 'description', 'warnings'], properties: {
      type: { type: 'string', enum: ['DIAGRAM', 'CHART', 'MAP', 'TABLE', 'EQUATION', 'PHOTO', 'OPTION_IMAGE', 'OTHER_INSTRUCTIONAL'] },
      bounds: { type: 'object', additionalProperties: false, required: ['left', 'top', 'right', 'bottom'], properties: { left: { type: 'integer', minimum: 0, maximum: 1000 }, top: { type: 'integer', minimum: 0, maximum: 1000 }, right: { type: 'integer', minimum: 0, maximum: 1000 }, bottom: { type: 'integer', minimum: 0, maximum: 1000 } } },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, description: { type: 'string' }, warnings: { type: 'array', items: { type: 'string' } },
    } } },
  } },
};

@Injectable()
export class PdfTranscriptionClient {
  private readonly config: AppConfig['ai'];
  constructor(config: ConfigService<AppConfig, true>) { this.config = config.get('ai', { infer: true }); }

  async transcribeImage(image: Buffer): Promise<{ page: PdfTranscribedPage; raw: unknown; usage: unknown }> {
    return this.request(image, `You are transcribing a high-resolution image of a visual Arabic exam document page. Preserve the RTL visual reading order, exact wording, punctuation, headings, page numbers, question numbering, and option layout (including columns). Transcribe all meaningful document text, including cover, index, instructions, answer forms, headers, and footers when they contain text. Also propose each instructional visual that should survive as a reusable crop: diagrams, charts, maps, tables, equations, photos, or image-based answer choices. Use normalized 0..1000 bounds relative to the rendered page. Do not propose logos, seals, watermarks, page decorations, or ordinary text. Never invent, normalize, solve, or silently repair text. For every unreadable fragment write [غير مقروء] in content and include that exact placeholder or unclear fragment in uncertainSpans.`);
  }

  async verifyImage(image: Buffer, first: PdfTranscribedPage): Promise<{ page: PdfTranscribedPage; raw: unknown; usage: unknown }> {
    return this.request(image, `You are the independent verification pass for a visual Arabic exam document OCR result. Compare the image against the first attempt below, correct only discrepancies, and return the complete revised transcription and instructional visual proposals. Preserve all meaningful RTL content and layout, including headings, page numbers, question numbering, options, answer forms, headers, and footers. Propose diagrams, charts, maps, tables, equations, photos, and image-based answer choices using normalized 0..1000 bounds; exclude decorative elements. Never guess: render unreadable text as [غير مقروء] and list each unclear fragment in uncertainSpans.\n\nFIRST ATTEMPT:\n${first.content}`);
  }

  private async request(image: Buffer, instruction: string): Promise<{ page: PdfTranscribedPage; raw: unknown; usage: unknown }> {
    if (!this.config.openRouterApiKey || !this.config.pdfTranscriptionModel) throw new ServiceUnavailableException('PDF transcription is not configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.pdfTranscriptionTimeoutMs);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${this.config.openRouterApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.config.pdfTranscriptionModel, provider: { require_parameters: true, data_collection: 'deny' }, response_format: { type: 'json_schema', json_schema: pageSchema }, messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: [{ type: 'text', text: 'Return the transcription JSON.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } }] },
        ] }),
      });
      const rawText = await response.text(); let raw: any;
      try { raw = JSON.parse(rawText); } catch { throw new OpenRouterQuestionImportError(`OpenRouter returned a non-JSON response (${response.status})`, rawText.slice(0, 100000)); }
      if (!response.ok) throw new OpenRouterQuestionImportError(raw?.error?.message ?? 'OpenRouter image transcription failed', raw, raw?.usage ?? null);
      const content = raw?.choices?.[0]?.message?.content;
      const page = typeof content === 'string' ? JSON.parse(content) : content;
      if (!page || typeof page.content !== 'string' || !Array.isArray(page.uncertainSpans) || !Array.isArray(page.warnings) || !Array.isArray(page.visualRegions)) throw new OpenRouterQuestionImportError('OpenRouter returned invalid image transcription', raw, raw?.usage ?? null);
      return { page, raw, usage: raw.usage ?? null };
    } catch (error) {
      if (error instanceof OpenRouterQuestionImportError) throw error;
      if (error instanceof SyntaxError) throw new OpenRouterQuestionImportError('OpenRouter returned invalid transcription JSON');
      throw new OpenRouterQuestionImportError('PDF transcription model request failed');
    } finally { clearTimeout(timer); }
  }
}
