export const QWEN_BOT_USERNAME = "qwen";

const DEFAULT_QWEN_MODEL = "qwen-plus";
const DEFAULT_QWEN_ENDPOINT =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MAX_CONTEXT_CHARS = 6000;

export class QwenConfigurationError extends Error {}

type HistoryMessage = {
  username: string;
  content: string;
  isRevoked: boolean;
};

type QwenChoice = {
  message?: {
    content?: string | Array<{ text?: string }>;
  };
};

type QwenResponse = {
  choices?: QwenChoice[];
};

function getQwenApiKey() {
  return process.env.DASHSCOPE_API_KEY?.trim() || process.env.QWEN_API_KEY?.trim();
}

function getQwenModel() {
  return process.env.QWEN_MODEL?.trim() || DEFAULT_QWEN_MODEL;
}

function getQwenEndpoint() {
  return process.env.QWEN_BASE_URL?.trim() || DEFAULT_QWEN_ENDPOINT;
}

function buildHistoryText(history: HistoryMessage[]) {
  const lines = history.map((item, index) => {
    const content = item.isRevoked ? "[消息已撤回]" : item.content;
    return `${index + 1}. ${item.username}: ${content}`;
  });

  const joined = lines.join("\n");
  if (joined.length <= MAX_CONTEXT_CHARS) {
    return joined;
  }

  return joined.slice(joined.length - MAX_CONTEXT_CHARS);
}

function extractContentFromResponse(data: QwenResponse) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text ?? "")
      .join("")
      .trim();
  }

  return "";
}

export function hasQwenMention(content: string) {
  return /@qwen\b/i.test(content);
}

export function extractQwenQuestion(content: string) {
  const cleaned = content.replace(/@qwen\b/gi, "").trim();
  if (cleaned) {
    return cleaned;
  }

  return "请结合最近聊天内容，给出有帮助的回答。";
}

export async function generateQwenReply(params: {
  asker: string;
  question: string;
  history: HistoryMessage[];
}) {
  const apiKey = getQwenApiKey();
  if (!apiKey) {
    throw new QwenConfigurationError(
      "未配置 DASHSCOPE_API_KEY（或 QWEN_API_KEY）"
    );
  }

  const payload = {
    model: getQwenModel(),
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "你是群聊助手 qwen。你需要结合提供的群聊上下文回答用户问题。回答要准确、简洁、直接，不要编造不存在的事实。"
      },
      {
        role: "user",
        content: [
          "下面是群聊最近消息（按时间顺序）：",
          buildHistoryText(params.history),
          "",
          `提问用户：${params.asker}`,
          `用户问题：${params.question}`,
          "",
          "请基于以上上下文作答。"
        ].join("\n")
      }
    ]
  };

  const response = await fetch(getQwenEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Qwen 请求失败 (${response.status}) ${text.slice(0, 300).trim()}`
    );
  }

  const data = (await response.json()) as QwenResponse;
  const answer = extractContentFromResponse(data);

  if (!answer) {
    throw new Error("Qwen 返回内容为空");
  }

  return answer;
}
