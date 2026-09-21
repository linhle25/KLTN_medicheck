import type { PrescriptionCheckInput } from "@/lib/api";

export type SelectedDrug = { name: string; known: boolean };

export type Prescription = { id: string; label: string; drugs: SelectedDrug[] };

export function createPrescription(index: number): Prescription {
  return { id: `rx-${Date.now()}-${index}`, label: `Đơn thuốc ${index}`, drugs: [] };
}


// Gộp các đơn ĐÃ LƯU trong hồ sơ vào bàn cân hiện tại theo nhãn (label): đơn trên
// bàn cân đã có nhãn trùng thì cộng dồn thêm thuốc mới (bỏ trùng) vào panel đó,
// nhãn chưa từng xuất hiện thì thêm panel mới - để import nhiều lần liên tiếp (VD
// lưu thêm 1 đơn mới rồi bấm "Kiểm tra tương tác" lại) nối tiếp nhau thay vì ghi
// đè mất các đơn/thuốc đã có sẵn trên bàn cân từ lần import hoặc chỉnh sửa trước đó.
export function mergeSavedIntoPrescriptions(
  current: Prescription[],
  saved: { id: string; label: string; medications: { ten_thuoc: string }[] }[]
): Prescription[] {
  const next = current.map((p) => ({ ...p, drugs: [...p.drugs] }));
  saved.forEach((source, index) => {
    const newDrugs = source.medications.map((m) => ({ name: m.ten_thuoc, known: true }));
    const target = next.find((p) => p.label === source.label);
    if (target) {
      const existing = new Set(target.drugs.map((d) => d.name.toLowerCase()));
      target.drugs.push(...newDrugs.filter((d) => !existing.has(d.name.toLowerCase())));
    } else {
      next.push({ id: `rx-${Date.now()}-${index}`, label: source.label, drugs: newDrugs });
    }
  });
  return next;
}

// Bỏ các đơn rỗng rồi quy đổi sang payload gửi lên /products/check - đơn thuốc rỗng
// không có ý nghĩa để backend tính cạnh cấp đơn, và schema yêu cầu mỗi đơn có ít
// nhất 1 thuốc. Dùng CHÍNH danh sách đã lọc này (không phải `prescriptions` gốc) để
// dựng đồ thị phía frontend, để chỉ số đơn khớp với don_a_index/don_b_index backend trả về.
export function nonEmptyPrescriptions(prescriptions: Prescription[]): Prescription[] {
  return prescriptions.filter((p) => p.drugs.length > 0);
}

export function toPrescriptionCheckInput(prescriptions: Prescription[]): PrescriptionCheckInput[] {
  return nonEmptyPrescriptions(prescriptions).map((p) => ({
    label: p.label,
    products: p.drugs.map((d) => d.name),
  }));
}

// Danh sách tên thuốc duy nhất (không phân biệt hoa thường), gộp từ mọi đơn thuốc, theo thứ tự xuất hiện.
export function mergedDrugNames(prescriptions: Prescription[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const prescription of prescriptions) {
    for (const drug of prescription.drugs) {
      const key = drug.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        names.push(drug.name);
      }
    }
  }
  return names;
}

// Với mỗi tên thuốc (chữ thường), tập chỉ số các đơn thuốc có chứa thuốc đó.
export function drugOrigins(prescriptions: Prescription[]): Map<string, Set<number>> {
  const origins = new Map<string, Set<number>>();
  prescriptions.forEach((prescription, index) => {
    for (const drug of prescription.drugs) {
      const key = drug.name.toLowerCase();
      if (!origins.has(key)) origins.set(key, new Set());
      origins.get(key)!.add(index);
    }
  });
  return origins;
}

// Chỉ số đơn ĐẦU TIÊN (nhỏ nhất) chứa thuốc này - dùng để gán màu nhóm cho node cấp
// thuốc trên đồ thị nhiều đơn (mỗi đơn 1 màu cố định, xem assignGroupColors trong
// interactionGraph.ts). 1 thuốc hiếm khi thuộc nhiều đơn cùng lúc, nhưng nếu có thì
// quy ước tô theo đơn có chỉ số nhỏ nhất để nhất quán giữa các lần render.
export function firstPrescriptionIndex(origins: Map<string, Set<number>>, drugName: string): number {
  const set = origins.get(drugName.toLowerCase());
  if (!set || set.size === 0) return 0;
  return Math.min(...set);
}

// Một cặp tương tác được coi là "giữa các đơn" trừ khi cả hai thuốc chỉ xuất hiện, và cùng xuất hiện, trong đúng 1 đơn thuốc.
export function isCrossPrescription(origins: Map<string, Set<number>>, nameA?: string, nameB?: string): boolean {
  if (!nameA || !nameB) return false;
  const setA = origins.get(nameA.toLowerCase());
  const setB = origins.get(nameB.toLowerCase());
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return false;
  if (setA.size === 1 && setB.size === 1 && [...setA][0] === [...setB][0]) return false;
  return true;
}

// Nhãn hiển thị nguồn gốc đơn thuốc cho 1 cặp tương tác, ví dụ "Đơn thuốc 1 × Đơn thuốc 2" hoặc "Trong Đơn thuốc 1".
export function originLabel(prescriptions: Prescription[], origins: Map<string, Set<number>>, nameA?: string, nameB?: string): string | null {
  if (!nameA || !nameB) return null;
  const setA = origins.get(nameA.toLowerCase());
  const setB = origins.get(nameB.toLowerCase());
  if (!setA || !setB) return null;
  const combined = [...new Set([...setA, ...setB])].sort((a, b) => a - b);
  if (combined.length === 0) return null;
  const labels = combined.map((index) => prescriptions[index]?.label ?? `Đơn thuốc ${index + 1}`);
  return combined.length === 1 ? `Trong ${labels[0]}` : labels.join(" × ");
}
