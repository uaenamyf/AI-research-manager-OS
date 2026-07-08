/** 根页面：重定向到 dashboard。 */
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
