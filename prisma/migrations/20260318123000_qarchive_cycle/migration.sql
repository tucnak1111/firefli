-- AlterTable
ALTER TABLE "UserQuotaCompletion"
ADD COLUMN "archiveCycleId" TEXT NOT NULL DEFAULT 'active';

-- DropIndex
DROP INDEX IF EXISTS "UserQuotaCompletion_quotaId_userId_workspaceGroupId_archive_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserQuotaCompletion_quotaId_userId_workspaceGroupId_archive_archiveCycleId_key"
ON "UserQuotaCompletion"("quotaId", "userId", "workspaceGroupId", "archived", "archiveCycleId");
