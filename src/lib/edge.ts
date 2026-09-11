import { createClient } from "@/lib/supabase/client";

const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

export async function callEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>,
  opts: { authed?: boolean } = {}
): Promise<{ data: T | null; error: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };

  if (opts.authed) {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } else {
    headers["Authorization"] = `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`;
  }

  try {
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      return { data: null, error: json.error || "요청 처리 중 오류가 발생했습니다." };
    }
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." };
  }
}
