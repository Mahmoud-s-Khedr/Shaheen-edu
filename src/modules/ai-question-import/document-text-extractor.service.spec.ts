import { BadRequestException } from '@nestjs/common';
import { DocumentTextExtractor } from './document-text-extractor.service';

describe('DocumentTextExtractor', () => {
  const service = new DocumentTextExtractor();

  it('normalizes pasted UTF-8 text', async () => {
    await expect(
      service.extract({
        mimeType: 'text/plain',
        filename: 'questions.txt',
        buffer: Buffer.from('  ١. ما الإجابة؟\r\n\r\n  أ. صحيحة  '),
      }),
    ).resolves.toMatchObject({
      text: '١. ما الإجابة؟\n\n أ. صحيحة',
      metadata: { format: 'TXT' },
    });
  });

  it('rejects unusable extraction output', async () => {
    await expect(
      service.extract({
        mimeType: 'text/plain',
        filename: 'empty.txt',
        buffer: Buffer.from('short'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects DOCX question-import input with a PDF conversion instruction', async () => {
    await expect(
      service.extract({
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'questions.docx',
        buffer: Buffer.from('not used'),
      }),
    ).rejects.toThrow('Export DOCX files to PDF first');
  });

  it('reconstructs separately addressable PDF lines from positioned fragments', () => {
    const lines = (service as any).pdfLines([
      { str: 'Second', transform: [1, 0, 0, 1, 10, 80], dir: 'ltr' },
      { str: 'line', transform: [1, 0, 0, 1, 60, 80], dir: 'ltr' },
      { str: 'First', transform: [1, 0, 0, 1, 10, 100], dir: 'ltr' },
      { str: 'line', transform: [1, 0, 0, 1, 50, 100], dir: 'ltr' },
    ]);
    expect(lines).toEqual(['First line', 'Second line']);
  });
});
