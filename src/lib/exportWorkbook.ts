export interface ExportSheet {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

/**
 * Builds a multi-sheet .xlsx workbook client-side and triggers a browser download -- no backend
 * needed, same pattern as the PDF uploads elsewhere in this ecosystem. `exceljs` is dynamically
 * imported here so it only ever loads for someone who actually clicks an export button, instead of
 * bloating the main bundle everyone downloads on every visit.
 */
export async function downloadWorkbook(filename: string, sheets: ExportSheet[]): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Borinkeneers AFROTC Det 756";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.columns;
    ws.addRows(sheet.rows);
    ws.getRow(1).font = { bold: true };
    if (sheet.columns.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}
