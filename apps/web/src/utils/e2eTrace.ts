export type TraceLevel = "error" | "warn" | "info" | "debug" | "trace";

type TraceRecord = {
  ts: number;
  isoTs: string;
  level: TraceLevel;
  event: string;
  protocolVersion: string;
  cipherSuite: string;
  kdf: string;
  payload: Record<string, unknown>;
};

const LEVEL_ORDER: Record<TraceLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const TRACE_ENABLED_KEY = "buzzu:e2e:trace:enabled";
const TRACE_LEVEL_KEY = "buzzu:e2e:trace:level";
const TRACE_MAX_LOGS_KEY = "buzzu:e2e:trace:max";
const DEFAULT_PROTOCOL_VERSION = "signal-dr-v1";
const DEFAULT_CIPHER_SUITE = "aes-256-gcm";
const DEFAULT_KDF = "hkdf-sha256";
const DEFAULT_MAX_LOGS = 3000;

type TraceRuntimeConfig = {
  enabled?: boolean;
  level?: TraceLevel;
  maxLogs?: number;
};

declare global {
  interface Window {
    __BUZZU_E2E_TRACE__?: TraceRuntimeConfig;
    __BUZZU_E2E_TRACE_LOGS__?: TraceRecord[];
    __BUZZU_E2E_TRACE_EXPORT__?: () => TraceRecord[];
    __BUZZU_E2E_TRACE_CLEAR__?: () => void;
  }
}

const normalizeLevel = (value: unknown): TraceLevel => {
  if (
    value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug" ||
    value === "trace"
  ) {
    return value;
  }
  return "debug";
};

const readConfig = (): Required<TraceRuntimeConfig> => {
  const devEnabled = import.meta.env.DEV;
  if (typeof window === "undefined") {
    return { enabled: devEnabled, level: "debug", maxLogs: DEFAULT_MAX_LOGS };
  }
  const runtime = window.__BUZZU_E2E_TRACE__ ?? {};
  const enabledStorage = localStorage.getItem(TRACE_ENABLED_KEY);
  const levelStorage = localStorage.getItem(TRACE_LEVEL_KEY);
  const maxStorage = Number(localStorage.getItem(TRACE_MAX_LOGS_KEY) ?? "");
  const enabled =
    typeof runtime.enabled === "boolean"
      ? runtime.enabled
      : enabledStorage === "1"
        ? true
        : enabledStorage === "0"
          ? false
          : devEnabled;
  const level = normalizeLevel(runtime.level ?? levelStorage ?? "debug");
  const maxLogs =
    Number.isFinite(runtime.maxLogs) && (runtime.maxLogs ?? 0) > 0
      ? Number(runtime.maxLogs)
      : Number.isFinite(maxStorage) && maxStorage > 0
        ? maxStorage
        : DEFAULT_MAX_LOGS;
  return { enabled, level, maxLogs };
};

const fnv1aHex = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const fingerprintValue = (value?: string | null): string | null => {
  if (!value) return null;
  return `fp_${fnv1aHex(value)}_${value.length}`;
};

export const fingerprintBytes = (value?: Uint8Array | null): string | null => {
  if (!value) return null;
  let str = "";
  for (let i = 0; i < value.length; i++) {
    str += String.fromCharCode(value[i]);
  }
  return `fp_${fnv1aHex(str)}_${value.length}`;
};

export const parseJsonSafe = <T = Record<string, unknown>>(
  raw: unknown,
): T | null => {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const traceE2E = (
  event: string,
  payload: Record<string, unknown>,
  level: TraceLevel = "info",
) => {
  const config = readConfig();
  if (!config.enabled) return;
  if (LEVEL_ORDER[level] > LEVEL_ORDER[config.level]) return;
  const record: TraceRecord = {
    ts: Date.now(),
    isoTs: new Date().toISOString(),
    level,
    event,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    cipherSuite: DEFAULT_CIPHER_SUITE,
    kdf: DEFAULT_KDF,
    payload,
  };
  if (typeof window !== "undefined") {
    const sink = window.__BUZZU_E2E_TRACE_LOGS__ ?? [];
    sink.push(record);
    if (sink.length > config.maxLogs) {
      sink.splice(0, sink.length - config.maxLogs);
    }
    window.__BUZZU_E2E_TRACE_LOGS__ = sink;
    window.__BUZZU_E2E_TRACE_EXPORT__ = () => [...sink];
    window.__BUZZU_E2E_TRACE_CLEAR__ = () => {
      sink.splice(0, sink.length);
    };
  }
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};
