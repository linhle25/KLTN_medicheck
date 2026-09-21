"use client";

import { useEffect, useState } from "react";

export default function FrontendBootGate() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let revealStarted = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let revealFrame = 0;
    let revealPaintFrame = 0;
    let hideTimer = 0;
    let fontTimer = 0;

    const lockPageBeforeReload = () => {
      document.documentElement.removeAttribute("data-frontend-ready");
    };
    const restoreCachedPage = (event: PageTransitionEvent) => {
      if (event.persisted) {
        document.documentElement.dataset.frontendReady = "true";
      }
    };

    window.addEventListener("beforeunload", lockPageBeforeReload);
    window.addEventListener("pagehide", lockPageBeforeReload);
    window.addEventListener("pageshow", restoreCachedPage);

    const reveal = () => {
      if (cancelled || revealStarted) return;
      revealStarted = true;

      // Make the finished page render behind the still-opaque gate first.
      // Two painted frames prevent a transient unstyled layout from leaking
      // through when the client stylesheet is attached during hydration.
      document.documentElement.dataset.frontendReady = "true";
      revealFrame = window.requestAnimationFrame(() => {
        revealPaintFrame = window.requestAnimationFrame(() => {
          if (cancelled) return;
          setLeaving(true);
          hideTimer = window.setTimeout(() => {
            if (!cancelled) setVisible(false);
          }, 220);
        });
      });
    };

    const layoutReady = new Promise<void>((resolve) => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => resolve());
      });
    });
    const fontReady = document.fonts?.ready ?? Promise.resolve();
    const fontTimeout = new Promise<void>((resolve) => {
      fontTimer = window.setTimeout(resolve, 900);
    });

    Promise.all([layoutReady, Promise.race([fontReady, fontTimeout])]).then(() => {
      reveal();
    });

    const fallback = window.setTimeout(reveal, 1600);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", lockPageBeforeReload);
      window.removeEventListener("pagehide", lockPageBeforeReload);
      window.removeEventListener("pageshow", restoreCachedPage);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(revealFrame);
      window.cancelAnimationFrame(revealPaintFrame);
      window.clearTimeout(fontTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(fallback);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`frontend-boot-gate${leaving ? " frontend-boot-gate--leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="MediCheck đang tải"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f7faff",
        opacity: leaving ? 0 : 1,
        pointerEvents: leaving ? "none" : "auto",
        transition: "opacity 220ms ease",
      }}
    >
      <div
        className="frontend-boot-gate__card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          maxWidth: 440,
          padding: "22px 26px",
          border: "1px solid #d5e1f7",
          borderRadius: 22,
          background: "#ffffff",
          boxShadow: "0 18px 42px rgba(49, 78, 130, 0.14)",
          color: "#1d315c",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <img
          className="frontend-boot-gate__mascot"
          src={encodeURI("/Bộ nhận diện y tế/12-cropped.png")}
          alt=""
          width={82}
          height={70}
          style={{ objectFit: "contain" }}
        />
        <div className="frontend-boot-gate__copy">
          <strong style={{ display: "block", fontSize: 17 }}>Cáo Medi đang chuẩn bị trang cho bạn...</strong>
          <span style={{ display: "block", marginTop: 6, color: "#687b9b", fontSize: 14 }}>Vui lòng chờ trong giây lát.</span>
        </div>
      </div>
    </div>
  );
}
