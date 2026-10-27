import { useState } from "react";
import { ArrowUpAZ, Combine, FileText, GripVertical, X } from "lucide-react";
import { FileButton, FileDrop } from "../components/FileDrop";
import { SortableArea, noDrag } from "../components/Sortable";
import { PrimaryButton, ToolHeader, useNotify, useTask } from "../components/ui";
import { PDF_ACCEPT, download, formatBytes, readBytes, uid } from "../lib/files";
import { loadPdf, merge } from "../lib/pdf";

interface Item {
  id: string;
  file: File;
  bytes: Uint8Array;
  pages: number;
}

export default function Merge() {
  const notify = useNotify();
  const { busy, progress, run } = useTask();
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("merged.pdf");

  const add = async (files: File[]) => {
    const added: Item[] = [];
    for (const file of files) {
      try {
        const bytes = await readBytes(file);
        const doc = await loadPdf(bytes, file.name);
        added.push({ id: uid(), file, bytes, pages: doc.getPageCount() });
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e), "error");
      }
    }
    setItems((i) => [...i, ...added]);
  };

  const totalPages = items.reduce((n, i) => n + i.pages, 0);

  const doMerge = () =>
    run(async (setProgress) => {
      setProgress("Merging…");
      const bytes = await merge(items.map((i) => ({ name: i.file.name, bytes: i.bytes })));
      const out = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
      if (!(await download(bytes, out))) return;
      return `Merged ${items.length} files into ${out} (${formatBytes(bytes.length)})`;
    });

  return (
    <div className="tool">
      <ToolHeader icon={<Combine />} title="Merge PDFs">
        Combine several PDFs into one file. Drag to set the order. (To pick individual pages, use Organize &amp; Merge.)
      </ToolHeader>

      {items.length === 0 ? (
        <FileDrop accept={PDF_ACCEPT} onFiles={add} title="Drop PDF files here or click to choose" />
      ) : (
        <>
          <SortableArea
            items={items}
            onReorder={setItems}
            layout="list"
            className="file-list"
            render={(item, i) => (
              <div className="file-row">
                <GripVertical size={18} className="grip" />
                <span className="file-index">{i + 1}</span>
                <FileText size={22} strokeWidth={1.6} />
                <div className="file-card-info">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <span>
                    {item.pages} page{item.pages === 1 ? "" : "s"} · {formatBytes(item.file.size)}
                  </span>
                </div>
                <button
                  className="icon-btn"
                  {...noDrag}
                  onClick={() => setItems((all) => all.filter((x) => x.id !== item.id))}
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X size={18} />
                </button>
              </div>
            )}
          />
          <div className="row">
            <FileButton accept={PDF_ACCEPT} onFiles={add}>
              + Add more files
            </FileButton>
            <button
              className="btn"
              onClick={() => setItems((all) => [...all].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })))}
            >
              <ArrowUpAZ size={16} /> Sort by name
            </button>
            <button className="btn btn-ghost" onClick={() => setItems([])}>
              Clear
            </button>
          </div>
          <div className="action-bar">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Output file name" />
            <PrimaryButton busy={busy} progress={progress} onClick={doMerge} disabled={items.length < 2}>
              <Combine size={18} /> Merge {items.length} files ({totalPages} pages)
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}
