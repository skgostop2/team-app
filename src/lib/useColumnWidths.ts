"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 표 칸 폭을 사람이 직접 끌어서 조절하게 한다.
 *
 * 내가 아무리 재서 맞춰도 쓰는 사람마다 화면도 글자도 다르다.
 * 좁으면 그 자리에서 늘리고, 그 폭이 다음에도 유지되는 쪽이 맞다.
 * 폭은 이 브라우저에만 저장된다 (다른 사람 화면은 건드리지 않는다).
 */
const MIN = 36;
/** 보통 칸의 최대 폭 */
const MAX = 480;
/** 본문처럼 넓어야 하는 칸은 더 크게 (키 이름으로 따로 둔다) */
const MAX_BY_KEY: Record<string, number> = { title: 1600 };
const maxOf = (key: string) => MAX_BY_KEY[key] ?? MAX;

export function useColumnWidths(storageKey: string, base: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(base);
  const [ready, setReady] = useState(false);
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);

  // 저장해 둔 폭을 불러온다. 없거나 깨졌으면 기본값으로 간다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, number>;
        const merged = { ...base };
        for (const k of Object.keys(base)) {
          const v = saved[k];
          if (typeof v === "number" && v >= 0 && v <= maxOf(k)) merged[k] = Math.round(v);
        }
        setWidths(merged);
      }
    } catch {
      // 저장소를 못 써도 이번 화면은 정상 동작한다
    }
    setReady(true);
    // base 는 상수라 한 번만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const save = useCallback(
    (next: Record<string, number>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 저장 실패해도 화면은 그대로 쓴다
      }
    },
    [storageKey]
  );

  /** 칸 경계를 잡고 끌기 시작 */
  const startDrag = useCallback(
    (key: string, e: React.PointerEvent) => {
      e.preventDefault();

      // 폭을 0(자동)으로 둔 칸은 지금 화면에 그려진 폭부터 끌기 시작한다.
      // 안 그러면 잡는 순간 최소 폭으로 확 줄어든다.
      const cur = widths[key] ?? base[key];
      const shown = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect().width;
      const startW = cur > 0 ? cur : Math.round(shown ?? base[key] ?? MIN);

      drag.current = { key, startX: e.clientX, startW };

      const move = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const w = Math.min(maxOf(d.key), Math.max(MIN, d.startW + (ev.clientX - d.startX)));
        setWidths((prev) => ({ ...prev, [d.key]: Math.round(w) }));
      };
      const up = () => {
        drag.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setWidths((prev) => {
          save(prev);
          return prev;
        });
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [widths, base, save]
  );

  const reset = useCallback(() => {
    setWidths({ ...base });
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // 지우지 못해도 화면은 기본값으로 돌아간다
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const changed = Object.keys(base).some((k) => widths[k] !== base[k]);


  return { widths, startDrag, reset, changed, ready };
}
