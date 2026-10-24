import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { httpsCallable } from "firebase/functions";
import { Button } from "@/components/ui/button";
import { Pencil, MessageSquarePlus, Undo2, Eraser, ChevronLeft, ChevronRight } from "lucide-react";
import { uploadMemoPdf } from "../lib/storage";
import { functions } from "../lib/firebase";

/** atob decodes to a binary string (one char per byte) -- this turns that into the Uint8Array pdfjs/pdf-lib actually want. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Bundled as its own asset by Vite (new URL(..., import.meta.url)) rather than loaded from a CDN --
// the worker has to be served from the same origin/version as the main pdfjs-dist build it pairs with.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Tool = "pen" | "comment";

interface Point {
  x: number;
  y: number;
}

type Annotation = { type: "stroke"; points: Point[] } | { type: "comment"; x: number; y: number; text: string; number: number };

const STROKE_COLOR = "#dc2626"; // matches pdf-lib rgb(0.86, 0.15, 0.15) below

interface Props {
  pdfUrl: string;
  cadetId: string;
  /** Omitted when embedded inside a larger dialog that already has its own close affordance. */
  onClose?: () => void;
}

export interface PdfMarkupReviewHandle {
  /**
   * Called by the parent right before it commits a review decision. Flattens and uploads a
   * marked-up copy if (and only if) any marks were drawn this session, resolving to its URL --
   * `undefined` means nothing was drawn, so the parent should leave any previously-saved
   * `markupPdfUrl` alone. There's no separate "export" step for cadre to remember: drawing marks
   * and deciding (Return/Accept) IS the save.
   */
  exportIfNeeded: () => Promise<string | undefined>;
}

/**
 * In-platform PDF review: draw freehand and drop numbered comments directly on the submitted PDF.
 * The marks themselves are flattened into a real, separate marked-up COPY (the original `pdfUrl`
 * is never touched) uploaded to Storage (Section 12) only when the parent calls `exportIfNeeded`
 * via the imperative handle -- in practice, right as cadre returns/accepts the memo, so the cadet
 * always sees the same annotated PDF cadre just decided against. Deliberately simple -- fixed pen
 * color/width, `window.prompt` for comment text -- this is a markup pass for cadre giving feedback,
 * not a general-purpose PDF editor.
 *
 * Fetches the PDF's bytes once via the `fetchMemoPdf` callable (afrotc-functions) rather than a
 * direct browser fetch -- the Storage bucket has no CORS policy configured, so a script-initiated
 * fetch/XHR straight to a download URL is blocked outright (a plain `<a href>`/new-tab link works
 * fine, since navigation isn't subject to CORS, which is why nothing else in this app ever hit
 * this). The callable downloads it server-side with the Admin SDK instead, sidestepping CORS
 * entirely, and reuses the same bytes for both pdfjs rendering and the pdf-lib export.
 */
