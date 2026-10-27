import { useEffect, useState } from "react";
import { Info, Eraser } from "lucide-react";
import { useSinglePdf } from "../components/SinglePdf";
import { Field, PrimaryButton, ToolHeader, useTask } from "../components/ui";
import { baseName, download } from "../lib/files";
import { readMetadata, writeMetadata, type Metadata as Meta } from "../lib/pdf";

const EMPTY: Meta = { title: "", author: "", subject: "", keywords: "", creator: "", producer: "" };
const FIELDS: { key: keyof Meta; label: string; hint?: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords", hint: "Comma-separated" },
  { key: "creator", label: "Creator (application)" },
  { key: "producer", label: "Producer" },
];

export default function Metadata() {
  const { pdf, picker } = useSinglePdf();
  const { busy, progress, run } = useTask();
  const [meta, setMeta] = useState<Meta>(EMPTY);

  useEffect(() => {
    if (!pdf) return setMeta(EMPTY);
    // Ignore a slow read that finishes after another file was picked.
    let current = true;
    readMetadata(pdf.bytes)
      .then(({ pageCount: _, ...m }) => current && setMeta(m))
      .catch(() => current && setMeta(EMPTY));
    return () => {
      current = false;
    };
  }, [pdf]);

  const save = (strip: boolean) =>
    run(async () => {
      if (!pdf) return;
      const bytes = await writeMetadata(pdf.bytes, strip ? null : meta);
      if (!(await download(bytes, `${baseName(pdf.file.name)}${strip ? "-clean" : ""}.pdf`))) return;
      return strip ? "All metadata removed" : "Metadata saved";
    });

  return (
    <div className="tool">
      <ToolHeader icon={<Info />} title="Edit Metadata">
        View and change document properties, or strip them entirely before sharing a file.
      </ToolHeader>
      {picker}
      {pdf && (
        <div className="panel">
          <div className="grid-2">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input className="input" value={meta[f.key]} onChange={(e) => setMeta({ ...meta, [f.key]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div className="action-bar">
            <button className="btn" onClick={() => save(true)} disabled={busy} title="Removes title, author, dates, XMP data, etc.">
              <Eraser size={16} /> Remove all metadata
            </button>
            <PrimaryButton busy={busy} progress={progress} onClick={() => save(false)}>
              <Info size={18} /> Save &amp; download
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
