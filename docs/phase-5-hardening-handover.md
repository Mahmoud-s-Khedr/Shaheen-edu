# Phase 5 hardening, rollout, and handover

This is the execution record and gate checklist for Phase 5 of the
[administration and partner expansion plan](administration-and-partner-expansion-plan.md).
It turns the phase into evidence that can be collected in staging; it is not a
claim that a local build or unit suite has completed an operational rollout.

Do not put production credentials, learner data, complete webhook payloads,
bank details, signed URLs, or exported CSV contents in this document or in a
release ticket. Record identifiers, timestamps, redacted log references, and
the named approver instead.

## Completion boundary

Phase 5 has three separate gates. They must be recorded separately so a
passing automated suite cannot be mistaken for an authorization to widen an
allow-list.

| Gate                            | Evidence                                                                                                             | Owner                              | Blocks                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ |
| Automated acceptance            | Focused and full suites below, including real HTTP journeys against a disposable or dedicated staging environment.   | Engineering                        | Any staging pilot.       |
| Staging resilience              | Migration, worker/queue, reconciliation, rollback, export expiry/cancellation, and payment failure drills.           | Engineering + operations           | Cohort expansion.        |
| Controlled rollout and handover | Observation windows, discrepancy review, signed cohort decision, dashboard/alert ownership, and runbook walkthrough. | Finance + operations + engineering | Unrestricted enablement. |

An `ERROR` reconciliation discrepancy, an unexplained access denial, a
payment failure without an owner, or an export that cannot be traced to its
audit event blocks the next gate. Preserve immutable financial evidence and
correct it with normal compensating actions; never delete allocations,
settlements, receipts, or reconciliation records to make a check pass.

## Automated acceptance matrix

Run the normal fast regression suite first:

```sh
pnpm test
pnpm build
pnpm api:contract:check
```

Run the full HTTP acceptance suite only with dedicated non-production Bunny
resources as described in [the journey README](testing/README.md):

```sh
pnpm api:test:full
```

The Phase 5 release record must link the redacted report, commit SHA, migration
list, environment, start/end times, and the person who reviewed failures. The
following cases are required, whether they are run by the HTTP suite, focused
service tests, or a documented staging drill.

| Area                       | Required proof                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Referral lifecycle         | Draft program, code, and immutable commission rule can be created; activation is rejected while `FEATURE_REFERRALS_ENABLED=false`; an allowed student can preview and check out with the code; a disallowed student is denied; self-referral is denied.                                                                                                      |
| Attribution and fulfilment | Approved manual-payment and Paymob paths retain checkout attribution, create at most one publisher allocation and one referral allocation per eligible order item, and retain the same result after duplicate approval/webhook delivery.                                                                                                                     |
| Settlement and refund      | A settlement contains only one partner's payable rows, becomes paid once, and the full manual-refund path revokes the selected entitlement and produces linked negative reversals without modifying the original allocation. A refund affecting a paid settlement is escalated and reconciled.                                                               |
| Exports                    | Disabled export control rejects requests. Enabled exports enforce role, support reason, report filter and column policy; worker retry reaches `COMPLETED` or a visible `FAILED` state; requester-only download, cancellation race, signed-URL expiry, artifact expiry/deletion, and audit records are checked.                                               |
| Assessment attribution     | Run `pnpm assessment-attribution:backfill` first as a dry run, preserve its count, then run `pnpm assessment-attribution:backfill -- --apply` only after approval. Re-run the report and prove zero remaining unattributed snapshots except deliberate `UNKNOWN_LEGACY` rows. Verify rollup totals against raw frozen attribution for the selected fixtures. |
| Isolation                  | A content publisher and a referral partner cannot query the other's reporting endpoints, cannot retrieve another partner's data, and receive no learner name/contact/national-ID/order data. A referral partner with fewer than `REFERRAL_PARTNER_MINIMUM_COHORT` approved referred learners receives only the suppression response.                         |

Feature controls are process-start configuration. The enabled and disabled
paths therefore require separate deployments or restarts; do not try to infer
the disabled path from an enabled instance. Capture the exact values (with
allow-list IDs redacted where required) for:

```text
FEATURE_REFERRALS_ENABLED
FEATURE_REFERRAL_ALLOWED_STUDENT_IDS
FEATURE_PARTNER_LEDGER_ENABLED
FEATURE_PARTNER_LEDGER_ALLOWED_USER_IDS
FEATURE_REPORT_EXPORTS_ENABLED
REFERRAL_PARTNER_MINIMUM_COHORT
```

