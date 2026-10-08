"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Group, Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { isManager } from "@/lib/roles";
import { cn, formatDateTime, formatShortDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import TaskEditModal from "@/components/TaskEditModal";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";

/**
 * 신규 업무 진행 보고 — 아래에서 위로 올라오는 보고함.
 *
 * 그룹장이나 팀원이 새 업무를 올리면 여기에 쌓인다.
 * 팀장이 "확인"을 누르면 목록에서 빠진다 (업무가 지워지는 것이 아니다).
 * 팀장·실장이 직접 올린 업무는 이미 아는 것이므로 올라오지 않는다.
 *
 * 새로 가입한 사람도 여기 같이 띄운다. 우리 팀이 아닌 사람이 들어왔는지
 * 바로 눈에 띄어야 하기 때문이다.
 */

/** 최근에 가입했다고 볼 기간 */
const NEW_MEMBER_DAYS = 14;

export default function ReportsPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<TaskWithEffectiveStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: all }, { data: gs }, { data: ts }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("profiles").select("*").order("name"),
      supabase.from("groups").select("*").order("sort_order"),
      supabase.from("v_tasks").select("*").order("created_at", { ascending: false }),
    ]);

    setMe(profile as Profile);
    setProfiles((all ?? []) as Profile[]);
    setGroups((gs ?? []) as Group[]);
    setTasks((ts ?? []) as TaskWithEffectiveStatus[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  if (!isManager(me)) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-gray-500">이 화면은 팀장·실장만 볼 수 있습니다.</p>
      </div>
    );
  }

  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name ?? "—";
  const groupOf = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return groups.find((g) => g.id === p?.group_id)?.name ?? null;
  };

  const pending = tasks.filter((t) => !t.lead_ack_at);
  const acked = tasks.filter((t) => t.lead_ack_at).slice(0, 30);

  // 최근에 가입한 사람 — 우리 팀이 아닌 계정이 들어왔는지 눈에 띄게 한다
  const since = Date.now() - NEW_MEMBER_DAYS * 24 * 60 * 60 * 1000;
  const newcomers = profiles.filter(
    (p) =>
      p.status === "승인" &&
      p.role === "팀원" &&
      !p.group_id &&
      new Date(p.created_at).getTime() > since
  );

  async function ack(id: string) {
    setBusyId(id);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("tasks")
      .update({ lead_ack_at: new Date().toISOString(), lead_ack_by: me!.id })
      .eq("id", id);
    setBusyId(null);
    if (err) {
      setError(`확인 처리를 하지 못했습니다: ${err.message}`);
      return;
    }
    await load();
  }

  async function ackAll() {
    setBusyId("all");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("tasks")
      .update({ lead_ack_at: new Date().toISOString(), lead_ack_by: me!.id })
      .in(
        "id",
        pending.map((t) => t.id)
      );
    setBusyId(null);
    if (err) {
      setError(`확인 처리를 하지 못했습니다: ${err.message}`);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <PrintHeader
        title="신규 업무 진행 보고"
        subtitle={`미확인 ${pending.length}건 · ${me?.name ?? ""}`}
      />

      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">신규 업무 진행 보고</h1>
          <p className="text-sm text-gray-500 mt-0.5 break-keep">
            그룹장·팀원이 새로 올린 업무가 여기로 올라옵니다. 확인을 누르면 목록에서 빠집니다
            (업무가 지워지는 것이 아닙니다).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          {pending.length > 0 && (
            <button
              onClick={ackAll}
              disabled={busyId !== null}
              className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {busyId === "all" ? "처리 중..." : `${pending.length}건 모두 확인`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 새로 가입한 사람 */}
      {newcomers.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            새로 가입한 사람 {newcomers.length}명 — 그룹이 아직 없습니다
          </p>
          <p className="text-xs text-amber-700 mt-0.5 break-keep">
            그룹을 정해주기 전까지는 남의 업무를 보지 못합니다. 우리 팀원이 아니면 팀원관리에서
            삭제하세요.
          </p>
          <ul className="mt-2 space-y-0.5">
            {newcomers.map((p) => (
              <li key={p.id} className="text-sm text-amber-900 break-keep">
                · {p.name} <span className="text-amber-700">{p.email}</span>
                <span className="text-xs text-amber-600"> · {formatShortDate(p.created_at)} 가입</span>
              </li>
            ))}
          </ul>
          <Link
            href="/team"
            className="inline-block mt-2 text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100"
          >
            팀원관리로 가기
          </Link>
        </div>
      )}

      {/* 미확인 보고 */}
      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden print-block">
        <div className="px-4 py-3 border-b border-gray-200 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-gray-900">확인하지 않은 신규 업무</h2>
          <span className="text-xs text-gray-400">{pending.length}건</span>
        </div>

        <ul className="divide-y divide-gray-100">
          {pending.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setDetailId(t.id)}
                    className="text-left text-sm font-medium text-gray-900 hover:text-blue-700 break-keep"
                  >
                    {t.title}
                  </button>
                  <p className="text-xs text-gray-500 mt-0.5 break-keep">
                    올린 사람 {nameOf(t.created_by)}
                    {groupOf(t.created_by) && ` (${groupOf(t.created_by)})`}
                    {" · "}담당 {nameOf(t.assignee_id)}
                    {t.due_date && ` · 완료계획 ${formatShortDate(t.due_date)}`}
                    {" · "}
                    {formatDateTime(t.created_at)}
                  </p>
                  {t.description && (
                    <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap break-keep line-clamp-3">
                      {t.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={t.effective_status} />
                  <button
                    onClick={() => ack(t.id)}
                    disabled={busyId !== null}
                    className="no-print text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {busyId === t.id ? "처리 중..." : "확인"}
                  </button>
                </div>
              </div>
            </li>
          ))}

          {pending.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-gray-400">
              확인하지 않은 신규 업무가 없습니다.
            </li>
          )}
        </ul>
      </section>

      {/* 이미 확인한 것 — 접어둔다 */}
      <section className="no-print">
        <button
          onClick={() => setShowDone((v) => !v)}
          className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          {showDone ? "확인한 업무 접기" : `확인한 업무 보기 (최근 ${acked.length}건)`}
        </button>

        {showDone && (
          <ul className="mt-3 rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
            {acked.map((t) => (
              <li key={t.id} className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setDetailId(t.id)}
                  className={cn(
                    "text-left text-sm text-gray-700 hover:text-blue-700 break-keep min-w-0 flex-1"
                  )}
                >
                  {t.title}
                </button>
                <span className="text-xs text-gray-400">{nameOf(t.assignee_id)}</span>
                <span className="text-xs text-gray-300">
                  {t.lead_ack_at ? `${formatShortDate(t.lead_ack_at)} 확인` : ""}
                </span>
              </li>
            ))}
            {acked.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">없습니다.</li>
            )}
          </ul>
        )}
      </section>

      {detailId && (
        <TaskEditModal taskId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
      )}
    </div>
  );
}
