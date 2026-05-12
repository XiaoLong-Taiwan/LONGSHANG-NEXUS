import { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  action?: ReactNode;
};

export default function PageHeader({ title, description, action }: Props) {
  return (
    <div className="panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-app-muted">Admin</p>
        <h2 className="mt-2 text-2xl font-semibold text-app md:text-3xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-app-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
