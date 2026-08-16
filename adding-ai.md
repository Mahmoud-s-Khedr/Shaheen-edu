# Adding AI to Shaheen Edu

## Current implementation

The system already has:

- Course hierarchy: grade → subject → course → chapter → lesson → section.
- Question banks, sources, options, explanations, attachments, review, publishing, and archiving.
- Student practice attempts and retry history.
- Generated assessments with frozen question snapshots.
- Tutor/exam modes, answer reveal rules, performance analytics, difficulty bands, and progress tracking.

These foundations are now used by the first delivered AI capability: admin-only question import. See `src/modules/ai-question-import`, the question lifecycle in `src/modules/question-banks/question-banks.service.ts`, and the import records in `prisma/schema.prisma`.

## Delivered: AI question import

Admins can create a queued import from pasted raw text or a ready Bunny asset, targeting an existing question bank, source, course, and at least one placement. The import worker is a separate process (`pnpm start:ai-worker`) backed by BullMQ and Redis.

### Implemented flow

1. An admin selects the question bank, source, course, and placement, then supplies either raw text or a ready PDF, DOCX, or TXT asset.
2. The API validates source/bank/course subject compatibility and queues a persistent `QuestionImportBatch`.
3. The worker extracts and normalizes text:
   - TXT: direct text extraction.
   - DOCX: DOCX-to-text extraction.
   - PDF: embedded text extraction only; scanned/image-only PDFs are rejected when too little readable text is available.
4. The worker creates neutral source blocks, then asks the configured OpenRouter model to identify complete, ordered question boundaries. Ambiguous, overlapping, or incomplete boundary output moves the batch to `AWAITING_REVIEW`.
5. It groups identified questions into extraction chunks, asks OpenRouter for strict JSON-schema output, validates each candidate, and creates ordinary draft questions plus their options atomically.
6. Valid imports remain drafts: nothing is submitted, reviewed, or published automatically. Invalid candidates and failed chunks retain diagnostics; admins can inspect status, source text, blocks, chunks, items, and retry failed work. 

The client uses OpenRouter structured JSON schemas, provider `require_parameters`, and `data_collection: "deny"`. It also treats all document text as untrusted data, not instructions.

A practical AI output shape would be:

```json
{
  "items": [
    {
      "sourceNumber": "12",
      "body": "Question text",
      "type": "SINGLE_CHOICE",
      "options": [
        { "body": "Option A", "isCorrect": false },
        { "body": "Option B", "isCorrect": true }
      ],
      "explanation": "Why option B is correct.",
      "confidence": 0.91,
      "warnings": [],
      "sourceLocator": {
        "page": 4,
        "block": "question-12"
      }
    }
  ]
}
```

The application enforces existing domain rules: valid option counts and correct-answer rules, non-empty bodies/explanations, and source/bank/course compatibility. The generated questions use the normal question service and are ordinary drafts.

The model should preserve the original question wording wherever possible. It may infer:

- Question type.
- Correct answer.
- Explanation.
- Missing structure.
- Question boundaries.

Each created question remains traceable to its `QuestionImportItem` and stays in the ordinary draft lifecycle for admin review before publication.

The delivered persistence model contains:

- `QuestionImportBatch`
- `QuestionImportSourceBlock`
- `QuestionImportChunk`
- `QuestionImportItem`

Items retain raw/normalized model output, confidence, warnings, source location, errors, and the created `questionId`; batches and chunks also retain statuses, model/schema version, usage, diagnostics, and counters.

The API is mounted under `/api/v1/admin/ai/question-imports` and is limited to `ADMIN` and `SUPER_ADMIN`. `CONTENT-019` covers the queue API contract without calling OpenRouter; run it with `pnpm journey:content:ai-question-import`. Unit coverage covers text extraction and worker behavior.

### Remaining import work

- Add OCR or a controlled multimodal/PDF path for scanned PDFs.
- Add explicit per-item admin accept/reject controls if the normal draft-question lifecycle is not sufficient for the UI.
- Add production monitoring for queue depth, provider cost, latency, and retries.
- Evaluate Arabic, English, mixed-language, equation, diagram, malformed, and missing-answer inputs against representative source material.

## Priority 1: Student question assistance

The safest first student feature is contextual explanation after the student answers.

The existing system already returns the official explanation after direct practice attempts, and assessment results already support mode-aware answer revealing. See `src/modules/learning/learning.service.ts` and `docs/student-portal-api-roadmap.md`.

AI can add:

- “Explain this in simpler Arabic.”
- “Why is my answer wrong?”
- “Explain why the correct option is correct.”
- “Give me a hint.”
- “Show the concept I need to revise.”
- “Give me a similar practice question.”

The prompt should include:

- The question.
- Options.
- Student’s selected answer.
- Correct answer, only after the allowed reveal point.
- Existing official explanation.
- Course/chapter/lesson context.
- Student language and academic grade.

The AI should not be allowed to reveal answer keys before the platform’s existing exam rules allow it.

