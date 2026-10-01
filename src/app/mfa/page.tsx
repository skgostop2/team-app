"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifyAtLogin } from "@/lib/mfa";

/**
 * 로그인 두 번째 단계 — 휴대폰 앱의 6자리 숫자.
 *
 * 비밀번호가 맞아도 여기를 통과해야 안으로 들어간다.
 * 이 화면은 앱 메뉴 바깥에 있다 (아직 들어온 것이 아니므로).
 */
export default function MfaPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setEmail(data.user.email ?? null);
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) {
      setError("6자리를 넣어주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await verifyAtLogin(code);
    setBusy(false);
    if (err) {
      setError(err);
      setCode("");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-gray-900 mb-1">2단계 인증</h1>
        <p className="text-center text-sm text-gray-500 mb-6">
          휴대폰 인증 앱에 떠 있는 6자리를 넣어주세요
        </p>

        <form
          onSubmit={submit}
          className="space-y-4 bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          {email && <p className="text-xs text-gray-400 text-center">{email}</p>}

          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono"
          />

          {error && <p className="text-sm text-red-600 break-keep">{error}</p>}

          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "확인 중..." : "확인"}
          </button>

          <p className="text-xs text-gray-400 break-keep text-center">
            숫자는 30초마다 바뀝니다. 바뀐 숫자를 넣으세요.
          </p>

          <button
            type="button"
            onClick={signOut}
            className="w-full text-xs text-gray-500 underline"
          >
            다른 계정으로 로그인
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-4 text-center break-keep">
          휴대폰을 바꿨거나 앱을 지웠다면 팀장에게 2단계 인증 해제를 요청하세요.
        </p>
      </div>
    </div>
  );
}
