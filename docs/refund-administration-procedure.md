# Refund administration procedure

Administrators manage the active policy at `GET` / `PATCH /v1/admin/refunds/policy`. A policy update creates a new version; existing requests keep their eligibility snapshot. Review the requested eligibility window and consumption BPS with finance before activating it.

For an eligible pending request, reimburse the student off-platform first. Approve only after a durable external reference is available (for example, `BANK-YYYYMMDD-reference` or the provider transfer ID), and record that reference in the approval request. Approval revokes the linked entitlement and creates signed compensating negative partner allocations atomically. The original allocation is retained as `REVERSED` audit history and must not be totalled a second time.

Reject requests with a clear student-facing reason and optional internal review note. After approval, verify the entitlement revocation, the negative allocation linked to every original allocation, and, when applicable, the reconciliation result. Escalate missing payment evidence, a missing reversal, a paid settlement affected by a refund, or duplicate allocation rows to finance and engineering; preserve references and audit IDs.

