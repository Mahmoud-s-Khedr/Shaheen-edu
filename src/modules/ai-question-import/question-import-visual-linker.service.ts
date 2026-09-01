import { createHash } from 'node:crypto';
import {
  QuestionImportMediaAssignmentOwner,
  QuestionImportMediaAssignmentStatus,
  QuestionImportMediaCropCompleteness,
  QuestionImportVisualRequirementKind,
  QuestionImportVisualResolutionState,
} from '../../common/types/roles.enum';

type Assignment = {
  mediaKey: string;
  owner: string;
  ownerReference: string;
  status: string;
  media: any;
  confidence?: number | null;
};

/**
 * Pure deterministic ownership policy. It intentionally does not use model
 * confidence as an acceptance signal; scores merely make review repeatable.
 */
export class QuestionImportVisualLinkerService {
  requirements(candidate: any, source: any) {
    const assignments = candidate.mediaAssignments ?? [];
    const missingOptionIndexes = (candidate.options ?? [])
      .map((option: any, index: number) => (!option?.body ? index : null))
      .filter((index: number | null): index is number => index !== null);
    const page = source.page ?? source.pageNumbers?.[0] ?? null;
    // Keep the source geometry on the in-memory requirement as well as the
    // persisted record.  Resolution happens before persistence, so storing it
    // only in QuestionImportVisualRequirement made every rank page-wide.
    const sourceEnvelope = source.envelope?.bounds ?? source.envelope ?? null;
    const requirements: any[] = [];
    if (missingOptionIndexes.length) {
      const questionOwned = assignments.some(
        (a: any) => a.owner === 'QUESTION',
      );
      requirements.push({
        requirementKey: questionOwned ? 'composite-options' : 'option-images',
        kind: questionOwned
          ? QuestionImportVisualRequirementKind.COMPOSITE_OPTION_FIGURE
          : QuestionImportVisualRequirementKind.OPTION_IMAGE_SET,
        sourcePage: page,
        owner: questionOwned
          ? QuestionImportMediaAssignmentOwner.QUESTION
          : QuestionImportMediaAssignmentOwner.OPTION,
        ownerReference: questionOwned ? 'QUESTION' : null,
        optionIndexes: missingOptionIndexes,
        expectedCardinality: questionOwned ? 1 : missingOptionIndexes.length,
        sourceEnvelope,
      });
    }
    // A textual option label (for example, أ / ب / ج / د) does not make the
    // visual optional.  If a crop is assigned to an option, it is part of the
    // answer contract and must resolve before the candidate can be accepted.
    const assignedOptionIndexes = [
      ...new Set(
        assignments
          .filter((assignment: any) => assignment.owner === 'OPTION')
          .map((assignment: any) =>
            Number(/^OPTION:(\d+)$/.exec(assignment.ownerReference)?.[1]),
          )
          .filter(Number.isInteger),
      ),
    ];
    if (
      assignedOptionIndexes.length &&
      !requirements.some(
        (requirement) =>
          requirement.owner === QuestionImportMediaAssignmentOwner.OPTION,
      )
    ) {
      requirements.push({
        requirementKey: 'assigned-option-images',
        kind: QuestionImportVisualRequirementKind.OPTION_IMAGE_SET,
        sourcePage: page,
        sourceEnvelope,
        owner: QuestionImportMediaAssignmentOwner.OPTION,
        ownerReference: null,
        optionIndexes: assignedOptionIndexes,
        expectedCardinality: assignedOptionIndexes.length,
      });
    }
    for (const assignment of assignments) {
      if (
        assignment.owner === 'QUESTION' &&
        !requirements.some((r) => r.owner === 'QUESTION')
      )
        requirements.push({
          requirementKey: 'question-figure',
          kind: QuestionImportVisualRequirementKind.QUESTION_FIGURE,
          sourcePage: page,
          sourceEnvelope,
          owner: QuestionImportMediaAssignmentOwner.QUESTION,
          ownerReference: 'QUESTION',
          optionIndexes: [],
          expectedCardinality: 1,
        });
      if (assignment.owner === 'CONTEXT')
        requirements.push({
          requirementKey: `shared:${assignment.ownerReference}`,
          kind: QuestionImportVisualRequirementKind.SHARED_STIMULUS,
          sourcePage: page,
          sourceEnvelope: null,
          owner: QuestionImportMediaAssignmentOwner.CONTEXT,
          ownerReference: assignment.ownerReference,
          optionIndexes: [],
          expectedCardinality: 1,
        });
    }
    return requirements.length
      ? requirements
      : [
          {
            requirementKey: 'none',
            kind: QuestionImportVisualRequirementKind.NONE,
            sourcePage: page,
            sourceEnvelope,
            owner: null,
            ownerReference: null,
            optionIndexes: [],
            expectedCardinality: 0,
          },
        ];
  }

  rank(requirement: any, media: any[]) {
    const samePage = media.filter(
      (row) =>
        !requirement.sourcePage || row.pageNumber === requirement.sourcePage,
    );
    return samePage
      .map((row) => {
        const bounds = row.normalizedBounds ?? {};
        const geometry =
          requirement.sourceEnvelope?.bottom == null
            ? 0
            : Math.max(
                0,
                1 -
                  Math.abs(
                    (bounds.top ?? 500) - requirement.sourceEnvelope.bottom,
                  ) /
                    1000,
              );
        const type =
          row.type === 'OPTION_IMAGE' &&
          requirement.kind ===
            QuestionImportVisualRequirementKind.OPTION_IMAGE_SET
            ? 0.2
            : 0;
        const score = Number((0.6 + geometry * 0.3 + type * 0.1).toFixed(6));
        return {
          mediaKey: row.mediaKey,
          score,
          components: { samePage: 0.6, geometry, type },
          bounds: row.normalizedBounds,
        };
      })
      .sort(
        (a, b) => b.score - a.score || a.mediaKey.localeCompare(b.mediaKey),
      );
  }

