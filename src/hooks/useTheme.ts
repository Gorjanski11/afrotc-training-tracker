import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "af";
export const THEMES: readonly Theme[] = ["light", "dark", "af"];

const STORAGE_KEY = "theme";

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if ((THEMES as readonly string[]).includes(stored ?? "")) return stored as Theme;
  } catch {
    // localStorage unavailable -- fall through to default.
  }
  return "light";
}

function applyTheme(theme: Theme) {
  if (theme === "light") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

/** Manually picked (not OS-driven) theme -- light, dark, or "AF mode" -- persisted so it survives a reload. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Non-fatal -- theme just won't persist across reloads.
    }
  }, [theme]);

  return { theme, setTheme };
}
