"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Group, Profile } from "@/lib/types";
import { formatDate, formatElapsed } from "@/lib/utils";

/**
 * 내 정보 — 이름을 누르면 오는 곳.
 * 내가 누구로 등록돼 있는지, 비밀번호 바꾸기, 2단계 인증으로 가는 길을 한 곳에 모았다.
 * (「2단계 인증」 메뉴는 그대로 있다. 여기서는 길만 열어 준다.)
 */
export default function MePage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setMe(p as Profile);
      if (p?.group_id) {
        const { data: g } = await supabase.from("groups").select("*").eq("id", p.group_id).single();
        setGroup((g as Group) ?? null);
      }
    })();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw1.length < 4) return setMsg({ ok: false, text: "비밀번호는 4자 이상으로 해 주세요." });
    if (pw1 === "1234") return setMsg({ ok: false, text: "처음 비밀번호(1234)는 다시 쓸 수 없습니다." });
    if (pw1 !== pw2) return setMsg({ ok: false, text: "두 번 입력한 비밀번호가 다릅니다." });
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) {
      setBusy(false);
      return setMsg({ ok: false, text: `바꾸지 못했습니다: ${error.message}` });
    }
    if (me) await supabase.from("profiles").update({ password_changed: true }).eq("id", me.id);
    try {
      localStorage.removeItem("login-password");
    } catch {
      // 못 지워도 진행한다
    }
    setBusy(false);
    setPw1("");
    setPw2("");
    setMsg({ ok: true, text: "비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요." });
  }

  if (!me) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0 text-sm">
      <span className="w-24 shrink-0 text-gray-500">{k}</span>
      <span className="text-gray-900 break-keep">{v}</span>
    </div>
  );

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">내 정보</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          이름·소속은 팀장이 고칩니다. 비밀번호와 2단계 인증은 본인이 합니다.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 px-4 py-2">
        <Row k="이름" v={<b>{me.name}{me.position ? ` ${me.position}` : ""}</b>} />
        <Row k="역할" v={me.role} />
        <Row k="소속" v={`${me.team_name ?? ""}${group ? ` · ${group.name}` : ""}` || "-"} />
        <Row k="메일" v={me.email} />
        <Row k="가입일" v={formatDate(me.created_at)} />
        <Row k="마지막 접속" v={formatElapsed(me.last_seen_at)} />
        <Row
          k="2단계 인증"
          v={
            <span className="flex items-center gap-2 flex-wrap">
              {me.mfa_enabled ? (
                <span className="text-emerald-700 font-medium">켜져 있음</span>
              ) : (
                <span className="text-amber-700 font-medium">꺼져 있음 — 비밀번호만으로 로그인됩니다</span>
              )}
              <Link href="/security" className="text-xs text-blue-600 underline underline-offset-2">
                설정으로
              </Link>
            </span>
          }
        />
      </section>

      <form onSubmit={changePassword} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-base font-bold text-gray-900">비밀번호 바꾸기</h2>
        {!me.password_changed && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 break-keep">
            아직 처음 비밀번호(1234)를 쓰고 계십니다. 지금 바꿔 두세요.
          </p>
        )}
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
        {msg && (
          <p className={"text-sm break-keep " + (msg.ok ? "text-emerald-700" : "text-red-600")}>
            {msg.text}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !pw1 || !pw2}
          className="w-full rounded-lg bg-gray-900 text-white py-2.5 font-medium hover:bg-black disabled:opacity-40"
        >
          {busy ? "바꾸는 중..." : "바꾸기"}
        </button>
      </form>
    </div>
  );
}
