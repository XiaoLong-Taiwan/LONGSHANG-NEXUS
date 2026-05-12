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
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-app px-4 py-3 text-left font-semibold text-app-muted">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-app-muted" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={index} className="align-top">
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="border-b border-app px-4 py-3 text-app">
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
