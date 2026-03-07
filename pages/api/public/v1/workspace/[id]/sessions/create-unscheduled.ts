import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/utils/database";
import { validateApiKey } from "@/utils/api-auth";
import { withPublicApiRateLimit } from "@/utils/prtl";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(401).json({ success: false, error: "Missing API key" });
  }

  const workspaceId = Number.parseInt(req.query.id as string);
  if (!workspaceId) {
    return res
      .status(400)
      .json({ success: false, error: "Missing workspace ID" });
  }

  const {
    sessionTypeId,
    sessionType: sessionTypeData,
    date,
    time,
    name,
    type,
    ownerId,
    duration,
    sessionTagId,
    logs,
  } = req.body;

  if ((!sessionTypeId && !sessionTypeData) || !date) {
    return res
      .status(400)
      .json({
        success: false,
        error:
          "Either sessionTypeId or sessionType data, and date are required",
      });
  }

  if (sessionTypeId && sessionTypeData) {
    return res
      .status(400)
      .json({
        success: false,
        error: "Provide either sessionTypeId OR sessionType, not both",
      });
  }

  try {
    const key = await validateApiKey(apiKey, workspaceId);
    if (!key) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid or expired API key" });
    }

    let sessionType: any;
    let sessionTypeIdToUse: string;

    // Either find existing session type or create new one
    if (sessionTypeId) {
      // Use existing session type
      sessionType = await prisma.sessionType.findFirst({
        where: {
          id: sessionTypeId,
          workspaceGroupId: workspaceId,
        },
      });

      if (!sessionType) {
        return res.status(404).json({
          success: false,
          error: "Session type not found in this workspace",
        });
      }

      if (!sessionType.allowUnscheduled) {
        return res.status(400).json({
          success: false,
          error: "This session type does not allow unscheduled sessions",
        });
      }
      sessionTypeIdToUse = sessionTypeId;
    } else {
      // Create new session type
      const {
        name: typeName,
        description,
        gameId,
        slots,
        statues,
      } = sessionTypeData;

      if (!typeName) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "sessionType.name is required when creating a new session type",
          });
      }

      sessionType = await prisma.sessionType.create({
        data: {
          workspaceGroupId: workspaceId,
          name: typeName,
          description: description || null,
          gameId: gameId ? BigInt(gameId) : null,
          allowUnscheduled: true, // Must be true for unscheduled sessions
          statues: statues || [],
          slots: slots || [],
        },
      });
      sessionTypeIdToUse = sessionType.id;
    }

    let sessionDate: Date;
    if (time) {
      sessionDate = new Date(`${date}T${time}:00Z`);
    } else {
      sessionDate = new Date(date);
    }

    if (isNaN(sessionDate.getTime())) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid date or time format" });
    }

    if (ownerId) {
      const ownerIdBigInt = BigInt(ownerId);
      const workspaceMember = await prisma.workspaceMember.findFirst({
        where: {
          workspaceGroupId: workspaceId,
          userId: ownerIdBigInt,
        },
      });

      if (!workspaceMember) {
        return res
          .status(400)
          .json({ success: false, error: "Owner not found in workspace" });
      }
    }

    if (sessionTagId) {
      const sessionTag = await prisma.sessionTag.findFirst({
        where: {
          id: sessionTagId,
          workspaceGroupId: workspaceId,
        },
      });

      if (!sessionTag) {
        return res.status(400).json({
          success: false,
          error: "Session tag not found in this workspace",
        });
      }
    }

    const session = await prisma.session.create({
      data: {
        sessionTypeId: sessionTypeIdToUse,
        date: sessionDate,
        name: name || null,
        type: type || "other",
        ownerId: ownerId ? BigInt(ownerId) : null,
        duration: duration || 30,
        sessionTagId: sessionTagId || null,
        scheduleId: null,
      },
      include: {
        sessionType: {
          select: {
            id: true,
            name: true,
            description: true,
            slots: true,
            statues: true,
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
        sessionTag: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    await prisma.sessionLog.create({
      data: {
        sessionId: session.id,
        actorId: key.createdById,
        action: "session_created",
        metadata: {
          sessionType: sessionType.name,
          sessionName: name,
          type: type,
          creationType: "unscheduled",
          date: sessionDate.toISOString(),
          createdVia: "public_api",
        },
      },
    });

    if (logs && Array.isArray(logs) && logs.length > 0) {
      const logEntries = logs.map((log: any) => ({
        sessionId: session.id,
        actorId: log.actorId ? BigInt(log.actorId) : key.createdById,
        targetId: log.targetId ? BigInt(log.targetId) : null,
        action: log.action,
        metadata: log.metadata || {},
      }));

      await prisma.sessionLog.createMany({
        data: logEntries,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Session created successfully (unscheduled)",
      session: {
        id: session.id,
        name: session.name,
        type: session.type,
        date: session.date,
        duration: session.duration,
        sessionType: session.sessionType,
        owner: session.owner
          ? {
              userId: session.owner.userid.toString(),
              username: session.owner.username,
              displayName: session.owner.displayName,
              picture: session.owner.picture,
            }
          : null,
        sessionTag: session.sessionTag,
      },
    });
  } catch (error) {
    console.error("Error creating unscheduled session:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}

export default withPublicApiRateLimit(handler);
