"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useRef } from "react";

type InteractivePillProps = {
  src: ImageProps["src"];
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  maxTilt?: number;
  followDistance?: number;
};

type Motion = {
  rotateX: number;
  rotateY: number;
  translateX: number;
  translateY: number;
  shadowX: number;
  shadowY: number;
  brightness: number;
};

const restingMotion: Motion = {
  rotateX: 0,
  rotateY: 0,
  translateX: 0,
  translateY: 0,
  shadowX: 0,
  shadowY: 22,
  brightness: 1,
};

export default function InteractivePill({
  src,
  alt,
  className = "",
  sizes = "100vw",
  priority = false,
  maxTilt = 18,
  followDistance = 10,
}: InteractivePillProps) {
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const pillElement = pillRef.current;
    if (!pillElement) return;
    const activePill: HTMLSpanElement = pillElement;
    const interactionArea = activePill.parentElement;
    if (!interactionArea) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const current = { ...restingMotion };
    const target = { ...restingMotion };
    let frame: number | null = null;

    function paint() {
      const easing = 0.12;
      let moving = false;

      (Object.keys(current) as (keyof Motion)[]).forEach((key) => {
        const delta = target[key] - current[key];
        current[key] += delta * easing;
        if (Math.abs(delta) > 0.01) moving = true;
      });

      activePill.style.setProperty("--pill-rotate-x", `${current.rotateX}deg`);
      activePill.style.setProperty("--pill-rotate-y", `${current.rotateY}deg`);
      activePill.style.setProperty("--pill-follow-x", `${current.translateX}px`);
      activePill.style.setProperty("--pill-follow-y", `${current.translateY}px`);
      activePill.style.setProperty("--pill-shadow-x", `${current.shadowX}px`);
      activePill.style.setProperty("--pill-shadow-y", `${current.shadowY}px`);
      activePill.style.setProperty("--pill-brightness", `${current.brightness}`);

      frame = moving ? window.requestAnimationFrame(paint) : null;
    }

    function requestPaint() {
      if (frame === null) frame = window.requestAnimationFrame(paint);
    }

    function reset() {
      Object.assign(target, restingMotion);
      activePill.removeAttribute("data-active");
      requestPaint();
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!finePointer.matches || reducedMotion.matches) return;

      const bounds = activePill.getBoundingClientRect();
      const normalizedX = Math.max(
        -1,
        Math.min(1, (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2)),
      );
      const normalizedY = Math.max(
        -1,
        Math.min(1, (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2)),
      );

      target.rotateX = normalizedY * -maxTilt;
      target.rotateY = normalizedX * maxTilt;
      target.translateX = normalizedX * followDistance;
      target.translateY = normalizedY * followDistance * 0.65;
      target.shadowX = normalizedX * -14;
      target.shadowY = 22 + normalizedY * 8;
      target.brightness = 1 + normalizedY * -0.035;
      activePill.dataset.active = "true";
      requestPaint();
    }

    interactionArea.addEventListener("pointermove", handlePointerMove);
    interactionArea.addEventListener("pointerleave", reset);
    finePointer.addEventListener("change", reset);
    reducedMotion.addEventListener("change", reset);

    return () => {
      interactionArea.removeEventListener("pointermove", handlePointerMove);
      interactionArea.removeEventListener("pointerleave", reset);
      finePointer.removeEventListener("change", reset);
      reducedMotion.removeEventListener("change", reset);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [followDistance, maxTilt]);

  return (
    <span ref={pillRef} className={`interactive-pill ${className}`}>
      <span className="interactive-pill__visual">
        <Image
          className="interactive-pill__image"
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          draggable={false}
        />
      </span>
      <style jsx>{`
        .interactive-pill {
          --pill-rotate-x: 0deg;
          --pill-rotate-y: 0deg;
          --pill-follow-x: 0px;
          --pill-follow-y: 0px;
          --pill-shadow-x: 0px;
          --pill-shadow-y: 22px;
          --pill-brightness: 1;
          position: absolute;
          display: block;
          pointer-events: none;
          transform-style: preserve-3d;
        }
        .interactive-pill__visual {
          position: absolute;
          inset: 0;
          transform: translate3d(
              var(--pill-follow-x),
              var(--pill-follow-y),
              0
            )
            rotateX(var(--pill-rotate-x)) rotateY(var(--pill-rotate-y));
          transform-style: preserve-3d;
          transform-origin: 62% 50%;
          will-change: transform;
        }
        .interactive-pill__visual :global(.interactive-pill__image) {
          object-fit: contain;
          user-select: none;
          filter: brightness(var(--pill-brightness))
            drop-shadow(
              var(--pill-shadow-x) var(--pill-shadow-y) 28px
                rgba(49, 82, 132, 0.24)
            );
          transition: filter 180ms ease;
        }
        .interactive-pill[data-active="true"]
          .interactive-pill__visual
          :global(.interactive-pill__image) {
          filter: brightness(var(--pill-brightness))
            drop-shadow(
              var(--pill-shadow-x) var(--pill-shadow-y) 34px
                rgba(49, 82, 132, 0.34)
            );
        }
        @media (prefers-reduced-motion: reduce), (hover: none), (pointer: coarse) {
          .interactive-pill__visual {
            transform: none;
          }
          .interactive-pill__visual :global(.interactive-pill__image) {
            filter: drop-shadow(0 18px 24px rgba(49, 82, 132, 0.18));
            transition: none;
          }
        }
      `}</style>
    </span>
  );
}
