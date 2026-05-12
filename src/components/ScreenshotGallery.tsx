import { Camera, ExternalLink, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/useSessionStore";
import { formatTimestamp, toAssetUrl } from "@/lib/utils";

export function ScreenshotGallery() {
  const { screenshots } = useSessionStore();

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

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 grid grid-cols-2 gap-3">
        {screenshots.map((ss) => (
          <div
            key={ss.id}
            className="group relative rounded-lg border border-border overflow-hidden bg-card hover:border-primary/50 transition-colors"
          >
            <div className="aspect-video bg-muted flex items-center justify-center">
              <img
                src={toAssetUrl(ss.path || ss.url)}
                alt={ss.description}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
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
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-1 rounded bg-black/60 text-white hover:bg-black/80">
                <ExternalLink className="w-3 h-3" />
              </button>
              <button className="p-1 rounded bg-black/60 text-white hover:bg-black/80">
                <Download className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
