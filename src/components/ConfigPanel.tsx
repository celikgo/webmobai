import { Settings2, Plus, Trash2, Monitor, Smartphone, Tablet } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSessionStore } from "@/stores/useSessionStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useState } from "react";

export function ConfigPanel() {
  const { config, setConfig } = useSessionStore();
  const { mcpPort, setMcpPort } = useSettingsStore();
  const [newBpName, setNewBpName] = useState("");
  const [newBpWidth, setNewBpWidth] = useState("1024");
  const [newBpHeight, setNewBpHeight] = useState("768");

  const addBreakpoint = () => {
    if (!newBpName.trim()) return;
    setConfig({
      responsiveBreakpoints: [
        ...config.responsiveBreakpoints,
        {
          name: newBpName.trim(),
          width: parseInt(newBpWidth) || 1024,
          height: parseInt(newBpHeight) || 768,
        },
      ],
    });
    setNewBpName("");
  };

  const removeBreakpoint = (index: number) => {
    setConfig({
      responsiveBreakpoints: config.responsiveBreakpoints.filter((_, i) => i !== index),
    });
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="w-4 h-4" />
          <h2 className="text-sm font-semibold">Session Configuration</h2>
        </div>

        {/* MCP Server */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            MCP Server
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-sm w-20 shrink-0">Port</label>
            <Input
              type="number"
              value={mcpPort}
              onChange={(e) => setMcpPort(parseInt(e.target.value) || 3100)}
              className="w-24"
            />
          </div>
        </section>

        <Separator />

        {/* Viewport */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Default Viewport
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-sm w-20 shrink-0">Width</label>
            <Input
              type="number"
              value={config.viewport.width}
              onChange={(e) =>
                setConfig({
                  viewport: { ...config.viewport, width: parseInt(e.target.value) || 1280 },
                })
              }
              className="w-24"
            />
            <label className="text-sm w-20 shrink-0">Height</label>
            <Input
              type="number"
              value={config.viewport.height}
              onChange={(e) =>
                setConfig({
                  viewport: { ...config.viewport, height: parseInt(e.target.value) || 720 },
                })
              }
              className="w-24"
            />
          </div>
        </section>

        <Separator />

        {/* Test Credentials */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Test Credentials (optional)
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-sm w-20 shrink-0">Username</label>
            <Input
              value={config.credentials?.username ?? ""}
              onChange={(e) =>
                setConfig({
                  credentials: {
                    username: e.target.value,
                    password: config.credentials?.password ?? "",
                  },
                })
              }
              placeholder="test@example.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm w-20 shrink-0">Password</label>
            <Input
              type="password"
              value={config.credentials?.password ?? ""}
              onChange={(e) =>
                setConfig({
                  credentials: {
                    username: config.credentials?.username ?? "",
                    password: e.target.value,
                  },
                })
              }
              placeholder="password"
            />
          </div>
        </section>

        <Separator />

        {/* Limits */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Exploration Limits
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-sm w-20 shrink-0">Max Pages</label>
            <Input
              type="number"
              value={config.maxPages}
              onChange={(e) => setConfig({ maxPages: parseInt(e.target.value) || 20 })}
              className="w-24"
            />
          </div>
        </section>

        <Separator />

        {/* Responsive Breakpoints */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Responsive Breakpoints
          </h3>
          <div className="space-y-1">
            {config.responsiveBreakpoints.map((bp, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded border border-border bg-card"
              >
                {bp.name === "Mobile" ? (
                  <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                ) : bp.name === "Tablet" ? (
                  <Tablet className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="text-sm flex-1">{bp.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {bp.width}x{bp.height}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => removeBreakpoint(i)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newBpName}
              onChange={(e) => setNewBpName(e.target.value)}
              placeholder="Name"
              className="flex-1"
            />
            <Input
              type="number"
              value={newBpWidth}
              onChange={(e) => setNewBpWidth(e.target.value)}
              placeholder="W"
              className="w-16"
            />
            <Input
              type="number"
              value={newBpHeight}
              onChange={(e) => setNewBpHeight(e.target.value)}
              placeholder="H"
              className="w-16"
            />
            <Button size="sm" variant="outline" onClick={addBreakpoint} disabled={!newBpName.trim()}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
