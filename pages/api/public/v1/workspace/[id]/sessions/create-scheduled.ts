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
    scheduleId,
    sessionType: sessionTypeData,
    date,
    name,
    type,
    ownerId,
    duration,
    sessionTagId,
    logs,
  } = req.body;

  if ((!scheduleId && !sessionTypeData) || !date) {
    return res
      .status(400)
      .json({
        success: false,
        error:
          "Either scheduleId or sessionType data (with schedule), and date are required",
      });
  }

  if (scheduleId && sessionTypeData) {
    return res
      .status(400)
      .json({
        success: false,
        error: "Provide either scheduleId OR sessionType, not both",
      });
  }

  try {
    const key = await validateApiKey(apiKey, workspaceId);
    if (!key) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid or expired API key" });
    }

    let schedule: any;
    let scheduleIdToUse: string;
    let sessionTypeIdToUse: string;

    // Either find existing schedule or create new session type with schedule
    if (scheduleId) {
      // Use existing schedule
      schedule = await prisma.schedule.findFirst({
        where: {
          id: scheduleId,
        },
        include: {
          sessionType: {
            select: {
              id: true,
              name: true,
              description: true,
              workspaceGroupId: true,
              slots: true,
              statues: true,
            },
          },
        },
      });

      if (!schedule) {
        return res
          .status(404)
          .json({ success: false, error: "Schedule not found" });
      }

      if (schedule.sessionType.workspaceGroupId !== workspaceId) {
        return res.status(403).json({
          success: false,
          error: "Schedule does not belong to this workspace",
        });
      }
      scheduleIdToUse = scheduleId;
      sessionTypeIdToUse = schedule.sessionType.id;
    } else {
      // Create new session type with schedule
      const {
        name: typeName,
        description,
        gameId,
        slots,
        statues,
        schedule: scheduleData,
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

      if (
        !scheduleData ||
        !scheduleData.days ||
        scheduleData.hour === undefined ||
        scheduleData.minute === undefined
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "sessionType.schedule (with days, hour, minute) is required for scheduled sessions",
          });
      }

      const sessionType = await prisma.sessionType.create({
        data: {
          workspaceGroupId: workspaceId,
          name: typeName,
          description: description || null,
          gameId: gameId ? BigInt(gameId) : null,
          allowUnscheduled: false,
          statues: statues || [],
          slots: slots || [],
        },
      });

      // Create schedule
      const createdSchedule = await prisma.schedule.create({
        data: {
          sessionTypeId: sessionType.id,
          Days: scheduleData.days,
          Hour: scheduleData.hour,
          Minute: scheduleData.minute,
        },
        include: {
          sessionType: true,
        },
      });

      schedule = createdSchedule;
      scheduleIdToUse = createdSchedule.id;
      sessionTypeIdToUse = sessionType.id;
    }

    const sessionDate = new Date(date);
    if (isNaN(sessionDate.getTime())) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid date format" });
    }

    sessionDate.setUTCHours(schedule.Hour);
    sessionDate.setUTCMinutes(schedule.Minute);
    sessionDate.setUTCSeconds(0);
    sessionDate.setUTCMilliseconds(0);

    const dayOfWeek = sessionDate.getUTCDay();
    if (!schedule.Days.includes(dayOfWeek)) {
      return res.status(400).json({
        success: false,
        error: `This schedule does not run on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek]}`,
      });
    }

    const existingSession = await prisma.session.findFirst({
      where: {
        scheduleId: scheduleIdToUse,
        date: sessionDate,
      },
    });

    if (existingSession) {
      return res.status(400).json({
        success: false,
        error: "A session already exists for this schedule on this date",
        sessionId: existingSession.id,
      });
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
        scheduleId: scheduleIdToUse,
        date: sessionDate,
        name: name || null,
        type: type || "other",
        ownerId: ownerId ? BigInt(ownerId) : null,
        duration: duration || 30,
        sessionTagId: sessionTagId || null,
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
        schedule: {
          select: {
            id: true,
            Days: true,
            Hour: true,
            Minute: true,
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
          sessionType: sessionTypeIdToUse
            ? schedule.sessionType.name
            : sessionTypeData.name,
          sessionName: name,
          type: type,
          creationType: "scheduled",
          date: sessionDate.toISOString(),
          scheduleId: scheduleIdToUse,
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
      message: "Session created successfully (Scheduled)",
      session: {
        id: session.id,
        name: session.name,
        type: session.type,
        date: session.date,
        duration: session.duration,
        scheduleId: session.scheduleId,
        sessionType: session.sessionType,
        schedule: session.schedule,
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
    console.error("Error creating scheduled session:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}

export default withPublicApiRateLimit(handler);
