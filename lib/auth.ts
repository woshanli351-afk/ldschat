import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE_NAME = "im_session";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type SessionRow = {
  userId: number;
  username: string;
  expiresAt: string;
};

export type SessionUser = {
  id: number;
  username: string;
  sessionToken: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashedPassword: string) {
  return bcrypt.compare(password, hashedPassword);
}

export async function createSession(userId: number) {
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  const db = await getDb();

  await db.run(
    `
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `,
    token,
    userId,
    expiresAt.toISOString(),
    now.toISOString()
  );

  return { token, expiresAt };
}

export async function destroySession(token: string) {
  const db = await getDb();
  await db.run("DELETE FROM sessions WHERE id = ?", token);
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    expires: expiresAt,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

async function getSessionUserByToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const db = await getDb();
  const row = await db.get<SessionRow>(
    `
      SELECT
        s.user_id AS userId,
        u.username AS username,
        s.expires_at AS expiresAt
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `,
    token
  );

  if (!row) {
    return null;
  }

  if (Date.parse(row.expiresAt) <= Date.now()) {
    await destroySession(token);
    return null;
  }

  return {
    id: row.userId,
    username: row.username,
    sessionToken: token
  } satisfies SessionUser;
}

export async function getSessionUserFromRequest(request: NextRequest) {
  return getSessionUserByToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

export async function getSessionUserFromCookies() {
  const cookieStore = await cookies();
  return getSessionUserByToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}
