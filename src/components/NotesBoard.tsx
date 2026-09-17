"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonalNote } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import {
  createNote,
  fetchNotes,
  purgeNote,
  restoreNote,
  saveNote,
  trashNote,
} from "@/lib/notes";

/**
 * 개인 메모장 본체.
 *
 * 오른쪽 패널, 별도 팝업창, 전체 화면 어디에 놓아도 같은 화면이 나오도록
 * 레이아웃에 의존하지 않는 하나의 컴포넌트로 만들었다.
 *
 * 본인 메모만 다룬다 (DB 권한으로 잠겨 있음).
 */
export default function NotesBoard({ compact = false }: { compact?: boolean }) {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [trash, setTrash] = useState<PersonalNote[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [query, setQuery] = useState("");

  // 저장 상태 — 자동저장이라 사용자에게 지금 상태를 알려줘야 한다
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (keepActive?: string | null) => {
    const all = await fetchNotes(true);
    const live = all.filter((n) => !n.deleted_at);
    const dead = all.filter((n) => n.deleted_at);
    setNotes(live);
    setTrash(dead);
    setActiveId((prev) => {
      const want = keepActive ?? prev;
      if (want && live.some((n) => n.id === want)) return want;
      return live[0]?.id ?? null;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = notes.find((n) => n.id === activeId) ?? null;

  // 자동저장 — 타이핑이 멈추고 0.8초 뒤에 저장한다
  function edit(patch: Partial<Pick<PersonalNote, "title" | "content">>) {
    if (!active) return;
    const id = active.id;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
    setSaveFailed(false);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await saveNote(id, patch);
      if (ok) {
        setDirty(false);
        setSavedAt(new Date());
      } else {
        // 저장이 안 됐으면 쓰던 내용을 화면에 그대로 두고 실패만 알린다
        setSaveFailed(true);
      }
    }, 800);
  }

  // 창을 닫으려 할 때 아직 저장 안 된 게 있으면 경고
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function addNote() {
    const n = await createNote({ title: "", content: "" });
    if (!n) return;
    await load(n.id);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  async function togglePin(n: PersonalNote) {
    await saveNote(n.id, { pinned: !n.pinned });
    await load(n.id);
  }

  async function toTrash(n: PersonalNote) {
    await trashNote(n.id);
    await load(null);
  }

  const filtered = query.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(query.toLowerCase()) ||
          n.content.toLowerCase().includes(query.toLowerCase())
      )
    : notes;

  if (loading) {
    return <p className="p-4 text-sm text-gray-400">불러오는 중...</p>;
  }

  return (
    <div className={cn("flex flex-col h-full min-h-0", compact ? "" : "md:flex-row")}>
      {/* 목록 */}
      <div
        className={cn(
          "flex flex-col min-h-0 border-gray-200",
          compact ? "border-b max-h-52" : "md:w-72 md:shrink-0 md:border-r border-b md:border-b-0"
        )}
      >
        <div className="p-2 flex gap-2 border-b border-gray-100">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메모 찾기"
            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <button
            onClick={addNote}
            className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            + 새 메모
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50",
                n.id === activeId && "bg-blue-50 hover:bg-blue-50"
              )}
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {n.pinned && <span className="text-amber-500 mr-1">★</span>}
                {n.title.trim() || "(제목 없음)"}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {n.content.trim().split("\n")[0] || "내용 없음"}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(n.updated_at)}</p>
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-gray-400">
              {query ? "찾는 메모가 없습니다." : "메모가 없습니다. + 새 메모를 눌러 시작하세요."}
            </p>
          )}
        </div>

        {trash.length > 0 && (
          <button
            onClick={() => setShowTrash((v) => !v)}
            className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100 text-left hover:bg-gray-50"
          >
            휴지통 {trash.length}건 {showTrash ? "닫기" : "보기"}
          </button>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 flex flex-col min-h-0">
        {showTrash ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">휴지통</p>
              <button
                onClick={() => setShowTrash(false)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                돌아가기
              </button>
            </div>
            <p className="text-xs text-gray-400">
              지운 메모도 내용은 남아 있습니다. 되살리거나 완전히 지울 수 있습니다.
            </p>
            {trash.map((n) => (
              <div key={n.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-700">
                  {n.title.trim() || "(제목 없음)"}
                </p>
                <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3 mt-0.5">
                  {n.content}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      await restoreNote(n.id);
                      await load(n.id);
                      setShowTrash(false);
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    되살리기
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("이 메모를 완전히 지웁니다. 되돌릴 수 없습니다.")) return;
                      await purgeNote(n.id);
                      await load(null);
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    완전히 지우기
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : active ? (
          <>
            <div className="p-2 flex items-center gap-2 border-b border-gray-100 flex-wrap">
              <input
                ref={titleRef}
                value={active.title}
                onChange={(e) => edit({ title: e.target.value })}
                placeholder="제목"
                className="flex-1 min-w-[120px] rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium"
              />
              <button
                onClick={() => togglePin(active)}
                title="위로 고정"
                className={cn(
                  "text-sm px-2.5 py-1.5 rounded-lg border",
                  active.pinned
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-gray-300 text-gray-500 hover:bg-gray-50"
                )}
              >
                ★
              </button>
              <button
                onClick={() => toTrash(active)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                지우기
              </button>
            </div>

            <textarea
              value={active.content}
              onChange={(e) => edit({ content: e.target.value })}
              placeholder="여기에 적으세요. 자동으로 저장됩니다."
              className="flex-1 min-h-[160px] w-full p-3 text-sm leading-relaxed resize-none focus:outline-none"
            />

            <div className="px-3 py-2 border-t border-gray-100 text-xs">
              {saveFailed ? (
                <span className="text-red-600 font-medium">
                  저장 실패 — 인터넷 연결을 확인하세요. 쓰신 내용은 화면에 그대로 있습니다.
                </span>
              ) : dirty ? (
                <span className="text-amber-600">저장 중...</span>
              ) : savedAt ? (
                <span className="text-gray-400">
                  저장됨 {savedAt.getHours().toString().padStart(2, "0")}:
                  {savedAt.getMinutes().toString().padStart(2, "0")}
                </span>
              ) : (
                <span className="text-gray-400">나만 볼 수 있는 메모입니다.</span>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-2">메모가 없습니다.</p>
              <button
                onClick={addNote}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                + 새 메모
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
