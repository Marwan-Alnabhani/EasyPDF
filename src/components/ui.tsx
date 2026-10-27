import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, X } from "lucide-react";

/** True while the tool rendering this subtree is the one on screen. */
export const ToolActiveContext = createContext(true);

// ---------------------------------------------------------------------------
// Notifications

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const NotifyContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});
export const useNotify = () => useContext(NotifyContext);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    const id = next.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4000);
  }, []);
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === "error" ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
            <span>{t.message}</span>
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Running a long task with busy state, progress and error reporting

export function useTask() {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const run = useCallback(
    async (fn: (progress: (msg: string) => void) => Promise<string | void>) => {
      setBusy(true);
      setProgress(null);
      // Let React paint the busy state before heavy synchronous work starts.
      await new Promise((r) => setTimeout(r, 30));
      try {
        const done = await fn(setProgress);
        if (done) notify(done, "success");
      } catch (e) {
        console.warn(e);
        notify(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [notify],
  );
  return { busy, progress, run };
}

// ---------------------------------------------------------------------------
// Basic building blocks

export function ToolHeader({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <header className="tool-header">
      <div className="tool-icon">{icon}</div>
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </header>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PrimaryButton({
  busy,
  progress,
  children,
  ...rest
}: { busy?: boolean; progress?: string | null } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="btn btn-primary btn-lg" disabled={busy || rest.disabled} {...rest}>
      {busy ? (
        <>
          <LoaderCircle size={18} className="spin" /> {progress ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Page selection: all pages, or a custom list such as "1-3, 7". */
export function PageScope({
  all,
  setAll,
  value,
  setValue,
  total,
}: {
  all: boolean;
  setAll: (v: boolean) => void;
  value: string;
  setValue: (v: string) => void;
  total: number;
}) {
  return (
    <Field label="Pages" hint={all ? undefined : `e.g. 1-3, 5, 8-  (document has ${total} pages)`}>
      <Segmented
        value={all ? "all" : "custom"}
        onChange={(v) => setAll(v === "all")}
        options={[
          { value: "all", label: "All pages" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {!all && <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="1-3, 5" />}
    </Field>
  );
}
