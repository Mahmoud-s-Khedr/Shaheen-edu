# Error-message review

Three parallel reviews covered shared exception handling, DTO validation, and domain services.

## Implemented

- DTO errors show the first localized validation issue as the summary, with every issue retained in `details` and the existing `BAD_REQUEST.VALIDATION_FAILED` code preserved.
- Nested field paths and array indexes remain available for form feedback. Validation targets and submitted values are excluded.
- Arabic validation feedback includes numeric limits, allowed enum values, array requirements, and unknown-field guidance.
- Seven enum decorators now report their allowed values while retaining their existing validation codes.
- Required localized titles, nested AI supplied answers, and reorder arrays are validated before service execution.
- AI answer handling rejects malformed answer elements with a useful error instead of a type error.
- The exception filter preserves localized messages, explicit body codes, and legacy arrays of messages.
- JSON parsing, request size, and content-type errors use safe actionable messages.
- The API reference and Swagger field-error schema describe how clients should consume errors.

## Remaining review findings

These require separate domain-specific changes and are not covered by this patch:

- `reports.service.ts` and `partner-finance.service.ts`: date-range errors combine invalid dates and reversed ranges; distinguish the failing field and ordering rule.
- Authentication and student phone validation: explain the accepted Egyptian mobile format and identify whether the student or parent number failed.
- `question-import.service.ts`: “Source text is too short” should explain the minimum of 20 characters after normalization.
- Video and assessment provider failures: review cases classified as HTTP 400 and distinguish unavailable upstream services from invalid client input.
- Other application messages still use the generic Arabic fallback where no translation is registered.
- `question-ai-explanations.service.ts`: validate choice-answer indexes against the question's option count before persisting or applying a run. The current non-negative-integer check accepts out-of-range indexes; applying such a run clears every existing correct option and then selects none because unmatched indexes are discarded.

Message-derived application codes remain in use outside DTO validation. Future wording changes should preserve existing codes explicitly where clients depend on them.
