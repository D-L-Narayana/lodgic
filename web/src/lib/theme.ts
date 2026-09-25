/**
 * Theme state shared by the whole app. The inline script in index.html applies the
 * theme before first paint; until the visitor chooses explicitly we follow the OS
 * setting live. Persisted under `lodgic-theme`.
 */
import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "lodgic-theme";
const listeners = new Set<() => void>();
const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}
export function currentTheme(): Theme {
  return stored() ?? (media?.matches ? "dark" : "light");
}
function apply(t: Theme): void {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = t === "dark" ? "#141a20" : "#faf8f4";
}
function emit(): void {
  apply(currentTheme());
  listeners.forEach((l) => l());
}
media?.addEventListener("change", () => {
  if (!stored()) emit();
});
window.addEventListener("storage", (e) => {
  if (e.key === KEY) emit();
});
export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  useEffect(() => apply(theme), [theme]);
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
export function useTitle(title: string): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
