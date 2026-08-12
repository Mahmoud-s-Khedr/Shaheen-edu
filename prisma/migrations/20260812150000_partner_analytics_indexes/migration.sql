CREATE INDEX "Order_status_approvedAt_idx" ON "Order"("status", "approvedAt");
CREATE INDEX "OrderItem_courseId_idx" ON "OrderItem"("courseId");
CREATE INDEX "OrderItem_chapterId_idx" ON "OrderItem"("chapterId");
