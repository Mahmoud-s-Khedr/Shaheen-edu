# Shared-subject rollout notes

The `20260909000000_share_courses_by_subject` migration changes the hierarchy
from grade-owned courses to courses shared through a subject's `SubjectGrade`
assignments. It removes the legacy `academicGradeId` columns from `Subject`,
`Course`, and `ContentPlacement`.

## Duplicate-data handling

The migration no longer stops when legacy grades contain separate subjects with
the same slug. It chooses one canonical subject per slug, preferring a
published subject and then the oldest row. It repoints courses, question banks,
assessments, assessment snapshots, content placements, constants, and grade
assignments to that identity before deleting the redundant subject records.

Courses that would otherwise have the same `(subjectId, slug)` are retained and
renamed deterministically to `<old-slug>--legacy-<course-id>`. Subject constants
with a conflicting key are retained as `<old-key>--legacy-<constant-id>`. Grade
and course ordering is renumbered to a sequential order after the merge.

Run the migration against a production copy first and retain the old-to-new
course-slug mapping from the database backup for redirects or external links.

## Follow-up test fixture contract

Assessment visibility fixtures must model grade membership through
`course.subject.gradeAssignments`, with each assignment carrying an
`academicGradeId` and its `academicGrade.status`. The removed
`course.academicGradeId`, `course.academicGrade`, and
`subject.academicGradeId` fields cannot be used by fixtures or API clients.

The current assessment unit fixtures have not yet been migrated to this shape;
they therefore fail before testing visibility behavior. This is documented here
so the fixture update is treated as a required follow-up rather than mistaken
for an application authorization failure.

## Learner-library grade representation

A shared course can have more than one published grade. The learner-library
endpoint still exposes a singular `academicGrade` property, so it cannot
unambiguously represent that relationship. Until its response contract is
expanded to return the complete grade collection (or a grade selected by an
explicit rule), clients must not use that singular property to infer which
grades may access the course. Use the subject's grade-assignment data from the
catalogue endpoints for access and availability decisions.
