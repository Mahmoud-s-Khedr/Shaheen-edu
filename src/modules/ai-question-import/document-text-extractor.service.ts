import { BadRequestException, Injectable } from '@nestjs/common';
import mammoth from 'mammoth';

export interface ExtractedText { text: string; metadata: Record<string, unknown>; }

@Injectable()
export class DocumentTextExtractor {
  async extract(input: { mimeType: string; filename: string; buffer: Buffer }): Promise<ExtractedText> {
    if (input.mimeType === 'text/plain') return this.raw(input.buffer.toString('utf8'), { format: 'TXT' });
    if (input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: input.buffer });
      return this.raw(result.value, { format: 'DOCX', warnings: result.messages.map((message) => message.message) });
    }
    if (input.mimeType === 'application/pdf') return this.pdf(input.buffer);
    throw new BadRequestException('Question imports support TXT, DOCX, and text-based PDF assets only');
  }

  private raw(value: string, metadata: Record<string, unknown>): ExtractedText {
    const text = this.normalize(value);
    this.assertQuality(text);
    return { text, metadata: { ...metadata, characterCount: text.length } };
  }

  private async pdf(buffer: Buffer): Promise<ExtractedText> {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false }).promise;
    const pages: Array<{ page: number; text: string }> = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items.map((item: any) => item.str).join(' ');
      pages.push({ page, text: this.normalize(text) });
    }
    const text = pages.map((page) => `\n\n[Page ${page.page}]\n${page.text}`).join('').trim();
    this.assertQuality(text);
    return { text, metadata: { format: 'PDF', pages: pages.map((page) => ({ page: page.page, characterCount: page.text.length })), characterCount: text.length } };
  }

  private normalize(value: string): string { return value.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
  private assertQuality(text: string) {
    if (text.length < 20) throw new BadRequestException('Text extraction produced too little readable text; use DOCX or paste the source text');
    const printable = [...text].filter((character) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(character)).length;
    if (printable / text.length < 0.95) throw new BadRequestException('Text extraction quality is too low; use DOCX or paste the source text');
  }
}
