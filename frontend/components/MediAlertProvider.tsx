"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import MediFox from "@/components/MediFox";

type AlertTone = "info" | "danger";
type AlertOptions = { title: string; message: string; confirmLabel?: string; tone?: AlertTone };
type ConfirmOptions = AlertOptions & { cancelLabel?: string };
type ToastOptions = { title: string; message?: string; tone?: "success" | "info" };
type AlertContextValue = {
  notify: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (options: ToastOptions) => void;
};
type DialogState = ConfirmOptions & { isConfirm: boolean; resolve: (confirmed: boolean) => void };

const MediAlertContext = createContext<AlertContextValue | null>(null);

export function useMediAlert() {
  const context = useContext(MediAlertContext);
  if (!context) throw new Error("useMediAlert must be used within MediAlertProvider");
  return context;
}

export default function MediAlertProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toastMessage, setToastMessage] = useState<(ToastOptions & { id: number }) | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  function open(options: ConfirmOptions, isConfirm: boolean) {
    return new Promise<boolean>((resolve) => setDialog({ ...options, isConfirm, resolve }));
  }
  function close(confirmed: boolean) {
    if (!dialog) return;
    dialog.resolve(confirmed);
    setDialog(null);
  }

  const value: AlertContextValue = {
    confirm: (options) => open(options, true),
    notify: async (options) => { await open(options, false); },
    toast: (options) => setToastMessage({ ...options, id: Date.now() }),
  };

  return (
    <MediAlertContext.Provider value={value}>
      {children}
      {dialog && (
        <div className="medi-alert-backdrop" role="presentation" onMouseDown={() => close(false)}>
          <section
            className={`medi-alert medi-alert--${dialog.tone ?? "info"}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="medi-alert-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <MediFox variant={dialog.tone === "danger" ? "alert" : "welcome"} className="medi-alert__fox" />
            <div className="medi-alert__content">
              <span className="medi-alert__eyebrow"><MaterialIcon name={dialog.tone === "danger" ? "warning" : "info"} size={16} /> MEDICHECK THÔNG BÁO</span>
              <h2 id="medi-alert-title">{dialog.title}</h2>
              <p>{dialog.message}</p>
              <div className="medi-alert__actions">
                {dialog.isConfirm && <button type="button" className="medi-alert__cancel" onClick={() => close(false)}>{dialog.cancelLabel ?? "Quay lại"}</button>}
                <button type="button" className="medi-alert__confirm" onClick={() => close(true)}>{dialog.confirmLabel ?? "Đã hiểu"}</button>
              </div>
            </div>
          </section>
        </div>
      )}
      {toastMessage && (
        <aside key={toastMessage.id} className={`medi-toast medi-toast--${toastMessage.tone ?? "success"}`} role="status" aria-live="polite">
          <MaterialIcon name={toastMessage.tone === "info" ? "info" : "check_circle"} size={21} />
          <div>
            <strong>{toastMessage.title}</strong>
            {toastMessage.message && <p>{toastMessage.message}</p>}
          </div>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setToastMessage(null)}><MaterialIcon name="close" size={18} /></button>
        </aside>
      )}
    </MediAlertContext.Provider>
  );
}