export const PdfMarkupReview = forwardRef<PdfMarkupReviewHandle, Props>(function PdfMarkupReview({ pdfUrl, cadetId, onClose }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const sourceBytesRef = useRef<Uint8Array | undefined>(undefined);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | undefined>();
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [loadError, setLoadError] = useState<string | undefined>();

  // One annotation list + render scale per page, keyed by 0-based page index.
  const annotationsByPage = useRef(new Map<number, Annotation[]>());
  const scaleByPage = useRef(new Map<number, number>());
  const [renderTick, setRenderTick] = useState(0); // bumped to force an overlay redraw after an annotation changes

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetchMemoPdf = httpsCallable<{ url: string }, { base64: string }>(functions, "fetchMemoPdf");
        const result = await fetchMemoPdf({ url: pdfUrl });
        const bytes = base64ToBytes(result.data.base64);
        if (cancelled) return;
        sourceBytesRef.current = bytes;
        // A copy goes to pdfjs -- passing `data` transfers the underlying buffer to its worker
        // thread, which would otherwise detach `bytes` and break the pdf-lib export reusing it.
        const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
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
  }, [pdfUrl]);

  const redrawOverlay = () => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const annotations = annotationsByPage.current.get(pageIndex) ?? [];
    for (const a of annotations) {
      if (a.type === "stroke") {
        if (a.points.length < 2) continue;
        ctx.strokeStyle = STROKE_COLOR;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(a.points[0]!.x, a.points[0]!.y);
        for (const p of a.points.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = STROKE_COLOR;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(a.number), a.x, a.y + 1);

        // Preview of the actual "{number}. {text}" label the final exported PDF draws next to this
        // marker (see exportIfNeeded's drawText below) -- so cadre sees the real comment text live
        // while marking up, not just a bare numbered circle with no indication of what it says.
        ctx.fillStyle = STROKE_COLOR;
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const label = `${a.number}. ${a.text}`;
        const maxWidth = 280;
        const words = label.split(" ");
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(test).width > maxWidth) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        const lineHeight = 14;
        const startY = a.y - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((l, i) => ctx.fillText(l, a.x + 16, startY + i * lineHeight));
      }
    }
    // The in-progress stroke, drawn live while the pointer is still down.
    if (drawingRef.current && currentStrokeRef.current.length > 1) {
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(currentStrokeRef.current[0]!.x, currentStrokeRef.current[0]!.y);
      for (const p of currentStrokeRef.current.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };

  // Render the current page to the base canvas and size the overlay to match, whenever the page or
  // pdf changes -- the container's own width decides the render scale, capped so a huge page doesn't
  // render at a silly resolution.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const unscaled = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current?.clientWidth ?? 800;
      const scale = Math.min(Math.max(containerWidth / unscaled.width, 0.5), 2.5);
      scaleByPage.current.set(pageIndex, scale);
      const viewport = page.getViewport({ scale });
      const canvas = pageCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!canvas || !overlay || cancelled) return;
      // Phones run at devicePixelRatio 2-3 -- sizing the canvas's pixel buffer to CSS pixels 1:1
      // (what this used to do) left the browser upscaling a lower-resolution bitmap to fill those
      // extra physical pixels, which read as blurry on a retina phone screen even though it looked
      // fine on a devicePixelRatio-1 desktop monitor. The buffer is oversized by `dpr` and the
      // element's CSS size is pinned back down to the original viewport size, so every drawing call
      // below (and pointerPos/toPdf elsewhere, both already working in CSS-pixel terms via
      // getBoundingClientRect) keeps using the same coordinate space as before.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      overlay.width = viewport.width * dpr;
      overlay.height = viewport.height * dpr;
      overlay.style.width = `${viewport.width}px`;
      overlay.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      overlay.getContext("2d")?.scale(dpr, dpr);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      if (!cancelled) redrawOverlay();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, pageIndex]);

  useEffect(() => {
    redrawOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick, pageIndex]);

  const nextCommentNumber = useMemo(() => {
    let max = 0;
    for (const list of annotationsByPage.current.values()) {
      for (const a of list) if (a.type === "comment") max = Math.max(max, a.number);
    }
    return max + 1;
  }, [renderTick]);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = pointerPos(e);
    if (tool === "comment") {
      const text = window.prompt("Comment text:");
      if (text && text.trim()) {
        const list = annotationsByPage.current.get(pageIndex) ?? [];
        list.push({ type: "comment", x: pos.x, y: pos.y, text: text.trim(), number: nextCommentNumber });
        annotationsByPage.current.set(pageIndex, list);
        setRenderTick((t) => t + 1);
      }
      return;
    }
    drawingRef.current = true;
    currentStrokeRef.current = [pos];
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    currentStrokeRef.current.push(pointerPos(e));
    redrawOverlay();
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentStrokeRef.current.length > 1) {
      const list = annotationsByPage.current.get(pageIndex) ?? [];
      list.push({ type: "stroke", points: currentStrokeRef.current });
      annotationsByPage.current.set(pageIndex, list);
    }
    currentStrokeRef.current = [];
    setRenderTick((t) => t + 1);
  };

  const handleUndo = () => {
    const list = annotationsByPage.current.get(pageIndex) ?? [];
    list.pop();
    annotationsByPage.current.set(pageIndex, list);
    setRenderTick((t) => t + 1);
  };

  const handleClear = () => {
    annotationsByPage.current.set(pageIndex, []);
    setRenderTick((t) => t + 1);
  };

  const hasAnyAnnotations = useMemo(() => {
    for (const list of annotationsByPage.current.values()) if (list.length > 0) return true;
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick]);

  useImperativeHandle(ref, () => ({
    exportIfNeeded: async () => {
      const sourceBytes = sourceBytesRef.current;
      const hasAny = [...annotationsByPage.current.values()].some((list) => list.length > 0);
      if (!sourceBytes || !hasAny) return undefined;

      const outDoc = await PDFDocument.load(sourceBytes);
      const font = await outDoc.embedFont(StandardFonts.Helvetica);
      const markColor = rgb(0.86, 0.15, 0.15);
      const pages = outDoc.getPages();

      for (const [pageIdx, annotations] of annotationsByPage.current.entries()) {
        const page = pages[pageIdx];
        const scale = scaleByPage.current.get(pageIdx);
        if (!page || !scale || annotations.length === 0) continue;
        const { height } = page.getSize();
        const toPdf = (p: Point) => ({ x: p.x / scale, y: height - p.y / scale });

        for (const a of annotations) {
          if (a.type === "stroke") {
            for (let i = 1; i < a.points.length; i++) {
              const start = toPdf(a.points[i - 1]!);
              const end = toPdf(a.points[i]!);
              page.drawLine({ start, end, thickness: 1.5, color: markColor, opacity: 0.9 });
            }
          } else {
            const { x, y } = toPdf(a);
            page.drawRectangle({ x: x - 7, y: y - 7, width: 14, height: 14, color: markColor, opacity: 0.9 });
            page.drawText(String(a.number), { x: x - (a.number >= 10 ? 6.5 : 3.5), y: y - 4, size: 9, font, color: rgb(1, 1, 1) });
            page.drawText(`${a.number}. ${a.text}`, { x: x + 10, y: y - 4, size: 9, font, color: markColor, maxWidth: 260 });
          }
        }
      }

      const outBytes = await outDoc.save();
      const file = new File([outBytes as unknown as BlobPart], `markup-${Date.now()}.pdf`, { type: "application/pdf" });
      const uploaded = await uploadMemoPdf(file, "deviationMemos", cadetId);
      return uploaded.url;
    },
  }));

  return (
    <div className="flex h-[80vh] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={tool === "pen" ? "default" : "outline"} onClick={() => setTool("pen")}>
          <Pencil className="h-3.5 w-3.5" />
          Pen
        </Button>
        <Button type="button" size="sm" variant={tool === "comment" ? "default" : "outline"} onClick={() => setTool("comment")}>
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Comment
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleUndo}>
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleClear}>
          <Eraser className="h-3.5 w-3.5" />
          Clear page
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
        {hasAnyAnnotations && (
          <span className="ml-auto text-xs text-muted-foreground">Marks are saved when you Return or Accept below.</span>
        )}
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <div ref={containerRef} className="flex-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
        {!pdfDoc && !loadError && <p className="p-6 text-center text-sm text-muted-foreground">Loading PDF…</p>}
        <div className="relative mx-auto w-fit">
          <canvas ref={pageCanvasRef} className="block" />
          <canvas
            ref={overlayCanvasRef}
            className="absolute left-0 top-0 touch-none"
            style={{ cursor: tool === "pen" ? "crosshair" : "copy" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </div>
      </div>

      {onClose && (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
});
