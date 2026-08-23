# Phase 0 operational baseline and controlled pilot

This is the execution runbook for Phase 0 of the
[administration and partner expansion plan](administration-and-partner-expansion-plan.md).
It supplements the [refund administration procedure](refund-administration-procedure.md),
[partner-finance staging pilot runbook](partner-finance-staging-runbook.md), and
[Paymob integration guide](paymob-integration-guide.md).

Phase 0 is not complete merely because the API and migrations are deployed.
It closes only after the designated finance and engineering owners have run and
signed the real-environment evidence described here. Do not store Paymob keys,
full webhook payloads, card data, student PII, or bank-account details in the
pilot record.

## Release boundary and owners

Before the first pilot transaction, record the following in the release ticket
or the signed pilot record template. Names must be individual accountable
people, not a team name or a shared inbox.

| Responsibility | Named owner | Required decision |
| --- | --- | --- |
| Finance approver | _Unassigned_ | Approves the refund terms, reimbursement evidence, allocation and provider-settlement comparison. |
| Engineering approver | _Unassigned_ | Approves callback reachability, HMAC evidence, reconciliation output, and rollback readiness. |
| Incident commander | _Unassigned_ | Owns customer/finance escalation and the decision to halt the pilot. |
| Rollback operator | _Unassigned_ | Has deployment/configuration access to disable pilot traffic immediately. |
| Paymob merchant contact | _Unassigned_ | Can inspect merchant transactions and settlement evidence. |

Keep `FEATURE_REFERRALS_ENABLED`, `FEATURE_PARTNER_LEDGER_ENABLED`, and their
allow-lists at their approved pilot scope. In particular, do not widen a
partner or student allow-list because a transaction appears successful in the
browser: the verified server callback and the completed reconciliation run are
the evidence of approval.

## Set the active refund policy and train administrators

Finance must choose and approve the production values; the development seed's
seven-day / 1,000-BPS policy is bootstrap data only. An administrator must
read the current policy before activating a replacement:

```text
GET /api/v1/admin/refunds/policy
PATCH /api/v1/admin/refunds/policy
```

The `PATCH` body is:

```json
{
  "eligibilityWindowDays": 14,
  "maximumConsumptionBps": 1000
}
```

The numbers are format examples only; replace both with finance-approved
integer values before sending the request. Record the returned policy ID,
version, values, review date, and finance approver in the pilot record. A
replacement creates a new policy version; requests retain their original
eligibility snapshot.

Train each refund administrator on this non-negotiable scope:

- A refund request selects complete approved `OrderItem` records only.
  A multi-item order can therefore be partially refunded by selecting one or
  more complete items, but a course or chapter item cannot be fractionally
  refunded.
- Reimburse off-platform before approval. Approval requires a durable,
  non-sensitive reimbursement reference, such as a bank-transfer or support
  case reference; never put card or bank-account details in the reference.
- Submit that reference in `POST /api/v1/admin/refunds/{id}/approve`.
  Approval revokes only the selected items' entitlements and creates
  compensating negative allocation rows. It does not issue a Paymob refund.
- Reject a request with a student-facing reason when reimbursement has not
  occurred or the request is not approved. Escalate a refund that affects a
  paid partner settlement before taking action; the reconciliation will flag
  that state for finance resolution.

Have every trainee approve a non-production test request and retain the audit
event ID. Training is complete only when the trainee can identify the policy
snapshot, reimbursement reference, revoked entitlement, original allocation,
and compensating reversal.

## Controlled purchase and refund pilot

Use a dedicated pilot student and deliberately selected products. Include a
publisher-covered item and a valid referral code/rule if those features are to
be widened. Do not use a real learner account unless finance and privacy owners
have approved it.

1. Record the expected pre-payment values: product/item IDs, price in minor
   EGP units, publisher agreement/version and expected allocation, referral
   rule/version and expected allocation, and the intended payment channel.
2. Complete one approved purchase per intended channel. For Paymob, use the
   hosted checkout response and wait for the local order to become `APPROVED`;
   the redirect page is never proof of payment.
3. Retain only IDs and references: order, order items, receipt, entitlement,
   payment attempt, Paymob transaction, publisher/referral allocations, and
   referral code/rule. Do not copy full provider payloads to the release
   record.
