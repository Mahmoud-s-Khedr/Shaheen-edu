import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Writes response aggregates in the database so concurrent submissions cannot
 * lose an increment between an application-side read and update.
 */
@Injectable()
export class QuestionCommunityStatsService {
  async recordResponse(
    tx: Prisma.TransactionClient,
    questionId: string,
    correct: boolean,
  ) {
    const correctIncrement = correct ? 1 : 0;
    const incorrectIncrement = correct ? 0 : 1;
    const initialRate = incorrectIncrement * 100;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QuestionCommunityStat" (
        "questionId", "totalResponses", "correctResponses", "incorrectResponses",
        "incorrectRate", "difficultyBand", "calculatedAt"
      )
      VALUES (
        ${questionId}, 1, ${correctIncrement}, ${incorrectIncrement}, ${initialRate},
        CASE
          WHEN ${initialRate} >= 90 THEN 'A_PLUS'::"QuestionDifficultyBand"
          WHEN ${initialRate} >= 85 THEN 'A'::"QuestionDifficultyBand"
          WHEN ${initialRate} >= 80 THEN 'B'::"QuestionDifficultyBand"
          WHEN ${initialRate} >= 70 THEN 'C'::"QuestionDifficultyBand"
          ELSE 'D'::"QuestionDifficultyBand"
        END,
        NOW()
      )
      ON CONFLICT ("questionId") DO UPDATE
      SET
        "totalResponses" = "QuestionCommunityStat"."totalResponses" + EXCLUDED."totalResponses",
        "correctResponses" = "QuestionCommunityStat"."correctResponses" + EXCLUDED."correctResponses",
        "incorrectResponses" = "QuestionCommunityStat"."incorrectResponses" + EXCLUDED."incorrectResponses",
        "incorrectRate" = (
          ("QuestionCommunityStat"."incorrectResponses" + EXCLUDED."incorrectResponses")::double precision
          / ("QuestionCommunityStat"."totalResponses" + EXCLUDED."totalResponses")
        ) * 100,
        "difficultyBand" = CASE
          WHEN (("QuestionCommunityStat"."incorrectResponses" + EXCLUDED."incorrectResponses")::double precision / ("QuestionCommunityStat"."totalResponses" + EXCLUDED."totalResponses")) * 100 >= 90 THEN 'A_PLUS'::"QuestionDifficultyBand"
          WHEN (("QuestionCommunityStat"."incorrectResponses" + EXCLUDED."incorrectResponses")::double precision / ("QuestionCommunityStat"."totalResponses" + EXCLUDED."totalResponses")) * 100 >= 85 THEN 'A'::"QuestionDifficultyBand"
          WHEN (("QuestionCommunityStat"."incorrectResponses" + EXCLUDED."incorrectResponses")::double precision / ("QuestionCommunityStat"."totalResponses" + EXCLUDED."totalResponses")) * 100 >= 80 THEN 'B'::"QuestionDifficultyBand"
          WHEN (("QuestionCommunityStat"."incorrectResponses" + EXCLUDED."incorrectResponses")::double precision / ("QuestionCommunityStat"."totalResponses" + EXCLUDED."totalResponses")) * 100 >= 70 THEN 'C'::"QuestionDifficultyBand"
          ELSE 'D'::"QuestionDifficultyBand"
        END,
        "calculatedAt" = NOW()
    `);
  }
}
