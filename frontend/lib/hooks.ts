"use client";

import useSWR, { type SWRConfiguration, useSWRConfig } from "swr";
import {
  listPatientPrescriptions,
  listPatientChecks,
  listPatientNotifications,
  type PatientPrescription,
  type InteractionCheckSummary,
  type NotificationItem,
} from "@/lib/api";

// Cache theo key ["patient-...", userId] - SWR giữ cache trong bộ nhớ trình duyệt
// suốt phiên (không mất khi chuyển route trong Next.js App Router, vì layout/JS
// runtime không reload), nên quay lại 1 trang đã tải trước đó hiện NGAY dữ liệu cũ
// trong lúc âm thầm gọi lại API để làm mới - không còn phải chờ y hệt lần đầu mỗi
// khi chuyển tab qua lại. Nhiều nơi dùng CHUNG 1 key (VD dashboard + NotificationBell
// cùng gọi notifications) sẽ tự dedupe, không gọi API trùng lặp.

export function usePatientPrescriptions(
  userId: string | undefined,
  token: string | undefined,
  config?: SWRConfiguration<PatientPrescription[]>
) {
  return useSWR<PatientPrescription[]>(
    userId && token ? ["patient-prescriptions", userId] : null,
    () => listPatientPrescriptions(userId as string, token as string),
    config
  );
}

export function usePatientChecks(
  userId: string | undefined,
  token: string | undefined,
  config?: SWRConfiguration<InteractionCheckSummary[]>
) {
  return useSWR<InteractionCheckSummary[]>(
    userId && token ? ["patient-checks", userId] : null,
    () => listPatientChecks(userId as string, token as string),
    config
  );
}

export function usePatientNotifications(
  userId: string | undefined,
  token: string | undefined,
  config?: SWRConfiguration<NotificationItem[]>
) {
  return useSWR<NotificationItem[]>(
    userId && token ? ["patient-notifications", userId] : null,
    () => listPatientNotifications(userId as string, token as string),
    config
  );
}

export function usePatientCacheMutators(userId: string | undefined) {
  const { mutate } = useSWRConfig();
  return {
    revalidatePrescriptions: () => mutate(["patient-prescriptions", userId]),
    revalidateChecks: () => mutate(["patient-checks", userId]),
    revalidateNotifications: () => mutate(["patient-notifications", userId]),
  };
}
