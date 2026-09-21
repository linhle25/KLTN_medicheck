"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import MaterialIcon from "@/components/MaterialIcon";
import PharmacistReviewPrompt, { type PharmacistReviewPromptHandle } from "@/components/PharmacistReviewPrompt";
import type { MedicationCheckResponse, Severity } from "@/lib/api";
import type { Session } from "@/lib/auth";
import { assignGroupColors, buildCitationReferences, buildPrescriptionGraph, buildProductGraph, withDataOnly } from "@/lib/interactionGraph";
import { drugOrigins, firstPrescriptionIndex, isCrossPrescription, mergedDrugNames, type Prescription } from "@/lib/prescription";
import { scrollBelowStickyHeader } from "@/lib/scroll";
import type { GraphPairItem } from "./GraphPairList";
import InteractionDetailTabs from "./InteractionDetailTabs";
import InteractionGraphView, { scrollToPairCard, type GraphEdgeVM, type GraphNodeVM } from "./InteractionGraphView";
import SeverityCountStrip from "./SeverityCountStrip";
import MediFox from "@/components/MediFox";

// Chỉ cần đúng các field này để dựng đồ thị/tóm tắt - để component dùng chung
// được cho cả MedicationCheckResponse (bệnh nhân) lẫn AgentCheckResult (dược sĩ
// xem lại 1 yêu cầu xét duyệt cụ thể, không có interaction_check_id vì endpoint
// GET /pharmacist/reviews/{id} trả nguyên state agent, không kèm field đó).
export type InteractionOverviewResult = Pick<
  MedicationCheckResponse,
  | "is_personalized"
  | "explanations"
  | "has_severe"
  | "has_severe_disease_interaction"
  | "has_unclassified"
  | "product_explanations"
  | "overview"
  | "food_interactions"
  | "disease_interactions"
  | "disease_interaction_scope"
  | "patient_conditions_snapshot"
  | "canh_bao_thuc_pham_benh_nen"
> & {
  interaction_check_id?: string;
};

type InteractionOverviewProps = {
  result: InteractionOverviewResult;
  prescriptions: Prescription[];
  // Mở lại popup gợi ý nhờ dược sĩ ở nơi khác (nếu có).
  session: Session | null;
  // "pharmacist": bàn cân tra cứu độc lập của dược sĩ (pharmacist-lookup) - ưu
  // tiên bản giọng điệu khoa học/chuyên nghiệp (giai_thich_duoc_si) khi có. Mặc
  // định "patient" - đúng hành vi cũ.
  audience?: "patient" | "pharmacist";
  // Khung "Nhờ dược sĩ xác nhận" - mặc định hiện đúng khi audience="patient" (hành
  // vi cũ). Cho phép tắt riêng dù audience="patient", dùng khi DƯỢC SĨ xem lại 1
  // yêu cầu xét duyệt cụ thể (trang review): vẫn muốn giọng văn/nội dung y hệt
  // bệnh nhân (audience="patient" mặc định) nhưng khung mời "nhờ dược sĩ xác nhận"
  // vô nghĩa với chính dược sĩ.
  showReviewPrompt?: boolean;
  // Có thể ẩn riêng nút thao tác trong panel phân tích nhưng vẫn giữ khung đăng
  // nhập/gửi yêu cầu phía dưới (landing page dùng cấu hình này).
  showReviewAction?: boolean;
  // Cho phép ẩn riêng nút cuộn tới phần tóm tắt. Trang dược sĩ xem hồ sơ yêu
  // cầu đã có luồng nhận xét riêng nên không cần thao tác AI này.
  showAiSummaryAction?: boolean;
  // Màn xem hồ sơ yêu cầu cần hiển thị trọn khung đồ thị và chỉ cuộn trang chính,
  // không tạo thêm một vùng cuộn lồng bên trong khung bên trái.
  graphPaneScrollable?: boolean;
  // Landing page luôn cần hiển thị yêu cầu đăng nhập để gửi kết quả,
  // kể cả guest check không có interaction_check_id.
  requireLoginToReview?: boolean;
};

function pickText(item: { giai_thich: string; giai_thich_duoc_si?: string } | undefined, audience: "patient" | "pharmacist"): string {
  if (!item) return "";
  return audience === "pharmacist" ? item.giai_thich_duoc_si ?? item.giai_thich : item.giai_thich;
}

