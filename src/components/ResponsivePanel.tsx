import { Monitor, Tablet, Smartphone, MonitorSmartphone } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/useSessionStore";
import { toAssetUrl } from "@/lib/utils";

const breakpointIcons: Record<string, React.ReactNode> = {
  Mobile: <Smartphone className="w-4 h-4" />,
  Tablet: <Tablet className="w-4 h-4" />,
  Desktop: <Monitor className="w-4 h-4" />,
  Wide: <MonitorSmartphone className="w-4 h-4" />,
};

export function ResponsivePanel() {
  const { config, screenshots } = useSessionStore();

  const breakpointScreenshots = config.responsiveBreakpoints.map((bp) => ({
    ...bp,
    screenshots: screenshots.filter(
      (s) => s.viewport.width === bp.width && s.viewport.height === bp.height,
    ),
  }));

  const hasScreenshots = breakpointScreenshots.some((bp) => bp.screenshots.length > 0);

  if (!hasScreenshots) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <MonitorSmartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No responsive test data</p>
          <p className="text-xs mt-1">Responsive screenshots will be grouped by breakpoint</p>
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {config.responsiveBreakpoints.map((bp) => (
              <Badge key={bp.name} variant="outline" className="text-xs">
                {breakpointIcons[bp.name] ?? <Monitor className="w-3 h-3 mr-1" />}
                {bp.name} ({bp.width}x{bp.height})
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {breakpointScreenshots.map((bp) => (
          <div key={bp.name}>
            <div className="flex items-center gap-2 mb-2">
              {breakpointIcons[bp.name] ?? <Monitor className="w-4 h-4" />}
              <h3 className="text-sm font-semibold">{bp.name}</h3>
              <Badge variant="outline" className="text-[10px]">
                {bp.width}x{bp.height}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {bp.screenshots.length} shots
              </Badge>
            </div>
            {bp.screenshots.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {bp.screenshots.map((ss) => (
                  <div
                    key={ss.id}
                    className="rounded-lg border border-border overflow-hidden bg-card"
                  >
                    <div className="aspect-video bg-muted">
                      <img
                        src={toAssetUrl(ss.path || ss.url)}
                        alt={ss.description}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground px-2 py-1 truncate">
                      {ss.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No screenshots at this breakpoint</p>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
