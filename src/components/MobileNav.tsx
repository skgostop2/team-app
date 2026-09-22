"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function MobileNav({ isLead }: { isLead: boolean }) {
  // isLead: 실장·팀장 (운영 권한 보유자)
  const pathname = usePathname();

  const items = isLead
    ? [
        { href: "/dashboard", label: "홈", icon: "🏠" },
        { href: "/tasks", label: "업무", icon: "📋" },
        { href: "/assign", label: "지시", icon: "✍️" },
        { href: "/notices", label: "공지", icon: "📢" },
        { href: "/team", label: "팀원", icon: "👥" },
      ]
    : [
        { href: "/dashboard", label: "홈", icon: "🏠" },
        { href: "/tasks", label: "내업무", icon: "📋" },
        { href: "/notices", label: "공지", icon: "📢" },
        { href: "/logout", label: "로그아웃", icon: "🚪" },
      ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 flex">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5",
              active ? "text-blue-600" : "text-gray-500"
            )}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
