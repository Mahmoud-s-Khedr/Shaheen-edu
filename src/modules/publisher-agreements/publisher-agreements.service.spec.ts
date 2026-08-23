import { PublisherAgreementsService } from './publisher-agreements.service';
import { PublisherAgreementStatus, Role } from '../../common/types/roles.enum';

describe('PublisherAgreementsService replacement', () => {
  it('ends the predecessor and creates an active successor version atomically', async () => {
    const prior: any = { id: 'agreement-1', publisherUserId: 'publisher-1', courseId: 'course-1', chapterId: null, lessonId: null, startsAt: new Date('2026-01-01'), endsAt: null, status: PublisherAgreementStatus.ACTIVE, version: 2, isPrimary: true, payoutKind: 'PERCENTAGE', revenueShareBps: 2000, fixedPayoutMinor: null, currency: 'EGP' };
    const tx: any = { publisherAgreement: { update: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'agreement-2' }) } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)), partnerProfile: { findUnique: jest.fn().mockResolvedValue({ partnerType: 'CONTENT_PUBLISHER' }) }, course: { findUnique: jest.fn().mockResolvedValue({ id: 'course-1' }) } };
    const service = new PublisherAgreementsService(prisma, { record: jest.fn() } as any);
    jest.spyOn(service, 'getOrThrow').mockResolvedValueOnce(prior).mockResolvedValueOnce({ ...prior, id: 'agreement-2', version: 3 } as any);
    await service.replace({ id: 'admin-1', role: Role.ADMIN } as any, 'agreement-1', { publisherUserId: 'publisher-1', courseId: 'course-1', startsAt: new Date('2026-02-01'), payoutKind: 'PERCENTAGE' as any, revenueShareBps: 2500, activateImmediately: true });
    expect(tx.publisherAgreement.update).toHaveBeenCalledWith({ where: { id: 'agreement-1' }, data: { status: PublisherAgreementStatus.ENDED, endsAt: new Date('2026-02-01') } });
    expect(tx.publisherAgreement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ supersedesId: 'agreement-1', version: 3, status: PublisherAgreementStatus.ACTIVE }) }));
  });
});
