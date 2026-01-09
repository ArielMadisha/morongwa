// Simple logger utility for debugging and error tracking
interface LogContext {
  [key: string]: any;
}

class Logger {
  info(message: string, context?: LogContext): void {
    console.log(`[INFO] ${message}`, context ? JSON.stringify(context, null, 2) : "");
  }

  error(message: string, context?: LogContext): void {
    console.error(`[ERROR] ${message}`, context ? JSON.stringify(context, null, 2) : "");
  }

  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context, null, 2) : "");
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`, context ? JSON.stringify(context, null, 2) : "");
    }
  }
}

export default new Logger();