  isSpatiallyCompatible(requirement: any, media: any) {
    if (!requirement.sourcePage || !media?.pageNumber) return true;
    if (requirement.sourcePage !== media.pageNumber) return false;
    // Shared contexts may intentionally sit away from the question that uses
    // them.  Question and option figures must be adjacent to their source.
    if (
      !requirement.sourceEnvelope ||
      requirement.kind === QuestionImportVisualRequirementKind.SHARED_STIMULUS
    )
      return true;
    const source = requirement.sourceEnvelope;
    const bounds = media.normalizedBounds;
    if (!bounds) return false;
    const verticalGap = Math.max(
      0,
      (bounds.top ?? 1000) - (source.bottom ?? 0),
      (source.top ?? 1000) - (bounds.bottom ?? 0),
    );
    // PDF questions are commonly right-to-left text beside a left-hand
    // diagram, so horizontal separation alone must not reject a valid figure.
    return verticalGap <= 180;
  }

  resolve(requirement: any, assignments: Assignment[], allMedia: any[]) {
    if (requirement.kind === QuestionImportVisualRequirementKind.NONE)
      return {
        state: QuestionImportVisualResolutionState.NOT_REQUIRED,
        reason: null,
        rankings: [],
      };
    const relevant = assignments.filter((a) => {
      if (requirement.owner === QuestionImportMediaAssignmentOwner.OPTION)
        return (
          a.owner === 'OPTION' &&
          (requirement.optionIndexes ?? []).includes(
            Number(a.ownerReference.slice(7)),
          )
        );
      return (
        a.owner === requirement.owner &&
        a.ownerReference === requirement.ownerReference
      );
    });
    const rankings = this.rank(requirement, allMedia);
    if (relevant.some((assignment: any) => assignment.conflicting))
      return {
        state: QuestionImportVisualResolutionState.AMBIGUOUS,
        reason: 'Visual is already exclusively owned by another candidate.',
        rankings,
      };
    if (
      relevant.some(
        (assignment) =>
          !this.isSpatiallyCompatible(requirement, assignment.media),
      )
    )
      return {
        state: QuestionImportVisualResolutionState.AMBIGUOUS,
        reason: 'Assigned visual is outside the source question geometry.',
        rankings,
      };
    if (
      relevant.some(
        (a) =>
          a.media.cropCompleteness ===
          QuestionImportMediaCropCompleteness.INCOMPLETE,
      )
    )
      return {
        state: QuestionImportVisualResolutionState.INCOMPLETE_CROP,
        reason: 'An assigned crop is incomplete.',
        rankings,
      };
    if (
      relevant.some(
        (a) =>
          a.media.cropCompleteness ===
            QuestionImportMediaCropCompleteness.POSSIBLY_CLIPPED ||
          a.media.cropCompleteness ===
            QuestionImportMediaCropCompleteness.UNKNOWN,
      )
    )
      return {
        state: QuestionImportVisualResolutionState.INCOMPLETE_CROP,
        reason: 'Assigned crop completeness has not been verified.',
        rankings,
      };
    if (relevant.length !== requirement.expectedCardinality)
      return {
        state: QuestionImportVisualResolutionState.UNRESOLVED,
        reason: `Expected exactly ${requirement.expectedCardinality} approved visual assignment(s), found ${relevant.length}.`,
        rankings,
      };
    if (
      relevant.some(
        (a) => a.status !== QuestionImportMediaAssignmentStatus.APPROVED,
      )
    )
      return {
        state: QuestionImportVisualResolutionState.PENDING,
        reason: 'Every required assignment must be explicitly approved.',
        rankings,
      };
    // A crop cannot silently serve unrelated candidate owners. Context is the
    // only exception and its bounded context key is part of the owner identity.
    const ownerKeys = new Set(
      relevant.map((a) => `${a.mediaKey}:${a.owner}:${a.ownerReference}`),
    );
    if (
      ownerKeys.size !== relevant.length ||
      (requirement.kind !==
        QuestionImportVisualRequirementKind.COMPOSITE_OPTION_FIGURE &&
        new Set(relevant.map((a) => a.mediaKey)).size !== relevant.length)
    )
      return {
        state: QuestionImportVisualResolutionState.AMBIGUOUS,
        reason: 'Conflicting visual ownership.',
        rankings,
      };
    return {
      state: QuestionImportVisualResolutionState.RESOLVED,
      reason: null,
      rankings,
    };
  }

  evidenceVersion(assignments: Assignment[]) {
    return createHash('sha256')
      .update(
        assignments
          .filter(
            (a) => a.status === QuestionImportMediaAssignmentStatus.APPROVED,
          )
          .map(
            (a) =>
              `${a.mediaKey}:${a.owner}:${a.ownerReference}:${a.media.checksum ?? ''}`,
          )
          .sort()
          .join('|'),
      )
      .digest('hex');
  }
}
