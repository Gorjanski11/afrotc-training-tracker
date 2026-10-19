import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { httpsCallable } from "firebase/functions";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { functions } from "../lib/firebase";

/** atob decodes to a binary string (one char per byte) -- this turns that into the Uint8Array pdfjs wants. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props {
  url: string;
}

/**
 * Read-only PDF preview -- no drawing, just render + page nav + an "Open in browser" escape hatch.
 * Goes through the same `fetchMemoPdf` callable PdfMarkupReview uses: the Storage bucket has no
 * CORS policy configured, so a script-initiated fetch straight to a download URL is blocked
 * outright, while a plain `<a href>` new-tab open isn't (navigation isn't subject to CORS) --
 * that's exactly what the "Open in browser" link below falls back to.
 */
export function PdfPreview({ url }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | undefined>();
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setPdfDoc(undefined);
    setPageIndex(0);
    setLoadError(undefined);
    (async () => {
      try {
        const fetchMemoPdf = httpsCallable<{ url: string }, { base64: string }>(functions, "fetchMemoPdf");
        const result = await fetchMemoPdf({ url });
        if (cancelled) return;
        const bytes = base64ToBytes(result.data.base64);
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load the PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const unscaled = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current?.clientWidth ?? 800;
      const scale = Math.min(Math.max(containerWidth / unscaled.width, 0.5), 2.5);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex]);

  return (
    <div className="flex h-[55vh] flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open in browser
          </a>
        </Button>
        {numPages > 1 && (
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Button type="button" size="icon" variant="ghost" disabled={pageIndex === 0} onClick={() => setPageIndex((i) => i - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            Page {pageIndex + 1} / {numPages}
            <Button type="button" size="icon" variant="ghost" disabled={pageIndex === numPages - 1} onClick={() => setPageIndex((i) => i + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      <div ref={containerRef} className="flex-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
        {!pdfDoc && !loadError && <p className="p-6 text-center text-sm text-muted-foreground">Loading PDF…</p>}
        <canvas ref={canvasRef} className="mx-auto block" />
      </div>
    </div>
  );
}
