# Deferred redesign — AI-prompt assessment generation

## Status

**Deferred for a later implementation.** The current released implementation
is working and remains the production path. This document records the intended
replacement architecture; it does not authorize or describe an immediate
behaviour change.

## Decision

`POST /student/assessments/ai-prompt` must use AI to translate a student's
typed or spoken request into a **validated normal-assessment filter plan**.
It must not ask a model to select final question IDs.

The deterministic student assessment generator remains the only component
that filters eligible questions, samples the final set, and creates the frozen
assessment snapshot.

```text
Student text or speech
        |
        v
AI interprets intent into filter plan
        |
        v
Server validates and normalizes plan
        |
        v
Shared deterministic standard-generation service
        |
        v
Private immutable assessment snapshot
```

## Why the current approach is being replaced

The current AI-prompt path independently performs eligibility lookup, sends
candidate question summaries to a model, accepts selected question IDs, and
freezes those IDs into an assessment.

That duplicates the responsibilities of `generateStandard`, introduces a
provider call into a deterministic selection problem, and makes assessment
creation depend on provider-specific structured-output behaviour. It also
requires sending question content to an external provider merely to assemble a
quiz.

The normal endpoint already provides the desired final operation:

```text
POST /student/assessments
  -> validate bank/scope/status/difficulty/mark filters
  -> enforce publication, grade, and entitlement rules
  -> find eligible questions
  -> sample exactly the requested count
  -> create a private immutable snapshot
```

The redesign reuses that operation rather than recreating it.

## Target behaviour

### Student request

The AI route continues to receive natural language plus explicit assessment
settings. The settings supplied by the client are authoritative and are never
overridden by the model.

```json
{
  "prompt": "عاوز امتحان صعب على النحو، وركز على الأسئلة اللي غلطت فيها",
  "questionCount": 20,
  "mode": "TUTOR",
  "isTimed": false,
  "title": "مراجعة النحو"
}
```

The route may also receive an explicit scope supplied by the UI, such as a
selected course. Whether scope is always required, optionally supplied as
context, or inferred from the prompt is a product decision recorded below.

### Internal AI output

The model returns a small, typed planning object—not question IDs and not
question text:

```json
{
  "scopes": [{ "courseId": "course_123" }],
  "questionBankIds": ["bank_456"],
  "sourceTypes": [],
  "difficultyBands": ["HARD"],
  "questionStatuses": ["INCORRECT"],
  "markedOnly": false,
  "rationale": "The student asked for difficult grammar revision focused on mistakes."
}
```

Only values supported by `GenerateStudentAssessmentDto` are allowed. The
server must reject unknown fields, unsupported enum values, conflicting
filters, inaccessible IDs, and a plan with no valid scope.

The rationale is audit-only. It is not used to influence selection and is not
shown as an explanation of assessment correctness.

### Deterministic creation

After validation, the service merges the AI plan with authoritative client
settings and delegates to a shared internal generator extracted from
`generateStandard`.

```ts
const plan = await interpretStudentPrompt(prompt, allowedCurriculumContext);
const dto = normalizeAndValidatePlan(plan, clientSettings);
return generateStudentAssessment(studentId, dto, {
  generationType: 'AI_PROMPT',
  aiRunId: run.id,
});
```

`generateStandard` should itself call this shared internal generator, so both
routes have one implementation of eligibility, sampling, snapshot creation,
and error handling. The AI route retains `AI_PROMPT` provenance and audit data
without owning a separate question-selection algorithm.

## What may be sent to AI

The planner should receive only a bounded, answer-safe curriculum catalog
needed to turn language into filters:

- accessible course, chapter, lesson, and section IDs and titles;
- accessible question-bank IDs and names, where bank selection is supported;
- supported filter vocabulary and enum values;
- optionally, source-type labels and approved curriculum objective tags.

It must not receive question IDs, question bodies, options, correct answers,
rubrics, assessment answers, or detailed student answer history. The model
does not need that data to produce filters.

## Scope resolution options

This is the only unresolved product/API decision.

### Option A — UI scope is required (recommended first release)

The student selects a course/chapter/lesson/section before speaking or typing.
AI interprets the remaining intent: for example difficulty, marked questions,
or previously incorrect questions.

Benefits: low ambiguity, small provider context, straightforward validation,
and compatibility with the existing route body.

### Option B — AI infers scope from accessible curriculum

The client sends only natural language and settings. The server supplies an
answer-safe catalog of the student's accessible curriculum, and AI returns
scope IDs from that catalog.

Benefits: lowest-effort student experience. Costs: ambiguous phrasing,
larger context, and a need for clarification when several curriculum nodes
match. The API should return a confirmation/clarification plan rather than
silently choosing in ambiguous cases.

Do not allow a model to invent IDs or expand a scope beyond the student's
accessible curriculum under either option.

## Failure and UX behaviour

- If AI interpretation succeeds, create the assessment through the shared
  deterministic generator.
- If its resulting filters yield too few questions, return a clear validation
  result and offer adjustment of the plan; never broaden scope or relax
  filters silently.
- If interpretation is unavailable, retain the student's text and offer the
  normal manual filter UI. The normal assessment endpoint remains fully
  functional without AI.
- Prevent duplicate assessment creation with an idempotency key or a
  short-lived request fingerprint.

## Audit and observability

Keep an AI run record, but change its semantic purpose from `question ID
selection` to `filter-plan interpretation`. It should retain:

- raw student prompt or a privacy-approved bounded representation;
- client-provided authoritative settings;
- the normalized filter plan;
- model, provider response, usage, and status;
- validation result and generated assessment ID, when successful.

Do not expose raw provider data to a student API response. Do not log API
keys, authorization headers, student tokens, or answer data.

## Implementation outline

1. Define a versioned `AiAssessmentFilterPlan` DTO/schema aligned with the
   supported fields of `GenerateStudentAssessmentDto`.
2. Add the safe accessible-curriculum catalog builder.
3. Replace `planQuiz` with a planner that returns only that filter plan.
4. Extract the common deterministic creation logic from `generateStandard`.
5. Route AI-prompt creation through plan validation and the common generator.
6. Preserve `AI_PROMPT` generation provenance and adapt the AI-run audit
   record to store plans rather than selected question IDs.
7. Add contract, unit, and end-to-end tests.

## Acceptance criteria

- A valid AI-prompt request creates the same eligible question population and
  uses the same sampling algorithm as an equivalent `POST /student/assessments`
  request.
- AI cannot select question IDs, bypass access controls, change a client-set
  question count/mode/timing value, or inject unsupported filters.
- No question content, answers, options, rubrics, or detailed answer history
  is sent to the planner.
- The assessment is still recorded as `AI_PROMPT`, linked to a completed plan
  audit record, and returned as the ordinary private assessment response.
- Provider failure leaves manual normal-assessment generation available and
  creates no duplicate or partial assessment.
