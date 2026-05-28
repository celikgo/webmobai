import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  theme: "dark" | "light" | "system";
  mcpPort: number;
  screenshotDir: string;
  videoEnabled: boolean;
  alwaysOnTop: boolean;
  autoStartMcp: boolean;

  setTheme: (theme: "dark" | "light" | "system") => void;
  setMcpPort: (port: number) => void;
  setScreenshotDir: (dir: string) => void;
  setVideoEnabled: (enabled: boolean) => void;
  setAlwaysOnTop: (enabled: boolean) => void;
  setAutoStartMcp: (enabled: boolean) => void;
}

// Settings are persisted to localStorage so theme, MCP port, and the other
// preferences survive an app restart. Only plain preference fields are stored;
// the setter functions are recreated on each load.
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      mcpPort: 3100,
      screenshotDir: "./screenshots",
      videoEnabled: true,
      alwaysOnTop: false,
      autoStartMcp: true,

      setTheme: (theme) => set({ theme }),
      setMcpPort: (mcpPort) => set({ mcpPort }),
      setScreenshotDir: (screenshotDir) => set({ screenshotDir }),
      setVideoEnabled: (videoEnabled) => set({ videoEnabled }),
      setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
      setAutoStartMcp: (autoStartMcp) => set({ autoStartMcp }),
    }),
    {
      name: "webmobai-settings",
      partialize: (state) => ({
        theme: state.theme,
        mcpPort: state.mcpPort,
        screenshotDir: state.screenshotDir,
        videoEnabled: state.videoEnabled,
        alwaysOnTop: state.alwaysOnTop,
        autoStartMcp: state.autoStartMcp,
      }),
    },
  ),
);
