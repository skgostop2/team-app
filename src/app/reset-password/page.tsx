"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 비밀번호 잊었을 때.
 *
 * 1단계: 회사 메일을 넣으면 재설정 링크를 보낸다 (팀장 손을 거치지 않는다).
 * 2단계: 메일의 링크로 들어오면 이 화면이 다시 열리고, 그때는 새 비밀번호 칸이 보인다.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"ask" | "sent" | "set">("ask");
  const [email, setEmail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 메일 링크로 들어온 경우 — 브라우저가 링크의 코드를 세션으로 바꾸면 "비밀번호 바꾸기" 단계로
  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setStage("set");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStage("set");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) {
      setError(`보내지 못했습니다: ${err.message}`);
      return;
    }
    setStage("sent");
  }

  async function setPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw1.length < 4) return setError("비밀번호는 4자 이상으로 해 주세요.");
    if (pw1 === "1234") return setError("처음 비밀번호(1234)는 다시 쓸 수 없습니다.");
    if (pw1 !== pw2) return setError("두 번 입력한 비밀번호가 다릅니다.");
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: pw1 });
    if (err) {
      setBusy(false);
      return setError(`바꾸지 못했습니다: ${err.message}`);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ password_changed: true }).eq("id", user.id);
    try {
      localStorage.removeItem("login-password");
    } catch {
      // 못 지워도 진행한다
    }
    setBusy(false);
    router.replace("/tasks");
    router.refresh();
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-1">비밀번호 다시 정하기</h1>
        <p className="text-center text-sm text-gray-500 mb-8">
          {stage === "set" ? "새 비밀번호를 넣어 주세요" : "회사 메일로 링크를 보내 드립니다"}
        </p>

        {stage === "ask" && (
          <form onSubmit={sendLink} className="space-y-4 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">회사 메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이름@hdi21.co.kr"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
            {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "보내는 중..." : "재설정 링크 보내기"}
            </button>
          </form>
        )}

        {stage === "sent" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-2 text-sm text-gray-700 break-keep">
            <p className="font-medium text-gray-900">메일을 보냈습니다.</p>
            <p>
              <b>{email}</b> 받은편지함을 열어 「비밀번호 재설정」 링크를 누르세요. 몇 분 안에 안 오면
              스팸함을 보시고, 그래도 없으면 팀장에게 초기화를 부탁하세요.
            </p>
            <p className="text-xs text-gray-400">링크는 한 시간 동안만 됩니다.</p>
          </div>
        )}

        {stage === "set" && (
          <form onSubmit={setPassword} className="space-y-4 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <input
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="새 비밀번호"
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="새 비밀번호 한 번 더"
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
            {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
            <button
              type="submit"
              disabled={busy || !pw1 || !pw2}
              className="w-full rounded-lg bg-gray-900 text-white py-2.5 font-medium hover:bg-black disabled:opacity-40"
            >
              {busy ? "바꾸는 중..." : "바꾸고 들어가기"}
            </button>
          </form>
        )}

        <p className="text-center mt-4 text-sm">
          <Link href="/login" className="text-gray-500 hover:text-blue-600">
            로그인으로
          </Link>
        </p>
      </div>
    </div>
  );
}
