import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUserFromCookies();
  redirect(user ? "/chat" : "/login");
}
