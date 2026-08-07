type LogFields = Record<string, unknown>;

function write(level: 'info' | 'warn' | 'error', fields: LogFields): void {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...fields }));
}

export const logger = {
  info: (fields: LogFields) => write('info', fields),
  warn: (fields: LogFields) => write('warn', fields),
  error: (fields: LogFields) => write('error', fields),
};
