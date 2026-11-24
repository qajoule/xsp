const storageKey = "xsp-theme";
let redraw = (): void => {};

function storedTheme(): "light" | "dark" | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function preferredTheme(): "light" | "dark" {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(value?: "light" | "dark"): "light" | "dark" {
  const next = value ?? storedTheme() ?? preferredTheme();
  document.documentElement.dataset.theme = next;
  return next;
}

function saveTheme(value: "light" | "dark"): void {
  try {
    localStorage.setItem(storageKey, value);
  } catch { /* Private browsing can deny storage. */ }
}

export function setThemeRedraw(next: () => void): void {
  redraw = next;
}

export function wireThemeToggle(document: Document): void {
  document.querySelectorAll<HTMLElement>("[data-theme-toggle]").forEach((button) => {
    if (button.dataset.themeBound === "true") return;
    button.dataset.themeBound = "true";
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
      redraw();
    });
  });
}
