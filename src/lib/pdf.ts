import { degrees, PDFDocument, PDFName, PDFPage, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { canvasToBlob, closePdf, openPdf, renderPage } from "./pdfjs";
import { hexToRgb01, isPdf, readBytes } from "./files";

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
} as const;
export type PageSizeName = keyof typeof PAGE_SIZES;

/** Loads a PDF with pdf-lib, translating the encryption error into something readable. */
export async function loadPdf(bytes: Uint8Array, name = "This file"): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg))
      throw new Error(`${name} is password-protected or encrypted. Remove the protection first, then try again.`);
    throw new Error(`${name} could not be read as a PDF (${msg})`);
  }
}

async function save(doc: PDFDocument): Promise<Uint8Array> {
  doc.setProducer("easyPDF (offline)");
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
}

// ---------------------------------------------------------------------------
// Page assembly (organize / merge / split)

export interface PageRef {
  /** Source document id, or null for an inserted blank page. */
  sourceId: string | null;
  pageIndex: number;
  /** Extra rotation applied on top of the page's own rotation (multiple of 90). */
  rotation: number;
  /** Size of a blank page, in points. */
  size?: [number, number];
}

/** Builds a new PDF from an ordered list of page references into one or more source documents. */
export async function assemble(
  pages: PageRef[],
  getBytes: (sourceId: string) => Uint8Array,
  getName: (sourceId: string) => string = () => "A file",
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const loaded = new Map<string, PDFDocument>();
  // Copy pages per source in one call each (keeps shared resources deduplicated).
  const copies = new Map<string, Map<number, PDFPage[]>>();
  for (const id of new Set(pages.map((p) => p.sourceId).filter((s): s is string => s !== null))) {
    const src = await loadPdf(getBytes(id), getName(id));
    loaded.set(id, src);
    const indices = pages.filter((p) => p.sourceId === id).map((p) => p.pageIndex);
    const copied = await out.copyPages(src, indices);
    const byIndex = new Map<number, PDFPage[]>();
    indices.forEach((idx, i) => byIndex.set(idx, [...(byIndex.get(idx) ?? []), copied[i]]));
    copies.set(id, byIndex);
  }
  for (const ref of pages) {
    if (ref.sourceId === null) {
      const page = out.addPage(ref.size ?? [...PAGE_SIZES.a4]);
      page.setRotation(degrees(norm(ref.rotation)));
      continue;
    }
    const page = copies.get(ref.sourceId)!.get(ref.pageIndex)!.shift()!;
    out.addPage(page);
    page.setRotation(degrees(norm(page.getRotation().angle + ref.rotation)));
  }
  return save(out);
}

const norm = (deg: number) => (((deg % 360) + 360) % 360);

export async function extractPages(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return save(out);
}

export async function merge(files: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await loadPdf(f.bytes, f.name);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return save(out);
}

// ---------------------------------------------------------------------------
// Images -> PDF

export interface ImagesToPdfOptions {
  pageSize: "fit" | PageSizeName;
  orientation: "auto" | "portrait" | "landscape";
  /** Margin in points. */
  margin: number;
}

/**
 * Builds a PDF from images, one page per image. PDFs in the list are merged in
 * place, so mixed uploads (photos + existing PDFs) become a single document.
 */
export async function imagesToPdf(files: File[], opts: ImagesToPdfOptions): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const file of files) {
    if (isPdf(file)) {
      const src = await loadPdf(await readBytes(file), file.name);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      continue;
    }
    const img = await embedImage(out, file);
    const { width: iw, height: ih } = img;
    let pw: number, ph: number;
    if (opts.pageSize === "fit") {
      pw = iw + opts.margin * 2;
      ph = ih + opts.margin * 2;
    } else {
      const [a, b] = PAGE_SIZES[opts.pageSize];
      const landscape = opts.orientation === "landscape" || (opts.orientation === "auto" && iw > ih);
      [pw, ph] = landscape ? [b, a] : [a, b];
    }
    const page = out.addPage([pw, ph]);
    const maxW = pw - opts.margin * 2;
    const maxH = ph - opts.margin * 2;
    const scale = Math.min(maxW / iw, maxH / ih, opts.pageSize === "fit" ? 1 : Infinity);
    const w = iw * scale;
    const h = ih * scale;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return save(out);
}

