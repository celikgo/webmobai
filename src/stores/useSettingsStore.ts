import { create } from "zustand";

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

export const useSettingsStore = create<SettingsState>((set) => ({
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
}));
