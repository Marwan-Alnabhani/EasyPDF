import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { FileDrop } from "./FileDrop";
import { useNotify } from "./ui";
import { PDF_ACCEPT, formatBytes, readBytes } from "../lib/files";
import { loadPdf } from "../lib/pdf";
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
