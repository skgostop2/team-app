"use client";

import { useEffect, useState } from "react";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { Notice, NoticeRead, Profile } from "@/lib/types";
import { isManager } from "@/lib/roles";

export default function NoticesPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reads, setReads] = useState<NoticeRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** 쓰고 있는 글의 구분 — 팀원은 「공유」만 쓸 수 있다 */
  const [kind, setKind] = useState<"공지" | "공유">("공유");
  /** 올릴 때 모두에게 팝업을 띄울지 */
  const [popup, setPopup] = useState(true);
  /** 모두 보기 / 공지만 / 제안·공유만 */
  const [tab, setTab] = useState<"전체" | "공지" | "공유">("전체");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: n }, { data: p }, { data: r }, { data: everyone }] =
      await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("notices").select("*").order("created_at", { ascending: false }),
      // 공지 확인 대상은 팀원 (공지를 쓰는 팀장은 집계에서 제외)
      supabase
        .from("profiles")
        .select("*")
        .eq("status", "승인")
        .eq("role", "팀원")
        .order("name"),
      supabase.from("notice_reads").select("*"),
      // 작성자 이름을 띄우기 위해 전원 (삭제된 사람 포함)
      supabase.from("profiles").select("id, name, role").order("name"),
    ]);

    setMe(profile as Profile);
    setNotices((n ?? []) as Notice[]);
    setProfiles((p ?? []) as Profile[]);
    setReads((r ?? []) as NoticeRead[]);
    setNames(
      new Map(((everyone ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const isLead = isManager(me);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("notices").insert({
      title: title.trim(),
      content: content.trim(),
      created_by: user?.id,
      kind: isLead ? kind : "공유",
      popup,
    });
    setSaving(false);
    if (err) {
      // 실패해도 쓴 글은 지우지 않는다
      setError(err.message);
      return;
    }
    setTitle("");
    setContent("");
    setShowForm(false);
    load();
  }

  /** 쓴 사람 본인이나 팀장만 지운다 */
  async function remove(n: Notice) {
    if (!window.confirm(`「${n.title}」 을(를) 지웁니다. 계속할까요?`)) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("notices").delete().eq("id", n.id);
    if (err) {
      window.alert(`지우지 못했습니다: ${err.message}`);
      return;
    }
    load();
  }

  // 공지를 쓰다가 다른 화면으로 넘어가려 하면 되묻는다
  useUnsavedChanges(title.trim() !== "" || content.trim() !== "");

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">공지 · 제안</h1>
          <p className="text-sm text-gray-500 mt-0.5 break-keep">
            {isLead
              ? "팀장이 내리는 공지와, 누구나 올리는 제안·공유가 함께 쌓입니다."
              : "하고 싶은 말이나 제안을 올리면 팀 전체가 봅니다. 공지는 팀장이 올립니다."}
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setKind(isLead ? "공지" : "공유");
            setPopup(true);
          }}
          className="shrink-0 text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          {showForm ? "접기" : isLead ? "+ 글 올리기" : "+ 제안·공유 올리기"}
        </button>
      </div>

      {/* 묶음 보기 */}
      <div className="flex gap-1.5">
        {(["전체", "공지", "공유"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium"
                : "text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            }
          >
            {t === "공유" ? "제안·공유" : t}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용"
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
          {isLead && (
            <div className="flex gap-1.5">
              {(["공지", "공유"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={
                    kind === k
                      ? "text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium"
                      : "text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600"
                  }
                >
                  {k === "공지" ? "공지 (팀장이 내리는 것)" : "제안·공유"}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={popup}
              onChange={(e) => setPopup(e.target.checked)}
              className="w-4 h-4"
            />
            올리면 <b>모두에게 팝업</b>으로 띄우기
          </label>
          <p className="text-xs text-gray-400 break-keep -mt-1">
            끄면 이 목록에만 쌓입니다. 급하지 않은 공유는 꺼두시는 편이 서로 편합니다.
          </p>

          {(title.trim() !== "" || content.trim() !== "") && (
            <p className="text-xs text-amber-600">
              작성 중입니다. &quot;접기&quot;를 눌러도 쓰던 내용은 그대로 남아 있습니다.
            </p>
          )}
          {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
          >
            {saving ? "올리는 중..." : popup ? "올리기 (모두에게 팝업)" : "올리기"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {notices
          .filter((n) => tab === "전체" || (n.kind ?? "공지") === tab)
          .map((n) => {
          const noticeReads = reads.filter((r) => r.notice_id === n.id);
          const readIds = new Set(noticeReads.map((r) => r.user_id));
          const unreadMembers = profiles.filter((p) => !readIds.has(p.id));
          return (
            <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900 break-keep">
                  <span
                    className={
                      (n.kind ?? "공지") === "공지"
                        ? "mr-1.5 align-middle text-[11px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold"
                        : "mr-1.5 align-middle text-[11px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold"
                    }
                  >
                    {(n.kind ?? "공지") === "공지" ? "공지" : "제안"}
                  </span>
                  {n.title}
                </h3>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {names.get(n.created_by ?? "") ?? "-"} · {formatDateTime(n.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-keep">{n.content}</p>

              {(isLead || n.created_by === me?.id) && (
                <button
                  onClick={() => remove(n)}
                  className="text-xs text-gray-400 hover:text-red-600 mt-2 mr-3"
                >
                  지우기
                </button>
              )}

              {isLead && (
                <button
                  onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  className="text-xs text-blue-600 hover:underline mt-2"
                >
                  확인 현황 ({readIds.size}/{profiles.length})
                </button>
              )}

              {isLead && expanded === n.id && (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs space-y-1">
                  <p className="text-gray-500 font-medium">미확인: {unreadMembers.map((p) => p.name).join(", ") || "없음"}</p>
                  <p className="text-gray-400">
                    확인함: {noticeReads.map((r) => profiles.find((p) => p.id === r.user_id)?.name ?? "-").join(", ") || "없음"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {notices.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            아직 올라온 글이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
