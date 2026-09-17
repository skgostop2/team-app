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
