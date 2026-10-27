import { useState } from "react";
import { FileImage } from "lucide-react";
import { useSinglePdf } from "../components/SinglePdf";
import { Field, PageScope, PrimaryButton, Segmented, ToolHeader, useTask } from "../components/ui";
import { baseName, downloadMany, parsePageList, readBytes } from "../lib/files";
import { canvasToBlob, closePdf, openPdf, renderPage } from "../lib/pdfjs";

export default function PdfToImages() {
  const { pdf, picker } = useSinglePdf();
  const { busy, progress, run } = useTask();
  const [format, setFormat] = useState<"png" | "jpg">("png");
  const [dpi, setDpi] = useState("150");
  const [all, setAll] = useState(true);
  const [pageList, setPageList] = useState("1");

  const convert = () =>
    run(async (setProgress) => {
      if (!pdf) return;
      const indices = all ? Array.from({ length: pdf.pageCount }, (_, i) => i) : parsePageList(pageList, pdf.pageCount);
      const doc = await openPdf(pdf.bytes);
      const stem = baseName(pdf.file.name);
      const pad = String(pdf.pageCount).length;
      const files = [];
      try {
        for (const [k, i] of indices.entries()) {
          setProgress(`Rendering ${k + 1}/${indices.length}…`);
          const canvas = await renderPage(doc, i, { scale: +dpi / 72 });
          const blob = await canvasToBlob(canvas, format === "png" ? "image/png" : "image/jpeg", 0.92);
          canvas.width = canvas.height = 0;
          files.push({ name: `${stem}_page-${String(i + 1).padStart(pad, "0")}.${format}`, data: await readBytes(blob) });
        }
      } finally {
        await closePdf(doc);
      }
      if (!(await downloadMany(files, `${stem}_images.zip`))) return;
      return `Exported ${files.length} image${files.length === 1 ? "" : "s"}`;
    });

  return (
    <div className="tool">
      <ToolHeader icon={<FileImage />} title="PDF to Images">
        Save pages as PNG or JPG images. Multiple pages are downloaded as a .zip.
      </ToolHeader>
      {picker}
      {pdf && (
        <div className="panel">
          <Field label="Format">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: "png", label: "PNG (sharp)" },
                { value: "jpg", label: "JPG (smaller)" },
              ]}
            />
          </Field>
          <Field label="Resolution">
            <Segmented
              value={dpi}
              onChange={setDpi}
              options={[
                { value: "72", label: "72 DPI · screen" },
                { value: "150", label: "150 DPI · standard" },
                { value: "300", label: "300 DPI · print" },
              ]}
            />
          </Field>
          <PageScope all={all} setAll={setAll} value={pageList} setValue={setPageList} total={pdf.pageCount} />
          <div className="action-bar">
            <PrimaryButton busy={busy} progress={progress} onClick={convert}>
              <FileImage size={18} /> Convert to images
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
