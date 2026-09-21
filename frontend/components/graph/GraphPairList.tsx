import AlertCard from "@/components/AlertCard";
import MaterialIcon from "@/components/MaterialIcon";
import type { Severity } from "@/lib/api";

export type GraphPairItem = {
  id: string;
  // Vắng mặt (undefined) chỉ ở thẻ gộp "chưa phân loại" (xem mergedPairIds) - thẻ
  // đó gộp nhiều cặp thuốc khác nhau nên không còn đúng 1 cặp thuốc A/B cụ thể.
  thuocA?: string;
  thuocB?: string;
  severity?: Severity;
  description: string;
  source: string;
  // Vài mục tài liệu tham khảo gốc cho popover "Nguồn trích dẫn" (xem
  // buildCitationReferences) - có cho cả bệnh nhân lẫn dược sĩ.
  references?: string[];
  hasIncompletePair?: boolean;
  // Gợi ý xử trí dành cho dược sĩ (xu_tri) - chỉ có khi xem qua luồng dược sĩ,
  // backend đã tự ẩn field này với bệnh nhân nên phía trên luôn là undefined.
  management?: string;
  // Mô tả khoa học nguyên văn từ CSDL (mo_ta) - cũng chỉ dược sĩ mới thấy.
  scientificDescription?: string;
  // Chỉ có ở thẻ gộp "chưa phân loại" (xem InteractionOverview) - id gốc của
  // từng cặp đã bị gộp vào thẻ này, để bấm 1 cạnh "chưa phân loại" trên đồ thị
  // vẫn cuộn đúng tới thẻ gộp (scrollToPairCard tìm theo id gốc của cạnh).
  mergedPairIds?: string[];
};

type GraphPairListProps = {
  items: GraphPairItem[];
  onViewDetail?: (id: string) => void;
};

export default function GraphPairList({ items, onViewDetail }: GraphPairListProps) {
  return (
    <div className="interaction-pairs">
      {items.map((item) => (
        <div className={`interaction-pair-card ${onViewDetail ? "interaction-pair-card--with-actions" : ""}`} id={`interaction-pair-${item.id}`} key={item.id}>
          {item.mergedPairIds?.map((id) => <span key={id} id={`interaction-pair-${id}`} />)}
          {onViewDetail && (
            <div className="tt-graph-pair__actions">
              <button type="button" className="tt-graph-pair__detail" onClick={() => onViewDetail(item.id)}>
                <MaterialIcon name="visibility" size={16} /> Xem chi tiết
              </button>
            </div>
          )}
          <AlertCard
            thuocA={item.thuocA} thuocB={item.thuocB} severity={item.severity} description={item.description} source={item.source}
            management={item.management} scientificDescription={item.scientificDescription} references={item.references}
          />
          {item.hasIncompletePair && (
            <p className="tt-graph-pair__notice"><MaterialIcon name="info" size={15} /> Còn cặp chưa được phân loại mức độ trong nhóm này.</p>
          )}
        </div>
      ))}
    </div>
  );
}
