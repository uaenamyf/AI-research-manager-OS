/** 论文分析状态轮询 hook。 */
"use client";

import { useEffect, useState } from "react";
import { getPaperStatus } from "@/lib/api/papers";
import type { PaperStatus } from "@/types";

/**
 * 轮询论文分析状态，直到非 PROCESSING 状态。
 * @param paperId 论文 ID，为 null 时不轮询
 * @param interval 轮询间隔 ms，默认 3000
 */
export function usePaperStatus(
  paperId: number | null,
  interval = 3000,
): {
  status: PaperStatus | null;
  loading: boolean;
  error: Error | null;
} {
  const [status, setStatus] = useState<PaperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!paperId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    const poll = async () => {
      try {
        const s = await getPaperStatus(paperId);
        if (!active) return;
        setStatus(s);
        if (s === "PROCESSING") {
          setTimeout(poll, interval);
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (!active) return;
        setError(err as Error);
        setLoading(false);
      }
    };
    poll();

    return () => {
      active = false;
    };
  }, [paperId, interval]);

  return { status, loading, error };
}