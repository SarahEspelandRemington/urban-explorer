import { useState, useEffect } from "react";

export function useStillLoading(isPending: boolean, delayMs: number = 10_000): boolean {
  const [showStillLoading, setShowStillLoading] = useState(false);

  useEffect(() => {
    if (isPending) {
      setShowStillLoading(false);
      const timer = setTimeout(() => setShowStillLoading(true), delayMs);
      return () => clearTimeout(timer);
    } else {
      setShowStillLoading(false);
    }
  }, [isPending, delayMs]);

  return showStillLoading;
}
