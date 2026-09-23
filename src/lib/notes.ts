import { createClient } from "@/lib/supabase/client";
import type { PersonalNote } from "@/lib/types";

/**
 * 개인 메모장 데이터 접근.
 *
 * RLS 로 본인 것만 읽고 쓰도록 잠겨 있다 (팀장·실장도 남의 메모는 못 본다).
 * 지운 메모는 바로 없애지 않고 deleted_at 만 찍어 휴지통에 둔다.
 */

export async function fetchNotes(includeDeleted = false): Promise<PersonalNote[]> {
  const supabase = createClient();
  let q = supabase
    .from("personal_notes")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (!includeDeleted) q = q.is("deleted_at", null);

  const { data } = await q;
  return (data ?? []) as PersonalNote[];
}

export async function createNote(fields: {
  title?: string;
  content?: string;
  taskId?: string | null;
}): Promise<PersonalNote | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("personal_notes")
    .insert({
      user_id: user.id,
      title: fields.title ?? "",
      content: fields.content ?? "",
      task_id: fields.taskId ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as PersonalNote;
}

export async function saveNote(
  id: string,
  fields: Partial<Pick<PersonalNote, "title" | "content" | "pinned" | "task_id">>
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("personal_notes").update(fields).eq("id", id);
  return !error;
}

/** 휴지통으로 보낸다 (내용은 남는다) */
export async function trashNote(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("personal_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function restoreNote(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("personal_notes")
    .update({ deleted_at: null })
    .eq("id", id);
  return !error;
}

/** 휴지통에서 완전히 지운다. 본인이 한 번 더 확인한 경우에만 쓴다. */
export async function purgeNote(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("personal_notes").delete().eq("id", id);
  return !error;
}

/** 오늘 날짜 제목 (일지 한 장이 하루치가 되게) */
export function dailyLogTitle(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `일지 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} (${days[d.getDay()]})`;
}

/**
 * 한 줄 기록.
 *
 * 메모를 "문서"로 다루면 쓸 때마다 새 메모를 만들지, 어디에 적을지 고민하게 된다.
 * 일지처럼 그날 한 장에 시각과 함께 계속 쌓는 쪽이 현장에서 쓰기 쉽다.
 * 기존 내용 뒤에 붙이기만 하므로 앞서 적은 것은 지워지지 않는다.
 */
export async function appendLogLine(
  text: string
): Promise<{ note: PersonalNote | null; error: string | null }> {
  const line = text.trim();
  if (!line) return { note: null, error: "내용이 비어 있습니다." };

  const p = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const stamp = `${p(now.getHours())}:${p(now.getMinutes())}`;
  const title = dailyLogTitle(now);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { note: null, error: "로그인이 필요합니다." };

  // 오늘 일지가 이미 있으면 거기에 붙인다
  const { data: found } = await supabase
    .from("personal_notes")
    .select("*")
    .eq("user_id", user.id)
    .eq("title", title)
    .is("deleted_at", null)
    .limit(1);

  const today = (found ?? [])[0] as PersonalNote | undefined;

  if (today) {
    const merged = today.content ? `${today.content}\n${stamp}  ${line}` : `${stamp}  ${line}`;
    const { data, error } = await supabase
      .from("personal_notes")
      .update({ content: merged })
      .eq("id", today.id)
      .select()
      .single();
    if (error) return { note: null, error: `기록하지 못했습니다: ${error.message}` };
    return { note: data as PersonalNote, error: null };
  }

  const created = await createNote({ title, content: `${stamp}  ${line}` });
  if (!created) return { note: null, error: "기록하지 못했습니다." };
  return { note: created, error: null };
}
