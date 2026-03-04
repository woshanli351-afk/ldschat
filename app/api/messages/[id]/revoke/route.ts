import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MessageRow, normalizeMessage } from "@/lib/messages";

export const runtime = "nodejs";

type OwnerRow = {
  id: number;
  userId: number;
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const messageId = Number(params.id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ error: "消息 ID 不合法" }, { status: 400 });
  }

  const db = await getDb();
  const ownerRow = await db.get<OwnerRow>(
    `
      SELECT id, user_id AS userId
      FROM messages
      WHERE id = ?
    `,
    messageId
  );

  if (!ownerRow) {
    return NextResponse.json({ error: "消息不存在" }, { status: 404 });
  }
  if (ownerRow.userId !== sessionUser.id) {
    return NextResponse.json({ error: "只能撤回自己的消息" }, { status: 403 });
  }

  const now = new Date().toISOString();
  await db.run(
    `
      UPDATE messages
      SET content = '', is_revoked = 1, revoked_at = ?, updated_at = ?
      WHERE id = ?
    `,
    now,
    now,
    messageId
  );

  const updated = await db.get<MessageRow>(
    `
      SELECT
        m.id AS id,
        m.user_id AS userId,
        u.username AS username,
        m.content AS content,
        m.is_revoked AS isRevoked,
        m.created_at AS createdAt,
        m.updated_at AS updatedAt,
        m.revoked_at AS revokedAt
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ?
    `,
    messageId
  );

  return NextResponse.json({
    message: updated ? normalizeMessage(updated) : null
  });
}
