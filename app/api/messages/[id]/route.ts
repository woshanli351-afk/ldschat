import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MessageRow, normalizeMessage } from "@/lib/messages";

export const runtime = "nodejs";

const MESSAGE_MAX_LENGTH = 1000;

type PatchBody = {
  content?: string;
};

type OwnerRow = {
  id: number;
  userId: number;
  isRevoked: number;
};

export async function PATCH(
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

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const content = body.content?.trim() ?? "";
  if (!content) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }
  if (content.length > MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `消息长度不能超过 ${MESSAGE_MAX_LENGTH}` },
      { status: 400 }
    );
  }

  const db = await getDb();
  const ownerRow = await db.get<OwnerRow>(
    `
      SELECT id, user_id AS userId, is_revoked AS isRevoked
      FROM messages
      WHERE id = ?
    `,
    messageId
  );

  if (!ownerRow) {
    return NextResponse.json({ error: "消息不存在" }, { status: 404 });
  }
  if (ownerRow.userId !== sessionUser.id) {
    return NextResponse.json({ error: "只能修改自己的消息" }, { status: 403 });
  }
  if (ownerRow.isRevoked) {
    return NextResponse.json({ error: "已撤回消息不能修改" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await db.run(
    `
      UPDATE messages
      SET content = ?, updated_at = ?
      WHERE id = ?
    `,
    content,
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
