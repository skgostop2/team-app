"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TaskUpdate, TaskWithEffectiveStatus } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * 질문 창.
 *
 * 받은 업무가 무슨 말인지 모를 때 물어보는 자리다.
 * 그동안은 길이 없어서, 모르면 그냥 안 하거나 밖에서 물어보고 기록이 안 남았다.
 *
 * 질문은 업무에 붙여 둔다 — 따로 게시판을 만들면 업무와 떨어져서
 * 나중에 "왜 그렇게 하기로 했더라"를 찾지 못한다.
 *
 * 답이 달렸는지는 답변 글이 있느냐로 본다(reply_to). 질문한 사람 말고는
 * 질문 글을 고칠 수 없으므로, 따로 "답변됨" 표시를 찍지 않는다.
 */

type Thread = { q: TaskUpdate; answers: TaskUpdate[] };

export default function QuestionModal({
  task,
  profiles,
  canAsk,
  canAnswer,
  onClose,
  onChanged,
}: {
  task: TaskWithEffectiveStatus;
  profiles: Profile[];
  /** 담당자·참여자 (물어볼 수 있는 사람) */
  canAsk: boolean;
  /** 팀장·실장·그룹장 (답할 수 있는 사람) */
  canAnswer: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("task_updates")
      .select("*")
      .eq("task_id", task.id)
      .in("kind", ["질문", "답변"])
      .order("created_at", { ascending: true });

    const rows = (data ?? []) as TaskUpdate[];
    const qs = rows.filter((r) => r.kind === "질문");
    const as = rows.filter((r) => r.kind === "답변");
    setThreads(qs.map((q) => ({ q, answers: as.filter((a) => a.reply_to === q.id) })));
    setLoading(false);
  }, [task.id]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = (id: string | null) =>
    profiles.find((p) => p.id === id)?.name ?? "(삭제된 계정)";

  async function write(kind: "질문" | "답변", content: string, parent?: string) {
    const body = content.trim();
    if (!body) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 필요합니다.");
      setSaving(false);
      return;
    }

    const { error: err } = await supabase.from("task_updates").insert({
      task_id: task.id,
      author_id: user.id,
      content: body,
      kind,
      reply_to: parent ?? null,
    });
    setSaving(false);
    if (err) {
      // 실패하면 쓴 글을 지우지 않는다
      setError(err.message);
      return;
    }

    setText("");
    setReplyText("");
    setReplyTo(null);
    await load();
    onChanged?.();
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl p-4 md:p-5 h-[88dvh] md:h-auto md:max-h-[88dvh] flex flex-col">
        <div className="flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 break-keep">
              <span className="text-amber-500">?</span> 질문과 답변
            </h3>
            <p className="text-xs text-gray-500 break-keep mt-0.5">{task.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {canAsk && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 shrink-0">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="이 업무에서 무엇이 궁금하신가요? (예: 어느 라인부터 하면 됩니까? 보고는 누구에게 합니까?)"
              rows={2}
              className="w-full rounded-lg border border-amber-300 px-3 py-2 text-base bg-white"
            />
            {error && <p className="text-sm text-red-600 mt-2 break-keep">{error}</p>}
            <button
              onClick={() => write("질문", text)}
              disabled={saving || !text.trim()}
              className="mt-2 w-full rounded-lg bg-amber-500 text-white py-2.5 font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? "올리는 중..." : "질문 올리기"}
            </button>
            <p className="text-[11px] text-amber-800 mt-1.5 break-keep">
              올리면 팀장·그룹장 화면에 「답변 기다리는 질문」으로 뜹니다.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-3 min-h-0">
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">불러오는 중...</p>
          ) : threads.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center break-keep">
              아직 질문이 없습니다.
              {canAsk && " 모르는 것은 묻고 넘어가는 편이 낫습니다."}
            </p>
          ) : (
            <ul className="space-y-3">
              {threads.map(({ q, answers }) => (
                <li key={q.id} className="rounded-lg border border-gray-200 overflow-hidden">
                  <div
                    className={cn(
                      "px-3 py-2.5",
                      answers.length === 0 ? "bg-amber-50" : "bg-gray-50"
                    )}
                  >
                    <p className="text-xs text-gray-500">
                      {formatDateTime(q.created_at)} · {nameOf(q.author_id)} 님 질문
                      {answers.length === 0 && (
                        <span className="ml-1.5 text-amber-700 font-medium">· 답변 기다림</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap break-keep">
                      {q.content}
                    </p>
                  </div>

                  {answers.map((a) => (
                    <div key={a.id} className="px-3 py-2.5 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        {formatDateTime(a.created_at)} · {nameOf(a.author_id)} 님 답변
                      </p>
                      <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap break-keep">
                        {a.content}
                      </p>
                    </div>
                  ))}

                  {canAnswer && (
                    <div className="px-3 py-2 border-t border-gray-100">
                      {replyTo === q.id ? (
                        <>
                          <textarea
                            autoFocus
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={2}
                            placeholder="답변을 적으세요"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setReplyTo(null)}
                              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => write("답변", replyText, q.id)}
                              disabled={saving || !replyText.trim()}
                              className="flex-1 rounded-lg bg-blue-600 text-white py-2 text-sm font-medium disabled:opacity-50"
                            >
                              {saving ? "올리는 중..." : "답변 올리기"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setReplyTo(q.id);
                            setReplyText("");
                          }}
                          className="text-sm text-blue-700 hover:underline"
                        >
                          {answers.length === 0 ? "답변 쓰기" : "답변 더 쓰기"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-gray-400 pt-2 shrink-0 break-keep">
          질문과 답변은 이 업무에 남습니다. 나중에 왜 그렇게 하기로 했는지 찾을 수 있습니다.
        </p>
      </div>
    </div>
  );
}
