import { useState } from "react";
import {
  Camera,
  ExternalLink,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSessionStore } from "@/stores/useSessionStore";
import { toast } from "@/stores/useToastStore";
import {
  formatTimestamp,
  toAssetUrl,
  openExternal,
  revealInFinder,
  isTauri,
} from "@/lib/utils";

export function ScreenshotGallery() {
  const { screenshots } = useSessionStore();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const open = async (path: string) => {
    try {
      await openExternal(path);
    } catch (err) {
      toast({
        title: "Could not open screenshot",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const reveal = async (path: string) => {
    try {
      await revealInFinder(path);
    } catch (err) {
      toast({
        title: "Could not reveal in Finder",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  if (screenshots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No screenshots captured</p>
          <p className="text-xs mt-1">Screenshots will appear here during testing</p>
        </div>
      </div>
    );
  }

  const active = activeIndex != null ? screenshots[activeIndex] : null;
  const showPrev = () =>
    setActiveIndex((i) =>
      i == null ? i : (i - 1 + screenshots.length) % screenshots.length,
    );
  const showNext = () =>
    setActiveIndex((i) => (i == null ? i : (i + 1) % screenshots.length));

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="p-4 grid grid-cols-2 gap-3">
          {screenshots.map((ss, idx) => (
            <div
              key={ss.id}
              className="group relative rounded-lg border border-border overflow-hidden bg-card hover:border-primary/50 transition-colors"
            >
              <button
                type="button"
                onClick={() => setActiveIndex(idx)}
                className="block w-full aspect-video bg-muted cursor-zoom-in"
                title="Click to view full size"
              >
                <img
                  src={toAssetUrl(ss.path || ss.url)}
                  alt={ss.description}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
              <div className="p-2">
                <p className="text-xs font-medium truncate">{ss.description}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {ss.viewport.width}x{ss.viewport.height}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTimestamp(ss.timestamp)}
                  </span>
                </div>
              </div>
              {isTauri() && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Open in default app"
                    onClick={() => open(ss.path)}
                    className="p-1 rounded bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    title="Reveal in Finder"
                    onClick={() => reveal(ss.path)}
                    className="p-1 rounded bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <Dialog
        open={active != null}
        onOpenChange={(o) => !o && setActiveIndex(null)}
      >
        {active && (
          <DialogContent
            showClose
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") showPrev();
              if (e.key === "ArrowRight") showNext();
            }}
            className="w-[92vw] max-w-6xl rounded-lg border border-border bg-card shadow-2xl outline-none"
          >
            <DialogTitle className="px-4 py-2.5 border-b border-border truncate pr-10">
              {active.description}
            </DialogTitle>
            <div className="relative flex items-center justify-center bg-black/40">
              <img
                src={toAssetUrl(active.path || active.url)}
                alt={active.description}
                className="max-h-[72vh] w-auto object-contain"
              />
              {screenshots.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={showPrev}
                    title="Previous (←)"
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={showNext}
                    title="Next (→)"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
              <Badge variant="outline" className="text-[10px]">
                {active.viewport.width}x{active.viewport.height}
              </Badge>
              {activeIndex != null && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {activeIndex + 1} / {screenshots.length}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto">
                {formatTimestamp(active.timestamp)}
              </span>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
