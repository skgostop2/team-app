"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatElapsed, isLongInactive, formatDate, cn } from "@/lib/utils";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isManager, isAssignable, byDisplayOrder } from "@/lib/roles";
import TaskLedger from "@/components/TaskLedger";
import ViewAsBanner from "@/components/ViewAsBanner";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";

export default function DashboardPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [togglingShare, setTogglingShare] = useState(false);

  // 팀장·실장이 특정 팀원의 화면을 그대로 들여다보는 모드 (?as=<id>)
  const searchParams = useSearchParams();
  const asId = searchParams.get("as");

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
  const viewingAs = isLead && asId ? profiles.find((p) => p.id === asId) : undefined;

  // 팀장이 공개를 켜두면 팀원도 팀 전체 현황을 본다.
  // 팀원 화면 보기 중이면 그 팀원 기준으로 판단한다.
  const canSeeTeam = viewingAs ? shared : isLead || shared;

  // 체크된 사람은 모두 그 업무의 담당자다 (여러 명 체크 가능)
  const isOn = (t: TaskWithEffectiveStatus, uid?: string) =>
    !!uid && (t.assignee_id === uid || (t.deputy_ids ?? []).includes(uid));

  // 화면 보기 중이면 그 팀원 업무를 "내 업무"로 삼는다
  const subjectId = viewingAs ? viewingAs.id : me?.id;
  const myTasks = useMemo(() => tasks.filter((t) => isOn(t, subjectId)), [tasks, subjectId]);
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
    // 현재 재직 중인 인원 + 가입 전 미리 등록해 둔 인원 (미리 배정한 업무를 보기 위해)
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
        // 본인이 스스로 올린 업무 건수
        const selfAdded = mine.filter((t) => t.source === "팀원추가" && t.created_by === p.id);
        // 업무 과중도: 진행중 + 지연×2 + 마감임박×1.5
        const workload = active.length + delayed.length * 2 + dueSoon.length * 1.5;
        return {
          profile: p,
          total: mine.length,
          done: s.done,
          delayed: delayed.length,
          dueSoon: dueSoon.length,
          unconfirmed: unconfirmed.length,
          selfAdded: selfAdded.length,
          active: active.length,
          avgProgress: s.avgProgress,
          completionRate: s.completionRate,
          workload,
        };
      })
      .sort((a, b) => byDisplayOrder(a.profile, b.profile));
  }, [profiles, tasks]);

  // 과중도는 절대 기준으로 본다. 팀 내 상대값으로만 보면 다들 1건씩일 때도
  // 지연 하나 때문에 "높음"이 떠서 실제와 다르게 보인다.
  const WORKLOAD_HIGH = 8;
  const maxWorkload = Math.max(WORKLOAD_HIGH, ...byMember.map((m) => m.workload));

  const [reordering, setReordering] = useState(false);

  // ▲▼ 로 팀원 순서를 바꾼다 (팀장·실장만). 순서는 모든 화면에 함께 적용된다.
  async function reorder(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= byMember.length) return;
    const a = byMember[index].profile;
    const b = byMember[target].profile;
    setReordering(true);
    const supabase = createClient();
    await Promise.all([
      supabase.from("profiles").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("profiles").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    await load();
    setReordering(false);
  }

  if (loading) {
    return <p className="text-sm text-gray-400">불러오는 중...</p>;
  }

  const unconfirmedForSubject = myTasks.filter((t) => t.is_new).length;

  return (
    <div className="space-y-6">
      {viewingAs && (
        <ViewAsBanner
          current={viewingAs}
          members={byMember.map((m) => m.profile)}
          unconfirmed={unconfirmedForSubject}
          basePath="/dashboard"
        />
      )}

      <PrintHeader
        title={
          viewingAs
            ? `업무 현황 — ${viewingAs.name}`
            : canSeeTeam
              ? "팀 업무 현황"
              : "내 업무 현황"
        }
        subtitle={`전체 ${stats.total}건 · 진행중 ${stats.inProgress}건 · 지연 ${stats.delayed}건 · 달성율 ${stats.completionRate}%`}
      />

      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {viewingAs
              ? `${viewingAs.name} 님 화면`
              : canSeeTeam
                ? "전체 팀 대시보드"
                : "내 업무 현황"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {viewingAs
              ? "이 팀원에게 보이는 그대로입니다."
              : isLead
                ? "팀원별 진척율과 달성율을 한눈에 확인합니다."
                : canSeeTeam
                  ? "팀 전체 현황과 내가 맡은 업무를 함께 봅니다."
                  : "내가 맡은 업무의 진행 상황입니다."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
        <PrintButton />
        {isLead && !viewingAs && (
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print-block">
        <StatCard label={canSeeTeam ? "전체 업무" : "내 업무"} value={stats.total} />
        <StatCard label="진행중" value={stats.inProgress} accent="text-blue-600" />
        <StatCard label="지연" value={stats.delayed} accent="text-red-600" />
        <StatCard
          label={canSeeTeam ? "팀 달성율" : "내 달성율"}
          value={`${stats.completionRate}%`}
          accent="text-emerald-600"
        />
      </div>

      {(!isLead || viewingAs) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">
              {viewingAs ? `${viewingAs.name} 님 평균 진척율` : "내 평균 진척율"}
            </p>
            <span className="text-sm font-bold text-gray-900">{myStats.avgProgress}%</span>
          </div>
          <ProgressBar value={myStats.avgProgress} />
          <p className="text-xs text-gray-400 mt-2">
            내 업무 {myStats.total}건 · 완료 {myStats.done}건 · 진행중 {myStats.inProgress}건 · 지연{" "}
            {myStats.delayed}건 · 내 달성율 {myStats.completionRate}%
          </p>
        </div>
      )}

      {isLead && !viewingAs && (
        <MemberProgressTable
          rows={byMember}
          maxWorkload={maxWorkload}
          onReorder={reorder}
          reordering={reordering}
        />
      )}

      <TaskLedger
        tasks={scopedTasks}
        profiles={profiles}
        title={
          viewingAs
            ? `업무 진행 현황 (${viewingAs.name} 님이 보는 화면)`
            : canSeeTeam
              ? "업무 진행 현황 (팀 전체)"
              : "업무 진행 현황 (내 업무)"
        }
        showAssignee={canSeeTeam}
        canAssign={isLead && !viewingAs}
        onAssigned={load}
        viewerId={subjectId}
        canEdit={!viewingAs}
        onChanged={load}
        emptyText={canSeeTeam ? "등록된 업무가 없습니다." : "배정된 업무가 없습니다."}
      />
    </div>
  );
}

type MemberRow = {
  profile: Profile;
  total: number;
  done: number;
  delayed: number;
  dueSoon: number;
  unconfirmed: number;
  selfAdded: number;
  active: number;
  avgProgress: number;
  completionRate: number;
  workload: number;
};

/** 팀원별 진척 현황 — 업무 목록과 같은 표 양식. 한 사람에 한 줄, 위에서 아래로. */
function MemberProgressTable({
  rows,
  maxWorkload,
  onReorder,
  reordering,
}: {
  rows: MemberRow[];
  maxWorkload: number;
  onReorder: (index: number, dir: -1 | 1) => void;
  reordering: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 print-block">
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">팀원별 진척 현황</h2>
        <p className="text-xs text-gray-400">
          ▲▼ 순서 변경 · &quot;추가&quot;는 팀원이 스스로 올린 업무 건수
        </p>
      </div>

      <div className="overflow-x-auto print-table">
        <table className="w-full text-sm border-collapse min-w-[900px] table-fixed">
          <thead>
            <tr className="bg-blue-50 text-gray-700 text-xs">
              <MTh className="w-16 text-center">순서</MTh>
              <MTh className="w-40">이름</MTh>
              <MTh className="w-16 text-center">업무</MTh>
              <MTh className="w-40">평균 진척율</MTh>
              <MTh className="w-40">달성율</MTh>
              <MTh className="w-32">업무 과중도</MTh>
              <MTh className="w-16 text-center">진행중</MTh>
              <MTh className="w-16 text-center">지연</MTh>
              <MTh className="w-20 text-center">마감임박</MTh>
              <MTh className="w-16 text-center">미확인</MTh>
              <MTh className="w-16 text-center">추가</MTh>
              <MTh className="w-24 text-center">화면</MTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const ratio = m.workload / maxWorkload;
              const heavy = ratio > 0.7;
              const medium = ratio > 0.4;
              return (
                <tr key={m.profile.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  <MTd className="text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => onReorder(i, -1)}
                        disabled={reordering || i === 0}
                        title="위로"
                        className="px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => onReorder(i, 1)}
                        disabled={reordering || i === rows.length - 1}
                        title="아래로"
                        className="px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                  </MTd>

                  <MTd>
                    <span className="font-medium text-gray-900 break-keep">{m.profile.name}</span>
                    {m.profile.position && (
                      <span className="text-xs text-gray-400"> {m.profile.position}</span>
                    )}
                    {m.profile.status === "가입대기" ? (
                      <span className="block text-[11px] text-amber-600">가입 전 · 미리 배정됨</span>
                    ) : (
                      <span className="block text-[11px] text-gray-400">
                        {formatElapsed(m.profile.last_seen_at)}
                        {isLongInactive(m.profile.last_seen_at) && (
                          <span className="text-red-500 font-medium"> · 장기 미접속</span>
                        )}
                      </span>
                    )}
                  </MTd>

                  <MTd className="text-center text-gray-600">{m.total}</MTd>

                  <MTd>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[50px]">
                        <ProgressBar value={m.avgProgress} />
                      </div>
                      <span className="text-xs font-semibold text-gray-900 w-9 text-right">
                        {m.avgProgress}%
                      </span>
                    </div>
                  </MTd>

                  <MTd>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[50px]">
                        <ProgressBar value={m.completionRate} color="bg-emerald-500" />
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 w-9 text-right">
                        {m.completionRate}%
                      </span>
                    </div>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      완료 {m.done}/{m.total}
                    </span>
                  </MTd>

                  <MTd>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[40px]">
                        <ProgressBar
                          value={Math.min(100, ratio * 100)}
                          color={heavy ? "bg-red-500" : medium ? "bg-amber-500" : "bg-gray-400"}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-xs font-semibold w-8 text-right",
                          heavy ? "text-red-600" : medium ? "text-amber-600" : "text-gray-500"
                        )}
                      >
                        {heavy ? "높음" : medium ? "보통" : "여유"}
                      </span>
                    </div>
                  </MTd>

                  <MTd className="text-center text-gray-600">{m.active}</MTd>
                  <MTd className={cn("text-center", m.delayed > 0 ? "text-red-600 font-semibold" : "text-gray-400")}>
                    {m.delayed}
                  </MTd>
                  <MTd className={cn("text-center", m.dueSoon > 0 ? "text-amber-600 font-semibold" : "text-gray-400")}>
                    {m.dueSoon}
                  </MTd>
                  <MTd className={cn("text-center", m.unconfirmed > 0 ? "text-blue-600 font-semibold" : "text-gray-400")}>
                    {m.unconfirmed}
                  </MTd>

                  {/* 본인이 스스로 올린 업무 — 누르면 그 팀원 화면에서 확인 */}
                  <MTd className="text-center">
                    {m.selfAdded > 0 ? (
                      <Link
                        href={`/tasks?as=${m.profile.id}`}
                        className="text-blue-700 font-semibold underline underline-offset-2"
                        title="이 팀원이 추가한 업무 보기"
                      >
                        {m.selfAdded}
                      </Link>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </MTd>

                  <MTd className="text-center">
                    <Link
                      href={`/tasks?as=${m.profile.id}`}
                      className="inline-block text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                    >
                      보기
                    </Link>
                  </MTd>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-gray-400">
                  등록된 팀원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MTh({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-medium text-left border-b border-gray-300 border-r border-gray-200 last:border-r-0",
        className
      )}
    >
      {children}
    </th>
  );
}

function MTd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <td className={cn("px-3 py-2.5 align-top border-r border-gray-100 last:border-r-0", className)}>
      {children}
    </td>
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
