# AI Question Import Explanation Integration Guide

This guide covers the explanation fields accepted by the review endpoint:

```http
POST /api/v1/admin/ai/question-imports/:importId/items/:itemId/accept
```

## `candidate.explanation`

`candidate.explanation` is required. It is the normal, student-facing
explanation stored with the accepted question and displayed alongside it.

```json
{
  "candidate": {
    "explanation": "The cell wall supports the cell and preserves its shape."
  }
}
```

## `candidate.structuredExplanation`

`candidate.structuredExplanation` is optional supplementary AI study guidance.
It does not replace `candidate.explanation`; send both fields when the question
needs the richer, sectioned explanation.

When included, all six fields are required and each must be a non-empty string:

```json
{
  "candidate": {
    "explanation": "The cell wall supports the cell and preserves its shape.",
    "structuredExplanation": {
      "keywords": "cell wall, support, cell shape",
      "eliminationStrategy": "Eliminate the cell membrane because it is present in many cell types.",
      "whyCorrect": "The cell wall gives the cell support and helps it keep its shape.",
      "generalRule": "Cell walls provide rigidity and structural support.",
      "whatIf": "Without a cell wall, the cell has less structural stability.",
      "commonMistakes": "Do not confuse the cell wall with the cell membrane."
    }
  }
}
```

Omit `structuredExplanation` when the normal explanation is sufficient. If it
is supplied with any missing or blank section, the endpoint returns `400 Bad
Request` with `Structured explanation must contain all six explanation
sections`.

## Field comparison

| Field | Required | Purpose |
| --- | --- | --- |
| `candidate.explanation` | Yes | Standard, student-facing question explanation. |
| `candidate.structuredExplanation` | No | Six-part AI study guidance retained with the accepted question. |
