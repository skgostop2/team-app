"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startEnroll, finishEnroll, verifiedFactorId, type EnrollStart } from "@/lib/mfa";

/**
 * 첫 로그인 절차.
 *
 * 처음 비밀번호는 1234 로 모두 같으므로, 본인이 들어오자마자
 *   1) 휴대폰에 OTP 를 등록하고
 *   2) 비밀번호를 본인만 아는 것으로 바꾸게
 * 한다. 둘 다 끝나야 업무 화면으로 들어간다.
 *
 * 메뉴 바깥에 있는 화면이다 (아직 들어온 것이 아니므로).
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"loading" | "otp" | "password" | "done">("loading");
  const [requireMfa, setRequireMfa] = useState(true);
  const [enroll, setEnroll] = useState<EnrollStart | null>(null);
  const [code, setCode] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [name, setName] = useState("");

  /** 지금 뭐가 남았는지 보고 그 단계로 보낸다 */
  const decide = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const [{ data: profile }, { data: setting }] = await Promise.all([
      supabase.from("profiles").select("name, mfa_enabled, password_changed").eq("id", user.id).single(),
      supabase.from("team_settings").select("value").eq("key", "require_mfa").maybeSingle(),
    ]);

    const p = profile as { name: string; mfa_enabled: boolean; password_changed: boolean } | null;
    const need = (setting as { value: boolean } | null)?.value !== false;
    setRequireMfa(need);
    setName(p?.name ?? "");

    const hasFactor = !!(await verifiedFactorId());
    if (need && !hasFactor) {
      setStep("otp");
      return;
    }
    if (!p?.password_changed) {
      setStep("password");
      return;
    }
    setStep("done");
    router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    decide();
  }, [decide]);

  async function begin() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await startEnroll();
    setBusy(false);
    if (err || !data) {
      setError(err ?? "등록을 시작하지 못했습니다.");
      return;
    }
    setEnroll(data);
  }

  async function confirmOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    setError(null);
    const err = await finishEnroll(enroll.factorId, code);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setEnroll(null);
    setCode("");
    await decide();
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw1.length < 4) {
      setError("비밀번호는 4자 이상으로 해주세요.");
      return;
    }
    if (pw1 !== pw2) {
      setError("두 번 넣은 비밀번호가 서로 다릅니다.");
      return;
    }
    if (pw1 === "1234") {
      setError("처음 비밀번호(1234)는 쓸 수 없습니다. 다른 것으로 정해주세요.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: pw1 });
    if (err) {
      setBusy(false);
      setError(`바꾸지 못했습니다: ${err.message}`);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ password_changed: true }).eq("id", user.id);

    // 저장해 둔 옛 비밀번호가 남아 있으면 지운다
    try {
      localStorage.removeItem("login-password");
    } catch {
      // 못 지워도 진행한다
    }

    setBusy(false);
    router.replace("/dashboard");
    router.refresh();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (step === "loading" || step === "done")
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-gray-900 mb-1">
          {name ? `${name} 님, 처음 오셨네요` : "처음 로그인"}
        </h1>
        <p className="text-center text-sm text-gray-500 mb-6 break-keep">
          {step === "otp"
            ? "휴대폰 인증앱을 등록하면 비밀번호가 새어나가도 안전합니다"
            : "처음 비밀번호(1234)를 본인만 아는 것으로 바꿔주세요"}
        </p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* 1단계 — OTP 등록 */}
          {step === "otp" && (
            <>
              <p className="text-xs text-gray-400 mb-3">1단계 / 2단계</p>

              {!enroll ? (
                <>
                  <p className="text-sm text-gray-600 break-keep mb-4">
                    휴대폰에 <strong>Google Authenticator</strong>(또는 다른 인증앱)를 설치한 뒤
                    아래 버튼을 누르세요. QR 바코드가 뜹니다.
                  </p>
                  {error && <p className="text-sm text-red-600 mb-2 break-keep">{error}</p>}
                  <button
                    onClick={begin}
                    disabled={busy}
                    className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy ? "준비 중..." : "QR 바코드 띄우기"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700 mb-2">앱으로 아래 QR 을 찍으세요</p>
                  <div className="flex justify-center border border-gray-200 rounded-xl p-3 w-fit mx-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={enroll.qr} alt="2단계 인증 QR" width={190} height={190} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="block mx-auto text-xs text-gray-500 underline mt-2"
                  >
                    카메라가 안 되면 — 글자로 넣기
                  </button>
                  {showSecret && (
                    <p className="text-center text-xs font-mono break-all bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 mt-2">
                      {enroll.secret}
                    </p>
                  )}

                  <form onSubmit={confirmOtp} className="mt-5">
                    <p className="text-sm text-gray-700 mb-2">앱에 뜬 6자리를 넣으세요</p>
                    <input
                      autoFocus
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono"
                    />
                    {error && <p className="text-sm text-red-600 mt-2 break-keep">{error}</p>}
                    <button
                      type="submit"
                      disabled={busy || code.length < 6}
                      className="w-full mt-3 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? "확인 중..." : "확인하고 다음"}
                    </button>
                  </form>
                </>
              )}
            </>
          )}

          {/* 2단계 — 비밀번호 변경 */}
          {step === "password" && (
            <form onSubmit={changePw}>
              <p className="text-xs text-gray-400 mb-3">
                {requireMfa ? "2단계 / 2단계" : "비밀번호 변경"}
              </p>
              <input
                autoFocus
                type="password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="새 비밀번호 (4자 이상)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="새 비밀번호 다시"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mt-2"
              />
              {error && <p className="text-sm text-red-600 mt-2 break-keep">{error}</p>}
              <button
                type="submit"
                disabled={busy || !pw1 || !pw2}
                className="w-full mt-3 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "바꾸는 중..." : "바꾸고 시작하기"}
              </button>
              <p className="text-xs text-gray-400 mt-2 break-keep">
                잊어버리면 팀장이 다시 1234 로 돌려줄 수 있습니다.
              </p>
            </form>
          )}

          <button
            type="button"
            onClick={signOut}
            className="w-full mt-4 text-xs text-gray-500 underline"
          >
            나중에 하기 (로그아웃)
          </button>
        </div>
      </div>
    </div>
  );
}
