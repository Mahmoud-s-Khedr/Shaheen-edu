-- CreateIndex
CREATE INDEX "User_role_createdAt_id_idx" ON "User"("role", "createdAt", "id");

-- CreateIndex
CREATE INDEX "StudentProfile_parentPhoneNormalized_createdAt_userId_idx" ON "StudentProfile"("parentPhoneNormalized", "createdAt", "userId");
