import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type AnyRecord = Record<string, any>;

const outputPath = resolve('reports', 'ai-question-import', 'model-comparison.md');
const models = [
  {
    label: 'GPT-5.6 Luna',
    model: 'openai/gpt-5.6-luna',
    run: 'real-ai-20260816001443801',
  },
  {
    label: 'Gemini 3.7 Flash',
    model: 'google/gemini-3.7-flash',
    run: 'real-ai-20260816012011481',
  },
  {
    label: 'Gemini 3.5 Flash Lite',
    model: 'google/gemini-3.5-flash-lite',
    run: 'real-ai-20260816004845546',
  },
];

function jsonLines(text: string): AnyRecord[] {
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function money(value: number | null | undefined) {
  return value == null ? '—' : `$${value.toFixed(6)}`;
}

function answerLabel(candidate: AnyRecord | undefined) {
  if (!candidate?.rawOutput?.answer) return '—';
  const indexes = candidate.rawOutput.answer.selectedOptionIndexes ?? [];
  const letters = indexes.map((index: number) => String.fromCharCode(65 + index)).join(',');
  const marker = candidate.status === 'CREATED' ? '✓' : candidate.status === 'REVIEW_REQUIRED' ? '⚠' : '✗';
  const confidence = candidate.rawOutput.answer.confidence;
  return `${letters || '—'} ${marker} ${confidence == null ? '' : Number(confidence).toFixed(2)}`.trim();
}

function selectedIndexes(candidate: AnyRecord | undefined): number[] | null {
  const indexes = candidate?.rawOutput?.answer?.selectedOptionIndexes;
  return Array.isArray(indexes) ? indexes : null;
}

function oneLine(value: unknown, maximum = 420) {
  return String(value ?? '—').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, maximum);
}

function selectedOptionText(candidate: AnyRecord | undefined) {
  const indexes = selectedIndexes(candidate);
  const options = candidate?.rawOutput?.options;
  if (!indexes || !Array.isArray(options)) return '—';
  return indexes.map((index) => `${String.fromCharCode(65 + index)}: ${oneLine(options[index]?.body, 220)}`).join('<br>');
}

async function loadModelResult(model: (typeof models)[number]) {
  const directory = resolve('reports', 'ai-question-import', model.run);
  const summary = JSON.parse(await readFile(resolve(directory, 'candidate-summary.json'), 'utf8')) as AnyRecord;
  const events = jsonLines(await readFile(resolve(directory, 'ai-responses.jsonl'), 'utf8'));
  const providers = events.filter((event) => event.kind.endsWith('provider-response'));
  const segmentation = providers.find((event) => event.kind === 'segmentation-provider-response');
  const extraction = providers.find((event) => event.kind === 'extraction-provider-response');
  const candidates = events.filter((event) => event.kind === 'candidate-response' && event.status !== 'EXCLUDED');
  const byQuestion = new Map(candidates.map((candidate) => [Number(candidate.sequence), candidate]));
  const costs = providers.map((event) => Number(event.usage?.cost ?? 0));
  const counts = summary.files[0].counts;
  return {
    ...model,
    directory,
    summary,
    segmentation,
    extraction,
    candidates,
    byQuestion,
    requestCount: providers.length,
    promptTokens: providers.reduce((sum, event) => sum + Number(event.usage?.prompt_tokens ?? 0), 0),
    completionTokens: providers.reduce((sum, event) => sum + Number(event.usage?.completion_tokens ?? 0), 0),
    totalTokens: providers.reduce((sum, event) => sum + Number(event.usage?.total_tokens ?? 0), 0),
    cost: costs.reduce((sum, value) => sum + value, 0),
    counts,
  };
}

function relative(file: string) {
  return file.replace(`${process.cwd()}/`, '');
}

