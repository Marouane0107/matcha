import { useId, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { errorMessage } from "../utils/errors";

export function Field({ label, error, hint, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input {...props} id={id} type={type === "password" && visible ? "text" : type} aria-invalid={Boolean(error)} aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined} />
      {type === "password" && <label className="password-toggle"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /> Show {label.toLowerCase()}</label>}
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  return error ? <div className="notice error" role="alert">{errorMessage(error)}</div> : null;
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return <div className="notice success" role="status">{children}</div>;
}

export function useTask() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try { await action(); } catch (cause) { setError(cause); }
    finally { locked.current = false; setBusy(false); }
  }
  return { busy, error, run };
}

export const formValue = (data: FormData, key: string) => String(data.get(key) ?? "");