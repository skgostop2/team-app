"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { canDirect, isManager, isTeamLead } from "@/lib/roles";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import NoticePopup from "./NoticePopup";
import NotesPanel from "./NotesPanel";
import NoticePanel from "./NoticePanel";
import NoticeStrip from "./NoticeStrip";
import NotificationBell from "./NotificationBell";
import PushBanner from "./PushBanner";

export default function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  // 마지막 접속시각 갱신 (미접속자 표시용)
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("touch_last_seen").then(() => {});
  }, []);

  return (
    <div className="min-h-dvh bg-gray-50 md:flex">
      <div className="no-print contents">
        <Sidebar profile={profile} />
      </div>

      <div className="flex-1 min-w-0">
        {/* 모바일 상단바 */}
        <header className="no-print md:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-gray-900">업무관리</span>
          <span className="flex items-center gap-1">
            <NotificationBell userId={profile.id} compact />
            <Link href="/me" className="text-xs text-gray-500 hover:text-blue-700 px-1" title="내 정보">
              {profile.name}님 ›
            </Link>
          </span>
        </header>
        <NoticeStrip />

        <main className="p-4 md:p-8 pb-20 md:pb-8 max-w-[1400px] mx-auto space-y-4">
          <PushBanner />
          {children}
        </main>
      </div>

      <div className="no-print contents">
        <MobileNav
          isLead={isManager(profile)}
          isTeamLead={isTeamLead(profile)}
          canSeeDashboard={canDirect(profile)}
        />
      </div>
      <NoticePopup userId={profile.id} />
      <div className="no-print contents">
        <NotesPanel />
        <NoticePanel />
      </div>
    </div>
  );
}
