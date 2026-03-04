import { NextResponse } from "next/server";
import { createSession, hashPassword, setSessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type RegisterBody = {
  username?: string;
  password?: string;
};

function validateUsername(username: string) {
  if (username.length < 3 || username.length > 20) {
    return "用户名长度需要在 3 到 20 之间";
  }
  if (username.toLowerCase() === "qwen") {
    return "该用户名为系统保留名称";
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return "用户名仅支持字母、数字和下划线";
  }
  return null;
}

function validatePassword(password: string) {
  if (password.length < 6 || password.length > 64) {
    return "密码长度需要在 6 到 64 之间";
  }
  return null;
}

export async function POST(request: Request) {
  let body: RegisterBody;

  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  const usernameError = validateUsername(username);
  if (usernameError) {
    return NextResponse.json({ error: usernameError }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const db = await getDb();
  const existingUser = await db.get<{ id: number }>(
    "SELECT id FROM users WHERE username = ?",
    username
  );

  if (existingUser) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const result = await db.run(
    `
      INSERT INTO users (username, password_hash, created_at)
      VALUES (?, ?, ?)
    `,
    username,
    passwordHash,
    now
  );

  const userId = Number(result.lastID);
  const session = await createSession(userId);
  const response = NextResponse.json(
    { user: { id: userId, username } },
    { status: 201 }
  );

  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
