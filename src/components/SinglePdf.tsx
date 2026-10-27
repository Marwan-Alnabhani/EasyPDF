import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { FileDrop } from "./FileDrop";
import { useNotify } from "./ui";
import { PDF_ACCEPT, formatBytes, readBytes } from "../lib/files";
import type { PDFDocument } from "pdf-lib";
import { extractPages, loadPdf } from "../lib/pdf";
import { closePdf, openPdf, renderPage } from "../lib/pdfjs";

export interface LoadedPdf {
  file: File;
  bytes: Uint8Array;
  pageCount: number;
}

/** State + picker UI for tools that work on a single PDF. */
export function useSinglePdf() {
  const notify = useNotify();
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [loading, setLoading] = useState(false);

  const pick = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    try {
      const bytes = await readBytes(file);
      const doc = await loadPdf(bytes, file.name);
      setPdf({ file, bytes, pageCount: doc.getPageCount() });
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const picker = pdf ? (
    <div className="file-card">
      <FileText size={28} strokeWidth={1.6} />
      <div className="file-card-info">
        <strong title={pdf.file.name}>{pdf.file.name}</strong>
        <span>
          {pdf.pageCount} page{pdf.pageCount === 1 ? "" : "s"} · {formatBytes(pdf.file.size)}
        </span>
      </div>
      <button className="icon-btn" onClick={() => setPdf(null)} aria-label="Remove file" title="Choose another file">
        <X size={18} />
      </button>
    </div>
  ) : (
    <FileDrop
      accept={PDF_ACCEPT}
      multiple={false}
      onFiles={pick}
      title={loading ? "Reading file…" : "Drop a PDF here or click to choose"}
      hint="The file is processed on this device only"
    />
  );

  return { pdf, picker };
}

/**
 * Returns a function that gives one page of `pdf` as its own small PDF. The
 * document is parsed once per file and each page extracted once, so live
 * previews stay fast on large documents.
 */
export function useSinglePage(pdf: LoadedPdf | null) {
  const cache = useRef<{ bytes: Uint8Array; doc: Promise<PDFDocument>; pages: Map<number, Promise<Uint8Array>> } | null>(
    null,
  );
  return (pageIndex: number): Promise<Uint8Array> => {
    if (!pdf) throw new Error("No PDF loaded");
    if (cache.current?.bytes !== pdf.bytes) {
      const doc = loadPdf(pdf.bytes, pdf.file.name);
      doc.catch(() => {
        if (cache.current?.doc === doc) cache.current = null;
      });
      cache.current = { bytes: pdf.bytes, doc, pages: new Map() };
    }
    const { doc, pages } = cache.current;
    let page = pages.get(pageIndex);
    if (!page) {
      page = doc.then((d) => extractPages(d, [pageIndex]));
      page.catch(() => pages.delete(pageIndex));
      pages.set(pageIndex, page);
    }
    return page;
  };
}

/**
 * Renders the first page of whatever PDF `build` produces. Rebuilds (debounced)
 * whenever `deps` change, so tools can show a live preview of their result.
 */
export function PdfPreview({ build, deps }: { build: () => Promise<Uint8Array | null>; deps: unknown[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const bytes = await build();
        if (!bytes || cancelled) return;
        const doc = await openPdf(bytes);
        const canvas = await renderPage(doc, 0, { width: 520 });
        await closePdf(doc);
        if (cancelled || !ref.current) return;
        canvas.className = "preview-canvas";
        ref.current.replaceChildren(canvas);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, deps);

  return (
    <div className="preview">
      <div className="preview-label">Preview (first affected page)</div>
      <div ref={ref} className="preview-frame" />
      {error && <div className="preview-error">{error}</div>}
    </div>
  );
}
