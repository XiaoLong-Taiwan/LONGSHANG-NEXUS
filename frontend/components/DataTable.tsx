import { ReactNode } from "react";

type Props = {
  columns: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
};

export default function DataTable({ columns, rows, emptyMessage = "No data available yet." }: Props) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 text-left font-semibold text-slate-500">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={index} className="align-top">
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