4. Create one persistent reconciliation run with the approved pilot order IDs:

   ```text
   POST /api/v1/admin/partner-finance/reconciliation-runs
   POST /api/v1/admin/partner-finance/reconciliation-runs/{runId}/run
   GET  /api/v1/admin/partner-finance/reconciliation-runs/{runId}
   ```

5. The run must show the approved order, matching immutable receipt snapshot,
   entitlement, expected publisher/referral allocations, and settlement state.
   For Paymob it additionally checks one paid local attempt, receipt linkage,
   verified/processed callback, merchant reference, callback amount, and
   callback currency. For manual payment it checks an approved payment
   submission and that the receipt is not linked to a PSP attempt.
6. Request and approve a refund for one complete pilot order item, using a
   recorded off-platform reimbursement reference. Re-run the same persistent
   reconciliation run. It must show the selected entitlement revoked, every
   selected original allocation `REVERSED`, and a negative allocation linked to
   it. An unselected item in the same order must remain active and unreversed.
7. Assign and resolve every reconciliation discrepancy with evidence. Phase 0
   permits no open, assigned, or merely accepted `ERROR` discrepancy. A paid
   settlement affected by a refund is an escalation, not permission to edit
   ledger history; finance must record the compensating settlement treatment.

The CLI command `pnpm partner-allocations:reconcile -- --from=YYYY-MM-DD
--to=YYYY-MM-DD` is a read-only broad check. It is useful corroborating
evidence, but it does not replace the persistent run or its discrepancy
workflow.

## Paymob sandbox and live acceptance

Perform every scenario in sandbox first, then repeat the successful payment,
callback, and settlement-comparison path in live mode with the smallest
approved amount. Use different clearly labelled pilot orders; never replay a
sandbox callback against production.

| Scenario | Required evidence | Pass condition |
| --- | --- | --- |
| Callback reachability | Provider dashboard delivery result, API access-log request ID, local webhook-event ID | Public HTTPS callback returns 200 and is recorded. |
| HMAC validation | One genuine callback plus a controlled invalid-HMAC request | Genuine callback is verified and can approve; invalid HMAC is recorded but cannot change order, entitlement, receipt, or allocations. |
| Success/idempotency | Local order/attempt/receipt/allocation IDs and duplicate delivery result | One paid attempt, one receipt, one entitlement per item, and one allocation per eligible kind. |
| Decline, cancellation, retry, timeout | Attempt IDs and final order state | A failed attempt grants nothing; a fresh attempt can be created before expiry; timeout errors leave no paid state. |
| Expiry and delayed callback | Expired order/attempt IDs and delayed callback result | Expiry marks unfinished orders/attempts expired; a later callback cannot grant access unless engineering explicitly investigates and records a corrective action. |
| Provider settlement comparison | Merchant transaction/settlement reference, exported gross/fee/net values, local total in minor EGP | Finance can explain the gross local total, provider fees, net settlement amount, currency, and timing. Any difference is either resolved or blocks rollout. |

The local reconciliation run validates callback evidence, not the merchant's
bank settlement. Finance must compare the provider dashboard/export with the
provider settlement/deposit record and attach its redacted reference to the
signed pilot record. Provider refunds remain deliberately out of scope: the
refund test is an off-platform reimbursement plus local entitlement and ledger
reversal.

## Rollback and incident response

The incident commander halts the pilot for an unexplained reconciliation
variance, an entitlement granted without verified payment, invalid callback
acceptance, a provider amount/currency mismatch, duplicate allocation,
missing reversal, or an unavailable callback endpoint.

1. The rollback operator disables the affected payment channel or sets the
   relevant referral/partner-ledger feature and allow-list back to the last
   approved narrow scope. Stop creating new pilot orders.
2. Preserve the order, receipt, payment-attempt, webhook-event, audit-event,
   reconciliation-run, and provider-reference IDs. Do not delete or mutate
   allocations, settlements, receipts, or reconciliation evidence.
3. The incident commander assigns finance and engineering investigators and
   records customer impact. Use compensating entries for a financial correction
   and the normal entitlement/refund workflow for access correction.
4. Re-run the persistent reconciliation after the correction. Re-enable only
   with new finance and engineering approval.

## Closure evidence

Use [the signed pilot record template](templates/phase-0-pilot-record.md) for
each environment. The finance and engineering signatures may be maintained in
an approved ticketing or document system, but the final record must link the
immutable reconciliation run ID and the redacted provider-settlement evidence.
