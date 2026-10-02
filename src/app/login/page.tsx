"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** 아이디·비번 저장 — 이 기기(브라우저)에만 남는다 */
  const [saveId, setSaveId] = useState(false);
  const [savePw, setSavePw] = useState(false);

  // 저장해 둔 값이 있으면 채워 넣는다
  useEffect(() => {
    try {
      const id = localStorage.getItem("login-email");
      const pw = localStorage.getItem("login-password");
      if (id) {
        setEmail(id);
        setSaveId(true);
      }
      if (pw) {
        setPassword(pw);
        setSavePw(true);
      }
    } catch {
      // 저장소를 못 써도 로그인은 그대로 된다
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    // 체크한 것만 남기고, 푼 것은 지운다
    try {
      if (saveId) localStorage.setItem("login-email", email);
      else localStorage.removeItem("login-email");
      if (savePw) localStorage.setItem("login-password", password);
      else localStorage.removeItem("login-password");
    } catch {
      // 저장 실패해도 로그인은 끝난 상태다
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-1">팀원 업무관리 시스템</h1>
        <p className="text-center text-sm text-gray-500 mb-8">로그인</p>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={saveId}
                onChange={(e) => setSaveId(e.target.checked)}
                className="w-4 h-4"
              />
              아이디 저장
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={savePw}
                onChange={(e) => setSavePw(e.target.checked)}
                className="w-4 h-4"
              />
              비밀번호 저장
            </label>
          </div>
          {savePw && (
            <p className="text-xs text-amber-700 break-keep">
              이 컴퓨터를 쓰는 사람은 누구나 로그인됩니다. 공용 PC 에서는 체크하지 마세요.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="flex justify-between mt-4 text-sm text-gray-500 px-1">
          <Link href="/signup" className="hover:text-blue-600">
            팀원 회원가입
          </Link>
          <Link href="/register-lead" className="hover:text-blue-600">
            팀장 등록
          </Link>
        </div>
      </div>
    </div>
  );
}
