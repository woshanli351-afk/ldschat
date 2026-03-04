import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { DB } from "@/lib/db";
import { MessageRow, normalizeMessage } from "@/lib/messages";
import {
  QWEN_BOT_USERNAME,
  QwenConfigurationError,
  extractQwenQuestion,
  generateQwenReply,
  hasQwenMention
} from "@/lib/qwen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_MAX_LENGTH = 1000;
const QWEN_HISTORY_LIMIT = 30;
const QWEN_FALLBACK_MESSAGE =
  "Qwen 当前不可用，请稍后重试（请检查 DASHSCOPE_API_KEY 与模型配置）。";

type PostBody = {
  content?: string;
};

type QwenHistoryRow = {
  username: string;
  content: string;
  isRevoked: number;
};

function normalizeReplyContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return "抱歉，我暂时无法给出有效回答。";
  }

  if (trimmed.length <= MESSAGE_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MESSAGE_MAX_LENGTH - 1)}…`;
}

async function ensureQwenBotUserId(db: DB) {
  const now = new Date().toISOString();
  await db.run(
    `
      INSERT OR IGNORE INTO users (username, password_hash, created_at)
      VALUES (?, ?, ?)
    `,
    QWEN_BOT_USERNAME,
    "__QWEN_BOT_NO_LOGIN__",
    now
  );

  const botUser = await db.get<{ id: number }>(
    "SELECT id FROM users WHERE username = ?",
    QWEN_BOT_USERNAME
  );

  if (!botUser) {
    throw new Error("无法创建 qwen 机器人账号");
  }

  return botUser.id;
}

async function insertBotMessage(db: DB, content: string) {
  const botUserId = await ensureQwenBotUserId(db);
  const now = new Date().toISOString();
  await db.run(
    `
      INSERT INTO messages (user_id, content, is_revoked, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
    `,
    botUserId,
    normalizeReplyContent(content),
    now,
    now
  );
}

async function appendQwenReply(db: DB, asker: string, originalContent: string) {
  const historyRows = await db.all<QwenHistoryRow[]>(
    `
      SELECT
        u.username AS username,
        m.content AS content,
        m.is_revoked AS isRevoked
      FROM messages m
      JOIN users u ON u.id = m.user_id
      ORDER BY m.id DESC
      LIMIT ?
    `,
    QWEN_HISTORY_LIMIT
  );

  const history = historyRows
    .slice()
    .reverse()
    .map((row) => ({
      username: row.username,
      content: row.content,
      isRevoked: Boolean(row.isRevoked)
    }));

  try {
    const reply = await generateQwenReply({
      asker,
      question: extractQwenQuestion(originalContent),
      history
    });
    await insertBotMessage(db, reply);
  } catch (error) {
    if (error instanceof QwenConfigurationError) {
      await insertBotMessage(db, `配置错误：${error.message}`);
      return;
    }

    await insertBotMessage(db, QWEN_FALLBACK_MESSAGE);
  }
}

export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const db = await getDb();
  const rows = await db.all<MessageRow[]>(
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
      ORDER BY m.id ASC
      LIMIT 500
    `
  );

  return NextResponse.json({
    messages: rows.map(normalizeMessage)
  });
}

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
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
  const now = new Date().toISOString();
  const result = await db.run(
    `
      INSERT INTO messages (user_id, content, is_revoked, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
    `,
    sessionUser.id,
    content,
    now,
    now
  );

  if (hasQwenMention(content)) {
    await appendQwenReply(db, sessionUser.username, content);
  }

  const created = await db.get<MessageRow>(
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
    Number(result.lastID)
  );

  return NextResponse.json(
    { message: created ? normalizeMessage(created) : null },
    { status: 201 }
  );
}
