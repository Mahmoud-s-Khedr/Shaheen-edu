# Refund administration procedure

For the controlled-pilot sequence, owners, and signed evidence requirements,
use the [Phase 0 operational pilot runbook](phase-0-operational-pilot.md).

Administrators manage the active policy at `GET` / `PATCH /v1/admin/refunds/policy`. A policy update creates a new version; existing requests keep their eligibility snapshot. Review the requested eligibility window and consumption BPS with finance before activating it.

For an eligible pending request, reimburse the student off-platform first.
Approve only after a durable external reference is available (for example,
`BANK-YYYYMMDD-reference` or the provider transfer ID), and record that
reference in the approval request. Never record card, wallet, or bank-account
details in this field. Approval revokes the linked entitlement and creates
signed compensating negative partner allocations atomically. The original
allocation is retained as `REVERSED` audit history and must not be totalled a
second time.

A request can select one or more complete approved order items. This supports
a partial *order* refund, but never a fractional refund of one course or
chapter item. Provider refunds/voids are intentionally not part of this flow:
the reimbursement is manual and the Paymob transaction remains payment
evidence only.

Reject requests with a clear student-facing reason and optional internal review note. After approval, verify the entitlement revocation, the negative allocation linked to every original allocation, and, when applicable, the reconciliation result. Escalate missing payment evidence, a missing reversal, a paid settlement affected by a refund, or duplicate allocation rows to finance and engineering; preserve references and audit IDs.
