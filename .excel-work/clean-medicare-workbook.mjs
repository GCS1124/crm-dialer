import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = "C:/Users/Anushi Mittal/Downloads/Anushi Mittal Medicare Data.xlsx";
const outputPath = "C:/Users/Anushi Mittal/Downloads/Anushi Mittal Medicare Data - Cleaned.xlsx";
const outputDir = "C:/Users/Anushi Mittal/Downloads/GCS PROJECTS/crm dialer/.excel-work/output";

await fs.mkdir(outputDir, { recursive: true });

function excelSerialToDate(serial) {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = Number(serial) * 24 * 60 * 60 * 1000;
  return new Date(epoch.getTime() + ms);
}

const input = await FileBlob.load(inputPath);
const sourceWorkbook = await SpreadsheetFile.importXlsx(input);
const sourceSheet = sourceWorkbook.worksheets.getItem("Sheet1");
const rawRows = sourceSheet.getUsedRange().values;

const headers = [
  "First Name",
  "Last Name",
  "Address",
  "City",
  "State",
  "ZIP Code",
  "Phone",
  "Email",
  "Age",
  "Source",
  "Import Date",
];

const dataRows = rawRows.slice(1).map((row) => [
  String(row[0] ?? "").trim(),
  String(row[1] ?? "").trim(),
  String(row[2] ?? "").trim(),
  String(row[3] ?? "").trim(),
  String(row[4] ?? "").trim(),
  Number(row[5] ?? 0),
  Number(row[6] ?? 0),
  String(row[7] ?? "").trim(),
  Number(row[8] ?? 0),
  String(row[9] ?? "").trim(),
  excelSerialToDate(row[10] ?? 0),
]);

const recordCount = dataRows.length;
const averageAge = Math.round(
  dataRows.reduce((sum, row) => sum + Number(row[8] || 0), 0) / Math.max(1, recordCount),
);
const uniqueCities = new Set(dataRows.map((row) => row[3]).filter(Boolean)).size;
const primarySource = dataRows[0]?.[9] || "";
const importDate = dataRows[0]?.[10] instanceof Date ? dataRows[0][10] : null;

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("Summary");
const dataSheet = workbook.worksheets.add("Medicare Data");

summarySheet.showGridLines = false;
dataSheet.showGridLines = false;

summarySheet.getRange("A1:L1").merge();
summarySheet.getRange("A1").values = [["Anushi Mittal Medicare Data"]];
summarySheet.getRange("A2:L2").merge();
summarySheet.getRange("A2").values = [[
  "Cleaned workbook with normalized headers, structured records, and summary metrics.",
]];

summarySheet.getRange("A1:L2").format = {
  fill: "#EAF3FB",
  font: { color: "#0F172A", bold: true, size: 16 },
  verticalAlignment: "center",
};
summarySheet.getRange("A2").format = {
  font: { color: "#475569", bold: false, size: 10 },
};
summarySheet.getRange("A1:L2").format.rowHeightPx = 28;
summarySheet.getRange("A4:B6").merge();
summarySheet.getRange("D4:E6").merge();
summarySheet.getRange("G4:H6").merge();
summarySheet.getRange("J4:K6").merge();

summarySheet.getRange("A4:B6").values = [[`Total Records\n${recordCount}`]];
summarySheet.getRange("D4:E6").values = [[`Average Age\n${averageAge}`]];
summarySheet.getRange("G4:H6").values = [[`Unique Cities\n${uniqueCities}`]];
summarySheet.getRange("J4:K6").values = [[
  `Import Date\n${importDate ? importDate.toISOString().slice(0, 10) : ""}`,
]];

