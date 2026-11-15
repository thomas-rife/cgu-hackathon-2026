"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function PopoutDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[min(480px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/30"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-base font-semibold">{title}</h2><button type="button" aria-label={`Close ${title.toLowerCase()}`} className="grid size-7 place-items-center rounded-md text-slate-600 hover:bg-slate-100" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </dialog>, document.body,
  );
}
