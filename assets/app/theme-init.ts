/*
 * Runs synchronously in <head> so the first paint already uses the right
 * theme. Without it, a visitor who chose dark on a light OS sees a flash of
 * light before the module scripts run. It must stay a separate classic script:
 * the CSP forbids inline scripts. js.html bundles it as an IIFE without defer.
 */
try {
  const stored = localStorage.getItem("xsp-theme");
  const theme = stored === "light" || stored === "dark"
    ? stored
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
} catch {
  // Storage can be blocked. theme.ts and the CSS media query still apply.
}

export {};