summarySheet.getRange("A4:K6").format = {
  fill: "#FFFFFF",
  font: { color: "#0F172A", bold: true, size: 13 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};

summarySheet.getRange("A9:B15").values = [
  ["Age Band", "Count"],
  ["Under 65", `=COUNTIF('Medicare Data'!I2:I${recordCount + 1},"<65")`],
  ["65-69", `=COUNTIFS('Medicare Data'!I2:I${recordCount + 1},\">=65\",'Medicare Data'!I2:I${recordCount + 1},\"<=69\")`],
  ["70-74", `=COUNTIFS('Medicare Data'!I2:I${recordCount + 1},\">=70\",'Medicare Data'!I2:I${recordCount + 1},\"<=74\")`],
  ["75-79", `=COUNTIFS('Medicare Data'!I2:I${recordCount + 1},\">=75\",'Medicare Data'!I2:I${recordCount + 1},\"<=79\")`],
  ["80+", `=COUNTIF('Medicare Data'!I2:I${recordCount + 1},\">=80\")`],
  ["Primary Source", primarySource],
];
summarySheet.getRange("A9:B15").format.wrapText = true;
summarySheet.getRange("A9:B9").format = {
  fill: "#1D4ED8",
  font: { color: "#FFFFFF", bold: true },
};
summarySheet.getRange("A26:L28").merge();
summarySheet.getRange("A26").values = [[
  "Note: the last two unlabeled columns in the raw file were normalized to Source and Import Date based on the values present in the import.",
]];
summarySheet.getRange("A26").format = {
  fill: "#FEF3C7",
  font: { color: "#78350F", size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};

const ageChart = summarySheet.charts.add("bar", summarySheet.getRange("A9:B14"));
ageChart.title = "Age Distribution";
ageChart.setPosition("D9", "K24");
ageChart.hasLegend = false;
ageChart.xAxis = { axisType: "textAxis" };

summarySheet.getRange("A1:L20").format.columnWidthPx = 96;
summarySheet.getRange("A2:L20").format.rowHeightPx = 24;
summarySheet.getRange("A1:B15").format.columnWidthPx = 120;
summarySheet.getRange("A1:A20").format.columnWidthPx = 140;
summarySheet.getRange("B1:B20").format.columnWidthPx = 120;

dataSheet.getRange(`A1:K${recordCount + 1}`).values = [headers, ...dataRows];
dataSheet.getRange("A1:K1").format = {
  fill: "#0F5F8F",
  font: { color: "#FFFFFF", bold: true },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
dataSheet.getRange("A1:K1").format.rowHeightPx = 24;
dataSheet.getRange(`F2:F${recordCount + 1}`).format.numberFormat = "00000";
dataSheet.getRange(`G2:G${recordCount + 1}`).format.numberFormat = "(000) 000-0000";
dataSheet.getRange(`I2:I${recordCount + 1}`).format.numberFormat = "0";
dataSheet.getRange(`K2:K${recordCount + 1}`).format.numberFormat = "yyyy-mm-dd";
dataSheet.freezePanes.freezeRows(1);

dataSheet.getRange("A:A").format.columnWidthPx = 110;
dataSheet.getRange("B:B").format.columnWidthPx = 120;
dataSheet.getRange("C:C").format.columnWidthPx = 230;
dataSheet.getRange("D:D").format.columnWidthPx = 140;
dataSheet.getRange("E:E").format.columnWidthPx = 70;
dataSheet.getRange("F:F").format.columnWidthPx = 90;
dataSheet.getRange("G:G").format.columnWidthPx = 130;
dataSheet.getRange("H:H").format.columnWidthPx = 230;
dataSheet.getRange("I:I").format.columnWidthPx = 70;
dataSheet.getRange("J:J").format.columnWidthPx = 90;
dataSheet.getRange("K:K").format.columnWidthPx = 110;

dataSheet.tables.add(`A1:K${recordCount + 1}`, true, "MedicareDataTable");

const summaryInspect = await workbook.inspect({
  kind: "table",
  range: "Summary!A1:L28",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 12,
});
await fs.writeFile(path.join(outputDir, "clean-summary-inspect.ndjson"), summaryInspect.ndjson, "utf8");

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 200 },
  summary: "formula error scan",
});
await fs.writeFile(path.join(outputDir, "clean-error-scan.ndjson"), errorScan.ndjson, "utf8");

const summaryPreview = await workbook.render({
  sheetName: "Summary",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "summary-preview.png"),
  new Uint8Array(await summaryPreview.arrayBuffer()),
);

const dataPreview = await workbook.render({
  sheetName: "Medicare Data",
  range: "A1:K18",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "data-preview.png"),
  new Uint8Array(await dataPreview.arrayBuffer()),
);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({ outputPath, recordCount, averageAge, uniqueCities }, null, 2));
