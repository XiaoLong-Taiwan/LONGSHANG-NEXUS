import { PropsWithChildren } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
};

export default function Modal({ open, onClose, title, children }: PropsWithChildren<Props>) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="panel max-h-[90vh] w-full max-w-4xl overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="text-2xl font-semibold text-slate-950">{title}</h3>
          <button className="btn-secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
