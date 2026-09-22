"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { isManager, isAssignable, byDisplayOrder } from "@/lib/roles";
import QuickAssignForm from "@/components/QuickAssignForm";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";

type Batch = {
  id: string;
  content: string;
  task_count: number;
  created_at: string;
  created_by: string | null;
};

/**
 * 업무지시 화면.
 *
 * 주간 업무지시처럼 한꺼번에 내려오는 글을 그대로 붙여넣는 자리다.
 * 왼쪽에 원문, 오른쪽에 정리된 결과가 같이 보인다.
 * 지시 원문은 보관해서 나중에 "이렇게 지시했다"를 대조할 수 있게 한다.
 */
export default function AssignPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: all }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("profiles").select("*").order("sort_order"),
    ]);

    const mine = profile as Profile | null;
    setMe(mine);

    if (!mine || !isManager(mine)) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const list = (all ?? []) as Profile[];
    setMembers(list.filter(isAssignable).sort(byDisplayOrder));
    setNames(Object.fromEntries(list.map((p) => [p.id, p.name])));

    const { data: bs } = await supabase
      .from("assign_batches")
      .select("id, content, task_count, created_at, created_by")
      .order("created_at", { ascending: false })
      .limit(20);
    setBatches((bs ?? []) as Batch[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  if (denied)
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-medium text-gray-700">업무지시는 팀장·실장만 쓸 수 있습니다.</p>
      </div>
    );

  return (
    <div className="space-y-5">
      <PrintHeader title="업무지시 내역" subtitle={me?.team_name ?? ""} />

      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">업무지시</h1>
          <p className="text-sm text-gray-500 mt-0.5 break-keep">
            지시 내용을 한꺼번에 붙여넣으면 이름과 기한을 찾아 담당자별 업무로 만듭니다.
          </p>
        </div>
        <PrintButton label="지시내역 인쇄" />
      </div>

      {msg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {msg}
        </div>
      )}

      <div className="no-print bg-white rounded-xl border border-gray-200 p-4">
        {me && (
          <QuickAssignForm
            members={members}
            createdBy={me.id}
            instructorDefault={me.name}
            layout="page"
            onDone={(n) => {
              setMsg(`${n}건을 지시 등록했습니다. 담당자 화면에 새 업무로 표시됩니다.`);
              load();
            }}
          />
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 print-block">
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-wrap">
          <h2 className="text-base font-bold text-gray-900">지시 원문 보관</h2>
          <p className="text-xs text-gray-400">누르면 그때 붙여넣은 글이 펼쳐집니다</p>
        </div>

        {batches.length === 0 && (
          <p className="text-sm text-gray-400 px-4 py-6">아직 보관된 지시 원문이 없습니다.</p>
        )}

        {batches.map((b) => {
          const expanded = open === b.id;
          const when = new Date(b.created_at);
          const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(
            when.getDate()
          ).padStart(2, "0")} ${String(when.getHours()).padStart(2, "0")}:${String(
            when.getMinutes()
          ).padStart(2, "0")}`;
          return (
            <div key={b.id} className="border-b border-gray-100 last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : b.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {stamp} · {b.task_count}건
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {b.content.split("\n")[0].slice(0, 60)}
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {names[b.created_by ?? ""] ?? ""} {expanded ? "▲" : "▼"}
                </span>
              </button>
              {expanded && (
                <pre className="px-4 pb-4 text-xs text-gray-700 whitespace-pre-wrap break-words font-sans">
                  {b.content}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
