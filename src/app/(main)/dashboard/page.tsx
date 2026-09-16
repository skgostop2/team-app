"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatElapsed, isLongInactive, formatDate, cn } from "@/lib/utils";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isManager, isAssignable } from "@/lib/roles";
import TaskLedger from "@/components/TaskLedger";

export default function DashboardPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [togglingShare, setTogglingShare] = useState(false);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: p }, { data: t }, { data: setting }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      // 삭제된 팀원도 포함해서 불러온다 (지난 업무의 담당자 이름을 보존해서 표시하기 위함)
      supabase.from("profiles").select("*").order("name"),
      supabase.from("v_tasks").select("*").order("created_at", { ascending: true }),
      supabase
        .from("team_settings")
        .select("value")
        .eq("key", "share_progress_with_members")
        .maybeSingle(),
    ]);

    setMe(profile as Profile);
    setProfiles((p ?? []) as Profile[]);
    setTasks((t ?? []) as TaskWithEffectiveStatus[]);
    setShared(Boolean(setting?.value));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const isLead = isManager(me);
  // 팀장이 공개를 켜두면 팀원도 팀 전체 현황을 본다
  const canSeeTeam = isLead || shared;

  // 체크된 사람은 모두 그 업무의 담당자다 (여러 명 체크 가능)
  const isOn = (t: TaskWithEffectiveStatus, uid?: string) =>
    !!uid && (t.assignee_id === uid || (t.deputy_ids ?? []).includes(uid));

  const myTasks = useMemo(() => tasks.filter((t) => isOn(t, me?.id)), [tasks, me?.id]);
  const scopedTasks = canSeeTeam ? tasks : myTasks;

  const stats = useMemo(() => summarize(scopedTasks), [scopedTasks]);
  const myStats = useMemo(() => summarize(myTasks), [myTasks]);

  async function toggleShare(next: boolean) {
    setTogglingShare(true);
    const supabase = createClient();
    await supabase
      .from("team_settings")
      .update({ value: next, updated_at: new Date().toISOString() })
      .eq("key", "share_progress_with_members");
    setShared(next);
    setTogglingShare(false);
  }

  const byMember = useMemo(() => {
    // 팀원별 카드는 현재 재직 중인 인원 + 가입 전 미리 등록해 둔 인원 (미리 배정한 업무를 보기 위해)
    return profiles
      .filter(isAssignable)
      .map((p) => {
        const mine = tasks.filter((t) => isOn(t, p.id));
        const s = summarize(mine);
        const active = mine.filter((t) => t.effective_status !== "완료");
        const delayed = mine.filter((t) => t.effective_status === "지연");
        const dueSoon = mine.filter((t) => isDueSoon(t));
        // 업무를 받고 아직 "확인했습니다"를 누르지 않은 건 — 안 챙기고 있는지 보는 신호
        const unconfirmed = mine.filter((t) => t.is_new);
        // 업무 과중도: 진행중 + 지연×2 + 마감임박×1.5
        const workload = active.length + delayed.length * 2 + dueSoon.length * 1.5;
        return {
          profile: p,
          total: mine.length,
          done: s.done,
          delayed: delayed.length,
          dueSoon: dueSoon.length,
          unconfirmed: unconfirmed.length,
          active: active.length,
          avgProgress: s.avgProgress,
          completionRate: s.completionRate,
          workload,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [profiles, tasks]);

  const maxWorkload = Math.max(1, ...byMember.map((m) => m.workload));

  if (loading) {
    return <p className="text-sm text-gray-400">불러오는 중...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {canSeeTeam ? "전체 팀 대시보드" : "내 업무 현황"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLead
              ? "팀원별 진척율과 달성율을 한눈에 확인합니다."
              : canSeeTeam
                ? "팀 전체 현황과 내가 맡은 업무를 함께 봅니다."
                : "내가 맡은 업무의 진행 상황입니다."}
          </p>
        </div>

        {isLead && (
          <label className="flex items-center gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={shared}
              disabled={togglingShare}
              onChange={(e) => toggleShare(e.target.checked)}
              className="w-4 h-4"
            />
            팀 현황을 팀원에게 공개
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={canSeeTeam ? "전체 업무" : "내 업무"} value={stats.total} />
        <StatCard label="진행중" value={stats.inProgress} accent="text-blue-600" />
        <StatCard label="지연" value={stats.delayed} accent="text-red-600" />
        <StatCard
          label={canSeeTeam ? "팀 달성율" : "내 달성율"}
          value={`${stats.completionRate}%`}
          accent="text-emerald-600"
        />
      </div>

      {!isLead && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">내 평균 진척율</p>
            <span className="text-sm font-bold text-gray-900">{myStats.avgProgress}%</span>
          </div>
          <ProgressBar value={myStats.avgProgress} />
          <p className="text-xs text-gray-400 mt-2">
            내 업무 {myStats.total}건 · 완료 {myStats.done}건 · 진행중 {myStats.inProgress}건 · 지연{" "}
            {myStats.delayed}건 · 내 달성율 {myStats.completionRate}%
          </p>
        </div>
      )}

      {isLead && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">팀원별 진척 현황</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {byMember.map((m) => (
              <div key={m.profile.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {m.profile.name}
                      <span className="text-xs text-gray-400 font-normal"> {m.profile.role}</span>
                    </p>
                    {m.profile.status === "가입대기" ? (
                      <p className="text-xs text-amber-600">아직 회원가입 전 · 업무는 미리 배정됨</p>
                    ) : (
                      <p className="text-xs text-gray-400">
                        마지막 접속 {formatElapsed(m.profile.last_seen_at)}
                        {isLongInactive(m.profile.last_seen_at) && (
                          <span className="text-red-500 font-medium"> · 장기 미접속</span>
                        )}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 shrink-0">
                    총 {m.total}건
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">평균 진척율</span>
                      <span className="font-semibold text-gray-900">{m.avgProgress}%</span>
                    </div>
                    <ProgressBar value={m.avgProgress} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">달성율 (완료 {m.done}/{m.total})</span>
                      <span className="font-semibold text-emerald-600">{m.completionRate}%</span>
                    </div>
                    <ProgressBar value={m.completionRate} color="bg-emerald-500" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">업무 과중도</span>
                      <span
                        className={cn(
                          "font-semibold",
                          m.workload / maxWorkload > 0.7
                            ? "text-red-600"
                            : m.workload / maxWorkload > 0.4
                              ? "text-amber-600"
                              : "text-gray-500"
                        )}
                      >
                        {m.workload / maxWorkload > 0.7
                          ? "높음"
                          : m.workload / maxWorkload > 0.4
                            ? "보통"
                            : "여유"}
                      </span>
                    </div>
                    <ProgressBar
                      value={Math.min(100, (m.workload / maxWorkload) * 100)}
                      color={
                        m.workload / maxWorkload > 0.7
                          ? "bg-red-500"
                          : m.workload / maxWorkload > 0.4
                            ? "bg-amber-500"
                            : "bg-gray-400"
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-3 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                  <span>진행중 {m.active}</span>
                  <span className="text-red-500">지연 {m.delayed}</span>
                  <span className="text-amber-500">마감임박 {m.dueSoon}</span>
                  {m.unconfirmed > 0 && (
                    <span className="text-blue-600 font-medium">미확인 {m.unconfirmed}</span>
                  )}
                </div>

                <Link
                  href={`/tasks?as=${m.profile.id}`}
                  className="block mt-3 text-center text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  이 팀원 화면 보기
                </Link>
              </div>
            ))}
            {byMember.length === 0 && (
              <div className="col-span-full text-center py-10 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                등록된 팀원이 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      <TaskLedger
        tasks={scopedTasks}
        profiles={profiles}
        title={canSeeTeam ? "업무 진행 현황 (팀 전체)" : "업무 진행 현황 (내 업무)"}
        showAssignee={canSeeTeam}
        canAssign={isLead}
        onAssigned={load}
        viewerId={me?.id}
        emptyText={canSeeTeam ? "등록된 업무가 없습니다." : "배정된 업무가 없습니다."}
      />
    </div>
  );
}

function isDueSoon(t: TaskWithEffectiveStatus) {
  if (!t.due_date || t.effective_status === "완료") return false;
  const days = (new Date(t.due_date).getTime() - Date.now()) / 86400000;
  return days >= 0 && days <= 3;
}

function summarize(list: TaskWithEffectiveStatus[]) {
  const total = list.length;
  const inProgress = list.filter((t) => t.effective_status === "진행중").length;
  const delayed = list.filter((t) => t.effective_status === "지연").length;
  const done = list.filter((t) => t.effective_status === "완료").length;
  const completionRate = total ? Math.round((done / total) * 100) : 0;
  const avgProgress = total
    ? Math.round(list.reduce((sum, t) => sum + (t.progress ?? 0), 0) / total)
    : 0;
  return { total, inProgress, delayed, done, completionRate, avgProgress };
}

function ProgressBar({ value, color = "bg-blue-500" }: { value: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className={cn("h-full rounded-full", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", accent ?? "text-gray-900")}>{value}</p>
    </div>
  );
}
