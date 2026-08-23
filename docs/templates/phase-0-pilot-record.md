# Phase 0 pilot record

Copy this template into the approved release-record system for each sandbox or
live pilot. Do not commit completed records containing learner, payment, or
bank data to this repository.

## Identification

| Field | Value |
| --- | --- |
| Environment | _sandbox / live_ |
| Pilot label | _Required_ |
| Date range (Cairo) | _Required_ |
| Release/deployment reference | _Required_ |
| Reconciliation run ID | _Required_ |
| Finance approver | _Name, timestamp, signature/reference_ |
| Engineering approver | _Name, timestamp, signature/reference_ |
| Incident commander | _Name and contact route_ |
| Rollback operator | _Name and contact route_ |

## Refund policy and administrator training

| Field | Value |
| --- | --- |
| Active refund policy ID / version | _Required_ |
| Eligibility window (days) | _Required_ |
| Maximum consumption (BPS) | _Required_ |
| Finance review reference | _Required_ |
| Whole-order-item / no-fractional-refund training completed | _Names and audit-event or training reference_ |
| Off-platform reimbursement-reference training completed | _Names and audit-event or training reference_ |

## Purchase, refund, and ledger evidence

| Check | Reference and result |
| --- | --- |
| Approved pilot order IDs and intended channel | _Required; IDs only_ |
| Receipt references | _Required_ |
| Entitlement IDs before/after refund | _Required; IDs/statuses only_ |
| Publisher agreement/version and allocation IDs | _Required where applicable_ |
| Referral program/rule/code and allocation IDs | _Required where applicable_ |
| Settlement ID/state or explicit not-settled result | _Required_ |
| Refunded complete order-item ID | _Required_ |
| Off-platform reimbursement reference | _Required; redact sensitive details_ |
| Original and compensating allocation IDs | _Required where applicable_ |
| Reconciliation summary / discrepancy count | _Required_ |
| Every discrepancy resolution reference | _Required; no open, assigned, or accepted error remains_ |

## Paymob acceptance evidence

| Scenario | Sandbox evidence | Live evidence | Result |
| --- | --- | --- | --- |
| Callback reachability | _Required_ | _Required_ | _Pass/fail_ |
| Genuine HMAC | _Required_ | _Required_ | _Pass/fail_ |
| Invalid HMAC is rejected | _Required_ | _Required where safely testable_ | _Pass/fail_ |
| Duplicate callback is idempotent | _Required_ | _Required_ | _Pass/fail_ |
| Decline/cancellation/retry/timeout | _Required_ | _Required_ | _Pass/fail_ |
| Expiry and delayed callback | _Required_ | _Required_ | _Pass/fail_ |
| Provider transaction ID ↔ local attempt/receipt | _Required; IDs only_ | _Required; IDs only_ | _Pass/fail_ |
| Provider settlement comparison (gross, fee, net, currency, date) | _Required; redacted reference_ | _Required; redacted reference_ | _Pass/fail_ |

## Rollback readiness and decision

| Field | Value |
| --- | --- |
| Feature flags / allow-list state before and after pilot | _Required; no broadening until approval_ |
| Rollback command/location tested | _Required_ |
| Incident escalation route tested | _Required_ |
| Outstanding discrepancies or risks | _None, or blocks release_ |
| Finance decision | _Approve / reject; signature/reference_ |
| Engineering decision | _Approve / reject; signature/reference_ |
| Allow-list widening decision | _Keep narrow / explicitly approved scope_ |
