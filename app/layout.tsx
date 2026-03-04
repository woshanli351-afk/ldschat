import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IM 群聊示例",
  description: "Next.js + SQLite3 本地 IM 应用"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
