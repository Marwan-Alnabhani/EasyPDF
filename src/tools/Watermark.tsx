import { useState } from "react";
import { Stamp } from "lucide-react";
import { PdfPreview, useSinglePage, useSinglePdf } from "../components/SinglePdf";
import { Field, PageScope, PrimaryButton, Segmented, ToolHeader, useTask } from "../components/ui";
import { baseName, download, parsePageList } from "../lib/files";
import { addWatermark, type WatermarkOptions } from "../lib/pdf";

export default function Watermark() {
  const { pdf, picker } = useSinglePdf();
  const singlePage = useSinglePage(pdf);
  const { busy, progress, run } = useTask();
  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState(60);
  const [color, setColor] = useState("#e5484d");
  const [opacity, setOpacity] = useState(0.25);
  const [angle, setAngle] = useState(45);
  const [position, setPosition] = useState<WatermarkOptions["position"]>("center");
  const [all, setAll] = useState(true);
  const [pageList, setPageList] = useState("1");

  const options = (pages: number[] | null): WatermarkOptions => ({ text, fontSize, color, opacity, angle, position, pages });
  const targetPages = () => (all ? null : parsePageList(pageList, pdf!.pageCount));

  const apply = () =>
    run(async (setProgress) => {
      if (!pdf) return;
      if (!text.trim()) throw new Error("Enter the watermark text");
      setProgress("Adding watermark…");
      const bytes = await addWatermark(pdf.bytes, options(targetPages()));
      if (!(await download(bytes, `${baseName(pdf.file.name)}-watermarked.pdf`))) return;
      return "Watermark added";
    });

  // Preview: watermark only the first affected page.
  const buildPreview = async () => {
    if (!pdf || !text.trim()) return null;
    const first = targetPages()?.[0] ?? 0;
    return addWatermark(await singlePage(first), options(null));
  };

  return (
    <div className="tool">
      <ToolHeader icon={<Stamp />} title="Add Watermark">
        Stamp text such as CONFIDENTIAL or DRAFT across your pages.
      </ToolHeader>
      {picker}
      {pdf && (
        <div className="split-view">
          <div className="panel">
            <Field label="Text">
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field label="Layout">
              <Segmented
                value={position}
                onChange={setPosition}
                options={[
                  { value: "center", label: "Single, centered" },
                  { value: "tile", label: "Tiled" },
                ]}
              />
            </Field>
            <div className="grid-2">
              <Field label={`Size: ${fontSize}pt`}>
                <input type="range" min={12} max={160} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} />
              </Field>
              <Field label={`Angle: ${angle}°`}>
                <input type="range" min={-90} max={90} step={5} value={angle} onChange={(e) => setAngle(+e.target.value)} />
              </Field>
              <Field label={`Opacity: ${Math.round(opacity * 100)}%`}>
                <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
              </Field>
              <Field label="Color">
                <input type="color" className="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </Field>
            </div>
            <PageScope all={all} setAll={setAll} value={pageList} setValue={setPageList} total={pdf.pageCount} />
            <div className="action-bar">
              <PrimaryButton busy={busy} progress={progress} onClick={apply}>
                <Stamp size={18} /> Add watermark &amp; download
              </PrimaryButton>
            </div>
          </div>
          <PdfPreview build={buildPreview} deps={[pdf, text, fontSize, color, opacity, angle, position, all, pageList]} />
        </div>
      )}
    </div>
  );
}
