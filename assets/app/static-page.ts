import { applyTheme, wireThemeToggle } from "./theme";

applyTheme();
wireThemeToggle(document);

// Manual page: mark the table-of-contents entry of the section being read.
const tocLinks = new Map<string, HTMLAnchorElement>();
document.querySelectorAll<HTMLAnchorElement>("#TableOfContents a[href^='#']").forEach((link) => {
  tocLinks.set(decodeURIComponent(link.hash.slice(1)), link);
});
if (tocLinks.size > 0 && "IntersectionObserver" in globalThis) {
  const mark = (id: string): void => {
    tocLinks.forEach((link, key) => {
      if (key === id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting);
    if (visible.length > 0) mark(visible[0].target.id);
  }, { rootMargin: "0px 0px -70% 0px" });
  tocLinks.forEach((_link, id) => {
    const heading = document.getElementById(id);
    if (heading) observer.observe(heading);
  });
}
