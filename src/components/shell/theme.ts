import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

const KEY = "tikooh.theme";

const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
};

const prefersLight = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches;

/**
 * Light/dark for the signed-in app. Applies html.light while the shell is
 * mounted and removes it on the way out, so the public site stays dark.
 */
export function useAppTheme(): [Theme, (t: Theme) => void, boolean] {
  const [theme, setTheme] = useState<Theme>(read);
  const [systemLight, setSystemLight] = useState(prefersLight);
  const light = theme === "light" || (theme === "system" && systemLight);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const on = () => setSystemLight(!!mq?.matches);
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    return () => document.documentElement.classList.remove("light");
  }, [light]);

  const set = (t: Theme) => {
    setTheme(t);
    try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  };

  return [theme, set, light];
}
