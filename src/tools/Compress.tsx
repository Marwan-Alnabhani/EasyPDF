import { useState } from "react";
import { Download, Minimize2 } from "lucide-react";
import { useSinglePdf } from "../components/SinglePdf";
import { Field, PrimaryButton, Segmented, ToolHeader, useTask } from "../components/ui";
import { baseName, download, formatBytes } from "../lib/files";
import { compressRasterize, optimizeLossless } from "../lib/pdf";

type Mode = "lossless" | "strong";
type Level = "high" | "medium" | "low";
const LEVELS: Record<Level, { dpi: number; quality: number; label: string }> = {
  high: { dpi: 150, quality: 0.8, label: "Good quality" },
  medium: { dpi: 110, quality: 0.65, label: "Balanced" },
  low: { dpi: 80, quality: 0.5, label: "Smallest file" },
};

export default function Compress() {
  const { pdf, picker } = useSinglePdf();
  const { busy, progress, run } = useTask();
  const [mode, setMode] = useState<Mode>("lossless");
  const [level, setLevel] = useState<Level>("medium");
  const [result, setResult] = useState<{ bytes: Uint8Array; forFile: File } | null>(null);

  const doCompress = () =>
    run(async (setProgress) => {
      if (!pdf) return;
      setResult(null);
      let bytes: Uint8Array;
      if (mode === "lossless") {
        setProgress("Optimizing…");
        bytes = await optimizeLossless(pdf.bytes);
      } else {
        const { dpi, quality } = LEVELS[level];
        bytes = await compressRasterize(pdf.bytes, dpi, quality, (d, t) => setProgress(`Page ${d}/${t}…`));
      }
      setResult({ bytes, forFile: pdf.file });
    });

  const current = result && pdf && result.forFile === pdf.file ? result : null;
  const saved = current ? 1 - current.bytes.length / pdf!.file.size : 0;

  return (
    <div className="tool">
      <ToolHeader icon={<Minimize2 />} title="Compress PDF">
        Reduce the file size of a PDF.
      </ToolHeader>
      {picker}
      {pdf && (
        <div className="panel">
          <Field label="Method">
            <Segmented
              value={mode}
              onChange={(m) => (setMode(m), setResult(null))}
              options={[
                { value: "lossless", label: "Lossless" },
                { value: "strong", label: "Strong (scan-style)" },
              ]}
            />
          </Field>
          {mode === "lossless" ? (
            <p className="muted">
              Rebuilds the file and packs its internal structure more tightly. Text, links and quality are untouched, so
              savings are usually modest.
            </p>
          ) : (
            <>
              <p className="muted">
                Converts every page into a compressed image. Great for scanned documents and image-heavy files, but text
                will <b>no longer be selectable or searchable</b>.
              </p>
              <Field label="Quality">
                <Segmented
                  value={level}
                  onChange={(l) => (setLevel(l), setResult(null))}
                  options={(Object.keys(LEVELS) as Level[]).map((k) => ({ value: k, label: LEVELS[k].label }))}
                />
              </Field>
            </>
          )}
          <div className="action-bar">
            <PrimaryButton busy={busy} progress={progress} onClick={doCompress}>
              <Minimize2 size={18} /> Compress
            </PrimaryButton>
          </div>
          {current && (
            <div className={`result ${saved > 0.01 ? "good" : "meh"}`}>
              <div>
                <strong>
                  {formatBytes(pdf.file.size)} → {formatBytes(current.bytes.length)}
                </strong>
                <span>
                  {saved > 0.01
                    ? `${Math.round(saved * 100)}% smaller`
                    : "This file is already well compressed — the result isn't smaller."}
                </span>
              </div>
              <button className="btn btn-primary" onClick={() =>
                  run(async () => {
                    if (await download(current.bytes, `${baseName(pdf.file.name)}-compressed.pdf`)) return "Saved";
                  })
                }>
                <Download size={16} /> Download
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
