import type { InteractionExplanation, Severity } from "@/lib/api";

// Cạnh giữa 2 THUỐC = mức độ nghiêm trọng cao nhất trong các cặp HOẠT CHẤT của
// 2 thuốc đó (rollup). "pairs" giữ lại toàn bộ cặp hoạt chất góp phần vào cạnh
// này, sắp xếp nặng nhất trước, để hiển thị khi bấm xem chi tiết.
export type ProductEdge = {
  productA: string;
  productB: string;
  muc_do?: Severity;
  // true nếu còn ít nhất 1 cặp hoạt chất chưa có dữ liệu/chưa phân loại, dù cạnh
  // đã có màu theo mức nặng nhất đã biết - tránh chủ quan khi rollup che khuất nó.
  hasIncompletePair: boolean;
  pairs: InteractionExplanation[];
};

// Cạnh giữa 2 ĐƠN THUỐC = mức độ nghiêm trọng cao nhất trong các cạnh cấp-thuốc
// giữa 2 đơn đó. "productEdges" giữ toàn bộ cạnh thuốc góp phần, nặng nhất trước.
export type PrescriptionEdge = {
  prescriptionAIndex: number;
  prescriptionBIndex: number;
  muc_do?: Severity;
  hasIncompletePair: boolean;
  productEdges: ProductEdge[];
};

export type GraphGroup = { id: string; label: string; color: string };

// Bảng màu nền node cố định, chủ ý khác biệt hoàn toàn với 4 màu severity dùng cho
// cạnh (đỏ #c94740 / hổ phách #c58a32 / xanh lá #5d9b78 / xám #8d98a4), để không
// nhầm lẫn "màu nhóm" với "màu mức độ tương tác" khi cả hai cùng xuất hiện trên đồ thị.
export const NODE_FILL_PALETTE = ["#4f7cc9", "#8b5fbf", "#2f9e8f", "#c9578a", "#5b5fc7", "#b8763f"];

const SEVERITY_RANK: Record<string, number> = { nang: 3, trung_binh: 2, nhe: 1, chua_phan_loai: 0 };

function severityRank(muc_do?: Severity): number {
  return muc_do ? (SEVERITY_RANK[muc_do] ?? -1) : -1;
}

function edgeKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("::");
}

// Dựng lại danh sách tên thuốc duy nhất từ 1 lần tra cứu ĐÃ LƯU (lịch sử) - nơi
// không còn giữ thông tin đơn thuốc gốc, chỉ có san_pham_a/b (hoặc thuoc_a/b dự
// phòng) trong từng cặp giải thích. Dùng để dựng 1 "đơn thuốc" tổng hợp duy nhất
// khi xem lại chi tiết ở trang lịch sử.
export function productNamesFromExplanations(explanations: InteractionExplanation[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const exp of explanations) {
    const prods = [
      ...(exp.san_pham_a?.length ? exp.san_pham_a : exp.thuoc_a ? [exp.thuoc_a] : []),
      ...(exp.san_pham_b?.length ? exp.san_pham_b : exp.thuoc_b ? [exp.thuoc_b] : []),
    ];
    for (const p of prods) {
      const key = p.toLowerCase();
      if (!seen.has(key)) { seen.add(key); names.push(p); }
    }
  }
  return names;
}

// Loại hẳn các cặp KHÔNG CÓ DỮ LIỆU trong CSDL tương tác (không vẽ, không nhắc tới).
// Khác với "chua_phan_loai" (có dữ liệu, chỉ là chưa rõ mức độ) - cặp đó vẫn giữ lại,
// nhận biết bằng việc backend luôn set muc_do="chua_phan_loai" tường minh cho nó,
// trong khi cặp không có dữ liệu hoàn toàn không có field muc_do.
export function withDataOnly(explanations: InteractionExplanation[]): InteractionExplanation[] {
  return explanations.filter((e) => e.muc_do !== undefined);
}

