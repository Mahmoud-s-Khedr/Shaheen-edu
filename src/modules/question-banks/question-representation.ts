/**
 * Deliberate future delivery shape. Keep this mapper separate from admin and
 * review responses so answer keys and authoring notes cannot leak by default.
 */
export function toStudentContentBlockDto(block: any) {
  return {
    id: block.id,
    type: block.type,
    sortOrder: block.sortOrder,
    text: block.text,
    assetId: block.assetId,
    tableData: block.tableData,
    latex: block.latex,
    mathml: block.mathml,
    caption: block.caption,
    altText: block.altText,
    languageCode: block.languageCode,
    asset: block.asset
      ? {
          id: block.asset.id,
          kind: block.asset.kind,
          filename: block.asset.filename,
        }
      : undefined,
  };
}

export function toStudentQuestionDto(question: any) {
  return {
    id: question.id,
    type: question.type,
    body: question.body,
    contentBlocks: (question.contentBlocks ?? []).map(toStudentContentBlockDto),
    scope: question.scope,
    options: (question.options ?? []).map((option: any) => ({
      id: option.id,
      body: option.body,
      contentBlocks: (option.contentBlocks ?? []).map(toStudentContentBlockDto),
      sortOrder: option.sortOrder,
    })),
    assets: (question.assets ?? []).map((reference: any) => ({
      assetId: reference.assetId,
      sortOrder: reference.sortOrder,
    })),
    video: question.videoLink
      ? {
          assetId: question.videoLink.videoAssetId,
          assetName: question.videoLink.videoAsset?.asset?.filename ?? null,
          timestampSeconds: question.videoLink.timestampSeconds,
        }
      : null,
  };
}
