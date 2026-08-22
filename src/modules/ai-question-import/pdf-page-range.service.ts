import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const processOptions = { maxBuffer: 1024 * 1024, timeout: 60_000 } as const;

@Injectable()
export class PdfPageRangeService {
  async pageCount(pdf: Buffer): Promise<number> {
    return this.withPdf(pdf, async (input) => {
      const { stdout } = await execFileAsync(
        'pdfinfo',
        [input],
        processOptions,
      );
      const match = /^Pages:\s+(\d+)$/m.exec(stdout);
      if (!match || Number(match[1]) < 1)
        throw new Error('Unable to determine PDF page count');
      return Number(match[1]);
    });
  }

  /**
   * Uses Poppler rather than pdf-lib: malformed PDFs can have pages that
   * pdf-lib silently omits, while Poppler preserves the physical page count.
   */
  async extract(
    pdf: Buffer,
    firstPage: number,
    lastPage: number,
  ): Promise<Buffer> {
    if (
      !Number.isInteger(firstPage) ||
      !Number.isInteger(lastPage) ||
      firstPage < 1 ||
      lastPage < firstPage
    )
      throw new Error('Invalid PDF page range');
    return this.withPdf(pdf, async (input, directory) => {
      const total = await this.pageCountFromFile(input);
      if (lastPage > total) throw new Error('Invalid PDF page range');
      const pagePattern = join(directory, 'page-%d.pdf');
      const output = join(directory, 'range.pdf');
      await execFileAsync(
        'pdfseparate',
        ['-f', String(firstPage), '-l', String(lastPage), input, pagePattern],
        processOptions,
      );
      const pages = Array.from(
        { length: lastPage - firstPage + 1 },
        (_, index) => join(directory, `page-${firstPage + index}.pdf`),
      );
      await execFileAsync('pdfunite', [...pages, output], processOptions);
      const outputPages = await this.pageCountFromFile(output);
      if (outputPages !== pages.length)
        throw new Error('PDF range output omitted pages');
      return readFile(output);
    });
  }

  /** Render one physical PDF page for vision OCR.  PNG keeps Arabic glyph edges
   * and RTL/multi-column layout intact better than parser-produced text. */
  async renderPage(
    pdf: Buffer,
    pageNumber: number,
    dpi = 350,
  ): Promise<Buffer> {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(dpi) ||
      dpi < 72
    )
      throw new Error('Invalid PDF render request');
    return this.withPdf(pdf, async (input, directory) => {
      const total = await this.pageCountFromFile(input);
      if (pageNumber > total) throw new Error('Invalid PDF page number');
      const prefix = join(directory, 'rendered-page');
      await execFileAsync(
        'pdftoppm',
        [
          '-png',
          '-r',
          String(dpi),
          '-f',
          String(pageNumber),
          '-l',
          String(pageNumber),
          '-singlefile',
          input,
          prefix,
        ],
        processOptions,
      );
      return readFile(`${prefix}.png`);
    });
  }

  private async withPdf<T>(
    pdf: Buffer,
    callback: (input: string, directory: string) => Promise<T>,
  ): Promise<T> {
    const directory = await mkdtemp(join(tmpdir(), 'question-import-pdf-'));
    try {
      const input = join(directory, 'source.pdf');
      await writeFile(input, pdf);
      return await callback(input, directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async pageCountFromFile(file: string): Promise<number> {
    const { stdout } = await execFileAsync('pdfinfo', [file], processOptions);
    const match = /^Pages:\s+(\d+)$/m.exec(stdout);
    if (!match || Number(match[1]) < 1)
      throw new Error('Unable to determine PDF page count');
    return Number(match[1]);
  }
}
