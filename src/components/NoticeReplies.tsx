"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

export type NoticeReply = {
  id: string;
  notice_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

/**
 * 제안·공지 한 장 아래 달리는 답글.
 * 팀장이 한 줄이라도 달면 제안한 사람은 "읽혔다"를 안다 — 그게 이 부품의 목적이다.
 */
export default function NoticeReplies({
  noticeId,
  replies,
  names,
  managerIds,
  leadSeen,
  showLeadSeen = true,
  meId,
  isLead,
  onChanged,
}: {
  noticeId: string;
  replies: NoticeReply[];
  names: Map<string, string>;
  /** 팀장·실장 id — 이 사람들 답글은 띠 색을 달리한다 */
  managerIds: Set<string>;
  /** 팀장·실장 중 누군가 확인(팝업 확인)을 눌렀는가 */
  leadSeen: boolean;
  /** 제안에만 「팀장 확인」 표시를 단다 (공지는 팀장이 쓴 것이라 의미 없음) */
  showLeadSeen?: boolean;
  meId: string | undefined;
  isLead: boolean;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(replies.length > 0);
  const [busy, setBusy] = useState(false);

  async function send() {
    const body = text.trim();
    if (!body || busy || !meId) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("notice_replies")
      .insert({ notice_id: noticeId, author_id: meId, content: body });
    setBusy(false);
    if (error) {
      window.alert(`답글을 달지 못했습니다: ${error.message}`);
      return;
    }
    setText("");
    onChanged();
  }

  async function remove(id: string) {
    if (!window.confirm("이 답글을 지울까요?")) return;
    const supabase = createClient();
    await supabase.from("notice_replies").delete().eq("id", id);
    onChanged();
  }

  const leadReplied = replies.some((r) => managerIds.has(r.author_id));

  return (
    <div className="mt-2 pt-2 border-t border-black/10">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-gray-600 hover:underline"
        >
          답글 {replies.length}{open ? " ▴" : " ▾"}
        </button>
        {!showLeadSeen ? null : leadReplied ? (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
            팀장 답함
          </span>
        ) : leadSeen ? (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
            팀장 확인함
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">팀장 확인 전</span>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-1.5">
          {replies.map((r) => {
            const fromLead = managerIds.has(r.author_id);
            return (
              <div
                key={r.id}
                className={
                  "rounded-lg px-2.5 py-1.5 text-sm break-keep " +
                  (fromLead ? "bg-emerald-50 border border-emerald-200" : "bg-white/70 border border-black/5")
                }
              >
                <span className="text-xs font-bold text-gray-700 mr-1.5">
                  {names.get(r.author_id) ?? "-"}
                </span>
                <span className="text-gray-800 whitespace-pre-wrap">{r.content}</span>
                <span className="ml-2 text-[11px] text-gray-400 whitespace-nowrap">
                  {formatDateTime(r.created_at)}
                </span>
                {(r.author_id === meId || isLead) && (
                  <button
                    onClick={() => remove(r.id)}
                    className="ml-2 text-[11px] text-gray-400 hover:text-red-600"
                  >
                    지우기
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={isLead ? "답글 (한 줄이면 됩니다 — 제안한 사람이 기다립니다)" : "답글"}
              className="flex-1 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-sm"
            />
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              className="shrink-0 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              달기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
