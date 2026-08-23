# Platform reporting, export, retention, and deletion runbook

**Owner:** Operations and Finance

**Authorization:** `ADMIN` and `SUPER_ADMIN` only. All platform reports are
aggregate-only and non-PII. They never select learner names, contact details,
national IDs, payment proofs, provider payloads, or report contents into audit
logs. Each report read records its report type and normalized filters (never
the returned rows); Student 360 remains the separately authorized support
workflow.

## Common contract

- `from` and `to` are inclusive `YYYY-MM-DD` Cairo calendar dates. The query
  is converted to a half-open UTC interval `[Cairo start(from), Cairo
  start(to + 1 day))`; this handles DST correctly.
- An omitted range means all retained source history. Monetary values are EGP
  minor units. A product filter matches a purchased course or a chapter in the
  selected course/subject hierarchy.
- Empty reports return `data: []` (or the documented zero-valued summary) and
  never carry a prior period forward. Aggregate reports are not paginated:
  they only expose fixed, bounded group dimensions. They read live source
  records rather than a mutable financial rollup.
- CSV exports are an asynchronous, reproducible source-record snapshot. They
  use the normalized filters stored on the job and stop at 100,000 rows; narrow
  the range or dimensions when the limit is reached. XLSX is not approved.

## Approved catalogue

| Route / export type | Source record and Cairo date | Metrics | Supported filters |
| --- | --- | --- | --- |
| `GET /admin/reports/revenue` / `PLATFORM_REVENUE` (`/commerce` remains an alias) | `Order.approvedAt` | Order count, immutable subtotal, discount, and total grouped by order status, payment channel, and currency. Approved total is recognized revenue. | Date, subject/course/chapter, grade, governorate/center, payment channel/order status/payment-attempt status, campaign, coupon, referral code, referral partner. |
| `GET /admin/reports/refunds` / `REFUNDS` | `RefundRequest.requestedAt` | Requests by current status; approved complete-item count and reimbursed amount by currency. | Same commerce dimensions as revenue. |
| `GET /admin/reports/payments` / `PAYMENTS` | `PaymentAttempt.initiatedAt` | Attempt count by channel and latest attempt status. A retry is a separate attempt; this is not a count of paid orders. | Same commerce dimensions as revenue. |
| `GET /admin/reports/registrations` / `REGISTRATIONS` | `StudentProfile.createdAt` | Registration count by current grade, governorate, and center IDs. | Date, grade, governorate, center. |
| `GET /admin/reports/active-purchasers` / `ACTIVE_PURCHASERS` | `Order.approvedAt`, evaluated at report time | Distinct approved purchasers; distinct purchasers from that period with at least one effective active entitlement now. | Same commerce dimensions as revenue. |
| `GET /admin/reports/entitlements` / `ENTITLEMENT_LIFECYCLE` | Grant `createdAt`, revocation `revokedAt`, expiry `expiresAt` | Grants by source, revocation count, expiry count, and current effective active entitlement count. Expiry is an access-time condition, not a destructive state change. | Date, subject/course/chapter, grade, governorate, center. |
| `GET /admin/reports/partner-obligations` / existing partner ledger exports | Immutable `PartnerAllocation` / settlement records | Publisher/referral allocation, reversal, payable, and paid totals. | Date and partner. |

Filter values that a report cannot apply are rejected with HTTP 400 rather than
silently ignored. `promotionId` means the immutable campaign ID in an order
item's applied-promotion snapshot. `couponCode` is normalized to uppercase and
matches the order's coupon reservation. `referralCode` is normalized to
uppercase and matches immutable order referral attribution. `partnerUserId`
means the referral-program partner on that attribution; partner-ledger reports
match the allocation/settlement partner directly.

## Export policy

Request `POST /admin/reports/exports` with an approved report type, one or
more columns from that report's allowlist, and normalized filters. Finance
reports require the configured privileged-export reason. Each request,
download, cancellation, and artifact expiry writes an audit event with the job
ID, classification, filters/columns metadata, and actor—but never CSV rows.

Jobs are private object-store artifacts, watermarked with their classification,
requester, and job ID. A requester may download only their own job; a
`SUPER_ADMIN` may retrieve any job. The download route creates a protected URL
valid for at most 15 minutes; the artifact is deleted after 24 hours. There is
no public report URL.

The current report-specific allowlists are enforced in code. In particular,
the catalogue contains only dates, state/channel, hierarchy/geography IDs,
money, and aggregate counts. Adding learner/contact data requires a new
`PII_RESTRICTED` policy entry, privacy review, reason requirement, short
retention, and tests before it can be queued.

## Retention and deletion operations

| Data class | Minimum retention | Deletion procedure |
| --- | --- | --- |
| Financial orders, order-item price/promotion snapshots, receipts, payment attempts, refund records, allocations, settlements, and reconciliation evidence | Seven years from the relevant financial event | Do not delete or overwrite. Correct with a compensating refund/reversal/allocation and retain both records. After retention, Finance and Legal must approve a scoped, logged purge after confirming no tax, dispute, audit, or legal hold. |
| Admin audit events, including report-export lifecycle events | Seven years from event creation | Do not mutate. A retention worker may purge only a separately approved, date-bounded set after Legal confirms no hold; log the purge job's criteria and counts, never event contents. |
| Raw learner data (profiles, learning and assessment records) | The currently approved product privacy-policy schedule | Process access/correction/deletion requests through the privacy owner. Before deleting, identify dependent financial history and retain only the restricted financial references required above; delete or anonymize the learner data according to the approved policy and record the request/result in the audit trail. |
| Derived non-financial reports and rollups | No longer than their raw source, or the shorter approved privacy-policy period | Rebuild or delete with the corresponding raw-data deletion. Never preserve a derived learner cohort after its source is deleted/anonymized. |
| Private CSV artifacts | 24 hours | The export worker deletes the private object, clears its storage key, marks the job `EXPIRED`, and audits the expiry. Operators may cancel queued/processing jobs; never manually publish an artifact to satisfy an urgent request. |

### Deletion checklist

1. Verify the requester, authority, record scope, retention class, and legal
   hold status. Stop if the retention policy is ambiguous.
2. For learner data, enumerate financial/audit dependencies first; preserve
   mandated financial evidence and apply the approved anonymization/deletion
   method only to eligible personal/derived data.
3. Use a reviewed, date-bounded job. Record actor, approval reference, query
   criteria, start/end timestamps, and counts in an audit event; do not store
   deleted report or learner contents in logs.
4. Verify that financial reconciliation still balances and that the report
   export cleanup worker has removed expired objects. Escalate discrepancies to
   Finance, Privacy, and Engineering before closing the request.
