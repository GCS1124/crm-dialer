import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Anushi Mittal/Downloads/Anushi Mittal Medicare Data.xlsx";
const outputDir = "C:/Users/Anushi Mittal/Downloads/GCS PROJECTS/crm dialer/.excel-work/output";

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});

await fs.writeFile(path.join(outputDir, "inspect-summary.ndjson"), summary.ndjson, "utf8");

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});

await fs.writeFile(path.join(outputDir, "sheets.ndjson"), sheets.ndjson, "utf8");

console.log(summary.ndjson);
