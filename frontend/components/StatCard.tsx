type Props = {
  title: string;
  value: string | number;
  hint: string;
};

export default function StatCard({ title, value, hint }: Props) {
  return (
    <div className="panel p-5">
      <p className="text-sm text-app-muted">{title}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <h3 className="text-3xl font-semibold text-app">{value}</h3>
        <span className="badge-muted">{hint}</span>
      </div>
    </div>
  );
}