// products: tên thuốc đang chọn trên UI (thứ tự hiển thị node).
// explanations: danh sách cặp hoạt chất trả về từ API (đã enrich san_pham_a/b ở backend).
export function buildProductGraph(products: string[], explanations: InteractionExplanation[]): ProductEdge[] {
  const edges = new Map<string, ProductEdge>();

  for (const exp of explanations) {
    const prodsA = exp.san_pham_a?.length ? exp.san_pham_a : exp.thuoc_a ? [exp.thuoc_a] : [];
    const prodsB = exp.san_pham_b?.length ? exp.san_pham_b : exp.thuoc_b ? [exp.thuoc_b] : [];
    const incomplete = !exp.muc_do || exp.muc_do === "chua_phan_loai";

    for (const productA of prodsA) {
      for (const productB of prodsB) {
        if (productA.toLowerCase() === productB.toLowerCase()) continue; // cùng 1 thuốc phối hợp - không tính là cạnh
        const key = edgeKey(productA, productB);
        const existing = edges.get(key);
        if (!existing) {
          edges.set(key, { productA, productB, muc_do: exp.muc_do, hasIncompletePair: incomplete, pairs: [exp] });
          continue;
        }
        existing.pairs.push(exp);
        existing.hasIncompletePair = existing.hasIncompletePair || incomplete;
        if (severityRank(exp.muc_do) > severityRank(existing.muc_do)) existing.muc_do = exp.muc_do;
      }
    }
  }

  for (const edge of edges.values()) edge.pairs.sort((a, b) => severityRank(b.muc_do) - severityRank(a.muc_do));

  // Giữ thứ tự node ổn định theo danh sách products đầu vào cho cả 2 đầu cạnh.
  const order = new Map(products.map((name, index) => [name.toLowerCase(), index]));
  return [...edges.values()].sort((a, b) => (order.get(a.productA.toLowerCase()) ?? 0) - (order.get(b.productA.toLowerCase()) ?? 0));
}

// nguon_trich_dan gốc từ DDInter dùng 2 định dạng khác nhau tùy loại tương tác:
// - Thuốc-thuốc (References_info): đánh số nối bằng dấu phẩy, dạng
//   `[1] "..." Nhà XB, Nơi XB., [2] "..." Tạp chí (năm): trang, ...` - tách tại vị
//   trí NGAY TRƯỚC mỗi "[so]" (chỉ số thuần, không khớp nhầm mốc thời gian kiểu
//   "[2011 Aug 24]" lồng bên trong 1 mục vì đó không phải index]) rồi bỏ số thứ tự
//   gốc + dấu phẩy thừa cuối mục.
// - Thuốc-thực phẩm/thuốc-bệnh nền (DFI/DDSI): không đánh số, nối bằng "|". Không
//   có dấu hiệu nào thì coi cả chuỗi là 1 mục duy nhất (vd chỉ 1 tài liệu).
function parseReferenceEntries(raw: string): string[] {
  if (/\[\d+\]/.test(raw)) {
    return raw
      .split(/(?=\[\d+\])/)
      .map((entry) => entry.replace(/^\[\d+\]\s*/, "").replace(/,\s*$/, "").trim())
      .filter(Boolean);
  }
  return raw.split("|").map((entry) => entry.trim()).filter(Boolean);
}

// Trích dẫn thật cho popover "Nguồn trích dẫn" ở AlertCard: lấy vài mục tài liệu
// tham khảo gốc (không phải toàn bộ, DDInter có thể liệt kê hàng chục mục) từ MỖI
// cặp hoạt chất góp phần vào cạnh thuốc-thuốc này, bỏ trùng (DDInter hay dùng chung
// 1 tài liệu cho nhiều cặp), rồi đánh số lại liền mạch 1..N thay vì giữ số gốc rời
// rạc (vd chỉ còn mục [8], [9] sau khi cắt bớt sẽ trông sai lệch nếu giữ nguyên số).
// Nhận kiểu tối giản { nguon_trich_dan } thay vì chỉ InteractionExplanation - dùng
// được luôn cho FoodInteractionExplanation/DiseaseInteractionExplanation (mỗi thẻ
// chỉ có đúng 1 "cặp" nên gọi buildCitationReferences([item])).
export function buildCitationReferences(pairs: { nguon_trich_dan?: string }[], maxTotal = 5): string[] {
  const perPair = pairs.length <= 2 ? 3 : 2;
  const seen = new Set<string>();
  const references: string[] = [];
  for (const pair of pairs) {
    if (!pair.nguon_trich_dan || references.length >= maxTotal) continue;
    for (const entry of parseReferenceEntries(pair.nguon_trich_dan).slice(0, perPair)) {
      const key = entry.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      references.push(entry);
      if (references.length >= maxTotal) break;
    }
  }
  return references;
}

