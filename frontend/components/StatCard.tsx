type Props = {
  title: string;
  value: string | number;
  hint: string;
};

export default function StatCard({ title, value, hint }: Props) {
  return (
    <div className="panel p-6">
      <p className="text-sm text-slate-500">{title}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <h3 className="text-3xl font-semibold text-slate-950">{value}</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{hint}</span>
      </div>
    </div>
  );
}
