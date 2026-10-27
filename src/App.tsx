import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Combine, FileImage, HardDrive, Hash, Images, Info, Layers, Minimize2, Scissors, Stamp } from "lucide-react";
import { NotifyProvider, ToolActiveContext } from "./components/ui";

interface Tool {
  id: string;
  name: string;
  icon: ReactNode;
  group: string;
  component: ComponentType;
}

const TOOLS: Tool[] = [
  { id: "organize", name: "Organize & Merge", icon: <Layers size={18} />, group: "Pages", component: lazy(() => import("./tools/Organize")) },
  { id: "merge", name: "Merge PDFs", icon: <Combine size={18} />, group: "Pages", component: lazy(() => import("./tools/Merge")) },
  { id: "split", name: "Split / Extract", icon: <Scissors size={18} />, group: "Pages", component: lazy(() => import("./tools/Split")) },
  { id: "compress", name: "Compress", icon: <Minimize2 size={18} />, group: "Optimize", component: lazy(() => import("./tools/Compress")) },
  { id: "images-to-pdf", name: "Create PDF (Images)", icon: <Images size={18} />, group: "Convert", component: lazy(() => import("./tools/ImagesToPdf")) },
  { id: "pdf-to-images", name: "PDF to Images", icon: <FileImage size={18} />, group: "Convert", component: lazy(() => import("./tools/PdfToImages")) },
  { id: "watermark", name: "Watermark", icon: <Stamp size={18} />, group: "Edit", component: lazy(() => import("./tools/Watermark")) },
  { id: "page-numbers", name: "Page Numbers", icon: <Hash size={18} />, group: "Edit", component: lazy(() => import("./tools/PageNumbers")) },
  { id: "metadata", name: "Metadata", icon: <Info size={18} />, group: "Edit", component: lazy(() => import("./tools/Metadata")) },
];

const toolFromHash = () => TOOLS.find((t) => `#${t.id}` === location.hash)?.id ?? "organize";

export default function App() {
  const [active, setActive] = useState(toolFromHash);
  // Tools stay mounted once opened so switching away doesn't lose work.
  const [opened, setOpened] = useState<string[]>(() => [toolFromHash()]);

  useEffect(() => {
    const onHash = () => select(toolFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const select = (id: string) => {
    setActive(id);
    setOpened((o) => (o.includes(id) ? o : [...o, id]));
    if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  };

  const groups = [...new Set(TOOLS.map((t) => t.group))];

  return (
    <NotifyProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo">PDF</span>
            <span>easyPDF</span>
          </div>
          <nav>
            {groups.map((g) => (
              <div key={g} className="nav-group">
                <div className="nav-label">{g}</div>
                {TOOLS.filter((t) => t.group === g).map((t) => (
                  <button
                    key={t.id}
                    className={`nav-item ${active === t.id ? "active" : ""}`}
                    onClick={() => select(t.id)}
                    aria-current={active === t.id ? "page" : undefined}
                  >
                    {t.icon}
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="privacy">
            <HardDrive size={18} />
            <div>
              <strong>Runs on this device</strong>
              <span>easyPDF has no backend: your files are opened, edited and saved by code running here.</span>
            </div>
          </div>
        </aside>
        <main className="main">
          {TOOLS.filter((t) => opened.includes(t.id)).map((t) => (
            <section key={t.id} hidden={t.id !== active}>
              <ToolActiveContext.Provider value={t.id === active}>
                <Suspense fallback={<div className="tool muted">Loading…</div>}>
                  <t.component />
                </Suspense>
              </ToolActiveContext.Provider>
            </section>
          ))}
        </main>
      </div>
    </NotifyProvider>
  );
}
