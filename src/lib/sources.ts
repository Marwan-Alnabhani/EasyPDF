import { canvasToBlob, closePdf, openPdf, renderPage, type PDFDocumentProxy } from "./pdfjs";
import { loadPdf, imageToSinglePagePdf } from "./pdf";
import { isImage, isPdf, readBytes, uid } from "./files";

/** A loaded input document. Images are converted to one-page PDFs on import. */
export interface Source {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  /** Displayed page sizes in points (rotation already applied). */
  sizes: [number, number][];
  color: string;
}

const PALETTE = ["#e5484d", "#3e63dd", "#30a46c", "#f76b15", "#8e4ec6", "#12a594", "#d6409f", "#ad7f58"];
let colorIndex = 0;

const sources = new Map<string, Source>();
const pdfjsDocs = new Map<string, Promise<PDFDocumentProxy>>();
const thumbs = new Map<string, Promise<string>>();

export async function addSource(file: File): Promise<Source> {
  let bytes: Uint8Array;
  if (isPdf(file)) bytes = await readBytes(file);
  else if (isImage(file)) bytes = await imageToSinglePagePdf(file);
  else throw new Error(`${file.name} is not a PDF or image`);

  const doc = await loadPdf(bytes, file.name);
  const sizes = doc.getPages().map((p): [number, number] => {
    const { width, height } = p.getSize();
    return p.getRotation().angle % 180 === 0 ? [width, height] : [height, width];
  });
  const source: Source = {
    id: uid(),
    name: file.name,
    bytes,
    pageCount: doc.getPageCount(),
    sizes,
    color: PALETTE[colorIndex++ % PALETTE.length],
  };
  sources.set(source.id, source);
  return source;
}

export function getSource(id: string): Source {
  const s = sources.get(id);
  if (!s) throw new Error("Source document is no longer loaded");
  return s;
}

export function removeSource(id: string): void {
  sources.delete(id);
  pdfjsDocs.get(id)?.then(closePdf).catch(() => {});
  pdfjsDocs.delete(id);
  for (const [key, url] of thumbs) {
    if (key.startsWith(id + ":")) {
      url.then(URL.revokeObjectURL).catch(() => {});
      thumbs.delete(key);
    }
  }
}

export function getPdfjsDoc(id: string): Promise<PDFDocumentProxy> {
  let p = pdfjsDocs.get(id);
  if (!p) {
    p = openPdf(getSource(id).bytes);
    pdfjsDocs.set(id, p);
  }
  return p;
}

// Thumbnails are rendered lazily, a few at a time, and cached as object URLs.
const MAX_PARALLEL = 3;
let active = 0;
const queue: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

export function getThumbnail(sourceId: string, pageIndex: number, width = 320): Promise<string> {
  const key = `${sourceId}:${pageIndex}:${width}`;
  let p = thumbs.get(key);
  if (!p) {
    p = limited(async () => {
      const doc = await getPdfjsDoc(sourceId);
      const canvas = await renderPage(doc, pageIndex, { width });
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
      canvas.width = canvas.height = 0;
      return URL.createObjectURL(blob);
    });
    p.catch(() => thumbs.delete(key));
    thumbs.set(key, p);
  }
  return p;
}
