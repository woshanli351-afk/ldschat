import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";
import ChatClient from "./chat-client";

export default async function ChatPage() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return <ChatClient initialUser={{ id: user.id, username: user.username }} />;
}
