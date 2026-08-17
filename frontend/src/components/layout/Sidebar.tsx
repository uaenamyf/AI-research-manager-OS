/** 侧边导航栏。 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/library", label: "Library", icon: "📚" },
  { href: "/writing", label: "Write", icon: "✍️" },
  { href: "/literature", label: "Literature Search", icon: "🔍" },
  { href: "/references", label: "Writing", icon: "✏️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <Link href="/dashboard" className="text-lg font-bold text-gray-900">
          ResearchOS
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                active
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100",
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