For math, physics, chemistry, or questions with diagrams, the endpoint can optionally include approved question attachments. OpenRouter supports multimodal inputs, but model and provider support must be checked per request: [OpenRouter multimodal inputs](https://openrouter.ai/docs/guides/overview/multimodal/overview).

## Priority 1: Personalized exam feedback

This is probably the highest-value student experience after explanations.

The current system already calculates:

- Subject/chapter performance.
- Accuracy.
- Trends.
- Answer changes.
- Peer comparisons.
- Practice performance.
- Question difficulty bands.

See `src/modules/performance/performance.service.ts`.

AI can turn those existing metrics into:

- “You are weak in Chapter 3 because…”
- A personalized revision plan.
- Recommended questions to retry.
- A short explanation of repeated mistakes.
- A recommended next assessment.
- A weekly student progress summary.

This should be grounded entirely in existing system data. It does not need a vector database in the first version.

## Priority 2: AI assessment builder

Instead of asking admins to manually select every filter, allow a prompt such as:

> Create a 20-question medium-difficulty physics exam from electricity, excluding questions the student already solved.

AI converts that request into the existing assessment filters:

- Course/chapter/lesson scope.
- Question count.
- Difficulty.
- Source.
- Used/unused/correct/incorrect status.
- Tutor or exam mode.
- Timer.

The actual question selection should remain deterministic in the backend. AI should only interpret the request and produce validated filters.

This is safer than allowing AI to freely generate exam questions during an exam.

## Priority 2: Summaries

Summaries can be generated for:

- A question.
- A lesson.
- A chapter.
- A course.
- A completed exam.
- A student’s weak areas.

The content model already supports text content and file attachments, but PDFs, DOCX files, and videos will need extraction or transcripts before reliable summarization.

Good summary formats include:

- Short revision notes.
- Key definitions.
- Important formulas.
- Common mistakes.
- Exam-focused checklist.
- Flashcards.
- “What to study next.”

## Priority 2: TTS

Generate audio from an approved summary, not directly from arbitrary model output.

Recommended flow:

1. Generate text summary.
2. Store and cache it using a content hash.
3. Generate MP3 through OpenRouter’s TTS endpoint.
4. Store it in Bunny.
5. Return a protected, expiring audio URL.

OpenRouter provides a dedicated `/audio/speech` endpoint, but the TTS model is separate from the chat model. Configure these independently:

```env
AI_TEXT_MODEL=google/gemini-...
AI_TTS_MODEL=...
AI_TTS_VOICE=...
```

Do not assume the same Gemini Flash model supports both text reasoning and speech. OpenRouter exposes TTS-capable models separately: [OpenRouter TTS](https://openrouter.ai/docs/guides/overview/multimodal/tts) and [OpenRouter speech API](https://openrouter.ai/docs/api/api-reference/speech/create-audio-speech).

The current asset system would need either an `AUDIO` asset kind or a separate `AiArtifact` model linked to an asset.

## Other useful AI opportunities

| Area | Opportunity | Priority |
|---|---|---|
| Question review | Detect duplicates, ambiguous wording, missing explanations, inconsistent correct answers | High |
| Question metadata | Suggest topic, learning objective, difficulty, tags, and curriculum placement | High |
| Content authoring | Draft bilingual titles, descriptions, summaries, and lesson metadata | Medium |
| Video learning | Generate transcripts, chapters, searchable concepts, and video summaries | Medium |
| Parent experience | Explain a child’s progress in simple Arabic | Medium |
| Admin analytics | Summarize weak courses, problematic questions, and content gaps | Medium |
| Commerce | Receipt OCR and transaction extraction | Later; requires human review |
| Support | Grounded student/admin FAQ assistant | Later |

## Current and next technical architecture

The delivered `QuestionImportModule` contains:

- `QuestionImportService`
- `QuestionImportQueue`
- `QuestionImportWorker`
- `OpenRouterQuestionImportClient`
- `DocumentTextExtractor`
- Persistent batch, source-block, chunk, and item records.
- Redis-backed BullMQ processing in a dedicated worker process.
- OpenRouter model configuration, timeouts, structured output, and retained provider usage/diagnostics.
- Audit records linked to the existing audit module.

Future AI features should extend a dedicated AI boundary with:

- Task/job services shared by explanation, summary, and speech features.
- `QuestionExplanationService`
- `SummaryService`
- `SpeechService`

Do not call OpenRouter directly from `LearningService`, `AssessmentsService`, or `QuestionBanksService`.

Use OpenRouter provider controls such as `require_parameters: true` for structured outputs and consider `data_collection: "deny"` for educational content where possible: [OpenRouter provider routing and data policies](https://openrouter.ai/docs/guides/routing/provider-selection).

## Guardrails

The system should enforce:

- No automatic question publishing.
- Human review for imported answers and explanations.
- No National IDs, phone numbers, passwords, or unnecessary student identity data in prompts.
- No answer-key exposure before the normal reveal point.
- Uploaded files treated as untrusted content; ignore instructions embedded inside documents.
- Per-student and per-admin rate limits.
- Caching for summaries, explanations, and TTS.
- Model/version/usage tracking for every generation.
- Evaluation using Arabic, English, mixed-language, scanned PDF, equations, diagrams, malformed questions, and missing answers.

## Recommended implementation order

1. [x] Question import with admin review safeguards.
2. AI explanation after answer submission.
3. Personalized exam feedback and study recommendations.
4. Natural-language assessment builder.
5. Summaries.
6. TTS.
7. Broader content, parent, analytics, and moderation features.

## Documentation issue

`README.md` still says only authentication is implemented, while the repository already contains the full content, questions, assessments, learning, commerce, analytics, and AI-import domains. It should be updated.
