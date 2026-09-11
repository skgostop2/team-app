"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/edge";

export default function RegisterLeadPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [leadExists, setLeadExists] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("lead_exists").then(({ data }) => {
      setLeadExists(Boolean(data));
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);

    const { error: fnError } = await callEdgeFunction("register-lead", {
      email,
      password,
      name,
    });

    if (fnError) {
      setError(fnError);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      router.push("/login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">확인 중...</p>
      </div>
    );
  }

  if (leadExists) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-lg font-bold text-gray-900 mb-2">이미 팀장이 등록되어 있습니다</h1>
          <p className="text-sm text-gray-500 mb-6">
            팀장 계정은 1개만 등록할 수 있습니다. 계정 관련 문의는 팀장에게 해주세요.
          </p>
          <Link href="/login" className="text-blue-600 hover:underline text-sm">
            로그인 화면으로 이동
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-1">팀장 등록</h1>
        <p className="text-center text-sm text-gray-500 mb-8">
          최초 1회만 등록 가능하며, 이후에는 이 계정이 팀장 권한을 가집니다.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일 (로그인 ID)</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              placeholder="6자 이상"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
            <input
              type="password"
              required
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 text-white py-2.5 font-medium hover:bg-black disabled:opacity-50 transition"
          >
            {loading ? "등록 중..." : "팀장으로 등록"}
          </button>
        </form>

        <div className="text-center mt-4 text-sm text-gray-500">
          <Link href="/login" className="text-blue-600 hover:underline">
            로그인 화면으로
          </Link>
        </div>
      </div>
    </div>
  );
}
