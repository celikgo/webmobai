import {
  Activity,
  Camera,
  FileText,
  Settings2,
  Layers,
  Accessibility,
  Gauge,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useSessionStore } from "@/stores/useSessionStore";
import { cn } from "@/lib/utils";

export type SidebarTab =
  | "actions"
  | "screenshots"
  | "report"
  | "accessibility"
  | "performance"
  | "responsive"
  | "config";

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

const tabs: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
  { id: "actions", label: "Action Log", icon: <Activity className="w-5 h-5" /> },
  { id: "screenshots", label: "Screenshots", icon: <Camera className="w-5 h-5" /> },
  { id: "report", label: "Test Report", icon: <FileText className="w-5 h-5" /> },
  { id: "accessibility", label: "Accessibility", icon: <Accessibility className="w-5 h-5" /> },
  { id: "performance", label: "Performance", icon: <Gauge className="w-5 h-5" /> },
  { id: "responsive", label: "Responsive", icon: <Monitor className="w-5 h-5" /> },
  { id: "config", label: "Configuration", icon: <Settings2 className="w-5 h-5" /> },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { screenshots, report, actions } = useSessionStore();
  const errorCount = actions.filter((a) => a.status === "error").length;

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="w-14 border-r border-border bg-sidebar flex flex-col items-center py-3 gap-1">
        {/* App icon */}
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
          <Layers className="w-5 h-5 text-primary" />
        </div>

        <Separator className="w-8 mb-1" />

        {tabs.map((tab) => (
          <Tooltip key={tab.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "relative w-10 h-10",
                  activeTab === tab.id && "bg-accent text-accent-foreground",
                )}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.icon}
                {/* Badge counts */}
                {tab.id === "screenshots" && screenshots.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-[9px] flex items-center justify-center text-primary-foreground font-bold">
                    {screenshots.length > 99 ? "99" : screenshots.length}
                  </span>
                )}
                {tab.id === "actions" && errorCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-[9px] flex items-center justify-center text-destructive-foreground font-bold">
                    {errorCount}
                  </span>
                )}
                {tab.id === "report" && report && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-success text-[9px] flex items-center justify-center text-success-foreground font-bold">
                    <FileText className="w-2.5 h-2.5" />
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{tab.label}</TooltipContent>
          </Tooltip>
        ))}

        <div className="mt-auto">
          <Badge variant="outline" className="text-[9px] px-1 py-0.5">
            v1.0
          </Badge>
        </div>
      </aside>
    </TooltipProvider>
  );
}
