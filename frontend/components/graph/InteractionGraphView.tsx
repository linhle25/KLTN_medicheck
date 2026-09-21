"use client";

import { useMemo, useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { Severity } from "@/lib/api";
import { NODE_FILL_PALETTE, circleLayout, type GraphGroup } from "@/lib/interactionGraph";
import GraphTooltip from "./GraphTooltip";

export type GraphNodeVM = { id: string; label: string; groupId: string };
export type GraphEdgeVM = { id: string; sourceId: string; targetId: string; muc_do?: Severity; hasIncompletePair: boolean };

export const SEVERITY_EDGE_COLOR: Record<Severity, string> = { nang: "#c94740", trung_binh: "#c58a32", nhe: "#5d9b78", chua_phan_loai: "#8d98a4" };

type Hovered = { type: "node" | "edge"; id: string };

type InteractionGraphViewProps = {
  nodes: GraphNodeVM[];
  edges: GraphEdgeVM[];
  groups: GraphGroup[];
  ariaLabel: string;
  showLegend?: boolean;
};

const NODE_RADIUS = 7;

function truncateLabel(label: string, max = 7): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

// Bấm vào 1 cạnh không drill-down xuống cấp dưới nữa (đó là việc của nút "Xem chi
// tiết" trên từng thẻ giải thích) - chỉ cuộn tới đúng thẻ giải thích tương ứng và
// nháy viền vàng để người dùng dễ nhận ra, tái dùng class ".interaction-pair-card--focused" đã có sẵn.
// Export để InteractionOverview.tsx dùng lại cho việc bấm cụm từ nhấn mạnh trong
// đoạn tóm tắt tổng quan (cùng hành vi cuộn + nháy viền, không viết lại lần 2).
export function scrollToPairCard(edgeId: string) {
  const target = document.getElementById(`interaction-pair-${edgeId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("interaction-pair-card--focused");
  window.setTimeout(() => target.classList.remove("interaction-pair-card--focused"), 1600);
}

export default function InteractionGraphView({ nodes, edges, groups, ariaLabel, showLegend = true }: InteractionGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [tooltip, setTooltip] = useState<{ left: number; top: number; content: string; below: boolean; background?: string } | null>(null);

  const positions = useMemo(() => circleLayout(nodes.length), [nodes.length]);
  const positionById = useMemo(() => new Map(nodes.map((n, i) => [n.id, positions[i]])), [nodes, positions]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);
  // Tập id các node kề (bao gồm chính nó) cho từng node - dùng để làm sáng cả cụm
  // node+cạnh+node liên quan khi hover 1 node, không chỉ riêng node đó.
  const neighborsById = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of nodes) map.set(node.id, new Set([node.id]));
    for (const edge of edges) {
      map.get(edge.sourceId)?.add(edge.targetId);
      map.get(edge.targetId)?.add(edge.sourceId);
    }
    return map;
  }, [nodes, edges]);

  function colorForNode(node: GraphNodeVM, index: number): string {
    return groupById.get(node.groupId)?.color ?? NODE_FILL_PALETTE[index % NODE_FILL_PALETTE.length];
  }

  function edgePath(edge: GraphEdgeVM): string | null {
    const p1 = positionById.get(edge.sourceId);
    const p2 = positionById.get(edge.targetId);
    if (!p1 || !p2) return null;
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    // Bẻ cong điểm điều khiển về phía tâm layout (50,50, khớp mặc định của
    // circleLayout) thay vì đổi hướng tùy tiện theo chỉ số - để cạnh luôn võng
    // vào trong như mạng lưới tròn, không bao giờ phình ra ngoài rìa đồ thị.
    const towardCenterX = 50 - mx;
    const towardCenterY = 50 - my;
    const sign = nx * towardCenterX + ny * towardCenterY >= 0 ? 1 : -1;
    const offset = len * 0.18 * sign;
    const cx = mx + nx * offset;
    const cy = my + ny * offset;
    return `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
  }

  function edgeOpacity(edge: GraphEdgeVM): number {
    if (!hovered) return 0.55;
    if (hovered.type === "edge") return hovered.id === edge.id ? 1 : 0.08;
    return edge.sourceId === hovered.id || edge.targetId === hovered.id ? 1 : 0.08;
  }

  // Đường nối chỉ dày lên khi con trỏ nằm đúng trong phạm vi của chính nó (không
  // phải khi hover 1 node đầu cạnh) - phạm vi bắt hover (.tt-graph-edge-hit) đã
  // được thu hẹp bằng đúng độ dày đường nối hiển thị (xem .tt-graph-edge-hit trong globals.css).
  function edgeStrokeWidth(edge: GraphEdgeVM): number {
    return hovered?.type === "edge" && hovered.id === edge.id ? 1.8 : 0.8;
  }

  function nodeVisualState(node: GraphNodeVM): { opacity: number; filter: string } {
    if (!hovered) return { opacity: 1, filter: "none" };
    const connected = hovered.type === "node"
      ? (neighborsById.get(hovered.id)?.has(node.id) ?? node.id === hovered.id)
      : (() => {
          const edge = edgeById.get(hovered.id);
          return edge ? node.id === edge.sourceId || node.id === edge.targetId : false;
        })();
    return connected ? { opacity: 1, filter: "none" } : { opacity: 0.3, filter: "saturate(0.3)" };
  }

  // Tooltip đi theo đúng vị trí con trỏ (không neo cố định vào node/cạnh nữa) -
  // tính theo tọa độ con trỏ so với góc trên-trái của .tt-graph-canvas (cha trực
  // tiếp của svg, position:relative, cũng là nơi tooltip absolute định vị theo).
  function tooltipPosFromPointer(e: React.PointerEvent): { left: number; top: number; below: boolean } | null {
    const canvas = svgRef.current?.parentElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const left = e.clientX - rect.left;
    const top = e.clientY - rect.top;
    // Lật tooltip xuống dưới con trỏ khi quá gần mép trên canvas, tránh bị cắt bởi
    // phần header phía trên khung đồ thị.
    return { left, top, below: top < 40 };
  }

  function handleEdgeEnter(edge: GraphEdgeVM, e: React.PointerEvent) {
    setHovered({ type: "edge", id: edge.id });
    const pos = tooltipPosFromPointer(e);
    if (!pos) return;
    const nodeA = nodeById.get(edge.sourceId);
    const nodeB = nodeById.get(edge.targetId);
    const background = edge.muc_do ? SEVERITY_EDGE_COLOR[edge.muc_do] : "#8d98a4";
    setTooltip({ ...pos, background, content: `${nodeA?.label ?? ""} ⇄ ${nodeB?.label ?? ""}` });
  }

  function handleNodeEnter(node: GraphNodeVM, e: React.PointerEvent) {
    setHovered({ type: "node", id: node.id });
    const pos = tooltipPosFromPointer(e);
    if (!pos) return;
    setTooltip({ ...pos, content: node.label });
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pos = tooltipPosFromPointer(e);
    if (!pos) return;
    setTooltip((t) => (t ? { ...t, ...pos } : t));
  }

  function handleLeave() {
    setHovered(null);
    setTooltip(null);
  }

  if (nodes.length === 0) {
    return <div className="graph-placeholder"><MaterialIcon name="hub" size={42} /><span>Đồ thị sẽ hiển thị sau khi bạn chọn thuốc</span></div>;
  }

  return (
    <div className="tt-graph-canvas">
      <svg ref={svgRef} viewBox="0 0 100 100" role="img" aria-label={ariaLabel} onMouseLeave={handleLeave}>
        {edges.map((edge) => {
          const d = edgePath(edge);
          if (!d) return null;
          const color = edge.muc_do ? SEVERITY_EDGE_COLOR[edge.muc_do] : "#9bb1c9";
          return (
            <g key={edge.id} className="tt-graph-edge-group tt-graph-edge-group--clickable">
              <path
                d={d}
                className="tt-graph-edge-hit"
                onPointerEnter={(e) => handleEdgeEnter(edge, e)}
                onPointerMove={handlePointerMove}
                onPointerLeave={handleLeave}
                onClick={() => scrollToPairCard(edge.id)}
              />
              <path d={d} className="tt-graph-edge" style={{ stroke: color, opacity: edgeOpacity(edge), strokeWidth: edgeStrokeWidth(edge) }} />
            </g>
          );
        })}
        {nodes.map((node, index) => {
          const pos = positionById.get(node.id);
          if (!pos) return null;
          const state = nodeVisualState(node);
          const isThisNodeHovered = hovered?.type === "node" && hovered.id === node.id;
          return (
            <g
              key={node.id}
              className="tt-graph-node"
              transform={`translate(${pos[0]} ${pos[1]}) scale(${isThisNodeHovered ? 1.18 : 1})`}
              style={{ filter: state.filter }}
              onPointerEnter={(e) => handleNodeEnter(node, e)}
              onPointerMove={handlePointerMove}
              onPointerLeave={handleLeave}
            >
              {/* Lõi (khối màu + tên) mờ/hiện cùng lúc với cạnh - vòng trắng bao
                  quanh (tt-graph-node__ring) cố ý mờ/hiện CHẬM HƠN một nhịp (xem
                  transition-delay ở globals.css) để tạo hiệu ứng lớp trong-ngoài. */}
              <circle className="tt-graph-node__fill" r={NODE_RADIUS} fill={colorForNode(node, index)} style={{ opacity: state.opacity }} />
              <text className="tt-graph-node__label" y="0.4" textAnchor="middle" dominantBaseline="central" style={{ opacity: state.opacity }}>{truncateLabel(node.label)}</text>
              <circle className="tt-graph-node__ring" r={NODE_RADIUS} style={{ opacity: state.opacity }} />
            </g>
          );
        })}
      </svg>
      {tooltip && <GraphTooltip left={tooltip.left} top={tooltip.top} below={tooltip.below} background={tooltip.background}>{tooltip.content}</GraphTooltip>}
      {showLegend && groups.length > 0 && (
        <div className="tt-graph-legend">
          {groups.map((g) => <span key={g.id}><i className="tt-graph-legend__dot" style={{ background: g.color }} /> {g.label}</span>)}
        </div>
      )}
    </div>
  );
}
