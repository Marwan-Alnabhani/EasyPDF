import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// pdf.js runtime assets are served locally (see scripts/copy-pdfjs-assets.mjs).
const assets = `${import.meta.env.BASE_URL}pdfjs/`;

export type { PDFDocumentProxy };

// pdf.js v6 disposes documents through their loading task.
const tasks = new WeakMap<PDFDocumentProxy, pdfjs.PDFDocumentLoadingTask>();

export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: `${assets}cmaps/`,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
    enableXfa: false,
  });
  const doc = await task.promise;
  tasks.set(doc, task);
  return doc;
}

/** Releases the worker-side resources of a document opened with openPdf. */
export async function closePdf(doc: PDFDocumentProxy): Promise<void> {
  await tasks.get(doc)?.destroy();
}

/** Renders one page (0-based) to a canvas, scaled so its width is `width` px (or by `scale`). */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  size: { width: number } | { scale: number },
  background = "#ffffff",
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = "scale" in size ? size.scale : size.width / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport, background }).promise;
  page.cleanup();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, quality),
  );
}