// Gộp ProductEdge[] (đã tính trên toàn bộ danh sách thuốc gộp từ mọi đơn) lên cấp
// đơn thuốc. Với mỗi cạnh thuốc, xét MỌI cặp chỉ số đơn (rxA, rxB) mà 2 đầu cạnh
// thuộc về - vì origins không đảm bảo mỗi thuốc chỉ thuộc đúng 1 đơn.
export function buildPrescriptionGraph(productEdges: ProductEdge[], origins: Map<string, Set<number>>): PrescriptionEdge[] {
  const edges = new Map<string, PrescriptionEdge>();

  for (const pe of productEdges) {
    const setA = origins.get(pe.productA.toLowerCase());
    const setB = origins.get(pe.productB.toLowerCase());
    if (!setA || !setB) continue;
    for (const rxA of setA) {
      for (const rxB of setB) {
        if (rxA === rxB) continue; // bỏ qua tương tác trong cùng 1 đơn
        const i = Math.min(rxA, rxB);
        const j = Math.max(rxA, rxB);
        const key = `${i}::${j}`;
        const existing = edges.get(key);
        if (!existing) {
          edges.set(key, { prescriptionAIndex: i, prescriptionBIndex: j, muc_do: pe.muc_do, hasIncompletePair: pe.hasIncompletePair, productEdges: [pe] });
          continue;
        }
        if (!existing.productEdges.includes(pe)) existing.productEdges.push(pe);
        existing.hasIncompletePair = existing.hasIncompletePair || pe.hasIncompletePair;
        if (severityRank(pe.muc_do) > severityRank(existing.muc_do)) existing.muc_do = pe.muc_do;
      }
    }
  }

  for (const edge of edges.values()) edge.productEdges.sort((a, b) => severityRank(b.muc_do) - severityRank(a.muc_do));
  return [...edges.values()].sort((a, b) => a.prescriptionAIndex - b.prescriptionAIndex || a.prescriptionBIndex - b.prescriptionBIndex);
}

// Gán màu nền cố định cho từng nhóm theo palette, giữ nguyên nhãn truyền vào. Khi
// chỉ có 0-1 nhóm (không cần phân biệt màu, ví dụ chỉ 1 đơn thuốc), trả về mảng
// rỗng để caller ẩn hẳn phần chú thích màu.
export function assignGroupColors(groups: { id: string; label: string }[]): GraphGroup[] {
  if (groups.length <= 1) return [];
  return groups.map((g, index) => ({ ...g, color: NODE_FILL_PALETTE[index % NODE_FILL_PALETTE.length] }));
}

// Xoay cả vòng tròn layout 15° ngược chiều kim đồng hồ so với mặc định (node đầu
// tiên đúng đỉnh 12h) - thuần thẩm mỹ, không ảnh hưởng cạnh/node nào. Trừ (không
// cộng) vào góc vì trục y của SVG hướng xuống nên góc tăng dần vốn xoay THEO chiều
// kim đồng hồ - trừ đi mới xoay NGƯỢC chiều kim đồng hồ trên màn hình.
const LAYOUT_ROTATION_RAD = (-15 * Math.PI) / 180;

// Vị trí node trên vòng tròn bán kính r quanh tâm (cx, cy), viewBox 0..100.
export function circleLayout(count: number, cx = 50, cy = 50, r = 38): [number, number][] {
  if (count <= 1) return [[cx, cy]];
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2 + LAYOUT_ROTATION_RAD;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}
