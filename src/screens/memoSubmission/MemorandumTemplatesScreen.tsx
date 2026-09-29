import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ExternalLink, LibraryBig } from "lucide-react";
import { listMemorandumTemplates, type MemorandumTemplate } from "../../lib/storage";

/** Known templates get a friendly display name + one-line description; anything else uploaded later falls back to a prettified filename. */
const TEMPLATE_INFO: Record<string, { label: string; description: string }> = {
  "Absence_Memorandum_Last_First_DDMMMYY.docx": {
    label: "Absence Memorandum",
    description: "Starting template for submitting an Absence Memo.",
  },
  "Deviation_Memorandum_Last_First_DDMMMYY.docx": {
    label: "Deviation Memorandum",
    description: "Starting template for submitting a Deviation Memo.",
  },
  "FG_Reallocation_Memorandum_Last_FirstName.docx": {
    label: "FG Reallocation Memorandum",
    description: "Template for requesting a Flight Grade reallocation.",
  },
  "MFR_756_Template.docx": {
    label: "Memorandum for Record (MFR)",
    description: "General-purpose Memorandum for Record template.",
  },
  "Official_Memo_756_Template.docx": {
    label: "Official Memorandum",
    description: "General-purpose official memorandum template.",
  },
  "Signature_Block.docx": {
    label: "Email Signature Block",
    description: "Not a memorandum -- the standard signature block format for email communication.",
  },
};

function prettifyFileName(fileName: string): string {
  return fileName.replace(/\.docx$/i, "").replace(/_/g, " ");
}

/** Read-only reference library for everyone with Memo Submission access -- cadets can view/download these, never edit or delete them here (that only ever happens directly in Storage). */
export function MemorandumTemplatesScreen() {
  const [templates, setTemplates] = useState<MemorandumTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    listMemorandumTemplates()
      .then(setTemplates)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load templates."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <LibraryBig className="h-5 w-5 text-primary" />
        Memorandum Templates
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Reference templates to help you write your own memorandums and emails. View or download a copy -- these master copies can't be edited here.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>{templates.length > 0 ? `${templates.length} available` : "Word documents (.docx)"}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => {
                const info = TEMPLATE_INFO[t.fileName];
                return (
                  <div key={t.path} className="flex items-center justify-between gap-3 rounded-md border border-input p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{info?.label ?? prettifyFileName(t.fileName)}</div>
                        <div className="truncate text-xs text-muted-foreground">{info?.description ?? t.fileName}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a href={t.url} target="_blank" rel="noreferrer">
                        <Button type="button" size="sm" variant="secondary">
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </a>
                      <a href={t.url} download={t.fileName}>
                        <Button type="button" size="sm" variant="outline">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
