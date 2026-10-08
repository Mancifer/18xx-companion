import { useEffect, useId, type ReactNode } from "react";

/** Bottom sheet on phones, centered dialog on tablets. Closes on backdrop tap and Escape. */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="ghost" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
