export type MessageRow = {
  id: number;
  userId: number;
  username: string;
  content: string;
  isRevoked: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type ChatMessage = {
  id: number;
  userId: number;
  username: string;
  content: string;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export function normalizeMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    userId: row.userId,
    username: row.username,
    content: row.content,
    isRevoked: Boolean(row.isRevoked),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revokedAt: row.revokedAt
  };
}
