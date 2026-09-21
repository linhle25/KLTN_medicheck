import type { Severity } from "@/lib/api";

const CONFIG: { key: Severity; label: string; dotClass: string }[] = [
  { key: "nang", label: "Nghiêm trọng", dotClass: "tt-legend-dot--severe" },
  { key: "trung_binh", label: "Trung bình", dotClass: "tt-legend-dot--moderate" },
  { key: "nhe", label: "Nhẹ", dotClass: "tt-legend-dot--mild" },
  { key: "chua_phan_loai", label: "Chưa phân loại", dotClass: "tt-legend-dot--unknown" },
];

type SeverityCountStripProps = {
  edges: { muc_do?: Severity }[];
  selectedSeverity?: Severity | "all";
  onSelect?: (severity: Severity | "all") => void;
};

export default function SeverityCountStrip({ edges, selectedSeverity = "all", onSelect }: SeverityCountStripProps) {
  const counts: Record<Severity, number> = { nang: 0, trung_binh: 0, nhe: 0, chua_phan_loai: 0 };
  for (const edge of edges) if (edge.muc_do) counts[edge.muc_do] += 1;

  return (
    <div className="tt-severity-strip" aria-label="Lọc theo mức độ tương tác">
      {onSelect && (
        <button
          type="button"
          className={`tt-severity-strip__item tt-severity-strip__item--filter ${selectedSeverity === "all" ? "is-active" : ""}`}
          onClick={() => onSelect("all")}
          aria-pressed={selectedSeverity === "all"}
        >
          Tất cả: <strong>{Object.values(counts).reduce((total, count) => total + count, 0)}</strong>
        </button>
      )}
      {CONFIG.map((c) => (
        onSelect ? (
          <button
            key={c.key}
            type="button"
            className={`tt-severity-strip__item tt-severity-strip__item--filter ${selectedSeverity === c.key ? "is-active" : ""}`}
            onClick={() => onSelect(c.key)}
            aria-pressed={selectedSeverity === c.key}
          >
            <i className={`tt-legend-dot ${c.dotClass}`} /> {c.label}: <strong>{counts[c.key]}</strong>
          </button>
        ) : (
          <span key={c.key} className="tt-severity-strip__item">
            <i className={`tt-legend-dot ${c.dotClass}`} /> {c.label}: <strong>{counts[c.key]}</strong>
          </span>
        )
      ))}
    </div>
  );
}
