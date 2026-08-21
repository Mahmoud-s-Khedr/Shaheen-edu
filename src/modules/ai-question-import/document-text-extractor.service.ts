import { BadRequestException, Injectable } from '@nestjs/common';

export interface ExtractedText {
  text: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class DocumentTextExtractor {
  async extract(input: {
    mimeType: string;
    filename: string;
    buffer: Buffer;
  }): Promise<ExtractedText> {
    if (input.mimeType === 'text/plain')
      return this.raw(input.buffer.toString('utf8'), { format: 'TXT' });
    if (input.mimeType === 'application/pdf') return this.pdf(input.buffer);
    throw new BadRequestException(
      'Question imports support TXT and PDF assets only. Export DOCX files to PDF first.',
    );
  }

  private raw(value: string, metadata: Record<string, unknown>): ExtractedText {
    const text = this.normalize(value);
    this.assertQuality(text);
    return { text, metadata: { ...metadata, characterCount: text.length } };
  }

  private async pdf(buffer: Buffer): Promise<ExtractedText> {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;
    const pages: Array<{ page: number; lines: string[] }> = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await (await document.getPage(page)).getTextContent();
      pages.push({ page, lines: this.pdfLines(content.items) });
    }
    const text = pages
      .map((page) => `\n\n[Page ${page.page}]\n${page.lines.join('\n')}`)
      .join('')
      .trim();
    this.assertQuality(text);
    return {
      text,
      metadata: {
        format: 'PDF',
        pages: pages.map((page) => ({
          page: page.page,
          lineCount: page.lines.length,
          characterCount: page.lines.join('\n').length,
        })),
        characterCount: text.length,
      },
    };
  }

  /** Reconstruct visual lines so boundary detection can address individual questions. */
  private pdfLines(items: any[]): string[] {
    const fragments = items
      .filter((item) => typeof item.str === 'string' && item.str.trim())
      .map((item, index) => ({
        text: item.str.trim(),
        x: Number(item.transform?.[4] ?? index),
        y: Number(item.transform?.[5] ?? -index),
        dir: item.dir,
        index,
      }));
    const rows: Array<typeof fragments> = [];
    for (const fragment of [...fragments].sort(
      (a, b) => b.y - a.y || a.index - b.index,
    )) {
      const row = rows.find(
        (candidate) => Math.abs(candidate[0].y - fragment.y) <= 2,
      );
      if (row) row.push(fragment);
      else rows.push([fragment]);
    }
    return rows
      .map((row) => {
        const rtl =
          row.filter((fragment) => fragment.dir === 'rtl').length >
          row.length / 2;
        return this.normalize(
          row
            .sort((a, b) => (rtl ? b.x - a.x : a.x - b.x || a.index - b.index))
            .map((fragment) => fragment.text)
            .join(' '),
        );
      })
      .filter(Boolean);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  private assertQuality(text: string) {
    if (text.length < 20)
      throw new BadRequestException(
        'Text extraction produced too little readable text; export the source to PDF or paste the text',
      );
    const printable = [...text].filter(
      (character) =>
        !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(character),
    ).length;
    if (printable / text.length < 0.95)
      throw new BadRequestException(
        'Text extraction quality is too low; export the source to PDF or paste the text',
      );
  }
}
