const logger = {
  info: (...args: any[]) => {
    console.log('\x1b[32m%s\x1b[0m', '[INFO]', ...args);
  },
  error: (...args: any[]) => {
    console.error('\x1b[31m%s\x1b[0m', '[ERROR]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('\x1b[33m%s\x1b[0m', '[WARN]', ...args);
  },
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('\x1b[36m%s\x1b[0m', '[DEBUG]', ...args);
    }
  }
};

// Simple file logger that just uses console
const fileLogger = {
  info: (logName: string, data: Record<string, unknown>) => {
    console.log('\x1b[32m%s\x1b[0m', `[FILE INFO] ${logName}:`, data);
  },
  error: (logName: string, data: Record<string, unknown>) => {
    console.error('\x1b[31m%s\x1b[0m', `[FILE ERROR] ${logName}:`, data);
  },
  warning: (logName: string, data: Record<string, unknown>) => {
    console.warn('\x1b[33m%s\x1b[0m', `[FILE WARNING] ${logName}:`, data);
  }
};

// Simple request logger that just uses console
const logRequest = () => {
  return (req: any, res: any, next: any) => {
    console.log('\x1b[35m%s\x1b[0m', `[REQUEST] ${req.method} ${req.url}`);
    next();
  };
};

export { logger, fileLogger, logRequest };