// In đậm + tô màu xanh primary cụm từ AI tự chọn nhấn mạnh trong đoạn tóm tắt
// tổng quan (backend tách sẵn markup {{muc_do:...}} thành danh sách này, xem
// rollup_explain.py::_parse_highlights) - muc_do chỉ còn dùng để tra key React,
// không còn ảnh hưởng màu (xem .overview-highlight trong globals.css). Tìm theo
// thứ tự xuất hiện, bỏ qua cụm nào lệch khỏi text (an toàn nếu AI paraphrase
// khác đi 1 chút) thay vì báo lỗi.
//
// resolveEdgeId: tìm ID cạnh thuốc-thuốc khớp với cụm nhấn mạnh (dựa theo tên 2
// thuốc có mặt trong cụm), để bấm vào cụm sẽ cuộn xuống đúng thẻ giải thích bên
// dưới - tái dùng scrollToPairCard đã có sẵn cho việc bấm cạnh trên đồ thị
// (InteractionGraphView.tsx). Không tìm được thì hiện như văn bản thường, không
// bấm được (an toàn nếu AI paraphrase tên thuốc khác đi).
function renderOverviewText(
  text: string,
  highlights: { text: string; muc_do: Severity }[] | undefined,
  resolveEdgeId: (highlightText: string) => string | undefined,
): ReactNode {
  if (!highlights || highlights.length === 0) return text;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  highlights.forEach((h, i) => {
    const idx = text.indexOf(h.text, cursor);
    if (idx === -1) return;
    if (idx > cursor) nodes.push(text.slice(cursor, idx));
    const edgeId = resolveEdgeId(h.text);
    nodes.push(
      edgeId ? (
        <mark
          key={i}
          className="overview-highlight overview-highlight--clickable"
          role="button"
          tabIndex={0}
          onClick={() => scrollToPairCard(edgeId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              scrollToPairCard(edgeId);
            }
          }}
        >
          {h.text}
        </mark>
      ) : (
        <mark key={i} className="overview-highlight">
          {h.text}
        </mark>
      ),
    );
    cursor = idx + h.text.length;
  });
  if (nodes.length === 0) return text;
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

