"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startEnroll, finishEnroll, disableMfa, verifiedFactorId, type EnrollStart } from "@/lib/mfa";
import {
  listDevices,
  forgetThisDevice,
  forgetAllDevices,
  type TrustedDevice,
} from "@/lib/trustedDevice";

/**
 * 2단계 인증 설정 — 구글 OTP 등록.
 *
 * 등록: QR 을 휴대폰 인증 앱으로 찍고, 앱에 뜬 6자리를 넣어 확인한다.
 * 확인까지 성공해야 켜진다 — 중간에 그만둬도 잠기지 않는다.
 */
export default function SecurityPage() {
  const [on, setOn] = useState<boolean | null>(null);
  const [enroll, setEnroll] = useState<EnrollStart | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);

  useEffect(() => {
    verifiedFactorId().then((id) => setOn(!!id));
    listDevices().then(setDevices);
  }, []);

  async function begin() {
    setBusy(true);
    setError(null);
    setDone(null);
    const { data, error: err } = await startEnroll();
    setBusy(false);
    if (err || !data) {
      setError(err ?? "등록을 시작하지 못했습니다.");
      return;
    }
    setEnroll(data);
  }

  async function confirm(e: React.FormEvent) {
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
    setOn(true);
    setDone("2단계 인증을 켰습니다. 다음 로그인부터 6자리 숫자를 묻습니다.");
  }

  async function turnOff() {
    if (!confirm2()) return;
    setBusy(true);
    setError(null);
    const err = await disableMfa();
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setOn(false);
    setDone("2단계 인증을 껐습니다.");
  }

  function confirm2() {
    return window.confirm("2단계 인증을 끄면 비밀번호만으로 로그인됩니다. 끄시겠습니까?");
  }

  if (on === null) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">2단계 인증 (구글 OTP)</h1>
        <p className="text-sm text-gray-500 mt-0.5 break-keep">
          로그인할 때 비밀번호에 더해 휴대폰 앱의 6자리 숫자를 넣습니다. 비밀번호가 새어나가도
          휴대폰이 없으면 들어올 수 없습니다.
        </p>
      </div>

      {done && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {done}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              지금 상태: {on ? "켜짐" : "꺼짐"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 break-keep">
              {on
                ? "로그아웃했거나 다른 기기에서 들어올 때 6자리를 묻습니다. 아래에서 기억 중인 기기는 정한 기간이 끝날 때까지 묻지 않습니다."
                : "지금은 비밀번호만으로 로그인됩니다."}
            </p>
          </div>
          {on ? (
            <button
              onClick={turnOff}
              disabled={busy}
              className="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              끄기
            </button>
          ) : (
            !enroll && (
              <button
                onClick={begin}
                disabled={busy}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "준비 중..." : "등록하기"}
              </button>
            )
          )}
        </div>

        {enroll && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-800 mb-2">1. 휴대폰 앱으로 아래 QR 을 찍으세요</p>
            <p className="text-xs text-gray-500 mb-3 break-keep">
              Google Authenticator, Microsoft Authenticator 등 아무 인증 앱이나 됩니다.
            </p>

            <div className="flex justify-center bg-white border border-gray-200 rounded-xl p-3 w-fit mx-auto">
              {/* Supabase 가 주는 QR 은 data: 주소라 그대로 쓴다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enroll.qr} alt="2단계 인증 QR" width={200} height={200} />
            </div>

            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="block mx-auto text-xs text-gray-500 underline mt-2"
            >
              카메라가 안 되면 — 글자로 넣기
            </button>
            {showSecret && (
              <p className="text-center text-sm font-mono break-all bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-2">
                {enroll.secret}
              </p>
            )}

            <form onSubmit={confirm} className="mt-5">
              <p className="text-sm font-medium text-gray-800 mb-2">
                2. 앱에 뜬 6자리를 넣으세요
              </p>
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono"
              />
              {error && <p className="text-sm text-red-600 mt-2 break-keep">{error}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setEnroll(null);
                    setCode("");
                    setError(null);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
                >
                  그만두기
                </button>
                <button
                  type="submit"
                  disabled={busy || code.length < 6}
                  className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? "확인 중..." : "확인하고 켜기"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 break-keep">
                확인에 성공해야 켜집니다. 여기서 그만두면 아무 것도 바뀌지 않습니다.
              </p>
            </form>
          </div>
        )}

        {!enroll && error && <p className="text-sm text-red-600 mt-3 break-keep">{error}</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <h2 className="text-base font-bold text-gray-900">30일 기억 중인 기기</h2>
            <p className="text-xs text-gray-500 mt-0.5 break-keep">
              여기 있는 기기에서는 로그인할 때 6자리를 묻지 않습니다. 30일이 지나면 저절로
              풀립니다.
            </p>
          </div>
          {devices.length > 0 && (
            <button
              onClick={async () => {
                if (!window.confirm("모든 기기에서 기억을 끊습니다. 다음 로그인부터 전부 6자리를 묻습니다.")) return;
                await forgetAllDevices();
                setDevices(await listDevices());
                setDone("모든 기기의 기억을 끊었습니다.");
              }}
              className="text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 shrink-0"
            >
              전부 끊기
            </button>
          )}
        </div>

        {devices.length === 0 ? (
          <p className="text-sm text-gray-400">기억 중인 기기가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {devices.map((d) => (
              <li key={d.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{d.label ?? "기기"}</p>
                  <p className="text-[11px] text-gray-400">
                    {d.created_at.slice(0, 10)} 등록 · {d.expires_at.slice(0, 10)} 까지
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={async () => {
            await forgetThisDevice();
            setDevices(await listDevices());
            setDone("이 기기의 기억을 끊었습니다. 다음 로그인부터 6자리를 묻습니다.");
          }}
          className="text-xs mt-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          이 기기만 끊기
        </button>
      </div>

      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4">
        <p className="text-sm font-medium text-gray-700 mb-1">휴대폰을 바꾸거나 잃어버렸다면</p>
        <p className="text-sm text-gray-500 break-keep">
          켜기 전에 끄는 것이 제일 쉽습니다. 이미 못 들어가는 상태라면 팀장에게 해제를 요청하세요.
          팀장은 팀원관리 화면에서 그 사람의 2단계 인증을 풀어줄 수 있습니다.
        </p>
      </div>
    </div>
  );
}
