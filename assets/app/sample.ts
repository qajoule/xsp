import params from "@params";
import type { AnalysisData } from "./app";
import { renderCharts } from "./charts";
import { applyTheme, setThemeRedraw, wireThemeToggle } from "./theme";

// js.html passes data/sample.json as params.data. Hugo has already drawn the
// copy, the header, and the tiles, so the charts wait until a section scrolls
// into view.
const { data } = params as { data?: AnalysisData };

applyTheme();
wireThemeToggle(document);
if (!data) throw new Error("sample data is missing");
const draw = () => renderCharts(data);
const visible = new IntersectionObserver(entries => {
  if (!entries.some(entry => entry.isIntersecting)) return;
  visible.disconnect();
  draw();
  setThemeRedraw(draw);
});
document.querySelectorAll("#report section:not([hidden])").forEach(section => visible.observe(section));
