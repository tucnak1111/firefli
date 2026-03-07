import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/utils/database";
import { withPermissionCheck } from "@/utils/permissionsManager";
import { logAudit } from "@/utils/logs";
import { getConfig } from "@/utils/configEngine";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT") {
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
  const { status } = req.body;

  const validStatuses = ["active", "archived", "approved", "rejected"];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status" });
  }

  const existing = await prisma.recommendation.findFirst({
    where: { id: recId, workspaceGroupId },
  });

  if (!existing) {
    return res.status(404).json({ success: false, error: "Not found" });
  }

  let editorName: string | null = null;
  try {
    const user = await prisma.user.findUnique({ where: { userid: BigInt(userId) } });
    editorName = user?.username || null;
  } catch {}

  const updated = await prisma.recommendation.update({
    where: { id: recId },
    data: {
      status,
      statusChangedById: BigInt(userId),
      statusChangedByName: editorName,
      statusChangedAt: new Date(),
    },
    include: {
      votes: true,
      comments: { orderBy: { createdAt: "asc" } },
    },
  });

  await logAudit(
    workspaceGroupId,
    Number(userId),
    "recommendation.status",
    "Recommendation",
    {
      recommendationId: recId,
      targetUsername: existing.targetUsername,
      oldStatus: existing.status,
      newStatus: status,
    }
  );

  const serialized = JSON.parse(
    JSON.stringify(updated, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );

  return res.status(200).json({ success: true, recommendation: serialized });
}

export default withPermissionCheck(handler, "manage_recommendations");
