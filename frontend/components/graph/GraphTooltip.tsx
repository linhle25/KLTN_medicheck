import type { ReactNode } from "react";

type GraphTooltipProps = { left: number; top: number; below?: boolean; background?: string; children: ReactNode };

export default function GraphTooltip({ left, top, below, background, children }: GraphTooltipProps) {
  return (
    <div
      className={`tt-graph-tooltip ${below ? "tt-graph-tooltip--below" : ""}`}
      style={{ left, top, ...(background ? { background } : {}) }}
      role="tooltip"
    >
      {children}
    </div>
  );
}
