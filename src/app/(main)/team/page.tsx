"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import { formatElapsed, formatDate, isLongInactive } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { isManager, isTeamLead, byDisplayOrder } from "@/lib/roles";

export default function TeamPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDirectorForm, setShowDirectorForm] = useState(false);
  const [showPreForm, setShowPreForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: all }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("profiles").select("*").order("sort_order"),
    ]);

    setMe(profile as Profile);
    setProfiles((all ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  if (!isManager(me)) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-gray-500">이 화면은 팀장·실장만 접근할 수 있습니다.</p>
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

  const members = profiles
    .filter((p) => p.role === "팀원" && p.status === "승인")
    .sort(byDisplayOrder);
  const pending = profiles
    .filter((p) => p.role === "팀원" && p.status === "가입대기")
    .sort(byDisplayOrder);
  const directors = profiles.filter((p) => p.role === "실장" && p.status !== "삭제");
  const deleted = profiles.filter((p) => p.status === "삭제");
  const lead = profiles.find((p) => p.role === "팀장" && p.status !== "삭제");
  const canRegisterDirector = isTeamLead(me);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">팀원관리</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          가입한 팀원은 바로 이용할 수 있습니다. 아직 가입 전인 사람도 미리 등록해 두면 업무를
          배정할 수 있습니다. 우리 팀원이 아닌 계정은 삭제하세요.
        </p>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">실장 ({directors.length})</h2>
          {canRegisterDirector && (
            <button
              onClick={() => setShowDirectorForm((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-black"
            >
              {showDirectorForm ? "취소" : "+ 실장 등록"}
            </button>
          )}
        </div>

        {showDirectorForm && (
          <RegisterDirectorForm
            onDone={async (name) => {
              setShowDirectorForm(false);
              setMessage(`${name}님을 실장으로 등록했습니다.`);
              await load();
            }}
          />
        )}

        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {directors.map((d) => (
            <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-400 truncate">{d.email}</p>
                <p className="text-xs text-gray-400">
                  마지막 접속 {formatElapsed(d.last_seen_at)}
                </p>
              </div>
              {canRegisterDirector && d.id !== me?.id && (
                <button
                  onClick={() => setDeleteTarget(d)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          {directors.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              등록된 실장이 없습니다.
              {canRegisterDirector && " 위 버튼으로 등록할 수 있습니다."}
            </div>
          )}
        </div>
      </section>

      {lead && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">팀장</h2>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="font-medium text-gray-900">{lead.name}</p>
              <p className="text-xs text-gray-400">{lead.email}</p>
            </div>
            {lead.id === me?.id && (
              <button
                onClick={() => setPwTarget(lead)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                비밀번호 변경
              </button>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            가입 전 미리 등록 ({pending.length})
          </h2>
          <button
            onClick={() => setShowPreForm((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-black"
          >
            {showPreForm ? "취소" : "+ 팀원 미리 등록"}
          </button>
        </div>

        {showPreForm && (
          <PreRegisterForm
            onDone={async (name) => {
              setShowPreForm(false);
              setMessage(
                `${name}님을 미리 등록했습니다. 지금부터 업무를 배정할 수 있고, 본인이 같은 이메일로 회원가입하면 그대로 연결됩니다.`
              );
              await load();
            }}
          />
        )}

        {pending.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {pending.map((p) => (
              <div
                key={p.id}
                className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {p.name}
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-normal align-middle">
                      가입대기
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 truncate">{p.email}</p>
                  <p className="text-xs text-gray-400">
                    등록일 {formatDate(p.created_at)} · 이 이메일로 회원가입하면 자동 연결됩니다
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setEditTarget(p)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  정보 수정
                </button>
                <button
                  onClick={() => setDeleteTarget(p)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !showPreForm && (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center text-gray-400 text-sm">
              아직 가입 전인 사람을 미리 등록해 두면, 가입 전에도 업무를 배정해 둘 수 있습니다.
            </div>
          )
        )}
      </section>

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

      {editTarget && (
        <EditPreRegisteredModal
          profile={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async (name) => {
            setEditTarget(null);
            setMessage(`${name}님 정보를 수정했습니다.`);
            await load();
          }}
        />
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

/** 가입 전 인원의 이름·이메일·직급을 고친다. 배정해 둔 업무는 그대로 유지된다. */
function EditPreRegisteredModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [position, setPosition] = useState(profile.position ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("이름과 이메일을 입력해주세요.");
      return;
    }
    setSaving(true);
    const { error: fnError } = await callEdgeFunction(
      "update-pre-registered",
      {
        target_user_id: profile.id,
        name: name.trim(),
        email: email.trim(),
        position: position.trim(),
      },
      { authed: true }
    );
    if (fnError) {
      setError(fnError);
      setSaving(false);
      return;
    }
    onSaved(name.trim());
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">가입 전 인원 정보 수정</h2>
        <p className="text-xs text-gray-500 mb-4">
          이미 배정해 둔 업무는 그대로 유지됩니다. 본인이 아래 이메일로 회원가입하면 연결됩니다.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">직급</label>
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="예: 책임, 매니저"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
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
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PreRegisterForm({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("이름과 이메일을 모두 입력해주세요.");
      return;
    }

    setSaving(true);
    const { error: fnError } = await callEdgeFunction(
      "pre-register-member",
      { name: name.trim(), email: email.trim() },
      { authed: true }
    );

    if (fnError) {
      setError(fnError);
      setSaving(false);
      return;
    }

    onDone(name.trim());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 mb-3"
    >
      <p className="text-xs text-gray-500">
        아직 가입하지 않은 사람을 이름과 이메일로 미리 등록합니다. 비밀번호는 정하지 않습니다 —
        본인이 나중에 <span className="font-medium text-gray-700">같은 이메일</span>로 회원가입할 때
        직접 정하고, 그 순간 미리 배정해 둔 업무가 그대로 연결됩니다.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 (가입할 때 쓸 주소)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
      >
        {saving ? "등록 중..." : "미리 등록"}
      </button>
    </form>
  );
}

function RegisterDirectorForm({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("이름과 이메일을 입력해주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setSaving(true);
    const { error: fnError } = await callEdgeFunction(
      "register-director",
      { name: name.trim(), email: email.trim(), password },
      { authed: true }
    );

    if (fnError) {
      setError(fnError);
      setSaving(false);
      return;
    }

    onDone(name.trim());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 mb-3"
    >
      <p className="text-xs text-gray-500">
        실장 계정을 만듭니다. 여기서 정한 비밀번호를 실장님께 전달하시고, 접속 후 본인이 직접
        바꾸실 수 있습니다.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (6자 이상)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
      >
        {saving ? "등록 중..." : "실장으로 등록"}
      </button>
    </form>
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
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          {profile.name}님 {profile.status === "가입대기" ? "사전등록 취소" : "삭제"}
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          {profile.status === "가입대기"
            ? "미리 등록해 둔 자리를 없앱니다. 이후 같은 이메일로 회원가입해도 연결되지 않습니다."
            : "로그인 계정이 삭제되어 더 이상 접속할 수 없습니다."}{" "}
          되돌릴 수 없습니다.
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
