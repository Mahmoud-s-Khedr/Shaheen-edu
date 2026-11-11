import type {
  PurchaseEligibilityDto,
  PurchaseRewardPolicyDto,
  SaveStudentRewardsSettingsDto,
} from './dto/student-rewards.dto';
export const DEFAULT_REWARDS_SETTINGS: SaveStudentRewardsSettingsDto = {
  credit: {
    enabled: false,
    maximumUsageBps: 10000,
    maximumUsageMinor: null,
    expiryDays: null,
    targetTypes: ['COURSE', 'CHAPTER', 'BUNDLE'],
    excludedTargets: [],
  },
  firstPurchase: {
    enabled: false,
    minimumPaymentMinor: 1,
    rewardMinor: 0,
    startsAt: null,
    endsAt: null,
    targetTypes: ['COURSE', 'CHAPTER', 'BUNDLE'],
    excludedTargets: [],
  },
  referral: {
    enabled: false,
    minimumPaymentMinor: 1,
    rewardMinor: 0,
    invitedRewardMinor: 0,
    startsAt: null,
    endsAt: null,
    targetTypes: ['COURSE', 'CHAPTER', 'BUNDLE'],
    excludedTargets: [],
    rewardLimit: null,
    perReferrerLimit: null,
  },
};
export function activePolicy(policy: PurchaseRewardPolicyDto, at: Date) {
  return (
    policy.enabled &&
    (!policy.startsAt || new Date(policy.startsAt) <= at) &&
    (!policy.endsAt || new Date(policy.endsAt) > at)
  );
}
export function eligibleTarget(
  policy: PurchaseEligibilityDto,
  item: {
    targetType: string;
    salesOfferPurchaseId?: string | null;
    salesOfferId?: string;
    courseId?: string | null;
    chapterId?: string | null;
  },
) {
  const type = item.salesOfferPurchaseId ? 'BUNDLE' : item.targetType;
  const id =
    type === 'BUNDLE' ? item.salesOfferId : (item.courseId ?? item.chapterId);
  return (
    policy.targetTypes.includes(type) &&
    !policy.excludedTargets.includes(`${type}:${id}`)
  );
}
