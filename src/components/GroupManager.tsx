"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Group, Profile, Role } from "@/lib/types";
import { byDisplayOrder, isAssignable } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * 그룹 관리 — 팀장 아래 그룹장, 그 아래 팀원.
 *
 * 그룹 이름은 직접 적는다 (1그룹, 소재그룹, 성형그룹 …).
 * 사람을 그룹에 넣고 역할을 그룹장으로 바꾸면 그 순간부터 권한이 생긴다.
 * 따로 켜는 스위치는 없다.
 *
 * 한 그룹에 그룹장은 1명이 원칙이다. 둘 이상이면 서로 같은 사람에게
 * 다른 지시를 내리게 되므로, 그렇게 되면 눈에 띄게 알려준다.
 */
export default function GroupManager({
  groups,
  profiles,
  onChanged,
}: {
  groups: Group[];
  profiles: Profile[];
  onChanged: () => Promise<void> | void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const people = profiles.filter((p) => isAssignable(p) && p.role !== "실장" && p.role !== "팀장");
  const unassigned = people.filter((p) => !p.group_id).sort(byDisplayOrder);

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    await onChanged();
    return true;
  }

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const supabase = createClient();
    const ok = await run(async () => {
      const { error } = await supabase
        .from("groups")
        .insert({ name, sort_order: (groups.length + 1) * 10 });
      return { error };
    });
    if (ok) setNewName("");
  }

  async function rename(id: string) {
    const name = renameText.trim();
    if (!name) return;
    const supabase = createClient();
    const ok = await run(async () => {
      const { error } = await supabase.from("groups").update({ name }).eq("id", id);
      return { error };
    });
    if (ok) setRenaming(null);
  }

  async function removeGroup(g: Group) {
    const inGroup = people.filter((p) => p.group_id === g.id);
    if (inGroup.length > 0) {
      setError(
        `${g.name} 에 아직 ${inGroup.length}명이 있습니다. 다른 그룹으로 옮기거나 빼낸 뒤에 지워주세요.`
      );
      return;
    }
    const supabase = createClient();
    await run(async () => {
      const { error } = await supabase.from("groups").delete().eq("id", g.id);
      return { error };
    });
  }

  /** 소속 그룹 바꾸기 */
  async function moveTo(p: Profile, groupId: string | null) {
    const supabase = createClient();
    const patch: Record<string, unknown> = { group_id: groupId };
    // 그룹에서 빼면 그룹장 자리도 같이 내려놓는다 (그룹 없는 그룹장은 아무도 관리하지 못한다)
    if (!groupId && p.role === "그룹장") patch.role = "팀원";
    await run(async () => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", p.id);
      return { error };
    });
  }

  /** 역할 바꾸기 (그룹장 ↔ 팀원) */
  async function setRole(p: Profile, role: Role) {
    if (role === "그룹장" && !p.group_id) {
      setError(`${p.name} 님은 소속 그룹이 없습니다. 그룹을 먼저 정해주세요.`);
      return;
    }
    const supabase = createClient();
    await run(async () => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", p.id);
      return { error };
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-900">그룹</h2>
        <p className="text-sm text-gray-500 mt-0.5 break-keep">
          팀장 아래에 그룹을 두고, 그룹마다 그룹장을 정합니다. 그룹장은 자기 그룹 팀원에게만 업무를
          나눠줄 수 있고, 새로 올린 업무는 팀장에게 보고로 올라옵니다.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 break-keep">
          {error}
        </div>
      )}

      <form onSubmit={addGroup} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="그룹 이름 (예: 1그룹, 소재그룹)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="shrink-0 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          그룹 추가
        </button>
      </form>

      <div className="space-y-3">
        {groups.map((g) => {
          const inGroup = people.filter((p) => p.group_id === g.id).sort(byDisplayOrder);
          const leads = inGroup.filter((p) => p.role === "그룹장");

          return (
            <div key={g.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                {renaming === g.id ? (
                  <>
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(g.id);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => rename(g.id)}
                      disabled={busy}
                      className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setRenaming(null)}
                      className="text-xs px-2 py-1 rounded text-gray-400 hover:text-gray-600"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-gray-900">{g.name}</span>
                    <span className="text-xs text-gray-400">{inGroup.length}명</span>
                    {leads.length === 0 && (
                      <span className="text-xs text-amber-600">· 그룹장 없음</span>
                    )}
                    {leads.length > 1 && (
                      <span className="text-xs text-red-600">
                        · 그룹장이 {leads.length}명입니다 (1명을 권합니다)
                      </span>
                    )}
                    <span className="flex-1" />
                    <button
                      onClick={() => {
                        setRenaming(g.id);
                        setRenameText(g.name);
                      }}
                      className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-white"
                    >
                      이름 바꾸기
                    </button>
                    <button
                      onClick={() => removeGroup(g)}
                      disabled={busy}
                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      그룹 삭제
                    </button>
                  </>
                )}
              </div>

              <ul className="divide-y divide-gray-100">
                {inGroup.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    groups={groups}
                    busy={busy}
                    onMove={moveTo}
                    onRole={setRole}
                  />
                ))}
                {inGroup.length === 0 && (
                  <li className="px-4 py-4 text-sm text-gray-400">
                    아직 아무도 없습니다. 아래 &ldquo;그룹 미지정&rdquo;에서 넣어주세요.
                  </li>
                )}
              </ul>
            </div>
          );
        })}

        {groups.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400 break-keep">
            아직 만든 그룹이 없습니다. 위에 이름을 적고 &ldquo;그룹 추가&rdquo;를 누르세요.
          </p>
        )}
      </div>

      {/* 그룹이 정해지지 않은 사람 */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-gray-900">그룹 미지정</span>
          <span className="text-xs text-gray-400"> {unassigned.length}명</span>
        </div>
        <ul className="divide-y divide-gray-100">
          {unassigned.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              groups={groups}
              busy={busy}
              onMove={moveTo}
              onRole={setRole}
            />
          ))}
          {unassigned.length === 0 && (
            <li className="px-4 py-4 text-sm text-gray-400">모두 그룹에 들어가 있습니다.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

function PersonRow({
  person,
  groups,
  busy,
  onMove,
  onRole,
}: {
  person: Profile;
  groups: Group[];
  busy: boolean;
  onMove: (p: Profile, groupId: string | null) => void;
  onRole: (p: Profile, role: Role) => void;
}) {
  const isLead = person.role === "그룹장";
  return (
    <li className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
      <span className="font-medium text-gray-900 break-keep">{person.name}</span>
      {person.position && <span className="text-xs text-gray-400">{person.position}</span>}
      {person.status === "가입대기" && (
        <span className="text-[11px] text-amber-600">가입 전</span>
      )}
      <span
        className={cn(
          "text-[11px] px-2 py-0.5 rounded-full",
          isLead ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
        )}
      >
        {person.role}
      </span>

      <span className="flex-1" />

      <select
        value={person.group_id ?? ""}
        disabled={busy}
        onChange={(e) => onMove(person, e.target.value || null)}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs bg-white disabled:opacity-50"
      >
        <option value="">그룹 미지정</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      <button
        onClick={() => onRole(person, isLead ? "팀원" : "그룹장")}
        disabled={busy}
        className={cn(
          "text-xs px-2.5 py-1 rounded border disabled:opacity-50",
          isLead
            ? "border-gray-300 text-gray-600 hover:bg-gray-50"
            : "border-blue-300 text-blue-700 hover:bg-blue-50"
        )}
      >
        {isLead ? "그룹장 해제" : "그룹장으로"}
      </button>
    </li>
  );
}
