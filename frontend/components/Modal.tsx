import { PropsWithChildren } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closeLabel?: string;
};

export default function Modal({ open, onClose, title, description, closeLabel = "Close", children }: PropsWithChildren<Props>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="panel max-h-[90vh] w-full max-w-4xl overflow-auto p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-slate-950">{title}</h3>
            {description ? <p className="mt-2 max-w-2xl text-sm text-slate-500">{description}</p> : null}
          </div>
          <button className="btn-secondary" onClick={onClose} type="button">
            {closeLabel}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
