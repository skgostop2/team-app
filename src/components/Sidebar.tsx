"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isManager, isTeamLead } from "@/lib/roles";

const NAV = [
  { href: "/dashboard", leadLabel: "전체 대시보드", memberLabel: "내 현황", access: "all" },
  { href: "/tasks", leadLabel: "업무관리", memberLabel: "내 업무", access: "all" },
  { href: "/notices", leadLabel: "공지사항", memberLabel: "공지사항", access: "all" },
  { href: "/team", leadLabel: "팀원관리", memberLabel: "팀원관리", access: "manager" },
  { href: "/evaluation", leadLabel: "고과평가", memberLabel: "고과평가", access: "teamLead" },
] as const;

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const manager = isManager(profile);
  const teamLead = isTeamLead(profile);
  const isLead = manager;

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-gray-200 bg-white h-dvh sticky top-0">
      <div className="px-5 py-5 border-b border-gray-100">
        <p className="font-bold text-gray-900 leading-tight">팀원 업무관리</p>
        <p className="text-xs text-gray-500 mt-1">
          {profile.name} · {profile.role}
        </p>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV.filter((n) => {
          if (n.access === "manager") return manager;
          if (n.access === "teamLead") return teamLead;
          return true;
        }).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block px-3 py-2.5 rounded-lg text-sm font-medium transition",
                active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {isLead ? item.leadLabel : item.memberLabel}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-gray-100">
        <Link
          href="/logout"
          className="block px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
        >
          로그아웃
        </Link>
      </div>
    </aside>
  );
}
