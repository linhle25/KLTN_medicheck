"use client";

import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";

type Theme = "light" | "dark";
const STORAGE_KEY = "medicheck_theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export default function ThemeModeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const preferred: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const next = saved === "dark" || saved === "light" ? saved : preferred;
    setTheme(next);
    applyTheme(next);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${theme}`}
      onClick={toggleTheme}
      aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"}
      title={theme === "light" ? "Giao diện tối" : "Giao diện sáng"}
    >
      <svg
        className="theme-toggle__day-scene"
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="100" height="50" fill="#6689b3" />

        <circle cx="-8" cy="27" r="82" fill="#6c8fb7" />
        <circle cx="-8" cy="27" r="64" fill="#7395bb" />
        <circle cx="-8" cy="27" r="47" fill="#7b9cc0" />
        <circle cx="-8" cy="27" r="31" fill="#82a2c3" />

        <g className="theme-toggle__day-clouds">
          <circle className="theme-toggle__cloud theme-toggle__cloud--blue" cx="94" cy="8" r="20" />
          <circle className="theme-toggle__cloud theme-toggle__cloud--white" cx="107" cy="21" r="20" />

          <circle className="theme-toggle__cloud theme-toggle__cloud--blue" cx="58" cy="52" r="17" />
          <circle className="theme-toggle__cloud theme-toggle__cloud--white" cx="69" cy="57" r="19" />
          <circle className="theme-toggle__cloud theme-toggle__cloud--blue-light" cx="84" cy="49" r="18" />
          <circle className="theme-toggle__cloud theme-toggle__cloud--white" cx="98" cy="56" r="20" />
        </g>
      </svg>
      <MaterialIcon name="light_mode" size={17} />
      <MaterialIcon name="dark_mode" size={17} />
      <span className="theme-toggle__clouds" aria-hidden="true"><i /><i /><i /></span>
      <span className="theme-toggle__stars" aria-hidden="true"><i /><i /><i /></span>
      <span className="theme-toggle__thumb" aria-hidden="true" />
    </button>
  );
}
