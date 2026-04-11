type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

class Logger {
  private level: LogLevel = "info";

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: LogLevel, message: string, ...args: unknown[]): string {
    const ts = new Date().toISOString().substring(11, 23);
    const prefix = `${LOG_COLORS[level]}[${ts}] [${level.toUpperCase()}]${RESET}`;
    const formatted = args.length > 0 ? `${message} ${args.map(a => JSON.stringify(a)).join(" ")}` : message;
    return `${prefix} ${formatted}`;
  }

  debug(message: string, ...args: unknown[]) {
    if (this.shouldLog("debug")) {
      console.error(this.format("debug", message, ...args));
    }
  }

  info(message: string, ...args: unknown[]) {
    if (this.shouldLog("info")) {
      console.error(this.format("info", message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]) {
    if (this.shouldLog("warn")) {
      console.error(this.format("warn", message, ...args));
    }
  }

  error(message: string, ...args: unknown[]) {
    if (this.shouldLog("error")) {
      console.error(this.format("error", message, ...args));
    }
  }
}

export const logger = new Logger();
