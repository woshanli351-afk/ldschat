import { NextResponse } from "next/server";
import {
  createSession,
  setSessionCookie,
  verifyPassword
} from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type LoginBody = {
  username?: string;
  password?: string;
};

type UserRow = {
  id: number;
  passwordHash: string;
};

export async function POST(request: Request) {
  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.get<UserRow>(
    `
      SELECT id, password_hash AS passwordHash
      FROM users
      WHERE username = ?
    `,
    username
  );

  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const isValidPassword = await verifyPassword(password, user.passwordHash);
  if (!isValidPassword) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const session = await createSession(user.id);
  const response = NextResponse.json({
    user: { id: user.id, username }
  });

  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