/** A single image turned into a one-page PDF (used when images are dropped into the organizer). */
export async function imageToSinglePagePdf(file: File): Promise<Uint8Array> {
  return imagesToPdf([file], { pageSize: "fit", orientation: "auto", margin: 0 });
}

async function embedImage(doc: PDFDocument, file: File) {
  const bytes = await readBytes(file);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  // JPEGs with an EXIF rotation (phone photos) and non-PNG/JPEG formats are
  // normalised through a canvas so they appear the right way up.
  if (isJpeg && jpegOrientation(bytes) <= 1) return doc.embedJpg(bytes);
  if (isPng) return doc.embedPng(bytes);
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  if (isJpeg) return doc.embedJpg(await readBytes(await canvasToBlob(canvas, "image/jpeg", 0.92)));
  return doc.embedPng(await readBytes(await canvasToBlob(canvas, "image/png")));
}

/** Reads the EXIF orientation tag from a JPEG (1 = normal). */
function jpegOrientation(b: Uint8Array): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let off = 2;
  while (off + 4 < b.length) {
    if (b[off] !== 0xff) return 1;
    const marker = b[off + 1];
    const len = view.getUint16(off + 2);
    if (marker === 0xe1 && view.getUint32(off + 4) === 0x45786966) {
      const tiff = off + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 10 > b.length) return 1;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    off += 2 + len;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Drawing text in "visual" coordinates (as the page is displayed, honouring /Rotate)

interface VisualBox {
  width: number;
  height: number;
  /** Maps a visual point (origin bottom-left of the displayed page) to PDF user space. */
  map(vx: number, vy: number): { x: number; y: number };
  /** Rotation (degrees) to add so text appears at the requested visual angle. */
  angle: number;
}

function visualBox(page: PDFPage): VisualBox {
  const { x: ox, y: oy, width: W, height: H } = page.getCropBox();
  const r = norm(page.getRotation().angle);
  const at = (x: number, y: number) => ({ x: ox + x, y: oy + y });
  switch (r) {
    case 90:
      return { width: H, height: W, angle: 90, map: (vx, vy) => at(W - vy, vx) };
    case 180:
      return { width: W, height: H, angle: 180, map: (vx, vy) => at(W - vx, H - vy) };
    case 270:
      return { width: H, height: W, angle: 270, map: (vx, vy) => at(vy, H - vx) };
    default:
      return { width: W, height: H, angle: 0, map: (vx, vy) => at(vx, vy) };
  }
}

interface TextStyle {
  font: PDFFont;
  size: number;
  color: string;
  opacity: number;
}

/** Draws `text` with its baseline starting at visual point (vx, vy), rotated `angle` degrees visually. */
function drawVisualText(page: PDFPage, box: VisualBox, text: string, vx: number, vy: number, angle: number, s: TextStyle) {
  const p = box.map(vx, vy);
  const [r, g, b] = hexToRgb01(s.color);
  page.drawText(text, {
    x: p.x,
    y: p.y,
    size: s.size,
    font: s.font,
    color: rgb(r, g, b),
    opacity: s.opacity,
    rotate: degrees(angle + box.angle),
  });
}

function checkEncodable(font: PDFFont, text: string) {
  try {
    font.encodeText(text);
  } catch {
    throw new Error(
      "The text contains characters the built-in PDF fonts can't display. Please use Latin characters (A-Z, digits, basic punctuation).",
    );
  }
}

// ---------------------------------------------------------------------------
// Watermark

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  angle: number;
  position: "center" | "tile";
  pages: number[] | null;
}

export async function addWatermark(bytes: Uint8Array, o: WatermarkOptions): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  checkEncodable(font, o.text);
  const style = { font, size: o.fontSize, color: o.color, opacity: o.opacity };
  const tw = font.widthOfTextAtSize(o.text, o.fontSize);
  const th = font.heightAtSize(o.fontSize, { descender: false });
  const rad = (o.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Baseline start so the text's centre lands on (cx, cy).
  const startFor = (cx: number, cy: number) => {
    const dx = -tw / 2;
    const dy = -th / 2;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as const;
  };
  const pages = doc.getPages();
  for (const i of o.pages ?? pages.map((_, i) => i)) {
    const page = pages[i];
    const box = visualBox(page);
    if (o.position === "center") {
      const [x, y] = startFor(box.width / 2, box.height / 2);
      drawVisualText(page, box, o.text, x, y, o.angle, style);
    } else {
      const stepX = tw * Math.abs(cos) + th * Math.abs(sin) + o.fontSize * 2.5;
      const stepY = tw * Math.abs(sin) + th * Math.abs(cos) + o.fontSize * 2.5;
      for (let cy = stepY / 2; cy < box.height + stepY / 2; cy += stepY)
        for (let cx = stepX / 2; cx < box.width + stepX / 2; cx += stepX) {
          const [x, y] = startFor(cx, cy);
          drawVisualText(page, box, o.text, x, y, o.angle, style);
        }
    }
  }
  return save(doc);
}

