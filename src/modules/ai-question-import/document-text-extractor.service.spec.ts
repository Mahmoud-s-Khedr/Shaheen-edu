import { BadRequestException } from '@nestjs/common';
import { DocumentTextExtractor } from './document-text-extractor.service';

describe('DocumentTextExtractor', () => {
  const service = new DocumentTextExtractor();

  it('normalizes pasted UTF-8 text', async () => {
    await expect(service.extract({ mimeType: 'text/plain', filename: 'questions.txt', buffer: Buffer.from('  ١. ما الإجابة؟\r\n\r\n  أ. صحيحة  ') })).resolves.toMatchObject({ text: '١. ما الإجابة؟\n\n أ. صحيحة', metadata: { format: 'TXT' } });
  });

  it('rejects unusable extraction output', async () => {
    await expect(service.extract({ mimeType: 'text/plain', filename: 'empty.txt', buffer: Buffer.from('short') })).rejects.toBeInstanceOf(BadRequestException);
  });
});
