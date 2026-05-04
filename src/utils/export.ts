export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row))),
  );
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const cell = row[header];
          const value =
            cell === null || cell === undefined
              ? ""
              : Array.isArray(cell)
                ? cell.join("; ")
                : String(cell);
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
