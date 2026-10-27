import { useState } from "react";
import { Hash } from "lucide-react";
import { PdfPreview, useSinglePage, useSinglePdf } from "../components/SinglePdf";
import { Field, PageScope, PrimaryButton, Segmented, ToolHeader, useTask } from "../components/ui";
import { baseName, download, parsePageList } from "../lib/files";
import { addPageNumbers, type PageNumberOptions } from "../lib/pdf";

const FORMATS = [
  { value: "{n}", label: "1" },
  { value: "Page {n}", label: "Page 1" },
  { value: "{n} / {total}", label: "1 / 10" },
  { value: "Page {n} of {total}", label: "Page 1 of 10" },
  { value: "- {n} -", label: "- 1 -" },
];

export default function PageNumbers() {
  const { pdf, picker } = useSinglePdf();
  const singlePage = useSinglePage(pdf);
  const { busy, progress, run } = useTask();
  const [vertical, setVertical] = useState<PageNumberOptions["vertical"]>("bottom");
  const [horizontal, setHorizontal] = useState<PageNumberOptions["horizontal"]>("center");
  const [format, setFormat] = useState("{n}");
  const [startAt, setStartAt] = useState(1);
  const [fontSize, setFontSize] = useState(11);
  const [margin, setMargin] = useState(28);
  const [color, setColor] = useState("#000000");
  const [all, setAll] = useState(true);
  const [pageList, setPageList] = useState("2-");

  const options = (pages: number[] | null): PageNumberOptions => ({
    vertical,
    horizontal,
    format,
    startAt,
    fontSize,
    margin,
    color,
    pages,
  });
  const targetPages = () => (all ? null : parsePageList(pageList, pdf!.pageCount));

  const apply = () =>
    run(async (setProgress) => {
      if (!pdf) return;
      setProgress("Numbering pages…");
      const bytes = await addPageNumbers(pdf.bytes, options(targetPages()));
      if (!(await download(bytes, `${baseName(pdf.file.name)}-numbered.pdf`))) return;
      return "Page numbers added";
    });

  const buildPreview = async () => {
    if (!pdf) return null;
    const first = targetPages()?.[0] ?? 0;
    const single = await singlePage(first);
    // Preview uses the real total so "{total}" shows correctly.
    const total = all ? pdf.pageCount : targetPages()!.length;
    return addPageNumbers(single, { ...options(null), format: format.replaceAll("{total}", String(total + startAt - 1)) });
  };

  return (
    <div className="tool">
      <ToolHeader icon={<Hash />} title="Add Page Numbers">
        Number your pages, with control over position, style and which pages are numbered.
      </ToolHeader>
      {picker}
      {pdf && (
        <div className="split-view">
          <div className="panel">
            <Field label="Position">
              <div className="row">
                <Segmented
                  value={vertical}
                  onChange={setVertical}
                  options={[
                    { value: "top", label: "Top" },
                    { value: "bottom", label: "Bottom" },
                  ]}
                />
                <Segmented
                  value={horizontal}
                  onChange={setHorizontal}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Center" },
                    { value: "right", label: "Right" },
                  ]}
                />
              </div>
            </Field>
            <Field label="Format">
              <Segmented value={format} onChange={setFormat} options={FORMATS} />
            </Field>
            <div className="grid-2">
              <Field label="First number">
                <input className="input" type="number" value={startAt} onChange={(e) => setStartAt(+e.target.value || 1)} />
              </Field>
              <Field label="Color">
                <input type="color" className="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </Field>
              <Field label={`Font size: ${fontSize}pt`}>
                <input type="range" min={6} max={36} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} />
              </Field>
              <Field label={`Distance from edge: ${margin}pt`}>
                <input type="range" min={8} max={90} value={margin} onChange={(e) => setMargin(+e.target.value)} />
              </Field>
            </div>
            <PageScope all={all} setAll={setAll} value={pageList} setValue={setPageList} total={pdf.pageCount} />
            <div className="action-bar">
              <PrimaryButton busy={busy} progress={progress} onClick={apply}>
                <Hash size={18} /> Add numbers &amp; download
              </PrimaryButton>
            </div>
          </div>
          <PdfPreview
            build={buildPreview}
            deps={[pdf, vertical, horizontal, format, startAt, fontSize, margin, color, all, pageList]}
          />
        </div>
      )}
    </div>
  );
}
