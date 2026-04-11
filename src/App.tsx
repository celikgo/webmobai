import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar, type SidebarTab } from "@/components/layout/Sidebar";
import { ActionLog } from "@/components/layout/ActionLog";
import { ScreenshotGallery } from "@/components/ScreenshotGallery";
import { TestReport } from "@/components/TestReport";
import { AccessibilityPanel } from "@/components/AccessibilityPanel";
import { PerformancePanel } from "@/components/PerformancePanel";
import { ResponsivePanel } from "@/components/ResponsivePanel";
import { ConfigPanel } from "@/components/ConfigPanel";
import { useSettingsStore } from "@/stores/useSettingsStore";

function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { theme, setTheme, mcpPort, setMcpPort, autoStartMcp, setAutoStartMcp } =
    useSettingsStore();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-[480px] max-h-[600px] overflow-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Theme</label>
              <div className="flex gap-2">
                {(["dark", "light", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors cursor-pointer ${
                      theme === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">MCP Server Port</label>
              <input
                type="number"
                value={mcpPort}
                onChange={(e) => setMcpPort(parseInt(e.target.value) || 3100)}
                className="flex h-9 w-24 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Auto-start MCP Server</label>
              <button
                onClick={() => setAutoStartMcp(!autoStartMcp)}
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${
                  autoStartMcp ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    autoStartMcp ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelComponents: Record<SidebarTab, React.ComponentType> = {
  actions: ActionLog,
  screenshots: ScreenshotGallery,
  report: TestReport,
  accessibility: AccessibilityPanel,
  performance: PerformancePanel,
  responsive: ResponsivePanel,
  config: ConfigPanel,
};

const panelTitles: Record<SidebarTab, string> = {
  actions: "Action Log",
  screenshots: "Screenshots",
  report: "Test Report",
  accessibility: "Accessibility Audit",
  performance: "Performance Metrics",
  responsive: "Responsive Testing",
  config: "Configuration",
};

export function App() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("actions");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme } = useSettingsStore();

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.className = isDark ? "dark" : "light";
    } else {
      root.className = theme;
    }
  }, [theme]);

  const ActivePanel = panelComponents[activeTab];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-2 border-b border-border bg-card/50">
            <h2 className="text-sm font-semibold">{panelTitles[activeTab]}</h2>
          </div>
          {/* Panel content */}
          <ActivePanel />
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
