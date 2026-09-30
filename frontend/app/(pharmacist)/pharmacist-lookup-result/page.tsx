"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Disclaimer from "@/components/Disclaimer";
import MaterialIcon from "@/components/MaterialIcon";
import InteractionOverview from "@/components/graph/InteractionOverview";
import { ApiError, getPharmacistLookupDetail, type MedicationCheckResponse } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { productNamesFromExplanations } from "@/lib/interactionGraph";
import type { Prescription } from "@/lib/prescription";

function PharmacistLookupResultContent() {
  const router = useRouter();
  const lookupId = useSearchParams().get("lookupId");
  const session = getSession();
  const [result, setResult] = useState<MedicationCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !lookupId) {
      setError("Không có lượt tra cứu để hiển thị.");
      setLoading(false);
      return;
    }
    getPharmacistLookupDetail(lookupId, session.accessToken)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được kết quả"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupId]);

  // Cùng logic dựng lại "bàn cân" nhiều đơn như check-result (trang lịch sử của
  // bệnh nhân) - xem comment ở đó.
  const prescriptions: Prescription[] = useMemo(() => {
    if (!result) return [];
    if (result.prescriptions?.length) {
      return result.prescriptions.map((p, i) => ({
        id: `pharmacist-lookup-${i}`,
        label: p.label,
        drugs: p.products.map((name) => ({ name, known: true })),
      }));
    }
    const names = result.checked_products?.length
      ? result.checked_products
      : productNamesFromExplanations(result.explanations);
    return [{ id: "pharmacist-lookup", label: "Thuốc đã tra cứu", drugs: names.map((name) => ({ name, known: true })) }];
  }, [result]);

  if (!session) return null;
  return (
    <main className="check-result-page">
      <div className="page-header page-header--in-content">
        <button className="page-header__back" onClick={() => router.push("/pharmacist-history")} aria-label="Quay lại">
          <MaterialIcon name="arrow_back" size={22} />
        </button>
        <div>
          <p className="eyebrow">SỔ TAY DƯỢC SĨ</p>
          <h1 className="page-header__title">Chi tiết lượt tra cứu</h1>
        </div>
      </div>
      {loading && (
        <div className="loading-row">
          <span className="spinner" /> Đang tải kết quả...
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!loading && result && (
        <InteractionOverview result={result} prescriptions={prescriptions} session={session} audience="pharmacist" />
      )}
      <Disclaimer />
      <button className="secondary btn-block" onClick={() => router.push("/pharmacist-history")}>
        <MaterialIcon name="arrow_back" size={20} /> Về lịch sử tra cứu
      </button>
    </main>
  );
}

export default function PharmacistLookupResultPage() {
  return (
    <Suspense
      fallback={
        <main>
          <div className="loading-row">
            <span className="spinner" /> Đang tải...
          </div>
        </main>
      }
    >
      <PharmacistLookupResultContent />
    </Suspense>
  );
}
