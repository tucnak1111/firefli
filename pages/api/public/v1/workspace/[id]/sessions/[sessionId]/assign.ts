import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/utils/database";
import { validateApiKey } from "@/utils/api-auth";
import { withPublicApiRateLimit } from "@/utils/prtl";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(401).json({ success: false, error: "Missing API key" });
  }

  const workspaceId = Number.parseInt(req.query.id as string);
  const sessionId = req.query.sessionId as string;

  if (!workspaceId) {
    return res
      .status(400)
      .json({ success: false, error: "Missing workspace ID" });
  }

  if (!sessionId) {
    return res
      .status(400)
      .json({ success: false, error: "Missing session ID" });
  }

  const { userId, roleId, slot, action, ownerId } = req.body;

  try {
    const key = await validateApiKey(apiKey, workspaceId);
    if (!key) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid or expired API key" });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        sessionType: {
          include: {
            workspace: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }

    if (session.sessionType.workspace.groupId !== workspaceId) {
      return res.status(403).json({
        success: false,
        error: "Session does not belong to this workspace",
      });
    }

    if (ownerId !== undefined) {
      const newOwnerId = ownerId ? BigInt(ownerId) : null;

      await prisma.session.update({
        where: { id: sessionId },
        data: { ownerId: newOwnerId },
      });

      await prisma.sessionLog.create({
        data: {
          sessionId: sessionId,
          actorId: key.createdById,
          targetId: newOwnerId,
          action: newOwnerId ? "host_claimed" : "host_unclaimed",
          metadata: {
            createdVia: "public_api",
          },
        },
      });
    }

    if (action && userId && roleId !== undefined && slot !== undefined) {
      const userIdBigInt = BigInt(userId);
      if (action === "assign") {
        const existingAssignment = await prisma.sessionUser.findUnique({
          where: {
            userid_sessionid_roleID_slot: {
              userid: userIdBigInt,
              sessionid: sessionId,
              roleID: roleId,
              slot: slot,
            },
          },
        });

        if (existingAssignment) {
          return res.status(400).json({
            success: false,
            error: "User already assigned to this slot",
          });
        }

        await prisma.sessionUser.create({
          data: {
            userid: userIdBigInt,
            sessionid: sessionId,
            roleID: roleId,
            slot: slot,
          },
        });

        await prisma.sessionLog.create({
          data: {
            sessionId: sessionId,
            actorId: key.createdById,
            targetId: userIdBigInt,
            action: "role_assigned",
            metadata: {
              roleId: roleId,
              slot: slot,
              createdVia: "public_api",
            },
          },
        });
      } else if (action === "unassign") {
        await prisma.sessionUser.deleteMany({
          where: {
            userid: userIdBigInt,
            sessionid: sessionId,
            roleID: roleId,
            slot: slot,
          },
        });

        await prisma.sessionLog.create({
          data: {
            sessionId: sessionId,
            actorId: key.createdById,
            targetId: userIdBigInt,
            action: "role_unassigned",
            metadata: {
              roleId: roleId,
              slot: slot,
              createdVia: "public_api",
            },
          },
        });
      } else {
        return res.status(400).json({
          success: false,
          error: "Invalid action. Must be 'assign' or 'unassign'",
        });
      }
    }

    const updatedSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        users: {
          include: {
            user: {
              select: {
                userid: true,
                username: true,
                displayName: true,
                picture: true,
              },
            },
          },
        },
        owner: {
          select: {
            userid: true,
            username: true,
            displayName: true,
            picture: true,
          },
        },
        sessionType: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Session updated successfully",
      session: {
        id: updatedSession!.id,
        name: updatedSession!.name,
        date: updatedSession!.date,
        ownerId: updatedSession!.ownerId?.toString(),
        owner: updatedSession!.owner
          ? {
              userId: updatedSession!.owner.userid.toString(),
              username: updatedSession!.owner.username,
              displayName: updatedSession!.owner.displayName,
              picture: updatedSession!.owner.picture,
            }
          : null,
        assignments: updatedSession!.users.map((su) => ({
          userId: su.userid.toString(),
          username: su.user.username,
          displayName: su.user.displayName,
          roleId: su.roleID,
          slot: su.slot,
        })),
      },
    });
  } catch (error) {
    console.error("Error updating session assignments:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}

export default withPublicApiRateLimit(handler);
