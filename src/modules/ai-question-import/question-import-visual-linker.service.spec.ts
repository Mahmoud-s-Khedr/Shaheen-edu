import {
  QuestionImportMediaAssignmentStatus,
  QuestionImportMediaCropCompleteness,
  QuestionImportVisualRequirementKind,
  QuestionImportVisualResolutionState,
} from '../../common/types/roles.enum';
import { QuestionImportVisualLinkerService } from './question-import-visual-linker.service';

describe('QuestionImportVisualLinkerService', () => {
  const linker = new QuestionImportVisualLinkerService();
  const media = (
    key: string,
    completeness: QuestionImportMediaCropCompleteness = QuestionImportMediaCropCompleteness.COMPLETE,
  ) => ({
    mediaKey: key,
    pageNumber: 3,
    checksum: key,
    cropCompleteness: completeness,
    normalizedBounds: { left: 100, top: 100, right: 300, bottom: 300 },
  });

  it('requires every separate image option and never resolves proposals', () => {
    const [requirement] = linker.requirements(
      {
        options: [
          { body: null },
          { body: null },
          { body: null },
          { body: null },
        ],
        mediaAssignments: [],
      },
      { page: 3 },
    );
    expect(requirement).toMatchObject({
      kind: QuestionImportVisualRequirementKind.OPTION_IMAGE_SET,
      expectedCardinality: 4,
      optionIndexes: [0, 1, 2, 3],
    });
    const assignments: Array<{
      mediaKey: string;
      owner: string;
      ownerReference: string;
      status: QuestionImportMediaAssignmentStatus;
      media: ReturnType<typeof media>;
    }> = [0, 1, 2, 3].map((index) => ({
      mediaKey: `M${index}`,
      owner: 'OPTION',
      ownerReference: `OPTION:${index}`,
      status: QuestionImportMediaAssignmentStatus.PROPOSED,
      media: media(`M${index}`),
    }));
    expect(
      linker.resolve(
        requirement,
        assignments,
        assignments.map((item) => item.media),
      ).state,
    ).toBe(QuestionImportVisualResolutionState.PENDING);
    assignments.forEach((item) => {
      item.status = QuestionImportMediaAssignmentStatus.APPROVED;
    });
    expect(
      linker.resolve(
        requirement,
        assignments,
        assignments.map((item) => item.media),
      ).state,
    ).toBe(QuestionImportVisualResolutionState.RESOLVED);
  });

  it('blocks possibly clipped and incomplete crops even after approval', () => {
    const requirement = {
      kind: QuestionImportVisualRequirementKind.QUESTION_FIGURE,
      owner: 'QUESTION',
      ownerReference: 'QUESTION',
      expectedCardinality: 1,
      sourcePage: 3,
    };
    const assignment = {
      mediaKey: 'M1',
      owner: 'QUESTION',
      ownerReference: 'QUESTION',
      status: QuestionImportMediaAssignmentStatus.APPROVED,
      media: media('M1', QuestionImportMediaCropCompleteness.POSSIBLY_CLIPPED),
    };
    expect(
      linker.resolve(requirement, [assignment], [assignment.media]),
    ).toMatchObject({
      state: QuestionImportVisualResolutionState.INCOMPLETE_CROP,
    });
  });

  it('ranks same-page candidates deterministically', () => {
    const requirement = {
      kind: QuestionImportVisualRequirementKind.QUESTION_FIGURE,
      sourcePage: 3,
      expectedCardinality: 1,
      sourceEnvelope: { bottom: 250 },
    };
    const rankings = linker.rank(requirement, [
      media('M2'),
      media('M1'),
      { ...media('M3'), pageNumber: 4 },
    ]);
    expect(rankings.map((item) => item.mediaKey)).toEqual(['M1', 'M2']);
  });

  it('propagates question geometry and requires assigned label-only option images', () => {
    const [requirement] = linker.requirements(
      {
        options: [{ body: 'أ' }, { body: 'ب' }],
        mediaAssignments: [
          { mediaKey: 'M1', owner: 'OPTION', ownerReference: 'OPTION:0' },
          { mediaKey: 'M2', owner: 'OPTION', ownerReference: 'OPTION:1' },
        ],
      },
      { page: 3, envelope: { left: 600, top: 300, right: 950, bottom: 500 } },
    );
    expect(requirement).toMatchObject({
      kind: QuestionImportVisualRequirementKind.OPTION_IMAGE_SET,
      optionIndexes: [0, 1],
      expectedCardinality: 2,
      sourceEnvelope: { top: 300, bottom: 500 },
    });
  });

  it('does not resolve a figure assigned far from its question geometry', () => {
    const requirement = {
      kind: QuestionImportVisualRequirementKind.QUESTION_FIGURE,
      owner: 'QUESTION',
      ownerReference: 'QUESTION',
      expectedCardinality: 1,
      sourcePage: 3,
      sourceEnvelope: { left: 600, top: 700, right: 950, bottom: 800 },
    };
    const assignment = {
      mediaKey: 'M1',
      owner: 'QUESTION',
      ownerReference: 'QUESTION',
      status: QuestionImportMediaAssignmentStatus.APPROVED,
      media: {
        ...media('M1'),
        normalizedBounds: { left: 50, top: 100, right: 300, bottom: 250 },
      },
    };
    expect(
      linker.resolve(requirement, [assignment], [assignment.media]),
    ).toMatchObject({
      state: QuestionImportVisualResolutionState.AMBIGUOUS,
    });
  });
});
