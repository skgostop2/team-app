"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function EvaluationPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setMe(data as Profile);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  if (me?.role !== "팀장") {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-gray-500">이 화면은 팀장만 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-2">고과평가</h1>
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
        <p className="text-gray-500 font-medium mb-2">2차 개발 예정 기능입니다</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          평가기준표, 배점/가중치, 자동 평가점수 계산, 업무 실적 연동, 정성평가, 이력관리 등은
          2차 개발에서 반영됩니다. 현재는 관련 데이터 구조(평가기간·평가항목·평가점수)만
          미리 준비되어 있습니다.
        </p>
      </div>
    </div>
  );
}
