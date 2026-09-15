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
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: n }, { data: p }, { data: r }] = await Promise.all([
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
    ]);

    setMe(profile as Profile);
    setNotices((n ?? []) as Notice[]);
    setProfiles((p ?? []) as Profile[]);
    setReads((r ?? []) as NoticeRead[]);
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
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("notices").insert({ title: title.trim(), content: content.trim(), created_by: user?.id });
    setTitle("");
    setContent("");
    setShowForm(false);
    setSaving(false);
    load();
  }

  // 공지를 쓰다가 다른 화면으로 넘어가려 하면 되묻는다
  useUnsavedChanges(title.trim() !== "" || content.trim() !== "");

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">공지사항</h1>
        {isLead && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            {showForm ? "접기" : "+ 공지 등록"}
          </button>
        )}
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
          {(title.trim() !== "" || content.trim() !== "") && (
            <p className="text-xs text-amber-600">
              작성 중입니다. &quot;접기&quot;를 눌러도 쓰던 내용은 그대로 남아 있습니다.
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
          >
            등록 (전체 팀원에게 팝업 노출)
          </button>
        </form>
      )}

      <div className="space-y-3">
        {notices.map((n) => {
          const noticeReads = reads.filter((r) => r.notice_id === n.id);
          const readIds = new Set(noticeReads.map((r) => r.user_id));
          const unreadMembers = profiles.filter((p) => !readIds.has(p.id));
          return (
            <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{n.title}</h3>
                <span className="text-xs text-gray-400">{formatDateTime(n.created_at)}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{n.content}</p>

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
            등록된 공지사항이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
