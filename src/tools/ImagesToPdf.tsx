import { useEffect, useRef, useState } from "react";
import { Images, X } from "lucide-react";
import { FileButton, FileDrop } from "../components/FileDrop";
import { SortableArea, noDrag } from "../components/Sortable";
import { Field, PrimaryButton, Segmented, ToolHeader, useNotify, useTask } from "../components/ui";
import { IMAGE_ACCEPT, PDF_ACCEPT, download, isPdf, readBytes, uid } from "../lib/files";
import { imagesToPdf, loadPdf, type ImagesToPdfOptions } from "../lib/pdf";
import { canvasToBlob, closePdf, openPdf, renderPage } from "../lib/pdfjs";

const ACCEPT = `${IMAGE_ACCEPT},${PDF_ACCEPT}`;

interface Item {
  id: string;
  file: File;
  url: string;
  /** Page count, for PDFs (which are merged in as-is). */
  pages?: number;
}

/** Validates a PDF and renders its first page as a preview image. */
async function pdfItem(file: File): Promise<Item> {
  const bytes = await readBytes(file);
  const pages = (await loadPdf(bytes, file.name)).getPageCount();
  const doc = await openPdf(bytes);
  try {
    const canvas = await renderPage(doc, 0, { width: 240 });
    return { id: uid(), file, pages, url: URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.85)) };
  } finally {
    await closePdf(doc);
  }
}

export default function ImagesToPdf() {
  const notify = useNotify();
  const { busy, progress, run } = useTask();
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<ImagesToPdfOptions["pageSize"]>("a4");
  const [orientation, setOrientation] = useState<ImagesToPdfOptions["orientation"]>("auto");
  const [margin, setMargin] = useState("small");
  const [name, setName] = useState("images.pdf");

  // Free preview URLs when the tool is closed.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const add = async (files: File[]) => {
    const added: Item[] = [];
    for (const file of files) {
      try {
        added.push(isPdf(file) ? await pdfItem(file) : { id: uid(), file, url: URL.createObjectURL(file) });
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e), "error");
      }
    }
    setItems((all) => [...all, ...added]);
  };
  const pageCount = items.reduce((n, i) => n + (i.pages ?? 1), 0);
  const removeItem = (id: string) =>
    setItems((all) => {
      const it = all.find((i) => i.id === id);
      if (it) URL.revokeObjectURL(it.url);
      return all.filter((i) => i.id !== id);
    });

  const create = () =>
    run(async (setProgress) => {
      setProgress("Creating PDF…");
      const bytes = await imagesToPdf(
        items.map((i) => i.file),
        { pageSize, orientation, margin: margin === "none" ? 0 : margin === "small" ? 20 : 48 },
      );
      const out = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
      if (!(await download(bytes, out))) return;
      return `Created ${out} with ${pageCount} page${pageCount === 1 ? "" : "s"}`;
    });

  return (
    <div className="tool">
      <ToolHeader icon={<Images />} title="Create PDF from Images">
        Turn photos, scans and screenshots (JPG, PNG, WebP, GIF, BMP) into a new PDF. You can mix in existing PDFs too —
        everything is merged into one file. Drag to set the order.
      </ToolHeader>
      {items.length === 0 ? (
        <FileDrop
          accept={ACCEPT}
          onFiles={add}
          title="Drop images (and PDFs) here or click to choose"
          hint="Each image becomes a page; PDFs are merged in with all their pages"
        />
      ) : (
        <>
          <SortableArea
            items={items}
            onReorder={setItems}
            layout="grid"
            className="image-grid"
            render={(item, i) => (
              <div className="image-card">
                <img src={item.url} alt={item.file.name} draggable={false} />
                <span className="page-no">{i + 1}</span>
                {item.pages !== undefined && (
                  <span className="pdf-badge" title={item.file.name}>
                    PDF · {item.pages} p
                  </span>
                )}
                <button className="icon-btn image-remove" {...noDrag} onClick={() => removeItem(item.id)} aria-label="Remove">
                  <X size={15} />
                </button>
              </div>
            )}
          />
          <div className="row">
            <FileButton accept={ACCEPT} onFiles={add}>
              + Add more files
            </FileButton>
            <button className="btn btn-ghost" onClick={() => (items.forEach((i) => URL.revokeObjectURL(i.url)), setItems([]))}>
              Clear
            </button>
          </div>
          <div className="panel">
            <Field label="Page size" hint={items.some((i) => i.pages) ? "Applies to image pages; PDF pages keep their own size." : undefined}>
              <Segmented
                value={pageSize}
                onChange={setPageSize}
                options={[
                  { value: "fit", label: "Same as image" },
                  { value: "a4", label: "A4" },
                  { value: "letter", label: "Letter" },
                  { value: "legal", label: "Legal" },
                ]}
              />
            </Field>
            {pageSize !== "fit" && (
              <Field label="Orientation">
                <Segmented
                  value={orientation}
                  onChange={setOrientation}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" },
                  ]}
                />
              </Field>
            )}
            <Field label="Margin">
              <Segmented
                value={margin}
                onChange={setMargin}
                options={[
                  { value: "none", label: "None" },
                  { value: "small", label: "Small" },
                  { value: "large", label: "Large" },
                ]}
              />
            </Field>
            <div className="action-bar">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Output file name" />
              <PrimaryButton busy={busy} progress={progress} onClick={create}>
                <Images size={18} /> Create PDF ({pageCount} page{pageCount === 1 ? "" : "s"})
              </PrimaryButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
