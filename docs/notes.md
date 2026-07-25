  Two things to know before Phase 5:

  1. A convention violation I did not fix: ContentAccessPolicyService.assertContentItemAccess returns the raw Prisma model with its whole nested ancestry, and both student-content.controller.ts and
  public-content.controller.ts serialize it straight to the client (~2.5 KB responses including internal IDs and ancestor records). That breaks "public and student response DTOs deliberately select fields; they never
  serialize Prisma models directly." Fixing it changes the student/catalog response shape, so it's a deliberate API decision — it belongs in Phase 5 alongside the catalog DTOs rather than slipped into a test commit.
  2. pnpm lint runs eslint --fix, and the committed source is not prettier-formatted — running it rewrites ~55 files (129 pre-existing errors). I reverted that churn; use npx eslint <paths> to check without rewriting.
