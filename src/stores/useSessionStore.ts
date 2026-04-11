import { create } from "zustand";
import type {
  SessionStatus,
  SessionConfig,
  ActionLogEntry,
  Screenshot,
  TestReport,
  McpServerStatus,
} from "@/types";
import { generateId } from "@/lib/utils";

interface SessionState {
  status: SessionStatus;
  config: SessionConfig;
  actions: ActionLogEntry[];
  screenshots: Screenshot[];
  currentUrl: string;
  report: TestReport | null;
  mcpServer: McpServerStatus;
  wsConnected: boolean;

  // Actions
  setStatus: (status: SessionStatus) => void;
  setConfig: (config: Partial<SessionConfig>) => void;
  addAction: (action: Omit<ActionLogEntry, "id" | "timestamp">) => void;
  updateAction: (id: string, update: Partial<ActionLogEntry>) => void;
  addScreenshot: (screenshot: Omit<Screenshot, "id" | "timestamp">) => void;
  setCurrentUrl: (url: string) => void;
  setReport: (report: TestReport | null) => void;
  setMcpServer: (status: McpServerStatus) => void;
  setWsConnected: (connected: boolean) => void;
  reset: () => void;
}

const defaultConfig: SessionConfig = {
  url: "",
  viewport: { width: 1280, height: 720 },
  maxPages: 20,
  enableVideo: true,
  enableA11y: true,
  enablePerformance: true,
  enableVisualRegression: false,
  responsiveBreakpoints: [
    { name: "Mobile", width: 375, height: 812 },
    { name: "Tablet", width: 768, height: 1024 },
    { name: "Desktop", width: 1280, height: 720 },
    { name: "Wide", width: 1920, height: 1080 },
  ],
};

export const useSessionStore = create<SessionState>((set) => ({
  status: "idle",
  config: defaultConfig,
  actions: [],
  screenshots: [],
  currentUrl: "",
  report: null,
  mcpServer: { running: false, port: 3100, pid: null },
  wsConnected: false,

  setStatus: (status) => set({ status }),
  setConfig: (config) =>
    set((state) => ({ config: { ...state.config, ...config } })),
  addAction: (action) =>
    set((state) => ({
      actions: [
        ...state.actions,
        { ...action, id: generateId(), timestamp: Date.now() },
      ],
    })),
  updateAction: (id, update) =>
    set((state) => ({
      actions: state.actions.map((a) => (a.id === id ? { ...a, ...update } : a)),
    })),
  addScreenshot: (screenshot) =>
    set((state) => ({
      screenshots: [
        ...state.screenshots,
        { ...screenshot, id: generateId(), timestamp: Date.now() },
      ],
    })),
  setCurrentUrl: (currentUrl) => set({ currentUrl }),
  setReport: (report) => set({ report }),
  setMcpServer: (mcpServer) => set({ mcpServer }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  reset: () =>
    set({
      status: "idle",
      actions: [],
      screenshots: [],
      currentUrl: "",
      report: null,
    }),
}));
