import { useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";

interface Props {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title?: string;
  hint?: ReactNode;
  compact?: boolean;
}

export function FileDrop({ accept, multiple = true, onFiles, title, hint, compact }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accepts = (f: File) =>
    accept.split(",").some((a) => {
      a = a.trim().toLowerCase();
      if (a.startsWith(".")) return f.name.toLowerCase().endsWith(a);
      if (a.endsWith("/*")) return f.type.startsWith(a.slice(0, -1));
      return f.type === a;
    });

  const handle = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter(accepts);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      className={`drop ${over ? "over" : ""} ${compact ? "compact" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
    >
      <Upload size={compact ? 20 : 36} strokeWidth={1.6} />
      <div>
        <strong>{title ?? (multiple ? "Drop files here or click to choose" : "Drop a file here or click to choose")}</strong>
        {hint && <div className="drop-hint">{hint}</div>}
      </div>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Invisible button-style file chooser. */
export function FileButton({
  accept,
  multiple = true,
  onFiles,
  children,
  className = "btn",
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </>
  );
}
