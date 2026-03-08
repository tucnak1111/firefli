import type { NextApiRequest, NextApiResponse } from "next"
import prisma from "@/utils/database"
import { validateApiKey } from "@/utils/api-auth"
import { withPublicApiRateLimit } from "@/utils/prtl"

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const apiKey = req.headers.authorization?.replace("Bearer ", "")
  if (!apiKey) return res.status(401).json({ success: false, error: "Missing API key" })

  const workspaceId = Number.parseInt(req.query.id as string)
  const recommendationId = req.query.recommendationId as string

  if (!workspaceId) return res.status(400).json({ success: false, error: "Missing workspace ID" })
  if (!recommendationId) return res.status(400).json({ success: false, error: "Missing recommendation ID" })

  try {
    const key = await validateApiKey(apiKey, workspaceId.toString())
    if (!key) {
      return res.status(401).json({ success: false, error: "Invalid API key" })
    }

    const recommendation = await prisma.recommendation.findFirst({
      where: {
        id: recommendationId,
        workspaceGroupId: workspaceId,
      },
    })

    if (!recommendation) {
      return res.status(404).json({ success: false, error: "Recommendation not found" })
    }

    if (req.method === "POST") {
      const { userId } = req.body

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing required field: userId"
        })
      }

      try {
        const vote = await prisma.recommendationVote.create({
          data: {
            recommendationId,
            userId: BigInt(userId),
          },
        })

        const voteCount = await prisma.recommendationVote.count({
          where: { recommendationId },
        })

        return res.status(201).json({
          success: true,
          vote: {
            id: vote.id,
            recommendationId: vote.recommendationId,
            userId: Number(vote.userId),
            createdAt: vote.createdAt,
          },
          voteCount,
        })
      } catch (error: any) {
        if (error.code === "P2002") {
          return res.status(409).json({
            success: false,
            error: "User has already voted on this recommendation"
          })
        }
        throw error
      }
    }

    if (req.method === "DELETE") {
      const { userId } = req.body

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing required field: userId"
        })
      }

      try {
        await prisma.recommendationVote.delete({
          where: {
            recommendationId_userId: {
              recommendationId,
              userId: BigInt(userId),
            },
          },
        })

        const voteCount = await prisma.recommendationVote.count({
          where: { recommendationId },
        })

        return res.status(200).json({
          success: true,
          message: "Vote removed successfully",
          voteCount,
        })
      } catch (error: any) {
        if (error.code === "P2025") {
          return res.status(404).json({
            success: false,
            error: "Vote not found"
          })
        }
        throw error
      }
    }

    if (req.method === "GET") {
      const votes = await prisma.recommendationVote.findMany({
        where: {
          recommendationId,
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.status(200).json({
        success: true,
        votes: votes.map(v => ({
          id: v.id,
          userId: Number(v.userId),
          createdAt: v.createdAt,
        })),
        total: votes.length,
      })
    }

    return res.status(405).json({ success: false, error: "Method not allowed" })
  } catch (error: any) {
    console.error("Error in recommendation vote API:", error)
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
}

export default withPublicApiRateLimit(handler)
