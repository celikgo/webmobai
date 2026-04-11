import {
  Globe,
  Play,
  Square,
  Settings,
  Sun,
  Moon,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/useSessionStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useState } from "react";

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  const { status, config, setConfig, setStatus, mcpServer, wsConnected, addAction, reset } =
    useSessionStore();
  const { theme, setTheme } = useSettingsStore();
  const [urlInput, setUrlInput] = useState(config.url);

  const handleStart = () => {
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
      description: `Session started for ${url}`,
      status: "success",
    });
    addAction({
      type: "info",
      description: "Waiting for Claude to begin autonomous testing via MCP...",
      details: "Connect Claude Desktop or Claude Code to the MCP server to start testing.",
      status: "pending",
    });
    setStatus("running");
  };

  const handleStop = () => {
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
          <Globe className="w-4 h-4 text-primary-foreground" />
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
        {/* MCP Server status */}
        <Badge variant={mcpServer.running ? "success" : "secondary"} className="gap-1">
          {wsConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          MCP {mcpServer.running ? `ON :${mcpServer.port}` : "OFF"}
        </Badge>

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