Use an explicit single dedicated test student/partner ID for a narrow pilot.
`*` is acceptable only in a disposable acceptance environment, never in a
staging or production cohort configuration.

## Staging drill sequence

Perform these in the order shown in a production-like staging environment.
The existing [Phase 0 pilot runbook](phase-0-operational-pilot.md) is the
source of truth for provider acceptance, reimbursement policy, and financial
pilot evidence; this procedure adds the final hardening work.

1. Record the deployed revision, `pnpm exec prisma migrate status` output, worker
   version, Redis/queue health, feature controls, named incident commander,
   rollback operator, and the selected non-real test accounts.
2. Deploy migrations additively, restart API and workers, then run the
   assessment-attribution dry run. Apply it only if the reviewed count matches
   expectation. Run a representative raw-attribution versus rollup comparison
   and retain the result.
3. Run the referral-to-refund journey: create/activate program, code and rule;
   approve a payment; replay the approval or webhook; verify one allocation of
   each applicable kind; create/mark paid a settlement where permitted;
   approve a manual reimbursement and re-run reconciliation. Retain only IDs
   and references.
4. Stop the export worker after an export is queued, confirm the job remains
   observable, start the worker, and confirm retry/processing/completion. Queue
   a second export while the worker is stopped and cancel it before restart;
   prove it does not later complete. Use a short-lived non-production export
   policy or the controlled clock procedure to exercise URL and artifact
   expiry, deletion, and the `REPORT_EXPORT_EXPIRED` audit event.
5. Exercise one failed Paymob callback/HMAC, provider timeout or retry, and a
   duplicate successful callback. No failed path may create an entitlement,
   receipt, settlement, or allocation. Reconciliation must report callback
   evidence correctly.
6. Run `pnpm partner-allocations:reconcile -- --from=YYYY-MM-DD --to=YYYY-MM-DD`
   as a corroborating read-only check and run the persistent reconciliation
   API for the exact pilot orders. Resolve every error with evidence.
7. Perform rollback: disable the affected feature and return its allow-list to
   the last approved scope, restart the relevant process if configuration is
   environment based, then verify that a new referral/export action is denied
   while historical audit and ledger reads remain available. Restore only with
   a new recorded approval.

Each drill requires a pass/fail result, timestamp, operator, correlation IDs
or redacted log links, and an incident record for a failure. A rerun replaces
neither the original evidence nor the failure record.

## Cohort rollout and observation

Start with the approved pilot publisher, referral partner, and test student
allow-lists. Do not enable an entire partner class merely because its first
transaction passed.

| Stage                | Minimum evidence before widening                                                                                      | Decision makers                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Pilot                | All automated acceptance and staging drills pass; Phase 0 signed record has no unexplained discrepancy.               | Finance + engineering                        |
| Cohort 1             | Agreed observation window has elapsed with reconciliation, export, payment, and access-denial signals reviewed daily. | Finance + operations + engineering           |
| Each expansion       | Prior cohort remains within agreed thresholds and has an explicit approval recorded.                                  | Same named approvers                         |
| General availability | Final cohort observation and handover checklist are complete.                                                         | Operating-team owner + finance + engineering |

Set thresholds and observation-window duration in the release record before a
cohort starts. At a minimum monitor: reconciliation errors/warnings, unmatched
or duplicate allocations, export queued/failed/cancelled/expired counts,
worker retry depth, payment/webhook failures and latency, refund/reversal
exceptions, and partner/reporting `401`/`403` denials. Each signal needs a
dashboard link, alert threshold, primary owner, backup owner, and escalation
route.

## Handover checklist

The operating team accepts Phase 5 only when each item has an owner and a
durable location outside the repository for live evidence.

- [ ] Signed Phase 0 pilot record and Phase 5 staging drill record are linked
      from the release ticket.
- [ ] Migration, backfill, reconciliation, export, refund, payment-provider,
      and rollback procedures have been walked through with the on-call operator.
- [ ] Dashboards and alerts cover the signals above; alert owner and backup
      have acknowledged them.
- [ ] Feature-control values, current allow-list members, expansion criteria,
      and immediate rollback procedure are recorded in the operating configuration
      system.
- [ ] Finance owns settlement/reversal reconciliation and the provider
      settlement comparison; engineering owns webhook/queue/worker recovery.
- [ ] The final cohort decision is signed by the named finance, engineering,
      and operating-team approvers.

Until every box is checked with live-environment evidence, Phase 5 remains in
progress even when all repository tests pass.
