# Publisher usage rollups

`PublisherUsageDailyRollup` is a rebuildable reporting accelerator. It is
derived from frozen `AssessmentQuestionAttribution`, frozen assessment
placements, `AssessmentAttempt`, and `AssessmentAttemptAnswer`. These source
rows remain the audit record. Publisher earnings remain derived exclusively
from immutable `PartnerAllocation` and settlement rows.

## Freshness and correction

- The application refreshes the current Cairo day and the preceding two Cairo
  days at minute 17 of every hour. This is the correction window for late
  grading and answer updates.
- Administrators can rebuild an inclusive Cairo-date range through
  `POST /api/v1/admin/partner-finance/usage-rollups/rebuild`. It is limited to
  367 days and can be scoped to one publisher. Every manual rebuild is audited.
- A rebuild deletes and regenerates only the derived rollup and pseudonymous
  solver-presence rows in that range. It never updates assessment attribution,
  attempts, answers, allocations, or settlements.
- `inputUpdatedAt` identifies the latest attempt/answer input incorporated by
  each row; `calculatedAt` identifies when that row was rebuilt.

## Retention and privacy

- There is currently no automatic deletion of either raw assessment activity
  or publisher usage rollups. Derived rows must not be deleted independently
  of their raw audit source; any future retention policy requires an approved
  privacy migration that applies consistently to both.
- `PublisherUsageDailySolver` keeps only a domain-separated HMAC fingerprint
  internally so long-range distinct-solver counts can be exact. It contains no
  learner ID and is never selected by a partner-facing endpoint.
- Partner APIs return aggregates only. They must not expose a learner ID,
  fingerprint, attempt, answer text, raw order, or order-item record.

## Drill-down and reconciliation

- `ALL` rollup rows are the canonical non-duplicated publisher/source totals.
  Direct subject, course, chapter, lesson, and section rows support a selected
  frozen hierarchy scope. A report must not sum sibling scope rows to recreate
  an `ALL` total.
- For a representative fixture, compare the raw frozen-attribution aggregation
  for a Cairo date range to the corresponding daily rollup rows. Rebuild first
  if the range overlaps the late-grading correction window.
- Finance reconciliation uses allocations and settlement lines, not usage
  rows. Usage can explain engagement, but it never changes an earning.
