import type { NextApiRequest, NextApiResponse } from "next"
import prisma from "@/utils/database"
import { validateApiKey } from "@/utils/api-auth"
import { withPublicApiRateLimit } from "@/utils/prtl"

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const apiKey = req.headers.authorization?.replace("Bearer ", "")
  if (!apiKey) return res.status(401).json({ success: false, error: "Missing API key" })

  const workspaceId = Number.parseInt(req.query.id as string)
  const recommendationId = req.query.recommendationId as string
  const commentId = req.query.commentId as string

  if (!workspaceId) return res.status(400).json({ success: false, error: "Missing workspace ID" })
  if (!recommendationId) return res.status(400).json({ success: false, error: "Missing recommendation ID" })
  if (!commentId) return res.status(400).json({ success: false, error: "Missing comment ID" })

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

    if (req.method === "GET") {
      const comment = await prisma.recommendationComment.findFirst({
        where: {
          id: commentId,
          recommendationId,
        },
      })

      if (!comment) {
        return res.status(404).json({ success: false, error: "Comment not found" })
      }

      return res.status(200).json({
        success: true,
        comment: {
          id: comment.id,
          recommendationId: comment.recommendationId,
          authorId: Number(comment.authorId),
          authorName: comment.authorName,
          authorPicture: comment.authorPicture,
          content: comment.content,
          image: comment.image,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        },
      })
    }

    return res.status(405).json({ success: false, error: "Method not allowed" })
  } catch (error: any) {
    console.error("Error in recommendation comment API:", error)
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, error: "Comment not found" })
    }
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
}

export default withPublicApiRateLimit(handler)
