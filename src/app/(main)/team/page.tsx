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
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  async function saveTeamName(p: Profile, teamName: string) {
    setBusyId(p.id);
    const supabase = createClient();
    await supabase.from("profiles").update({ team_name: teamName || null }).eq("id", p.id);
    await load();
    setBusyId(null);
  }

  const members = profiles.filter((p) => p.role !== "팀장" && p.status !== "삭제");
  const deleted = profiles.filter((p) => p.status === "삭제");
  const lead = profiles.find((p) => p.role === "팀장");

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">팀원관리</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          가입한 팀원은 바로 이용할 수 있습니다. 우리 팀원이 아닌 계정은 삭제하세요.
        </p>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {lead && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">팀장</h2>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="font-medium text-gray-900">{lead.name}</p>
              <p className="text-xs text-gray-400">{lead.email}</p>
            </div>
            <button
              onClick={() => setPwTarget(lead)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              비밀번호 변경
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">팀원 목록 ({members.length})</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {members.map((p) => (
            <MemberRow
              key={p.id}
              profile={p}
              busy={busyId === p.id}
              onSaveTeamName={saveTeamName}
              onChangePassword={() => setPwTarget(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
          {members.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              아직 가입한 팀원이 없습니다.
            </div>
          )}
        </div>
      </section>

      {deleted.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 mb-3">삭제된 계정 ({deleted.length})</h2>
          <p className="text-xs text-gray-400 mb-2">
            로그인은 불가능하지만, 이 사람이 담당했던 업무와 변경 이력은 그대로 보존되어 있습니다.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {deleted.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <p className="text-gray-500">
                  {p.name} <span className="text-xs text-gray-400">삭제됨</span>
                </p>
                <p className="text-xs text-gray-400">{p.email}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {pwTarget && <ChangePasswordModal profile={pwTarget} onClose={() => setPwTarget(null)} />}

      {deleteTarget && (
        <DeleteMemberModal
          profile={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async (name, keptTasks) => {
            setDeleteTarget(null);
            setMessage(
              keptTasks > 0
                ? `${name}님 계정을 삭제했습니다. 담당했던 업무 ${keptTasks}건과 변경 이력은 그대로 보존됩니다.`
                : `${name}님 계정을 삭제했습니다.`
            );
            await load();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  profile,
  busy,
  onSaveTeamName,
  onChangePassword,
  onDelete,
}: {
  profile: Profile;
  busy: boolean;
  onSaveTeamName: (p: Profile, teamName: string) => void;
  onChangePassword: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [teamName, setTeamName] = useState(profile.team_name ?? "");

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">
          {profile.name}
          {profile.team_name && (
            <span className="text-xs text-gray-400 font-normal"> · {profile.team_name}</span>
          )}
        </p>
        <p className="text-xs text-gray-400 truncate">{profile.email}</p>
        <p className="text-xs text-gray-400">
          가입일 {formatDate(profile.created_at)} · 마지막 접속 {formatElapsed(profile.last_seen_at)}
          {isLongInactive(profile.last_seen_at) && (
            <span className="text-red-500 font-medium"> · 장기 미접속</span>
          )}
        </p>
        {editing && (
          <div className="flex items-center gap-2 mt-2">
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="소속"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-32"
            />
            <button
              onClick={() => {
                onSaveTeamName(profile, teamName);
                setEditing(false);
              }}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white disabled:opacity-50"
            >
              저장
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            소속 지정
          </button>
        )}
        <button
          onClick={onChangePassword}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          비밀번호 변경
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function DeleteMemberModal({
  profile,
  onClose,
  onDeleted,
}: {
  profile: Profile;
  onClose: () => void;
  onDeleted: (name: string, keptTasks: number) => void;
}) {
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", profile.id)
      .then(({ count }) => setTaskCount(count ?? 0));
  }, [profile.id]);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    const { data, error } = await callEdgeFunction<{
      success: boolean;
      name: string;
      kept_tasks: number;
    }>("delete-member", { target_user_id: profile.id }, { authed: true });

    if (error) {
      setError(error);
      setDeleting(false);
      return;
    }
    onDeleted(data?.name ?? profile.name, data?.kept_tasks ?? 0);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{profile.name}님 삭제</h2>
        <p className="text-sm text-gray-500 mb-3">
          로그인 계정이 삭제되어 더 이상 접속할 수 없습니다. 되돌릴 수 없습니다.
        </p>

        {taskCount === null ? (
          <p className="text-xs text-gray-400 mb-4">담당 업무 확인 중...</p>
        ) : taskCount > 0 ? (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 mb-4">
            <p className="text-sm text-blue-800">
              담당했던 업무 {taskCount}건과 그동안의 변경 이력은 삭제되지 않고 그대로 보존됩니다.
              업무 화면에는 담당자 이름이 계속 표시됩니다.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-4">담당 중인 업무는 없습니다.</p>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || taskCount === null}
            className="flex-1 rounded-lg bg-red-600 text-white py-2.5 font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
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
