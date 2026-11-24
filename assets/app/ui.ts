import { type AnalysisData, type AppState, startAnalysisFromTexts } from "./app";
import { textsFromArchiveInput, wanted } from "./archive-input";
import { loadChartLibrary } from "./chart-library";
import { renderCharts } from "./charts";
import { initHandoff } from "./handoff";
import { T } from "./i18n";
import { setThemeRedraw } from "./theme";
import { extractZipWithFallback } from "./zip";

interface DropFileEntry {
  isFile: true;
  isDirectory: false;
  name: string;
  file(success: (file: File) => void, failure: () => void): void;
}
interface DropDirectoryEntry {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader(): { readEntries(success: (entries: DropEntry[]) => void, failure: () => void): void };
}
type DropEntry = DropFileEntry | DropDirectoryEntry;
interface DropItem {
  kind: string;
  webkitGetAsEntry?: () => DropEntry | null;
}
interface DropData {
  items?: Iterable<DropItem>;
  files: Iterable<File>;
}
function legacyStatus(document: Document, path: string): void {
  const status = document.querySelector<HTMLElement>("#status");
  if (status) status.textContent = T(path);
}

function setState(document: Document, state: AppState): void {
  const status = document.querySelector<HTMLElement>("#app-status");
  if (!status) return;
  status.dataset.state = state;
  status.textContent = state;
  const loader = document.querySelector<HTMLElement>("#analysis-loader");
  if (loader) {
    loader.hidden = false;
    loader.setAttribute("aria-busy", state === "error" ? "false" : "true");
  }
}

export function renderSummary(document: Document, data: AnalysisData): void {
  const overview = data.overview as { display_name: string; username: string; n_total: number };
  const report = document.querySelector<HTMLElement>("#app-report");
  const name = document.querySelector<HTMLElement>("#report-name");
  const total = document.querySelector<HTMLElement>("#report-total");
  if (!report || !name || !total) throw new Error("report DOM is incomplete");
  name.textContent = overview.display_name || overview.username;
  const displayName = document.querySelector<HTMLElement>("#dname");
  if (displayName) displayName.textContent = overview.display_name || overview.username;
  total.textContent = String(overview.n_total);
  report.hidden = false;
  document.querySelector<HTMLElement>("#analysis-loader")?.setAttribute("hidden", "");
  document.querySelector("#landing")?.classList.add("hidden");
  document.querySelector("#report")?.classList.remove("hidden");
  renderCharts(data);
  setThemeRedraw(() => renderCharts(data));
  initHandoff(data);
}

export async function runArchiveFiles(
  document: Document,
  files: Iterable<File>,
  workerURL: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const selected = Array.from(files);
    if (selected.length === 0 || selected.some((file) => !wanted(file.name) && !/\.zip$/iu.test(file.name))) {
      // The status text lives inside the loader, so the loader must be shown or
      // a rejected drop would give the visitor no feedback at all.
      setState(document, "error");
      legacyStatus(document, "landing.status.notFound");
      return;
    }
    setState(document, "read");
    legacyStatus(document, "landing.status.reading");
    const result = await textsFromArchiveInput(
      selected,
      async (file) => (await extractZipWithFallback(file)).textByRole,
    );
    if (signal?.aborted) return;
    const run = startAnalysisFromTexts(result, workerURL, (state) => {
      if (!signal?.aborted) setState(document, state);
    });
    signal?.addEventListener("abort", run.cancel, { once: true });
    try {
      const data = await run.promise;
      if (signal?.aborted) return;
      await loadChartLibrary(document);
      if (!signal?.aborted) renderSummary(document, data);
    } finally {
      signal?.removeEventListener("abort", run.cancel);
    }
  } catch (error) {
    if (signal?.aborted) return;
    setState(document, "error");
    legacyStatus(document, "landing.status.notFound");
    throw error;
  }
}

export async function filesFromDrop(data: DropData): Promise<File[]> {
  const items = data.items ? [...data.items].filter((item) => item.kind === "file") : [];
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is DropEntry =>
    entry !== null && entry !== undefined
  );
  if (entries.length === 0) return [...data.files];
  const files: File[] = [];
  const keep = (name: string): boolean => wanted(name) !== null || /\.zip$/iu.test(name);
  const visit = async (entry: DropEntry): Promise<void> => {
    if (entry.isFile) {
      if (keep(entry.name)) {
        await new Promise<void>((resolve) =>
          entry.file((file) => {
            files.push(file);
            resolve();
          }, resolve)
        );
      }
      return;
    }
    const reader = entry.createReader();
    while (true) {
      const batch = await new Promise<DropEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
      if (batch.length === 0) return;
      for (const child of batch) await visit(child);
    }
  };
  for (const entry of entries) await visit(entry);
  return files;
}

export function attachArchiveInput(document: Document, workerURL: string): void {
  const input = document.querySelector<HTMLInputElement>("#file, #archive-files");
  if (!input) throw new Error("archive input is missing");
  let active: AbortController | undefined;
  const run = async (files: Iterable<File> | Promise<File[]>): Promise<void> => {
    active?.abort();
    const controller = new AbortController();
    active = controller;
    try {
      const selected = await files;
      if (!controller.signal.aborted) await runArchiveFiles(document, selected, workerURL, controller.signal);
    } catch (error) {
      console.error("archive analysis failed", error);
    } finally {
      if (active === controller) active = undefined;
    }
  };
  input.addEventListener("change", () => {
    void run(Array.from(input.files ?? []));
  });
  document.querySelector("#loader-close")?.addEventListener("click", () => {
    active?.abort();
    document.querySelector<HTMLElement>("#analysis-loader")?.setAttribute("hidden", "");
    input.value = "";
  });
  document.querySelector("#pick")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    input.value = "";
    input.click();
  });
  document.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (files?.length) {
      event.preventDefault();
      void run(Array.from(files));
    }
  });
  let dragDepth = 0;
  document.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    dragDepth += 1;
    document.documentElement.classList.add("is-dragging-files");
  });
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  document.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.documentElement.classList.remove("is-dragging-files");
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    document.documentElement.classList.remove("is-dragging-files");
    if (event.dataTransfer) {
      void run(filesFromDrop(event.dataTransfer as unknown as DropData));
    }
  });
}