// ---------------------------------------------------------------------------
// Page numbers

export interface PageNumberOptions {
  vertical: "top" | "bottom";
  horizontal: "left" | "center" | "right";
  /** Template; {n} = page number, {total} = numbered page count. */
  format: string;
  startAt: number;
  fontSize: number;
  margin: number;
  color: string;
  pages: number[] | null;
}

export async function addPageNumbers(bytes: Uint8Array, o: PageNumberOptions): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const targets = o.pages ?? pages.map((_, i) => i);
  const total = targets.length + o.startAt - 1;
  targets.forEach((pageIndex, i) => {
    const text = o.format.replaceAll("{n}", String(o.startAt + i)).replaceAll("{total}", String(total));
    checkEncodable(font, text);
    const page = pages[pageIndex];
    const box = visualBox(page);
    const tw = font.widthOfTextAtSize(text, o.fontSize);
    const x =
      o.horizontal === "left" ? o.margin : o.horizontal === "right" ? box.width - o.margin - tw : (box.width - tw) / 2;
    const y = o.vertical === "bottom" ? o.margin : box.height - o.margin - o.fontSize * 0.75;
    drawVisualText(page, box, text, x, y, 0, { font, size: o.fontSize, color: o.color, opacity: 1 });
  });
  return save(doc);
}

// ---------------------------------------------------------------------------
// Metadata

export interface Metadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

export async function readMetadata(bytes: Uint8Array): Promise<Metadata & { pageCount: number }> {
  const doc = await loadPdf(bytes);
  return {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords() ?? "",
    creator: doc.getCreator() ?? "",
    producer: doc.getProducer() ?? "",
    pageCount: doc.getPageCount(),
  };
}

export async function writeMetadata(bytes: Uint8Array, m: Metadata | null): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  if (m === null) {
    // Strip everything: Info dictionary and XMP metadata stream.
    doc.context.trailerInfo.Info = undefined;
    doc.catalog.delete(PDFName.of("Metadata"));
    return doc.save({ useObjectStreams: true });
  }
  doc.setTitle(m.title);
  doc.setAuthor(m.author);
  doc.setSubject(m.subject);
  doc.setKeywords(m.keywords.split(",").map((k) => k.trim()).filter(Boolean));
  doc.setCreator(m.creator);
  doc.setProducer(m.producer);
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
}

// ---------------------------------------------------------------------------
// Compression

/**
 * Lossless: re-saves the original document with compressed object streams.
 * The document itself is untouched (bookmarks, forms, attachments and metadata
 * are all kept); copying pages into a new document would drop them.
 */
export async function optimizeLossless(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  return doc.save({ useObjectStreams: true });
}

/**
 * Strong: renders every page to a JPEG and rebuilds the PDF from those images.
 * Big savings for scanned documents, but text is no longer selectable.
 */
export async function compressRasterize(
  bytes: Uint8Array,
  dpi: number,
  quality: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const src = await openPdf(bytes);
  const out = await PDFDocument.create();
  try {
    for (let i = 0; i < src.numPages; i++) {
      const page = await src.getPage(i + 1);
      const vp = page.getViewport({ scale: 1 });
      const canvas = await renderPage(src, i, { scale: dpi / 72 });
      const jpg = await readBytes(await canvasToBlob(canvas, "image/jpeg", quality));
      const img = await out.embedJpg(jpg);
      const p = out.addPage([vp.width, vp.height]);
      p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      canvas.width = canvas.height = 0;
      onProgress?.(i + 1, src.numPages);
    }
  } finally {
    await closePdf(src);
  }
  return save(out);
}
