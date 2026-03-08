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

    if (req.method === "GET") {
      const { limit = "50", offset = "0", sortOrder = "desc" } = req.query

      const [comments, total] = await Promise.all([
        prisma.recommendationComment.findMany({
          where: {
            recommendationId,
          },
          orderBy: {
            createdAt: sortOrder === "asc" ? "asc" : "desc",
          },
          take: Math.min(Number.parseInt(limit as string), 100),
          skip: Number.parseInt(offset as string),
        }),
        prisma.recommendationComment.count({
          where: { recommendationId },
        }),
      ])

      const formattedComments = comments.map((comment) => ({
        id: comment.id,
        recommendationId: comment.recommendationId,
        authorId: Number(comment.authorId),
        authorName: comment.authorName,
        authorPicture: comment.authorPicture,
        content: comment.content,
        image: comment.image,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      }))

      return res.status(200).json({
        success: true,
        comments: formattedComments,
        total,
        limit: Number.parseInt(limit as string),
        offset: Number.parseInt(offset as string),
      })
    }

    if (req.method === "POST") {
      const { authorId, authorName, authorPicture, content, image } = req.body

      if (!authorId || !content) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: authorId, content"
        })
      }

      if (typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "Content must be a non-empty string"
        })
      }

      if (content.length > 2000) {
        return res.status(400).json({
          success: false,
          error: "Content must not exceed 2000 characters"
        })
      }

      const comment = await prisma.recommendationComment.create({
        data: {
          recommendationId,
          authorId: BigInt(authorId),
          authorName: authorName || null,
          authorPicture: authorPicture || null,
          content: content.trim(),
          image: image || null,
        },
      })

      return res.status(201).json({
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
    console.error("Error in recommendation comments API:", error)
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
}

export default withPublicApiRateLimit(handler)
