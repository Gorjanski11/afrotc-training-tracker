import { FileDown } from "lucide-react";

/** Icon-only "open PDF" button -- no filename/link text shown, so dense tables stay narrow. */
export function PdfLinkButton({ url, name }: { url: string | undefined; name: string | undefined }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={name ?? "PDF"}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input text-primary hover:bg-accent"
    >
      <FileDown className="h-3.5 w-3.5" />
    </a>
  );
}
