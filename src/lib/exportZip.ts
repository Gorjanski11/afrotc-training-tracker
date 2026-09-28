import { listAllMemoPdfs } from "./storage";

/**
 * Bundles every Absence/Deviation Memo PDF in Storage into one .zip and triggers a browser download
 * -- used by New Semester right before it permanently deletes them all. `jszip` is dynamically
 * imported so it only loads for someone actually running this, same pattern as exceljs in
 * exportWorkbook.ts. Files are fetched by URL (Storage already serves them with permissive CORS,
 * same as the existing "open in new tab" links in Data Management) and named
 * "<folder>/<cadet name or id>/<original filename>" inside the archive so they stay organized.
 */
export async function downloadMemoPdfZip(filename: string, roster: { id: string; name: string }[]): Promise<{ fileCount: number }> {
  const [{ default: JSZip }, pdfs] = await Promise.all([import("jszip"), listAllMemoPdfs()]);
  const zip = new JSZip();
  const rosterById = new Map(roster.map((r) => [r.id, r.name]));

  await Promise.all(
    pdfs.map(async (pdf) => {
      const res = await fetch(pdf.url);
      const blob = await res.blob();
      const cadetName = rosterById.get(pdf.cadetId) ?? pdf.cadetId;
      zip.file(`${pdf.folder}/${cadetName}/${pdf.fileName}`, blob);
    })
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { fileCount: pdfs.length };
}