// Kết quả cho luồng bệnh nhân: không còn phân cấp drill-down (đơn -> thuốc ->
// hoạt chất, cấp hoạt chất giờ không còn giai_thich để hiển thị nữa) - chỉ còn 1
// đồ thị (nút = đơn thuốc nếu so nhiều đơn, ngược lại = thuốc) + 1 đoạn tóm tắt
// tổng quan do LLM sinh
// (result.overview), và danh sách chi tiết TỪNG CẶP THUỐC-THUỐC (không còn hoạt
// chất-hoạt chất hay đơn-đơn nữa) hiện LUÔN sẵn, mặc định ở tab "Thuốc - Thuốc"
// (không còn nút bung/ẩn - xem InteractionDetailTabs). Cũng dùng lại cho bàn cân
// tra cứu độc lập của dược sĩ (audience="pharmacist") và trang dược sĩ xem xét 1
// yêu cầu xét duyệt cụ thể (showReviewPrompt={false}, audience mặc định "patient"
// để giọng văn y hệt bệnh nhân).
export default function InteractionOverview({ result, prescriptions, session, audience = "patient", showReviewPrompt = audience === "patient", showReviewAction = true, showAiSummaryAction = true, graphPaneScrollable = true, requireLoginToReview = false }: InteractionOverviewProps) {
  const DEFAULT_GRAPH_PANE_PERCENT = 58;
  const MIN_GRAPH_PANE_PERCENT = 30;
  const MAX_GRAPH_PANE_PERCENT = 72;
  const boardMode = prescriptions.length > 1;
  // Chỉ có ý nghĩa khi boardMode: mặc định đồ thị gộp theo ĐƠN THUỐC (như cũ) -
  // bấm nút mới bung ra xem chi tiết cấp THUỐC giữa các đơn (mỗi đơn 1 màu, có chú
  // thích). Không reset về false khi đổi kết quả.
  const [showDrugLevel, setShowDrugLevel] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | "all">("all");
  const graphPaneRef = useRef<HTMLElement>(null);
  const graphSummaryRef = useRef<HTMLDivElement>(null);
  const splitLayoutRef = useRef<HTMLDivElement>(null);
  const splitDragActiveRef = useRef(false);
  const pharmacistReviewRef = useRef<PharmacistReviewPromptHandle>(null);
  const [graphPanePercent, setGraphPanePercent] = useState(DEFAULT_GRAPH_PANE_PERCENT);
  const [splitDragActive, setSplitDragActive] = useState(false);

  useEffect(() => {
    setSelectedSeverity("all");
  }, [result]);

  function matchesSelectedSeverity(severity: Severity | undefined) {
    return selectedSeverity === "all" || (severity ?? "chua_phan_loai") === selectedSeverity;
  }

  function scrollToGraphSummary() {
    const pane = graphPaneRef.current;
    const summary = graphSummaryRef.current;
    if (!pane || !summary) return;
    const top = pane.scrollTop + summary.getBoundingClientRect().top - pane.getBoundingClientRect().top - 20;
    pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  const splitBounds = useCallback(() => {
    const width = splitLayoutRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return { min: MIN_GRAPH_PANE_PERCENT, max: MAX_GRAPH_PANE_PERCENT };

    // Keep both panes usable even after an aggressive drag. On a narrower
    // desktop the pixel minimums take priority; wider screens keep a flexible
    // 30%-72% range.
    const min = Math.max(MIN_GRAPH_PANE_PERCENT, (420 / width) * 100);
    const max = Math.min(MAX_GRAPH_PANE_PERCENT, 100 - ((360 + 12) / width) * 100);
    return { min, max: Math.max(min, max) };
  }, []);

  const resizeSplitFromClientX = useCallback((clientX: number) => {
    const layout = splitLayoutRef.current;
    if (!layout) return;
    const rect = layout.getBoundingClientRect();
    if (rect.width <= 0) return;
    const { min, max } = splitBounds();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setGraphPanePercent(Math.min(max, Math.max(min, next)));
  }, [splitBounds]);

  function startSplitDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    splitDragActiveRef.current = true;
    setSplitDragActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSplitFromClientX(event.clientX);
  }

  function moveSplitDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!splitDragActiveRef.current) return;
    resizeSplitFromClientX(event.clientX);
  }

  function stopSplitDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!splitDragActiveRef.current) return;
    splitDragActiveRef.current = false;
    setSplitDragActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resizeSplitWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const { min, max } = splitBounds();
    const step = event.shiftKey ? 5 : 2;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = graphPanePercent - step;
    if (event.key === "ArrowRight") next = graphPanePercent + step;
    if (event.key === "Home") next = min;
    if (event.key === "End") next = max;
    if (event.key === "Enter" || event.key === " ") next = DEFAULT_GRAPH_PANE_PERCENT;
    if (next === null) return;
    event.preventDefault();
    setGraphPanePercent(Math.min(max, Math.max(min, next)));
  }

  function openPharmacistReview() {
    const opened = pharmacistReviewRef.current?.toggleList();
    if (opened === false) return;
  }

  const scrollToPharmacistReview = useCallback(() => {
    // useLayoutEffect của danh sách gọi hàm này sau khi DOM đã xuất hiện, nên có
    // thể nhảy ngay một lần mà không cần polling hay requestAnimationFrame kép.
    scrollBelowStickyHeader("pharmacist-review-list", "auto");
  }, []);

  const origins = useMemo(() => drugOrigins(prescriptions), [prescriptions]);
  const dataExplanations = useMemo(() => withDataOnly(result.explanations), [result]);
  const allProductEdges = useMemo(
    () => buildProductGraph(mergedDrugNames(prescriptions), dataExplanations),
    [prescriptions, dataExplanations]
  );
  // Có từ 2 đơn trở lên: chỉ giữ cặp thuốc-thuốc GIỮA các đơn khác nhau - bỏ tương
  // tác trong cùng 1 đơn khỏi thống kê/chi tiết/tóm tắt, vì bệnh nhân so nhiều đơn
  // chỉ muốn biết việc gộp chung có phát sinh rủi ro mới gì, không phải rà lại từng
  // đơn đang dùng riêng lẻ (khớp với result.overview do backend đã sinh cùng logic).
  const productEdges = useMemo(
    () => (boardMode ? allProductEdges.filter((e) => isCrossPrescription(origins, e.productA, e.productB)) : allProductEdges),
    [boardMode, allProductEdges, origins]
  );
  const prescriptionEdges = useMemo(
    () => (boardMode ? buildPrescriptionGraph(productEdges, origins) : []),
    [boardMode, productEdges, origins]
  );

  // Khớp cụm nhấn mạnh trong tóm tắt tổng quan với đúng cạnh thuốc-thuốc (ID
  // `${productA}::${productB}`, giống hệt id thẻ giải thích - xem GraphPairList)
  // bằng cách kiểm tra cả 2 tên thuốc có mặt trong cụm - không cần khớp thứ tự
  // hay từ nối ("và"/"+"...) vì AI diễn đạt tự nhiên.
  const resolveHighlightEdgeId = (highlightText: string): string | undefined => {
    const lower = highlightText.toLowerCase();
    const match = productEdges.find(
      (e) => lower.includes(e.productA.toLowerCase()) && lower.includes(e.productB.toLowerCase())
    );
    return match ? `${match.productA}::${match.productB}` : undefined;
  };

  const productExplanationByPair = useMemo(() => {
    const map = new Map<string, NonNullable<typeof result.product_explanations>[number]>();
    for (const item of result.product_explanations ?? []) {
      map.set([item.thuoc_a.toLowerCase(), item.thuoc_b.toLowerCase()].sort().join("::"), item);
    }
    return map;
  }, [result]);

  // Board mode có 2 chế độ xem đồ thị: mặc định theo ĐƠN (showDrugLevel=false),
  // bấm nút "Xem chi tiết theo thuốc" chuyển sang theo THUỐC (showDrugLevel=true) -
  // vẫn CHỈ gồm cạnh GIỮA các đơn khác nhau (productEdges đã lọc sẵn ở trên), mỗi
  // node thuốc tô theo màu của đơn chứa nó (drugLevelGroups), có chú thích màu.
  const showingPrescriptionNodes = boardMode && !showDrugLevel;
  const title = boardMode
    ? (showDrugLevel ? "Tương tác thuốc giữa các đơn thuốc" : "Tương tác giữa các đơn thuốc")
    : "Tương tác giữa các thuốc";

  const drugLevelGroups = useMemo(
    () => (boardMode ? assignGroupColors(prescriptions.map((p, i) => ({ id: `rx-${i}`, label: p.label }))) : []),
    [boardMode, prescriptions]
  );
  const graphGroups = boardMode && showDrugLevel ? drugLevelGroups : [];

  const allNodes: GraphNodeVM[] = showingPrescriptionNodes
    ? prescriptions.map((p, i) => ({ id: `rx-${i}`, label: p.label, groupId: `rx-${i}` }))
    : boardMode
    ? mergedDrugNames(prescriptions).map((name) => ({ id: name, label: name, groupId: `rx-${firstPrescriptionIndex(origins, name)}` }))
    : mergedDrugNames(prescriptions).map((name) => ({ id: name, label: name, groupId: name }));

  const allEdges: GraphEdgeVM[] = showingPrescriptionNodes
    ? prescriptionEdges.map((e) => ({
        id: `rx-${e.prescriptionAIndex}::rx-${e.prescriptionBIndex}`,
        sourceId: `rx-${e.prescriptionAIndex}`,
        targetId: `rx-${e.prescriptionBIndex}`,
        muc_do: e.muc_do,
        hasIncompletePair: e.hasIncompletePair,
      }))
    : productEdges.map((e) => ({
        id: `${e.productA}::${e.productB}`,
        sourceId: e.productA,
        targetId: e.productB,
        muc_do: e.muc_do,
        hasIncompletePair: e.hasIncompletePair,
      }));

  // Đồ thị từ 6 node trở lên: bớt rối bằng cách chỉ giữ cạnh ĐÃ phân loại mức độ
  // (bỏ cạnh "chưa phân loại"), rồi bỏ luôn các node không còn cạnh nào sau khi
  // lọc. Từ 5 node trở xuống vẫn hiển thị đầy đủ như trước (đồ thị đã đủ gọn).
  const filteredGraphEdges = allEdges.filter((edge) => matchesSelectedSeverity(edge.muc_do));
  const shouldSimplifyGraph = allNodes.length >= 6;
  const edges = shouldSimplifyGraph ? filteredGraphEdges.filter((e) => e.muc_do !== "chua_phan_loai") : filteredGraphEdges;
  const nodes = shouldSimplifyGraph
    ? (() => {
        const connectedIds = new Set(edges.flatMap((e) => [e.sourceId, e.targetId]));
        return allNodes.filter((n) => connectedIds.has(n.id));
      })()
    : allNodes;

  // Chi tiết luôn ở cấp thuốc-với-thuốc, bất kể graph phía trên đang gộp theo đơn
  // hay không - đúng yêu cầu "chỉ còn hiện chi tiết tương tác thuốc với thuốc".
  const rawPairItems: GraphPairItem[] = productEdges.map((e) => {
    const backendItem = productExplanationByPair.get([e.productA.toLowerCase(), e.productB.toLowerCase()].sort().join("::"));
    return {
      id: `${e.productA}::${e.productB}`,
      thuocA: e.productA,
      thuocB: e.productB,
      severity: e.muc_do,
      description: pickText(backendItem, audience),
      source: backendItem?.nguon_trich_dan ?? "",
      references: buildCitationReferences(e.pairs),
      hasIncompletePair: e.hasIncompletePair,
      // Chỉ dược sĩ mới có (backend đã tự ẩn với bệnh nhân) - bản dịch nguyên văn
      // (không qua diễn giải) từ CSDL của mô tả tương tác + khuyến nghị xử trí.
      scientificDescription: backendItem?.mo_ta_dich,
      management: backendItem?.xu_tri_dich,
    };
  });

  const visibleRawPairItems = rawPairItems.filter((item) => matchesSelectedSeverity(item.severity));

  // Sắp xếp thẻ chi tiết theo mức độ nghiêm trọng -> trung bình -> nhẹ. Các cặp
  // "chưa phân loại" không xếp xen kẽ theo severity mà GỘP CHUNG thành 1 thẻ duy
  // nhất ở cuối danh sách - tránh lặp lại nhiều thẻ gần như giống hệt nhau khi
  // chưa có đủ dữ liệu phân loại mức độ.
  const SEVERITY_ORDER: Record<Severity, number> = { nang: 3, trung_binh: 2, nhe: 1, chua_phan_loai: 0 };
  const classifiedPairItems = visibleRawPairItems
    .filter((item) => item.severity !== "chua_phan_loai")
    .sort((a, b) => SEVERITY_ORDER[b.severity ?? "chua_phan_loai"] - SEVERITY_ORDER[a.severity ?? "chua_phan_loai"]);
  const unclassifiedPairItems = visibleRawPairItems.filter((item) => item.severity === "chua_phan_loai");
  const mergedUnclassifiedItem: GraphPairItem | null = unclassifiedPairItems.length > 0 ? {
    id: "unclassified-merged",
    severity: "chua_phan_loai",
    description: `Chưa có đủ dữ liệu để phân loại mức độ tương tác giữa ${unclassifiedPairItems.length} cặp thuốc: ${unclassifiedPairItems.map((i) => `${i.thuocA} + ${i.thuocB}`).join(", ")}.`,
    source: "",
    hasIncompletePair: false,
    mergedPairIds: unclassifiedPairItems.map((i) => i.id),
  } : null;
  const pairItems: GraphPairItem[] = mergedUnclassifiedItem ? [...classifiedPairItems, mergedUnclassifiedItem] : classifiedPairItems;

  // Tổng số mục ở nút bấm bung/ẩn - gộp cả 3 loại (thuốc-thuốc/thực phẩm/bệnh nền),
  // khớp đúng số tab sẽ hiện trong InteractionDetailTabs bên dưới.
  // Bộ lọc phía trên là bộ lọc ĐỒ THỊ thuốc-thuốc. Cảnh báo thuốc-thực phẩm và
  // thuốc-bệnh nền vẫn luôn hiển thị trong tab chi tiết để người dùng không bỏ
  // sót lưu ý lâm sàng chỉ vì đang xem riêng một mức độ trên graph.
  const visibleFoodItems = result.food_interactions ?? [];
  const visibleDiseaseItems = result.disease_interactions ?? [];
  const totalDetailCount = visibleRawPairItems.length + visibleFoodItems.length + visibleDiseaseItems.length;
  const hasAnySevere = result.has_severe || result.has_severe_disease_interaction;
  const reviewPromptAvailable = showReviewPrompt && (requireLoginToReview || Boolean(result.interaction_check_id));
  const reviewActionAvailable = showReviewAction && reviewPromptAvailable;
  const aiSummaryActionAvailable = showAiSummaryAction && Boolean(result.overview);
  const conditionNames = (result.patient_conditions_snapshot ?? []).map(
    (condition) => condition.ten_benh_vi || condition.ten_benh
  );

  return (
    <>
      {false && audience === "pharmacist" && hasAnySevere && (
        <aside className="interaction-mascot-note interaction-mascot-note--alert">
          <MediFox variant="alert" className="interaction-mascot-note__image" />
          <div>
            <strong>Cáo Medi nhắc bạn cần lưu ý</strong>
            <p>Hãy đọc kỹ cảnh báo và trao đổi với bác sĩ hoặc dược sĩ trước khi dùng thuốc.</p>
          </div>
        </aside>
      )}
      {audience === "patient" && result.disease_interaction_scope === "personalized" && (
        <aside className="disease-scope-note disease-scope-note--personalized">
          <MaterialIcon name="verified_user" size={22} />
          <div>
            <strong>Đã cá nhân hóa theo bệnh nền</strong>
            <p>
              Cảnh báo thuốc–bệnh được đối chiếu với: {conditionNames.length > 0 ? conditionNames.join(", ") : "bệnh nền đã lưu trong hồ sơ"}.
            </p>
          </div>
        </aside>
      )}
      {audience === "patient" && result.disease_interaction_scope === "general_fallback" && (
        <aside className="disease-scope-note disease-scope-note--fallback">
          <MaterialIcon name="info" size={22} />
          <div>
            <strong>Đang hiển thị cảnh báo bệnh nền tổng quát</strong>
            <p>
              Bạn chưa chọn bệnh nền chuẩn hóa. <Link href="/profile">Cập nhật hồ sơ</Link> để nhận cảnh báo phù hợp hơn.
            </p>
          </div>
        </aside>
      )}
      <section className="interaction-result interaction-result--split">
        <div
          ref={splitLayoutRef}
          id="interaction-result-layout"
          className={`interaction-result__layout${splitDragActive ? " interaction-result__layout--resizing" : ""}`}
          style={{ "--interaction-graph-width": `${graphPanePercent}%` } as CSSProperties}
        >
          <section
            ref={graphPaneRef}
            className={`interaction-result__pane interaction-result__pane--graph panel${graphPaneScrollable ? "" : " interaction-result__pane--graph-static"}`}
            aria-label="Bản đồ tương tác"
          >
            <div className="interaction-result__header">
              <div>
                <p className="eyebrow">BẢN ĐỒ TƯƠNG TÁC</p>
                <h2 className="section-heading-icon"><MaterialIcon name="hub" size={21} />{title}</h2>
                <p className="interaction-result__subtitle">Chọn mức độ hoặc bấm vào đường nối để xem cảnh báo tương ứng.</p>
              </div>
              {boardMode && (
                <button type="button" className="interaction-pairs__toggle interaction-graph-level-toggle" onClick={() => setShowDrugLevel((v) => !v)}>
                  <MaterialIcon name={showDrugLevel ? "list_alt" : "medication"} size={17} />
                  {showDrugLevel ? "Xem theo đơn thuốc" : "Xem chi tiết theo thuốc"}
                </button>
              )}
            </div>

            <div className="interaction-result__graph-meta">
              {graphGroups.length > 0 && (
                <div className="tt-graph-legend" aria-label="Chú thích đơn thuốc">
                  {graphGroups.map((group) => (
                    <span key={group.id}>
                      <i className="tt-graph-legend__dot" style={{ background: group.color }} />
                      {group.label}
                    </span>
                  ))}
                </div>
              )}
              <SeverityCountStrip edges={productEdges} selectedSeverity={selectedSeverity} onSelect={setSelectedSeverity} />
            </div>

            <InteractionGraphView nodes={nodes} edges={edges} groups={graphGroups} ariaLabel={title} showLegend={false} />

            {result.overview && (
              <div ref={graphSummaryRef} className="interaction-overview__summary">
                <p className="eyebrow">TÓM TẮT TỔNG QUAN</p>
                <p>{renderOverviewText(result.overview.giai_thich, result.overview.nhan_manh, resolveHighlightEdgeId)}</p>
                {/* 1-3 câu liệt kê cố định (không qua LLM) thực phẩm cần tránh/bệnh nền cần
                    thận trọng/mời trao đổi dược sĩ - mỗi câu 1 đoạn riêng, xem
                    build_food_disease_warning_line. */}
                {result.canh_bao_thuc_pham_benh_nen?.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
          </section>

          <div
            className="interaction-result__divider"
            role="separator"
            aria-label="Thay đổi độ rộng giữa đồ thị và phần phân tích"
            aria-orientation="vertical"
            aria-valuemin={MIN_GRAPH_PANE_PERCENT}
            aria-valuemax={MAX_GRAPH_PANE_PERCENT}
            aria-valuenow={Math.round(graphPanePercent)}
            tabIndex={0}
            title="Kéo sang trái hoặc phải để thay đổi độ rộng"
            onPointerDown={startSplitDrag}
            onPointerMove={moveSplitDrag}
            onPointerUp={stopSplitDrag}
            onPointerCancel={stopSplitDrag}
            onDoubleClick={() => setGraphPanePercent(DEFAULT_GRAPH_PANE_PERCENT)}
            onKeyDown={resizeSplitWithKeyboard}
          />

          <section
            className={`interaction-result__pane interaction-result__pane--analysis panel${reviewActionAvailable ? "" : " interaction-result__pane--analysis-no-mobile-actions"}`}
            aria-label="Phân tích kết quả tương tác"
          >
            <div className="interaction-result__header interaction-result__header--analysis">
              <div>
                <p className="eyebrow">PHÂN TÍCH KẾT QUẢ</p>
                <h2 className="section-heading-icon"><MaterialIcon name="clinical_notes" size={21} />Vì sao hệ thống cảnh báo?</h2>
                <p className="interaction-result__subtitle">
                  {audience === "pharmacist"
                    ? "Đối chiếu diễn giải chuyên môn và nguồn dữ liệu cho từng tương tác."
                    : "Xem diễn giải tổng quan và lưu ý an toàn cho từng tương tác."}
                </p>
              </div>
            </div>

            <div className="interaction-result__analysis-scroll">
              {totalDetailCount > 0 && (
                <InteractionDetailTabs
                  drugPairItems={pairItems}
                  foodItems={visibleFoodItems}
                  diseaseItems={visibleDiseaseItems}
                  audience={audience}
                />
              )}
              {totalDetailCount === 0 && allNodes.length > 0 && (
                <div className="interaction-alert interaction-alert--empty"><MaterialIcon name="info" size={20} /><span>Không tìm thấy tương tác nào trong cơ sở dữ liệu cho lựa chọn hiện tại.</span></div>
              )}
            </div>

            {(reviewActionAvailable || aiSummaryActionAvailable) && (
              <div
                className={`interaction-result__analysis-actions${reviewActionAvailable ? "" : " interaction-result__analysis-actions--summary-only"}`}
                aria-label="Thao tác với kết quả phân tích"
              >
                {reviewActionAvailable && (
                  <button
                    type="button"
                    className="interaction-result__analysis-action interaction-result__analysis-action--secondary"
                    onClick={openPharmacistReview}
                  >
                    <MaterialIcon name="local_pharmacy" size={18} />
                    Nhờ dược sĩ xác nhận
                  </button>
                )}
                {aiSummaryActionAvailable && (
                  <button
                    type="button"
                    className="interaction-result__analysis-action interaction-result__analysis-action--primary"
                    onClick={scrollToGraphSummary}
                  >
                    <MaterialIcon name="auto_awesome" size={18} />
                    AI tóm tắt
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </section>

      {reviewPromptAvailable && (
        <section id="pharmacist-review-list" className="pharmacist-review-section pharmacist-review-section--below-result">
          {session && result.interaction_check_id ? (
            <PharmacistReviewPrompt
              ref={pharmacistReviewRef}
              checkId={result.interaction_check_id}
              token={session.accessToken}
              patientId={session.userId}
              personalized={result.is_personalized === true}
              onListVisible={scrollToPharmacistReview}
              hideCollapsed
            />
          ) : (
            <div className="pharmacist-login-required">
              <div>
                <strong>Đăng nhập để gửi yêu cầu cho dược sĩ</strong>
                <p>Bạn cần đăng nhập để lưu kết quả và nhờ dược sĩ xem xét, dù kết quả có hoặc không có tương tác.</p>
              </div>
              <Link href="/auth" className="pharmacist-login-required__action">Đăng nhập</Link>
            </div>
          )}
        </section>
      )}
    </>
  );
}
