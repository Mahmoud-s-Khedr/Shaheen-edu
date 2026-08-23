# Partner-finance staging pilot runbook

This concise staging checklist is governed by the fuller
[Phase 0 operational pilot runbook](phase-0-operational-pilot.md). Use its
signed-record template for every completed pilot.

Before enabling a pilot, deploy the ledger cutover migration, run `pnpm prisma:generate`, and confirm that the active refund policy has been reviewed by a staging administrator. The development seed creates 7 days / 1,000 BPS only as a bootstrap; do not treat it as an approved staging policy.

Keep partner-ledger rollout allow-lists limited to the pilot publishers. Create one controlled manual-payment purchase and one Paymob sandbox purchase. For each, retain the order ID, payment-attempt/provider reference, receipt reference, entitlement ID, allocation IDs, and any settlement or refund references.

Create a reconciliation run with exactly those approved order IDs under `POST /v1/admin/partner-finance/reconciliation-runs`, then execute it with `POST /v1/admin/partner-finance/reconciliation-runs/{id}/run`. Review payment approval, receipt, entitlement, publisher/referral allocation, refund reversal, and settlement findings. Assign every finding, then resolve it or explicitly accept it with an evidence-backed note.

Finance and engineering must record sign-off against the completed run ID
before expanding an allow-list. Retain the API responses, audit-log entries,
payment evidence, reconciliation summary, provider-settlement comparison, and
sign-off in the release record. A discrepancy marked `ACCEPTED` is not an
unexplained variance waiver for Phase 0: every `ERROR` must be resolved with
evidence before rollout expansion.

To roll back, disable the partner-ledger allow-list/feature before routing further pilot traffic. Do not delete allocations, settlements, or reconciliation evidence: ledger rows are immutable audit records. Investigate and correct future operational actions with compensating rows only.
