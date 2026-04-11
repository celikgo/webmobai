import {
  Globe,
  Play,
  Square,
  Settings,
  Sun,
  Moon,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/useSessionStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useState, useRef } from "react";

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  const {
    status,
    config,
    setConfig,
    setStatus,
    addAction,
    addScreenshot,
    setReport,
    reset,
  } = useSessionStore();
  const { theme, setTheme } = useSettingsStore();
  const [urlInput, setUrlInput] = useState(config.url);
  const childRef = useRef<{ kill: () => void } | null>(null);

  const handleStart = async () => {
    if (!urlInput.trim()) return;
    let url = urlInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    reset();
    setConfig({ url });
    setStatus("starting");
    addAction({
      type: "info",
      description: `Starting autonomous test for ${url}`,
      status: "running",
    });

    try {
      // Check if running in Tauri
      const isTauri = "__TAURI__" in window;

      if (isTauri) {
        // Use Tauri shell to spawn the auto-test runner
        const { Command } = await import("@tauri-apps/plugin-shell");
        const cmd = Command.create("node", [
          "/Users/celikgo/WebstormProjects/web-run/mcp-server/dist/auto-test.js",
          url,
        ]);

        setStatus("running");

        cmd.stdout.on("data", (line: string) => {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "action") {
              addAction(msg.data);
            } else if (msg.type === "screenshot") {
              addScreenshot(msg.data);
            } else if (msg.type === "report") {
              setReport(msg.data);
            }
          } catch {
            // ignore non-JSON lines
          }
        });

        cmd.stderr.on("data", (line: string) => {
          console.error("[auto-test]", line);
        });

        cmd.on("error", (err: string) => {
          addAction({
            type: "error",
            description: `Test runner error: ${err}`,
            status: "error",
          });
          setStatus("error");
        });

        cmd.on("close", (data: { code: number | null }) => {
          if (data.code === 0 || data.code === null) {
            setStatus("completed");
          } else {
            setStatus("error");
          }
          childRef.current = null;
        });

        const child = await cmd.spawn();
        childRef.current = child;
      } else {
        // Browser dev mode — show instructions
        setStatus("running");
        addAction({
          type: "info",
          description: "Running in browser dev mode",
          details:
            "Auto-test requires the Tauri desktop app. Run 'cargo tauri dev' to use the full app, or connect Claude via MCP.",
          status: "success",
        });
      }
    } catch (err) {
      addAction({
        type: "error",
        description: `Failed to start test: ${String(err)}`,
        status: "error",
      });
      setStatus("error");
    }
  };

  const handleStop = () => {
    if (childRef.current) {
      childRef.current.kill();
      childRef.current = null;
    }
    setStatus("completed");
    addAction({
      type: "info",
      description: "Session stopped by user",
      status: "success",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleStart();
  };

  const isRunning = status === "running" || status === "starting";

  return (
    <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Brain className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-sm tracking-tight">WebMobAI</span>
      </div>

      {/* URL Bar */}
      <div className="flex-1 flex items-center gap-2 max-w-2xl">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL to test (e.g., https://example.com)"
            className="pl-10 bg-background"
            disabled={isRunning}
          />
        </div>
        {isRunning ? (
          <Button variant="destructive" size="sm" onClick={handleStop}>
            <Square className="w-4 h-4" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={handleStart} disabled={!urlInput.trim()}>
            <Play className="w-4 h-4" />
            Test
          </Button>
        )}
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Session status */}
        {status !== "idle" && (
          <Badge
            variant={
              status === "running"
                ? "default"
                : status === "completed"
                  ? "success"
                  : status === "error"
                    ? "destructive"
                    : "secondary"
            }
          >
            {status === "running" && (
              <span className="w-2 h-2 rounded-full bg-current animate-pulse-dot mr-1" />
            )}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        )}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Settings */}
        <Button variant="ghost" size="icon" onClick={onOpenSettings}>
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
