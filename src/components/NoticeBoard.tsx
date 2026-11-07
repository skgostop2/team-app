"use client";

import { useEffect, useState } from "react";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { Notice, NoticeRead, Profile } from "@/lib/types";
import { isManager } from "@/lib/roles";
import NoticeReplies, { type NoticeReply } from "@/components/NoticeReplies";
import Attachments from "@/components/Attachments";

export default function NoticeBoard({ compact = false }: { compact?: boolean }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reads, setReads] = useState<NoticeRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [replies, setReplies] = useState<NoticeReply[]>([]);
  /** 팀장·실장 id (답글·확인 표시용) */
  const [managerIds, setManagerIds] = useState<Set<string>>(new Set());
  /** 메모처럼 한 칸에 쓴다 — 첫 줄이 제목, 나머지가 내용 */
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** 쓰고 있는 글의 구분 — 팀원은 「공유」만 쓸 수 있다 */

  /** 올릴 때 모두에게 팝업을 띄울지 */
  const popup = true; // 올리면 항상 팝업 — 묻지 않는다
  /** 모두 보기 / 공지만 / 제안·공유만 */
  const [tab, setTab] = useState<"전체" | "공지" | "공유">("전체");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: n }, { data: p }, { data: r }, { data: everyone }, { data: rp }] =
      await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("notices").select("*").order("created_at", { ascending: false }),
      // 공지 확인 대상은 팀원·그룹장 (공지를 쓰는 팀장·실장은 집계에서 제외)
      supabase
        .from("profiles")
        .select("*")
        .eq("status", "승인")
        .in("role", ["팀원", "그룹장"])
        .order("name"),
      supabase.from("notice_reads").select("*"),
      // 작성자 이름을 띄우기 위해 전원 (삭제된 사람 포함)
      supabase.from("profiles").select("id, name, role").order("name"),
      supabase.from("notice_replies").select("*").order("created_at", { ascending: true }),
    ]);
    setReplies((rp ?? []) as NoticeReply[]);
    setManagerIds(
      new Set(
        ((everyone ?? []) as { id: string; role: string }[])
          .filter((x) => x.role === "팀장" || x.role === "실장")
          .map((x) => x.id)
      )
    );

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
    const supabase = createClient();
    const ch = supabase
      .channel("notice-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_replies" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const isLead = isManager(me);

  async function handleCreate() {
    const text = draft.trim();
    if (!text || saving) return;
    const [first, ...others] = text.split(/\r?\n/);
    const title = first.trim().slice(0, 60);
    // 첫 줄이 길면 나머지를 내용으로, 한 줄뿐이면 내용도 같은 글
    const rest = (first.trim().length > 60 ? text : others.join("\n").trim()) || title;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("notices").insert({
      title,
      content: rest,
      created_by: user?.id,
      kind: effKind,
      popup,
    });
    setSaving(false);
    if (err) {
      // 실패해도 쓴 글은 지우지 않는다
      setError(err.message);
      return;
    }
    setDraft("");
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
  useUnsavedChanges(draft.trim() !== "");

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  // 팀장·실장은 기본이 「공지」, 팀원은 「제안」뿐
  const effKind: "공지" | "공유" = isLead ? "공지" : "공유";

  return (
    <div className={compact ? "space-y-3" : "max-w-3xl space-y-4"}>
      <div className={compact ? "hidden" : ""}>
        <h1 className="text-xl font-bold text-gray-900">공지 · 제안</h1>
        <p className="text-sm text-gray-500 mt-0.5 break-keep">
          {isLead
            ? "공지를 내리거나, 하고 싶은 말을 메모처럼 바로 붙입니다."
            : "하고 싶은 말이나 제안을 메모처럼 한 줄 써서 붙이면 팀 전체가 봅니다."}
        </p>
      </div>

      {/* 메모처럼 — 쓰고 엔터면 바로 붙는다 */}
      <div
        className={
          "rounded-xl border-2 p-3 space-y-2 " +
          (effKind === "공지" ? "bg-sky-50 border-sky-300" : "bg-amber-50 border-amber-300")
        }
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 한글 조합 중 엔터는 글자 확정이므로 올리지 않는다
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleCreate();
            }
          }}
          rows={2}
          placeholder={
            effKind === "공지"
              ? "공지를 쓰고 엔터 (줄바꿈은 Shift+엔터)"
              : "하고 싶은 말·제안을 쓰고 엔터 (줄바꿈은 Shift+엔터)"
          }
          className="w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-base leading-relaxed resize-y"
        />
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500 break-keep">
            붙이면 다른 사람 화면에 바로 팝업으로 뜹니다.
          </p>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || draft.trim() === ""}
            className="ml-auto text-sm px-4 py-1.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-40"
          >
            {saving ? "붙이는 중..." : "붙이기"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
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
            {t === "공유" ? "제안" : t}
          </button>
        ))}
      </div>

      {/* 쪽지판 */}
      <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {notices
          .filter((n) => tab === "전체" || (n.kind ?? "공지") === tab)
          .map((n) => {
            const isNotice = (n.kind ?? "공지") === "공지";
            const noticeReads = reads.filter((r) => r.notice_id === n.id);
            const readIds = new Set(noticeReads.map((r) => r.user_id));
            const unreadMembers = profiles.filter((p) => !readIds.has(p.id));
            const sameAsTitle = n.content.trim() === n.title.trim();
            return (
              <div
                key={n.id}
                className={
                  "rounded-xl border p-4 shadow-sm flex flex-col " +
                  (isNotice
                    ? "bg-sky-50 border-sky-300"
                    : "bg-amber-50 border-amber-300")
                }
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={
                      "text-[11px] px-1.5 py-0.5 rounded text-white font-bold " +
                      (isNotice ? "bg-blue-600" : "bg-emerald-600")
                    }
                  >
                    {isNotice ? "공지" : "제안"}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    <b className="text-gray-700">{names.get(n.created_by ?? "") ?? "-"}</b> ·{" "}
                    {formatDateTime(n.created_at)}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 break-keep">{n.title}</h3>
                {!sameAsTitle && (
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-keep">
                    {n.content}
                  </p>
                )}

                <div className="mt-auto pt-2 flex items-center gap-3">
                  {(isLead || n.created_by === me?.id) && (
                    <button
                      onClick={() => remove(n)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      지우기
                    </button>
                  )}
                  {isLead && (
                    <button
                      onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      확인 현황 ({readIds.size}/{profiles.length})
                    </button>
                  )}
                </div>

                <Attachments
                  noticeId={n.id}
                  canUpload={isLead || n.created_by === me?.id}
                  names={names}
                  meId={me?.id}
                  isLead={isLead}
                  compact
                />
                <NoticeReplies
                  noticeId={n.id}
                  replies={replies.filter((r) => r.notice_id === n.id)}
                  names={names}
                  managerIds={managerIds}
                  leadSeen={noticeReads.some((r) => managerIds.has(r.user_id))}
                  showLeadSeen={!isNotice}
                  meId={me?.id}
                  isLead={isLead}
                  onChanged={load}
                />

                {isLead && expanded === n.id && (
                  <div className="mt-2 pt-2 border-t border-black/10 text-xs space-y-1">
                    <p className="text-gray-600 font-medium">
                      미확인: {unreadMembers.map((p) => p.name).join(", ") || "없음"}
                    </p>
                    <p className="text-gray-500">
                      확인함:{" "}
                      {noticeReads
                        .map((r) => profiles.find((p) => p.id === r.user_id)?.name ?? "-")
                        .join(", ") || "없음"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      {notices.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          아직 붙은 글이 없습니다. 위 칸에 한 줄 써서 붙여 보세요.
        </div>
      )}
    </div>
  );
}
