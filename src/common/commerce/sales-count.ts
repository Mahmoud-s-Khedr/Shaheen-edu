import type { Prisma } from '@prisma/client';

// Credit-funded purchases still have a positive item price. Free purchases and
// bundle components are excluded from direct course/chapter sales.
export const directSaleWhere = {
  order: { status: 'APPROVED' },
  salesOfferPurchaseId: null,
  priceMinor: { gt: 0 },
  NOT: {
    refundRequestItem: { refundRequest: { status: 'APPROVED' } },
  },
} satisfies Prisma.OrderItemWhereInput;

export const bundleSaleWhere = {
  order: { status: 'APPROVED' },
  items: {
    some: { priceMinor: { gt: 0 } },
    none: { refundRequestItem: { refundRequest: { status: 'APPROVED' } } },
  },
} satisfies Prisma.SalesOfferPurchaseWhereInput;
