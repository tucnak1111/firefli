-- CreateTable
CREATE TABLE "Recommendation" (
    "id" UUID NOT NULL,
    "workspaceGroupId" INTEGER NOT NULL,
    "targetUserId" BIGINT NOT NULL,
    "targetUsername" TEXT NOT NULL,
    "targetPicture" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" BIGINT NOT NULL,
    "createdByName" TEXT,
    "editedById" BIGINT,
    "editedByName" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationVote" (
    "id" UUID NOT NULL,
    "recommendationId" UUID NOT NULL,
    "userId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationComment" (
    "id" UUID NOT NULL,
    "recommendationId" UUID NOT NULL,
    "authorId" BIGINT NOT NULL,
    "authorName" TEXT,
    "authorPicture" TEXT,
    "content" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recommendation_workspaceGroupId_status_idx" ON "Recommendation"("workspaceGroupId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_workspaceGroupId_createdAt_idx" ON "Recommendation"("workspaceGroupId", "createdAt");

-- CreateIndex
CREATE INDEX "Recommendation_targetUserId_idx" ON "Recommendation"("targetUserId");

-- CreateIndex
CREATE INDEX "RecommendationVote_recommendationId_idx" ON "RecommendationVote"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationVote_recommendationId_userId_key" ON "RecommendationVote"("recommendationId", "userId");

-- CreateIndex
CREATE INDEX "RecommendationComment_recommendationId_createdAt_idx" ON "RecommendationComment"("recommendationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_workspaceGroupId_fkey" FOREIGN KEY ("workspaceGroupId") REFERENCES "workspace"("groupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationVote" ADD CONSTRAINT "RecommendationVote_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationComment" ADD CONSTRAINT "RecommendationComment_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" BIGINT,
ADD COLUMN     "statusChangedByName" TEXT;
