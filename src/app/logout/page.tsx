"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.signOut().then(() => {
      router.push("/login");
      router.refresh();
    });
  }, [router]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">로그아웃 중...</p>
    </div>
  );
}
