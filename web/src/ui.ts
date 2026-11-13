import type { CSSProperties } from "react";

/** Inline style that tells the pixel range track how much of itself to fill. */
export function rangeFill(value: number, min: number, max: number): CSSProperties {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return { "--fill": `${Math.min(100, Math.max(0, pct))}%` } as CSSProperties;
}
