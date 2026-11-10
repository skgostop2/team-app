"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

export type Attachment = {
  id: string;
  task_id: string | null;
  notice_id: string | null;
  path: string;
  name: string;
  size: number | null;
  mime: string | null;
  uploaded_by: string;
  created_at: string;
};

const MAX_MB = 20;

function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 사진·파일 붙이기 — 업무 한 건 또는 공지·제안 한 장에.
 * 현장 사진, 견적서, 도면을 카톡으로 따로 보내지 않게 하려는 것이다.
 * 사진은 작게 보여주고, 누르면 새 창에서 원본. 파일은 이름을 누르면 내려받는다.
 */
export default function Attachments({
  taskId,
  noticeId,
  canUpload,
  names,
  meId,
  isLead,
  compact = false,
}: {
  taskId?: string;
  noticeId?: string;
  canUpload: boolean;
  names: Map<string, string>;
  meId?: string;
  isLead?: boolean;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    let q = supabase.from("attachments").select("*").order("created_at", { ascending: true });
    q = taskId ? q.eq("task_id", taskId) : q.eq("notice_id", noticeId ?? "");
    const { data } = await q;
    const list = (data ?? []) as Attachment[];
    setItems(list);
    if (list.length > 0) {
      // 비공개 저장소라 1시간짜리 주소를 받아 쓴다
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrls(list.map((a) => a.path), 3600);
      const m = new Map<string, string>();
      for (const s of signed ?? []) if (s.signedUrl && s.path) m.set(s.path, s.signedUrl);
      setUrls(m);
    }
  }, [taskId, noticeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !meId) return;
    setError(null);
    const supabase = createClient();
    for (const f of Array.from(files)) {
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`${f.name}: ${MAX_MB}MB 를 넘습니다`);
        continue;
      }
      setBusy(f.name);
      const safe = f.name.replace(/[^\w.\-가-힣 ]+/g, "_");
      const path = `${meId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, f, {
        contentType: f.type || undefined,
        upsert: false,
      });
      if (upErr) {
        setError(`${f.name}: ${upErr.message}`);
        continue;
      }
      const { error: rowErr } = await supabase.from("attachments").insert({
        task_id: taskId ?? null,
        notice_id: noticeId ?? null,
        path,
        name: f.name,
        size: f.size,
        mime: f.type || null,
        uploaded_by: meId,
      });
      if (rowErr) {
        // 표에 못 넣으면 저장소 파일도 치운다 (고아 파일 방지)
        await supabase.storage.from("attachments").remove([path]);
        setError(`${f.name}: ${rowErr.message}`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    load();
  }

  async function remove(a: Attachment) {
    if (!window.confirm(`「${a.name}」 을(를) 지울까요?`)) return;
    const supabase = createClient();
    await supabase.from("attachments").delete().eq("id", a.id);
    await supabase.storage.from("attachments").remove([a.path]);
    load();
  }

  const isImg = (a: Attachment) => (a.mime ?? "").startsWith("image/");

  if (items.length === 0 && !canUpload) return null;

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500">📎 첨부 {items.length > 0 && items.length}</span>
        {canUpload && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.hwp,.txt,.csv,.zip,.dwg"
              onChange={(e) => upload(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => input.current?.click()}
              disabled={!!busy}
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? `올리는 중… ${busy}` : "+ 사진·파일"}
            </button>
            {!compact && (
              <span className="text-[11px] text-gray-400">폰에서는 카메라로 바로 찍을 수 있습니다 · {MAX_MB}MB까지</span>
            )}
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1 break-keep">{error}</p>}

      {items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((a) => {
            const url = urls.get(a.path);
            return (
              <li key={a.id} className="relative group">
                {isImg(a) && url ? (
                  <a href={url} target="_blank" rel="noreferrer" title={`${a.name} · ${names.get(a.uploaded_by) ?? ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={a.name}
                      className={(compact ? "h-16 w-16" : "h-24 w-24") + " object-cover rounded-lg border border-gray-200 bg-gray-100"}
                    />
                  </a>
                ) : (
                  <a
                    href={url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    download={a.name}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 hover:bg-gray-50 max-w-[220px]"
                    title={`${names.get(a.uploaded_by) ?? ""} · ${formatDateTime(a.created_at)}`}
                  >
                    <span>📄</span>
                    <span className="truncate">{a.name}</span>
                    <span className="text-gray-400 shrink-0">{fmtSize(a.size)}</span>
                  </a>
                )}
                {(a.uploaded_by === meId || isLead) && (
                  <button
                    onClick={() => remove(a)}
                    title="지우기"
                    className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-gray-900 text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
