"use client";

import { useMemo, useState } from "react";
import { callEdgeFunction } from "@/lib/edge";
import { cn } from "@/lib/utils";

/**
 * 팀원 여러 명 한꺼번에 등록.
 *
 * 인원이 스무 명이 넘는 팀에서 한 사람씩 넣는 것은 그 자체로 일이다.
 * 엑셀이나 메일 주소록에서 복사해 붙여넣으면 줄마다 한 사람으로 읽는다.
 *
 * 한 번에 다 보내지 않고 한 사람씩 차례로 보낸다 — 한 명이 실패해도
 * 나머지는 들어가고, 누가 왜 안 됐는지 줄로 남는다.
 */

type Row = {
  raw: string;
  name: string;
  email: string;
  problem?: string;
  result?: "ok" | "fail";
  message?: string;
};

/** "홍길동 hong@x.kr", "hong@x.kr 홍길동", 쉼표·탭 어느 쪽이든 읽는다 */
function parseLine(raw: string): Row {
  const line = raw.trim();
  const parts = line.split(/[\s,;\t]+/).filter(Boolean);
  const email = parts.find((p) => p.includes("@")) ?? "";
  const name = parts.filter((p) => p !== email).join(" ").trim();

  if (!email) return { raw, name: name || line, email: "", problem: "메일 주소가 없습니다" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { raw, name, email, problem: "메일 주소 모양이 아닙니다" };

  return { raw, name: name || email.split("@")[0], email };
}

export default function BulkMemberAdd({
  existingEmails,
  onDone,
}: {
  /** 이미 등록된 메일 (중복을 미리 걸러준다) */
  existingEmails: string[];
  onDone: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<Row[] | null>(null);

  const known = useMemo(
    () => new Set(existingEmails.map((e) => e.toLowerCase())),
    [existingEmails]
  );

  const rows = useMemo(() => {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseLine)
      .map((r) =>
        !r.problem && known.has(r.email.toLowerCase())
          ? { ...r, problem: "이미 등록된 사람입니다" }
          : r
      );
  }, [text, known]);

  const ready = rows.filter((r) => !r.problem);

  async function run() {
    setRunning(true);
    setAt(0);
    const out: Row[] = [];

    // 한 사람씩 차례로 — 한 명이 막혀도 나머지는 들어간다
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i];
      setAt(i + 1);
      const { error } = await callEdgeFunction(
        "pre-register-member",
        { name: r.name, email: r.email },
        { authed: true }
      );
      out.push(
        error ? { ...r, result: "fail", message: error } : { ...r, result: "ok" }
      );
    }

    setRunning(false);
    setDone(out);
    const ok = out.filter((r) => r.result === "ok").length;
    if (ok > 0) onDone(ok);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 mb-3"
      >
        여러 명 한꺼번에 등록 — 엑셀에서 복사해 붙여넣기
      </button>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900">여러 명 한꺼번에 등록</h3>
          <p className="text-xs text-gray-500 mt-0.5 break-keep">
            한 줄에 한 사람씩. <b>이름과 메일 주소</b>만 있으면 됩니다 — 순서는 상관없고,
            엑셀에서 두 칸을 복사해 그대로 붙여넣으셔도 됩니다.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setText("");
            setDone(null);
          }}
          className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
        >
          ×
        </button>
      </div>

      {done ? (
        <>
          <p className="text-sm font-medium text-gray-900">
            {done.filter((r) => r.result === "ok").length}명 등록했습니다
            {done.some((r) => r.result === "fail") &&
              ` · 안 된 사람 ${done.filter((r) => r.result === "fail").length}명`}
          </p>
          <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {done.map((r, i) => (
              <li key={i} className="px-3 py-2 text-sm flex items-start gap-2">
                <span className={r.result === "ok" ? "text-emerald-600" : "text-red-600"}>
                  {r.result === "ok" ? "✓" : "✕"}
                </span>
                <span className="flex-1 break-keep">
                  {r.name} <span className="text-gray-400">{r.email}</span>
                  {r.message && <span className="block text-xs text-red-600">{r.message}</span>}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setDone(null);
              setText("");
            }}
            className="w-full rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700"
          >
            더 등록하기
          </button>
        </>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"홍길동 hong@hdi21.co.kr\n김철수 kimcs@hdi21.co.kr\n이영희,yhlee@hdi21.co.kr"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-relaxed"
          />

          {rows.length > 0 && (
            <ul className="max-h-52 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {rows.map((r, i) => (
                <li
                  key={i}
                  className={cn(
                    "px-3 py-2 text-sm flex items-start gap-2",
                    r.problem && "bg-amber-50/60"
                  )}
                >
                  <span className="text-gray-400 w-5 shrink-0">{i + 1}</span>
                  <span className="flex-1 break-keep">
                    <b className="text-gray-900">{r.name || "(이름 없음)"}</b>{" "}
                    <span className="text-gray-500">{r.email}</span>
                    {r.problem && (
                      <span className="block text-xs text-amber-700">{r.problem}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={run}
            disabled={running || ready.length === 0}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {running
              ? `등록 중... ${at}/${ready.length}`
              : ready.length > 0
                ? `${ready.length}명 등록`
                : "붙여넣어 주세요"}
          </button>

          <p className="text-xs text-gray-400 break-keep">
            등록하면 각자 <b>회사 메일 + 비밀번호 1234</b> 로 들어옵니다. 처음 들어오면 OTP 등록과
            비밀번호 변경이 자동으로 뜹니다.
          </p>
        </>
      )}
    </section>
  );
}
