import { AccessType, CommerceTargetType } from '../../common/types/roles.enum';

/** The standalone commerce price, or null when this content cannot be sold. */
export function purchasablePrice(
  type: 'COURSE' | 'CHAPTER',
  content: {
    accessType: string;
    isPurchasable: boolean | null;
    currency: string | null;
    priceMinor: number | null;
  },
): number | null {
  if (
    type === CommerceTargetType.COURSE &&
    content.accessType === AccessType.FREE
  )
    return 0;
  if (
    type === CommerceTargetType.CHAPTER &&
    content.accessType === AccessType.INHERIT
  )
    return null;
  return content.isPurchasable &&
    content.currency === 'EGP' &&
    content.priceMinor !== null
    ? content.priceMinor
    : null;
}
