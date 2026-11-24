import { applyTheme, wireThemeToggle } from "./theme";
import { attachArchiveInput } from "./ui";

const workerURL = document.querySelector<HTMLMetaElement>("meta[name=\"xsp-nlp-worker\"]")?.content;

if (!workerURL) throw new Error("NLP worker URL is missing");

applyTheme();
wireThemeToggle(document);
attachArchiveInput(document, workerURL);
