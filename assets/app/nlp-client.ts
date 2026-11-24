import type { NlpResult } from "./nlp";

export interface NlpPost {
  year: number;
  source: string;
  full_text: string;
}

interface ResultMessage {
  type: "result";
  id: number;
  result: NlpResult;
}
interface ErrorMessage {
  type: "error";
  id: number;
  message: string;
}
type WorkerMessage = ResultMessage | ErrorMessage;

export class NlpWorkerClient {
  private nextID = 1;

  constructor(private readonly workerURL: string) {}

  run(posts: NlpPost[]): { promise: Promise<NlpResult>; cancel: () => void } {
    const worker = new Worker(this.workerURL);
    const id = this.nextID++;
    let settled = false;
    let rejectRun: (reason: Error) => void = () => {};
    const promise = new Promise<NlpResult>((resolve, reject) => {
      rejectRun = reject;
      worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.id !== id || settled) return;
        settled = true;
        worker.terminate();
        if (message.type === "result") resolve(message.result);
        else reject(new Error(message.message));
      });
      worker.addEventListener("error", (event) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        reject(event.error instanceof Error ? event.error : new Error(event.message));
      });
      worker.postMessage({ type: "run", id, posts });
    });
    return {
      promise,
      cancel: () => {
        if (settled) return;
        settled = true;
        worker.terminate();
        rejectRun(new DOMException("NLP analysis was cancelled", "AbortError"));
      },
    };
  }
}