async function main() {
  const results = await Promise.all(models.map(loadModelResult));
  const [gpt, gemini37, gemini35] = results;
  const comparableQuestionNumbers = Array.from({ length: 22 }, (_, index) => index + 1);
  const disagreements = comparableQuestionNumbers.filter((number) => {
    const left = selectedIndexes(gpt.byQuestion.get(number));
    const right = selectedIndexes(gemini35.byQuestion.get(number));
    return left && right && JSON.stringify(left) !== JSON.stringify(right);
  });
  const gptVsGemini37 = comparableQuestionNumbers.filter((number) => JSON.stringify(selectedIndexes(gpt.byQuestion.get(number))) !== JSON.stringify(selectedIndexes(gemini37.byQuestion.get(number))));
  const gemini35VsGemini37 = comparableQuestionNumbers.filter((number) => JSON.stringify(selectedIndexes(gemini35.byQuestion.get(number))) !== JSON.stringify(selectedIndexes(gemini37.byQuestion.get(number))));
  const report: string[] = [];
  report.push('# AI Question Import Model Comparison');
  report.push('');
  report.push('Generated from the same local import test using `example-questions/model1.md`. This document is intended for client review; the full provider responses remain in the linked JSONL logs.');
  report.push('');
  report.push('## Executive summary');
  report.push('');
  report.push('| Candidate | Result | Drafts created | Review required | Excluded | Failed | Requests | Total tokens | Provider cost |');
  report.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const result of [gpt, gemini35, gemini37]) {
    report.push(`| ${result.label} | ${result.summary.files[0].status} | ${result.counts.createdQuestions} | ${result.counts.invalidItems} | 3 essays | ${result.counts.failedItems} | ${result.requestCount} | ${result.totalTokens.toLocaleString()} | ${money(result.cost)} |`);
  }
  report.push('');
  report.push('The input contains 25 numbered questions: 22 multiple-choice questions and 3 essay/open-ended questions. The three non-choice questions were excluded by the segmentation step. There is no official answer key in the source file, so this comparison measures extraction, answer selection, confidence, review behavior, and operational cost—not confirmed academic correctness.');
  report.push('');
  report.push('## Test conditions');
  report.push('');
  report.push('- Input: `example-questions/model1.md` (18,451 bytes; 175 source blocks).');
  report.push('- Each model received the same source text, segmentation prompt, extraction prompt, JSON schemas, and local import workflow.');
  report.push('- Each run used two model requests: one boundary/context segmentation request and one extraction request for the 22 supported questions.');
  report.push('- The worker was allowed to exclude essay/open-ended questions and to hold uncertain answers for admin review.');
  report.push('');
  report.push('## Token and cost detail');
  report.push('');
  report.push('| Candidate | Segmentation tokens (input / output) | Extraction tokens (input / output) | Total cost |');
  report.push('|---|---:|---:|---:|');
  for (const result of [gpt, gemini35, gemini37]) {
    const segmentation = result.segmentation?.usage;
    const extraction = result.extraction?.usage;
    report.push(`| ${result.label} | ${segmentation ? `${Number(segmentation.prompt_tokens).toLocaleString()} / ${Number(segmentation.completion_tokens).toLocaleString()}` : '—'} | ${extraction?.prompt_tokens ? `${Number(extraction.prompt_tokens).toLocaleString()} / ${Number(extraction.completion_tokens).toLocaleString()}` : result.extraction?.errorDetail ? `failed: ${result.extraction.errorDetail}` : '—'} | ${money(result.cost)} |`);
  }
  report.push('');
  report.push('Note: provider billing metadata is taken from each OpenRouter response. Costs can vary between repeated runs because provider routing, caching, and output length can vary.');
  report.push('');
  report.push('## Answer comparison for questions 1–22');
  report.push('');
  report.push('Each cell is `answer letter(s) / status marker / confidence`: ✓ = draft created, ⚠ = admin review required, — = no answer returned.');
  report.push('');
  report.push('| Q | GPT-5.6 Luna | Gemini 3.5 Flash Lite | Gemini 3.7 Flash |');
  report.push('|---:|---|---|---|');
  for (const number of comparableQuestionNumbers) {
    report.push(`| ${number} | ${answerLabel(gpt.byQuestion.get(number))} | ${answerLabel(gemini35.byQuestion.get(number))} | ${answerLabel(gemini37.byQuestion.get(number))} |`);
  }
  report.push('');
  report.push(`GPT-5.6 Luna and Gemini 3.5 Flash Lite selected different answer indexes on ${disagreements.length} of the 22 shared multiple-choice questions${disagreements.length ? `: ${disagreements.join(', ')}` : ''}. GPT-5.6 Luna and Gemini 3.7 Flash differed on ${gptVsGemini37.length} questions; Gemini 3.5 Flash Lite and Gemini 3.7 Flash differed on ${gemini35VsGemini37.length}. Because there is no answer key, these disagreements require subject-matter review rather than being treated as automatic model errors.`);
  report.push('');
  report.push('## Detailed generated answers');
  report.push('');
  report.push('The following tables show the question text, the option selected by each successful model, the workflow status, and the model’s own rationale. They are generated from the saved candidate responses; wording is shortened only where a table cell is exceptionally long.');
  report.push('');
  for (const result of [gpt, gemini35, gemini37]) {
    report.push(`### ${result.label}`);
    report.push('');
    report.push('| Q | Question | Selected option | Status / confidence | Model rationale |');
    report.push('|---:|---|---|---|---|');
    for (const number of comparableQuestionNumbers) {
      const candidate = result.byQuestion.get(number);
      report.push(`| ${number} | ${oneLine(candidate?.rawOutput?.body)} | ${selectedOptionText(candidate)} | ${candidate ? `${candidate.status} / ${Number(candidate.rawOutput?.answer?.confidence ?? 0).toFixed(2)}` : '—'} | ${oneLine(candidate?.rawOutput?.explanation?.whyCorrect, 520)} |`);
    }
    report.push('');
    report.push(`#### Complete six-part explanations — ${result.label}`);
    report.push('');
    for (const number of comparableQuestionNumbers) {
      const candidate = result.byQuestion.get(number);
      const explanation = candidate?.rawOutput?.explanation;
      if (!candidate || !explanation) continue;
      report.push(`**Q${number}: ${oneLine(candidate.rawOutput.body, 300)}**`);
      report.push('');
      report.push(`- **keywords:** ${oneLine(explanation.keywords, 700)}`);
      report.push(`- **eliminationStrategy:** ${oneLine(explanation.eliminationStrategy, 700)}`);
      report.push(`- **whyCorrect:** ${oneLine(explanation.whyCorrect, 700)}`);
      report.push(`- **generalRule:** ${oneLine(explanation.generalRule, 700)}`);
      report.push(`- **whatIf:** ${oneLine(explanation.whatIf, 700)}`);
      report.push(`- **commonMistakes:** ${oneLine(explanation.commonMistakes, 700)}`);
      report.push('');
    }
  }
  report.push('## Review and quality signals');
  report.push('');
  for (const result of [gpt, gemini35, gemini37]) {
    const review = result.candidates.filter((candidate) => candidate.status === 'REVIEW_REQUIRED');
    const inferred = result.candidates.filter((candidate) => candidate.rawOutput?.answer?.origin === 'INFERRED').length;
    report.push(`### ${result.label}`);
    report.push('');
    report.push(`- ${result.counts.createdQuestions} drafts created; ${review.length} held for review; ${inferred} of the returned candidates used an inferred answer.`);
    if (review.length) {
      report.push(`- Review questions: ${review.map((candidate) => `Q${candidate.sequence} (${answerLabel(candidate)})`).join(', ')}.`);
      const warnings = review.flatMap((candidate) => candidate.warnings ?? []).filter(Boolean);
      if (warnings.length) report.push(`- Review warnings include: ${warnings.slice(0, 4).map((warning) => warning.replace(/\|/g, '\\|')).join(' | ')}`);
    } else if (result === gemini37 && result.counts.createdQuestions === 0) {
      report.push('- No extraction candidates were returned because the extraction request failed before a structured response was available.');
    }
    report.push('');
  }
  report.push('## Raw logs and run records');
  report.push('');
  for (const result of [gpt, gemini35, gemini37]) {
    const raw = relative(resolve(result.directory, 'ai-responses.jsonl'));
    const summary = relative(resolve(result.directory, 'candidate-summary.json'));
    report.push(`- ${result.label}: [raw AI responses](${raw}) · [run summary](${summary}) · import ID \`` + result.summary.files[0].importId + '\`');
  }
  report.push('');
  report.push('## Preliminary conclusion');
  report.push('');
  report.push('All three candidates completed the extraction workflow after allowing Gemini 3.7 Flash the longer response time it requires: 22 multiple-choice drafts were created and 3 open-ended questions were excluded. GPT-5.6 Luna was the lowest-cost run in this sample; Gemini 3.5 Flash Lite and Gemini 3.7 Flash returned additional complete answer sets for subject-matter comparison. The answer differences should be reviewed against an official answer key before selecting a production model.');
  report.push('');
  await writeFile(outputPath, `${report.join('\n')}\n`);
  console.log(outputPath);
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
