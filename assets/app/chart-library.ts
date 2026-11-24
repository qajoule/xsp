let chartsReady: Promise<void> | undefined;

// ECharts is loaded on first use. js.html gives its fingerprinted URL and its
// integrity in a meta element, so this module needs no build-time params and
// still runs in Node for the unit tests.
export function loadChartLibrary(document: Document): Promise<void> {
  if (chartsReady) return chartsReady;
  const meta = document.querySelector<HTMLMetaElement>("meta[name=\"xsp-echarts\"]");
  if (!meta?.content) return Promise.reject(new Error("Chart library URL is missing"));
  return chartsReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = meta.content;
    if (meta.dataset.integrity) script.integrity = meta.dataset.integrity;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      chartsReady = undefined;
      reject(new Error("Chart library could not be loaded"));
    };
    document.head.append(script);
  });
}
