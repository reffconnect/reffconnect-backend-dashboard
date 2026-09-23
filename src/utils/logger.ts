/**
 * Tiny leveled logger. Kept dependency-free (and independent of the config
 * module) so it can be imported from anywhere without risking import cycles.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveThreshold(): number {
  const explicit = (process.env.LOG_LEVEL ?? '').toLowerCase() as Level;
  if (explicit in LEVEL_ORDER) return LEVEL_ORDER[explicit];
  return process.env.NODE_ENV === 'production' ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
}

const threshold = resolveThreshold();

function emit(level: Level, message: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta !== undefined) {
    stream(line, meta);
  } else {
    stream(line);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
