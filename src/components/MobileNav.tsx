"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 폰 아래쪽 메뉴.
 *
 * 칸이 다섯뿐이라 화면을 다 넣을 수 없다. 자주 쓰는 네 개만 두고
 * 나머지는 "더보기"로 모은다 — 예전에는 달력·주간·보고·메모장·사용방법이
 * 폰에서 아예 열리지 않았다.
 */

type Item = { href: string; label: string; icon: string; who?: "lead" | "teamLead" };

/** 아래 칸에 둘 것 (자주 쓰는 것) */
const BAR_LEAD: Item[] = [
  { href: "/dashboard", label: "홈", icon: "🏠" },
  { href: "/tasks", label: "업무", icon: "📋" },
  { href: "/assign", label: "지시", icon: "✍️" },
  { href: "/weekly", label: "주간", icon: "📊" },
];
const BAR_MEMBER: Item[] = [
  { href: "/dashboard", label: "홈", icon: "🏠" },
  { href: "/tasks", label: "내업무", icon: "📋" },
  { href: "/assign", label: "등록", icon: "✍️" },
  { href: "/weekly", label: "주간", icon: "📊" },
];

/** 더보기에 담을 것 */
const MORE: Item[] = [
  { href: "/calendar", label: "달력", icon: "📅" },
  { href: "/reports", label: "신규 업무 진행 보고", icon: "📥", who: "lead" },
  { href: "/notices", label: "공지사항", icon: "📢" },
  { href: "/notes", label: "내 메모장", icon: "📝" },
  { href: "/team", label: "팀원관리", icon: "👥", who: "lead" },
  { href: "/evaluation", label: "고과평가", icon: "⭐", who: "teamLead" },
  { href: "/security", label: "2단계 인증", icon: "🔐" },
  { href: "/help", label: "사용방법", icon: "❓" },
];

export default function MobileNav({
  isLead,
  isTeamLead = false,
}: {
  /** 실장·팀장 (운영 권한 보유자) */
  isLead: boolean;
  isTeamLead?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 화면을 옮기면 더보기는 닫는다
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const bar = isLead ? BAR_LEAD : BAR_MEMBER;
  const more = MORE.filter(
    (m) => !m.who || (m.who === "lead" && isLead) || (m.who === "teamLead" && isTeamLead)
  );

  const isOn = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const moreActive = more.some((m) => isOn(m.href));

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute bottom-[52px] inset-x-0 bg-white border-t border-gray-200 rounded-t-2xl p-2 max-h-[70dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {more.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-base",
                  isOn(m.href) ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                )}
              >
                <span className="text-xl leading-none">{m.icon}</span>
                {m.label}
              </Link>
            ))}
            <Link
              href="/logout"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-base text-gray-500 border-t border-gray-100 mt-1"
            >
              <span className="text-xl leading-none">🚪</span>
              로그아웃
            </Link>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex">
        {bar.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5",
              isOn(item.href) && !open ? "text-blue-600" : "text-gray-500"
            )}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5",
            open || moreActive ? "text-blue-600" : "text-gray-500"
          )}
        >
          <span className="text-lg leading-none">{open ? "✕" : "⋯"}</span>
          더보기
        </button>
      </nav>
    </>
  );
}
