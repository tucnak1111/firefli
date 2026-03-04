import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/utils/database";
import { validateApiKey } from "@/utils/api-auth";
import { withPublicApiRateLimit } from "@/utils/prtl";
import { logAudit } from "@/utils/logs";
import * as noblox from "noblox.js";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey)
    return res.status(401).json({ success: false, error: "Missing API key" });

  const workspaceId = Number.parseInt(req.query.id as string);
  if (!workspaceId)
    return res
      .status(400)
      .json({ success: false, error: "Missing workspace ID" });

  try {
    const key = await validateApiKey(apiKey, workspaceId);
    if (!key) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid or expired API key" });
    }

    const { userId, reason } = req.body;

    if (!userId || !reason) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, reason",
      });
    }

    const numericUserId = Number.parseInt(String(userId));
    if (isNaN(numericUserId)) {
      return res
        .status(400)
        .json({ success: false, error: "userId must be a valid number" });
    }

    const adminId = BigInt(key.createdById);

    if (BigInt(numericUserId) === adminId) {
      return res.status(400).json({
        success: false,
        error: "You cannot perform actions on yourself.",
      });
    }

    const [targetUserRankCheck, adminUserRankCheck] = await Promise.all([
      prisma.rank.findFirst({
        where: { userId: BigInt(numericUserId), workspaceGroupId: workspaceId },
      }),
      prisma.rank.findFirst({
        where: { userId: adminId, workspaceGroupId: workspaceId },
      }),
    ]);

    if (targetUserRankCheck && adminUserRankCheck) {
      const storedTargetRank = Number(targetUserRankCheck.rankId);
      const storedAdminRank = Number(adminUserRankCheck.rankId);
      let targetRankNum = storedTargetRank;
      let adminRankNum = storedAdminRank;

      if (storedTargetRank > 255 || storedAdminRank > 255) {
        try {
          const robloxRoles = await noblox.getRoles(workspaceId);
          const roleIdToRank = new Map<number, number>();
          robloxRoles.forEach((role) => { roleIdToRank.set(role.id, role.rank); });
          if (storedTargetRank > 255) targetRankNum = roleIdToRank.get(storedTargetRank) ?? storedTargetRank;
          if (storedAdminRank > 255) adminRankNum = roleIdToRank.get(storedAdminRank) ?? storedAdminRank;
        } catch (e) {
          console.error("Failed to resolve Roblox role IDs to rank values:", e);
        }
      }

      if (targetRankNum >= adminRankNum) {
        const adminMember = await prisma.workspaceMember.findFirst({
          where: { userId: adminId, workspaceGroupId: workspaceId, isAdmin: true },
        });
        if (!adminMember) {
          return res.status(403).json({
            success: false,
            error: "You cannot perform actions on users with equal or higher rank than yours.",
          });
        }
      }
    }

    const userbook = await prisma.userBook.create({
      data: {
        userId: BigInt(numericUserId),
        type: "warning",
        workspaceGroupId: workspaceId,
        reason,
        adminId,
      },
      include: { admin: true },
    });

    try {
      await logAudit(
        workspaceId,
        Number(adminId),
        "userbook.create",
        `userbook:${userbook.id}`,
        {
          type: "warning",
          userId: numericUserId,
          adminId: Number(adminId),
          reason,
          source: "public_api",
        },
      );
    } catch {}

    return res.status(201).json({
      success: true,
      entry: JSON.parse(
        JSON.stringify(userbook, (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      ),
    });
  } catch (error) {
    console.error("[Public API] Error creating warning entry:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}

export default withPublicApiRateLimit(handler);