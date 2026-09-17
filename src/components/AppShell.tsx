"use client";

import { useEffect } from "react";
import type { Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { isManager } from "@/lib/roles";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import NoticePopup from "./NoticePopup";
import NotesPanel from "./NotesPanel";

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
          <span className="text-xs text-gray-500">{profile.name}님</span>
        </header>

        <main className="p-4 md:p-8 pb-20 md:pb-8 max-w-[1400px] mx-auto">{children}</main>
      </div>

      <div className="no-print contents">
        <MobileNav isLead={isManager(profile)} />
      </div>
      <NoticePopup userId={profile.id} />
      <div className="no-print contents">
        <NotesPanel />
      </div>
    </div>
  );
}
