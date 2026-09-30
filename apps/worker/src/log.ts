// Structured logs: one JSON object per line on stdout. Every line carries the worker id,
// and job lines carry job_id and generation_id when the job has one.
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export function createLogger(
  base: LogFields = {},
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const emit = (level: string, msg: string, fields?: LogFields) =>
    write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...base, ...fields }));
  return {
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (fields) => createLogger({ ...base, ...fields }, write),
  };
}
