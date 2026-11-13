"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trustCookieName } from "@/lib/trustedDevice";

/**
 * 발표용 번호 로그인 — 팀장님 발표(11/16~11/17) 동안만 보이는 임시 칸.
 *
 * 서버가 "지금 열려 있다"고 할 때만 나타난다. 기간이 지나면 저절로 사라진다.
 * 번호가 맞으면 [팀장 화면] = 이성구, [팀원 화면] = 테스트팀원(샘플) 으로 바로 들어간다.
 * 이 기기는 발표 기간 동안만 "기억한 기기"로 표시해 6자리 확인을 건너뛴다.
 */
export const PRESENT_LABEL = "발표용 번호";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function QuickLogin() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"lead" | "member" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.functions
      .invoke("quick-login", { body: { action: "status" } })
      .then(({ data }) => setOpen(!!(data as { open?: boolean } | null)?.open))
      .catch(() => setOpen(false));
  }, []);

  if (!open) return null;

  async function go(who: "lead" | "member") {
    setError(null);
    if (!/^\d{4}$/.test(pin)) return setError("번호 4자리를 넣어 주세요.");
    setBusy(who);
    const supabase = createClient();
    const { data, error: fe } = await supabase.functions.invoke("quick-login", {
      body: { action: "login", pin, who },
    });
    if (fe || !data?.token_hash) {
      // 함수가 401/429 를 돌려주면 본문의 안내 문구를 꺼내 보여준다
      let msg = "들어가지 못했습니다.";
      try {
        const ctx = (fe as { context?: Response } | null)?.context;
        const j = ctx ? await ctx.json() : null;
        if (j?.error) msg = j.error;
      } catch {
        // 문구를 못 읽어도 기본 안내는 뜬다
      }
      setError(msg);
      setBusy(null);
      setPin("");
      return;
    }

    const { token_hash, user_id, until } = data as { token_hash: string; user_id: string; until: string };
    const { error: ve } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
    if (ve) {
      setError(`들어가지 못했습니다: ${ve.message}`);
      setBusy(null);
      return;
    }

    // 발표 기간 동안만 이 기기를 기억한다 (6자리·첫 로그인 절차를 건너뛰려고)
    const token = crypto.randomUUID() + crypto.randomUUID();
    await supabase.from("trusted_devices").insert({
      user_id,
      token_hash: await sha256Hex(token),
      label: PRESENT_LABEL,
      expires_at: until,
    });
    const maxAge = Math.max(60, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
    document.cookie = `${trustCookieName(user_id)}=${token}; path=/; max-age=${maxAge}; samesite=lax${
      location.protocol === "https:" ? "; secure" : ""
    }`;

    window.location.href = who === "member" ? "/tasks" : "/dashboard";
  }

  return (
    <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-900">발표용 번호</p>
      <p className="text-xs text-amber-800 mt-0.5 break-keep">발표 기간에만 보이는 칸입니다.</p>
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="번호 4자리"
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-center text-lg tracking-[0.5em] text-gray-900"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => go("lead")}
          disabled={!!busy}
          className="rounded-lg bg-gray-900 text-white py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {busy === "lead" ? "들어가는 중..." : "팀장 화면"}
        </button>
        <button
          type="button"
          onClick={() => go("member")}
          disabled={!!busy}
          className="rounded-lg border-2 border-gray-900 bg-white text-gray-900 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {busy === "member" ? "들어가는 중..." : "팀원 화면 (샘플)"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 break-keep">{error}</p>}
    </div>
  );
}
