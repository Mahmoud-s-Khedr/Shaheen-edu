CREATE TABLE "StudentQuestionHighlight" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "selectedText" TEXT NOT NULL,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentQuestionHighlight_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentQuestionHighlight_studentUserId_fkey"
    FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentQuestionHighlight_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentQuestionHighlight_offsets_check"
    CHECK ("startOffset" >= 0 AND "endOffset" > "startOffset")
);

CREATE INDEX "StudentQuestionHighlight_studentUserId_questionId_createdAt_id_idx"
  ON "StudentQuestionHighlight"("studentUserId", "questionId", "createdAt", "id");
CREATE INDEX "StudentQuestionHighlight_questionId_idx"
  ON "StudentQuestionHighlight"("questionId");

CREATE TABLE "StudentNotebookPage" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentNotebookPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentNotebookPage_studentUserId_fkey"
    FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StudentNotebookPage_studentUserId_updatedAt_id_idx"
  ON "StudentNotebookPage"("studentUserId", "updatedAt", "id");

CREATE TABLE "SubjectConstant" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubjectConstant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubjectConstant_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SubjectConstant_subjectId_key_key"
  ON "SubjectConstant"("subjectId", "key");
CREATE INDEX "SubjectConstant_subjectId_createdAt_id_idx"
  ON "SubjectConstant"("subjectId", "createdAt", "id");
