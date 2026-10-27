import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FilePlus,
  Layers,
  Redo2,
  RotateCcw,
  RotateCw,
  SquareCheck,
  SquareDashed,
  Trash,
  Undo2,
  X,
} from "lucide-react";
import { FileButton, FileDrop } from "../components/FileDrop";
import { ToolActiveContext, ToolHeader, useNotify, useTask } from "../components/ui";
import { IMAGE_ACCEPT, PDF_ACCEPT, baseName, download, isImage, isPdf, uid } from "../lib/files";
import { assemble, type PageRef } from "../lib/pdf";
import { addSource, getPdfjsDoc, getSource, getThumbnail, removeSource, type Source } from "../lib/sources";
import { renderPage } from "../lib/pdfjs";

interface PageItem extends PageRef {
  id: string;
}

const ACCEPT = `${PDF_ACCEPT},${IMAGE_ACCEPT}`;

export default function Organize() {
  const notify = useNotify();
  const isActive = useContext(ToolActiveContext);
  const { busy, progress, run } = useTask();
  const [pages, setPages] = useState<PageItem[]>([]);
  const [past, setPast] = useState<PageItem[][]>([]);
  const [future, setFuture] = useState<PageItem[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadedSources, setLoadedSources] = useState<Source[]>([]);
  const [zoom, setZoom] = useState(170);
  const [fileName, setFileName] = useState("document.pdf");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const anchor = useRef<string | null>(null);
  // Latest page list, for async callbacks that would otherwise see a stale render.
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  // Every change to the page list goes through commit() so it can be undone.
  const commit = useCallback((next: PageItem[]) => {
    const prev = pagesRef.current;
    pagesRef.current = next;
    setPast((p) => [...p.slice(-99), prev]);
    setFuture([]);
    setPages(next);
  }, []);
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [pages, ...f]);
    setPages(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, pages]);
    setPages(future[0]);
    setFuture((f) => f.slice(1));
  };

  const sourcesInUse = useMemo(() => {
    const ids = new Set(pages.map((p) => p.sourceId));
    return loadedSources.filter((s) => ids.has(s.id));
  }, [pages, loadedSources]);

  // ---- adding files ------------------------------------------------------

  const addFiles = (files: File[]) =>
    run(async (setProgress) => {
      const usable = files.filter((f) => isPdf(f) || isImage(f));
      if (!usable.length) throw new Error("Please choose PDF or image files");
      const added: PageItem[] = [];
      const newSources: Source[] = [];
      for (const [i, f] of usable.entries()) {
        setProgress(`Loading ${i + 1}/${usable.length}…`);
        try {
          const src = await addSource(f);
          newSources.push(src);
          for (let p = 0; p < src.pageCount; p++) added.push({ id: uid(), sourceId: src.id, pageIndex: p, rotation: 0 });
        } catch (e) {
          notify(e instanceof Error ? e.message : String(e), "error");
        }
      }
      if (!added.length) return;
      if (pagesRef.current.length === 0 && newSources[0]) {
        setFileName(newSources.length === 1 ? `${baseName(newSources[0].name)}-edited.pdf` : "merged.pdf");
      } else if (newSources.length) {
        setFileName("merged.pdf");
      }
      setLoadedSources((s) => [...s, ...newSources]);
      commit([...pagesRef.current, ...added]);
      return `Added ${added.length} page${added.length === 1 ? "" : "s"}`;
    });

  // ---- page operations ---------------------------------------------------

  const targets = (ids?: Iterable<string>) => new Set(ids ?? selected);

  const rotate = (delta: number, ids?: Iterable<string>) => {
    const t = targets(ids);
    if (!t.size) return;
    commit(pages.map((p) => (t.has(p.id) ? { ...p, rotation: p.rotation + delta } : p)));
  };

  const duplicate = (ids?: Iterable<string>) => {
    const t = targets(ids);
    if (!t.size) return;
    const copies = new Set<string>();
    const next = pages.flatMap((p) => {
      if (!t.has(p.id)) return [p];
      const copy = { ...p, id: uid() };
      copies.add(copy.id);
      return [p, copy];
    });
    commit(next);
    if (!ids) setSelected(copies);
  };

  const remove = (ids?: Iterable<string>) => {
    const t = targets(ids);
    if (!t.size) return;
    commit(pages.filter((p) => !t.has(p.id)));
    setSelected((s) => new Set([...s].filter((id) => !t.has(id))));
  };

  const insertBlank = () => {
    const lastSel = pages.reduce((acc, p, i) => (selected.has(p.id) ? i : acc), -1);
    const at = lastSel >= 0 ? lastSel + 1 : pages.length;
    const neighbour = pages[at - 1] ?? pages[at];
    let size: [number, number] = [595.28, 841.89];
    if (neighbour) {
      const [w, h] = neighbour.sourceId ? getSource(neighbour.sourceId).sizes[neighbour.pageIndex] : neighbour.size!;
      size = (((neighbour.rotation % 180) + 180) % 180) === 0 ? [w, h] : [h, w];
    }
    const blank: PageItem = { id: uid(), sourceId: null, pageIndex: 0, rotation: 0, size };
    commit([...pages.slice(0, at), blank, ...pages.slice(at)]);
    setSelected(new Set([blank.id]));
  };

  const reverse = () => {
    if (selected.size > 1) {
      // Reverse only the selected pages, keeping them in their slots.
      const positions = pages.map((p, i) => (selected.has(p.id) ? i : -1)).filter((i) => i >= 0);
      const reversed = positions.map((i) => pages[i]).reverse();
      const next = [...pages];
      positions.forEach((pos, k) => (next[pos] = reversed[k]));
      commit(next);
    } else {
      commit([...pages].reverse());
    }
  };

  const removeFile = (sourceId: string) => commit(pages.filter((p) => p.sourceId !== sourceId));

  const clearAll = () => {
    if (!confirm("Remove all pages and files from the workspace?")) return;
    loadedSources.forEach((s) => removeSource(s.id));
    setLoadedSources([]);
    setPages([]);
    setPast([]);
    setFuture([]);
    setSelected(new Set());
  };

  const exportPdf = (onlySelected: boolean) =>
    run(async (setProgress) => {
      const list = onlySelected ? pages.filter((p) => selected.has(p.id)) : pages;
      if (!list.length) throw new Error("There are no pages to export");
      setProgress("Building PDF…");
      const bytes = await assemble(list, (id) => getSource(id).bytes, (id) => getSource(id).name);
      let name = fileName.trim() || "document.pdf";
      if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
      if (onlySelected) name = name.replace(/\.pdf$/i, "-selection.pdf");
      if (!(await download(bytes, name))) return;
      return `Saved ${name} (${list.length} page${list.length === 1 ? "" : "s"})`;
    });

  // ---- selection ---------------------------------------------------------

  const onCardClick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = pages.findIndex((p) => p.id === anchor.current);
      const b = pages.findIndex((p) => p.id === id);
      const range = pages.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.id);
      setSelected((s) => new Set([...(e.ctrlKey || e.metaKey ? s : []), ...range]));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    } else {
      setSelected(new Set([id]));
    }
  };

  const allSelected = pages.length > 0 && selected.size === pages.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.id)));

  // ---- keyboard shortcuts ------------------------------------------------

  const handlers = useRef({ undo, redo, remove, duplicate, rotate, toggleAll });
  handlers.current = { undo, redo, remove, duplicate, rotate, toggleAll };
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || previewIndex !== null) return;
      const h = handlers.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && !e.shiftKey) h.undo();
      else if (mod && (key === "y" || (key === "z" && e.shiftKey))) h.redo();
      else if (mod && key === "a") h.toggleAll();
      else if (mod && key === "d") h.duplicate();
      else if (e.key === "Delete" || e.key === "Backspace") h.remove();
      else if (key === "r" && !mod) h.rotate(e.shiftKey ? -90 : 90);
      else if (e.key === "Escape") setSelected(new Set());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewIndex, isActive]);

  // ---- drag & drop reordering -------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = pages.findIndex((p) => p.id === active.id);
    const to = pages.findIndex((p) => p.id === over.id);
    if (selected.has(String(active.id)) && selected.size > 1) {
      // Move the whole selection as a block, keeping its internal order.
      if (selected.has(String(over.id))) return;
      const moving = pages.filter((p) => selected.has(p.id));
      const rest = pages.filter((p) => !selected.has(p.id));
      let at = rest.findIndex((p) => p.id === over.id);
      if (from < to) at += 1;
      commit([...rest.slice(0, at), ...moving, ...rest.slice(at)]);
    } else {
      commit(arrayMove(pages, from, to));
    }
  };

  const activeItem = activeId ? pages.find((p) => p.id === activeId) : undefined;
  const dragCount = activeId && selected.has(activeId) ? selected.size : 1;

  // ---- render ------------------------------------------------------------

  if (pages.length === 0) {
    return (
      <div className="tool">
        <ToolHeader icon={<Layers />} title="Organize & Merge">
          Reorder, rotate, duplicate and delete pages. Add several files to merge them into one PDF.
        </ToolHeader>
        <FileDrop
          accept={ACCEPT}
          onFiles={addFiles}
          title={busy ? progress ?? "Loading…" : "Drop PDFs or images here, or click to choose"}
          hint="You can add more files later. Images become pages."
        />
        <ul className="tips">
          <li>
            <b>Drag</b> pages to reorder. <b>Ctrl/Shift-click</b> to select several and move them together.
          </li>
          <li>
            Shortcuts: <kbd>Del</kbd> delete · <kbd>R</kbd> rotate · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate ·{" "}
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>A</kbd> select all
          </li>
        </ul>
      </div>
    );
  }

  const none = selected.size === 0;
  return (
    <div
      className="tool tool-wide"
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="toolbar">
        <div className="toolbar-group">
          <FileButton accept={ACCEPT} onFiles={addFiles} className="btn">
            <FilePlus size={16} /> Add files
          </FileButton>
          <button className="btn" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">
            <Undo2 size={16} />
          </button>
          <button className="btn" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)">
            <Redo2 size={16} />
          </button>
        </div>
        <div className="toolbar-group">
          <button className="btn" onClick={toggleAll} title="Select all (Ctrl+A)">
            <SquareCheck size={16} /> {allSelected ? "Select none" : "Select all"}
          </button>
          <button className="btn" onClick={() => rotate(-90)} disabled={none} title="Rotate left (Shift+R)">
            <RotateCcw size={16} />
          </button>
          <button className="btn" onClick={() => rotate(90)} disabled={none} title="Rotate right (R)">
            <RotateCw size={16} />
          </button>
          <button className="btn" onClick={() => duplicate()} disabled={none} title="Duplicate (Ctrl+D)">
            <Copy size={16} /> Duplicate
          </button>
          <button className="btn btn-danger" onClick={() => remove()} disabled={none} title="Delete (Del)">
            <Trash size={16} /> Delete
          </button>
          <button className="btn" onClick={insertBlank} title="Insert a blank page after the selection">
            <SquareDashed size={16} /> Blank page
          </button>
          <button className="btn" onClick={reverse} title="Reverse page order (or only the selected pages)">
            <ArrowDownUp size={16} /> Reverse
          </button>
        </div>
        <div className="toolbar-group toolbar-end">
          <input
            className="input filename"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            aria-label="Output file name"
          />
          {!none && (
            <button className="btn" onClick={() => exportPdf(true)} disabled={busy}>
              <Download size={16} /> Selected ({selected.size})
            </button>
          )}
          <button className="btn btn-primary" onClick={() => exportPdf(false)} disabled={busy}>
            <Download size={16} /> {busy ? progress ?? "Working…" : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="subbar">
        <div className="legend">
          {sourcesInUse.map((s) => (
            <span key={s.id} className="chip" title={s.name}>
              <i style={{ background: s.color }} />
              <span className="chip-name">{s.name}</span>
              <button className="icon-btn" onClick={() => removeFile(s.id)} aria-label={`Remove ${s.name}`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
        <div className="subbar-end">
          <span className="muted">
            {pages.length} page{pages.length === 1 ? "" : "s"}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </span>
          <input
            type="range"
            min={110}
            max={340}
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
            aria-label="Thumbnail size"
          />
          <button className="btn btn-ghost" onClick={clearAll}>
            Clear all
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div
            className="page-grid"
            style={{ "--thumb": `${zoom}px` } as React.CSSProperties}
            onClick={(e) => e.target === e.currentTarget && setSelected(new Set())}
          >
            {pages.map((p, i) => (
              <PageCard
                key={p.id}
                item={p}
                index={i}
                selected={selected.has(p.id)}
                dimmed={activeId !== null && dragCount > 1 && selected.has(p.id) && p.id !== activeId}
                color={p.sourceId ? getSource(p.sourceId).color : "#888"}
                label={p.sourceId ? `${getSource(p.sourceId).name} · p${p.pageIndex + 1}` : "Blank page"}
                onClick={onCardClick}
                onPreview={() => setPreviewIndex(i)}
                onRotate={(d) => rotate(d, [p.id])}
                onDuplicate={() => duplicate([p.id])}
                onDelete={() => remove([p.id])}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem && (
            <div className="page-card overlay" style={{ "--thumb": `${zoom}px` } as React.CSSProperties}>
              <Thumb item={activeItem} />
              {dragCount > 1 && <span className="drag-count">{dragCount}</span>}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {previewIndex !== null && pages[previewIndex] && (
        <Preview
          pages={pages}
          index={previewIndex}
          setIndex={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface CardProps {
  item: PageItem;
  index: number;
  selected: boolean;
  dimmed: boolean;
  color: string;
  label: string;
  onClick: (id: string, e: React.MouseEvent) => void;
  onPreview: () => void;
  onRotate: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const PageCard = memo(function PageCard(props: CardProps) {
  const { item, index, selected, dimmed, color, label } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : dimmed ? 0.45 : 1,
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`page-card ${selected ? "selected" : ""}`}
      onClick={(e) => props.onClick(item.id, e)}
      onDoubleClick={props.onPreview}
      {...attributes}
      {...listeners}
      aria-label={`Page ${index + 1}: ${label}`}
    >
      <Thumb item={item} />
      <div className="card-actions" onPointerDown={stop} onClick={stop} onDoubleClick={stop}>
        <button className="icon-btn" onClick={props.onPreview} title="Preview">
          <Eye size={15} />
        </button>
        <button className="icon-btn" onClick={() => props.onRotate(-90)} title="Rotate left">
          <RotateCcw size={15} />
        </button>
        <button className="icon-btn" onClick={() => props.onRotate(90)} title="Rotate right">
          <RotateCw size={15} />
        </button>
        <button className="icon-btn" onClick={props.onDuplicate} title="Duplicate">
          <Copy size={15} />
        </button>
        <button className="icon-btn danger" onClick={props.onDelete} title="Delete">
          <Trash size={15} />
        </button>
      </div>
      <div className="card-footer">
        <span className="page-no">{index + 1}</span>
        <span className="page-src" title={label}>
          <i style={{ background: color }} />
          {label}
        </span>
      </div>
    </div>
  );
});

function Thumb({ item }: { item: PageItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const { sourceId, pageIndex } = item;

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        getThumbnail(sourceId, pageIndex)
          .then((u) => alive && setUrl(u))
          .catch(() => {});
      },
      { rootMargin: "600px" },
    );
    io.observe(ref.current!);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [sourceId, pageIndex]);

  const rot = { transform: `rotate(${item.rotation}deg)` };
  let inner;
  if (!sourceId) {
    const [w, h] = item.size!;
    const fit = w > h ? { width: "100%" } : { height: "100%" };
    inner = <div className="blank-page" style={{ ...rot, ...fit, aspectRatio: `${w} / ${h}` }} />;
  } else if (url) {
    inner = <img src={url} alt="" draggable={false} style={rot} />;
  } else {
    inner = <div className="thumb-loading" />;
  }
  return (
    <div className="thumb" ref={ref}>
      {inner}
    </div>
  );
}

function Preview({
  pages,
  index,
  setIndex,
  onClose,
}: {
  pages: PageItem[];
  index: number;
  setIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = pages[index];
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!item.sourceId) return;
    let alive = true;
    let objectUrl: string | null = null;
    (async () => {
      const doc = await getPdfjsDoc(item.sourceId!);
      const canvas = await renderPage(doc, item.pageIndex, { width: Math.min(1400, window.innerWidth * 1.5) });
      canvas.toBlob((b) => {
        if (!b || !alive) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      });
    })().catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.sourceId, item.pageIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
      else if (e.key === "ArrowRight" && index < pages.length - 1) setIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, pages.length, onClose, setIndex]);

  const quarter = (((item.rotation / 90) % 2) + 2) % 2 === 1;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          Page {index + 1} of {pages.length}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close preview">
          <X size={20} />
        </button>
      </div>
      <button
        className="modal-nav left"
        disabled={index === 0}
        onClick={(e) => (e.stopPropagation(), setIndex(index - 1))}
        aria-label="Previous page"
      >
        <ChevronLeft size={28} />
      </button>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        {!item.sourceId ? (
          <div className="blank-page large" style={{ aspectRatio: `${item.size![0]} / ${item.size![1]}`, transform: `rotate(${item.rotation}deg)` }} />
        ) : url ? (
          <img
            src={url}
            alt={`Page ${index + 1}`}
            className={quarter ? "quarter" : ""}
            style={{ transform: `rotate(${item.rotation}deg)` }}
          />
        ) : (
          <div className="thumb-loading large" />
        )}
      </div>
      <button
        className="modal-nav right"
        disabled={index === pages.length - 1}
        onClick={(e) => (e.stopPropagation(), setIndex(index + 1))}
        aria-label="Next page"
      >
        <ChevronRight size={28} />
      </button>
    </div>
  );
}
