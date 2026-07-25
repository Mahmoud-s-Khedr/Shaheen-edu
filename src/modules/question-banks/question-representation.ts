/**
 * Deliberate future delivery shape. Keep this mapper separate from admin and
 * review responses so answer keys and authoring notes cannot leak by default.
 */
export function toStudentQuestionDto(question: any) {
  return {
    id: question.id,
    type: question.type,
    body: question.body,
    scope: question.scope,
    options: (question.options ?? []).map((option: any) => ({ id: option.id, body: option.body, sortOrder: option.sortOrder })),
    assets: (question.assets ?? []).map((reference: any) => ({ assetId: reference.assetId, sortOrder: reference.sortOrder })),
    videoTimestampSeconds: question.videoLink?.timestampSeconds ?? null,
  };
}
