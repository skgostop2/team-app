"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatElapsed, isLongInactive, formatDate, cn } from "@/lib/utils";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from("profiles").select("*").eq("status", "승인").order("name"),
      supabase.from("v_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
    ]);
    setProfiles((p ?? []) as Profile[]);
    setTasks((t ?? []) as TaskWithEffectiveStatus[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.effective_status === "진행중").length;
    const delayed = tasks.filter((t) => t.effective_status === "지연").length;
    const done = tasks.filter((t) => t.effective_status === "완료").length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    return { total, inProgress, delayed, done, rate };
  }, [tasks]);

  const byMember = useMemo(() => {
    return profiles.map((p) => {
      const mine = tasks.filter((t) => t.assignee_id === p.id);
      const active = mine.filter((t) => t.effective_status !== "완료");
      const delayed = mine.filter((t) => t.effective_status === "지연");
      const dueSoon = mine.filter((t) => {
        if (!t.due_date || t.effective_status === "완료") return false;
        const days = (new Date(t.due_date).getTime() - Date.now()) / 86400000;
        return days >= 0 && days <= 3;
      });
      // 업무 과중도: 진행중 업무 수 + 지연*2 + 마감임박*1.5 가중치
      const workload = active.length + delayed.length * 2 + dueSoon.length * 1.5;
      return { profile: p, active: active.length, delayed: delayed.length, dueSoon: dueSoon.length, total: mine.length, workload };
    });
  }, [profiles, tasks]);

  const maxWorkload = Math.max(1, ...byMember.map((m) => m.workload));

  if (loading) {
    return <p className="text-sm text-gray-400">불러오는 중...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">전체 팀 대시보드</h1>
        <p className="text-sm text-gray-500 mt-0.5">팀 전체 업무 현황을 한눈에 확인합니다.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="전체 업무" value={stats.total} />
        <StatCard label="진행중" value={stats.inProgress} accent="text-blue-600" />
        <StatCard label="지연" value={stats.delayed} accent="text-red-600" />
        <StatCard label="완료율" value={`${stats.rate}%`} accent="text-emerald-600" />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">팀원별 업무 과중도</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {byMember.map((m) => (
            <div key={m.profile.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{m.profile.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    마지막 접속 {formatElapsed(m.profile.last_seen_at)}
                    {isLongInactive(m.profile.last_seen_at) && (
                      <span className="text-red-500 font-medium">· 장기 미접속</span>
                    )}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                  총 {m.total}건
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                <div
                  className={cn(
                    "h-full rounded-full",
                    m.workload / maxWorkload > 0.7 ? "bg-red-500" : m.workload / maxWorkload > 0.4 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, (m.workload / maxWorkload) * 100)}%` }}
                />
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>진행중 {m.active}</span>
                <span className="text-red-500">지연 {m.delayed}</span>
                <span className="text-amber-500">마감임박 {m.dueSoon}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">전체 업무 목록</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3 font-medium">업무</th>
                <th className="px-4 py-3 font-medium">담당자</th>
                <th className="px-4 py-3 font-medium">진행률</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">마감일</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const assignee = profiles.find((p) => p.id === t.assignee_id);
                return (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${t.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {t.is_new && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
                        )}
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{assignee?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600 w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                        </div>
                        <span className="text-xs w-8">{t.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.effective_status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(t.due_date)}</td>
                  </tr>
                );
              })}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    등록된 업무가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", accent ?? "text-gray-900")}>{value}</p>
    </div>
  );
}
