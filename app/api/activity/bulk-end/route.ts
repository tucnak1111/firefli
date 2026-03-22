// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextResponse, NextRequest } from "next/server";
import {headers} from "next/headers";
import prisma from "@/utils/database";
import { withSessionRoute } from "@/lib/withSession";

type Data = {
  success: boolean;
  error?: string;
  processed?: number;
  failed?: number;
};

export default withSessionRoute(handler);

export async function POST(req: NextRequest) {

  const authorization = req.headers.get("authorization");
  const body = await req.json();
  const { sessions } = body;

  if (!authorization)
    return NextResponse.json({
      success: false,
      error: "Authorization key missing",
    }, { status: 400 });
  if (!sessions || !Array.isArray(sessions))
    return NextResponse.json({
    success: false,    error: "Sessions array is required",
  }, { status: 400 });

  try {
    const config = await prisma.config.findFirst({
      where: {
        value: {
          path: ["key"],
          equals: authorization,
        },
      },
    });

    if (!config) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const groupId = config.workspaceGroupId;
    let processed = 0;
    let failed = 0;
    const updates = sessions.map(async (sessionData: any) => {
      try {
        const { userid, idleTime, messages } = sessionData;

        if (!userid || isNaN(userid)) {
          failed++;
          return;
        }

        const session = await prisma.activitySession.findFirst({
          where: {
            userId: BigInt(userid),
            active: true,
            workspaceGroupId: groupId,
          },
        });

        if (!session) {
          failed++;
          return;
        }

        await prisma.activitySession.update({
          where: { id: session.id },
          data: {
            endTime: new Date(),
            active: false,
            idleTime: idleTime ? Number(idleTime) : 0,
            messages: messages ? Number(messages) : 0,
          },
        });

        processed++;
        console.log(`[SHUTDOWN RECEIEVED] User ${userid} (ID: ${session.id})`);
      } catch (error) {
        console.error(`Failed to end session for user ${sessionData.userid}:`, error);
        failed++;
      }
    });

    await Promise.all(updates);

    console.log(
      `[SHUTDOWN RECEIEVED] Processed ${processed} sessions, ${failed} failed for group ${groupId}`
    );

    return NextResponse.json({
        success: true,
        processed,
        failed
    }, {status: 200});
  } catch (error: any) {
    console.error("Unexpected error in /api/activity/bulk-end:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
