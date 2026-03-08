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

    if (req.method === "GET") {
      const recommendation = await prisma.recommendation.findFirst({
        where: {
          id: recommendationId,
          workspaceGroupId: workspaceId,
        },
        include: {
          votes: {
            select: {
              id: true,
              userId: true,
              createdAt: true,
            },
          },
          comments: {
            select: {
              id: true,
              authorId: true,
              authorName: true,
              authorPicture: true,
              content: true,
              image: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      })

      if (!recommendation) {
        return res.status(404).json({ success: false, error: "Recommendation not found" })
      }

      return res.status(200).json({
        success: true,
        recommendation: {
          id: recommendation.id,
          targetUserId: Number(recommendation.targetUserId),
          targetUsername: recommendation.targetUsername,
          targetPicture: recommendation.targetPicture,
          reason: recommendation.reason,
          status: recommendation.status,
          createdById: Number(recommendation.createdById),
          createdByName: recommendation.createdByName,
          editedById: recommendation.editedById ? Number(recommendation.editedById) : null,
          editedByName: recommendation.editedByName,
          editedAt: recommendation.editedAt,
          statusChangedById: recommendation.statusChangedById ? Number(recommendation.statusChangedById) : null,
          statusChangedByName: recommendation.statusChangedByName,
          statusChangedAt: recommendation.statusChangedAt,
          createdAt: recommendation.createdAt,
          updatedAt: recommendation.updatedAt,
          voteCount: recommendation.votes.length,
          votes: recommendation.votes.map(v => ({
            id: v.id,
            userId: Number(v.userId),
            createdAt: v.createdAt,
          })),
          commentCount: recommendation.comments.length,
          comments: recommendation.comments.map(c => ({
            id: c.id,
            authorId: Number(c.authorId),
            authorName: c.authorName,
            authorPicture: c.authorPicture,
            content: c.content,
            image: c.image,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          })),
        },
      })
    }

    if (req.method === "PATCH") {
      const { status, reason, statusChangedById, statusChangedByName, editedById, editedByName } = req.body
      const updateData: any = {}

      if (status !== undefined) {
        const validStatuses = ["active", "approved", "rejected", "archived"]
        if (!validStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
          })
        }

        if (!statusChangedById) {
          return res.status(400).json({
            success: false,
            error: "statusChangedById is required when changing status"
          })
        }

        updateData.status = status
        updateData.statusChangedAt = new Date()
        updateData.statusChangedById = BigInt(statusChangedById)

        if (statusChangedByName !== undefined) {
          updateData.statusChangedByName = statusChangedByName
        }
      }

      if (reason !== undefined) {
        if (!editedById) {
          return res.status(400).json({
            success: false,
            error: "editedById is required when changing reason"
          })
        }

        updateData.reason = reason
        updateData.editedAt = new Date()
        updateData.editedById = BigInt(editedById)

        if (editedByName !== undefined) {
          updateData.editedByName = editedByName
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid fields to update"
        })
      }

      const recommendation = await prisma.recommendation.update({
        where: {
          id: recommendationId,
        },
        data: updateData,
        include: {
          votes: {
            select: {
              userId: true,
              createdAt: true,
            },
          },
          comments: {
            select: {
              id: true,
            },
          },
        },
      })

      return res.status(200).json({
        success: true,
        recommendation: {
          id: recommendation.id,
          targetUserId: Number(recommendation.targetUserId),
          targetUsername: recommendation.targetUsername,
          targetPicture: recommendation.targetPicture,
          reason: recommendation.reason,
          status: recommendation.status,
          createdById: Number(recommendation.createdById),
          createdByName: recommendation.createdByName,
          editedById: recommendation.editedById ? Number(recommendation.editedById) : null,
          editedByName: recommendation.editedByName,
          editedAt: recommendation.editedAt,
          statusChangedById: recommendation.statusChangedById ? Number(recommendation.statusChangedById) : null,
          statusChangedByName: recommendation.statusChangedByName,
          statusChangedAt: recommendation.statusChangedAt,
          createdAt: recommendation.createdAt,
          updatedAt: recommendation.updatedAt,
          voteCount: recommendation.votes.length,
          commentCount: recommendation.comments.length,
        },
      })
    }

    if (req.method === "DELETE") {
      const { deletedById } = req.body

      if (!deletedById) {
        return res.status(400).json({
          success: false,
          error: "deletedById is required to delete recommendation"
        })
      }

      await prisma.recommendation.delete({
        where: {
          id: recommendationId,
        },
      })

      return res.status(200).json({
        success: true,
        message: "Recommendation deleted successfully",
      })
    }

    return res.status(405).json({ success: false, error: "Method not allowed" })
  } catch (error: any) {
    console.error("Error in public recommendation API:", error)
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, error: "Recommendation not found" })
    }
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
}

export default withPublicApiRateLimit(handler)
