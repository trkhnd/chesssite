function format(prefix, values) {
  return [`[${prefix}]`, ...values];
}

export const logger = {
  info: (...values) => console.log(...format("info", values)),
  warn: (...values) => console.warn(...format("warn", values)),
  error: (...values) => console.error(...format("error", values)),
};
