"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import { formatElapsed, formatDate, isLongInactive } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export default function TeamPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<Profile | null>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: all }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    ]);

    setMe(profile as Profile);
    setProfiles((all ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  if (me?.role !== "팀장") {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-gray-500">이 화면은 팀장만 접근할 수 있습니다.</p>
      </div>
    );
  }

  async function approve(p: Profile, teamName: string) {
    setBusyId(p.id);
    const supabase = createClient();
    await supabase.from("profiles").update({ status: "승인", team_name: teamName || null }).eq("id", p.id);
    await load();
    setBusyId(null);
  }

  async function deactivate(p: Profile) {
    if (!confirm(`${p.name}님 계정을 비활성화하시겠습니까?`)) return;
    setBusyId(p.id);
    const supabase = createClient();
    await supabase.from("profiles").update({ status: "비활성" }).eq("id", p.id);
    await load();
    setBusyId(null);
  }

  async function reactivate(p: Profile) {
    setBusyId(p.id);
    const supabase = createClient();
    await supabase.from("profiles").update({ status: "승인" }).eq("id", p.id);
    await load();
    setBusyId(null);
  }

  const pending = profiles.filter((p) => p.status === "대기");
  const active = profiles.filter((p) => p.status === "승인");
  const inactive = profiles.filter((p) => p.status === "비활성");

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-xl font-bold text-gray-900">팀원관리</h1>

      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-600 mb-3">승인 대기 ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map((p) => (
              <PendingRow key={p.id} profile={p} busy={busyId === p.id} onApprove={approve} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">팀원 목록 ({active.length})</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {active.map((p) => (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium text-gray-900">
                  {p.name} <span className="text-xs text-gray-400 font-normal">{p.role}{p.team_name ? ` · ${p.team_name}` : ""}</span>
                </p>
                <p className="text-xs text-gray-400">
                  가입일 {formatDate(p.created_at)} · 마지막 접속 {formatElapsed(p.last_seen_at)}
                  {isLongInactive(p.last_seen_at) && <span className="text-red-500 font-medium"> · 장기 미접속</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPwTarget(p)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  비밀번호 변경
                </button>
                {p.role !== "팀장" && (
                  <button
                    onClick={() => deactivate(p)}
                    disabled={busyId === p.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    비활성화
                  </button>
                )}
              </div>
            </div>
          ))}
          {active.length === 0 && <div className="px-4 py-8 text-center text-gray-400 text-sm">팀원이 없습니다.</div>}
        </div>
      </section>

      {inactive.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 mb-3">비활성 계정 ({inactive.length})</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {inactive.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <p className="text-gray-500">{p.name}</p>
                <button
                  onClick={() => reactivate(p)}
                  disabled={busyId === p.id}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  다시 활성화
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {pwTarget && (
        <ChangePasswordModal profile={pwTarget} onClose={() => setPwTarget(null)} />
      )}
    </div>
  );
}

function PendingRow({
  profile,
  busy,
  onApprove,
}: {
  profile: Profile;
  busy: boolean;
  onApprove: (p: Profile, teamName: string) => void;
}) {
  const [teamName, setTeamName] = useState("");
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="font-medium text-gray-900">{profile.name}</p>
        <p className="text-xs text-gray-400">{profile.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="소속(선택)"
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-28"
        />
        <button
          onClick={() => onApprove(profile, teamName)}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          승인
        </button>
      </div>
    </div>
  );
}

function ChangePasswordModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    setSaving(true);
    const { error } = await callEdgeFunction(
      "admin-change-password",
      { target_user_id: profile.id, new_password: password },
      { authed: true }
    );
    if (error) {
      setError(error);
      setSaving(false);
      return;
    }
    setSuccess(true);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{profile.name}님 비밀번호 변경</h2>
        <p className="text-xs text-gray-400 mb-4">팀장 권한으로만 변경할 수 있습니다.</p>
        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-600">비밀번호가 변경되었습니다.</p>
            <button onClick={onClose} className="w-full rounded-lg bg-gray-900 text-white py-2.5 font-medium">
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="새 비밀번호 (6자 이상)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "변경 중..." : "변경"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
