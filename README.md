# Next.js IM（SQLite3 本地存储）

一个最小可运行的群聊 IM 示例，包含：

- 注册
- 登录
- 发送消息
- 修改自己的消息
- 撤回自己的消息
- 单一公共群聊（所有用户都在同一个群）
- `@qwen` 触发 AI 助手回复（阿里 Qwen）

## 技术栈

- Next.js (App Router, TypeScript)
- SQLite3（本地文件数据库）
- Cookie Session（服务端鉴权）

## 本地运行

```bash
npm install
npm run dev
```

启动后打开：

- `http://localhost:3000/register` 注册
- `http://localhost:3000/login` 登录
- `http://localhost:3000/chat` 群聊

数据库文件会自动创建在：

- `data/im.sqlite3`

## 接入阿里 Qwen

1. 创建 `./.env.local`（可参考 `./.env.example`）。
2. 配置 DashScope API Key。

```bash
cp .env.example .env.local
```

`DASHSCOPE_API_KEY` 为必填。发送消息时包含 `@qwen`，系统会读取最近群聊上下文并由 AI 在群里回复。

## 说明

- 仅登录用户可访问消息接口。
- 只有消息发送者本人可以修改或撤回自己的消息。
- 撤回后消息内容会被清空并标记为“消息已撤回”。
- 当前前端采用 2 秒轮询拉取消息。
