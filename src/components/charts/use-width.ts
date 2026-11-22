"use client";
import { useEffect, useState } from "react";

/** 要素の幅（px）。ResizeObserver で追う。 */
export function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.round(entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
