"use client";

import { useMemo, useState } from "react";
import AlertCard from "@/components/AlertCard";
import type { DiseaseInteractionExplanation, FoodInteractionExplanation, Severity } from "@/lib/api";
import { buildCitationReferences } from "@/lib/interactionGraph";
import GraphPairList, { type GraphPairItem } from "./GraphPairList";

type DetailTab = "drug" | "food" | "disease";

// Nặng -> trung bình -> nhẹ -> chưa phân loại, giống hệt thứ tự thẻ tương tác
// thuốc-thuốc (xem InteractionOverview.tsx).
const SEVERITY_ORDER: Record<Severity, number> = { nang: 3, trung_binh: 2, nhe: 1, chua_phan_loai: 0 };
function bySeverityDesc<T extends { muc_do?: Severity }>(items: T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[b.muc_do ?? "chua_phan_loai"] - SEVERITY_ORDER[a.muc_do ?? "chua_phan_loai"]);
}

type InteractionDetailTabsProps = {
  drugPairItems: GraphPairItem[];
  foodItems: FoodInteractionExplanation[];
  diseaseItems: DiseaseInteractionExplanation[];
  // "pharmacist": ưu tiên bản giọng điệu khoa học (giai_thich_duoc_si) cho thẻ
  // thực phẩm/bệnh nền, khớp đúng cách InteractionOverview đang chọn giọng điệu
  // cho thẻ thuốc-thuốc (audience mặc định "patient" ở nơi gọi).
  audience: "patient" | "pharmacist";
};

function pickText(item: { giai_thich: string; giai_thich_duoc_si?: string }, audience: "patient" | "pharmacist"): string {
  return audience === "pharmacist" ? item.giai_thich_duoc_si ?? item.giai_thich : item.giai_thich;
}

// 3 tab xem chi tiết: thuốc-thuốc (GraphPairList có sẵn) / thuốc-thực phẩm / thuốc-bệnh
// nền (2 tab mới, tái dùng thẳng AlertCard - không tạo thẻ riêng vì cùng hình dạng
// "cặp A + B kèm mức độ, mô tả, nguồn" như thẻ thuốc-thuốc). Chỉ hiện tab có dữ liệu;
// tự ẩn cả khối nếu cả 3 đều rỗng.
export default function InteractionDetailTabs({ drugPairItems, foodItems, diseaseItems, audience }: InteractionDetailTabsProps) {
  const tabs: { key: DetailTab; label: string; count: number }[] = [
    { key: "drug", label: "Thuốc - Thuốc", count: drugPairItems.length },
    { key: "food", label: "Thuốc - Thực phẩm", count: foodItems.length },
    { key: "disease", label: "Thuốc - Bệnh nền", count: diseaseItems.length },
  ];
  const availableTabs = tabs.filter((t) => t.count > 0);
  const [active, setActive] = useState<DetailTab | null>(null);

  // useMemo phải gọi TRƯỚC mọi early return (quy tắc Hook) - kể cả khi component
  // sắp return null vì availableTabs rỗng.
  const sortedFoodItems = useMemo(() => bySeverityDesc(foodItems), [foodItems]);
  const sortedDiseaseItems = useMemo(() => bySeverityDesc(diseaseItems), [diseaseItems]);

  if (availableTabs.length === 0) return null;
  const currentTab = active && availableTabs.some((t) => t.key === active) ? active : availableTabs[0].key;

  return (
    <div className="interaction-detail-tabs">
      {availableTabs.length > 1 && (
        <div className="profile-tabs interaction-detail-tabs__nav">
          {availableTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`profile-tabs__item ${currentTab === tab.key ? "profile-tabs__item--active" : ""}`}
              onClick={() => setActive(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {currentTab === "drug" && <GraphPairList items={drugPairItems} />}

      {currentTab === "food" && (
        <div className="interaction-pairs">
          {sortedFoodItems.map((item) => (
            <div className="interaction-pair-card" key={`${item.san_pham.join(",")}::${item.thuc_pham}`}>
              <AlertCard
                thuocA={item.san_pham.join(", ")}
                thuocB={item.thuc_pham}
                severity={item.muc_do}
                description={pickText(item, audience)}
                source={item.nguon_trich_dan}
                references={buildCitationReferences([{ nguon_trich_dan: item.nguon_trich_dan_chi_tiet }])}
                management={item.xu_tri_dich}
                scientificDescription={item.mo_ta_dich}
              />
            </div>
          ))}
        </div>
      )}

      {currentTab === "disease" && (
        <div className="interaction-pairs">
          {sortedDiseaseItems.map((item) => (
            <div className="interaction-pair-card" key={`${item.san_pham.join(",")}::${item.ten_benh}`}>
              <AlertCard
                thuocA={item.san_pham.join(", ")}
                thuocB={item.ten_benh}
                severity={item.muc_do}
                description={pickText(item, audience)}
                source={item.nguon_trich_dan}
                references={buildCitationReferences([{ nguon_trich_dan: item.nguon_trich_dan_chi_tiet }])}
                scientificDescription={item.mo_ta_dich}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
