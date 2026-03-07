import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/utils/database";
import { withPermissionCheck } from "@/utils/permissionsManager";
import { getConfig } from "@/utils/configEngine";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const workspaceGroupId = parseInt(req.query.id as string);
  const config = await getConfig('recommendations', workspaceGroupId);
  if (!config || !config.enabled) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  const userId = req.session.userid;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Not logged in" });
  }

  const recId = req.query.recId as string;

  const recommendation = await prisma.recommendation.findFirst({
    where: { id: recId, workspaceGroupId },
  });

  if (!recommendation) {
    return res.status(404).json({ success: false, error: "Not found" });
  }

  // Check if already voted
  const existingVote = await prisma.recommendationVote.findUnique({
    where: {
      recommendationId_userId: {
        recommendationId: recId,
        userId: BigInt(userId),
      },
    },
  });

  if (existingVote) {
    // Toggle: remove vote
    await prisma.recommendationVote.delete({
      where: { id: existingVote.id },
    });

    const voteCount = await prisma.recommendationVote.count({
      where: { recommendationId: recId },
    });

    return res.status(200).json({ success: true, voted: false, voteCount });
  }

  // Create vote
  await prisma.recommendationVote.create({
    data: {
      recommendationId: recId,
      userId: BigInt(userId),
    },
  });

  const voteCount = await prisma.recommendationVote.count({
    where: { recommendationId: recId },
  });

  return res.status(200).json({ success: true, voted: true, voteCount });
}

export default withPermissionCheck(handler, "vote_recommendations");
