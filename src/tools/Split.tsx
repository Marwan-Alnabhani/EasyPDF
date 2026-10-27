import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { useSinglePdf } from "../components/SinglePdf";
import { Field, PrimaryButton, Segmented, ToolHeader, useTask } from "../components/ui";
import { baseName, downloadMany, parsePageList, parseRangeGroups } from "../lib/files";
import { extractPages, loadPdf } from "../lib/pdf";

type Mode = "ranges" | "every" | "each" | "extract";

export default function Split() {
  const { pdf, picker } = useSinglePdf();
  const { busy, progress, run } = useTask();
  const [mode, setMode] = useState<Mode>("ranges");
  const [ranges, setRanges] = useState("1-3, 4-");
  const [every, setEvery] = useState(2);
  const [extract, setExtract] = useState("1");

  // Sensible defaults for the loaded document: split it in half.
  useEffect(() => {
    if (!pdf) return;
    const half = Math.ceil(pdf.pageCount / 2);
    setRanges(pdf.pageCount > 1 ? `1-${half}, ${half + 1}-${pdf.pageCount}` : "1");
    setEvery(Math.max(1, half));
  }, [pdf]);

  const doSplit = () =>
    run(async (setProgress) => {
      if (!pdf) return;
      const total = pdf.pageCount;
      let groups: number[][];
      if (mode === "ranges") groups = parseRangeGroups(ranges, total);
      else if (mode === "extract") groups = [parsePageList(extract, total)];
      else {
        if (mode === "every" && !(every >= 1)) throw new Error("Enter how many pages each file should have (1 or more)");
        const n = mode === "each" ? 1 : Math.floor(every);
        groups = [];
        for (let i = 0; i < total; i += n) groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
      }
      const src = await loadPdf(pdf.bytes, pdf.file.name);
      const stem = baseName(pdf.file.name);
      const files = [];
      for (const [i, g] of groups.entries()) {
        setProgress(`Creating file ${i + 1}/${groups.length}…`);
        const label = g.length === 1 ? `${g[0] + 1}` : `${g[0] + 1}-${g[g.length - 1] + 1}`;
        files.push({ name: mode === "extract" ? `${stem}_extract.pdf` : `${stem}_p${label}.pdf`, data: await extractPages(src, g) });
      }
      if (!(await downloadMany(files, `${stem}_split.zip`))) return;
      return files.length === 1 ? "Created 1 file" : `Created ${files.length} files (downloaded as .zip)`;
    });

  return (
    <div className="tool">
      <ToolHeader icon={<Scissors />} title="Split PDF">
        Split a PDF into several files, or extract specific pages into a new one.
      </ToolHeader>
      {picker}
      {pdf && (
        <div className="panel">
          <Field label="How to split">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "ranges", label: "By ranges" },
                { value: "every", label: "Every N pages" },
                { value: "each", label: "Every page" },
                { value: "extract", label: "Extract pages" },
              ]}
            />
          </Field>
          {mode === "ranges" && (
            <Field label="Ranges" hint="Each comma-separated range becomes its own file. 4- means page 4 to the end.">
              <input className="input" value={ranges} onChange={(e) => setRanges(e.target.value)} />
            </Field>
          )}
          {mode === "every" && (
            <Field label="Pages per file">
              <input
                className="input narrow"
                type="number"
                min={1}
                max={pdf.pageCount}
                value={every}
                onChange={(e) => setEvery(+e.target.value)}
              />
            </Field>
          )}
          {mode === "each" && <p className="muted">Creates {pdf.pageCount} single-page PDFs, downloaded as a .zip.</p>}
          {mode === "extract" && (
            <Field label="Pages to extract" hint="All listed pages go into one new PDF, in the order given.">
              <input className="input" value={extract} onChange={(e) => setExtract(e.target.value)} />
            </Field>
          )}
          <div className="action-bar">
            <PrimaryButton busy={busy} progress={progress} onClick={doSplit}>
              <Scissors size={18} /> {mode === "extract" ? "Extract pages" : "Split PDF"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
