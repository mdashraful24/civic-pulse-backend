CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "issues_moderationStatus_createdAt_idx" ON "issues"("moderationStatus", "createdAt" DESC);
CREATE INDEX "issues_moderationStatus_updatedAt_idx" ON "issues"("moderationStatus", "updatedAt" DESC);
CREATE INDEX "issues_moderationStatus_priority_createdAt_idx" ON "issues"("moderationStatus", "priority" DESC, "createdAt" DESC);
CREATE INDEX "issues_reporterId_createdAt_idx" ON "issues"("reporterId", "createdAt" DESC);
CREATE INDEX "issues_assigneeId_createdAt_idx" ON "issues"("assigneeId", "createdAt" DESC);
CREATE INDEX "issues_title_idx" ON "issues" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "issues_description_idx" ON "issues" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "issues_location_idx" ON "issues" USING GIN ("location" gin_trgm_ops);
