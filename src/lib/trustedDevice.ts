"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * "이 기기 30일 기억".
 *
 * 6자리를 한 번 넣은 기기는 30일 동안 다시 묻지 않는다.
 *
 * 기기에는 임의의 열쇠를 쿠키로 두고, 서버에는 그 열쇠의 해시만 둔다.
 * 쿠키라서 서버가 화면을 그리기 전에 바로 확인할 수 있고,
 * 해시만 저장하므로 DB 를 들여다봐도 남의 기기로 들어갈 수 없다.
 */
export const TRUST_COOKIE = "td";
const DAYS = 30;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 브라우저·운영체제를 짧게 적어둔다 (나중에 "어느 기기였지" 알아보려고) */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iPhone/iPad"
        : /Mac/.test(ua)
          ? "Mac"
          : "기타";
  const br = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : "브라우저";
  return `${os} · ${br}`;
}

/** 이 기기를 30일간 기억한다 */
export async function rememberThisDevice(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "로그인이 필요합니다.";

  const token = crypto.randomUUID() + crypto.randomUUID();
  const hash = await sha256Hex(token);
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("trusted_devices").insert({
    user_id: user.id,
    token_hash: hash,
    label: deviceLabel(),
    expires_at: expires.toISOString(),
  });
  if (error) return `기기를 기억하지 못했습니다: ${error.message}`;

  // 쿠키는 서버도 읽는다. 30일 뒤 자동으로 사라진다.
  document.cookie = `${TRUST_COOKIE}=${token}; path=/; max-age=${DAYS * 24 * 60 * 60}; samesite=lax${
    location.protocol === "https:" ? "; secure" : ""
  }`;
  return null;
}

/** 이 기기 기억을 끊는다 */
export async function forgetThisDevice(): Promise<void> {
  const token = readCookie(TRUST_COOKIE);
  document.cookie = `${TRUST_COOKIE}=; path=/; max-age=0`;
  if (!token) return;
  const supabase = createClient();
  await supabase.from("trusted_devices").delete().eq("token_hash", await sha256Hex(token));
}

/** 모든 기기 기억을 끊는다 (휴대폰을 잃어버렸을 때) */
export async function forgetAllDevices(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  document.cookie = `${TRUST_COOKIE}=; path=/; max-age=0`;
  if (user) await supabase.from("trusted_devices").delete().eq("user_id", user.id);
}

export function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export type TrustedDevice = {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
};

export async function listDevices(): Promise<TrustedDevice[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("trusted_devices")
    .select("id, label, created_at, last_used_at, expires_at")
    .order("last_used_at", { ascending: false });
  return (data ?? []) as TrustedDevice[];
}
