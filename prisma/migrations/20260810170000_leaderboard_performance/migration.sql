CREATE TABLE "AssessmentAnswerChange" ("id" TEXT NOT NULL, "attemptAnswerId" TEXT NOT NULL, "fromOptionIds" TEXT[] NOT NULL, "toOptionIds" TEXT[] NOT NULL, "fromOutcome" "AssessmentQuestionOutcome" NOT NULL, "toOutcome" "AssessmentQuestionOutcome" NOT NULL, "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AssessmentAnswerChange_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AssessmentAnswerChange_attemptAnswerId_changedAt_idx" ON "AssessmentAnswerChange"("attemptAnswerId", "changedAt");
ALTER TABLE "AssessmentAnswerChange" ADD CONSTRAINT "AssessmentAnswerChange_attemptAnswerId_fkey" FOREIGN KEY ("attemptAnswerId") REFERENCES "AssessmentAttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LeaderboardWeek" ("id" TEXT NOT NULL, "weekKey" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "finalizedAt" TIMESTAMP(3), "finalizedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LeaderboardWeek_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "LeaderboardWeek_weekKey_key" ON "LeaderboardWeek"("weekKey");
CREATE INDEX "LeaderboardWeek_startsAt_endsAt_idx" ON "LeaderboardWeek"("startsAt", "endsAt");
ALTER TABLE "LeaderboardWeek" ADD CONSTRAINT "LeaderboardWeek_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LeaderboardEntry" ("id" TEXT NOT NULL, "weekId" TEXT NOT NULL, "studentUserId" TEXT NOT NULL, "academicGradeId" TEXT, "displayName" TEXT NOT NULL, "rank" INTEGER NOT NULL, "quizzesCompleted" INTEGER NOT NULL, "totalQuestions" INTEGER NOT NULL, "answeredQuestions" INTEGER NOT NULL, "correctAnswers" INTEGER NOT NULL, "smartScore" DOUBLE PRECISION NOT NULL, "accuracyPercent" DOUBLE PRECISION NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "LeaderboardEntry_weekId_studentUserId_key" ON "LeaderboardEntry"("weekId", "studentUserId");
CREATE INDEX "LeaderboardEntry_weekId_academicGradeId_rank_idx" ON "LeaderboardEntry"("weekId", "academicGradeId", "rank");
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "LeaderboardWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LeaderboardAward" ("id" TEXT NOT NULL, "entryId" TEXT NOT NULL, "tier" TEXT NOT NULL, "label" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LeaderboardAward_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "LeaderboardAward_entryId_key" ON "LeaderboardAward"("entryId");
ALTER TABLE "LeaderboardAward" ADD CONSTRAINT "LeaderboardAward_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LeaderboardEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
