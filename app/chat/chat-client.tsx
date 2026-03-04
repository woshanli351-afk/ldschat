"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage } from "@/lib/messages";

type ChatResponse = {
  messages?: ChatMessage[];
  error?: string;
};

type MessageResponse = {
  message?: ChatMessage | null;
  error?: string;
};

const POLL_INTERVAL_MS = 2000;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function ChatClient({
  initialUser
}: {
  initialUser: { id: number; username: string };
}) {
  const qwenUsername = "qwen";
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busyMessageId, setBusyMessageId] = useState<number | null>(null);

  const sortedMessages = useMemo(
    () => messages.slice().sort((a, b) => a.id - b.id),
    [messages]
  );

  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch("/api/messages", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      const data = (await response.json()) as ChatResponse;
      if (!response.ok) {
        setError(data.error ?? "获取消息失败");
        return;
      }

      setMessages(data.messages ?? []);
      setError("");
    } catch {
      setError("网络错误，无法获取消息");
    } finally {
      setIsLoadingMessages(false);
    }
  }, [router]);

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => {
      void loadMessages();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadMessages]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) {
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed })
      });

      const data = (await response.json()) as MessageResponse;
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "发送失败");
        return;
      }

      setContent("");
      await loadMessages();
    } catch {
      setError("网络错误，消息发送失败");
    } finally {
      setIsSending(false);
    }
  }

  function startEdit(message: ChatMessage) {
    setEditingId(message.id);
    setEditingContent(message.content);
  }

  async function saveEdit(messageId: number) {
    const trimmed = editingContent.trim();
    if (!trimmed) {
      setError("消息不能为空");
      return;
    }

    setBusyMessageId(messageId);
    setError("");

    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed })
      });

      const data = (await response.json()) as MessageResponse;
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "修改失败");
        return;
      }

      setEditingId(null);
      setEditingContent("");
      await loadMessages();
    } catch {
      setError("网络错误，消息修改失败");
    } finally {
      setBusyMessageId(null);
    }
  }

  async function revokeMessage(messageId: number) {
    const shouldRevoke = window.confirm("确定撤回这条消息吗？");
    if (!shouldRevoke) {
      return;
    }

    setBusyMessageId(messageId);
    setError("");

    try {
      const response = await fetch(`/api/messages/${messageId}/revoke`, {
        method: "POST"
      });
      const data = (await response.json()) as MessageResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "撤回失败");
        return;
      }

      if (editingId === messageId) {
        setEditingId(null);
        setEditingContent("");
      }
      await loadMessages();
    } catch {
      setError("网络错误，消息撤回失败");
    } finally {
      setBusyMessageId(null);
    }
  }

  async function logout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <main className="chat-page">
      <section className="chat-shell">
        <header className="chat-header">
          <div>
            <h1>全员群聊</h1>
            <p className="muted">当前用户：{initialUser.username}</p>
          </div>
          <button onClick={logout} disabled={isLoggingOut}>
            {isLoggingOut ? "退出中..." : "退出登录"}
          </button>
        </header>

        <section className="message-list">
          {isLoadingMessages ? <p className="muted">加载消息中...</p> : null}
          {!isLoadingMessages && sortedMessages.length === 0 ? (
            <p className="muted">还没有消息，发一条试试。</p>
          ) : null}

          {sortedMessages.map((message) => {
            const isMine = message.userId === initialUser.id;
            const isBot = message.username.toLowerCase() === qwenUsername;
            const isEditing = editingId === message.id;
            const isBusy = busyMessageId === message.id;
            const isEdited =
              !message.isRevoked && message.updatedAt !== message.createdAt;

            return (
              <article
                key={message.id}
                className={`message-item ${isMine ? "mine" : ""} ${
                  isBot ? "bot" : ""
                } ${message.isRevoked ? "revoked" : ""}`}
              >
                <div className="message-meta">
                  <strong>{message.username}</strong>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>

                {message.isRevoked ? (
                  <p className="message-revoked">消息已撤回</p>
                ) : isEditing ? (
                  <div className="edit-row">
                    <input
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value)}
                      disabled={isBusy}
                    />
                    <button onClick={() => void saveEdit(message.id)} disabled={isBusy}>
                      保存
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditingContent("");
                      }}
                      disabled={isBusy}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <p className="message-content">{message.content}</p>
                )}

                <div className="message-footer">
                  <span className="muted">
                    {isEdited ? `已编辑 ${formatDateTime(message.updatedAt)}` : ""}
                  </span>
                  {isMine && !message.isRevoked && !isEditing ? (
                    <div className="message-actions">
                      <button onClick={() => startEdit(message)} disabled={isBusy}>
                        修改
                      </button>
                      <button
                        onClick={() => void revokeMessage(message.id)}
                        disabled={isBusy}
                      >
                        撤回
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        <form onSubmit={handleSend} className="composer">
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="输入消息（@qwen 可召唤 AI）..."
            maxLength={1000}
          />
          <button type="submit" disabled={isSending}>
            {isSending ? "发送中..." : "发送"}
          </button>
        </form>
        <p className="muted">提示：输入 `@qwen + 你的问题`，AI 会结合群聊上下文回答。</p>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
