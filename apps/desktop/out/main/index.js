"use strict";
const electron = require("electron");
const require$$4 = require("path");
const require$$3$1 = require("fs");
const Database = require("better-sqlite3");
const require$$3 = require("node:stream");
const require$$5 = require("stream");
function runMigrations(db, migrations) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set(
    db.prepare("SELECT version FROM _migrations").all().map((r) => r.version)
  );
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO _migrations (version, name) VALUES (?, ?)").run(migration.version, migration.name);
    })();
    console.log(`[db] Applied migration ${migration.version}: ${migration.name}`);
  }
}
const migration001 = {
  version: 1,
  name: "001_settings_and_profile",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        tone_preferences TEXT NOT NULL DEFAULT '',
        current_projects_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      INSERT OR IGNORE INTO user_profile (id) VALUES (1)
    `);
  }
};
const migration002 = {
  version: 2,
  name: "002_usage_ledger",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_ledger (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK (provider IN ('openai', 'pinecone')),
        kind TEXT NOT NULL CHECK (kind IN ('embed', 'chat', 'transcribe', 'vector_op')),
        tokens_in INTEGER,
        tokens_out INTEGER,
        units REAL,
        est_cost_usd REAL NOT NULL DEFAULT 0,
        occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usage_ledger_occurred_at ON usage_ledger (occurred_at)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usage_ledger_provider_kind ON usage_ledger (provider, kind)
    `);
  }
};
let _db = null;
function getDb() {
  if (!_db) throw new Error("Database not initialized — call initDb() first");
  return _db;
}
function initDb() {
  if (_db) return _db;
  const dbPath = require$$4.join(electron.app.getPath("userData"), "bestfriend.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("busy_timeout = 5000");
  runMigrations(_db, [migration001, migration002]);
  return _db;
}
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
const EMBEDDING_MODEL_CATALOG = [
  { id: "text-embedding-3-small", label: "text-embedding-3-small (1536d)", dimension: 1536, provider: "openai" },
  { id: "text-embedding-3-large", label: "text-embedding-3-large (3072d)", dimension: 3072, provider: "openai" },
  { id: "text-embedding-ada-002", label: "text-embedding-ada-002 (1536d)", dimension: 1536, provider: "openai" }
];
const DEFAULT_PINECONE_INDEX_NAME = "bestfriend";
const DEFAULT_SETTINGS = {
  profile: {
    name: "",
    role: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tone_preferences: "",
    current_projects: []
  },
  models: {
    embeddings_model: "text-embedding-3-small",
    chat_model: "gpt-4.1-mini",
    transcription_model: "whisper-1"
  },
  retrieval: {
    top_k_docs: 10,
    top_k_chat: 5,
    chunk_size_tokens: 400,
    chunk_overlap_tokens: 80
  },
  spend: {
    daily_cap_usd: 5,
    confirm_threshold_usd: 0.1
  },
  theme: "system",
  reminders_mirroring: {
    enabled: false,
    list_name: "Bestfriend"
  }
};
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (typeof state === "function" ? receiver !== state || true : !state.has(receiver))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return state.set(receiver, value), value;
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
let uuid4 = function() {
  const { crypto: crypto2 } = globalThis;
  if (crypto2?.randomUUID) {
    uuid4 = crypto2.randomUUID.bind(crypto2);
    return crypto2.randomUUID();
  }
  const u8 = new Uint8Array(1);
  const randomByte = crypto2 ? () => crypto2.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
};
function isAbortError(err) {
  return typeof err === "object" && err !== null && // Spec-compliant fetch implementations
  ("name" in err && err.name === "AbortError" || // Expo fetch
  "message" in err && String(err.message).includes("FetchRequestCanceledException"));
}
const castToError = (err) => {
  if (err instanceof Error)
    return err;
  if (typeof err === "object" && err !== null) {
    try {
      if (Object.prototype.toString.call(err) === "[object Error]") {
        const error = new Error(err.message, err.cause ? { cause: err.cause } : {});
        if (err.stack)
          error.stack = err.stack;
        if (err.cause && !error.cause)
          error.cause = err.cause;
        if (err.name)
          error.name = err.name;
        return error;
      }
    } catch {
    }
    try {
      return new Error(JSON.stringify(err));
    } catch {
    }
  }
  return new Error(err);
};
class OpenAIError extends Error {
}
class APIError extends OpenAIError {
  constructor(status, error, message, headers) {
    super(`${APIError.makeMessage(status, error, message)}`);
    this.status = status;
    this.headers = headers;
    this.requestID = headers?.get("x-request-id");
    this.error = error;
    const data2 = error;
    this.code = data2?.["code"];
    this.param = data2?.["param"];
    this.type = data2?.["type"];
  }
  static makeMessage(status, error, message) {
    const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
    if (status && msg) {
      return `${status} ${msg}`;
    }
    if (status) {
      return `${status} status code (no body)`;
    }
    if (msg) {
      return msg;
    }
    return "(no status code or body)";
  }
  static generate(status, errorResponse, message, headers) {
    if (!status || !headers) {
      return new APIConnectionError({ message, cause: castToError(errorResponse) });
    }
    const error = errorResponse?.["error"];
    if (status === 400) {
      return new BadRequestError(status, error, message, headers);
    }
    if (status === 401) {
      return new AuthenticationError(status, error, message, headers);
    }
    if (status === 403) {
      return new PermissionDeniedError(status, error, message, headers);
    }
    if (status === 404) {
      return new NotFoundError(status, error, message, headers);
    }
    if (status === 409) {
      return new ConflictError(status, error, message, headers);
    }
    if (status === 422) {
      return new UnprocessableEntityError(status, error, message, headers);
    }
    if (status === 429) {
      return new RateLimitError(status, error, message, headers);
    }
    if (status >= 500) {
      return new InternalServerError(status, error, message, headers);
    }
    return new APIError(status, error, message, headers);
  }
}
class APIUserAbortError extends APIError {
  constructor({ message } = {}) {
    super(void 0, void 0, message || "Request was aborted.", void 0);
  }
}
class APIConnectionError extends APIError {
  constructor({ message, cause }) {
    super(void 0, void 0, message || "Connection error.", void 0);
    if (cause)
      this.cause = cause;
  }
}
class APIConnectionTimeoutError extends APIConnectionError {
  constructor({ message } = {}) {
    super({ message: message ?? "Request timed out." });
  }
}
class BadRequestError extends APIError {
}
class AuthenticationError extends APIError {
}
class PermissionDeniedError extends APIError {
}
class NotFoundError extends APIError {
}
class ConflictError extends APIError {
}
class UnprocessableEntityError extends APIError {
}
class RateLimitError extends APIError {
}
class InternalServerError extends APIError {
}
class LengthFinishReasonError extends OpenAIError {
  constructor() {
    super(`Could not parse response content as the length limit was reached`);
  }
}
class ContentFilterFinishReasonError extends OpenAIError {
  constructor() {
    super(`Could not parse response content as the request was rejected by the content filter`);
  }
}
class InvalidWebhookSignatureError extends Error {
  constructor(message) {
    super(message);
  }
}
class OAuthError extends APIError {
  constructor(status, error, headers) {
    let finalMessage = "OAuth2 authentication error";
    let error_code = void 0;
    if (error && typeof error === "object") {
      const errorData = error;
      error_code = errorData["error"];
      const description = errorData["error_description"];
      if (description && typeof description === "string") {
        finalMessage = description;
      } else if (error_code) {
        finalMessage = error_code;
      }
    }
    super(status, error, finalMessage, headers);
    this.error_code = error_code;
  }
}
class SubjectTokenProviderError extends OpenAIError {
  constructor(message, provider, cause) {
    super(message);
    this.provider = provider;
    this.cause = cause;
  }
}
const startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
const isAbsoluteURL = (url) => {
  return startsWithSchemeRegexp.test(url);
};
let isArray = (val) => (isArray = Array.isArray, isArray(val));
let isReadonlyArray = isArray;
function maybeObj(x) {
  if (typeof x !== "object") {
    return {};
  }
  return x ?? {};
}
function isEmptyObj(obj) {
  if (!obj)
    return true;
  for (const _k in obj)
    return false;
  return true;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isObj(obj) {
  return obj != null && typeof obj === "object" && !Array.isArray(obj);
}
const validatePositiveInteger = (name2, n) => {
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new OpenAIError(`${name2} must be an integer`);
  }
  if (n < 0) {
    throw new OpenAIError(`${name2} must be a positive integer`);
  }
  return n;
};
const safeJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    return void 0;
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VERSION = "6.37.0";
const isRunningInBrowser = () => {
  return (
    // @ts-ignore
    typeof window !== "undefined" && // @ts-ignore
    typeof window.document !== "undefined" && // @ts-ignore
    typeof navigator !== "undefined"
  );
};
function getDetectedPlatform() {
  if (typeof Deno !== "undefined" && Deno.build != null) {
    return "deno";
  }
  if (typeof EdgeRuntime !== "undefined") {
    return "edge";
  }
  if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") {
    return "node";
  }
  return "unknown";
}
const getPlatformProperties = () => {
  const detectedPlatform = getDetectedPlatform();
  if (detectedPlatform === "deno") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(Deno.build.os),
      "X-Stainless-Arch": normalizeArch(Deno.build.arch),
      "X-Stainless-Runtime": "deno",
      "X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
    };
  }
  if (typeof EdgeRuntime !== "undefined") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": `other:${EdgeRuntime}`,
      "X-Stainless-Runtime": "edge",
      "X-Stainless-Runtime-Version": globalThis.process.version
    };
  }
  if (detectedPlatform === "node") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
      "X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
      "X-Stainless-Runtime": "node",
      "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
    };
  }
  const browserInfo = getBrowserInfo();
  if (browserInfo) {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": "unknown",
      "X-Stainless-Runtime": `browser:${browserInfo.browser}`,
      "X-Stainless-Runtime-Version": browserInfo.version
    };
  }
  return {
    "X-Stainless-Lang": "js",
    "X-Stainless-Package-Version": VERSION,
    "X-Stainless-OS": "Unknown",
    "X-Stainless-Arch": "unknown",
    "X-Stainless-Runtime": "unknown",
    "X-Stainless-Runtime-Version": "unknown"
  };
};
function getBrowserInfo() {
  if (typeof navigator === "undefined" || !navigator) {
    return null;
  }
  const browserPatterns = [
    { key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }
  ];
  for (const { key, pattern } of browserPatterns) {
    const match = pattern.exec(navigator.userAgent);
    if (match) {
      const major = match[1] || 0;
      const minor = match[2] || 0;
      const patch = match[3] || 0;
      return { browser: key, version: `${major}.${minor}.${patch}` };
    }
  }
  return null;
}
const normalizeArch = (arch) => {
  if (arch === "x32")
    return "x32";
  if (arch === "x86_64" || arch === "x64")
    return "x64";
  if (arch === "arm")
    return "arm";
  if (arch === "aarch64" || arch === "arm64")
    return "arm64";
  if (arch)
    return `other:${arch}`;
  return "unknown";
};
const normalizePlatform = (platform) => {
  platform = platform.toLowerCase();
  if (platform.includes("ios"))
    return "iOS";
  if (platform === "android")
    return "Android";
  if (platform === "darwin")
    return "MacOS";
  if (platform === "win32")
    return "Windows";
  if (platform === "freebsd")
    return "FreeBSD";
  if (platform === "openbsd")
    return "OpenBSD";
  if (platform === "linux")
    return "Linux";
  if (platform)
    return `Other:${platform}`;
  return "Unknown";
};
let _platformHeaders;
const getPlatformHeaders = () => {
  return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
};
function getDefaultFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new OpenAI({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function makeReadableStream(...args) {
  const ReadableStream2 = globalThis.ReadableStream;
  if (typeof ReadableStream2 === "undefined") {
    throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
  }
  return new ReadableStream2(...args);
}
function ReadableStreamFrom(iterable) {
  let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
  return makeReadableStream({
    start() {
    },
    async pull(controller) {
      const { done, value } = await iter.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iter.return?.();
    }
  });
}
function ReadableStreamToAsyncIterable(stream) {
  if (stream[Symbol.asyncIterator])
    return stream;
  const reader = stream.getReader();
  return {
    async next() {
      try {
        const result = await reader.read();
        if (result?.done)
          reader.releaseLock();
        return result;
      } catch (e) {
        reader.releaseLock();
        throw e;
      }
    },
    async return() {
      const cancelPromise = reader.cancel();
      reader.releaseLock();
      await cancelPromise;
      return { done: true, value: void 0 };
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
async function CancelReadableStream(stream) {
  if (stream === null || typeof stream !== "object")
    return;
  if (stream[Symbol.asyncIterator]) {
    await stream[Symbol.asyncIterator]().return?.();
    return;
  }
  const reader = stream.getReader();
  const cancelPromise = reader.cancel();
  reader.releaseLock();
  await cancelPromise;
}
const FallbackEncoder = ({ headers, body }) => {
  return {
    bodyHeaders: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
};
const default_format = "RFC3986";
const default_formatter = (v) => String(v);
const formatters = {
  RFC1738: (v) => String(v).replace(/%20/g, "+"),
  RFC3986: default_formatter
};
const RFC1738 = "RFC1738";
let has = (obj, key) => (has = Object.hasOwn ?? Function.prototype.call.bind(Object.prototype.hasOwnProperty), has(obj, key));
const hex_table = /* @__PURE__ */ (() => {
  const array = [];
  for (let i = 0; i < 256; ++i) {
    array.push("%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase());
  }
  return array;
})();
const limit = 1024;
const encode = (str2, _defaultEncoder, charset, _kind, format) => {
  if (str2.length === 0) {
    return str2;
  }
  let string = str2;
  if (typeof str2 === "symbol") {
    string = Symbol.prototype.toString.call(str2);
  } else if (typeof str2 !== "string") {
    string = String(str2);
  }
  if (charset === "iso-8859-1") {
    return escape(string).replace(/%u[0-9a-f]{4}/gi, function($0) {
      return "%26%23" + parseInt($0.slice(2), 16) + "%3B";
    });
  }
  let out = "";
  for (let j = 0; j < string.length; j += limit) {
    const segment = string.length >= limit ? string.slice(j, j + limit) : string;
    const arr = [];
    for (let i = 0; i < segment.length; ++i) {
      let c = segment.charCodeAt(i);
      if (c === 45 || // -
      c === 46 || // .
      c === 95 || // _
      c === 126 || // ~
      c >= 48 && c <= 57 || // 0-9
      c >= 65 && c <= 90 || // a-z
      c >= 97 && c <= 122 || // A-Z
      format === RFC1738 && (c === 40 || c === 41)) {
        arr[arr.length] = segment.charAt(i);
        continue;
      }
      if (c < 128) {
        arr[arr.length] = hex_table[c];
        continue;
      }
      if (c < 2048) {
        arr[arr.length] = hex_table[192 | c >> 6] + hex_table[128 | c & 63];
        continue;
      }
      if (c < 55296 || c >= 57344) {
        arr[arr.length] = hex_table[224 | c >> 12] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
        continue;
      }
      i += 1;
      c = 65536 + ((c & 1023) << 10 | segment.charCodeAt(i) & 1023);
      arr[arr.length] = hex_table[240 | c >> 18] + hex_table[128 | c >> 12 & 63] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
    }
    out += arr.join("");
  }
  return out;
};
function is_buffer(obj) {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
}
function maybe_map(val, fn) {
  if (isArray(val)) {
    const mapped = [];
    for (let i = 0; i < val.length; i += 1) {
      mapped.push(fn(val[i]));
    }
    return mapped;
  }
  return fn(val);
}
const array_prefix_generators = {
  brackets(prefix) {
    return String(prefix) + "[]";
  },
  comma: "comma",
  indices(prefix, key) {
    return String(prefix) + "[" + key + "]";
  },
  repeat(prefix) {
    return String(prefix);
  }
};
const push_to_array = function(arr, value_or_array) {
  Array.prototype.push.apply(arr, isArray(value_or_array) ? value_or_array : [value_or_array]);
};
let toISOString;
const defaults = {
  addQueryPrefix: false,
  allowDots: false,
  allowEmptyArrays: false,
  arrayFormat: "indices",
  charset: "utf-8",
  charsetSentinel: false,
  delimiter: "&",
  encode: true,
  encodeDotInKeys: false,
  encoder: encode,
  encodeValuesOnly: false,
  format: default_format,
  formatter: default_formatter,
  /** @deprecated */
  indices: false,
  serializeDate(date) {
    return (toISOString ?? (toISOString = Function.prototype.call.bind(Date.prototype.toISOString)))(date);
  },
  skipNulls: false,
  strictNullHandling: false
};
function is_non_nullish_primitive(v) {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || typeof v === "symbol" || typeof v === "bigint";
}
const sentinel = {};
function inner_stringify(object, prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, sideChannel) {
  let obj = object;
  let tmp_sc = sideChannel;
  let step = 0;
  let find_flag = false;
  while ((tmp_sc = tmp_sc.get(sentinel)) !== void 0 && !find_flag) {
    const pos = tmp_sc.get(object);
    step += 1;
    if (typeof pos !== "undefined") {
      if (pos === step) {
        throw new RangeError("Cyclic object value");
      } else {
        find_flag = true;
      }
    }
    if (typeof tmp_sc.get(sentinel) === "undefined") {
      step = 0;
    }
  }
  if (typeof filter === "function") {
    obj = filter(prefix, obj);
  } else if (obj instanceof Date) {
    obj = serializeDate?.(obj);
  } else if (generateArrayPrefix === "comma" && isArray(obj)) {
    obj = maybe_map(obj, function(value) {
      if (value instanceof Date) {
        return serializeDate?.(value);
      }
      return value;
    });
  }
  if (obj === null) {
    if (strictNullHandling) {
      return encoder && !encodeValuesOnly ? (
        // @ts-expect-error
        encoder(prefix, defaults.encoder, charset, "key", format)
      ) : prefix;
    }
    obj = "";
  }
  if (is_non_nullish_primitive(obj) || is_buffer(obj)) {
    if (encoder) {
      const key_value = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, "key", format);
      return [
        formatter?.(key_value) + "=" + // @ts-expect-error
        formatter?.(encoder(obj, defaults.encoder, charset, "value", format))
      ];
    }
    return [formatter?.(prefix) + "=" + formatter?.(String(obj))];
  }
  const values = [];
  if (typeof obj === "undefined") {
    return values;
  }
  let obj_keys;
  if (generateArrayPrefix === "comma" && isArray(obj)) {
    if (encodeValuesOnly && encoder) {
      obj = maybe_map(obj, encoder);
    }
    obj_keys = [{ value: obj.length > 0 ? obj.join(",") || null : void 0 }];
  } else if (isArray(filter)) {
    obj_keys = filter;
  } else {
    const keys = Object.keys(obj);
    obj_keys = sort ? keys.sort(sort) : keys;
  }
  const encoded_prefix = encodeDotInKeys ? String(prefix).replace(/\./g, "%2E") : String(prefix);
  const adjusted_prefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encoded_prefix + "[]" : encoded_prefix;
  if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
    return adjusted_prefix + "[]";
  }
  for (let j = 0; j < obj_keys.length; ++j) {
    const key = obj_keys[j];
    const value = (
      // @ts-ignore
      typeof key === "object" && typeof key.value !== "undefined" ? key.value : obj[key]
    );
    if (skipNulls && value === null) {
      continue;
    }
    const encoded_key = allowDots && encodeDotInKeys ? key.replace(/\./g, "%2E") : key;
    const key_prefix = isArray(obj) ? typeof generateArrayPrefix === "function" ? generateArrayPrefix(adjusted_prefix, encoded_key) : adjusted_prefix : adjusted_prefix + (allowDots ? "." + encoded_key : "[" + encoded_key + "]");
    sideChannel.set(object, step);
    const valueSideChannel = /* @__PURE__ */ new WeakMap();
    valueSideChannel.set(sentinel, sideChannel);
    push_to_array(values, inner_stringify(
      value,
      key_prefix,
      generateArrayPrefix,
      commaRoundTrip,
      allowEmptyArrays,
      strictNullHandling,
      skipNulls,
      encodeDotInKeys,
      // @ts-ignore
      generateArrayPrefix === "comma" && encodeValuesOnly && isArray(obj) ? null : encoder,
      filter,
      sort,
      allowDots,
      serializeDate,
      format,
      formatter,
      encodeValuesOnly,
      charset,
      valueSideChannel
    ));
  }
  return values;
}
function normalize_stringify_options(opts = defaults) {
  if (typeof opts.allowEmptyArrays !== "undefined" && typeof opts.allowEmptyArrays !== "boolean") {
    throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
  }
  if (typeof opts.encodeDotInKeys !== "undefined" && typeof opts.encodeDotInKeys !== "boolean") {
    throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
  }
  if (opts.encoder !== null && typeof opts.encoder !== "undefined" && typeof opts.encoder !== "function") {
    throw new TypeError("Encoder has to be a function.");
  }
  const charset = opts.charset || defaults.charset;
  if (typeof opts.charset !== "undefined" && opts.charset !== "utf-8" && opts.charset !== "iso-8859-1") {
    throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
  }
  let format = default_format;
  if (typeof opts.format !== "undefined") {
    if (!has(formatters, opts.format)) {
      throw new TypeError("Unknown format option provided.");
    }
    format = opts.format;
  }
  const formatter = formatters[format];
  let filter = defaults.filter;
  if (typeof opts.filter === "function" || isArray(opts.filter)) {
    filter = opts.filter;
  }
  let arrayFormat;
  if (opts.arrayFormat && opts.arrayFormat in array_prefix_generators) {
    arrayFormat = opts.arrayFormat;
  } else if ("indices" in opts) {
    arrayFormat = opts.indices ? "indices" : "repeat";
  } else {
    arrayFormat = defaults.arrayFormat;
  }
  if ("commaRoundTrip" in opts && typeof opts.commaRoundTrip !== "boolean") {
    throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
  }
  const allowDots = typeof opts.allowDots === "undefined" ? !!opts.encodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;
  return {
    addQueryPrefix: typeof opts.addQueryPrefix === "boolean" ? opts.addQueryPrefix : defaults.addQueryPrefix,
    // @ts-ignore
    allowDots,
    allowEmptyArrays: typeof opts.allowEmptyArrays === "boolean" ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
    arrayFormat,
    charset,
    charsetSentinel: typeof opts.charsetSentinel === "boolean" ? opts.charsetSentinel : defaults.charsetSentinel,
    commaRoundTrip: !!opts.commaRoundTrip,
    delimiter: typeof opts.delimiter === "undefined" ? defaults.delimiter : opts.delimiter,
    encode: typeof opts.encode === "boolean" ? opts.encode : defaults.encode,
    encodeDotInKeys: typeof opts.encodeDotInKeys === "boolean" ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
    encoder: typeof opts.encoder === "function" ? opts.encoder : defaults.encoder,
    encodeValuesOnly: typeof opts.encodeValuesOnly === "boolean" ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
    filter,
    format,
    formatter,
    serializeDate: typeof opts.serializeDate === "function" ? opts.serializeDate : defaults.serializeDate,
    skipNulls: typeof opts.skipNulls === "boolean" ? opts.skipNulls : defaults.skipNulls,
    // @ts-ignore
    sort: typeof opts.sort === "function" ? opts.sort : null,
    strictNullHandling: typeof opts.strictNullHandling === "boolean" ? opts.strictNullHandling : defaults.strictNullHandling
  };
}
function stringify(object, opts = {}) {
  let obj = object;
  const options = normalize_stringify_options(opts);
  let obj_keys;
  let filter;
  if (typeof options.filter === "function") {
    filter = options.filter;
    obj = filter("", obj);
  } else if (isArray(options.filter)) {
    filter = options.filter;
    obj_keys = filter;
  }
  const keys = [];
  if (typeof obj !== "object" || obj === null) {
    return "";
  }
  const generateArrayPrefix = array_prefix_generators[options.arrayFormat];
  const commaRoundTrip = generateArrayPrefix === "comma" && options.commaRoundTrip;
  if (!obj_keys) {
    obj_keys = Object.keys(obj);
  }
  if (options.sort) {
    obj_keys.sort(options.sort);
  }
  const sideChannel = /* @__PURE__ */ new WeakMap();
  for (let i = 0; i < obj_keys.length; ++i) {
    const key = obj_keys[i];
    if (options.skipNulls && obj[key] === null) {
      continue;
    }
    push_to_array(keys, inner_stringify(
      obj[key],
      key,
      // @ts-expect-error
      generateArrayPrefix,
      commaRoundTrip,
      options.allowEmptyArrays,
      options.strictNullHandling,
      options.skipNulls,
      options.encodeDotInKeys,
      options.encode ? options.encoder : null,
      options.filter,
      options.sort,
      options.allowDots,
      options.serializeDate,
      options.format,
      options.formatter,
      options.encodeValuesOnly,
      options.charset,
      sideChannel
    ));
  }
  const joined = keys.join(options.delimiter);
  let prefix = options.addQueryPrefix === true ? "?" : "";
  if (options.charsetSentinel) {
    if (options.charset === "iso-8859-1") {
      prefix += "utf8=%26%2310003%3B&";
    } else {
      prefix += "utf8=%E2%9C%93&";
    }
  }
  return joined.length > 0 ? prefix + joined : "";
}
function stringifyQuery(query2) {
  return stringify(query2, { arrayFormat: "brackets" });
}
function concatBytes(buffers) {
  let length = 0;
  for (const buffer of buffers) {
    length += buffer.length;
  }
  const output = new Uint8Array(length);
  let index = 0;
  for (const buffer of buffers) {
    output.set(buffer, index);
    index += buffer.length;
  }
  return output;
}
let encodeUTF8_;
function encodeUTF8(str2) {
  let encoder;
  return (encodeUTF8_ ?? (encoder = new globalThis.TextEncoder(), encodeUTF8_ = encoder.encode.bind(encoder)))(str2);
}
let decodeUTF8_;
function decodeUTF8(bytes) {
  let decoder;
  return (decodeUTF8_ ?? (decoder = new globalThis.TextDecoder(), decodeUTF8_ = decoder.decode.bind(decoder)))(bytes);
}
var _LineDecoder_buffer, _LineDecoder_carriageReturnIndex;
class LineDecoder {
  constructor() {
    _LineDecoder_buffer.set(this, void 0);
    _LineDecoder_carriageReturnIndex.set(this, void 0);
    __classPrivateFieldSet(this, _LineDecoder_buffer, new Uint8Array());
    __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null);
  }
  decode(chunk) {
    if (chunk == null) {
      return [];
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    __classPrivateFieldSet(this, _LineDecoder_buffer, concatBytes([__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), binaryChunk]));
    const lines = [];
    let patternIndex;
    while ((patternIndex = findNewlineIndex(__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
      if (patternIndex.carriage && __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") == null) {
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, patternIndex.index);
        continue;
      }
      if (__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") != null && (patternIndex.index !== __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
        lines.push(decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
        __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f")));
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null);
        continue;
      }
      const endIndex = __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
      const line = decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, endIndex));
      lines.push(line);
      __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(patternIndex.index));
      __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null);
    }
    return lines;
  }
  flush() {
    if (!__classPrivateFieldGet(this, _LineDecoder_buffer, "f").length) {
      return [];
    }
    return this.decode("\n");
  }
}
_LineDecoder_buffer = /* @__PURE__ */ new WeakMap(), _LineDecoder_carriageReturnIndex = /* @__PURE__ */ new WeakMap();
LineDecoder.NEWLINE_CHARS = /* @__PURE__ */ new Set(["\n", "\r"]);
LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
function findNewlineIndex(buffer, startIndex) {
  const newline = 10;
  const carriage = 13;
  for (let i = startIndex ?? 0; i < buffer.length; i++) {
    if (buffer[i] === newline) {
      return { preceding: i, index: i + 1, carriage: false };
    }
    if (buffer[i] === carriage) {
      return { preceding: i, index: i + 1, carriage: true };
    }
  }
  return null;
}
function findDoubleNewlineIndex(buffer) {
  const newline = 10;
  const carriage = 13;
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === newline && buffer[i + 1] === newline) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === carriage) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === newline && i + 3 < buffer.length && buffer[i + 2] === carriage && buffer[i + 3] === newline) {
      return i + 4;
    }
  }
  return -1;
}
const levelNumbers = {
  off: 0,
  error: 200,
  warn: 300,
  info: 400,
  debug: 500
};
const parseLogLevel = (maybeLevel, sourceName, client) => {
  if (!maybeLevel) {
    return void 0;
  }
  if (hasOwn(levelNumbers, maybeLevel)) {
    return maybeLevel;
  }
  loggerFor(client).warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
  return void 0;
};
function noop() {
}
function makeLogFn(fnLevel, logger, logLevel) {
  if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) {
    return noop;
  } else {
    return logger[fnLevel].bind(logger);
  }
}
const noopLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop
};
let cachedLoggers = /* @__PURE__ */ new WeakMap();
function loggerFor(client) {
  const logger = client.logger;
  const logLevel = client.logLevel ?? "off";
  if (!logger) {
    return noopLogger;
  }
  const cachedLogger = cachedLoggers.get(logger);
  if (cachedLogger && cachedLogger[0] === logLevel) {
    return cachedLogger[1];
  }
  const levelLogger = {
    error: makeLogFn("error", logger, logLevel),
    warn: makeLogFn("warn", logger, logLevel),
    info: makeLogFn("info", logger, logLevel),
    debug: makeLogFn("debug", logger, logLevel)
  };
  cachedLoggers.set(logger, [logLevel, levelLogger]);
  return levelLogger;
}
const formatRequestDetails = (details) => {
  if (details.options) {
    details.options = { ...details.options };
    delete details.options["headers"];
  }
  if (details.headers) {
    details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name2, value]) => [
      name2,
      name2.toLowerCase() === "authorization" || name2.toLowerCase() === "api-key" || name2.toLowerCase() === "x-api-key" || name2.toLowerCase() === "cookie" || name2.toLowerCase() === "set-cookie" ? "***" : value
    ]));
  }
  if ("retryOfRequestLogID" in details) {
    if (details.retryOfRequestLogID) {
      details.retryOf = details.retryOfRequestLogID;
    }
    delete details.retryOfRequestLogID;
  }
  return details;
};
var _Stream_client;
class Stream {
  constructor(iterator, controller, client) {
    this.iterator = iterator;
    _Stream_client.set(this, void 0);
    this.controller = controller;
    __classPrivateFieldSet(this, _Stream_client, client);
  }
  static fromSSEResponse(response, controller, client, synthesizeEventData) {
    let consumed = false;
    const logger = client ? loggerFor(client) : console;
    async function* iterator() {
      if (consumed) {
        throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const sse of _iterSSEMessages(response, controller)) {
          if (done)
            continue;
          if (sse.data.startsWith("[DONE]")) {
            done = true;
            continue;
          }
          if (sse.event === null || !sse.event.startsWith("thread.")) {
            let data2;
            try {
              data2 = JSON.parse(sse.data);
            } catch (e) {
              logger.error(`Could not parse message into JSON:`, sse.data);
              logger.error(`From chunk:`, sse.raw);
              throw e;
            }
            if (data2 && data2.error) {
              throw new APIError(void 0, data2.error, void 0, response.headers);
            }
            yield synthesizeEventData ? { event: sse.event, data: data2 } : data2;
          } else {
            let data2;
            try {
              data2 = JSON.parse(sse.data);
            } catch (e) {
              console.error(`Could not parse message into JSON:`, sse.data);
              console.error(`From chunk:`, sse.raw);
              throw e;
            }
            if (sse.event == "error") {
              throw new APIError(void 0, data2.error, data2.message, void 0);
            }
            yield { event: sse.event, data: data2 };
          }
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new Stream(iterator, controller, client);
  }
  /**
   * Generates a Stream from a newline-separated ReadableStream
   * where each item is a JSON value.
   */
  static fromReadableStream(readableStream, controller, client) {
    let consumed = false;
    async function* iterLines() {
      const lineDecoder = new LineDecoder();
      const iter = ReadableStreamToAsyncIterable(readableStream);
      for await (const chunk of iter) {
        for (const line of lineDecoder.decode(chunk)) {
          yield line;
        }
      }
      for (const line of lineDecoder.flush()) {
        yield line;
      }
    }
    async function* iterator() {
      if (consumed) {
        throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const line of iterLines()) {
          if (done)
            continue;
          if (line)
            yield JSON.parse(line);
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new Stream(iterator, controller, client);
  }
  [(_Stream_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
    return this.iterator();
  }
  /**
   * Splits the stream into two streams which can be
   * independently read from at different speeds.
   */
  tee() {
    const left = [];
    const right = [];
    const iterator = this.iterator();
    const teeIterator = (queue) => {
      return {
        next: () => {
          if (queue.length === 0) {
            const result = iterator.next();
            left.push(result);
            right.push(result);
          }
          return queue.shift();
        }
      };
    };
    return [
      new Stream(() => teeIterator(left), this.controller, __classPrivateFieldGet(this, _Stream_client, "f")),
      new Stream(() => teeIterator(right), this.controller, __classPrivateFieldGet(this, _Stream_client, "f"))
    ];
  }
  /**
   * Converts this stream to a newline-separated ReadableStream of
   * JSON stringified values in the stream
   * which can be turned back into a Stream with `Stream.fromReadableStream()`.
   */
  toReadableStream() {
    const self2 = this;
    let iter;
    return makeReadableStream({
      async start() {
        iter = self2[Symbol.asyncIterator]();
      },
      async pull(ctrl) {
        try {
          const { value, done } = await iter.next();
          if (done)
            return ctrl.close();
          const bytes = encodeUTF8(JSON.stringify(value) + "\n");
          ctrl.enqueue(bytes);
        } catch (err) {
          ctrl.error(err);
        }
      },
      async cancel() {
        await iter.return?.();
      }
    });
  }
}
async function* _iterSSEMessages(response, controller) {
  if (!response.body) {
    controller.abort();
    if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
      throw new OpenAIError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
    }
    throw new OpenAIError(`Attempted to iterate over a response with no body`);
  }
  const sseDecoder = new SSEDecoder();
  const lineDecoder = new LineDecoder();
  const iter = ReadableStreamToAsyncIterable(response.body);
  for await (const sseChunk of iterSSEChunks(iter)) {
    for (const line of lineDecoder.decode(sseChunk)) {
      const sse = sseDecoder.decode(line);
      if (sse)
        yield sse;
    }
  }
  for (const line of lineDecoder.flush()) {
    const sse = sseDecoder.decode(line);
    if (sse)
      yield sse;
  }
}
async function* iterSSEChunks(iterator) {
  let data2 = new Uint8Array();
  for await (const chunk of iterator) {
    if (chunk == null) {
      continue;
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    let newData = new Uint8Array(data2.length + binaryChunk.length);
    newData.set(data2);
    newData.set(binaryChunk, data2.length);
    data2 = newData;
    let patternIndex;
    while ((patternIndex = findDoubleNewlineIndex(data2)) !== -1) {
      yield data2.slice(0, patternIndex);
      data2 = data2.slice(patternIndex);
    }
  }
  if (data2.length > 0) {
    yield data2;
  }
}
class SSEDecoder {
  constructor() {
    this.event = null;
    this.data = [];
    this.chunks = [];
  }
  decode(line) {
    if (line.endsWith("\r")) {
      line = line.substring(0, line.length - 1);
    }
    if (!line) {
      if (!this.event && !this.data.length)
        return null;
      const sse = {
        event: this.event,
        data: this.data.join("\n"),
        raw: this.chunks
      };
      this.event = null;
      this.data = [];
      this.chunks = [];
      return sse;
    }
    this.chunks.push(line);
    if (line.startsWith(":")) {
      return null;
    }
    let [fieldname, _, value] = partition(line, ":");
    if (value.startsWith(" ")) {
      value = value.substring(1);
    }
    if (fieldname === "event") {
      this.event = value;
    } else if (fieldname === "data") {
      this.data.push(value);
    }
    return null;
  }
}
function partition(str2, delimiter) {
  const index = str2.indexOf(delimiter);
  if (index !== -1) {
    return [str2.substring(0, index), delimiter, str2.substring(index + delimiter.length)];
  }
  return [str2, "", ""];
}
async function defaultParseResponse(client, props) {
  const { response, requestLogID, retryOfRequestLogID, startTime } = props;
  const body = await (async () => {
    if (props.options.stream) {
      loggerFor(client).debug("response", response.status, response.url, response.headers, response.body);
      if (props.options.__streamClass) {
        return props.options.__streamClass.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
      }
      return Stream.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
    }
    if (response.status === 204) {
      return null;
    }
    if (props.options.__binaryResponse) {
      return response;
    }
    const contentType = response.headers.get("content-type");
    const mediaType = contentType?.split(";")[0]?.trim();
    const isJSON = mediaType?.includes("application/json") || mediaType?.endsWith("+json");
    if (isJSON) {
      const contentLength = response.headers.get("content-length");
      if (contentLength === "0") {
        return void 0;
      }
      const json = await response.json();
      return addRequestID(json, response);
    }
    const text = await response.text();
    return text;
  })();
  loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
    retryOfRequestLogID,
    url: response.url,
    status: response.status,
    body,
    durationMs: Date.now() - startTime
  }));
  return body;
}
function addRequestID(value, response) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.defineProperty(value, "_request_id", {
    value: response.headers.get("x-request-id"),
    enumerable: false
  });
}
var _APIPromise_client;
class APIPromise extends Promise {
  constructor(client, responsePromise, parseResponse2 = defaultParseResponse) {
    super((resolve) => {
      resolve(null);
    });
    this.responsePromise = responsePromise;
    this.parseResponse = parseResponse2;
    _APIPromise_client.set(this, void 0);
    __classPrivateFieldSet(this, _APIPromise_client, client);
  }
  _thenUnwrap(transform) {
    return new APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => addRequestID(transform(await this.parseResponse(client, props), props), props.response));
  }
  /**
   * Gets the raw `Response` instance instead of parsing the response
   * data.
   *
   * If you want to parse the response body but still get the `Response`
   * instance, you can use {@link withResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  asResponse() {
    return this.responsePromise.then((p) => p.response);
  }
  /**
   * Gets the parsed response data, the raw `Response` instance and the ID of the request,
   * returned via the X-Request-ID header which is useful for debugging requests and reporting
   * issues to OpenAI.
   *
   * If you just want to get the raw `Response` instance without parsing it,
   * you can use {@link asResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  async withResponse() {
    const [data2, response] = await Promise.all([this.parse(), this.asResponse()]);
    return { data: data2, response, request_id: response.headers.get("x-request-id") };
  }
  parse() {
    if (!this.parsedPromise) {
      this.parsedPromise = this.responsePromise.then((data2) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data2));
    }
    return this.parsedPromise;
  }
  then(onfulfilled, onrejected) {
    return this.parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.parse().finally(onfinally);
  }
}
_APIPromise_client = /* @__PURE__ */ new WeakMap();
var _AbstractPage_client;
class AbstractPage {
  constructor(client, response, body, options) {
    _AbstractPage_client.set(this, void 0);
    __classPrivateFieldSet(this, _AbstractPage_client, client);
    this.options = options;
    this.response = response;
    this.body = body;
  }
  hasNextPage() {
    const items = this.getPaginatedItems();
    if (!items.length)
      return false;
    return this.nextPageRequestOptions() != null;
  }
  async getNextPage() {
    const nextOptions = this.nextPageRequestOptions();
    if (!nextOptions) {
      throw new OpenAIError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
    }
    return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
  }
  async *iterPages() {
    let page = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }
  async *[(_AbstractPage_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
    for await (const page of this.iterPages()) {
      for (const item of page.getPaginatedItems()) {
        yield item;
      }
    }
  }
}
class PagePromise extends APIPromise {
  constructor(client, request2, Page2) {
    super(client, request2, async (client2, props) => new Page2(client2, props.response, await defaultParseResponse(client2, props), props.options));
  }
  /**
   * Allow auto-paginating iteration on an unawaited list call, eg:
   *
   *    for await (const item of client.items.list()) {
   *      console.log(item)
   *    }
   */
  async *[Symbol.asyncIterator]() {
    const page = await this;
    for await (const item of page) {
      yield item;
    }
  }
}
class Page extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.object = body.object;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  nextPageRequestOptions() {
    return null;
  }
}
class CursorPage extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const data2 = this.getPaginatedItems();
    const id = data2[data2.length - 1]?.id;
    if (!id) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: id
      }
    };
  }
}
class ConversationCursorPage extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
    this.last_id = body.last_id || "";
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const cursor = this.last_id;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: cursor
      }
    };
  }
}
class NextCursorPage extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
    this.next = body.next || null;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const cursor = this.next;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: cursor
      }
    };
  }
}
const SUBJECT_TOKEN_TYPES = {
  jwt: "urn:ietf:params:oauth:token-type:jwt",
  id: "urn:ietf:params:oauth:token-type:id_token"
};
const TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
class WorkloadIdentityAuth {
  constructor(config2, fetch2) {
    this.cachedToken = null;
    this.refreshPromise = null;
    this.tokenExchangeUrl = "https://auth.openai.com/oauth/token";
    this.config = config2;
    this.fetch = fetch2 ?? getDefaultFetch();
  }
  async getToken() {
    if (!this.cachedToken || this.isTokenExpired(this.cachedToken)) {
      if (this.refreshPromise) {
        return await this.refreshPromise;
      }
      this.refreshPromise = this.refreshToken();
      try {
        const token = await this.refreshPromise;
        return token;
      } finally {
        this.refreshPromise = null;
      }
    }
    if (this.needsRefresh(this.cachedToken) && !this.refreshPromise) {
      this.refreshPromise = this.refreshToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.cachedToken.token;
  }
  async refreshToken() {
    const subjectToken = await this.config.provider.getToken();
    const response = await this.fetch(this.tokenExchangeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
        client_id: this.config.clientId,
        subject_token: subjectToken,
        subject_token_type: SUBJECT_TOKEN_TYPES[this.config.provider.tokenType],
        identity_provider_id: this.config.identityProviderId,
        service_account_id: this.config.serviceAccountId
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      let body = void 0;
      try {
        body = JSON.parse(errorText);
      } catch {
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new OAuthError(response.status, body, response.headers);
      }
      throw APIError.generate(response.status, body, `Token exchange failed with status ${response.status}`, response.headers);
    }
    const tokenResponse = await response.json();
    const expiresIn = tokenResponse.expires_in || 3600;
    const expiresAt = Date.now() + expiresIn * 1e3;
    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt
    };
    return tokenResponse.access_token;
  }
  isTokenExpired(cachedToken) {
    return Date.now() >= cachedToken.expiresAt;
  }
  needsRefresh(cachedToken) {
    const bufferSeconds = this.config.refreshBufferSeconds ?? 1200;
    const bufferMs = bufferSeconds * 1e3;
    return Date.now() >= cachedToken.expiresAt - bufferMs;
  }
  invalidateToken() {
    this.cachedToken = null;
    this.refreshPromise = null;
  }
}
const checkFileSupport = () => {
  if (typeof File === "undefined") {
    const { process: process2 } = globalThis;
    const isOldNode = typeof process2?.versions?.node === "string" && parseInt(process2.versions.node.split(".")) < 20;
    throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
  }
};
function makeFile(fileBits, fileName, options) {
  checkFileSupport();
  return new File(fileBits, fileName ?? "unknown_file", options);
}
function getName(value) {
  return (typeof value === "object" && value !== null && ("name" in value && value.name && String(value.name) || "url" in value && value.url && String(value.url) || "filename" in value && value.filename && String(value.filename) || "path" in value && value.path && String(value.path)) || "").split(/[\\/]/).pop() || void 0;
}
const isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
const maybeMultipartFormRequestOptions = async (opts, fetch2) => {
  if (!hasUploadableValue(opts.body))
    return opts;
  return { ...opts, body: await createForm(opts.body, fetch2) };
};
const multipartFormRequestOptions = async (opts, fetch2) => {
  return { ...opts, body: await createForm(opts.body, fetch2) };
};
const supportsFormDataMap = /* @__PURE__ */ new WeakMap();
function supportsFormData(fetchObject) {
  const fetch2 = typeof fetchObject === "function" ? fetchObject : fetchObject.fetch;
  const cached = supportsFormDataMap.get(fetch2);
  if (cached)
    return cached;
  const promise = (async () => {
    try {
      const FetchResponse2 = "Response" in fetch2 ? fetch2.Response : (await fetch2("data:,")).constructor;
      const data2 = new FormData();
      if (data2.toString() === await new FetchResponse2(data2).text()) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  })();
  supportsFormDataMap.set(fetch2, promise);
  return promise;
}
const createForm = async (body, fetch2) => {
  if (!await supportsFormData(fetch2)) {
    throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
  }
  const form = new FormData();
  await Promise.all(Object.entries(body || {}).map(([key, value]) => addFormValue(form, key, value)));
  return form;
};
const isNamedBlob = (value) => value instanceof Blob && "name" in value;
const isUploadable = (value) => typeof value === "object" && value !== null && (value instanceof Response || isAsyncIterable(value) || isNamedBlob(value));
const hasUploadableValue = (value) => {
  if (isUploadable(value))
    return true;
  if (Array.isArray(value))
    return value.some(hasUploadableValue);
  if (value && typeof value === "object") {
    for (const k in value) {
      if (hasUploadableValue(value[k]))
        return true;
    }
  }
  return false;
};
const addFormValue = async (form, key, value) => {
  if (value === void 0)
    return;
  if (value == null) {
    throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    form.append(key, String(value));
  } else if (value instanceof Response) {
    form.append(key, makeFile([await value.blob()], getName(value)));
  } else if (isAsyncIterable(value)) {
    form.append(key, makeFile([await new Response(ReadableStreamFrom(value)).blob()], getName(value)));
  } else if (isNamedBlob(value)) {
    form.append(key, value, getName(value));
  } else if (Array.isArray(value)) {
    await Promise.all(value.map((entry) => addFormValue(form, key + "[]", entry)));
  } else if (typeof value === "object") {
    await Promise.all(Object.entries(value).map(([name2, prop]) => addFormValue(form, `${key}[${name2}]`, prop)));
  } else {
    throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
  }
};
const isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
const isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
const isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
async function toFile(value, name2, options) {
  checkFileSupport();
  value = await value;
  if (isFileLike(value)) {
    if (value instanceof File) {
      return value;
    }
    return makeFile([await value.arrayBuffer()], value.name);
  }
  if (isResponseLike(value)) {
    const blob = await value.blob();
    name2 || (name2 = new URL(value.url).pathname.split(/[\\/]/).pop());
    return makeFile(await getBytes(blob), name2, options);
  }
  const parts = await getBytes(value);
  name2 || (name2 = getName(value));
  if (!options?.type) {
    const type = parts.find((part) => typeof part === "object" && "type" in part && part.type);
    if (typeof type === "string") {
      options = { ...options, type };
    }
  }
  return makeFile(parts, name2, options);
}
async function getBytes(value) {
  let parts = [];
  if (typeof value === "string" || ArrayBuffer.isView(value) || // includes Uint8Array, Buffer, etc.
  value instanceof ArrayBuffer) {
    parts.push(value);
  } else if (isBlobLike(value)) {
    parts.push(value instanceof Blob ? value : await value.arrayBuffer());
  } else if (isAsyncIterable(value)) {
    for await (const chunk of value) {
      parts.push(...await getBytes(chunk));
    }
  } else {
    const constructor = value?.constructor?.name;
    throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
  }
  return parts;
}
function propsForError(value) {
  if (typeof value !== "object" || value === null)
    return "";
  const props = Object.getOwnPropertyNames(value);
  return `; props: [${props.map((p) => `"${p}"`).join(", ")}]`;
}
class APIResource {
  constructor(client) {
    this._client = client;
  }
}
function encodeURIPath(str2) {
  return str2.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
const EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
const createPathTagFunction = (pathEncoder = encodeURIPath) => function path2(statics, ...params) {
  if (statics.length === 1)
    return statics[0];
  let postPath = false;
  const invalidSegments = [];
  const path3 = statics.reduce((previousValue, currentValue, index) => {
    if (/[?#]/.test(currentValue)) {
      postPath = true;
    }
    const value = params[index];
    let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
    if (index !== params.length && (value == null || typeof value === "object" && // handle values from other realms
    value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
      encoded = value + "";
      invalidSegments.push({
        start: previousValue.length + currentValue.length,
        length: encoded.length,
        error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
      });
    }
    return previousValue + currentValue + (index === params.length ? "" : encoded);
  }, "");
  const pathOnly = path3.split(/[?#]/, 1)[0];
  const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
  let match;
  while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) {
    invalidSegments.push({
      start: match.index,
      length: match[0].length,
      error: `Value "${match[0]}" can't be safely passed as a path parameter`
    });
  }
  invalidSegments.sort((a, b) => a.start - b.start);
  if (invalidSegments.length > 0) {
    let lastEnd = 0;
    const underline = invalidSegments.reduce((acc, segment) => {
      const spaces = " ".repeat(segment.start - lastEnd);
      const arrows = "^".repeat(segment.length);
      lastEnd = segment.start + segment.length;
      return acc + spaces + arrows;
    }, "");
    throw new OpenAIError(`Path parameters result in path with invalid segments:
${invalidSegments.map((e) => e.error).join("\n")}
${path3}
${underline}`);
  }
  return path3;
};
const path = /* @__PURE__ */ createPathTagFunction(encodeURIPath);
let Messages$1 = class Messages extends APIResource {
  /**
   * Get the messages in a stored chat completion. Only Chat Completions that have
   * been created with the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatCompletionStoreMessage of client.chat.completions.messages.list(
   *   'completion_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(completionID, query2 = {}, options) {
    return this._client.getAPIList(path`/chat/completions/${completionID}/messages`, CursorPage, { query: query2, ...options, __security: { bearerAuth: true } });
  }
};
function isChatCompletionFunctionTool(tool) {
  return tool !== void 0 && "function" in tool && tool.function !== void 0;
}
function isAutoParsableResponseFormat(response_format) {
  return response_format?.["$brand"] === "auto-parseable-response-format";
}
function isAutoParsableTool$1(tool) {
  return tool?.["$brand"] === "auto-parseable-tool";
}
function maybeParseChatCompletion(completion, params) {
  if (!params || !hasAutoParseableInput$1(params)) {
    return {
      ...completion,
      choices: completion.choices.map((choice) => {
        assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
        return {
          ...choice,
          message: {
            ...choice.message,
            parsed: null,
            ...choice.message.tool_calls ? {
              tool_calls: choice.message.tool_calls
            } : void 0
          }
        };
      })
    };
  }
  return parseChatCompletion(completion, params);
}
function parseChatCompletion(completion, params) {
  const choices = completion.choices.map((choice) => {
    if (choice.finish_reason === "length") {
      throw new LengthFinishReasonError();
    }
    if (choice.finish_reason === "content_filter") {
      throw new ContentFilterFinishReasonError();
    }
    assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
    return {
      ...choice,
      message: {
        ...choice.message,
        ...choice.message.tool_calls ? {
          tool_calls: choice.message.tool_calls?.map((toolCall) => parseToolCall$1(params, toolCall)) ?? void 0
        } : void 0,
        parsed: choice.message.content && !choice.message.refusal ? parseResponseFormat(params, choice.message.content) : null
      }
    };
  });
  return { ...completion, choices };
}
function parseResponseFormat(params, content) {
  if (params.response_format?.type !== "json_schema") {
    return null;
  }
  if (params.response_format?.type === "json_schema") {
    if ("$parseRaw" in params.response_format) {
      const response_format = params.response_format;
      return response_format.$parseRaw(content);
    }
    return JSON.parse(content);
  }
  return null;
}
function parseToolCall$1(params, toolCall) {
  const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      parsed_arguments: isAutoParsableTool$1(inputTool) ? inputTool.$parseRaw(toolCall.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCall.function.arguments) : null
    }
  };
}
function shouldParseToolCall(params, toolCall) {
  if (!params || !("tools" in params) || !params.tools) {
    return false;
  }
  const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
  return isChatCompletionFunctionTool(inputTool) && (isAutoParsableTool$1(inputTool) || inputTool?.function.strict || false);
}
function hasAutoParseableInput$1(params) {
  if (isAutoParsableResponseFormat(params.response_format)) {
    return true;
  }
  return params.tools?.some((t) => isAutoParsableTool$1(t) || t.type === "function" && t.function.strict === true) ?? false;
}
function assertToolCallsAreChatCompletionFunctionToolCalls(toolCalls) {
  for (const toolCall of toolCalls || []) {
    if (toolCall.type !== "function") {
      throw new OpenAIError(`Currently only \`function\` tool calls are supported; Received \`${toolCall.type}\``);
    }
  }
}
function validateInputTools(tools) {
  for (const tool of tools ?? []) {
    if (tool.type !== "function") {
      throw new OpenAIError(`Currently only \`function\` tool types support auto-parsing; Received \`${tool.type}\``);
    }
    if (tool.function.strict !== true) {
      throw new OpenAIError(`The \`${tool.function.name}\` tool is not marked with \`strict: true\`. Only strict function tools can be auto-parsed`);
    }
  }
}
const isAssistantMessage = (message) => {
  return message?.role === "assistant";
};
const isToolMessage = (message) => {
  return message?.role === "tool";
};
var _EventStream_instances, _EventStream_connectedPromise, _EventStream_resolveConnectedPromise, _EventStream_rejectConnectedPromise, _EventStream_endPromise, _EventStream_resolveEndPromise, _EventStream_rejectEndPromise, _EventStream_listeners, _EventStream_ended, _EventStream_errored, _EventStream_aborted, _EventStream_catchingPromiseCreated, _EventStream_handleError;
class EventStream {
  constructor() {
    _EventStream_instances.add(this);
    this.controller = new AbortController();
    _EventStream_connectedPromise.set(this, void 0);
    _EventStream_resolveConnectedPromise.set(this, () => {
    });
    _EventStream_rejectConnectedPromise.set(this, () => {
    });
    _EventStream_endPromise.set(this, void 0);
    _EventStream_resolveEndPromise.set(this, () => {
    });
    _EventStream_rejectEndPromise.set(this, () => {
    });
    _EventStream_listeners.set(this, {});
    _EventStream_ended.set(this, false);
    _EventStream_errored.set(this, false);
    _EventStream_aborted.set(this, false);
    _EventStream_catchingPromiseCreated.set(this, false);
    __classPrivateFieldSet(this, _EventStream_connectedPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_resolveConnectedPromise, resolve, "f");
      __classPrivateFieldSet(this, _EventStream_rejectConnectedPromise, reject, "f");
    }));
    __classPrivateFieldSet(this, _EventStream_endPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_resolveEndPromise, resolve, "f");
      __classPrivateFieldSet(this, _EventStream_rejectEndPromise, reject, "f");
    }));
    __classPrivateFieldGet(this, _EventStream_connectedPromise, "f").catch(() => {
    });
    __classPrivateFieldGet(this, _EventStream_endPromise, "f").catch(() => {
    });
  }
  _run(executor) {
    setTimeout(() => {
      executor().then(() => {
        this._emitFinal();
        this._emit("end");
      }, __classPrivateFieldGet(this, _EventStream_instances, "m", _EventStream_handleError).bind(this));
    }, 0);
  }
  _connected() {
    if (this.ended)
      return;
    __classPrivateFieldGet(this, _EventStream_resolveConnectedPromise, "f").call(this);
    this._emit("connect");
  }
  get ended() {
    return __classPrivateFieldGet(this, _EventStream_ended, "f");
  }
  get errored() {
    return __classPrivateFieldGet(this, _EventStream_errored, "f");
  }
  get aborted() {
    return __classPrivateFieldGet(this, _EventStream_aborted, "f");
  }
  abort() {
    this.controller.abort();
  }
  /**
   * Adds the listener function to the end of the listeners array for the event.
   * No checks are made to see if the listener has already been added. Multiple calls passing
   * the same combination of event and listener will result in the listener being added, and
   * called, multiple times.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  on(event, listener) {
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
    listeners.push({ listener });
    return this;
  }
  /**
   * Removes the specified listener from the listener array for the event.
   * off() will remove, at most, one instance of a listener from the listener array. If any single
   * listener has been added multiple times to the listener array for the specified event, then
   * off() must be called multiple times to remove each instance.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  off(event, listener) {
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
    if (!listeners)
      return this;
    const index = listeners.findIndex((l) => l.listener === listener);
    if (index >= 0)
      listeners.splice(index, 1);
    return this;
  }
  /**
   * Adds a one-time listener function for the event. The next time the event is triggered,
   * this listener is removed and then invoked.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  once(event, listener) {
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
    listeners.push({ listener, once: true });
    return this;
  }
  /**
   * This is similar to `.once()`, but returns a Promise that resolves the next time
   * the event is triggered, instead of calling a listener callback.
   * @returns a Promise that resolves the next time given event is triggered,
   * or rejects if an error is emitted.  (If you request the 'error' event,
   * returns a promise that resolves with the error).
   *
   * Example:
   *
   *   const message = await stream.emitted('message') // rejects if the stream errors
   */
  emitted(event) {
    return new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true);
      if (event !== "error")
        this.once("error", reject);
      this.once(event, resolve);
    });
  }
  async done() {
    __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true);
    await __classPrivateFieldGet(this, _EventStream_endPromise, "f");
  }
  _emit(event, ...args) {
    if (__classPrivateFieldGet(this, _EventStream_ended, "f")) {
      return;
    }
    if (event === "end") {
      __classPrivateFieldSet(this, _EventStream_ended, true);
      __classPrivateFieldGet(this, _EventStream_resolveEndPromise, "f").call(this);
    }
    const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
    if (listeners) {
      __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
      listeners.forEach(({ listener }) => listener(...args));
    }
    if (event === "abort") {
      const error = args[0];
      if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error);
      }
      __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
      __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
      this._emit("end");
      return;
    }
    if (event === "error") {
      const error = args[0];
      if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error);
      }
      __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
      __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
      this._emit("end");
    }
  }
  _emitFinal() {
  }
}
_EventStream_connectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_endPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_listeners = /* @__PURE__ */ new WeakMap(), _EventStream_ended = /* @__PURE__ */ new WeakMap(), _EventStream_errored = /* @__PURE__ */ new WeakMap(), _EventStream_aborted = /* @__PURE__ */ new WeakMap(), _EventStream_catchingPromiseCreated = /* @__PURE__ */ new WeakMap(), _EventStream_instances = /* @__PURE__ */ new WeakSet(), _EventStream_handleError = function _EventStream_handleError2(error) {
  __classPrivateFieldSet(this, _EventStream_errored, true);
  if (error instanceof Error && error.name === "AbortError") {
    error = new APIUserAbortError();
  }
  if (error instanceof APIUserAbortError) {
    __classPrivateFieldSet(this, _EventStream_aborted, true);
    return this._emit("abort", error);
  }
  if (error instanceof OpenAIError) {
    return this._emit("error", error);
  }
  if (error instanceof Error) {
    const openAIError = new OpenAIError(error.message);
    openAIError.cause = error;
    return this._emit("error", openAIError);
  }
  return this._emit("error", new OpenAIError(String(error)));
};
function isRunnableFunctionWithParse(fn) {
  return typeof fn.parse === "function";
}
var _AbstractChatCompletionRunner_instances, _AbstractChatCompletionRunner_getFinalContent, _AbstractChatCompletionRunner_getFinalMessage, _AbstractChatCompletionRunner_getFinalFunctionToolCall, _AbstractChatCompletionRunner_getFinalFunctionToolCallResult, _AbstractChatCompletionRunner_calculateTotalUsage, _AbstractChatCompletionRunner_validateParams, _AbstractChatCompletionRunner_stringifyFunctionCallResult;
const DEFAULT_MAX_CHAT_COMPLETIONS = 10;
class AbstractChatCompletionRunner extends EventStream {
  constructor() {
    super(...arguments);
    _AbstractChatCompletionRunner_instances.add(this);
    this._chatCompletions = [];
    this.messages = [];
  }
  _addChatCompletion(chatCompletion2) {
    this._chatCompletions.push(chatCompletion2);
    this._emit("chatCompletion", chatCompletion2);
    const message = chatCompletion2.choices[0]?.message;
    if (message)
      this._addMessage(message);
    return chatCompletion2;
  }
  _addMessage(message, emit = true) {
    if (!("content" in message))
      message.content = null;
    this.messages.push(message);
    if (emit) {
      this._emit("message", message);
      if (isToolMessage(message) && message.content) {
        this._emit("functionToolCallResult", message.content);
      } else if (isAssistantMessage(message) && message.tool_calls) {
        for (const tool_call of message.tool_calls) {
          if (tool_call.type === "function") {
            this._emit("functionToolCall", tool_call.function);
          }
        }
      }
    }
  }
  /**
   * @returns a promise that resolves with the final ChatCompletion, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletion.
   */
  async finalChatCompletion() {
    await this.done();
    const completion = this._chatCompletions[this._chatCompletions.length - 1];
    if (!completion)
      throw new OpenAIError("stream ended without producing a ChatCompletion");
    return completion;
  }
  /**
   * @returns a promise that resolves with the content of the final ChatCompletionMessage, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalContent() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
  }
  /**
   * @returns a promise that resolves with the the final assistant ChatCompletionMessage response,
   * or rejects if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalMessage() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
  }
  /**
   * @returns a promise that resolves with the content of the final FunctionCall, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalFunctionToolCall() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
  }
  async finalFunctionToolCallResult() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
  }
  async totalUsage() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this);
  }
  allChatCompletions() {
    return [...this._chatCompletions];
  }
  _emitFinal() {
    const completion = this._chatCompletions[this._chatCompletions.length - 1];
    if (completion)
      this._emit("finalChatCompletion", completion);
    const finalMessage = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
    if (finalMessage)
      this._emit("finalMessage", finalMessage);
    const finalContent = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
    if (finalContent)
      this._emit("finalContent", finalContent);
    const finalFunctionCall = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
    if (finalFunctionCall)
      this._emit("finalFunctionToolCall", finalFunctionCall);
    const finalFunctionCallResult = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
    if (finalFunctionCallResult != null)
      this._emit("finalFunctionToolCallResult", finalFunctionCallResult);
    if (this._chatCompletions.some((c) => c.usage)) {
      this._emit("totalUsage", __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this));
    }
  }
  async _createChatCompletion(client, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_validateParams).call(this, params);
    const chatCompletion2 = await client.chat.completions.create({ ...params, stream: false }, { ...options, signal: this.controller.signal });
    this._connected();
    return this._addChatCompletion(parseChatCompletion(chatCompletion2, params));
  }
  async _runChatCompletion(client, params, options) {
    for (const message of params.messages) {
      this._addMessage(message, false);
    }
    return await this._createChatCompletion(client, params, options);
  }
  async _runTools(client, params, options) {
    const role = "tool";
    const { tool_choice = "auto", stream, ...restParams } = params;
    const singleFunctionToCall = typeof tool_choice !== "string" && tool_choice.type === "function" && tool_choice?.function?.name;
    const { maxChatCompletions = DEFAULT_MAX_CHAT_COMPLETIONS } = options || {};
    const inputTools = params.tools.map((tool) => {
      if (isAutoParsableTool$1(tool)) {
        if (!tool.$callback) {
          throw new OpenAIError("Tool given to `.runTools()` that does not have an associated function");
        }
        return {
          type: "function",
          function: {
            function: tool.$callback,
            name: tool.function.name,
            description: tool.function.description || "",
            parameters: tool.function.parameters,
            parse: tool.$parseRaw,
            strict: true
          }
        };
      }
      return tool;
    });
    const functionsByName = {};
    for (const f of inputTools) {
      if (f.type === "function") {
        functionsByName[f.function.name || f.function.function.name] = f.function;
      }
    }
    const tools = "tools" in params ? inputTools.map((t) => t.type === "function" ? {
      type: "function",
      function: {
        name: t.function.name || t.function.function.name,
        parameters: t.function.parameters,
        description: t.function.description,
        strict: t.function.strict
      }
    } : t) : void 0;
    for (const message of params.messages) {
      this._addMessage(message, false);
    }
    for (let i = 0; i < maxChatCompletions; ++i) {
      const chatCompletion2 = await this._createChatCompletion(client, {
        ...restParams,
        tool_choice,
        tools,
        messages: [...this.messages]
      }, options);
      const message = chatCompletion2.choices[0]?.message;
      if (!message) {
        throw new OpenAIError(`missing message in ChatCompletion response`);
      }
      if (!message.tool_calls?.length) {
        return;
      }
      for (const tool_call of message.tool_calls) {
        if (tool_call.type !== "function")
          continue;
        const tool_call_id = tool_call.id;
        const { name: name2, arguments: args } = tool_call.function;
        const fn = functionsByName[name2];
        if (!fn) {
          const content2 = `Invalid tool_call: ${JSON.stringify(name2)}. Available options are: ${Object.keys(functionsByName).map((name3) => JSON.stringify(name3)).join(", ")}. Please try again`;
          this._addMessage({ role, tool_call_id, content: content2 });
          continue;
        } else if (singleFunctionToCall && singleFunctionToCall !== name2) {
          const content2 = `Invalid tool_call: ${JSON.stringify(name2)}. ${JSON.stringify(singleFunctionToCall)} requested. Please try again`;
          this._addMessage({ role, tool_call_id, content: content2 });
          continue;
        }
        let parsed;
        try {
          parsed = isRunnableFunctionWithParse(fn) ? await fn.parse(args) : args;
        } catch (error) {
          const content2 = error instanceof Error ? error.message : String(error);
          this._addMessage({ role, tool_call_id, content: content2 });
          continue;
        }
        const rawContent = await fn.function(parsed, this);
        const content = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_stringifyFunctionCallResult).call(this, rawContent);
        this._addMessage({ role, tool_call_id, content });
        if (singleFunctionToCall) {
          return;
        }
      }
    }
    return;
  }
}
_AbstractChatCompletionRunner_instances = /* @__PURE__ */ new WeakSet(), _AbstractChatCompletionRunner_getFinalContent = function _AbstractChatCompletionRunner_getFinalContent2() {
  return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this).content ?? null;
}, _AbstractChatCompletionRunner_getFinalMessage = function _AbstractChatCompletionRunner_getFinalMessage2() {
  let i = this.messages.length;
  while (i-- > 0) {
    const message = this.messages[i];
    if (isAssistantMessage(message)) {
      const ret = {
        ...message,
        content: message.content ?? null,
        refusal: message.refusal ?? null
      };
      return ret;
    }
  }
  throw new OpenAIError("stream ended without producing a ChatCompletionMessage with role=assistant");
}, _AbstractChatCompletionRunner_getFinalFunctionToolCall = function _AbstractChatCompletionRunner_getFinalFunctionToolCall2() {
  for (let i = this.messages.length - 1; i >= 0; i--) {
    const message = this.messages[i];
    if (isAssistantMessage(message) && message?.tool_calls?.length) {
      return message.tool_calls.filter((x) => x.type === "function").at(-1)?.function;
    }
  }
  return;
}, _AbstractChatCompletionRunner_getFinalFunctionToolCallResult = function _AbstractChatCompletionRunner_getFinalFunctionToolCallResult2() {
  for (let i = this.messages.length - 1; i >= 0; i--) {
    const message = this.messages[i];
    if (isToolMessage(message) && message.content != null && typeof message.content === "string" && this.messages.some((x) => x.role === "assistant" && x.tool_calls?.some((y) => y.type === "function" && y.id === message.tool_call_id))) {
      return message.content;
    }
  }
  return;
}, _AbstractChatCompletionRunner_calculateTotalUsage = function _AbstractChatCompletionRunner_calculateTotalUsage2() {
  const total = {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0
  };
  for (const { usage } of this._chatCompletions) {
    if (usage) {
      total.completion_tokens += usage.completion_tokens;
      total.prompt_tokens += usage.prompt_tokens;
      total.total_tokens += usage.total_tokens;
    }
  }
  return total;
}, _AbstractChatCompletionRunner_validateParams = function _AbstractChatCompletionRunner_validateParams2(params) {
  if (params.n != null && params.n > 1) {
    throw new OpenAIError("ChatCompletion convenience helpers only support n=1 at this time. To use n>1, please use chat.completions.create() directly.");
  }
}, _AbstractChatCompletionRunner_stringifyFunctionCallResult = function _AbstractChatCompletionRunner_stringifyFunctionCallResult2(rawContent) {
  return typeof rawContent === "string" ? rawContent : rawContent === void 0 ? "undefined" : JSON.stringify(rawContent);
};
class ChatCompletionRunner extends AbstractChatCompletionRunner {
  static runTools(client, params, options) {
    const runner = new ChatCompletionRunner();
    const opts = {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
    };
    runner._run(() => runner._runTools(client, params, opts));
    return runner;
  }
  _addMessage(message, emit = true) {
    super._addMessage(message, emit);
    if (isAssistantMessage(message) && message.content) {
      this._emit("content", message.content);
    }
  }
}
const STR = 1;
const NUM = 2;
const ARR = 4;
const OBJ = 8;
const NULL = 16;
const BOOL = 32;
const NAN = 64;
const INFINITY = 128;
const MINUS_INFINITY = 256;
const INF = INFINITY | MINUS_INFINITY;
const SPECIAL = NULL | BOOL | INF | NAN;
const ATOM = STR | NUM | SPECIAL;
const COLLECTION = ARR | OBJ;
const ALL = ATOM | COLLECTION;
const Allow = {
  STR,
  NUM,
  ARR,
  OBJ,
  NULL,
  BOOL,
  NAN,
  INFINITY,
  MINUS_INFINITY,
  INF,
  SPECIAL,
  ATOM,
  COLLECTION,
  ALL
};
class PartialJSON extends Error {
}
class MalformedJSON extends Error {
}
function parseJSON(jsonString, allowPartial = Allow.ALL) {
  if (typeof jsonString !== "string") {
    throw new TypeError(`expecting str, got ${typeof jsonString}`);
  }
  if (!jsonString.trim()) {
    throw new Error(`${jsonString} is empty`);
  }
  return _parseJSON(jsonString.trim(), allowPartial);
}
const _parseJSON = (jsonString, allow) => {
  const length = jsonString.length;
  let index = 0;
  const markPartialJSON = (msg) => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };
  const throwMalformedError = (msg) => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };
  const parseAny = () => {
    skipBlank();
    if (index >= length)
      markPartialJSON("Unexpected end of input");
    if (jsonString[index] === '"')
      return parseStr();
    if (jsonString[index] === "{")
      return parseObj();
    if (jsonString[index] === "[")
      return parseArr();
    if (jsonString.substring(index, index + 4) === "null" || Allow.NULL & allow && length - index < 4 && "null".startsWith(jsonString.substring(index))) {
      index += 4;
      return null;
    }
    if (jsonString.substring(index, index + 4) === "true" || Allow.BOOL & allow && length - index < 4 && "true".startsWith(jsonString.substring(index))) {
      index += 4;
      return true;
    }
    if (jsonString.substring(index, index + 5) === "false" || Allow.BOOL & allow && length - index < 5 && "false".startsWith(jsonString.substring(index))) {
      index += 5;
      return false;
    }
    if (jsonString.substring(index, index + 8) === "Infinity" || Allow.INFINITY & allow && length - index < 8 && "Infinity".startsWith(jsonString.substring(index))) {
      index += 8;
      return Infinity;
    }
    if (jsonString.substring(index, index + 9) === "-Infinity" || Allow.MINUS_INFINITY & allow && 1 < length - index && length - index < 9 && "-Infinity".startsWith(jsonString.substring(index))) {
      index += 9;
      return -Infinity;
    }
    if (jsonString.substring(index, index + 3) === "NaN" || Allow.NAN & allow && length - index < 3 && "NaN".startsWith(jsonString.substring(index))) {
      index += 3;
      return NaN;
    }
    return parseNum();
  };
  const parseStr = () => {
    const start = index;
    let escape2 = false;
    index++;
    while (index < length && (jsonString[index] !== '"' || escape2 && jsonString[index - 1] === "\\")) {
      escape2 = jsonString[index] === "\\" ? !escape2 : false;
      index++;
    }
    if (jsonString.charAt(index) == '"') {
      try {
        return JSON.parse(jsonString.substring(start, ++index - Number(escape2)));
      } catch (e) {
        throwMalformedError(String(e));
      }
    } else if (Allow.STR & allow) {
      try {
        return JSON.parse(jsonString.substring(start, index - Number(escape2)) + '"');
      } catch (e) {
        return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("\\")) + '"');
      }
    }
    markPartialJSON("Unterminated string literal");
  };
  const parseObj = () => {
    index++;
    skipBlank();
    const obj = {};
    try {
      while (jsonString[index] !== "}") {
        skipBlank();
        if (index >= length && Allow.OBJ & allow)
          return obj;
        const key = parseStr();
        skipBlank();
        index++;
        try {
          const value = parseAny();
          Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
        } catch (e) {
          if (Allow.OBJ & allow)
            return obj;
          else
            throw e;
        }
        skipBlank();
        if (jsonString[index] === ",")
          index++;
      }
    } catch (e) {
      if (Allow.OBJ & allow)
        return obj;
      else
        markPartialJSON("Expected '}' at end of object");
    }
    index++;
    return obj;
  };
  const parseArr = () => {
    index++;
    const arr = [];
    try {
      while (jsonString[index] !== "]") {
        arr.push(parseAny());
        skipBlank();
        if (jsonString[index] === ",") {
          index++;
        }
      }
    } catch (e) {
      if (Allow.ARR & allow) {
        return arr;
      }
      markPartialJSON("Expected ']' at end of array");
    }
    index++;
    return arr;
  };
  const parseNum = () => {
    if (index === 0) {
      if (jsonString === "-" && Allow.NUM & allow)
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        if (Allow.NUM & allow) {
          try {
            if ("." === jsonString[jsonString.length - 1])
              return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf(".")));
            return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf("e")));
          } catch (e2) {
          }
        }
        throwMalformedError(String(e));
      }
    }
    const start = index;
    if (jsonString[index] === "-")
      index++;
    while (jsonString[index] && !",]}".includes(jsonString[index]))
      index++;
    if (index == length && !(Allow.NUM & allow))
      markPartialJSON("Unterminated number literal");
    try {
      return JSON.parse(jsonString.substring(start, index));
    } catch (e) {
      if (jsonString.substring(start, index) === "-" && Allow.NUM & allow)
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("e")));
      } catch (e2) {
        throwMalformedError(String(e2));
      }
    }
  };
  const skipBlank = () => {
    while (index < length && " \n\r	".includes(jsonString[index])) {
      index++;
    }
  };
  return parseAny();
};
const partialParse = (input) => parseJSON(input, Allow.ALL ^ Allow.NUM);
var _ChatCompletionStream_instances, _ChatCompletionStream_params, _ChatCompletionStream_choiceEventStates, _ChatCompletionStream_currentChatCompletionSnapshot, _ChatCompletionStream_beginRequest, _ChatCompletionStream_getChoiceEventState, _ChatCompletionStream_addChunk, _ChatCompletionStream_emitToolCallDoneEvent, _ChatCompletionStream_emitContentDoneEvents, _ChatCompletionStream_endRequest, _ChatCompletionStream_getAutoParseableResponseFormat, _ChatCompletionStream_accumulateChatCompletion;
class ChatCompletionStream extends AbstractChatCompletionRunner {
  constructor(params) {
    super();
    _ChatCompletionStream_instances.add(this);
    _ChatCompletionStream_params.set(this, void 0);
    _ChatCompletionStream_choiceEventStates.set(this, void 0);
    _ChatCompletionStream_currentChatCompletionSnapshot.set(this, void 0);
    __classPrivateFieldSet(this, _ChatCompletionStream_params, params);
    __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, []);
  }
  get currentChatCompletionSnapshot() {
    return __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
  }
  /**
   * Intended for use on the frontend, consuming a stream produced with
   * `.toReadableStream()` on the backend.
   *
   * Note that messages sent to the model do not appear in `.on('message')`
   * in this context.
   */
  static fromReadableStream(stream) {
    const runner = new ChatCompletionStream(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static createChatCompletion(client, params, options) {
    const runner = new ChatCompletionStream(params);
    runner._run(() => runner._runChatCompletion(client, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
    return runner;
  }
  async _createChatCompletion(client, params, options) {
    super._createChatCompletion;
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
    const stream = await client.chat.completions.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const chunk of stream) {
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
    this._connected();
    const stream = Stream.fromReadableStream(readableStream, this.controller);
    let chatId;
    for await (const chunk of stream) {
      if (chatId && chatId !== chunk.id) {
        this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
      }
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
      chatId = chunk.id;
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
  }
  [(_ChatCompletionStream_params = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_choiceEventStates = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_currentChatCompletionSnapshot = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_instances = /* @__PURE__ */ new WeakSet(), _ChatCompletionStream_beginRequest = function _ChatCompletionStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0);
  }, _ChatCompletionStream_getChoiceEventState = function _ChatCompletionStream_getChoiceEventState2(choice) {
    let state = __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index];
    if (state) {
      return state;
    }
    state = {
      content_done: false,
      refusal_done: false,
      logprobs_content_done: false,
      logprobs_refusal_done: false,
      done_tool_calls: /* @__PURE__ */ new Set(),
      current_tool_call_index: null
    };
    __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index] = state;
    return state;
  }, _ChatCompletionStream_addChunk = function _ChatCompletionStream_addChunk2(chunk) {
    if (this.ended)
      return;
    const completion = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_accumulateChatCompletion).call(this, chunk);
    this._emit("chunk", chunk, completion);
    for (const choice of chunk.choices) {
      const choiceSnapshot = completion.choices[choice.index];
      if (choice.delta.content != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.content) {
        this._emit("content", choice.delta.content, choiceSnapshot.message.content);
        this._emit("content.delta", {
          delta: choice.delta.content,
          snapshot: choiceSnapshot.message.content,
          parsed: choiceSnapshot.message.parsed
        });
      }
      if (choice.delta.refusal != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.refusal) {
        this._emit("refusal.delta", {
          delta: choice.delta.refusal,
          snapshot: choiceSnapshot.message.refusal
        });
      }
      if (choice.logprobs?.content != null && choiceSnapshot.message?.role === "assistant") {
        this._emit("logprobs.content.delta", {
          content: choice.logprobs?.content,
          snapshot: choiceSnapshot.logprobs?.content ?? []
        });
      }
      if (choice.logprobs?.refusal != null && choiceSnapshot.message?.role === "assistant") {
        this._emit("logprobs.refusal.delta", {
          refusal: choice.logprobs?.refusal,
          snapshot: choiceSnapshot.logprobs?.refusal ?? []
        });
      }
      const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
      if (choiceSnapshot.finish_reason) {
        __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
        if (state.current_tool_call_index != null) {
          __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
        }
      }
      for (const toolCall of choice.delta.tool_calls ?? []) {
        if (state.current_tool_call_index !== toolCall.index) {
          __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
          if (state.current_tool_call_index != null) {
            __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
          }
        }
        state.current_tool_call_index = toolCall.index;
      }
      for (const toolCallDelta of choice.delta.tool_calls ?? []) {
        const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallDelta.index];
        if (!toolCallSnapshot?.type) {
          continue;
        }
        if (toolCallSnapshot?.type === "function") {
          this._emit("tool_calls.function.arguments.delta", {
            name: toolCallSnapshot.function?.name,
            index: toolCallDelta.index,
            arguments: toolCallSnapshot.function.arguments,
            parsed_arguments: toolCallSnapshot.function.parsed_arguments,
            arguments_delta: toolCallDelta.function?.arguments ?? ""
          });
        } else {
          assertNever(toolCallSnapshot?.type);
        }
      }
    }
  }, _ChatCompletionStream_emitToolCallDoneEvent = function _ChatCompletionStream_emitToolCallDoneEvent2(choiceSnapshot, toolCallIndex) {
    const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
    if (state.done_tool_calls.has(toolCallIndex)) {
      return;
    }
    const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallIndex];
    if (!toolCallSnapshot) {
      throw new Error("no tool call snapshot");
    }
    if (!toolCallSnapshot.type) {
      throw new Error("tool call snapshot missing `type`");
    }
    if (toolCallSnapshot.type === "function") {
      const inputTool = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.tools?.find((tool) => isChatCompletionFunctionTool(tool) && tool.function.name === toolCallSnapshot.function.name);
      this._emit("tool_calls.function.arguments.done", {
        name: toolCallSnapshot.function.name,
        index: toolCallIndex,
        arguments: toolCallSnapshot.function.arguments,
        parsed_arguments: isAutoParsableTool$1(inputTool) ? inputTool.$parseRaw(toolCallSnapshot.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCallSnapshot.function.arguments) : null
      });
    } else {
      assertNever(toolCallSnapshot.type);
    }
  }, _ChatCompletionStream_emitContentDoneEvents = function _ChatCompletionStream_emitContentDoneEvents2(choiceSnapshot) {
    const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
    if (choiceSnapshot.message.content && !state.content_done) {
      state.content_done = true;
      const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this);
      this._emit("content.done", {
        content: choiceSnapshot.message.content,
        parsed: responseFormat ? responseFormat.$parseRaw(choiceSnapshot.message.content) : null
      });
    }
    if (choiceSnapshot.message.refusal && !state.refusal_done) {
      state.refusal_done = true;
      this._emit("refusal.done", { refusal: choiceSnapshot.message.refusal });
    }
    if (choiceSnapshot.logprobs?.content && !state.logprobs_content_done) {
      state.logprobs_content_done = true;
      this._emit("logprobs.content.done", { content: choiceSnapshot.logprobs.content });
    }
    if (choiceSnapshot.logprobs?.refusal && !state.logprobs_refusal_done) {
      state.logprobs_refusal_done = true;
      this._emit("logprobs.refusal.done", { refusal: choiceSnapshot.logprobs.refusal });
    }
  }, _ChatCompletionStream_endRequest = function _ChatCompletionStream_endRequest2() {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    const snapshot = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    if (!snapshot) {
      throw new OpenAIError(`request ended without sending any chunks`);
    }
    __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0);
    __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, []);
    return finalizeChatCompletion(snapshot, __classPrivateFieldGet(this, _ChatCompletionStream_params, "f"));
  }, _ChatCompletionStream_getAutoParseableResponseFormat = function _ChatCompletionStream_getAutoParseableResponseFormat2() {
    const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.response_format;
    if (isAutoParsableResponseFormat(responseFormat)) {
      return responseFormat;
    }
    return null;
  }, _ChatCompletionStream_accumulateChatCompletion = function _ChatCompletionStream_accumulateChatCompletion2(chunk) {
    var _a2, _b, _c, _d;
    let snapshot = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    const { choices, ...rest } = chunk;
    if (!snapshot) {
      snapshot = __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, {
        ...rest,
        choices: []
      });
    } else {
      Object.assign(snapshot, rest);
    }
    for (const { delta, finish_reason, index, logprobs = null, ...other } of chunk.choices) {
      let choice = snapshot.choices[index];
      if (!choice) {
        choice = snapshot.choices[index] = { finish_reason, index, message: {}, logprobs, ...other };
      }
      if (logprobs) {
        if (!choice.logprobs) {
          choice.logprobs = Object.assign({}, logprobs);
        } else {
          const { content: content2, refusal: refusal2, ...rest3 } = logprobs;
          Object.assign(choice.logprobs, rest3);
          if (content2) {
            (_a2 = choice.logprobs).content ?? (_a2.content = []);
            choice.logprobs.content.push(...content2);
          }
          if (refusal2) {
            (_b = choice.logprobs).refusal ?? (_b.refusal = []);
            choice.logprobs.refusal.push(...refusal2);
          }
        }
      }
      if (finish_reason) {
        choice.finish_reason = finish_reason;
        if (__classPrivateFieldGet(this, _ChatCompletionStream_params, "f") && hasAutoParseableInput$1(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"))) {
          if (finish_reason === "length") {
            throw new LengthFinishReasonError();
          }
          if (finish_reason === "content_filter") {
            throw new ContentFilterFinishReasonError();
          }
        }
      }
      Object.assign(choice, other);
      if (!delta)
        continue;
      const { content, refusal, function_call, role, tool_calls, ...rest2 } = delta;
      Object.assign(choice.message, rest2);
      if (refusal) {
        choice.message.refusal = (choice.message.refusal || "") + refusal;
      }
      if (role)
        choice.message.role = role;
      if (function_call) {
        if (!choice.message.function_call) {
          choice.message.function_call = function_call;
        } else {
          if (function_call.name)
            choice.message.function_call.name = function_call.name;
          if (function_call.arguments) {
            (_c = choice.message.function_call).arguments ?? (_c.arguments = "");
            choice.message.function_call.arguments += function_call.arguments;
          }
        }
      }
      if (content) {
        choice.message.content = (choice.message.content || "") + content;
        if (!choice.message.refusal && __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this)) {
          choice.message.parsed = partialParse(choice.message.content);
        }
      }
      if (tool_calls) {
        if (!choice.message.tool_calls)
          choice.message.tool_calls = [];
        for (const { index: index2, id, type, function: fn, ...rest3 } of tool_calls) {
          const tool_call = (_d = choice.message.tool_calls)[index2] ?? (_d[index2] = {});
          Object.assign(tool_call, rest3);
          if (id)
            tool_call.id = id;
          if (type)
            tool_call.type = type;
          if (fn)
            tool_call.function ?? (tool_call.function = { name: fn.name ?? "", arguments: "" });
          if (fn?.name)
            tool_call.function.name = fn.name;
          if (fn?.arguments) {
            tool_call.function.arguments += fn.arguments;
            if (shouldParseToolCall(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"), tool_call)) {
              tool_call.function.parsed_arguments = partialParse(tool_call.function.arguments);
            }
          }
        }
      }
    }
    return snapshot;
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("chunk", (chunk) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(chunk);
      } else {
        pushQueue.push(chunk);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
}
function finalizeChatCompletion(snapshot, params) {
  const { id, choices, created, model, system_fingerprint, ...rest } = snapshot;
  const completion = {
    ...rest,
    id,
    choices: choices.map(({ message, finish_reason, index, logprobs, ...choiceRest }) => {
      if (!finish_reason) {
        throw new OpenAIError(`missing finish_reason for choice ${index}`);
      }
      const { content = null, function_call, tool_calls, ...messageRest } = message;
      const role = message.role;
      if (!role) {
        throw new OpenAIError(`missing role for choice ${index}`);
      }
      if (function_call) {
        const { arguments: args, name: name2 } = function_call;
        if (args == null) {
          throw new OpenAIError(`missing function_call.arguments for choice ${index}`);
        }
        if (!name2) {
          throw new OpenAIError(`missing function_call.name for choice ${index}`);
        }
        return {
          ...choiceRest,
          message: {
            content,
            function_call: { arguments: args, name: name2 },
            role,
            refusal: message.refusal ?? null
          },
          finish_reason,
          index,
          logprobs
        };
      }
      if (tool_calls) {
        return {
          ...choiceRest,
          index,
          finish_reason,
          logprobs,
          message: {
            ...messageRest,
            role,
            content,
            refusal: message.refusal ?? null,
            tool_calls: tool_calls.map((tool_call, i) => {
              const { function: fn, type, id: id2, ...toolRest } = tool_call;
              const { arguments: args, name: name2, ...fnRest } = fn || {};
              if (id2 == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].id
${str(snapshot)}`);
              }
              if (type == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].type
${str(snapshot)}`);
              }
              if (name2 == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.name
${str(snapshot)}`);
              }
              if (args == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.arguments
${str(snapshot)}`);
              }
              return { ...toolRest, id: id2, type, function: { ...fnRest, name: name2, arguments: args } };
            })
          }
        };
      }
      return {
        ...choiceRest,
        message: { ...messageRest, content, role, refusal: message.refusal ?? null },
        finish_reason,
        index,
        logprobs
      };
    }),
    created,
    model,
    object: "chat.completion",
    ...system_fingerprint ? { system_fingerprint } : {}
  };
  return maybeParseChatCompletion(completion, params);
}
function str(x) {
  return JSON.stringify(x);
}
function assertNever(_x) {
}
class ChatCompletionStreamingRunner extends ChatCompletionStream {
  static fromReadableStream(stream) {
    const runner = new ChatCompletionStreamingRunner(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static runTools(client, params, options) {
    const runner = new ChatCompletionStreamingRunner(
      // @ts-expect-error TODO these types are incompatible
      params
    );
    const opts = {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
    };
    runner._run(() => runner._runTools(client, params, opts));
    return runner;
  }
}
let Completions$1 = class Completions extends APIResource {
  constructor() {
    super(...arguments);
    this.messages = new Messages$1(this._client);
  }
  create(body, options) {
    return this._client.post("/chat/completions", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a stored chat completion. Only Chat Completions that have been created with
   * the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * const chatCompletion =
   *   await client.chat.completions.retrieve('completion_id');
   * ```
   */
  retrieve(completionID, options) {
    return this._client.get(path`/chat/completions/${completionID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modify a stored chat completion. Only Chat Completions that have been created
   * with the `store` parameter set to `true` can be modified. Currently, the only
   * supported modification is to update the `metadata` field.
   *
   * @example
   * ```ts
   * const chatCompletion = await client.chat.completions.update(
   *   'completion_id',
   *   { metadata: { foo: 'string' } },
   * );
   * ```
   */
  update(completionID, body, options) {
    return this._client.post(path`/chat/completions/${completionID}`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List stored Chat Completions. Only Chat Completions that have been stored with
   * the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatCompletion of client.chat.completions.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/chat/completions", CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a stored chat completion. Only Chat Completions that have been created
   * with the `store` parameter set to `true` can be deleted.
   *
   * @example
   * ```ts
   * const chatCompletionDeleted =
   *   await client.chat.completions.delete('completion_id');
   * ```
   */
  delete(completionID, options) {
    return this._client.delete(path`/chat/completions/${completionID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  parse(body, options) {
    validateInputTools(body.tools);
    return this._client.chat.completions.create(body, {
      ...options,
      headers: {
        ...options?.headers,
        "X-Stainless-Helper-Method": "chat.completions.parse"
      }
    })._thenUnwrap((completion) => parseChatCompletion(completion, body));
  }
  runTools(body, options) {
    if (body.stream) {
      return ChatCompletionStreamingRunner.runTools(this._client, body, options);
    }
    return ChatCompletionRunner.runTools(this._client, body, options);
  }
  /**
   * Creates a chat completion stream
   */
  stream(body, options) {
    return ChatCompletionStream.createChatCompletion(this._client, body, options);
  }
};
Completions$1.Messages = Messages$1;
class Chat extends APIResource {
  constructor() {
    super(...arguments);
    this.completions = new Completions$1(this._client);
  }
}
Chat.Completions = Completions$1;
class AdminAPIKeys extends APIResource {
  /**
   * Create an organization admin API key
   *
   * @example
   * ```ts
   * const adminAPIKey =
   *   await client.admin.organization.adminAPIKeys.create({
   *     name: 'New Admin Key',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/admin_api_keys", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieve a single organization API key
   *
   * @example
   * ```ts
   * const adminAPIKey =
   *   await client.admin.organization.adminAPIKeys.retrieve(
   *     'key_id',
   *   );
   * ```
   */
  retrieve(keyID, options) {
    return this._client.get(path`/organization/admin_api_keys/${keyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * List organization API keys
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const adminAPIKey of client.admin.organization.adminAPIKeys.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/admin_api_keys", CursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Delete an organization admin API key
   *
   * @example
   * ```ts
   * const adminAPIKey =
   *   await client.admin.organization.adminAPIKeys.delete(
   *     'key_id',
   *   );
   * ```
   */
  delete(keyID, options) {
    return this._client.delete(path`/organization/admin_api_keys/${keyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
class AuditLogs extends APIResource {
  /**
   * List user actions and configuration changes within this organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const auditLogListResponse of client.admin.organization.auditLogs.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/audit_logs", ConversationCursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
let Certificates$1 = class Certificates extends APIResource {
  /**
   * Upload a certificate to the organization. This does **not** automatically
   * activate the certificate.
   *
   * Organizations can upload up to 50 certificates.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.create({
   *     certificate: 'certificate',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/certificates", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get a certificate that has been uploaded to the organization.
   *
   * You can get a certificate regardless of whether it is active or not.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.retrieve(
   *     'certificate_id',
   *   );
   * ```
   */
  retrieve(certificateID, query2 = {}, options) {
    return this._client.get(path`/organization/certificates/${certificateID}`, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modify a certificate. Note that only the name can be modified.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.update(
   *     'certificate_id',
   *   );
   * ```
   */
  update(certificateID, body, options) {
    return this._client.post(path`/organization/certificates/${certificateID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * List uploaded certificates for this organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateListResponse of client.admin.organization.certificates.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/certificates", ConversationCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Delete a certificate from the organization.
   *
   * The certificate must be inactive for the organization and all projects.
   *
   * @example
   * ```ts
   * const certificate =
   *   await client.admin.organization.certificates.delete(
   *     'certificate_id',
   *   );
   * ```
   */
  delete(certificateID, options) {
    return this._client.delete(path`/organization/certificates/${certificateID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Activate certificates at the organization level.
   *
   * You can atomically and idempotently activate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateActivateResponse of client.admin.organization.certificates.activate(
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  activate(body, options) {
    return this._client.getAPIList("/organization/certificates/activate", Page, {
      body,
      method: "post",
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deactivate certificates at the organization level.
   *
   * You can atomically and idempotently deactivate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateDeactivateResponse of client.admin.organization.certificates.deactivate(
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  deactivate(body, options) {
    return this._client.getAPIList("/organization/certificates/deactivate", Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
};
class Invites extends APIResource {
  /**
   * Create an invite for a user to the organization. The invite must be accepted by
   * the user before they have access to the organization.
   *
   * @example
   * ```ts
   * const invite =
   *   await client.admin.organization.invites.create({
   *     email: 'email',
   *     role: 'reader',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/invites", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves an invite.
   *
   * @example
   * ```ts
   * const invite =
   *   await client.admin.organization.invites.retrieve(
   *     'invite_id',
   *   );
   * ```
   */
  retrieve(inviteID, options) {
    return this._client.get(path`/organization/invites/${inviteID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of invites in the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const invite of client.admin.organization.invites.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/invites", ConversationCursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Delete an invite. If the invite has already been accepted, it cannot be deleted.
   *
   * @example
   * ```ts
   * const invite =
   *   await client.admin.organization.invites.delete(
   *     'invite_id',
   *   );
   * ```
   */
  delete(inviteID, options) {
    return this._client.delete(path`/organization/invites/${inviteID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
let Roles$5 = class Roles extends APIResource {
  /**
   * Creates a custom role for the organization.
   *
   * @example
   * ```ts
   * const role = await client.admin.organization.roles.create({
   *   permissions: ['string'],
   *   role_name: 'role_name',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/roles", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates an existing organization role.
   *
   * @example
   * ```ts
   * const role = await client.admin.organization.roles.update(
   *   'role_id',
   * );
   * ```
   */
  update(roleID, body, options) {
    return this._client.post(path`/organization/roles/${roleID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the roles configured for the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const role of client.admin.organization.roles.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/roles", NextCursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a custom role from the organization.
   *
   * @example
   * ```ts
   * const role = await client.admin.organization.roles.delete(
   *   'role_id',
   * );
   * ```
   */
  delete(roleID, options) {
    return this._client.delete(path`/organization/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
let Usage$1 = class Usage extends APIResource {
  /**
   * Get audio speeches usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.audioSpeeches({
   *     start_time: 0,
   *   });
   * ```
   */
  audioSpeeches(query2, options) {
    return this._client.get("/organization/usage/audio_speeches", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get audio transcriptions usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.audioTranscriptions(
   *     { start_time: 0 },
   *   );
   * ```
   */
  audioTranscriptions(query2, options) {
    return this._client.get("/organization/usage/audio_transcriptions", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get code interpreter sessions usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.codeInterpreterSessions(
   *     { start_time: 0 },
   *   );
   * ```
   */
  codeInterpreterSessions(query2, options) {
    return this._client.get("/organization/usage/code_interpreter_sessions", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get completions usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.completions({
   *     start_time: 0,
   *   });
   * ```
   */
  completions(query2, options) {
    return this._client.get("/organization/usage/completions", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get costs details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.costs({
   *     start_time: 0,
   *   });
   * ```
   */
  costs(query2, options) {
    return this._client.get("/organization/costs", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get embeddings usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.embeddings({
   *     start_time: 0,
   *   });
   * ```
   */
  embeddings(query2, options) {
    return this._client.get("/organization/usage/embeddings", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get images usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.images({
   *     start_time: 0,
   *   });
   * ```
   */
  images(query2, options) {
    return this._client.get("/organization/usage/images", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get moderations usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.moderations({
   *     start_time: 0,
   *   });
   * ```
   */
  moderations(query2, options) {
    return this._client.get("/organization/usage/moderations", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Get vector stores usage details for the organization.
   *
   * @example
   * ```ts
   * const response =
   *   await client.admin.organization.usage.vectorStores({
   *     start_time: 0,
   *   });
   * ```
   */
  vectorStores(query2, options) {
    return this._client.get("/organization/usage/vector_stores", {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
let Roles$4 = class Roles2 extends APIResource {
  /**
   * Assigns an organization role to a group within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.groups.roles.create(
   *     'group_id',
   *     { role_id: 'role_id' },
   *   );
   * ```
   */
  create(groupID, body, options) {
    return this._client.post(path`/organization/groups/${groupID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the organization roles assigned to a group within the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.groups.roles.list(
   *   'group_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(groupID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/groups/${groupID}/roles`, NextCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns an organization role from a group within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.groups.roles.delete(
   *     'role_id',
   *     { group_id: 'group_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { group_id } = params;
    return this._client.delete(path`/organization/groups/${group_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
let Users$2 = class Users extends APIResource {
  /**
   * Adds a user to a group.
   *
   * @example
   * ```ts
   * const user =
   *   await client.admin.organization.groups.users.create(
   *     'group_id',
   *     { user_id: 'user_id' },
   *   );
   * ```
   */
  create(groupID, body, options) {
    return this._client.post(path`/organization/groups/${groupID}/users`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the users assigned to a group.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const organizationGroupUser of client.admin.organization.groups.users.list(
   *   'group_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(groupID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/groups/${groupID}/users`, NextCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Removes a user from a group.
   *
   * @example
   * ```ts
   * const user =
   *   await client.admin.organization.groups.users.delete(
   *     'user_id',
   *     { group_id: 'group_id' },
   *   );
   * ```
   */
  delete(userID, params, options) {
    const { group_id } = params;
    return this._client.delete(path`/organization/groups/${group_id}/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
let Groups$1 = class Groups extends APIResource {
  constructor() {
    super(...arguments);
    this.users = new Users$2(this._client);
    this.roles = new Roles$4(this._client);
  }
  /**
   * Creates a new group in the organization.
   *
   * @example
   * ```ts
   * const group = await client.admin.organization.groups.create(
   *   { name: 'x' },
   * );
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/groups", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates a group's information.
   *
   * @example
   * ```ts
   * const group = await client.admin.organization.groups.update(
   *   'group_id',
   *   { name: 'x' },
   * );
   * ```
   */
  update(groupID, body, options) {
    return this._client.post(path`/organization/groups/${groupID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists all groups in the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const group of client.admin.organization.groups.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/groups", NextCursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a group from the organization.
   *
   * @example
   * ```ts
   * const group = await client.admin.organization.groups.delete(
   *   'group_id',
   * );
   * ```
   */
  delete(groupID, options) {
    return this._client.delete(path`/organization/groups/${groupID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
Groups$1.Users = Users$2;
Groups$1.Roles = Roles$4;
class APIKeys extends APIResource {
  /**
   * Retrieves an API key in the project.
   *
   * @example
   * ```ts
   * const projectAPIKey =
   *   await client.admin.organization.projects.apiKeys.retrieve(
   *     'api_key_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(apiKeyID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/organization/projects/${project_id}/api_keys/${apiKeyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of API keys in the project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectAPIKey of client.admin.organization.projects.apiKeys.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/api_keys`, ConversationCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes an API key from the project.
   *
   * Returns confirmation of the key deletion, or an error if the key belonged to a
   * service account.
   *
   * @example
   * ```ts
   * const apiKey =
   *   await client.admin.organization.projects.apiKeys.delete(
   *     'api_key_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(apiKeyID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/api_keys/${apiKeyID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
class Certificates2 extends APIResource {
  /**
   * List certificates for this project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateListResponse of client.admin.organization.projects.certificates.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/certificates`, ConversationCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Activate certificates at the project level.
   *
   * You can atomically and idempotently activate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateActivateResponse of client.admin.organization.projects.certificates.activate(
   *   'project_id',
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  activate(projectID, body, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/certificates/activate`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deactivate certificates at the project level. You can atomically and
   * idempotently deactivate up to 10 certificates at a time.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const certificateDeactivateResponse of client.admin.organization.projects.certificates.deactivate(
   *   'project_id',
   *   { certificate_ids: ['cert_abc'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  deactivate(projectID, body, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/certificates/deactivate`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
}
class RateLimits extends APIResource {
  /**
   * Returns the rate limits per model for a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectRateLimit of client.admin.organization.projects.rateLimits.listRateLimits(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  listRateLimits(projectID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/rate_limits`, ConversationCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Updates a project rate limit.
   *
   * @example
   * ```ts
   * const projectRateLimit =
   *   await client.admin.organization.projects.rateLimits.updateRateLimit(
   *     'rate_limit_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  updateRateLimit(rateLimitID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/organization/projects/${project_id}/rate_limits/${rateLimitID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
let Roles$3 = class Roles3 extends APIResource {
  /**
   * Creates a custom role for a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.roles.create(
   *     'project_id',
   *     { permissions: ['string'], role_name: 'role_name' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/projects/${projectID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Updates an existing project role.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.roles.update(
   *     'role_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  update(roleID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/projects/${project_id}/roles/${roleID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the roles configured for a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const role of client.admin.organization.projects.roles.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query2 = {}, options) {
    return this._client.getAPIList(path`/projects/${projectID}/roles`, NextCursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a custom role from a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.roles.delete(
   *     'role_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/projects/${project_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
class ServiceAccounts extends APIResource {
  /**
   * Creates a new service account in the project. This also returns an unredacted
   * API key for the service account.
   *
   * @example
   * ```ts
   * const serviceAccount =
   *   await client.admin.organization.projects.serviceAccounts.create(
   *     'project_id',
   *     { name: 'name' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/service_accounts`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a service account in the project.
   *
   * @example
   * ```ts
   * const projectServiceAccount =
   *   await client.admin.organization.projects.serviceAccounts.retrieve(
   *     'service_account_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(serviceAccountID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of service accounts in the project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectServiceAccount of client.admin.organization.projects.serviceAccounts.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/service_accounts`, ConversationCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes a service account from the project.
   *
   * Returns confirmation of service account deletion, or an error if the project is
   * archived (archived projects have no service accounts).
   *
   * @example
   * ```ts
   * const serviceAccount =
   *   await client.admin.organization.projects.serviceAccounts.delete(
   *     'service_account_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(serviceAccountID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, { ...options, __security: { adminAPIKeyAuth: true } });
  }
}
let Roles$2 = class Roles4 extends APIResource {
  /**
   * Assigns a project role to a group within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.groups.roles.create(
   *     'group_id',
   *     { project_id: 'project_id', role_id: 'role_id' },
   *   );
   * ```
   */
  create(groupID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/projects/${project_id}/groups/${groupID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the project roles assigned to a group within a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.projects.groups.roles.list(
   *   'group_id',
   *   { project_id: 'project_id' },
   * )) {
   *   // ...
   * }
   * ```
   */
  list(groupID, params, options) {
    const { project_id, ...query2 } = params;
    return this._client.getAPIList(path`/projects/${project_id}/groups/${groupID}/roles`, NextCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns a project role from a group within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.groups.roles.delete(
   *     'role_id',
   *     { project_id: 'project_id', group_id: 'group_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { project_id, group_id } = params;
    return this._client.delete(path`/projects/${project_id}/groups/${group_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
class Groups2 extends APIResource {
  constructor() {
    super(...arguments);
    this.roles = new Roles$2(this._client);
  }
  /**
   * Grants a group access to a project.
   *
   * @example
   * ```ts
   * const projectGroup =
   *   await client.admin.organization.projects.groups.create(
   *     'project_id',
   *     { group_id: 'group_id', role: 'role' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/groups`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the groups that have access to a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectGroup of client.admin.organization.projects.groups.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/groups`, NextCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Revokes a group's access to a project.
   *
   * @example
   * ```ts
   * const group =
   *   await client.admin.organization.projects.groups.delete(
   *     'group_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(groupID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/groups/${groupID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
Groups2.Roles = Roles$2;
let Roles$1 = class Roles5 extends APIResource {
  /**
   * Assigns a project role to a user within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.users.roles.create(
   *     'user_id',
   *     { project_id: 'project_id', role_id: 'role_id' },
   *   );
   * ```
   */
  create(userID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/projects/${project_id}/users/${userID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the project roles assigned to a user within a project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.projects.users.roles.list(
   *   'user_id',
   *   { project_id: 'project_id' },
   * )) {
   *   // ...
   * }
   * ```
   */
  list(userID, params, options) {
    const { project_id, ...query2 } = params;
    return this._client.getAPIList(path`/projects/${project_id}/users/${userID}/roles`, NextCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns a project role from a user within a project.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.projects.users.roles.delete(
   *     'role_id',
   *     { project_id: 'project_id', user_id: 'user_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { project_id, user_id } = params;
    return this._client.delete(path`/projects/${project_id}/users/${user_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
let Users$1 = class Users2 extends APIResource {
  constructor() {
    super(...arguments);
    this.roles = new Roles$1(this._client);
  }
  /**
   * Adds a user to the project. Users must already be members of the organization to
   * be added to a project.
   *
   * @example
   * ```ts
   * const projectUser =
   *   await client.admin.organization.projects.users.create(
   *     'project_id',
   *     { role: 'role' },
   *   );
   * ```
   */
  create(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}/users`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a user in the project.
   *
   * @example
   * ```ts
   * const projectUser =
   *   await client.admin.organization.projects.users.retrieve(
   *     'user_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  retrieve(userID, params, options) {
    const { project_id } = params;
    return this._client.get(path`/organization/projects/${project_id}/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modifies a user's role in the project.
   *
   * @example
   * ```ts
   * const projectUser =
   *   await client.admin.organization.projects.users.update(
   *     'user_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  update(userID, params, options) {
    const { project_id, ...body } = params;
    return this._client.post(path`/organization/projects/${project_id}/users/${userID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of users in the project.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const projectUser of client.admin.organization.projects.users.list(
   *   'project_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(projectID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/projects/${projectID}/users`, ConversationCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Deletes a user from the project.
   *
   * Returns confirmation of project user deletion, or an error if the project is
   * archived (archived projects have no users).
   *
   * @example
   * ```ts
   * const user =
   *   await client.admin.organization.projects.users.delete(
   *     'user_id',
   *     { project_id: 'project_id' },
   *   );
   * ```
   */
  delete(userID, params, options) {
    const { project_id } = params;
    return this._client.delete(path`/organization/projects/${project_id}/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
};
Users$1.Roles = Roles$1;
class Projects extends APIResource {
  constructor() {
    super(...arguments);
    this.users = new Users$1(this._client);
    this.serviceAccounts = new ServiceAccounts(this._client);
    this.apiKeys = new APIKeys(this._client);
    this.rateLimits = new RateLimits(this._client);
    this.groups = new Groups2(this._client);
    this.roles = new Roles$3(this._client);
    this.certificates = new Certificates2(this._client);
  }
  /**
   * Create a new project in the organization. Projects can be created and archived,
   * but cannot be deleted.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.create({
   *     name: 'name',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/organization/projects", {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Retrieves a project.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.retrieve(
   *     'project_id',
   *   );
   * ```
   */
  retrieve(projectID, options) {
    return this._client.get(path`/organization/projects/${projectID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modifies a project in the organization.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.update(
   *     'project_id',
   *   );
   * ```
   */
  update(projectID, body, options) {
    return this._client.post(path`/organization/projects/${projectID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Returns a list of projects.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const project of client.admin.organization.projects.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/projects", ConversationCursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Archives a project in the organization. Archived projects cannot be used or
   * updated.
   *
   * @example
   * ```ts
   * const project =
   *   await client.admin.organization.projects.archive(
   *     'project_id',
   *   );
   * ```
   */
  archive(projectID, options) {
    return this._client.post(path`/organization/projects/${projectID}/archive`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
Projects.Users = Users$1;
Projects.ServiceAccounts = ServiceAccounts;
Projects.APIKeys = APIKeys;
Projects.RateLimits = RateLimits;
Projects.Groups = Groups2;
Projects.Roles = Roles$3;
Projects.Certificates = Certificates2;
class Roles6 extends APIResource {
  /**
   * Assigns an organization role to a user within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.users.roles.create(
   *     'user_id',
   *     { role_id: 'role_id' },
   *   );
   * ```
   */
  create(userID, body, options) {
    return this._client.post(path`/organization/users/${userID}/roles`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists the organization roles assigned to a user within the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const roleListResponse of client.admin.organization.users.roles.list(
   *   'user_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(userID, query2 = {}, options) {
    return this._client.getAPIList(path`/organization/users/${userID}/roles`, NextCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * Unassigns an organization role from a user within the organization.
   *
   * @example
   * ```ts
   * const role =
   *   await client.admin.organization.users.roles.delete(
   *     'role_id',
   *     { user_id: 'user_id' },
   *   );
   * ```
   */
  delete(roleID, params, options) {
    const { user_id } = params;
    return this._client.delete(path`/organization/users/${user_id}/roles/${roleID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
class Users3 extends APIResource {
  constructor() {
    super(...arguments);
    this.roles = new Roles6(this._client);
  }
  /**
   * Retrieves a user by their identifier.
   *
   * @example
   * ```ts
   * const organizationUser =
   *   await client.admin.organization.users.retrieve('user_id');
   * ```
   */
  retrieve(userID, options) {
    return this._client.get(path`/organization/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Modifies a user's role in the organization.
   *
   * @example
   * ```ts
   * const organizationUser =
   *   await client.admin.organization.users.update('user_id');
   * ```
   */
  update(userID, body, options) {
    return this._client.post(path`/organization/users/${userID}`, {
      body,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Lists all of the users in the organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const organizationUser of client.admin.organization.users.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/organization/users", ConversationCursorPage, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * Deletes a user from the organization.
   *
   * @example
   * ```ts
   * const user = await client.admin.organization.users.delete(
   *   'user_id',
   * );
   * ```
   */
  delete(userID, options) {
    return this._client.delete(path`/organization/users/${userID}`, {
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
}
Users3.Roles = Roles6;
class Organization extends APIResource {
  constructor() {
    super(...arguments);
    this.auditLogs = new AuditLogs(this._client);
    this.adminAPIKeys = new AdminAPIKeys(this._client);
    this.usage = new Usage$1(this._client);
    this.invites = new Invites(this._client);
    this.users = new Users3(this._client);
    this.groups = new Groups$1(this._client);
    this.roles = new Roles$5(this._client);
    this.certificates = new Certificates$1(this._client);
    this.projects = new Projects(this._client);
  }
}
Organization.AuditLogs = AuditLogs;
Organization.AdminAPIKeys = AdminAPIKeys;
Organization.Usage = Usage$1;
Organization.Invites = Invites;
Organization.Users = Users3;
Organization.Groups = Groups$1;
Organization.Roles = Roles$5;
Organization.Certificates = Certificates$1;
Organization.Projects = Projects;
class Admin extends APIResource {
  constructor() {
    super(...arguments);
    this.organization = new Organization(this._client);
  }
}
Admin.Organization = Organization;
const brand_privateNullableHeaders = /* @__PURE__ */ Symbol("brand.privateNullableHeaders");
function* iterateHeaders(headers) {
  if (!headers)
    return;
  if (brand_privateNullableHeaders in headers) {
    const { values, nulls } = headers;
    yield* values.entries();
    for (const name2 of nulls) {
      yield [name2, null];
    }
    return;
  }
  let shouldClear = false;
  let iter;
  if (headers instanceof Headers) {
    iter = headers.entries();
  } else if (isReadonlyArray(headers)) {
    iter = headers;
  } else {
    shouldClear = true;
    iter = Object.entries(headers ?? {});
  }
  for (let row of iter) {
    const name2 = row[0];
    if (typeof name2 !== "string")
      throw new TypeError("expected header name to be a string");
    const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
    let didClear = false;
    for (const value of values) {
      if (value === void 0)
        continue;
      if (shouldClear && !didClear) {
        didClear = true;
        yield [name2, null];
      }
      yield [name2, value];
    }
  }
}
const buildHeaders = (newHeaders) => {
  const targetHeaders = new Headers();
  const nullHeaders = /* @__PURE__ */ new Set();
  for (const headers of newHeaders) {
    const seenHeaders = /* @__PURE__ */ new Set();
    for (const [name2, value] of iterateHeaders(headers)) {
      const lowerName = name2.toLowerCase();
      if (!seenHeaders.has(lowerName)) {
        targetHeaders.delete(name2);
        seenHeaders.add(lowerName);
      }
      if (value === null) {
        targetHeaders.delete(name2);
        nullHeaders.add(lowerName);
      } else {
        targetHeaders.append(name2, value);
        nullHeaders.delete(lowerName);
      }
    }
  }
  return { [brand_privateNullableHeaders]: true, values: targetHeaders, nulls: nullHeaders };
};
class Speech extends APIResource {
  /**
   * Generates audio from the input text.
   *
   * Returns the audio file content, or a stream of audio events.
   *
   * @example
   * ```ts
   * const speech = await client.audio.speech.create({
   *   input: 'input',
   *   model: 'tts-1',
   *   voice: 'alloy',
   * });
   *
   * const content = await speech.blob();
   * console.log(content);
   * ```
   */
  create(body, options) {
    return this._client.post("/audio/speech", {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "application/octet-stream" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
}
class Transcriptions extends APIResource {
  create(body, options) {
    return this._client.post("/audio/transcriptions", multipartFormRequestOptions({
      body,
      ...options,
      stream: body.stream ?? false,
      __metadata: { model: body.model },
      __security: { bearerAuth: true }
    }, this._client));
  }
}
class Translations extends APIResource {
  create(body, options) {
    return this._client.post("/audio/translations", multipartFormRequestOptions({ body, ...options, __metadata: { model: body.model }, __security: { bearerAuth: true } }, this._client));
  }
}
class Audio extends APIResource {
  constructor() {
    super(...arguments);
    this.transcriptions = new Transcriptions(this._client);
    this.translations = new Translations(this._client);
    this.speech = new Speech(this._client);
  }
}
Audio.Transcriptions = Transcriptions;
Audio.Translations = Translations;
Audio.Speech = Speech;
class Batches extends APIResource {
  /**
   * Creates and executes a batch from an uploaded file of requests
   */
  create(body, options) {
    return this._client.post("/batches", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Retrieves a batch.
   */
  retrieve(batchID, options) {
    return this._client.get(path`/batches/${batchID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * List your organization's batches.
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/batches", CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancels an in-progress batch. The batch will be in status `cancelling` for up to
   * 10 minutes, before changing to `cancelled`, where it will have partial results
   * (if any) available in the output file.
   */
  cancel(batchID, options) {
    return this._client.post(path`/batches/${batchID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
class Assistants extends APIResource {
  /**
   * Create an assistant with a model and instructions.
   *
   * @deprecated
   */
  create(body, options) {
    return this._client.post("/assistants", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves an assistant.
   *
   * @deprecated
   */
  retrieve(assistantID, options) {
    return this._client.get(path`/assistants/${assistantID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies an assistant.
   *
   * @deprecated
   */
  update(assistantID, body, options) {
    return this._client.post(path`/assistants/${assistantID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of assistants.
   *
   * @deprecated
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/assistants", CursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete an assistant.
   *
   * @deprecated
   */
  delete(assistantID, options) {
    return this._client.delete(path`/assistants/${assistantID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
let Sessions$1 = class Sessions extends APIResource {
  /**
   * Create an ephemeral API token for use in client-side applications with the
   * Realtime API. Can be configured with the same session parameters as the
   * `session.update` client event.
   *
   * It responds with a session object, plus a `client_secret` key which contains a
   * usable ephemeral API token that can be used to authenticate browser clients for
   * the Realtime API.
   *
   * @example
   * ```ts
   * const session =
   *   await client.beta.realtime.sessions.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};
class TranscriptionSessions extends APIResource {
  /**
   * Create an ephemeral API token for use in client-side applications with the
   * Realtime API specifically for realtime transcriptions. Can be configured with
   * the same session parameters as the `transcription_session.update` client event.
   *
   * It responds with a session object, plus a `client_secret` key which contains a
   * usable ephemeral API token that can be used to authenticate browser clients for
   * the Realtime API.
   *
   * @example
   * ```ts
   * const transcriptionSession =
   *   await client.beta.realtime.transcriptionSessions.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/transcription_sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
let Realtime$1 = class Realtime extends APIResource {
  constructor() {
    super(...arguments);
    this.sessions = new Sessions$1(this._client);
    this.transcriptionSessions = new TranscriptionSessions(this._client);
  }
};
Realtime$1.Sessions = Sessions$1;
Realtime$1.TranscriptionSessions = TranscriptionSessions;
class Sessions2 extends APIResource {
  /**
   * Create a ChatKit session.
   *
   * @example
   * ```ts
   * const chatSession =
   *   await client.beta.chatkit.sessions.create({
   *     user: 'x',
   *     workflow: { id: 'id' },
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/chatkit/sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancel an active ChatKit session and return its most recent metadata.
   *
   * Cancelling prevents new requests from using the issued client secret.
   *
   * @example
   * ```ts
   * const chatSession =
   *   await client.beta.chatkit.sessions.cancel('cksess_123');
   * ```
   */
  cancel(sessionID, options) {
    return this._client.post(path`/chatkit/sessions/${sessionID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
let Threads$1 = class Threads extends APIResource {
  /**
   * Retrieve a ChatKit thread by its identifier.
   *
   * @example
   * ```ts
   * const chatkitThread =
   *   await client.beta.chatkit.threads.retrieve('cthr_123');
   * ```
   */
  retrieve(threadID, options) {
    return this._client.get(path`/chatkit/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * List ChatKit threads with optional pagination and user filters.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatkitThread of client.beta.chatkit.threads.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/chatkit/threads", ConversationCursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a ChatKit thread along with its items and stored attachments.
   *
   * @example
   * ```ts
   * const thread = await client.beta.chatkit.threads.delete(
   *   'cthr_123',
   * );
   * ```
   */
  delete(threadID, options) {
    return this._client.delete(path`/chatkit/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * List items that belong to a ChatKit thread.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const thread of client.beta.chatkit.threads.listItems(
   *   'cthr_123',
   * )) {
   *   // ...
   * }
   * ```
   */
  listItems(threadID, query2 = {}, options) {
    return this._client.getAPIList(path`/chatkit/threads/${threadID}/items`, ConversationCursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};
class ChatKit extends APIResource {
  constructor() {
    super(...arguments);
    this.sessions = new Sessions2(this._client);
    this.threads = new Threads$1(this._client);
  }
}
ChatKit.Sessions = Sessions2;
ChatKit.Threads = Threads$1;
class Messages2 extends APIResource {
  /**
   * Create a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  create(threadID, body, options) {
    return this._client.post(path`/threads/${threadID}/messages`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieve a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(messageID, params, options) {
    const { thread_id } = params;
    return this._client.get(path`/threads/${thread_id}/messages/${messageID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(messageID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/messages/${messageID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of messages for a given thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(threadID, query2 = {}, options) {
    return this._client.getAPIList(path`/threads/${threadID}/messages`, CursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Deletes a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  delete(messageID, params, options) {
    const { thread_id } = params;
    return this._client.delete(path`/threads/${thread_id}/messages/${messageID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
class Steps extends APIResource {
  /**
   * Retrieves a run step.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(stepID, params, options) {
    const { thread_id, run_id, ...query2 } = params;
    return this._client.get(path`/threads/${thread_id}/runs/${run_id}/steps/${stepID}`, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of run steps belonging to a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(runID, params, options) {
    const { thread_id, ...query2 } = params;
    return this._client.getAPIList(path`/threads/${thread_id}/runs/${runID}/steps`, CursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
const toFloat32Array = (base64Str) => {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64Str, "base64");
    return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / Float32Array.BYTES_PER_ELEMENT));
  } else {
    const binaryStr = atob(base64Str);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return Array.from(new Float32Array(bytes.buffer));
  }
};
const readEnv = (env) => {
  if (typeof globalThis.process !== "undefined") {
    return globalThis.process.env?.[env]?.trim() || void 0;
  }
  if (typeof globalThis.Deno !== "undefined") {
    return globalThis.Deno.env?.get?.(env)?.trim() || void 0;
  }
  return void 0;
};
var _AssistantStream_instances, _a$1, _AssistantStream_events, _AssistantStream_runStepSnapshots, _AssistantStream_messageSnapshots, _AssistantStream_messageSnapshot, _AssistantStream_finalRun, _AssistantStream_currentContentIndex, _AssistantStream_currentContent, _AssistantStream_currentToolCallIndex, _AssistantStream_currentToolCall, _AssistantStream_currentEvent, _AssistantStream_currentRunSnapshot, _AssistantStream_currentRunStepSnapshot, _AssistantStream_addEvent, _AssistantStream_endRequest, _AssistantStream_handleMessage, _AssistantStream_handleRunStep, _AssistantStream_handleEvent, _AssistantStream_accumulateRunStep, _AssistantStream_accumulateMessage, _AssistantStream_accumulateContent, _AssistantStream_handleRun;
class AssistantStream extends EventStream {
  constructor() {
    super(...arguments);
    _AssistantStream_instances.add(this);
    _AssistantStream_events.set(this, []);
    _AssistantStream_runStepSnapshots.set(this, {});
    _AssistantStream_messageSnapshots.set(this, {});
    _AssistantStream_messageSnapshot.set(this, void 0);
    _AssistantStream_finalRun.set(this, void 0);
    _AssistantStream_currentContentIndex.set(this, void 0);
    _AssistantStream_currentContent.set(this, void 0);
    _AssistantStream_currentToolCallIndex.set(this, void 0);
    _AssistantStream_currentToolCall.set(this, void 0);
    _AssistantStream_currentEvent.set(this, void 0);
    _AssistantStream_currentRunSnapshot.set(this, void 0);
    _AssistantStream_currentRunStepSnapshot.set(this, void 0);
  }
  [(_AssistantStream_events = /* @__PURE__ */ new WeakMap(), _AssistantStream_runStepSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_finalRun = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContentIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCallIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCall = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentEvent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunStepSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_instances = /* @__PURE__ */ new WeakSet(), Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("event", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  static fromReadableStream(stream) {
    const runner = new _a$1();
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    this._connected();
    const stream = Stream.fromReadableStream(readableStream, this.controller);
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
  static createToolAssistantStream(runId, runs, params, options) {
    const runner = new _a$1();
    runner._run(() => runner._runToolAssistantStream(runId, runs, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  async _createToolAssistantStream(run, runId, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    const body = { ...params, stream: true };
    const stream = await run.submitToolOutputs(runId, body, {
      ...options,
      signal: this.controller.signal
    });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  static createThreadAssistantStream(params, thread, options) {
    const runner = new _a$1();
    runner._run(() => runner._threadAssistantStream(params, thread, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  static createAssistantStream(threadId, runs, params, options) {
    const runner = new _a$1();
    runner._run(() => runner._runAssistantStream(threadId, runs, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  currentEvent() {
    return __classPrivateFieldGet(this, _AssistantStream_currentEvent, "f");
  }
  currentRun() {
    return __classPrivateFieldGet(this, _AssistantStream_currentRunSnapshot, "f");
  }
  currentMessageSnapshot() {
    return __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f");
  }
  currentRunStepSnapshot() {
    return __classPrivateFieldGet(this, _AssistantStream_currentRunStepSnapshot, "f");
  }
  async finalRunSteps() {
    await this.done();
    return Object.values(__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f"));
  }
  async finalMessages() {
    await this.done();
    return Object.values(__classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f"));
  }
  async finalRun() {
    await this.done();
    if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
      throw Error("Final run was not received.");
    return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
  }
  async _createThreadAssistantStream(thread, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    const body = { ...params, stream: true };
    const stream = await thread.createAndRun(body, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  async _createAssistantStream(run, threadId, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    const body = { ...params, stream: true };
    const stream = await run.create(threadId, body, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  static accumulateDelta(acc, delta) {
    for (const [key, deltaValue] of Object.entries(delta)) {
      if (!acc.hasOwnProperty(key)) {
        acc[key] = deltaValue;
        continue;
      }
      let accValue = acc[key];
      if (accValue === null || accValue === void 0) {
        acc[key] = deltaValue;
        continue;
      }
      if (key === "index" || key === "type") {
        acc[key] = deltaValue;
        continue;
      }
      if (typeof accValue === "string" && typeof deltaValue === "string") {
        accValue += deltaValue;
      } else if (typeof accValue === "number" && typeof deltaValue === "number") {
        accValue += deltaValue;
      } else if (isObj(accValue) && isObj(deltaValue)) {
        accValue = this.accumulateDelta(accValue, deltaValue);
      } else if (Array.isArray(accValue) && Array.isArray(deltaValue)) {
        if (accValue.every((x) => typeof x === "string" || typeof x === "number")) {
          accValue.push(...deltaValue);
          continue;
        }
        for (const deltaEntry of deltaValue) {
          if (!isObj(deltaEntry)) {
            throw new Error(`Expected array delta entry to be an object but got: ${deltaEntry}`);
          }
          const index = deltaEntry["index"];
          if (index == null) {
            console.error(deltaEntry);
            throw new Error("Expected array delta entry to have an `index` property");
          }
          if (typeof index !== "number") {
            throw new Error(`Expected array delta entry \`index\` property to be a number but got ${index}`);
          }
          const accEntry = accValue[index];
          if (accEntry == null) {
            accValue.push(deltaEntry);
          } else {
            accValue[index] = this.accumulateDelta(accEntry, deltaEntry);
          }
        }
        continue;
      } else {
        throw Error(`Unhandled record type: ${key}, deltaValue: ${deltaValue}, accValue: ${accValue}`);
      }
      acc[key] = accValue;
    }
    return acc;
  }
  _addRun(run) {
    return run;
  }
  async _threadAssistantStream(params, thread, options) {
    return await this._createThreadAssistantStream(thread, params, options);
  }
  async _runAssistantStream(threadId, runs, params, options) {
    return await this._createAssistantStream(runs, threadId, params, options);
  }
  async _runToolAssistantStream(runId, runs, params, options) {
    return await this._createToolAssistantStream(runs, runId, params, options);
  }
}
_a$1 = AssistantStream, _AssistantStream_addEvent = function _AssistantStream_addEvent2(event) {
  if (this.ended)
    return;
  __classPrivateFieldSet(this, _AssistantStream_currentEvent, event);
  __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleEvent).call(this, event);
  switch (event.event) {
    case "thread.created":
      break;
    case "thread.run.created":
    case "thread.run.queued":
    case "thread.run.in_progress":
    case "thread.run.requires_action":
    case "thread.run.completed":
    case "thread.run.incomplete":
    case "thread.run.failed":
    case "thread.run.cancelling":
    case "thread.run.cancelled":
    case "thread.run.expired":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRun).call(this, event);
      break;
    case "thread.run.step.created":
    case "thread.run.step.in_progress":
    case "thread.run.step.delta":
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRunStep).call(this, event);
      break;
    case "thread.message.created":
    case "thread.message.in_progress":
    case "thread.message.delta":
    case "thread.message.completed":
    case "thread.message.incomplete":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleMessage).call(this, event);
      break;
    case "error":
      throw new Error("Encountered an error event in event processing - errors should be processed earlier");
  }
}, _AssistantStream_endRequest = function _AssistantStream_endRequest2() {
  if (this.ended) {
    throw new OpenAIError(`stream has ended, this shouldn't happen`);
  }
  if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
    throw Error("Final run has not been received");
  return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
}, _AssistantStream_handleMessage = function _AssistantStream_handleMessage2(event) {
  const [accumulatedMessage, newContent] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateMessage).call(this, event, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
  __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, accumulatedMessage);
  __classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f")[accumulatedMessage.id] = accumulatedMessage;
  for (const content of newContent) {
    const snapshotContent = accumulatedMessage.content[content.index];
    if (snapshotContent?.type == "text") {
      this._emit("textCreated", snapshotContent.text);
    }
  }
  switch (event.event) {
    case "thread.message.created":
      this._emit("messageCreated", event.data);
      break;
    case "thread.message.in_progress":
      break;
    case "thread.message.delta":
      this._emit("messageDelta", event.data.delta, accumulatedMessage);
      if (event.data.delta.content) {
        for (const content of event.data.delta.content) {
          if (content.type == "text" && content.text) {
            let textDelta = content.text;
            let snapshot = accumulatedMessage.content[content.index];
            if (snapshot && snapshot.type == "text") {
              this._emit("textDelta", textDelta, snapshot.text);
            } else {
              throw Error("The snapshot associated with this text delta is not text or missing");
            }
          }
          if (content.index != __classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")) {
            if (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f")) {
              switch (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f").type) {
                case "text":
                  this._emit("textDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                  break;
                case "image_file":
                  this._emit("imageFileDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                  break;
              }
            }
            __classPrivateFieldSet(this, _AssistantStream_currentContentIndex, content.index);
          }
          __classPrivateFieldSet(this, _AssistantStream_currentContent, accumulatedMessage.content[content.index]);
        }
      }
      break;
    case "thread.message.completed":
    case "thread.message.incomplete":
      if (__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f") !== void 0) {
        const currentContent = event.data.content[__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")];
        if (currentContent) {
          switch (currentContent.type) {
            case "image_file":
              this._emit("imageFileDone", currentContent.image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
              break;
            case "text":
              this._emit("textDone", currentContent.text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
              break;
          }
        }
      }
      if (__classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f")) {
        this._emit("messageDone", event.data);
      }
      __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, void 0);
  }
}, _AssistantStream_handleRunStep = function _AssistantStream_handleRunStep2(event) {
  const accumulatedRunStep = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateRunStep).call(this, event);
  __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, accumulatedRunStep);
  switch (event.event) {
    case "thread.run.step.created":
      this._emit("runStepCreated", event.data);
      break;
    case "thread.run.step.delta":
      const delta = event.data.delta;
      if (delta.step_details && delta.step_details.type == "tool_calls" && delta.step_details.tool_calls && accumulatedRunStep.step_details.type == "tool_calls") {
        for (const toolCall of delta.step_details.tool_calls) {
          if (toolCall.index == __classPrivateFieldGet(this, _AssistantStream_currentToolCallIndex, "f")) {
            this._emit("toolCallDelta", toolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index]);
          } else {
            if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
              this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
            }
            __classPrivateFieldSet(this, _AssistantStream_currentToolCallIndex, toolCall.index);
            __classPrivateFieldSet(this, _AssistantStream_currentToolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index]);
            if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"))
              this._emit("toolCallCreated", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
          }
        }
      }
      this._emit("runStepDelta", event.data.delta, accumulatedRunStep);
      break;
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
      __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, void 0);
      const details = event.data.step_details;
      if (details.type == "tool_calls") {
        if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
          this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
          __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0);
        }
      }
      this._emit("runStepDone", event.data, accumulatedRunStep);
      break;
  }
}, _AssistantStream_handleEvent = function _AssistantStream_handleEvent2(event) {
  __classPrivateFieldGet(this, _AssistantStream_events, "f").push(event);
  this._emit("event", event);
}, _AssistantStream_accumulateRunStep = function _AssistantStream_accumulateRunStep2(event) {
  switch (event.event) {
    case "thread.run.step.created":
      __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
      return event.data;
    case "thread.run.step.delta":
      let snapshot = __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
      if (!snapshot) {
        throw Error("Received a RunStepDelta before creation of a snapshot");
      }
      let data2 = event.data;
      if (data2.delta) {
        const accumulated = _a$1.accumulateDelta(snapshot, data2.delta);
        __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = accumulated;
      }
      return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
    case "thread.run.step.in_progress":
      __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
      break;
  }
  if (__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id])
    return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
  throw new Error("No snapshot available");
}, _AssistantStream_accumulateMessage = function _AssistantStream_accumulateMessage2(event, snapshot) {
  let newContent = [];
  switch (event.event) {
    case "thread.message.created":
      return [event.data, newContent];
    case "thread.message.delta":
      if (!snapshot) {
        throw Error("Received a delta with no existing snapshot (there should be one from message creation)");
      }
      let data2 = event.data;
      if (data2.delta.content) {
        for (const contentElement of data2.delta.content) {
          if (contentElement.index in snapshot.content) {
            let currentContent = snapshot.content[contentElement.index];
            snapshot.content[contentElement.index] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateContent).call(this, contentElement, currentContent);
          } else {
            snapshot.content[contentElement.index] = contentElement;
            newContent.push(contentElement);
          }
        }
      }
      return [snapshot, newContent];
    case "thread.message.in_progress":
    case "thread.message.completed":
    case "thread.message.incomplete":
      if (snapshot) {
        return [snapshot, newContent];
      } else {
        throw Error("Received thread message event with no existing snapshot");
      }
  }
  throw Error("Tried to accumulate a non-message event");
}, _AssistantStream_accumulateContent = function _AssistantStream_accumulateContent2(contentElement, currentContent) {
  return _a$1.accumulateDelta(currentContent, contentElement);
}, _AssistantStream_handleRun = function _AssistantStream_handleRun2(event) {
  __classPrivateFieldSet(this, _AssistantStream_currentRunSnapshot, event.data);
  switch (event.event) {
    case "thread.run.created":
      break;
    case "thread.run.queued":
      break;
    case "thread.run.in_progress":
      break;
    case "thread.run.requires_action":
    case "thread.run.cancelled":
    case "thread.run.failed":
    case "thread.run.completed":
    case "thread.run.expired":
    case "thread.run.incomplete":
      __classPrivateFieldSet(this, _AssistantStream_finalRun, event.data);
      if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
        this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
        __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0);
      }
      break;
  }
};
let Runs$1 = class Runs extends APIResource {
  constructor() {
    super(...arguments);
    this.steps = new Steps(this._client);
  }
  create(threadID, params, options) {
    const { include, ...body } = params;
    return this._client.post(path`/threads/${threadID}/runs`, {
      query: { include },
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: params.stream ?? false,
      __synthesizeEventData: true,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(runID, params, options) {
    const { thread_id } = params;
    return this._client.get(path`/threads/${thread_id}/runs/${runID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(runID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of runs belonging to a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(threadID, query2 = {}, options) {
    return this._client.getAPIList(path`/threads/${threadID}/runs`, CursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancels a run that is `in_progress`.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  cancel(runID, params, options) {
    const { thread_id } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * A helper to create a run an poll for a terminal state. More information on Run
   * lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async createAndPoll(threadId, body, options) {
    const run = await this.create(threadId, body, options);
    return await this.poll(run.id, { thread_id: threadId }, options);
  }
  /**
   * Create a Run stream
   *
   * @deprecated use `stream` instead
   */
  createAndStream(threadId, body, options) {
    return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
  }
  /**
   * A helper to poll a run status until it reaches a terminal state. More
   * information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async poll(runId, params, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const { data: run, response } = await this.retrieve(runId, params, {
        ...options,
        headers: { ...options?.headers, ...headers }
      }).withResponse();
      switch (run.status) {
        case "queued":
        case "in_progress":
        case "cancelling":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        case "requires_action":
        case "incomplete":
        case "cancelled":
        case "completed":
        case "failed":
        case "expired":
          return run;
      }
    }
  }
  /**
   * Create a Run stream
   */
  stream(threadId, body, options) {
    return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
  }
  submitToolOutputs(runID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}/submit_tool_outputs`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: params.stream ?? false,
      __synthesizeEventData: true,
      __security: { bearerAuth: true }
    });
  }
  /**
   * A helper to submit a tool output to a run and poll for a terminal run state.
   * More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async submitToolOutputsAndPoll(runId, params, options) {
    const run = await this.submitToolOutputs(runId, params, options);
    return await this.poll(run.id, params, options);
  }
  /**
   * Submit the tool outputs from a previous run and stream the run to a terminal
   * state. More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  submitToolOutputsStream(runId, params, options) {
    return AssistantStream.createToolAssistantStream(runId, this._client.beta.threads.runs, params, options);
  }
};
Runs$1.Steps = Steps;
class Threads2 extends APIResource {
  constructor() {
    super(...arguments);
    this.runs = new Runs$1(this._client);
    this.messages = new Messages2(this._client);
  }
  /**
   * Create a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  create(body = {}, options) {
    return this._client.post("/threads", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(threadID, options) {
    return this._client.get(path`/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(threadID, body, options) {
    return this._client.post(path`/threads/${threadID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  delete(threadID, options) {
    return this._client.delete(path`/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  createAndRun(body, options) {
    return this._client.post("/threads/runs", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: body.stream ?? false,
      __synthesizeEventData: true,
      __security: { bearerAuth: true }
    });
  }
  /**
   * A helper to create a thread, start a run and then poll for a terminal state.
   * More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async createAndRunPoll(body, options) {
    const run = await this.createAndRun(body, options);
    return await this.runs.poll(run.id, { thread_id: run.thread_id }, options);
  }
  /**
   * Create a thread and stream the run back
   */
  createAndRunStream(body, options) {
    return AssistantStream.createThreadAssistantStream(body, this._client.beta.threads, options);
  }
}
Threads2.Runs = Runs$1;
Threads2.Messages = Messages2;
class Beta extends APIResource {
  constructor() {
    super(...arguments);
    this.realtime = new Realtime$1(this._client);
    this.chatkit = new ChatKit(this._client);
    this.assistants = new Assistants(this._client);
    this.threads = new Threads2(this._client);
  }
}
Beta.Realtime = Realtime$1;
Beta.ChatKit = ChatKit;
Beta.Assistants = Assistants;
Beta.Threads = Threads2;
class Completions2 extends APIResource {
  create(body, options) {
    return this._client.post("/completions", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    });
  }
}
let Content$2 = class Content extends APIResource {
  /**
   * Retrieve Container File Content
   */
  retrieve(fileID, params, options) {
    const { container_id } = params;
    return this._client.get(path`/containers/${container_id}/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
};
let Files$2 = class Files extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content$2(this._client);
  }
  /**
   * Create a Container File
   *
   * You can send either a multipart/form-data request with the raw file content, or
   * a JSON request with a file ID.
   */
  create(containerID, body, options) {
    return this._client.post(path`/containers/${containerID}/files`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Retrieve Container File
   */
  retrieve(fileID, params, options) {
    const { container_id } = params;
    return this._client.get(path`/containers/${container_id}/files/${fileID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List Container files
   */
  list(containerID, query2 = {}, options) {
    return this._client.getAPIList(path`/containers/${containerID}/files`, CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete Container File
   */
  delete(fileID, params, options) {
    const { container_id } = params;
    return this._client.delete(path`/containers/${container_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
};
Files$2.Content = Content$2;
class Containers extends APIResource {
  constructor() {
    super(...arguments);
    this.files = new Files$2(this._client);
  }
  /**
   * Create Container
   */
  create(body, options) {
    return this._client.post("/containers", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Retrieve Container
   */
  retrieve(containerID, options) {
    return this._client.get(path`/containers/${containerID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List Containers
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/containers", CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete Container
   */
  delete(containerID, options) {
    return this._client.delete(path`/containers/${containerID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
Containers.Files = Files$2;
class Items extends APIResource {
  /**
   * Create items in a conversation with the given ID.
   */
  create(conversationID, params, options) {
    const { include, ...body } = params;
    return this._client.post(path`/conversations/${conversationID}/items`, {
      query: { include },
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a single item from a conversation with the given IDs.
   */
  retrieve(itemID, params, options) {
    const { conversation_id, ...query2 } = params;
    return this._client.get(path`/conversations/${conversation_id}/items/${itemID}`, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List all items for a conversation with the given ID.
   */
  list(conversationID, query2 = {}, options) {
    return this._client.getAPIList(path`/conversations/${conversationID}/items`, ConversationCursorPage, { query: query2, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Delete an item from a conversation with the given IDs.
   */
  delete(itemID, params, options) {
    const { conversation_id } = params;
    return this._client.delete(path`/conversations/${conversation_id}/items/${itemID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
class Conversations extends APIResource {
  constructor() {
    super(...arguments);
    this.items = new Items(this._client);
  }
  /**
   * Create a conversation.
   */
  create(body = {}, options) {
    return this._client.post("/conversations", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Get a conversation
   */
  retrieve(conversationID, options) {
    return this._client.get(path`/conversations/${conversationID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Update a conversation
   */
  update(conversationID, body, options) {
    return this._client.post(path`/conversations/${conversationID}`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a conversation. Items in the conversation will not be deleted.
   */
  delete(conversationID, options) {
    return this._client.delete(path`/conversations/${conversationID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
Conversations.Items = Items;
class Embeddings extends APIResource {
  /**
   * Creates an embedding vector representing the input text.
   *
   * @example
   * ```ts
   * const createEmbeddingResponse =
   *   await client.embeddings.create({
   *     input: 'The quick brown fox jumped over the lazy dog',
   *     model: 'text-embedding-3-small',
   *   });
   * ```
   */
  create(body, options) {
    const hasUserProvidedEncodingFormat = !!body.encoding_format;
    let encoding_format = hasUserProvidedEncodingFormat ? body.encoding_format : "base64";
    if (hasUserProvidedEncodingFormat) {
      loggerFor(this._client).debug("embeddings/user defined encoding_format:", body.encoding_format);
    }
    const response = this._client.post("/embeddings", {
      body: {
        ...body,
        encoding_format
      },
      ...options,
      __security: { bearerAuth: true }
    });
    if (hasUserProvidedEncodingFormat) {
      return response;
    }
    loggerFor(this._client).debug("embeddings/decoding base64 embeddings from base64");
    return response._thenUnwrap((response2) => {
      if (response2 && response2.data) {
        response2.data.forEach((embeddingBase64Obj) => {
          const embeddingBase64Str = embeddingBase64Obj.embedding;
          embeddingBase64Obj.embedding = toFloat32Array(embeddingBase64Str);
        });
      }
      return response2;
    });
  }
}
class OutputItems extends APIResource {
  /**
   * Get an evaluation run output item by ID.
   */
  retrieve(outputItemID, params, options) {
    const { eval_id, run_id } = params;
    return this._client.get(path`/evals/${eval_id}/runs/${run_id}/output_items/${outputItemID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a list of output items for an evaluation run.
   */
  list(runID, params, options) {
    const { eval_id, ...query2 } = params;
    return this._client.getAPIList(path`/evals/${eval_id}/runs/${runID}/output_items`, CursorPage, { query: query2, ...options, __security: { bearerAuth: true } });
  }
}
class Runs2 extends APIResource {
  constructor() {
    super(...arguments);
    this.outputItems = new OutputItems(this._client);
  }
  /**
   * Kicks off a new run for a given evaluation, specifying the data source, and what
   * model configuration to use to test. The datasource will be validated against the
   * schema specified in the config of the evaluation.
   */
  create(evalID, body, options) {
    return this._client.post(path`/evals/${evalID}/runs`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get an evaluation run by ID.
   */
  retrieve(runID, params, options) {
    const { eval_id } = params;
    return this._client.get(path`/evals/${eval_id}/runs/${runID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get a list of runs for an evaluation.
   */
  list(evalID, query2 = {}, options) {
    return this._client.getAPIList(path`/evals/${evalID}/runs`, CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete an eval run.
   */
  delete(runID, params, options) {
    const { eval_id } = params;
    return this._client.delete(path`/evals/${eval_id}/runs/${runID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancel an ongoing evaluation run.
   */
  cancel(runID, params, options) {
    const { eval_id } = params;
    return this._client.post(path`/evals/${eval_id}/runs/${runID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
Runs2.OutputItems = OutputItems;
class Evals extends APIResource {
  constructor() {
    super(...arguments);
    this.runs = new Runs2(this._client);
  }
  /**
   * Create the structure of an evaluation that can be used to test a model's
   * performance. An evaluation is a set of testing criteria and the config for a
   * data source, which dictates the schema of the data used in the evaluation. After
   * creating an evaluation, you can run it on different models and model parameters.
   * We support several types of graders and datasources. For more information, see
   * the [Evals guide](https://platform.openai.com/docs/guides/evals).
   */
  create(body, options) {
    return this._client.post("/evals", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Get an evaluation by ID.
   */
  retrieve(evalID, options) {
    return this._client.get(path`/evals/${evalID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Update certain properties of an evaluation.
   */
  update(evalID, body, options) {
    return this._client.post(path`/evals/${evalID}`, { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * List evaluations for a project.
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/evals", CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete an evaluation.
   */
  delete(evalID, options) {
    return this._client.delete(path`/evals/${evalID}`, { ...options, __security: { bearerAuth: true } });
  }
}
Evals.Runs = Runs2;
let Files$1 = class Files2 extends APIResource {
  /**
   * Upload a file that can be used across various endpoints. Individual files can be
   * up to 512 MB, and each project can store up to 2.5 TB of files in total. There
   * is no organization-wide storage limit. Uploads to this endpoint are rate-limited
   * to 1,000 requests per minute per authenticated user.
   *
   * - The Assistants API supports files up to 2 million tokens and of specific file
   *   types. See the
   *   [Assistants Tools guide](https://platform.openai.com/docs/assistants/tools)
   *   for details.
   * - The Fine-tuning API only supports `.jsonl` files. The input also has certain
   *   required formats for fine-tuning
   *   [chat](https://platform.openai.com/docs/api-reference/fine-tuning/chat-input)
   *   or
   *   [completions](https://platform.openai.com/docs/api-reference/fine-tuning/completions-input)
   *   models.
   * - The Batch API only supports `.jsonl` files up to 200 MB in size. The input
   *   also has a specific required
   *   [format](https://platform.openai.com/docs/api-reference/batch/request-input).
   * - For Retrieval or `file_search` ingestion, upload files here first. If you need
   *   to attach multiple uploaded files to the same vector store, use
   *   [`/vector_stores/{vector_store_id}/file_batches`](https://platform.openai.com/docs/api-reference/vector-stores-file-batches/createBatch)
   *   instead of attaching them one by one. Vector store attachment has separate
   *   limits from file upload, including 2,000 attached files per minute per
   *   organization.
   *
   * Please [contact us](https://help.openai.com/) if you need to increase these
   * storage limits.
   */
  create(body, options) {
    return this._client.post("/files", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Returns information about a specific file.
   */
  retrieve(fileID, options) {
    return this._client.get(path`/files/${fileID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Returns a list of files.
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/files", CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a file and remove it from all vector stores.
   */
  delete(fileID, options) {
    return this._client.delete(path`/files/${fileID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Returns the contents of the specified file.
   */
  content(fileID, options) {
    return this._client.get(path`/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
  /**
   * Waits for the given file to be processed, default timeout is 30 mins.
   */
  async waitForProcessing(id, { pollInterval = 5e3, maxWait = 30 * 60 * 1e3 } = {}) {
    const TERMINAL_STATES = /* @__PURE__ */ new Set(["processed", "error", "deleted"]);
    const start = Date.now();
    let file = await this.retrieve(id);
    while (!file.status || !TERMINAL_STATES.has(file.status)) {
      await sleep(pollInterval);
      file = await this.retrieve(id);
      if (Date.now() - start > maxWait) {
        throw new APIConnectionTimeoutError({
          message: `Giving up on waiting for file ${id} to finish processing after ${maxWait} milliseconds.`
        });
      }
    }
    return file;
  }
};
class Methods extends APIResource {
}
let Graders$1 = class Graders extends APIResource {
  /**
   * Run a grader.
   *
   * @example
   * ```ts
   * const response = await client.fineTuning.alpha.graders.run({
   *   grader: {
   *     input: 'input',
   *     name: 'name',
   *     operation: 'eq',
   *     reference: 'reference',
   *     type: 'string_check',
   *   },
   *   model_sample: 'model_sample',
   * });
   * ```
   */
  run(body, options) {
    return this._client.post("/fine_tuning/alpha/graders/run", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Validate a grader.
   *
   * @example
   * ```ts
   * const response =
   *   await client.fineTuning.alpha.graders.validate({
   *     grader: {
   *       input: 'input',
   *       name: 'name',
   *       operation: 'eq',
   *       reference: 'reference',
   *       type: 'string_check',
   *     },
   *   });
   * ```
   */
  validate(body, options) {
    return this._client.post("/fine_tuning/alpha/graders/validate", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
};
class Alpha extends APIResource {
  constructor() {
    super(...arguments);
    this.graders = new Graders$1(this._client);
  }
}
Alpha.Graders = Graders$1;
class Permissions extends APIResource {
  /**
   * **NOTE:** Calling this endpoint requires an [admin API key](../admin-api-keys).
   *
   * This enables organization owners to share fine-tuned models with other projects
   * in their organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const permissionCreateResponse of client.fineTuning.checkpoints.permissions.create(
   *   'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
   *   { project_ids: ['string'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  create(fineTunedModelCheckpoint, body, options) {
    return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to view all permissions for a
   * fine-tuned model checkpoint.
   *
   * @deprecated Retrieve is deprecated. Please swap to the paginated list method instead.
   */
  retrieve(fineTunedModelCheckpoint, query2 = {}, options) {
    return this._client.get(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, {
      query: query2,
      ...options,
      __security: { adminAPIKeyAuth: true }
    });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to view all permissions for a
   * fine-tuned model checkpoint.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const permissionListResponse of client.fineTuning.checkpoints.permissions.list(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(fineTunedModelCheckpoint, query2 = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, ConversationCursorPage, { query: query2, ...options, __security: { adminAPIKeyAuth: true } });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to delete a permission for a
   * fine-tuned model checkpoint.
   *
   * @example
   * ```ts
   * const permission =
   *   await client.fineTuning.checkpoints.permissions.delete(
   *     'cp_zc4Q7MP6XxulcVzj4MZdwsAB',
   *     {
   *       fine_tuned_model_checkpoint:
   *         'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
   *     },
   *   );
   * ```
   */
  delete(permissionID, params, options) {
    const { fine_tuned_model_checkpoint } = params;
    return this._client.delete(path`/fine_tuning/checkpoints/${fine_tuned_model_checkpoint}/permissions/${permissionID}`, { ...options, __security: { adminAPIKeyAuth: true } });
  }
}
let Checkpoints$1 = class Checkpoints extends APIResource {
  constructor() {
    super(...arguments);
    this.permissions = new Permissions(this._client);
  }
};
Checkpoints$1.Permissions = Permissions;
class Checkpoints2 extends APIResource {
  /**
   * List checkpoints for a fine-tuning job.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJobCheckpoint of client.fineTuning.jobs.checkpoints.list(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(fineTuningJobID, query2 = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/checkpoints`, CursorPage, { query: query2, ...options, __security: { bearerAuth: true } });
  }
}
class Jobs extends APIResource {
  constructor() {
    super(...arguments);
    this.checkpoints = new Checkpoints2(this._client);
  }
  /**
   * Creates a fine-tuning job which begins the process of creating a new model from
   * a given dataset.
   *
   * Response includes details of the enqueued job including job status and the name
   * of the fine-tuned models once complete.
   *
   * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.create({
   *   model: 'gpt-4o-mini',
   *   training_file: 'file-abc123',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/fine_tuning/jobs", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Get info about a fine-tuning job.
   *
   * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.retrieve(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  retrieve(fineTuningJobID, options) {
    return this._client.get(path`/fine_tuning/jobs/${fineTuningJobID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List your organization's fine-tuning jobs
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJob of client.fineTuning.jobs.list()) {
   *   // ...
   * }
   * ```
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/fine_tuning/jobs", CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Immediately cancel a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.cancel(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  cancel(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Get status updates for a fine-tuning job.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJobEvent of client.fineTuning.jobs.listEvents(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  listEvents(fineTuningJobID, query2 = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/events`, CursorPage, { query: query2, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Pause a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.pause(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  pause(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/pause`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Resume a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.resume(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  resume(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/resume`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
Jobs.Checkpoints = Checkpoints2;
class FineTuning extends APIResource {
  constructor() {
    super(...arguments);
    this.methods = new Methods(this._client);
    this.jobs = new Jobs(this._client);
    this.checkpoints = new Checkpoints$1(this._client);
    this.alpha = new Alpha(this._client);
  }
}
FineTuning.Methods = Methods;
FineTuning.Jobs = Jobs;
FineTuning.Checkpoints = Checkpoints$1;
FineTuning.Alpha = Alpha;
class GraderModels extends APIResource {
}
class Graders2 extends APIResource {
  constructor() {
    super(...arguments);
    this.graderModels = new GraderModels(this._client);
  }
}
Graders2.GraderModels = GraderModels;
class Images extends APIResource {
  /**
   * Creates a variation of a given image. This endpoint only supports `dall-e-2`.
   *
   * @example
   * ```ts
   * const imagesResponse = await client.images.createVariation({
   *   image: fs.createReadStream('otter.png'),
   * });
   * ```
   */
  createVariation(body, options) {
    return this._client.post("/images/variations", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  edit(body, options) {
    return this._client.post("/images/edits", multipartFormRequestOptions({ body, ...options, stream: body.stream ?? false, __security: { bearerAuth: true } }, this._client));
  }
  generate(body, options) {
    return this._client.post("/images/generations", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    });
  }
}
class Models extends APIResource {
  /**
   * Retrieves a model instance, providing basic information about the model such as
   * the owner and permissioning.
   */
  retrieve(model, options) {
    return this._client.get(path`/models/${model}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Lists the currently available models, and provides basic information about each
   * one such as the owner and availability.
   */
  list(options) {
    return this._client.getAPIList("/models", Page, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Delete a fine-tuned model. You must have the Owner role in your organization to
   * delete a model.
   */
  delete(model, options) {
    return this._client.delete(path`/models/${model}`, { ...options, __security: { bearerAuth: true } });
  }
}
class Moderations extends APIResource {
  /**
   * Classifies if text and/or image inputs are potentially harmful. Learn more in
   * the [moderation guide](https://platform.openai.com/docs/guides/moderation).
   */
  create(body, options) {
    return this._client.post("/moderations", { body, ...options, __security: { bearerAuth: true } });
  }
}
class Calls extends APIResource {
  /**
   * Accept an incoming SIP call and configure the realtime session that will handle
   * it.
   *
   * @example
   * ```ts
   * await client.realtime.calls.accept('call_id', {
   *   type: 'realtime',
   * });
   * ```
   */
  accept(callID, body, options) {
    return this._client.post(path`/realtime/calls/${callID}/accept`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * End an active Realtime API call, whether it was initiated over SIP or WebRTC.
   *
   * @example
   * ```ts
   * await client.realtime.calls.hangup('call_id');
   * ```
   */
  hangup(callID, options) {
    return this._client.post(path`/realtime/calls/${callID}/hangup`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Transfer an active SIP call to a new destination using the SIP REFER verb.
   *
   * @example
   * ```ts
   * await client.realtime.calls.refer('call_id', {
   *   target_uri: 'tel:+14155550123',
   * });
   * ```
   */
  refer(callID, body, options) {
    return this._client.post(path`/realtime/calls/${callID}/refer`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Decline an incoming SIP call by returning a SIP status code to the caller.
   *
   * @example
   * ```ts
   * await client.realtime.calls.reject('call_id');
   * ```
   */
  reject(callID, body = {}, options) {
    return this._client.post(path`/realtime/calls/${callID}/reject`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
class ClientSecrets extends APIResource {
  /**
   * Create a Realtime client secret with an associated session configuration.
   *
   * Client secrets are short-lived tokens that can be passed to a client app, such
   * as a web frontend or mobile client, which grants access to the Realtime API
   * without leaking your main API key. You can configure a custom TTL for each
   * client secret.
   *
   * You can also attach session configuration options to the client secret, which
   * will be applied to any sessions created using that client secret, but these can
   * also be overridden by the client connection.
   *
   * [Learn more about authentication with client secrets over WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc).
   *
   * Returns the created client secret and the effective session object. The client
   * secret is a string that looks like `ek_1234`.
   *
   * @example
   * ```ts
   * const clientSecret =
   *   await client.realtime.clientSecrets.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/client_secrets", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
class Realtime2 extends APIResource {
  constructor() {
    super(...arguments);
    this.clientSecrets = new ClientSecrets(this._client);
    this.calls = new Calls(this._client);
  }
}
Realtime2.ClientSecrets = ClientSecrets;
Realtime2.Calls = Calls;
function maybeParseResponse(response, params) {
  if (!params || !hasAutoParseableInput(params)) {
    return {
      ...response,
      output_parsed: null,
      output: response.output.map((item) => {
        if (item.type === "function_call") {
          return {
            ...item,
            parsed_arguments: null
          };
        }
        if (item.type === "message") {
          return {
            ...item,
            content: item.content.map((content) => ({
              ...content,
              parsed: null
            }))
          };
        } else {
          return item;
        }
      })
    };
  }
  return parseResponse$1(response, params);
}
function parseResponse$1(response, params) {
  const output = response.output.map((item) => {
    if (item.type === "function_call") {
      return {
        ...item,
        parsed_arguments: parseToolCall(params, item)
      };
    }
    if (item.type === "message") {
      const content = item.content.map((content2) => {
        if (content2.type === "output_text") {
          return {
            ...content2,
            parsed: parseTextFormat(params, content2.text)
          };
        }
        return content2;
      });
      return {
        ...item,
        content
      };
    }
    return item;
  });
  const parsed = Object.assign({}, response, { output });
  if (!Object.getOwnPropertyDescriptor(response, "output_text")) {
    addOutputText(parsed);
  }
  Object.defineProperty(parsed, "output_parsed", {
    enumerable: true,
    get() {
      for (const output2 of parsed.output) {
        if (output2.type !== "message") {
          continue;
        }
        for (const content of output2.content) {
          if (content.type === "output_text" && content.parsed !== null) {
            return content.parsed;
          }
        }
      }
      return null;
    }
  });
  return parsed;
}
function parseTextFormat(params, content) {
  if (params.text?.format?.type !== "json_schema") {
    return null;
  }
  if ("$parseRaw" in params.text?.format) {
    const text_format = params.text?.format;
    return text_format.$parseRaw(content);
  }
  return JSON.parse(content);
}
function hasAutoParseableInput(params) {
  if (isAutoParsableResponseFormat(params.text?.format)) {
    return true;
  }
  return false;
}
function isAutoParsableTool(tool) {
  return tool?.["$brand"] === "auto-parseable-tool";
}
function getInputToolByName(input_tools, name2) {
  return input_tools.find((tool) => tool.type === "function" && tool.name === name2);
}
function parseToolCall(params, toolCall) {
  const inputTool = getInputToolByName(params.tools ?? [], toolCall.name);
  return {
    ...toolCall,
    ...toolCall,
    parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCall.arguments) : inputTool?.strict ? JSON.parse(toolCall.arguments) : null
  };
}
function addOutputText(rsp) {
  const texts = [];
  for (const output of rsp.output) {
    if (output.type !== "message") {
      continue;
    }
    for (const content of output.content) {
      if (content.type === "output_text") {
        texts.push(content.text);
      }
    }
  }
  rsp.output_text = texts.join("");
}
var _ResponseStream_instances, _ResponseStream_params, _ResponseStream_currentResponseSnapshot, _ResponseStream_finalResponse, _ResponseStream_beginRequest, _ResponseStream_addEvent, _ResponseStream_endRequest, _ResponseStream_accumulateResponse;
class ResponseStream extends EventStream {
  constructor(params) {
    super();
    _ResponseStream_instances.add(this);
    _ResponseStream_params.set(this, void 0);
    _ResponseStream_currentResponseSnapshot.set(this, void 0);
    _ResponseStream_finalResponse.set(this, void 0);
    __classPrivateFieldSet(this, _ResponseStream_params, params);
  }
  static createResponse(client, params, options) {
    const runner = new ResponseStream(params);
    runner._run(() => runner._createOrRetrieveResponse(client, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  async _createOrRetrieveResponse(client, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_beginRequest).call(this);
    let stream;
    let starting_after = null;
    if ("response_id" in params) {
      stream = await client.responses.retrieve(params.response_id, { stream: true }, { ...options, signal: this.controller.signal, stream: true });
      starting_after = params.starting_after ?? null;
    } else {
      stream = await client.responses.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
    }
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_addEvent).call(this, event, starting_after);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_endRequest).call(this);
  }
  [(_ResponseStream_params = /* @__PURE__ */ new WeakMap(), _ResponseStream_currentResponseSnapshot = /* @__PURE__ */ new WeakMap(), _ResponseStream_finalResponse = /* @__PURE__ */ new WeakMap(), _ResponseStream_instances = /* @__PURE__ */ new WeakSet(), _ResponseStream_beginRequest = function _ResponseStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0);
  }, _ResponseStream_addEvent = function _ResponseStream_addEvent2(event, starting_after) {
    if (this.ended)
      return;
    const maybeEmit = (name2, event2) => {
      if (starting_after == null || event2.sequence_number > starting_after) {
        this._emit(name2, event2);
      }
    };
    const response = __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_accumulateResponse).call(this, event);
    maybeEmit("event", event);
    switch (event.type) {
      case "response.output_text.delta": {
        const output = response.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "message") {
          const content = output.content[event.content_index];
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          maybeEmit("response.output_text.delta", {
            ...event,
            snapshot: content.text
          });
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const output = response.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "function_call") {
          maybeEmit("response.function_call_arguments.delta", {
            ...event,
            snapshot: output.arguments
          });
        }
        break;
      }
      default:
        maybeEmit(event.type, event);
        break;
    }
  }, _ResponseStream_endRequest = function _ResponseStream_endRequest2() {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    const snapshot = __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f");
    if (!snapshot) {
      throw new OpenAIError(`request ended without sending any events`);
    }
    __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0);
    const parsedResponse = finalizeResponse(snapshot, __classPrivateFieldGet(this, _ResponseStream_params, "f"));
    __classPrivateFieldSet(this, _ResponseStream_finalResponse, parsedResponse);
    return parsedResponse;
  }, _ResponseStream_accumulateResponse = function _ResponseStream_accumulateResponse2(event) {
    let snapshot = __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f");
    if (!snapshot) {
      if (event.type !== "response.created") {
        throw new OpenAIError(`When snapshot hasn't been set yet, expected 'response.created' event, got ${event.type}`);
      }
      snapshot = __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, event.response);
      return snapshot;
    }
    switch (event.type) {
      case "response.output_item.added": {
        snapshot.output.push(event.item);
        break;
      }
      case "response.content_part.added": {
        const output = snapshot.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        const type = output.type;
        const part = event.part;
        if (type === "message" && part.type !== "reasoning_text") {
          output.content.push(part);
        } else if (type === "reasoning" && part.type === "reasoning_text") {
          if (!output.content) {
            output.content = [];
          }
          output.content.push(part);
        }
        break;
      }
      case "response.output_text.delta": {
        const output = snapshot.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "message") {
          const content = output.content[event.content_index];
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          content.text += event.delta;
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const output = snapshot.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "function_call") {
          output.arguments += event.delta;
        }
        break;
      }
      case "response.reasoning_text.delta": {
        const output = snapshot.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "reasoning") {
          const content = output.content?.[event.content_index];
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          if (content.type !== "reasoning_text") {
            throw new OpenAIError(`expected content to be 'reasoning_text', got ${content.type}`);
          }
          content.text += event.delta;
        }
        break;
      }
      case "response.completed": {
        __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, event.response);
        break;
      }
    }
    return snapshot;
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("event", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((event2) => event2 ? { value: event2, done: false } : { value: void 0, done: true });
        }
        const event = pushQueue.shift();
        return { value: event, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  /**
   * @returns a promise that resolves with the final Response, or rejects
   * if an error occurred or the stream ended prematurely without producing a REsponse.
   */
  async finalResponse() {
    await this.done();
    const response = __classPrivateFieldGet(this, _ResponseStream_finalResponse, "f");
    if (!response)
      throw new OpenAIError("stream ended without producing a ChatCompletion");
    return response;
  }
}
function finalizeResponse(snapshot, params) {
  return maybeParseResponse(snapshot, params);
}
class InputItems extends APIResource {
  /**
   * Returns a list of input items for a given response.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const responseItem of client.responses.inputItems.list(
   *   'response_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(responseID, query2 = {}, options) {
    return this._client.getAPIList(path`/responses/${responseID}/input_items`, CursorPage, { query: query2, ...options, __security: { bearerAuth: true } });
  }
}
class InputTokens extends APIResource {
  /**
   * Returns input token counts of the request.
   *
   * Returns an object with `object` set to `response.input_tokens` and an
   * `input_tokens` count.
   *
   * @example
   * ```ts
   * const response = await client.responses.inputTokens.count();
   * ```
   */
  count(body = {}, options) {
    return this._client.post("/responses/input_tokens", {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
class Responses extends APIResource {
  constructor() {
    super(...arguments);
    this.inputItems = new InputItems(this._client);
    this.inputTokens = new InputTokens(this._client);
  }
  create(body, options) {
    return this._client.post("/responses", {
      body,
      ...options,
      stream: body.stream ?? false,
      __security: { bearerAuth: true }
    })._thenUnwrap((rsp) => {
      if ("object" in rsp && rsp.object === "response") {
        addOutputText(rsp);
      }
      return rsp;
    });
  }
  retrieve(responseID, query2 = {}, options) {
    return this._client.get(path`/responses/${responseID}`, {
      query: query2,
      ...options,
      stream: query2?.stream ?? false,
      __security: { bearerAuth: true }
    })._thenUnwrap((rsp) => {
      if ("object" in rsp && rsp.object === "response") {
        addOutputText(rsp);
      }
      return rsp;
    });
  }
  /**
   * Deletes a model response with the given ID.
   *
   * @example
   * ```ts
   * await client.responses.delete(
   *   'resp_677efb5139a88190b512bc3fef8e535d',
   * );
   * ```
   */
  delete(responseID, options) {
    return this._client.delete(path`/responses/${responseID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  parse(body, options) {
    return this._client.responses.create(body, options)._thenUnwrap((response) => parseResponse$1(response, body));
  }
  /**
   * Creates a model response stream
   */
  stream(body, options) {
    return ResponseStream.createResponse(this._client, body, options);
  }
  /**
   * Cancels a model response with the given ID. Only responses created with the
   * `background` parameter set to `true` can be cancelled.
   * [Learn more](https://platform.openai.com/docs/guides/background).
   *
   * @example
   * ```ts
   * const response = await client.responses.cancel(
   *   'resp_677efb5139a88190b512bc3fef8e535d',
   * );
   * ```
   */
  cancel(responseID, options) {
    return this._client.post(path`/responses/${responseID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Compact a conversation. Returns a compacted response object.
   *
   * Learn when and how to compact long-running conversations in the
   * [conversation state guide](https://platform.openai.com/docs/guides/conversation-state#managing-the-context-window).
   * For ZDR-compatible compaction details, see
   * [Compaction (advanced)](https://platform.openai.com/docs/guides/conversation-state#compaction-advanced).
   *
   * @example
   * ```ts
   * const compactedResponse = await client.responses.compact({
   *   model: 'gpt-5.4',
   * });
   * ```
   */
  compact(body, options) {
    return this._client.post("/responses/compact", { body, ...options, __security: { bearerAuth: true } });
  }
}
Responses.InputItems = InputItems;
Responses.InputTokens = InputTokens;
let Content$1 = class Content2 extends APIResource {
  /**
   * Download a skill zip bundle by its ID.
   */
  retrieve(skillID, options) {
    return this._client.get(path`/skills/${skillID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
};
class Content3 extends APIResource {
  /**
   * Download a skill version zip bundle.
   */
  retrieve(version2, params, options) {
    const { skill_id } = params;
    return this._client.get(path`/skills/${skill_id}/versions/${version2}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
}
class Versions extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content3(this._client);
  }
  /**
   * Create a new immutable skill version.
   */
  create(skillID, body = {}, options) {
    return this._client.post(path`/skills/${skillID}/versions`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Get a specific skill version.
   */
  retrieve(version2, params, options) {
    const { skill_id } = params;
    return this._client.get(path`/skills/${skill_id}/versions/${version2}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List skill versions for a skill.
   */
  list(skillID, query2 = {}, options) {
    return this._client.getAPIList(path`/skills/${skillID}/versions`, CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a skill version.
   */
  delete(version2, params, options) {
    const { skill_id } = params;
    return this._client.delete(path`/skills/${skill_id}/versions/${version2}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
Versions.Content = Content3;
class Skills extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content$1(this._client);
    this.versions = new Versions(this._client);
  }
  /**
   * Create a new skill.
   */
  create(body = {}, options) {
    return this._client.post("/skills", maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Get a skill by its ID.
   */
  retrieve(skillID, options) {
    return this._client.get(path`/skills/${skillID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Update the default version pointer for a skill.
   */
  update(skillID, body, options) {
    return this._client.post(path`/skills/${skillID}`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * List all skills for the current project.
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/skills", CursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a skill by its ID.
   */
  delete(skillID, options) {
    return this._client.delete(path`/skills/${skillID}`, { ...options, __security: { bearerAuth: true } });
  }
}
Skills.Content = Content$1;
Skills.Versions = Versions;
class Parts extends APIResource {
  /**
   * Adds a
   * [Part](https://platform.openai.com/docs/api-reference/uploads/part-object) to an
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object.
   * A Part represents a chunk of bytes from the file you are trying to upload.
   *
   * Each Part can be at most 64 MB, and you can add Parts until you hit the Upload
   * maximum of 8 GB.
   *
   * It is possible to add multiple Parts in parallel. You can decide the intended
   * order of the Parts when you
   * [complete the Upload](https://platform.openai.com/docs/api-reference/uploads/complete).
   */
  create(uploadID, body, options) {
    return this._client.post(path`/uploads/${uploadID}/parts`, multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
}
class Uploads extends APIResource {
  constructor() {
    super(...arguments);
    this.parts = new Parts(this._client);
  }
  /**
   * Creates an intermediate
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object
   * that you can add
   * [Parts](https://platform.openai.com/docs/api-reference/uploads/part-object) to.
   * Currently, an Upload can accept at most 8 GB in total and expires after an hour
   * after you create it.
   *
   * Once you complete the Upload, we will create a
   * [File](https://platform.openai.com/docs/api-reference/files/object) object that
   * contains all the parts you uploaded. This File is usable in the rest of our
   * platform as a regular File object.
   *
   * For certain `purpose` values, the correct `mime_type` must be specified. Please
   * refer to documentation for the
   * [supported MIME types for your use case](https://platform.openai.com/docs/assistants/tools/file-search#supported-files).
   *
   * For guidance on the proper filename extensions for each purpose, please follow
   * the documentation on
   * [creating a File](https://platform.openai.com/docs/api-reference/files/create).
   *
   * Returns the Upload object with status `pending`.
   */
  create(body, options) {
    return this._client.post("/uploads", { body, ...options, __security: { bearerAuth: true } });
  }
  /**
   * Cancels the Upload. No Parts may be added after an Upload is cancelled.
   *
   * Returns the Upload object with status `cancelled`.
   */
  cancel(uploadID, options) {
    return this._client.post(path`/uploads/${uploadID}/cancel`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Completes the
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object).
   *
   * Within the returned Upload object, there is a nested
   * [File](https://platform.openai.com/docs/api-reference/files/object) object that
   * is ready to use in the rest of the platform.
   *
   * You can specify the order of the Parts by passing in an ordered list of the Part
   * IDs.
   *
   * The number of bytes uploaded upon completion must match the number of bytes
   * initially specified when creating the Upload object. No Parts may be added after
   * an Upload is completed. Returns the Upload object with status `completed`,
   * including an additional `file` property containing the created usable File
   * object.
   */
  complete(uploadID, body, options) {
    return this._client.post(path`/uploads/${uploadID}/complete`, {
      body,
      ...options,
      __security: { bearerAuth: true }
    });
  }
}
Uploads.Parts = Parts;
const allSettledWithThrow = async (promises) => {
  const results = await Promise.allSettled(promises);
  const rejected = results.filter((result) => result.status === "rejected");
  if (rejected.length) {
    for (const result of rejected) {
      console.error(result.reason);
    }
    throw new Error(`${rejected.length} promise(s) failed - see the above errors`);
  }
  const values = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      values.push(result.value);
    }
  }
  return values;
};
class FileBatches extends APIResource {
  /**
   * Create a vector store file batch.
   */
  create(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}/file_batches`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a vector store file batch.
   */
  retrieve(batchID, params, options) {
    const { vector_store_id } = params;
    return this._client.get(path`/vector_stores/${vector_store_id}/file_batches/${batchID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Cancel a vector store file batch. This attempts to cancel the processing of
   * files in this batch as soon as possible.
   */
  cancel(batchID, params, options) {
    const { vector_store_id } = params;
    return this._client.post(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Create a vector store batch and poll until all files have been processed.
   */
  async createAndPoll(vectorStoreId, body, options) {
    const batch = await this.create(vectorStoreId, body);
    return await this.poll(vectorStoreId, batch.id, options);
  }
  /**
   * Returns a list of vector store files in a batch.
   */
  listFiles(batchID, params, options) {
    const { vector_store_id, ...query2 } = params;
    return this._client.getAPIList(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/files`, CursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Wait for the given file batch to be processed.
   *
   * Note: this will return even if one of the files failed to process, you need to
   * check batch.file_counts.failed_count to handle this case.
   */
  async poll(vectorStoreID, batchID, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const { data: batch, response } = await this.retrieve(batchID, { vector_store_id: vectorStoreID }, {
        ...options,
        headers
      }).withResponse();
      switch (batch.status) {
        case "in_progress":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        case "failed":
        case "cancelled":
        case "completed":
          return batch;
      }
    }
  }
  /**
   * Uploads the given files concurrently and then creates a vector store file batch.
   *
   * The concurrency limit is configurable using the `maxConcurrency` parameter.
   */
  async uploadAndPoll(vectorStoreId, { files, fileIds = [] }, options) {
    if (files == null || files.length == 0) {
      throw new Error(`No \`files\` provided to process. If you've already uploaded files you should use \`.createAndPoll()\` instead`);
    }
    const configuredConcurrency = options?.maxConcurrency ?? 5;
    const concurrencyLimit = Math.min(configuredConcurrency, files.length);
    const client = this._client;
    const fileIterator = files.values();
    const allFileIds = [...fileIds];
    async function processFiles(iterator) {
      for (let item of iterator) {
        const fileObj = await client.files.create({ file: item, purpose: "assistants" }, options);
        allFileIds.push(fileObj.id);
      }
    }
    const workers = Array(concurrencyLimit).fill(fileIterator).map(processFiles);
    await allSettledWithThrow(workers);
    return await this.createAndPoll(vectorStoreId, {
      file_ids: allFileIds
    });
  }
}
class Files3 extends APIResource {
  /**
   * Create a vector store file by attaching a
   * [File](https://platform.openai.com/docs/api-reference/files) to a
   * [vector store](https://platform.openai.com/docs/api-reference/vector-stores/object).
   */
  create(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}/files`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a vector store file.
   */
  retrieve(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.get(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Update attributes on a vector store file.
   */
  update(fileID, params, options) {
    const { vector_store_id, ...body } = params;
    return this._client.post(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of vector store files.
   */
  list(vectorStoreID, query2 = {}, options) {
    return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/files`, CursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a vector store file. This will remove the file from the vector store but
   * the file itself will not be deleted. To delete the file, use the
   * [delete file](https://platform.openai.com/docs/api-reference/files/delete)
   * endpoint.
   */
  delete(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.delete(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Attach a file to the given vector store and wait for it to be processed.
   */
  async createAndPoll(vectorStoreId, body, options) {
    const file = await this.create(vectorStoreId, body, options);
    return await this.poll(vectorStoreId, file.id, options);
  }
  /**
   * Wait for the vector store file to finish processing.
   *
   * Note: this will return even if the file failed to process, you need to check
   * file.last_error and file.status to handle these cases
   */
  async poll(vectorStoreID, fileID, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const fileResponse = await this.retrieve(fileID, {
        vector_store_id: vectorStoreID
      }, { ...options, headers }).withResponse();
      const file = fileResponse.data;
      switch (file.status) {
        case "in_progress":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = fileResponse.response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        case "failed":
        case "completed":
          return file;
      }
    }
  }
  /**
   * Upload a file to the `files` API and then attach it to the given vector store.
   *
   * Note the file will be asynchronously processed (you can use the alternative
   * polling helper method to wait for processing to complete).
   */
  async upload(vectorStoreId, file, options) {
    const fileInfo = await this._client.files.create({ file, purpose: "assistants" }, options);
    return this.create(vectorStoreId, { file_id: fileInfo.id }, options);
  }
  /**
   * Add a file to a vector store and poll until processing is complete.
   */
  async uploadAndPoll(vectorStoreId, file, options) {
    const fileInfo = await this.upload(vectorStoreId, file, options);
    return await this.poll(vectorStoreId, fileInfo.id, options);
  }
  /**
   * Retrieve the parsed contents of a vector store file.
   */
  content(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.getAPIList(path`/vector_stores/${vector_store_id}/files/${fileID}/content`, Page, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
class VectorStores extends APIResource {
  constructor() {
    super(...arguments);
    this.files = new Files3(this._client);
    this.fileBatches = new FileBatches(this._client);
  }
  /**
   * Create a vector store.
   */
  create(body, options) {
    return this._client.post("/vector_stores", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Retrieves a vector store.
   */
  retrieve(vectorStoreID, options) {
    return this._client.get(path`/vector_stores/${vectorStoreID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Modifies a vector store.
   */
  update(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Returns a list of vector stores.
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/vector_stores", CursorPage, {
      query: query2,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Delete a vector store.
   */
  delete(vectorStoreID, options) {
    return this._client.delete(path`/vector_stores/${vectorStoreID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
  /**
   * Search a vector store for relevant chunks based on a query and file attributes
   * filter.
   */
  search(vectorStoreID, body, options) {
    return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/search`, Page, {
      body,
      method: "post",
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      __security: { bearerAuth: true }
    });
  }
}
VectorStores.Files = Files3;
VectorStores.FileBatches = FileBatches;
class Videos extends APIResource {
  /**
   * Create a new video generation job from a prompt and optional reference assets.
   */
  create(body, options) {
    return this._client.post("/videos", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Fetch the latest metadata for a generated video.
   */
  retrieve(videoID, options) {
    return this._client.get(path`/videos/${videoID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * List recently generated videos for the current project.
   */
  list(query2 = {}, options) {
    return this._client.getAPIList("/videos", ConversationCursorPage, {
      query: query2,
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Permanently delete a completed or failed video and its stored assets.
   */
  delete(videoID, options) {
    return this._client.delete(path`/videos/${videoID}`, { ...options, __security: { bearerAuth: true } });
  }
  /**
   * Create a character from an uploaded video.
   */
  createCharacter(body, options) {
    return this._client.post("/videos/characters", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Download the generated video bytes or a derived preview asset.
   *
   * Streams the rendered video content for the specified video job.
   */
  downloadContent(videoID, query2 = {}, options) {
    return this._client.get(path`/videos/${videoID}/content`, {
      query: query2,
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __security: { bearerAuth: true },
      __binaryResponse: true
    });
  }
  /**
   * Create a new video generation job by editing a source video or existing
   * generated video.
   */
  edit(body, options) {
    return this._client.post("/videos/edits", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Create an extension of a completed video.
   */
  extend(body, options) {
    return this._client.post("/videos/extensions", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
  /**
   * Fetch a character.
   */
  getCharacter(characterID, options) {
    return this._client.get(path`/videos/characters/${characterID}`, {
      ...options,
      __security: { bearerAuth: true }
    });
  }
  /**
   * Create a remix of a completed video using a refreshed prompt.
   */
  remix(videoID, body, options) {
    return this._client.post(path`/videos/${videoID}/remix`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
  }
}
var _Webhooks_instances, _Webhooks_validateSecret, _Webhooks_getRequiredHeader;
class Webhooks extends APIResource {
  constructor() {
    super(...arguments);
    _Webhooks_instances.add(this);
  }
  /**
   * Validates that the given payload was sent by OpenAI and parses the payload.
   */
  async unwrap(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
    await this.verifySignature(payload, headers, secret, tolerance);
    return JSON.parse(payload);
  }
  /**
   * Validates whether or not the webhook payload was sent by OpenAI.
   *
   * An error will be raised if the webhook payload was not sent by OpenAI.
   *
   * @param payload - The webhook payload
   * @param headers - The webhook headers
   * @param secret - The webhook secret (optional, will use client secret if not provided)
   * @param tolerance - Maximum age of the webhook in seconds (default: 300 = 5 minutes)
   */
  async verifySignature(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
    if (typeof crypto === "undefined" || typeof crypto.subtle.importKey !== "function" || typeof crypto.subtle.verify !== "function") {
      throw new Error("Webhook signature verification is only supported when the `crypto` global is defined");
    }
    __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_validateSecret).call(this, secret);
    const headersObj = buildHeaders([headers]).values;
    const signatureHeader = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-signature");
    const timestamp = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-timestamp");
    const webhookId = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-id");
    const timestampSeconds = parseInt(timestamp, 10);
    if (isNaN(timestampSeconds)) {
      throw new InvalidWebhookSignatureError("Invalid webhook timestamp format");
    }
    const nowSeconds = Math.floor(Date.now() / 1e3);
    if (nowSeconds - timestampSeconds > tolerance) {
      throw new InvalidWebhookSignatureError("Webhook timestamp is too old");
    }
    if (timestampSeconds > nowSeconds + tolerance) {
      throw new InvalidWebhookSignatureError("Webhook timestamp is too new");
    }
    const signatures = signatureHeader.split(" ").map((part) => part.startsWith("v1,") ? part.substring(3) : part);
    const decodedSecret = secret.startsWith("whsec_") ? Buffer.from(secret.replace("whsec_", ""), "base64") : Buffer.from(secret, "utf-8");
    const signedPayload = webhookId ? `${webhookId}.${timestamp}.${payload}` : `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey("raw", decodedSecret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    for (const signature of signatures) {
      try {
        const signatureBytes = Buffer.from(signature, "base64");
        const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(signedPayload));
        if (isValid) {
          return;
        }
      } catch {
        continue;
      }
    }
    throw new InvalidWebhookSignatureError("The given webhook signature does not match the expected signature");
  }
}
_Webhooks_instances = /* @__PURE__ */ new WeakSet(), _Webhooks_validateSecret = function _Webhooks_validateSecret2(secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error(`The webhook secret must either be set using the env var, OPENAI_WEBHOOK_SECRET, on the client class, OpenAI({ webhookSecret: '123' }), or passed to this function`);
  }
}, _Webhooks_getRequiredHeader = function _Webhooks_getRequiredHeader2(headers, name2) {
  if (!headers) {
    throw new Error(`Headers are required`);
  }
  const value = headers.get(name2);
  if (value === null || value === void 0) {
    throw new Error(`Missing required header: ${name2}`);
  }
  return value;
};
var _OpenAI_instances, _a, _OpenAI_encoder, _OpenAI_baseURLOverridden;
const WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER = "workload-identity-auth";
class OpenAI {
  /**
   * API Client for interfacing with the OpenAI API.
   *
   * @param {string | null | undefined} [opts.apiKey=process.env['OPENAI_API_KEY'] ?? null]
   * @param {string | null | undefined} [opts.adminAPIKey=process.env['OPENAI_ADMIN_KEY'] ?? null]
   * @param {string | null | undefined} [opts.organization=process.env['OPENAI_ORG_ID'] ?? null]
   * @param {string | null | undefined} [opts.project=process.env['OPENAI_PROJECT_ID'] ?? null]
   * @param {string | null | undefined} [opts.webhookSecret=process.env['OPENAI_WEBHOOK_SECRET'] ?? null]
   * @param {string} [opts.baseURL=process.env['OPENAI_BASE_URL'] ?? https://api.openai.com/v1] - Override the default base URL for the API.
   * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
   * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
   * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
   * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
   * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
   * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
   * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
   */
  constructor({ baseURL = readEnv("OPENAI_BASE_URL"), apiKey = readEnv("OPENAI_API_KEY") ?? null, adminAPIKey = readEnv("OPENAI_ADMIN_KEY") ?? null, organization = readEnv("OPENAI_ORG_ID") ?? null, project = readEnv("OPENAI_PROJECT_ID") ?? null, webhookSecret = readEnv("OPENAI_WEBHOOK_SECRET") ?? null, workloadIdentity, ...opts } = {}) {
    _OpenAI_instances.add(this);
    _OpenAI_encoder.set(this, void 0);
    this.completions = new Completions2(this);
    this.chat = new Chat(this);
    this.embeddings = new Embeddings(this);
    this.files = new Files$1(this);
    this.images = new Images(this);
    this.audio = new Audio(this);
    this.moderations = new Moderations(this);
    this.models = new Models(this);
    this.fineTuning = new FineTuning(this);
    this.graders = new Graders2(this);
    this.vectorStores = new VectorStores(this);
    this.webhooks = new Webhooks(this);
    this.beta = new Beta(this);
    this.batches = new Batches(this);
    this.uploads = new Uploads(this);
    this.admin = new Admin(this);
    this.responses = new Responses(this);
    this.realtime = new Realtime2(this);
    this.conversations = new Conversations(this);
    this.evals = new Evals(this);
    this.containers = new Containers(this);
    this.skills = new Skills(this);
    this.videos = new Videos(this);
    const options = {
      apiKey,
      adminAPIKey,
      organization,
      project,
      webhookSecret,
      workloadIdentity,
      ...opts,
      baseURL: baseURL || `https://api.openai.com/v1`
    };
    if (apiKey && workloadIdentity) {
      throw new OpenAIError("The `apiKey` and `workloadIdentity` options are mutually exclusive");
    }
    if (!apiKey && !adminAPIKey && !workloadIdentity) {
      throw new OpenAIError("Missing credentials. Please pass an `apiKey`, `workloadIdentity`, `adminAPIKey`, or set the `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` environment variable.");
    }
    if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
      throw new OpenAIError("It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew OpenAI({ apiKey, dangerouslyAllowBrowser: true });\n\nhttps://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety\n");
    }
    this.baseURL = options.baseURL;
    this.timeout = options.timeout ?? _a.DEFAULT_TIMEOUT;
    this.logger = options.logger ?? console;
    const defaultLogLevel = "warn";
    this.logLevel = defaultLogLevel;
    this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ?? parseLogLevel(readEnv("OPENAI_LOG"), "process.env['OPENAI_LOG']", this) ?? defaultLogLevel;
    this.fetchOptions = options.fetchOptions;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetch = options.fetch ?? getDefaultFetch();
    __classPrivateFieldSet(this, _OpenAI_encoder, FallbackEncoder);
    const customHeadersEnv = readEnv("OPENAI_CUSTOM_HEADERS");
    if (customHeadersEnv) {
      const parsed = {};
      for (const line of customHeadersEnv.split("\n")) {
        const colon = line.indexOf(":");
        if (colon >= 0) {
          parsed[line.substring(0, colon).trim()] = line.substring(colon + 1).trim();
        }
      }
      options.defaultHeaders = buildHeaders([parsed, options.defaultHeaders]);
    }
    this._options = options;
    if (workloadIdentity) {
      this._workloadIdentityAuth = new WorkloadIdentityAuth(workloadIdentity, this.fetch);
    }
    this.apiKey = typeof apiKey === "string" ? apiKey : null;
    this.adminAPIKey = adminAPIKey;
    this.organization = organization;
    this.project = project;
    this.webhookSecret = webhookSecret;
  }
  /**
   * Create a new client instance re-using the same options given to the current client with optional overriding.
   */
  withOptions(options) {
    const client = new this.constructor({
      ...this._options,
      baseURL: this.baseURL,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      logger: this.logger,
      logLevel: this.logLevel,
      fetch: this.fetch,
      fetchOptions: this.fetchOptions,
      apiKey: this._options.apiKey,
      adminAPIKey: this.adminAPIKey,
      workloadIdentity: this._options.workloadIdentity,
      organization: this.organization,
      project: this.project,
      webhookSecret: this.webhookSecret,
      ...options
    });
    return client;
  }
  defaultQuery() {
    return this._options.defaultQuery;
  }
  validateHeaders({ values, nulls }, schemes = {
    bearerAuth: true,
    adminAPIKeyAuth: true
  }) {
    if (values.get("authorization") || values.get("api-key")) {
      return;
    }
    if (nulls.has("authorization") || nulls.has("api-key")) {
      return;
    }
    if (this._workloadIdentityAuth && schemes.bearerAuth) {
      return;
    }
    throw new Error('Could not resolve authentication method. Expected either apiKey or adminAPIKey to be set. Or for one of the "Authorization" or "api-key" headers to be explicitly omitted');
  }
  async authHeaders(opts, schemes = {
    bearerAuth: true,
    adminAPIKeyAuth: true
  }) {
    return buildHeaders([
      schemes.bearerAuth ? await this.bearerAuth(opts) : null,
      schemes.adminAPIKeyAuth ? await this.adminAPIKeyAuth(opts) : null
    ]);
  }
  async bearerAuth(opts) {
    if (this._workloadIdentityAuth) {
      return buildHeaders([{ Authorization: `Bearer ${await this._workloadIdentityAuth.getToken()}` }]);
    }
    if (this.apiKey == null) {
      return void 0;
    }
    return buildHeaders([{ Authorization: `Bearer ${this.apiKey}` }]);
  }
  async adminAPIKeyAuth(opts) {
    if (this.adminAPIKey == null) {
      return void 0;
    }
    return buildHeaders([{ Authorization: `Bearer ${this.adminAPIKey}` }]);
  }
  stringifyQuery(query2) {
    return stringifyQuery(query2);
  }
  getUserAgent() {
    return `${this.constructor.name}/JS ${VERSION}`;
  }
  defaultIdempotencyKey() {
    return `stainless-node-retry-${uuid4()}`;
  }
  makeStatusError(status, error, message, headers) {
    return APIError.generate(status, error, message, headers);
  }
  async _callApiKey() {
    const apiKey = this._options.apiKey;
    if (typeof apiKey !== "function")
      return false;
    let token;
    try {
      token = await apiKey();
    } catch (err) {
      if (err instanceof OpenAIError)
        throw err;
      throw new OpenAIError(
        `Failed to get token from 'apiKey' function: ${err.message}`,
        // @ts-ignore
        { cause: err }
      );
    }
    if (typeof token !== "string" || !token) {
      throw new OpenAIError(`Expected 'apiKey' function argument to return a string but it returned ${token}`);
    }
    this.apiKey = token;
    return true;
  }
  buildURL(path2, query2, defaultBaseURL) {
    const baseURL = !__classPrivateFieldGet(this, _OpenAI_instances, "m", _OpenAI_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
    const url = isAbsoluteURL(path2) ? new URL(path2) : new URL(baseURL + (baseURL.endsWith("/") && path2.startsWith("/") ? path2.slice(1) : path2));
    const defaultQuery = this.defaultQuery();
    const pathQuery = Object.fromEntries(url.searchParams);
    if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) {
      query2 = { ...pathQuery, ...defaultQuery, ...query2 };
    }
    if (typeof query2 === "object" && query2 && !Array.isArray(query2)) {
      url.search = this.stringifyQuery(query2);
    }
    return url.toString();
  }
  /**
   * Used as a callback for mutating the given `FinalRequestOptions` object.
   */
  async prepareOptions(options) {
    const security = options.__security ?? { bearerAuth: true };
    if (security.bearerAuth) {
      await this._callApiKey();
    }
  }
  /**
   * Used as a callback for mutating the given `RequestInit` object.
   *
   * This is useful for cases where you want to add certain headers based off of
   * the request properties, e.g. `method` or `url`.
   */
  async prepareRequest(request2, { url, options }) {
  }
  get(path2, opts) {
    return this.methodRequest("get", path2, opts);
  }
  post(path2, opts) {
    return this.methodRequest("post", path2, opts);
  }
  patch(path2, opts) {
    return this.methodRequest("patch", path2, opts);
  }
  put(path2, opts) {
    return this.methodRequest("put", path2, opts);
  }
  delete(path2, opts) {
    return this.methodRequest("delete", path2, opts);
  }
  methodRequest(method, path2, opts) {
    return this.request(Promise.resolve(opts).then((opts2) => {
      return { method, path: path2, ...opts2 };
    }));
  }
  request(options, remainingRetries = null) {
    return new APIPromise(this, this.makeRequest(options, remainingRetries, void 0));
  }
  async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
    const options = await optionsInput;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    if (retriesRemaining == null) {
      retriesRemaining = maxRetries;
    }
    await this.prepareOptions(options);
    const { req, url, timeout } = await this.buildRequest(options, {
      retryCount: maxRetries - retriesRemaining
    });
    await this.prepareRequest(req, { url, options });
    const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
    const retryLogStr = retryOfRequestLogID === void 0 ? "" : `, retryOf: ${retryOfRequestLogID}`;
    const startTime = Date.now();
    loggerFor(this).debug(`[${requestLogID}] sending request`, formatRequestDetails({
      retryOfRequestLogID,
      method: options.method,
      url,
      options,
      headers: req.headers
    }));
    if (options.signal?.aborted) {
      throw new APIUserAbortError();
    }
    const security = options.__security ?? { bearerAuth: true };
    const controller = new AbortController();
    const response = await this.fetchWithAuth(url, req, timeout, controller, security).catch(castToError);
    const headersTime = Date.now();
    if (response instanceof globalThis.Error) {
      const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
      if (options.signal?.aborted) {
        throw new APIUserAbortError();
      }
      const isTimeout = isAbortError(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
      if (retriesRemaining) {
        loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
        loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url,
          durationMs: headersTime - startTime,
          message: response.message
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`);
      loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`, formatRequestDetails({
        retryOfRequestLogID,
        url,
        durationMs: headersTime - startTime,
        message: response.message
      }));
      if (response instanceof OAuthError || response instanceof SubjectTokenProviderError) {
        throw response;
      }
      if (isTimeout) {
        throw new APIConnectionTimeoutError();
      }
      throw new APIConnectionError({ cause: response });
    }
    const specialHeaders = [...response.headers.entries()].filter(([name2]) => name2 === "x-request-id").map(([name2, value]) => ", " + name2 + ": " + JSON.stringify(value)).join("");
    const responseInfo = `[${requestLogID}${retryLogStr}${specialHeaders}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
    if (!response.ok) {
      if (response.status === 401 && this._workloadIdentityAuth && security.bearerAuth && !options.__metadata?.["hasStreamingBody"] && !options.__metadata?.["workloadIdentityTokenRefreshed"]) {
        await CancelReadableStream(response.body);
        this._workloadIdentityAuth.invalidateToken();
        return this.makeRequest({
          ...options,
          __metadata: {
            ...options.__metadata,
            workloadIdentityTokenRefreshed: true
          }
        }, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      const shouldRetry = await this.shouldRetry(response);
      if (retriesRemaining && shouldRetry) {
        const retryMessage2 = `retrying, ${retriesRemaining} attempts remaining`;
        await CancelReadableStream(response.body);
        loggerFor(this).info(`${responseInfo} - ${retryMessage2}`);
        loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage2})`, formatRequestDetails({
          retryOfRequestLogID,
          url: response.url,
          status: response.status,
          headers: response.headers,
          durationMs: headersTime - startTime
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
      }
      const retryMessage = shouldRetry ? `error; no more retries left` : `error; not retryable`;
      loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
      const errText = await response.text().catch((err2) => castToError(err2).message);
      const errJSON = safeJSON(errText);
      const errMessage = errJSON ? void 0 : errText;
      loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
        retryOfRequestLogID,
        url: response.url,
        status: response.status,
        headers: response.headers,
        message: errMessage,
        durationMs: Date.now() - startTime
      }));
      const err = this.makeStatusError(response.status, errJSON, errMessage, response.headers);
      throw err;
    }
    loggerFor(this).info(responseInfo);
    loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
      retryOfRequestLogID,
      url: response.url,
      status: response.status,
      headers: response.headers,
      durationMs: headersTime - startTime
    }));
    return { response, options, controller, requestLogID, retryOfRequestLogID, startTime };
  }
  getAPIList(path2, Page2, opts) {
    return this.requestAPIList(Page2, opts && "then" in opts ? opts.then((opts2) => ({ method: "get", path: path2, ...opts2 })) : { method: "get", path: path2, ...opts });
  }
  requestAPIList(Page2, options) {
    const request2 = this.makeRequest(options, null, void 0);
    return new PagePromise(this, request2, Page2);
  }
  async fetchWithAuth(url, init, timeout, controller, schemes = {
    bearerAuth: true,
    adminAPIKeyAuth: true
  }) {
    if (this._workloadIdentityAuth && schemes.bearerAuth) {
      const headers = init.headers;
      const authHeader = headers.get("Authorization");
      if (!authHeader || authHeader === `Bearer ${WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER}`) {
        const token = await this._workloadIdentityAuth.getToken();
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    const response = await this.fetchWithTimeout(url, init, timeout, controller);
    return response;
  }
  async fetchWithTimeout(url, init, ms, controller) {
    const { signal, method, ...options } = init || {};
    const abort = this._makeAbort(controller);
    if (signal)
      signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, ms);
    const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
    const fetchOptions = {
      signal: controller.signal,
      ...isReadableBody ? { duplex: "half" } : {},
      method: "GET",
      ...options
    };
    if (method) {
      fetchOptions.method = method.toUpperCase();
    }
    try {
      return await this.fetch.call(void 0, url, fetchOptions);
    } finally {
      clearTimeout(timeout);
    }
  }
  async shouldRetry(response) {
    const shouldRetryHeader = response.headers.get("x-should-retry");
    if (shouldRetryHeader === "true")
      return true;
    if (shouldRetryHeader === "false")
      return false;
    if (response.status === 408)
      return true;
    if (response.status === 409)
      return true;
    if (response.status === 429)
      return true;
    if (response.status >= 500)
      return true;
    return false;
  }
  async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
    let timeoutMillis;
    const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
    if (retryAfterMillisHeader) {
      const timeoutMs = parseFloat(retryAfterMillisHeader);
      if (!Number.isNaN(timeoutMs)) {
        timeoutMillis = timeoutMs;
      }
    }
    const retryAfterHeader = responseHeaders?.get("retry-after");
    if (retryAfterHeader && !timeoutMillis) {
      const timeoutSeconds = parseFloat(retryAfterHeader);
      if (!Number.isNaN(timeoutSeconds)) {
        timeoutMillis = timeoutSeconds * 1e3;
      } else {
        timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
      }
    }
    if (timeoutMillis === void 0) {
      const maxRetries = options.maxRetries ?? this.maxRetries;
      timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
    }
    await sleep(timeoutMillis);
    return this.makeRequest(options, retriesRemaining - 1, requestLogID);
  }
  calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
    const initialRetryDelay = 0.5;
    const maxRetryDelay = 8;
    const numRetries = maxRetries - retriesRemaining;
    const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
    const jitter = 1 - Math.random() * 0.25;
    return sleepSeconds * jitter * 1e3;
  }
  async buildRequest(inputOptions, { retryCount = 0 } = {}) {
    const options = { ...inputOptions };
    const { method, path: path2, query: query2, defaultBaseURL } = options;
    const url = this.buildURL(path2, query2, defaultBaseURL);
    if ("timeout" in options)
      validatePositiveInteger("timeout", options.timeout);
    options.timeout = options.timeout ?? this.timeout;
    const { bodyHeaders, body, isStreamingBody } = this.buildBody({ options });
    if (isStreamingBody) {
      inputOptions.__metadata = {
        ...inputOptions.__metadata,
        hasStreamingBody: true
      };
    }
    const reqHeaders = await this.buildHeaders({ options: inputOptions, method, bodyHeaders, retryCount });
    const req = {
      method,
      headers: reqHeaders,
      ...options.signal && { signal: options.signal },
      ...globalThis.ReadableStream && body instanceof globalThis.ReadableStream && { duplex: "half" },
      ...body && { body },
      ...this.fetchOptions ?? {},
      ...options.fetchOptions ?? {}
    };
    return { req, url, timeout: options.timeout };
  }
  async buildHeaders({ options, method, bodyHeaders, retryCount }) {
    let idempotencyHeaders = {};
    if (this.idempotencyHeader && method !== "get") {
      if (!options.idempotencyKey)
        options.idempotencyKey = this.defaultIdempotencyKey();
      idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
    }
    const headers = buildHeaders([
      idempotencyHeaders,
      {
        Accept: "application/json",
        "User-Agent": this.getUserAgent(),
        "X-Stainless-Retry-Count": String(retryCount),
        ...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1e3)) } : {},
        ...getPlatformHeaders(),
        "OpenAI-Organization": this.organization,
        "OpenAI-Project": this.project
      },
      await this.authHeaders(options, options.__security ?? { bearerAuth: true }),
      this._options.defaultHeaders,
      bodyHeaders,
      options.headers
    ]);
    this.validateHeaders(headers, options.__security ?? { bearerAuth: true });
    return headers.values;
  }
  _makeAbort(controller) {
    return () => controller.abort();
  }
  buildBody({ options: { body, headers: rawHeaders } }) {
    if (!body) {
      return { bodyHeaders: void 0, body: void 0, isStreamingBody: false };
    }
    const headers = buildHeaders([rawHeaders]);
    const isReadableStream = typeof globalThis.ReadableStream !== "undefined" && body instanceof globalThis.ReadableStream;
    const isRetryableBody = !isReadableStream && (typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof globalThis.Blob !== "undefined" && body instanceof globalThis.Blob || body instanceof URLSearchParams || body instanceof FormData);
    if (
      // Pass raw type verbatim
      ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof DataView || typeof body === "string" && // Preserve legacy string encoding behavior for now
      headers.values.has("content-type") || // `Blob` is superset of `File`
      globalThis.Blob && body instanceof globalThis.Blob || // `FormData` -> `multipart/form-data`
      body instanceof FormData || // `URLSearchParams` -> `application/x-www-form-urlencoded`
      body instanceof URLSearchParams || // Send chunked stream (each chunk has own `length`)
      isReadableStream
    ) {
      return { bodyHeaders: void 0, body, isStreamingBody: !isRetryableBody };
    } else if (typeof body === "object" && (Symbol.asyncIterator in body || Symbol.iterator in body && "next" in body && typeof body.next === "function")) {
      return {
        bodyHeaders: void 0,
        body: ReadableStreamFrom(body),
        isStreamingBody: true
      };
    } else if (typeof body === "object" && headers.values.get("content-type") === "application/x-www-form-urlencoded") {
      return {
        bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
        body: this.stringifyQuery(body),
        isStreamingBody: false
      };
    } else {
      return { ...__classPrivateFieldGet(this, _OpenAI_encoder, "f").call(this, { body, headers }), isStreamingBody: false };
    }
  }
}
_a = OpenAI, _OpenAI_encoder = /* @__PURE__ */ new WeakMap(), _OpenAI_instances = /* @__PURE__ */ new WeakSet(), _OpenAI_baseURLOverridden = function _OpenAI_baseURLOverridden2() {
  return this.baseURL !== "https://api.openai.com/v1";
};
OpenAI.OpenAI = _a;
OpenAI.DEFAULT_TIMEOUT = 6e5;
OpenAI.OpenAIError = OpenAIError;
OpenAI.APIError = APIError;
OpenAI.APIConnectionError = APIConnectionError;
OpenAI.APIConnectionTimeoutError = APIConnectionTimeoutError;
OpenAI.APIUserAbortError = APIUserAbortError;
OpenAI.NotFoundError = NotFoundError;
OpenAI.ConflictError = ConflictError;
OpenAI.RateLimitError = RateLimitError;
OpenAI.BadRequestError = BadRequestError;
OpenAI.AuthenticationError = AuthenticationError;
OpenAI.InternalServerError = InternalServerError;
OpenAI.PermissionDeniedError = PermissionDeniedError;
OpenAI.UnprocessableEntityError = UnprocessableEntityError;
OpenAI.InvalidWebhookSignatureError = InvalidWebhookSignatureError;
OpenAI.toFile = toFile;
OpenAI.Completions = Completions2;
OpenAI.Chat = Chat;
OpenAI.Embeddings = Embeddings;
OpenAI.Files = Files$1;
OpenAI.Images = Images;
OpenAI.Audio = Audio;
OpenAI.Moderations = Moderations;
OpenAI.Models = Models;
OpenAI.FineTuning = FineTuning;
OpenAI.Graders = Graders2;
OpenAI.VectorStores = VectorStores;
OpenAI.Webhooks = Webhooks;
OpenAI.Beta = Beta;
OpenAI.Batches = Batches;
OpenAI.Uploads = Uploads;
OpenAI.Admin = Admin;
OpenAI.Responses = Responses;
OpenAI.Realtime = Realtime2;
OpenAI.Conversations = Conversations;
OpenAI.Evals = Evals;
OpenAI.Containers = Containers;
OpenAI.Skills = Skills;
OpenAI.Videos = Videos;
class ProviderConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderConfigError";
  }
}
function createOpenAIClient(apiKey, strict = true) {
  if (!apiKey) {
    if (strict) throw new ProviderConfigError("OpenAI API key is not configured");
    return new OpenAI({ apiKey: "not-configured" });
  }
  return new OpenAI({ apiKey });
}
async function testOpenAIKey(apiKey) {
  const start = Date.now();
  try {
    const client = createOpenAIClient(apiKey);
    await client.models.list();
    return { ok: true, error: null, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      error: normalizeOpenAIError(err),
      latency_ms: Date.now() - start
    };
  }
}
function normalizeOpenAIError(err) {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("401") || msg.includes("Incorrect API key")) return "Invalid API key";
    if (msg.includes("429")) return "Rate limit exceeded";
    if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) return "Network error — check your connection";
    return msg;
  }
  return String(err);
}
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
var dist = {};
var pinecone = {};
var control$1 = {};
var indexOperationsBuilder$1 = {};
var db_control = {};
var runtime$d = {};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TextApiResponse = exports.BlobApiResponse = exports.VoidApiResponse = exports.JSONApiResponse = exports.COLLECTION_FORMATS = exports.RequiredError = exports.FetchError = exports.ResponseError = exports.BaseAPI = exports.DefaultConfig = exports.Configuration = exports.BASE_PATH = void 0;
  exports.exists = exists;
  exports.querystring = querystring;
  exports.mapValues = mapValues;
  exports.canConsumeForm = canConsumeForm;
  exports.BASE_PATH = "https://api.pinecone.io".replace(/\/+$/, "");
  class Configuration {
    configuration;
    constructor(configuration = {}) {
      this.configuration = configuration;
    }
    set config(configuration) {
      this.configuration = configuration;
    }
    get basePath() {
      return this.configuration.basePath != null ? this.configuration.basePath : exports.BASE_PATH;
    }
    get fetchApi() {
      return this.configuration.fetchApi;
    }
    get middleware() {
      return this.configuration.middleware || [];
    }
    get queryParamsStringify() {
      return this.configuration.queryParamsStringify || querystring;
    }
    get username() {
      return this.configuration.username;
    }
    get password() {
      return this.configuration.password;
    }
    get apiKey() {
      const apiKey = this.configuration.apiKey;
      if (apiKey) {
        return typeof apiKey === "function" ? apiKey : () => apiKey;
      }
      return void 0;
    }
    get accessToken() {
      const accessToken = this.configuration.accessToken;
      if (accessToken) {
        return typeof accessToken === "function" ? accessToken : async () => accessToken;
      }
      return void 0;
    }
    get headers() {
      return this.configuration.headers;
    }
    get credentials() {
      return this.configuration.credentials;
    }
  }
  exports.Configuration = Configuration;
  exports.DefaultConfig = new Configuration();
  class BaseAPI {
    configuration;
    static jsonRegex = new RegExp("^(:?application/json|[^;/ 	]+/[^;/ 	]+[+]json)[ 	]*(:?;.*)?$", "i");
    middleware;
    constructor(configuration = exports.DefaultConfig) {
      this.configuration = configuration;
      this.middleware = configuration.middleware;
    }
    withMiddleware(...middlewares) {
      const next = this.clone();
      next.middleware = next.middleware.concat(...middlewares);
      return next;
    }
    withPreMiddleware(...preMiddlewares) {
      const middlewares = preMiddlewares.map((pre) => ({ pre }));
      return this.withMiddleware(...middlewares);
    }
    withPostMiddleware(...postMiddlewares) {
      const middlewares = postMiddlewares.map((post) => ({ post }));
      return this.withMiddleware(...middlewares);
    }
    /**
     * Check if the given MIME is a JSON MIME.
     * JSON MIME examples:
     *   application/json
     *   application/json; charset=UTF8
     *   APPLICATION/JSON
     *   application/vnd.company+json
     * @param mime - MIME (Multipurpose Internet Mail Extensions)
     * @return True if the given MIME is JSON, false otherwise.
     */
    isJsonMime(mime) {
      if (!mime) {
        return false;
      }
      return BaseAPI.jsonRegex.test(mime);
    }
    async request(context2, initOverrides) {
      const { url, init } = await this.createFetchParams(context2, initOverrides);
      const response = await this.fetchApi(url, init);
      if (response && (response.status >= 200 && response.status < 300)) {
        return response;
      }
      throw new ResponseError(response, "Response returned an error code");
    }
    async createFetchParams(context2, initOverrides) {
      let url = this.configuration.basePath + context2.path;
      if (context2.query !== void 0 && Object.keys(context2.query).length !== 0) {
        url += "?" + this.configuration.queryParamsStringify(context2.query);
      }
      const headers = Object.assign({}, this.configuration.headers, context2.headers);
      Object.keys(headers).forEach((key) => headers[key] === void 0 ? delete headers[key] : {});
      const initOverrideFn = typeof initOverrides === "function" ? initOverrides : async () => initOverrides;
      const initParams = {
        method: context2.method,
        headers,
        body: context2.body,
        credentials: this.configuration.credentials
      };
      const overriddenInit = {
        ...initParams,
        ...await initOverrideFn({
          init: initParams,
          context: context2
        })
      };
      let body;
      if (isFormData(overriddenInit.body) || overriddenInit.body instanceof URLSearchParams || isBlob(overriddenInit.body)) {
        body = overriddenInit.body;
      } else if (this.isJsonMime(headers["Content-Type"])) {
        body = JSON.stringify(overriddenInit.body);
      } else {
        body = overriddenInit.body;
      }
      const init = {
        ...overriddenInit,
        body
      };
      return { url, init };
    }
    fetchApi = async (url, init) => {
      let fetchParams = { url, init };
      for (const middleware2 of this.middleware) {
        if (middleware2.pre) {
          fetchParams = await middleware2.pre({
            fetch: this.fetchApi,
            ...fetchParams
          }) || fetchParams;
        }
      }
      let response = void 0;
      try {
        response = await (this.configuration.fetchApi || fetch)(fetchParams.url, fetchParams.init);
      } catch (e) {
        for (const middleware2 of this.middleware) {
          if (middleware2.onError) {
            response = await middleware2.onError({
              fetch: this.fetchApi,
              url: fetchParams.url,
              init: fetchParams.init,
              error: e,
              response: response ? response.clone() : void 0
            }) || response;
          }
        }
        if (response === void 0) {
          if (e instanceof Error) {
            throw new FetchError(e, "The request failed and the interceptors did not return an alternative response");
          } else {
            throw e;
          }
        }
      }
      for (const middleware2 of this.middleware) {
        if (middleware2.post) {
          response = await middleware2.post({
            fetch: this.fetchApi,
            url: fetchParams.url,
            init: fetchParams.init,
            response: response.clone()
          }) || response;
        }
      }
      return response;
    };
    /**
     * Create a shallow clone of `this` by constructing a new instance
     * and then shallow cloning data members.
     */
    clone() {
      const constructor = this.constructor;
      const next = new constructor(this.configuration);
      next.middleware = this.middleware.slice();
      return next;
    }
  }
  exports.BaseAPI = BaseAPI;
  function isBlob(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  class ResponseError extends Error {
    response;
    name = "ResponseError";
    constructor(response, msg) {
      super(msg);
      this.response = response;
    }
  }
  exports.ResponseError = ResponseError;
  class FetchError extends Error {
    cause;
    name = "FetchError";
    constructor(cause, msg) {
      super(msg);
      this.cause = cause;
    }
  }
  exports.FetchError = FetchError;
  class RequiredError extends Error {
    field;
    name = "RequiredError";
    constructor(field, msg) {
      super(msg);
      this.field = field;
    }
  }
  exports.RequiredError = RequiredError;
  exports.COLLECTION_FORMATS = {
    csv: ",",
    ssv: " ",
    tsv: "	",
    pipes: "|"
  };
  function exists(json, key) {
    const value = json[key];
    return value !== null && value !== void 0;
  }
  function querystring(params, prefix = "") {
    return Object.keys(params).map((key) => querystringSingleKey2(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
  }
  function querystringSingleKey2(key, value, keyPrefix = "") {
    const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
    if (value instanceof Array) {
      const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
      return `${encodeURIComponent(fullKey)}=${multiValue}`;
    }
    if (value instanceof Set) {
      const valueAsArray = Array.from(value);
      return querystringSingleKey2(key, valueAsArray, keyPrefix);
    }
    if (value instanceof Date) {
      return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
    }
    if (value instanceof Object) {
      return querystring(value, fullKey);
    }
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
  }
  function mapValues(data2, fn) {
    return Object.keys(data2).reduce((acc, key) => ({ ...acc, [key]: fn(data2[key]) }), {});
  }
  function canConsumeForm(consumes) {
    for (const consume of consumes) {
      if ("multipart/form-data" === consume.contentType) {
        return true;
      }
    }
    return false;
  }
  class JSONApiResponse {
    raw;
    transformer;
    constructor(raw, transformer = (jsonValue) => jsonValue) {
      this.raw = raw;
      this.transformer = transformer;
    }
    async value() {
      return this.transformer(await this.raw.json());
    }
  }
  exports.JSONApiResponse = JSONApiResponse;
  class VoidApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return void 0;
    }
  }
  exports.VoidApiResponse = VoidApiResponse;
  class BlobApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.blob();
    }
  }
  exports.BlobApiResponse = BlobApiResponse;
  class TextApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.text();
    }
  }
  exports.TextApiResponse = TextApiResponse;
})(runtime$d);
var apis$5 = {};
var ManageIndexesApi$1 = {};
var models$5 = {};
var BYOC = {};
var ByocSpecResponse = {};
var MetadataSchema = {};
var MetadataSchemaFieldsValue = {};
Object.defineProperty(MetadataSchemaFieldsValue, "__esModule", { value: true });
MetadataSchemaFieldsValue.instanceOfMetadataSchemaFieldsValue = instanceOfMetadataSchemaFieldsValue;
MetadataSchemaFieldsValue.MetadataSchemaFieldsValueFromJSON = MetadataSchemaFieldsValueFromJSON;
MetadataSchemaFieldsValue.MetadataSchemaFieldsValueFromJSONTyped = MetadataSchemaFieldsValueFromJSONTyped;
MetadataSchemaFieldsValue.MetadataSchemaFieldsValueToJSON = MetadataSchemaFieldsValueToJSON;
const runtime_1$1G = runtime$d;
function instanceOfMetadataSchemaFieldsValue(value) {
  let isInstance = true;
  return isInstance;
}
function MetadataSchemaFieldsValueFromJSON(json) {
  return MetadataSchemaFieldsValueFromJSONTyped(json);
}
function MetadataSchemaFieldsValueFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "filterable": !(0, runtime_1$1G.exists)(json, "filterable") ? void 0 : json["filterable"]
  };
}
function MetadataSchemaFieldsValueToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "filterable": value.filterable
  };
}
Object.defineProperty(MetadataSchema, "__esModule", { value: true });
MetadataSchema.instanceOfMetadataSchema = instanceOfMetadataSchema;
MetadataSchema.MetadataSchemaFromJSON = MetadataSchemaFromJSON;
MetadataSchema.MetadataSchemaFromJSONTyped = MetadataSchemaFromJSONTyped;
MetadataSchema.MetadataSchemaToJSON = MetadataSchemaToJSON;
const runtime_1$1F = runtime$d;
const MetadataSchemaFieldsValue_1 = MetadataSchemaFieldsValue;
function instanceOfMetadataSchema(value) {
  let isInstance = true;
  isInstance = isInstance && "fields" in value;
  return isInstance;
}
function MetadataSchemaFromJSON(json) {
  return MetadataSchemaFromJSONTyped(json);
}
function MetadataSchemaFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "fields": (0, runtime_1$1F.mapValues)(json["fields"], MetadataSchemaFieldsValue_1.MetadataSchemaFieldsValueFromJSON)
  };
}
function MetadataSchemaToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "fields": (0, runtime_1$1F.mapValues)(value.fields, MetadataSchemaFieldsValue_1.MetadataSchemaFieldsValueToJSON)
  };
}
var ReadCapacityResponse = {};
var ReadCapacityDedicatedSpecResponse = {};
var ReadCapacityDedicatedConfig = {};
var ScalingConfigManual = {};
Object.defineProperty(ScalingConfigManual, "__esModule", { value: true });
ScalingConfigManual.instanceOfScalingConfigManual = instanceOfScalingConfigManual;
ScalingConfigManual.ScalingConfigManualFromJSON = ScalingConfigManualFromJSON;
ScalingConfigManual.ScalingConfigManualFromJSONTyped = ScalingConfigManualFromJSONTyped;
ScalingConfigManual.ScalingConfigManualToJSON = ScalingConfigManualToJSON;
const runtime_1$1E = runtime$d;
function instanceOfScalingConfigManual(value) {
  let isInstance = true;
  return isInstance;
}
function ScalingConfigManualFromJSON(json) {
  return ScalingConfigManualFromJSONTyped(json);
}
function ScalingConfigManualFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "replicas": !(0, runtime_1$1E.exists)(json, "replicas") ? void 0 : json["replicas"],
    "shards": !(0, runtime_1$1E.exists)(json, "shards") ? void 0 : json["shards"]
  };
}
function ScalingConfigManualToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "replicas": value.replicas,
    "shards": value.shards
  };
}
Object.defineProperty(ReadCapacityDedicatedConfig, "__esModule", { value: true });
ReadCapacityDedicatedConfig.instanceOfReadCapacityDedicatedConfig = instanceOfReadCapacityDedicatedConfig;
ReadCapacityDedicatedConfig.ReadCapacityDedicatedConfigFromJSON = ReadCapacityDedicatedConfigFromJSON;
ReadCapacityDedicatedConfig.ReadCapacityDedicatedConfigFromJSONTyped = ReadCapacityDedicatedConfigFromJSONTyped;
ReadCapacityDedicatedConfig.ReadCapacityDedicatedConfigToJSON = ReadCapacityDedicatedConfigToJSON;
const runtime_1$1D = runtime$d;
const ScalingConfigManual_1 = ScalingConfigManual;
function instanceOfReadCapacityDedicatedConfig(value) {
  let isInstance = true;
  return isInstance;
}
function ReadCapacityDedicatedConfigFromJSON(json) {
  return ReadCapacityDedicatedConfigFromJSONTyped(json);
}
function ReadCapacityDedicatedConfigFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "nodeType": !(0, runtime_1$1D.exists)(json, "node_type") ? void 0 : json["node_type"],
    "scaling": !(0, runtime_1$1D.exists)(json, "scaling") ? void 0 : json["scaling"],
    "manual": !(0, runtime_1$1D.exists)(json, "manual") ? void 0 : (0, ScalingConfigManual_1.ScalingConfigManualFromJSON)(json["manual"])
  };
}
function ReadCapacityDedicatedConfigToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "node_type": value.nodeType,
    "scaling": value.scaling,
    "manual": (0, ScalingConfigManual_1.ScalingConfigManualToJSON)(value.manual)
  };
}
var ReadCapacityStatus = {};
Object.defineProperty(ReadCapacityStatus, "__esModule", { value: true });
ReadCapacityStatus.instanceOfReadCapacityStatus = instanceOfReadCapacityStatus;
ReadCapacityStatus.ReadCapacityStatusFromJSON = ReadCapacityStatusFromJSON;
ReadCapacityStatus.ReadCapacityStatusFromJSONTyped = ReadCapacityStatusFromJSONTyped;
ReadCapacityStatus.ReadCapacityStatusToJSON = ReadCapacityStatusToJSON;
const runtime_1$1C = runtime$d;
function instanceOfReadCapacityStatus(value) {
  let isInstance = true;
  isInstance = isInstance && "state" in value;
  return isInstance;
}
function ReadCapacityStatusFromJSON(json) {
  return ReadCapacityStatusFromJSONTyped(json);
}
function ReadCapacityStatusFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "state": json["state"],
    "currentReplicas": !(0, runtime_1$1C.exists)(json, "current_replicas") ? void 0 : json["current_replicas"],
    "currentShards": !(0, runtime_1$1C.exists)(json, "current_shards") ? void 0 : json["current_shards"],
    "errorMessage": !(0, runtime_1$1C.exists)(json, "error_message") ? void 0 : json["error_message"]
  };
}
function ReadCapacityStatusToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "state": value.state,
    "current_replicas": value.currentReplicas,
    "current_shards": value.currentShards,
    "error_message": value.errorMessage
  };
}
Object.defineProperty(ReadCapacityDedicatedSpecResponse, "__esModule", { value: true });
ReadCapacityDedicatedSpecResponse.instanceOfReadCapacityDedicatedSpecResponse = instanceOfReadCapacityDedicatedSpecResponse;
ReadCapacityDedicatedSpecResponse.ReadCapacityDedicatedSpecResponseFromJSON = ReadCapacityDedicatedSpecResponseFromJSON;
ReadCapacityDedicatedSpecResponse.ReadCapacityDedicatedSpecResponseFromJSONTyped = ReadCapacityDedicatedSpecResponseFromJSONTyped;
ReadCapacityDedicatedSpecResponse.ReadCapacityDedicatedSpecResponseToJSON = ReadCapacityDedicatedSpecResponseToJSON;
const ReadCapacityDedicatedConfig_1$1 = ReadCapacityDedicatedConfig;
const ReadCapacityStatus_1$1 = ReadCapacityStatus;
function instanceOfReadCapacityDedicatedSpecResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "mode" in value;
  isInstance = isInstance && "dedicated" in value;
  isInstance = isInstance && "status" in value;
  return isInstance;
}
function ReadCapacityDedicatedSpecResponseFromJSON(json) {
  return ReadCapacityDedicatedSpecResponseFromJSONTyped(json);
}
function ReadCapacityDedicatedSpecResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "mode": json["mode"],
    "dedicated": (0, ReadCapacityDedicatedConfig_1$1.ReadCapacityDedicatedConfigFromJSON)(json["dedicated"]),
    "status": (0, ReadCapacityStatus_1$1.ReadCapacityStatusFromJSON)(json["status"])
  };
}
function ReadCapacityDedicatedSpecResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "mode": value.mode,
    "dedicated": (0, ReadCapacityDedicatedConfig_1$1.ReadCapacityDedicatedConfigToJSON)(value.dedicated),
    "status": (0, ReadCapacityStatus_1$1.ReadCapacityStatusToJSON)(value.status)
  };
}
var ReadCapacityOnDemandSpecResponse = {};
Object.defineProperty(ReadCapacityOnDemandSpecResponse, "__esModule", { value: true });
ReadCapacityOnDemandSpecResponse.instanceOfReadCapacityOnDemandSpecResponse = instanceOfReadCapacityOnDemandSpecResponse;
ReadCapacityOnDemandSpecResponse.ReadCapacityOnDemandSpecResponseFromJSON = ReadCapacityOnDemandSpecResponseFromJSON;
ReadCapacityOnDemandSpecResponse.ReadCapacityOnDemandSpecResponseFromJSONTyped = ReadCapacityOnDemandSpecResponseFromJSONTyped;
ReadCapacityOnDemandSpecResponse.ReadCapacityOnDemandSpecResponseToJSON = ReadCapacityOnDemandSpecResponseToJSON;
const ReadCapacityStatus_1 = ReadCapacityStatus;
function instanceOfReadCapacityOnDemandSpecResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "mode" in value;
  isInstance = isInstance && "status" in value;
  return isInstance;
}
function ReadCapacityOnDemandSpecResponseFromJSON(json) {
  return ReadCapacityOnDemandSpecResponseFromJSONTyped(json);
}
function ReadCapacityOnDemandSpecResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "mode": json["mode"],
    "status": (0, ReadCapacityStatus_1.ReadCapacityStatusFromJSON)(json["status"])
  };
}
function ReadCapacityOnDemandSpecResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "mode": value.mode,
    "status": (0, ReadCapacityStatus_1.ReadCapacityStatusToJSON)(value.status)
  };
}
Object.defineProperty(ReadCapacityResponse, "__esModule", { value: true });
ReadCapacityResponse.ReadCapacityResponseFromJSON = ReadCapacityResponseFromJSON;
ReadCapacityResponse.ReadCapacityResponseFromJSONTyped = ReadCapacityResponseFromJSONTyped;
ReadCapacityResponse.ReadCapacityResponseToJSON = ReadCapacityResponseToJSON;
const ReadCapacityDedicatedSpecResponse_1 = ReadCapacityDedicatedSpecResponse;
const ReadCapacityOnDemandSpecResponse_1 = ReadCapacityOnDemandSpecResponse;
function ReadCapacityResponseFromJSON(json) {
  return ReadCapacityResponseFromJSONTyped(json);
}
function ReadCapacityResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  switch (json["mode"]) {
    case "Dedicated":
      return { ...(0, ReadCapacityDedicatedSpecResponse_1.ReadCapacityDedicatedSpecResponseFromJSONTyped)(json, true), mode: "Dedicated" };
    case "OnDemand":
      return { ...(0, ReadCapacityOnDemandSpecResponse_1.ReadCapacityOnDemandSpecResponseFromJSONTyped)(json, true), mode: "OnDemand" };
    default:
      throw new Error(`No variant of ReadCapacityResponse exists with 'mode=${json["mode"]}'`);
  }
}
function ReadCapacityResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  switch (value["mode"]) {
    case "Dedicated":
      return (0, ReadCapacityDedicatedSpecResponse_1.ReadCapacityDedicatedSpecResponseToJSON)(value);
    case "OnDemand":
      return (0, ReadCapacityOnDemandSpecResponse_1.ReadCapacityOnDemandSpecResponseToJSON)(value);
    default:
      throw new Error(`No variant of ReadCapacityResponse exists with 'mode=${value["mode"]}'`);
  }
}
Object.defineProperty(ByocSpecResponse, "__esModule", { value: true });
ByocSpecResponse.instanceOfByocSpecResponse = instanceOfByocSpecResponse;
ByocSpecResponse.ByocSpecResponseFromJSON = ByocSpecResponseFromJSON;
ByocSpecResponse.ByocSpecResponseFromJSONTyped = ByocSpecResponseFromJSONTyped;
ByocSpecResponse.ByocSpecResponseToJSON = ByocSpecResponseToJSON;
const runtime_1$1B = runtime$d;
const MetadataSchema_1$5 = MetadataSchema;
const ReadCapacityResponse_1$1 = ReadCapacityResponse;
function instanceOfByocSpecResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "environment" in value;
  isInstance = isInstance && "readCapacity" in value;
  return isInstance;
}
function ByocSpecResponseFromJSON(json) {
  return ByocSpecResponseFromJSONTyped(json);
}
function ByocSpecResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "environment": json["environment"],
    "readCapacity": (0, ReadCapacityResponse_1$1.ReadCapacityResponseFromJSON)(json["read_capacity"]),
    "schema": !(0, runtime_1$1B.exists)(json, "schema") ? void 0 : (0, MetadataSchema_1$5.MetadataSchemaFromJSON)(json["schema"])
  };
}
function ByocSpecResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "environment": value.environment,
    "read_capacity": (0, ReadCapacityResponse_1$1.ReadCapacityResponseToJSON)(value.readCapacity),
    "schema": (0, MetadataSchema_1$5.MetadataSchemaToJSON)(value.schema)
  };
}
Object.defineProperty(BYOC, "__esModule", { value: true });
BYOC.instanceOfBYOC = instanceOfBYOC;
BYOC.BYOCFromJSON = BYOCFromJSON;
BYOC.BYOCFromJSONTyped = BYOCFromJSONTyped;
BYOC.BYOCToJSON = BYOCToJSON;
const ByocSpecResponse_1 = ByocSpecResponse;
function instanceOfBYOC(value) {
  let isInstance = true;
  isInstance = isInstance && "byoc" in value;
  return isInstance;
}
function BYOCFromJSON(json) {
  return BYOCFromJSONTyped(json);
}
function BYOCFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "byoc": (0, ByocSpecResponse_1.ByocSpecResponseFromJSON)(json["byoc"])
  };
}
function BYOCToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "byoc": (0, ByocSpecResponse_1.ByocSpecResponseToJSON)(value.byoc)
  };
}
var BYOC1 = {};
var BYOC1Byoc = {};
var ReadCapacity = {};
var ReadCapacityDedicatedSpec = {};
Object.defineProperty(ReadCapacityDedicatedSpec, "__esModule", { value: true });
ReadCapacityDedicatedSpec.instanceOfReadCapacityDedicatedSpec = instanceOfReadCapacityDedicatedSpec;
ReadCapacityDedicatedSpec.ReadCapacityDedicatedSpecFromJSON = ReadCapacityDedicatedSpecFromJSON;
ReadCapacityDedicatedSpec.ReadCapacityDedicatedSpecFromJSONTyped = ReadCapacityDedicatedSpecFromJSONTyped;
ReadCapacityDedicatedSpec.ReadCapacityDedicatedSpecToJSON = ReadCapacityDedicatedSpecToJSON;
const ReadCapacityDedicatedConfig_1 = ReadCapacityDedicatedConfig;
function instanceOfReadCapacityDedicatedSpec(value) {
  let isInstance = true;
  isInstance = isInstance && "mode" in value;
  isInstance = isInstance && "dedicated" in value;
  return isInstance;
}
function ReadCapacityDedicatedSpecFromJSON(json) {
  return ReadCapacityDedicatedSpecFromJSONTyped(json);
}
function ReadCapacityDedicatedSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    ...json,
    "mode": json["mode"],
    "dedicated": (0, ReadCapacityDedicatedConfig_1.ReadCapacityDedicatedConfigFromJSON)(json["dedicated"])
  };
}
function ReadCapacityDedicatedSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    ...value,
    "mode": value.mode,
    "dedicated": (0, ReadCapacityDedicatedConfig_1.ReadCapacityDedicatedConfigToJSON)(value.dedicated)
  };
}
var ReadCapacityOnDemandSpec = {};
Object.defineProperty(ReadCapacityOnDemandSpec, "__esModule", { value: true });
ReadCapacityOnDemandSpec.instanceOfReadCapacityOnDemandSpec = instanceOfReadCapacityOnDemandSpec;
ReadCapacityOnDemandSpec.ReadCapacityOnDemandSpecFromJSON = ReadCapacityOnDemandSpecFromJSON;
ReadCapacityOnDemandSpec.ReadCapacityOnDemandSpecFromJSONTyped = ReadCapacityOnDemandSpecFromJSONTyped;
ReadCapacityOnDemandSpec.ReadCapacityOnDemandSpecToJSON = ReadCapacityOnDemandSpecToJSON;
function instanceOfReadCapacityOnDemandSpec(value) {
  let isInstance = true;
  isInstance = isInstance && "mode" in value;
  return isInstance;
}
function ReadCapacityOnDemandSpecFromJSON(json) {
  return ReadCapacityOnDemandSpecFromJSONTyped(json);
}
function ReadCapacityOnDemandSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "mode": json["mode"]
  };
}
function ReadCapacityOnDemandSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "mode": value.mode
  };
}
Object.defineProperty(ReadCapacity, "__esModule", { value: true });
ReadCapacity.ReadCapacityFromJSON = ReadCapacityFromJSON;
ReadCapacity.ReadCapacityFromJSONTyped = ReadCapacityFromJSONTyped;
ReadCapacity.ReadCapacityToJSON = ReadCapacityToJSON;
const ReadCapacityDedicatedSpec_1 = ReadCapacityDedicatedSpec;
const ReadCapacityOnDemandSpec_1 = ReadCapacityOnDemandSpec;
function ReadCapacityFromJSON(json) {
  return ReadCapacityFromJSONTyped(json);
}
function ReadCapacityFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  switch (json["mode"]) {
    case "Dedicated":
      return { ...(0, ReadCapacityDedicatedSpec_1.ReadCapacityDedicatedSpecFromJSONTyped)(json, true), mode: "Dedicated" };
    case "OnDemand":
      return { ...(0, ReadCapacityOnDemandSpec_1.ReadCapacityOnDemandSpecFromJSONTyped)(json, true), mode: "OnDemand" };
    default:
      throw new Error(`No variant of ReadCapacity exists with 'mode=${json["mode"]}'`);
  }
}
function ReadCapacityToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  switch (value["mode"]) {
    case "Dedicated":
      return (0, ReadCapacityDedicatedSpec_1.ReadCapacityDedicatedSpecToJSON)(value);
    case "OnDemand":
      return (0, ReadCapacityOnDemandSpec_1.ReadCapacityOnDemandSpecToJSON)(value);
    default:
      throw new Error(`No variant of ReadCapacity exists with 'mode=${value["mode"]}'`);
  }
}
Object.defineProperty(BYOC1Byoc, "__esModule", { value: true });
BYOC1Byoc.instanceOfBYOC1Byoc = instanceOfBYOC1Byoc;
BYOC1Byoc.BYOC1ByocFromJSON = BYOC1ByocFromJSON;
BYOC1Byoc.BYOC1ByocFromJSONTyped = BYOC1ByocFromJSONTyped;
BYOC1Byoc.BYOC1ByocToJSON = BYOC1ByocToJSON;
const runtime_1$1A = runtime$d;
const ReadCapacity_1$4 = ReadCapacity;
function instanceOfBYOC1Byoc(value) {
  let isInstance = true;
  return isInstance;
}
function BYOC1ByocFromJSON(json) {
  return BYOC1ByocFromJSONTyped(json);
}
function BYOC1ByocFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "readCapacity": !(0, runtime_1$1A.exists)(json, "read_capacity") ? void 0 : (0, ReadCapacity_1$4.ReadCapacityFromJSON)(json["read_capacity"])
  };
}
function BYOC1ByocToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "read_capacity": (0, ReadCapacity_1$4.ReadCapacityToJSON)(value.readCapacity)
  };
}
Object.defineProperty(BYOC1, "__esModule", { value: true });
BYOC1.instanceOfBYOC1 = instanceOfBYOC1;
BYOC1.BYOC1FromJSON = BYOC1FromJSON;
BYOC1.BYOC1FromJSONTyped = BYOC1FromJSONTyped;
BYOC1.BYOC1ToJSON = BYOC1ToJSON;
const BYOC1Byoc_1 = BYOC1Byoc;
function instanceOfBYOC1(value) {
  let isInstance = true;
  isInstance = isInstance && "byoc" in value;
  return isInstance;
}
function BYOC1FromJSON(json) {
  return BYOC1FromJSONTyped(json);
}
function BYOC1FromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "byoc": (0, BYOC1Byoc_1.BYOC1ByocFromJSON)(json["byoc"])
  };
}
function BYOC1ToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "byoc": (0, BYOC1Byoc_1.BYOC1ByocToJSON)(value.byoc)
  };
}
var BYOC2 = {};
var ByocSpec = {};
Object.defineProperty(ByocSpec, "__esModule", { value: true });
ByocSpec.instanceOfByocSpec = instanceOfByocSpec;
ByocSpec.ByocSpecFromJSON = ByocSpecFromJSON;
ByocSpec.ByocSpecFromJSONTyped = ByocSpecFromJSONTyped;
ByocSpec.ByocSpecToJSON = ByocSpecToJSON;
const runtime_1$1z = runtime$d;
const MetadataSchema_1$4 = MetadataSchema;
const ReadCapacity_1$3 = ReadCapacity;
function instanceOfByocSpec(value) {
  let isInstance = true;
  isInstance = isInstance && "environment" in value;
  return isInstance;
}
function ByocSpecFromJSON(json) {
  return ByocSpecFromJSONTyped(json);
}
function ByocSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "environment": json["environment"],
    "readCapacity": !(0, runtime_1$1z.exists)(json, "read_capacity") ? void 0 : (0, ReadCapacity_1$3.ReadCapacityFromJSON)(json["read_capacity"]),
    "schema": !(0, runtime_1$1z.exists)(json, "schema") ? void 0 : (0, MetadataSchema_1$4.MetadataSchemaFromJSON)(json["schema"])
  };
}
function ByocSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "environment": value.environment,
    "read_capacity": (0, ReadCapacity_1$3.ReadCapacityToJSON)(value.readCapacity),
    "schema": (0, MetadataSchema_1$4.MetadataSchemaToJSON)(value.schema)
  };
}
Object.defineProperty(BYOC2, "__esModule", { value: true });
BYOC2.instanceOfBYOC2 = instanceOfBYOC2;
BYOC2.BYOC2FromJSON = BYOC2FromJSON;
BYOC2.BYOC2FromJSONTyped = BYOC2FromJSONTyped;
BYOC2.BYOC2ToJSON = BYOC2ToJSON;
const ByocSpec_1 = ByocSpec;
function instanceOfBYOC2(value) {
  let isInstance = true;
  isInstance = isInstance && "byoc" in value;
  return isInstance;
}
function BYOC2FromJSON(json) {
  return BYOC2FromJSONTyped(json);
}
function BYOC2FromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "byoc": (0, ByocSpec_1.ByocSpecFromJSON)(json["byoc"])
  };
}
function BYOC2ToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "byoc": (0, ByocSpec_1.ByocSpecToJSON)(value.byoc)
  };
}
var BackupList = {};
var BackupModel = {};
Object.defineProperty(BackupModel, "__esModule", { value: true });
BackupModel.instanceOfBackupModel = instanceOfBackupModel;
BackupModel.BackupModelFromJSON = BackupModelFromJSON;
BackupModel.BackupModelFromJSONTyped = BackupModelFromJSONTyped;
BackupModel.BackupModelToJSON = BackupModelToJSON;
const runtime_1$1y = runtime$d;
const MetadataSchema_1$3 = MetadataSchema;
function instanceOfBackupModel(value) {
  let isInstance = true;
  isInstance = isInstance && "backupId" in value;
  isInstance = isInstance && "sourceIndexName" in value;
  isInstance = isInstance && "sourceIndexId" in value;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "cloud" in value;
  isInstance = isInstance && "region" in value;
  return isInstance;
}
function BackupModelFromJSON(json) {
  return BackupModelFromJSONTyped(json);
}
function BackupModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "backupId": json["backup_id"],
    "sourceIndexName": json["source_index_name"],
    "sourceIndexId": json["source_index_id"],
    "name": !(0, runtime_1$1y.exists)(json, "name") ? void 0 : json["name"],
    "description": !(0, runtime_1$1y.exists)(json, "description") ? void 0 : json["description"],
    "status": json["status"],
    "cloud": json["cloud"],
    "region": json["region"],
    "dimension": !(0, runtime_1$1y.exists)(json, "dimension") ? void 0 : json["dimension"],
    "metric": !(0, runtime_1$1y.exists)(json, "metric") ? void 0 : json["metric"],
    "schema": !(0, runtime_1$1y.exists)(json, "schema") ? void 0 : (0, MetadataSchema_1$3.MetadataSchemaFromJSON)(json["schema"]),
    "recordCount": !(0, runtime_1$1y.exists)(json, "record_count") ? void 0 : json["record_count"],
    "namespaceCount": !(0, runtime_1$1y.exists)(json, "namespace_count") ? void 0 : json["namespace_count"],
    "sizeBytes": !(0, runtime_1$1y.exists)(json, "size_bytes") ? void 0 : json["size_bytes"],
    "tags": !(0, runtime_1$1y.exists)(json, "tags") ? void 0 : json["tags"],
    "createdAt": !(0, runtime_1$1y.exists)(json, "created_at") ? void 0 : json["created_at"]
  };
}
function BackupModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "backup_id": value.backupId,
    "source_index_name": value.sourceIndexName,
    "source_index_id": value.sourceIndexId,
    "name": value.name,
    "description": value.description,
    "status": value.status,
    "cloud": value.cloud,
    "region": value.region,
    "dimension": value.dimension,
    "metric": value.metric,
    "schema": (0, MetadataSchema_1$3.MetadataSchemaToJSON)(value.schema),
    "record_count": value.recordCount,
    "namespace_count": value.namespaceCount,
    "size_bytes": value.sizeBytes,
    "tags": value.tags,
    "created_at": value.createdAt
  };
}
var PaginationResponse = {};
Object.defineProperty(PaginationResponse, "__esModule", { value: true });
PaginationResponse.instanceOfPaginationResponse = instanceOfPaginationResponse;
PaginationResponse.PaginationResponseFromJSON = PaginationResponseFromJSON;
PaginationResponse.PaginationResponseFromJSONTyped = PaginationResponseFromJSONTyped;
PaginationResponse.PaginationResponseToJSON = PaginationResponseToJSON;
function instanceOfPaginationResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "next" in value;
  return isInstance;
}
function PaginationResponseFromJSON(json) {
  return PaginationResponseFromJSONTyped(json);
}
function PaginationResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "next": json["next"]
  };
}
function PaginationResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "next": value.next
  };
}
Object.defineProperty(BackupList, "__esModule", { value: true });
BackupList.instanceOfBackupList = instanceOfBackupList;
BackupList.BackupListFromJSON = BackupListFromJSON;
BackupList.BackupListFromJSONTyped = BackupListFromJSONTyped;
BackupList.BackupListToJSON = BackupListToJSON;
const runtime_1$1x = runtime$d;
const BackupModel_1 = BackupModel;
const PaginationResponse_1$1 = PaginationResponse;
function instanceOfBackupList(value) {
  let isInstance = true;
  return isInstance;
}
function BackupListFromJSON(json) {
  return BackupListFromJSONTyped(json);
}
function BackupListFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "data": !(0, runtime_1$1x.exists)(json, "data") ? void 0 : json["data"].map(BackupModel_1.BackupModelFromJSON),
    "pagination": !(0, runtime_1$1x.exists)(json, "pagination") ? void 0 : (0, PaginationResponse_1$1.PaginationResponseFromJSON)(json["pagination"])
  };
}
function BackupListToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "data": value.data === void 0 ? void 0 : value.data.map(BackupModel_1.BackupModelToJSON),
    "pagination": (0, PaginationResponse_1$1.PaginationResponseToJSON)(value.pagination)
  };
}
var CollectionList = {};
var CollectionModel = {};
Object.defineProperty(CollectionModel, "__esModule", { value: true });
CollectionModel.instanceOfCollectionModel = instanceOfCollectionModel;
CollectionModel.CollectionModelFromJSON = CollectionModelFromJSON;
CollectionModel.CollectionModelFromJSONTyped = CollectionModelFromJSONTyped;
CollectionModel.CollectionModelToJSON = CollectionModelToJSON;
const runtime_1$1w = runtime$d;
function instanceOfCollectionModel(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "environment" in value;
  return isInstance;
}
function CollectionModelFromJSON(json) {
  return CollectionModelFromJSONTyped(json);
}
function CollectionModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "size": !(0, runtime_1$1w.exists)(json, "size") ? void 0 : json["size"],
    "status": json["status"],
    "dimension": !(0, runtime_1$1w.exists)(json, "dimension") ? void 0 : json["dimension"],
    "vectorCount": !(0, runtime_1$1w.exists)(json, "vector_count") ? void 0 : json["vector_count"],
    "environment": json["environment"]
  };
}
function CollectionModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "size": value.size,
    "status": value.status,
    "dimension": value.dimension,
    "vector_count": value.vectorCount,
    "environment": value.environment
  };
}
Object.defineProperty(CollectionList, "__esModule", { value: true });
CollectionList.instanceOfCollectionList = instanceOfCollectionList;
CollectionList.CollectionListFromJSON = CollectionListFromJSON;
CollectionList.CollectionListFromJSONTyped = CollectionListFromJSONTyped;
CollectionList.CollectionListToJSON = CollectionListToJSON;
const runtime_1$1v = runtime$d;
const CollectionModel_1 = CollectionModel;
function instanceOfCollectionList(value) {
  let isInstance = true;
  return isInstance;
}
function CollectionListFromJSON(json) {
  return CollectionListFromJSONTyped(json);
}
function CollectionListFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "collections": !(0, runtime_1$1v.exists)(json, "collections") ? void 0 : json["collections"].map(CollectionModel_1.CollectionModelFromJSON)
  };
}
function CollectionListToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "collections": value.collections === void 0 ? void 0 : value.collections.map(CollectionModel_1.CollectionModelToJSON)
  };
}
var ConfigureIndexRequest = {};
var ConfigureIndexRequestEmbed = {};
Object.defineProperty(ConfigureIndexRequestEmbed, "__esModule", { value: true });
ConfigureIndexRequestEmbed.instanceOfConfigureIndexRequestEmbed = instanceOfConfigureIndexRequestEmbed;
ConfigureIndexRequestEmbed.ConfigureIndexRequestEmbedFromJSON = ConfigureIndexRequestEmbedFromJSON;
ConfigureIndexRequestEmbed.ConfigureIndexRequestEmbedFromJSONTyped = ConfigureIndexRequestEmbedFromJSONTyped;
ConfigureIndexRequestEmbed.ConfigureIndexRequestEmbedToJSON = ConfigureIndexRequestEmbedToJSON;
const runtime_1$1u = runtime$d;
function instanceOfConfigureIndexRequestEmbed(value) {
  let isInstance = true;
  return isInstance;
}
function ConfigureIndexRequestEmbedFromJSON(json) {
  return ConfigureIndexRequestEmbedFromJSONTyped(json);
}
function ConfigureIndexRequestEmbedFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": !(0, runtime_1$1u.exists)(json, "model") ? void 0 : json["model"],
    "fieldMap": !(0, runtime_1$1u.exists)(json, "field_map") ? void 0 : json["field_map"],
    "readParameters": !(0, runtime_1$1u.exists)(json, "read_parameters") ? void 0 : json["read_parameters"],
    "writeParameters": !(0, runtime_1$1u.exists)(json, "write_parameters") ? void 0 : json["write_parameters"]
  };
}
function ConfigureIndexRequestEmbedToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "field_map": value.fieldMap,
    "read_parameters": value.readParameters,
    "write_parameters": value.writeParameters
  };
}
var ConfigureIndexRequestSpec = {};
var PodBased1 = {};
var PodBased1Pod = {};
Object.defineProperty(PodBased1Pod, "__esModule", { value: true });
PodBased1Pod.instanceOfPodBased1Pod = instanceOfPodBased1Pod;
PodBased1Pod.PodBased1PodFromJSON = PodBased1PodFromJSON;
PodBased1Pod.PodBased1PodFromJSONTyped = PodBased1PodFromJSONTyped;
PodBased1Pod.PodBased1PodToJSON = PodBased1PodToJSON;
const runtime_1$1t = runtime$d;
function instanceOfPodBased1Pod(value) {
  let isInstance = true;
  return isInstance;
}
function PodBased1PodFromJSON(json) {
  return PodBased1PodFromJSONTyped(json);
}
function PodBased1PodFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "replicas": !(0, runtime_1$1t.exists)(json, "replicas") ? void 0 : json["replicas"],
    "podType": !(0, runtime_1$1t.exists)(json, "pod_type") ? void 0 : json["pod_type"]
  };
}
function PodBased1PodToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "replicas": value.replicas,
    "pod_type": value.podType
  };
}
Object.defineProperty(PodBased1, "__esModule", { value: true });
PodBased1.instanceOfPodBased1 = instanceOfPodBased1;
PodBased1.PodBased1FromJSON = PodBased1FromJSON;
PodBased1.PodBased1FromJSONTyped = PodBased1FromJSONTyped;
PodBased1.PodBased1ToJSON = PodBased1ToJSON;
const PodBased1Pod_1 = PodBased1Pod;
function instanceOfPodBased1(value) {
  let isInstance = true;
  isInstance = isInstance && "pod" in value;
  return isInstance;
}
function PodBased1FromJSON(json) {
  return PodBased1FromJSONTyped(json);
}
function PodBased1FromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "pod": (0, PodBased1Pod_1.PodBased1PodFromJSON)(json["pod"])
  };
}
function PodBased1ToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "pod": (0, PodBased1Pod_1.PodBased1PodToJSON)(value.pod)
  };
}
var Serverless1 = {};
var Serverless1Serverless = {};
Object.defineProperty(Serverless1Serverless, "__esModule", { value: true });
Serverless1Serverless.instanceOfServerless1Serverless = instanceOfServerless1Serverless;
Serverless1Serverless.Serverless1ServerlessFromJSON = Serverless1ServerlessFromJSON;
Serverless1Serverless.Serverless1ServerlessFromJSONTyped = Serverless1ServerlessFromJSONTyped;
Serverless1Serverless.Serverless1ServerlessToJSON = Serverless1ServerlessToJSON;
const runtime_1$1s = runtime$d;
const ReadCapacity_1$2 = ReadCapacity;
function instanceOfServerless1Serverless(value) {
  let isInstance = true;
  return isInstance;
}
function Serverless1ServerlessFromJSON(json) {
  return Serverless1ServerlessFromJSONTyped(json);
}
function Serverless1ServerlessFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "readCapacity": !(0, runtime_1$1s.exists)(json, "read_capacity") ? void 0 : (0, ReadCapacity_1$2.ReadCapacityFromJSON)(json["read_capacity"])
  };
}
function Serverless1ServerlessToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "read_capacity": (0, ReadCapacity_1$2.ReadCapacityToJSON)(value.readCapacity)
  };
}
Object.defineProperty(Serverless1, "__esModule", { value: true });
Serverless1.instanceOfServerless1 = instanceOfServerless1;
Serverless1.Serverless1FromJSON = Serverless1FromJSON;
Serverless1.Serverless1FromJSONTyped = Serverless1FromJSONTyped;
Serverless1.Serverless1ToJSON = Serverless1ToJSON;
const Serverless1Serverless_1 = Serverless1Serverless;
function instanceOfServerless1(value) {
  let isInstance = true;
  isInstance = isInstance && "serverless" in value;
  return isInstance;
}
function Serverless1FromJSON(json) {
  return Serverless1FromJSONTyped(json);
}
function Serverless1FromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "serverless": (0, Serverless1Serverless_1.Serverless1ServerlessFromJSON)(json["serverless"])
  };
}
function Serverless1ToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "serverless": (0, Serverless1Serverless_1.Serverless1ServerlessToJSON)(value.serverless)
  };
}
Object.defineProperty(ConfigureIndexRequestSpec, "__esModule", { value: true });
ConfigureIndexRequestSpec.ConfigureIndexRequestSpecFromJSON = ConfigureIndexRequestSpecFromJSON;
ConfigureIndexRequestSpec.ConfigureIndexRequestSpecFromJSONTyped = ConfigureIndexRequestSpecFromJSONTyped;
ConfigureIndexRequestSpec.ConfigureIndexRequestSpecToJSON = ConfigureIndexRequestSpecToJSON;
const BYOC1_1 = BYOC1;
const PodBased1_1 = PodBased1;
const Serverless1_1 = Serverless1;
function ConfigureIndexRequestSpecFromJSON(json) {
  return ConfigureIndexRequestSpecFromJSONTyped(json);
}
function ConfigureIndexRequestSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return { ...(0, BYOC1_1.BYOC1FromJSONTyped)(json, true), ...(0, PodBased1_1.PodBased1FromJSONTyped)(json, true), ...(0, Serverless1_1.Serverless1FromJSONTyped)(json, true) };
}
function ConfigureIndexRequestSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  if ((0, BYOC1_1.instanceOfBYOC1)(value)) {
    return (0, BYOC1_1.BYOC1ToJSON)(value);
  }
  if ((0, PodBased1_1.instanceOfPodBased1)(value)) {
    return (0, PodBased1_1.PodBased1ToJSON)(value);
  }
  if ((0, Serverless1_1.instanceOfServerless1)(value)) {
    return (0, Serverless1_1.Serverless1ToJSON)(value);
  }
  return {};
}
Object.defineProperty(ConfigureIndexRequest, "__esModule", { value: true });
ConfigureIndexRequest.instanceOfConfigureIndexRequest = instanceOfConfigureIndexRequest;
ConfigureIndexRequest.ConfigureIndexRequestFromJSON = ConfigureIndexRequestFromJSON;
ConfigureIndexRequest.ConfigureIndexRequestFromJSONTyped = ConfigureIndexRequestFromJSONTyped;
ConfigureIndexRequest.ConfigureIndexRequestToJSON = ConfigureIndexRequestToJSON;
const runtime_1$1r = runtime$d;
const ConfigureIndexRequestEmbed_1 = ConfigureIndexRequestEmbed;
const ConfigureIndexRequestSpec_1 = ConfigureIndexRequestSpec;
function instanceOfConfigureIndexRequest(value) {
  let isInstance = true;
  return isInstance;
}
function ConfigureIndexRequestFromJSON(json) {
  return ConfigureIndexRequestFromJSONTyped(json);
}
function ConfigureIndexRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "spec": !(0, runtime_1$1r.exists)(json, "spec") ? void 0 : (0, ConfigureIndexRequestSpec_1.ConfigureIndexRequestSpecFromJSON)(json["spec"]),
    "deletionProtection": !(0, runtime_1$1r.exists)(json, "deletion_protection") ? void 0 : json["deletion_protection"],
    "tags": !(0, runtime_1$1r.exists)(json, "tags") ? void 0 : json["tags"],
    "embed": !(0, runtime_1$1r.exists)(json, "embed") ? void 0 : (0, ConfigureIndexRequestEmbed_1.ConfigureIndexRequestEmbedFromJSON)(json["embed"])
  };
}
function ConfigureIndexRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "spec": (0, ConfigureIndexRequestSpec_1.ConfigureIndexRequestSpecToJSON)(value.spec),
    "deletion_protection": value.deletionProtection,
    "tags": value.tags,
    "embed": (0, ConfigureIndexRequestEmbed_1.ConfigureIndexRequestEmbedToJSON)(value.embed)
  };
}
var CreateBackupRequest = {};
Object.defineProperty(CreateBackupRequest, "__esModule", { value: true });
CreateBackupRequest.instanceOfCreateBackupRequest = instanceOfCreateBackupRequest;
CreateBackupRequest.CreateBackupRequestFromJSON = CreateBackupRequestFromJSON;
CreateBackupRequest.CreateBackupRequestFromJSONTyped = CreateBackupRequestFromJSONTyped;
CreateBackupRequest.CreateBackupRequestToJSON = CreateBackupRequestToJSON;
const runtime_1$1q = runtime$d;
function instanceOfCreateBackupRequest(value) {
  let isInstance = true;
  return isInstance;
}
function CreateBackupRequestFromJSON(json) {
  return CreateBackupRequestFromJSONTyped(json);
}
function CreateBackupRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": !(0, runtime_1$1q.exists)(json, "name") ? void 0 : json["name"],
    "description": !(0, runtime_1$1q.exists)(json, "description") ? void 0 : json["description"]
  };
}
function CreateBackupRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "description": value.description
  };
}
var CreateCollectionRequest = {};
Object.defineProperty(CreateCollectionRequest, "__esModule", { value: true });
CreateCollectionRequest.instanceOfCreateCollectionRequest = instanceOfCreateCollectionRequest;
CreateCollectionRequest.CreateCollectionRequestFromJSON = CreateCollectionRequestFromJSON;
CreateCollectionRequest.CreateCollectionRequestFromJSONTyped = CreateCollectionRequestFromJSONTyped;
CreateCollectionRequest.CreateCollectionRequestToJSON = CreateCollectionRequestToJSON;
function instanceOfCreateCollectionRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  isInstance = isInstance && "source" in value;
  return isInstance;
}
function CreateCollectionRequestFromJSON(json) {
  return CreateCollectionRequestFromJSONTyped(json);
}
function CreateCollectionRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "source": json["source"]
  };
}
function CreateCollectionRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "source": value.source
  };
}
var CreateIndexForModelRequest = {};
var CreateIndexForModelRequestEmbed = {};
Object.defineProperty(CreateIndexForModelRequestEmbed, "__esModule", { value: true });
CreateIndexForModelRequestEmbed.instanceOfCreateIndexForModelRequestEmbed = instanceOfCreateIndexForModelRequestEmbed;
CreateIndexForModelRequestEmbed.CreateIndexForModelRequestEmbedFromJSON = CreateIndexForModelRequestEmbedFromJSON;
CreateIndexForModelRequestEmbed.CreateIndexForModelRequestEmbedFromJSONTyped = CreateIndexForModelRequestEmbedFromJSONTyped;
CreateIndexForModelRequestEmbed.CreateIndexForModelRequestEmbedToJSON = CreateIndexForModelRequestEmbedToJSON;
const runtime_1$1p = runtime$d;
function instanceOfCreateIndexForModelRequestEmbed(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  isInstance = isInstance && "fieldMap" in value;
  return isInstance;
}
function CreateIndexForModelRequestEmbedFromJSON(json) {
  return CreateIndexForModelRequestEmbedFromJSONTyped(json);
}
function CreateIndexForModelRequestEmbedFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "metric": !(0, runtime_1$1p.exists)(json, "metric") ? void 0 : json["metric"],
    "fieldMap": json["field_map"],
    "dimension": !(0, runtime_1$1p.exists)(json, "dimension") ? void 0 : json["dimension"],
    "readParameters": !(0, runtime_1$1p.exists)(json, "read_parameters") ? void 0 : json["read_parameters"],
    "writeParameters": !(0, runtime_1$1p.exists)(json, "write_parameters") ? void 0 : json["write_parameters"]
  };
}
function CreateIndexForModelRequestEmbedToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "metric": value.metric,
    "field_map": value.fieldMap,
    "dimension": value.dimension,
    "read_parameters": value.readParameters,
    "write_parameters": value.writeParameters
  };
}
Object.defineProperty(CreateIndexForModelRequest, "__esModule", { value: true });
CreateIndexForModelRequest.instanceOfCreateIndexForModelRequest = instanceOfCreateIndexForModelRequest;
CreateIndexForModelRequest.CreateIndexForModelRequestFromJSON = CreateIndexForModelRequestFromJSON;
CreateIndexForModelRequest.CreateIndexForModelRequestFromJSONTyped = CreateIndexForModelRequestFromJSONTyped;
CreateIndexForModelRequest.CreateIndexForModelRequestToJSON = CreateIndexForModelRequestToJSON;
const runtime_1$1o = runtime$d;
const CreateIndexForModelRequestEmbed_1 = CreateIndexForModelRequestEmbed;
const MetadataSchema_1$2 = MetadataSchema;
const ReadCapacity_1$1 = ReadCapacity;
function instanceOfCreateIndexForModelRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  isInstance = isInstance && "cloud" in value;
  isInstance = isInstance && "region" in value;
  isInstance = isInstance && "embed" in value;
  return isInstance;
}
function CreateIndexForModelRequestFromJSON(json) {
  return CreateIndexForModelRequestFromJSONTyped(json);
}
function CreateIndexForModelRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "cloud": json["cloud"],
    "region": json["region"],
    "deletionProtection": !(0, runtime_1$1o.exists)(json, "deletion_protection") ? void 0 : json["deletion_protection"],
    "tags": !(0, runtime_1$1o.exists)(json, "tags") ? void 0 : json["tags"],
    "schema": !(0, runtime_1$1o.exists)(json, "schema") ? void 0 : (0, MetadataSchema_1$2.MetadataSchemaFromJSON)(json["schema"]),
    "readCapacity": !(0, runtime_1$1o.exists)(json, "read_capacity") ? void 0 : (0, ReadCapacity_1$1.ReadCapacityFromJSON)(json["read_capacity"]),
    "embed": (0, CreateIndexForModelRequestEmbed_1.CreateIndexForModelRequestEmbedFromJSON)(json["embed"])
  };
}
function CreateIndexForModelRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "cloud": value.cloud,
    "region": value.region,
    "deletion_protection": value.deletionProtection,
    "tags": value.tags,
    "schema": (0, MetadataSchema_1$2.MetadataSchemaToJSON)(value.schema),
    "read_capacity": (0, ReadCapacity_1$1.ReadCapacityToJSON)(value.readCapacity),
    "embed": (0, CreateIndexForModelRequestEmbed_1.CreateIndexForModelRequestEmbedToJSON)(value.embed)
  };
}
var CreateIndexFromBackupRequest = {};
Object.defineProperty(CreateIndexFromBackupRequest, "__esModule", { value: true });
CreateIndexFromBackupRequest.instanceOfCreateIndexFromBackupRequest = instanceOfCreateIndexFromBackupRequest;
CreateIndexFromBackupRequest.CreateIndexFromBackupRequestFromJSON = CreateIndexFromBackupRequestFromJSON;
CreateIndexFromBackupRequest.CreateIndexFromBackupRequestFromJSONTyped = CreateIndexFromBackupRequestFromJSONTyped;
CreateIndexFromBackupRequest.CreateIndexFromBackupRequestToJSON = CreateIndexFromBackupRequestToJSON;
const runtime_1$1n = runtime$d;
function instanceOfCreateIndexFromBackupRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  return isInstance;
}
function CreateIndexFromBackupRequestFromJSON(json) {
  return CreateIndexFromBackupRequestFromJSONTyped(json);
}
function CreateIndexFromBackupRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "tags": !(0, runtime_1$1n.exists)(json, "tags") ? void 0 : json["tags"],
    "deletionProtection": !(0, runtime_1$1n.exists)(json, "deletion_protection") ? void 0 : json["deletion_protection"]
  };
}
function CreateIndexFromBackupRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "tags": value.tags,
    "deletion_protection": value.deletionProtection
  };
}
var CreateIndexFromBackupResponse = {};
Object.defineProperty(CreateIndexFromBackupResponse, "__esModule", { value: true });
CreateIndexFromBackupResponse.instanceOfCreateIndexFromBackupResponse = instanceOfCreateIndexFromBackupResponse;
CreateIndexFromBackupResponse.CreateIndexFromBackupResponseFromJSON = CreateIndexFromBackupResponseFromJSON;
CreateIndexFromBackupResponse.CreateIndexFromBackupResponseFromJSONTyped = CreateIndexFromBackupResponseFromJSONTyped;
CreateIndexFromBackupResponse.CreateIndexFromBackupResponseToJSON = CreateIndexFromBackupResponseToJSON;
function instanceOfCreateIndexFromBackupResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "restoreJobId" in value;
  isInstance = isInstance && "indexId" in value;
  return isInstance;
}
function CreateIndexFromBackupResponseFromJSON(json) {
  return CreateIndexFromBackupResponseFromJSONTyped(json);
}
function CreateIndexFromBackupResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "restoreJobId": json["restore_job_id"],
    "indexId": json["index_id"]
  };
}
function CreateIndexFromBackupResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "restore_job_id": value.restoreJobId,
    "index_id": value.indexId
  };
}
var CreateIndexRequest = {};
var IndexSpec = {};
var PodBased = {};
var PodSpec = {};
var PodSpecMetadataConfig = {};
Object.defineProperty(PodSpecMetadataConfig, "__esModule", { value: true });
PodSpecMetadataConfig.instanceOfPodSpecMetadataConfig = instanceOfPodSpecMetadataConfig;
PodSpecMetadataConfig.PodSpecMetadataConfigFromJSON = PodSpecMetadataConfigFromJSON;
PodSpecMetadataConfig.PodSpecMetadataConfigFromJSONTyped = PodSpecMetadataConfigFromJSONTyped;
PodSpecMetadataConfig.PodSpecMetadataConfigToJSON = PodSpecMetadataConfigToJSON;
const runtime_1$1m = runtime$d;
function instanceOfPodSpecMetadataConfig(value) {
  let isInstance = true;
  return isInstance;
}
function PodSpecMetadataConfigFromJSON(json) {
  return PodSpecMetadataConfigFromJSONTyped(json);
}
function PodSpecMetadataConfigFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "indexed": !(0, runtime_1$1m.exists)(json, "indexed") ? void 0 : json["indexed"]
  };
}
function PodSpecMetadataConfigToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "indexed": value.indexed
  };
}
Object.defineProperty(PodSpec, "__esModule", { value: true });
PodSpec.instanceOfPodSpec = instanceOfPodSpec;
PodSpec.PodSpecFromJSON = PodSpecFromJSON;
PodSpec.PodSpecFromJSONTyped = PodSpecFromJSONTyped;
PodSpec.PodSpecToJSON = PodSpecToJSON;
const runtime_1$1l = runtime$d;
const PodSpecMetadataConfig_1 = PodSpecMetadataConfig;
function instanceOfPodSpec(value) {
  let isInstance = true;
  isInstance = isInstance && "environment" in value;
  isInstance = isInstance && "podType" in value;
  return isInstance;
}
function PodSpecFromJSON(json) {
  return PodSpecFromJSONTyped(json);
}
function PodSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "environment": json["environment"],
    "replicas": !(0, runtime_1$1l.exists)(json, "replicas") ? void 0 : json["replicas"],
    "shards": !(0, runtime_1$1l.exists)(json, "shards") ? void 0 : json["shards"],
    "podType": json["pod_type"],
    "pods": !(0, runtime_1$1l.exists)(json, "pods") ? void 0 : json["pods"],
    "metadataConfig": !(0, runtime_1$1l.exists)(json, "metadata_config") ? void 0 : (0, PodSpecMetadataConfig_1.PodSpecMetadataConfigFromJSON)(json["metadata_config"]),
    "sourceCollection": !(0, runtime_1$1l.exists)(json, "source_collection") ? void 0 : json["source_collection"]
  };
}
function PodSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "environment": value.environment,
    "replicas": value.replicas,
    "shards": value.shards,
    "pod_type": value.podType,
    "pods": value.pods,
    "metadata_config": (0, PodSpecMetadataConfig_1.PodSpecMetadataConfigToJSON)(value.metadataConfig),
    "source_collection": value.sourceCollection
  };
}
Object.defineProperty(PodBased, "__esModule", { value: true });
PodBased.instanceOfPodBased = instanceOfPodBased;
PodBased.PodBasedFromJSON = PodBasedFromJSON;
PodBased.PodBasedFromJSONTyped = PodBasedFromJSONTyped;
PodBased.PodBasedToJSON = PodBasedToJSON;
const PodSpec_1 = PodSpec;
function instanceOfPodBased(value) {
  let isInstance = true;
  isInstance = isInstance && "pod" in value;
  return isInstance;
}
function PodBasedFromJSON(json) {
  return PodBasedFromJSONTyped(json);
}
function PodBasedFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "pod": (0, PodSpec_1.PodSpecFromJSON)(json["pod"])
  };
}
function PodBasedToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "pod": (0, PodSpec_1.PodSpecToJSON)(value.pod)
  };
}
var Serverless2 = {};
var ServerlessSpec = {};
Object.defineProperty(ServerlessSpec, "__esModule", { value: true });
ServerlessSpec.instanceOfServerlessSpec = instanceOfServerlessSpec;
ServerlessSpec.ServerlessSpecFromJSON = ServerlessSpecFromJSON;
ServerlessSpec.ServerlessSpecFromJSONTyped = ServerlessSpecFromJSONTyped;
ServerlessSpec.ServerlessSpecToJSON = ServerlessSpecToJSON;
const runtime_1$1k = runtime$d;
const MetadataSchema_1$1 = MetadataSchema;
const ReadCapacity_1 = ReadCapacity;
function instanceOfServerlessSpec(value) {
  let isInstance = true;
  isInstance = isInstance && "cloud" in value;
  isInstance = isInstance && "region" in value;
  return isInstance;
}
function ServerlessSpecFromJSON(json) {
  return ServerlessSpecFromJSONTyped(json);
}
function ServerlessSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "cloud": json["cloud"],
    "region": json["region"],
    "readCapacity": !(0, runtime_1$1k.exists)(json, "read_capacity") ? void 0 : (0, ReadCapacity_1.ReadCapacityFromJSON)(json["read_capacity"]),
    "sourceCollection": !(0, runtime_1$1k.exists)(json, "source_collection") ? void 0 : json["source_collection"],
    "schema": !(0, runtime_1$1k.exists)(json, "schema") ? void 0 : (0, MetadataSchema_1$1.MetadataSchemaFromJSON)(json["schema"])
  };
}
function ServerlessSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "cloud": value.cloud,
    "region": value.region,
    "read_capacity": (0, ReadCapacity_1.ReadCapacityToJSON)(value.readCapacity),
    "source_collection": value.sourceCollection,
    "schema": (0, MetadataSchema_1$1.MetadataSchemaToJSON)(value.schema)
  };
}
Object.defineProperty(Serverless2, "__esModule", { value: true });
Serverless2.instanceOfServerless2 = instanceOfServerless2;
Serverless2.Serverless2FromJSON = Serverless2FromJSON;
Serverless2.Serverless2FromJSONTyped = Serverless2FromJSONTyped;
Serverless2.Serverless2ToJSON = Serverless2ToJSON;
const ServerlessSpec_1 = ServerlessSpec;
function instanceOfServerless2(value) {
  let isInstance = true;
  isInstance = isInstance && "serverless" in value;
  return isInstance;
}
function Serverless2FromJSON(json) {
  return Serverless2FromJSONTyped(json);
}
function Serverless2FromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "serverless": (0, ServerlessSpec_1.ServerlessSpecFromJSON)(json["serverless"])
  };
}
function Serverless2ToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "serverless": (0, ServerlessSpec_1.ServerlessSpecToJSON)(value.serverless)
  };
}
Object.defineProperty(IndexSpec, "__esModule", { value: true });
IndexSpec.IndexSpecFromJSON = IndexSpecFromJSON;
IndexSpec.IndexSpecFromJSONTyped = IndexSpecFromJSONTyped;
IndexSpec.IndexSpecToJSON = IndexSpecToJSON;
const BYOC2_1 = BYOC2;
const PodBased_1$1 = PodBased;
const Serverless2_1 = Serverless2;
function IndexSpecFromJSON(json) {
  return IndexSpecFromJSONTyped(json);
}
function IndexSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return { ...(0, BYOC2_1.BYOC2FromJSONTyped)(json, true), ...(0, PodBased_1$1.PodBasedFromJSONTyped)(json, true), ...(0, Serverless2_1.Serverless2FromJSONTyped)(json, true) };
}
function IndexSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  if ((0, BYOC2_1.instanceOfBYOC2)(value)) {
    return (0, BYOC2_1.BYOC2ToJSON)(value);
  }
  if ((0, PodBased_1$1.instanceOfPodBased)(value)) {
    return (0, PodBased_1$1.PodBasedToJSON)(value);
  }
  if ((0, Serverless2_1.instanceOfServerless2)(value)) {
    return (0, Serverless2_1.Serverless2ToJSON)(value);
  }
  return {};
}
Object.defineProperty(CreateIndexRequest, "__esModule", { value: true });
CreateIndexRequest.instanceOfCreateIndexRequest = instanceOfCreateIndexRequest;
CreateIndexRequest.CreateIndexRequestFromJSON = CreateIndexRequestFromJSON;
CreateIndexRequest.CreateIndexRequestFromJSONTyped = CreateIndexRequestFromJSONTyped;
CreateIndexRequest.CreateIndexRequestToJSON = CreateIndexRequestToJSON;
const runtime_1$1j = runtime$d;
const IndexSpec_1 = IndexSpec;
function instanceOfCreateIndexRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  isInstance = isInstance && "spec" in value;
  return isInstance;
}
function CreateIndexRequestFromJSON(json) {
  return CreateIndexRequestFromJSONTyped(json);
}
function CreateIndexRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "dimension": !(0, runtime_1$1j.exists)(json, "dimension") ? void 0 : json["dimension"],
    "metric": !(0, runtime_1$1j.exists)(json, "metric") ? void 0 : json["metric"],
    "deletionProtection": !(0, runtime_1$1j.exists)(json, "deletion_protection") ? void 0 : json["deletion_protection"],
    "tags": !(0, runtime_1$1j.exists)(json, "tags") ? void 0 : json["tags"],
    "spec": (0, IndexSpec_1.IndexSpecFromJSON)(json["spec"]),
    "vectorType": !(0, runtime_1$1j.exists)(json, "vector_type") ? void 0 : json["vector_type"]
  };
}
function CreateIndexRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "dimension": value.dimension,
    "metric": value.metric,
    "deletion_protection": value.deletionProtection,
    "tags": value.tags,
    "spec": (0, IndexSpec_1.IndexSpecToJSON)(value.spec),
    "vector_type": value.vectorType
  };
}
var ErrorResponse$3 = {};
var ErrorResponseError$3 = {};
Object.defineProperty(ErrorResponseError$3, "__esModule", { value: true });
ErrorResponseError$3.instanceOfErrorResponseError = instanceOfErrorResponseError$3;
ErrorResponseError$3.ErrorResponseErrorFromJSON = ErrorResponseErrorFromJSON$3;
ErrorResponseError$3.ErrorResponseErrorFromJSONTyped = ErrorResponseErrorFromJSONTyped$3;
ErrorResponseError$3.ErrorResponseErrorToJSON = ErrorResponseErrorToJSON$3;
const runtime_1$1i = runtime$d;
function instanceOfErrorResponseError$3(value) {
  let isInstance = true;
  isInstance = isInstance && "code" in value;
  isInstance = isInstance && "message" in value;
  return isInstance;
}
function ErrorResponseErrorFromJSON$3(json) {
  return ErrorResponseErrorFromJSONTyped$3(json);
}
function ErrorResponseErrorFromJSONTyped$3(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "code": json["code"],
    "message": json["message"],
    "details": !(0, runtime_1$1i.exists)(json, "details") ? void 0 : json["details"]
  };
}
function ErrorResponseErrorToJSON$3(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "code": value.code,
    "message": value.message,
    "details": value.details
  };
}
Object.defineProperty(ErrorResponse$3, "__esModule", { value: true });
ErrorResponse$3.instanceOfErrorResponse = instanceOfErrorResponse$3;
ErrorResponse$3.ErrorResponseFromJSON = ErrorResponseFromJSON$3;
ErrorResponse$3.ErrorResponseFromJSONTyped = ErrorResponseFromJSONTyped$3;
ErrorResponse$3.ErrorResponseToJSON = ErrorResponseToJSON$3;
const ErrorResponseError_1$3 = ErrorResponseError$3;
function instanceOfErrorResponse$3(value) {
  let isInstance = true;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "error" in value;
  return isInstance;
}
function ErrorResponseFromJSON$3(json) {
  return ErrorResponseFromJSONTyped$3(json);
}
function ErrorResponseFromJSONTyped$3(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "status": json["status"],
    "error": (0, ErrorResponseError_1$3.ErrorResponseErrorFromJSON)(json["error"])
  };
}
function ErrorResponseToJSON$3(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "status": value.status,
    "error": (0, ErrorResponseError_1$3.ErrorResponseErrorToJSON)(value.error)
  };
}
var IndexList = {};
var IndexModel = {};
var IndexModelSpec = {};
var Serverless = {};
var ServerlessSpecResponse = {};
Object.defineProperty(ServerlessSpecResponse, "__esModule", { value: true });
ServerlessSpecResponse.instanceOfServerlessSpecResponse = instanceOfServerlessSpecResponse;
ServerlessSpecResponse.ServerlessSpecResponseFromJSON = ServerlessSpecResponseFromJSON;
ServerlessSpecResponse.ServerlessSpecResponseFromJSONTyped = ServerlessSpecResponseFromJSONTyped;
ServerlessSpecResponse.ServerlessSpecResponseToJSON = ServerlessSpecResponseToJSON;
const runtime_1$1h = runtime$d;
const MetadataSchema_1 = MetadataSchema;
const ReadCapacityResponse_1 = ReadCapacityResponse;
function instanceOfServerlessSpecResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "cloud" in value;
  isInstance = isInstance && "region" in value;
  isInstance = isInstance && "readCapacity" in value;
  return isInstance;
}
function ServerlessSpecResponseFromJSON(json) {
  return ServerlessSpecResponseFromJSONTyped(json);
}
function ServerlessSpecResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "cloud": json["cloud"],
    "region": json["region"],
    "readCapacity": (0, ReadCapacityResponse_1.ReadCapacityResponseFromJSON)(json["read_capacity"]),
    "sourceCollection": !(0, runtime_1$1h.exists)(json, "source_collection") ? void 0 : json["source_collection"],
    "schema": !(0, runtime_1$1h.exists)(json, "schema") ? void 0 : (0, MetadataSchema_1.MetadataSchemaFromJSON)(json["schema"])
  };
}
function ServerlessSpecResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "cloud": value.cloud,
    "region": value.region,
    "read_capacity": (0, ReadCapacityResponse_1.ReadCapacityResponseToJSON)(value.readCapacity),
    "source_collection": value.sourceCollection,
    "schema": (0, MetadataSchema_1.MetadataSchemaToJSON)(value.schema)
  };
}
Object.defineProperty(Serverless, "__esModule", { value: true });
Serverless.instanceOfServerless = instanceOfServerless;
Serverless.ServerlessFromJSON = ServerlessFromJSON;
Serverless.ServerlessFromJSONTyped = ServerlessFromJSONTyped;
Serverless.ServerlessToJSON = ServerlessToJSON;
const ServerlessSpecResponse_1 = ServerlessSpecResponse;
function instanceOfServerless(value) {
  let isInstance = true;
  isInstance = isInstance && "serverless" in value;
  return isInstance;
}
function ServerlessFromJSON(json) {
  return ServerlessFromJSONTyped(json);
}
function ServerlessFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "serverless": (0, ServerlessSpecResponse_1.ServerlessSpecResponseFromJSON)(json["serverless"])
  };
}
function ServerlessToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "serverless": (0, ServerlessSpecResponse_1.ServerlessSpecResponseToJSON)(value.serverless)
  };
}
Object.defineProperty(IndexModelSpec, "__esModule", { value: true });
IndexModelSpec.IndexModelSpecFromJSON = IndexModelSpecFromJSON;
IndexModelSpec.IndexModelSpecFromJSONTyped = IndexModelSpecFromJSONTyped;
IndexModelSpec.IndexModelSpecToJSON = IndexModelSpecToJSON;
const BYOC_1 = BYOC;
const PodBased_1 = PodBased;
const Serverless_1 = Serverless;
function IndexModelSpecFromJSON(json) {
  return IndexModelSpecFromJSONTyped(json);
}
function IndexModelSpecFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return { ...(0, BYOC_1.BYOCFromJSONTyped)(json, true), ...(0, PodBased_1.PodBasedFromJSONTyped)(json, true), ...(0, Serverless_1.ServerlessFromJSONTyped)(json, true) };
}
function IndexModelSpecToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  if ((0, BYOC_1.instanceOfBYOC)(value)) {
    return (0, BYOC_1.BYOCToJSON)(value);
  }
  if ((0, PodBased_1.instanceOfPodBased)(value)) {
    return (0, PodBased_1.PodBasedToJSON)(value);
  }
  if ((0, Serverless_1.instanceOfServerless)(value)) {
    return (0, Serverless_1.ServerlessToJSON)(value);
  }
  return {};
}
var IndexModelStatus = {};
Object.defineProperty(IndexModelStatus, "__esModule", { value: true });
IndexModelStatus.instanceOfIndexModelStatus = instanceOfIndexModelStatus;
IndexModelStatus.IndexModelStatusFromJSON = IndexModelStatusFromJSON;
IndexModelStatus.IndexModelStatusFromJSONTyped = IndexModelStatusFromJSONTyped;
IndexModelStatus.IndexModelStatusToJSON = IndexModelStatusToJSON;
function instanceOfIndexModelStatus(value) {
  let isInstance = true;
  isInstance = isInstance && "ready" in value;
  isInstance = isInstance && "state" in value;
  return isInstance;
}
function IndexModelStatusFromJSON(json) {
  return IndexModelStatusFromJSONTyped(json);
}
function IndexModelStatusFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "ready": json["ready"],
    "state": json["state"]
  };
}
function IndexModelStatusToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "ready": value.ready,
    "state": value.state
  };
}
var ModelIndexEmbed = {};
Object.defineProperty(ModelIndexEmbed, "__esModule", { value: true });
ModelIndexEmbed.instanceOfModelIndexEmbed = instanceOfModelIndexEmbed;
ModelIndexEmbed.ModelIndexEmbedFromJSON = ModelIndexEmbedFromJSON;
ModelIndexEmbed.ModelIndexEmbedFromJSONTyped = ModelIndexEmbedFromJSONTyped;
ModelIndexEmbed.ModelIndexEmbedToJSON = ModelIndexEmbedToJSON;
const runtime_1$1g = runtime$d;
function instanceOfModelIndexEmbed(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  return isInstance;
}
function ModelIndexEmbedFromJSON(json) {
  return ModelIndexEmbedFromJSONTyped(json);
}
function ModelIndexEmbedFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "metric": !(0, runtime_1$1g.exists)(json, "metric") ? void 0 : json["metric"],
    "dimension": !(0, runtime_1$1g.exists)(json, "dimension") ? void 0 : json["dimension"],
    "vectorType": !(0, runtime_1$1g.exists)(json, "vector_type") ? void 0 : json["vector_type"],
    "fieldMap": !(0, runtime_1$1g.exists)(json, "field_map") ? void 0 : json["field_map"],
    "readParameters": !(0, runtime_1$1g.exists)(json, "read_parameters") ? void 0 : json["read_parameters"],
    "writeParameters": !(0, runtime_1$1g.exists)(json, "write_parameters") ? void 0 : json["write_parameters"]
  };
}
function ModelIndexEmbedToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "metric": value.metric,
    "dimension": value.dimension,
    "vector_type": value.vectorType,
    "field_map": value.fieldMap,
    "read_parameters": value.readParameters,
    "write_parameters": value.writeParameters
  };
}
Object.defineProperty(IndexModel, "__esModule", { value: true });
IndexModel.instanceOfIndexModel = instanceOfIndexModel;
IndexModel.IndexModelFromJSON = IndexModelFromJSON;
IndexModel.IndexModelFromJSONTyped = IndexModelFromJSONTyped;
IndexModel.IndexModelToJSON = IndexModelToJSON;
const runtime_1$1f = runtime$d;
const IndexModelSpec_1 = IndexModelSpec;
const IndexModelStatus_1 = IndexModelStatus;
const ModelIndexEmbed_1 = ModelIndexEmbed;
function instanceOfIndexModel(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  isInstance = isInstance && "metric" in value;
  isInstance = isInstance && "host" in value;
  isInstance = isInstance && "spec" in value;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "vectorType" in value;
  return isInstance;
}
function IndexModelFromJSON(json) {
  return IndexModelFromJSONTyped(json);
}
function IndexModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "dimension": !(0, runtime_1$1f.exists)(json, "dimension") ? void 0 : json["dimension"],
    "metric": json["metric"],
    "host": json["host"],
    "privateHost": !(0, runtime_1$1f.exists)(json, "private_host") ? void 0 : json["private_host"],
    "deletionProtection": !(0, runtime_1$1f.exists)(json, "deletion_protection") ? void 0 : json["deletion_protection"],
    "tags": !(0, runtime_1$1f.exists)(json, "tags") ? void 0 : json["tags"],
    "embed": !(0, runtime_1$1f.exists)(json, "embed") ? void 0 : (0, ModelIndexEmbed_1.ModelIndexEmbedFromJSON)(json["embed"]),
    "spec": (0, IndexModelSpec_1.IndexModelSpecFromJSON)(json["spec"]),
    "status": (0, IndexModelStatus_1.IndexModelStatusFromJSON)(json["status"]),
    "vectorType": json["vector_type"]
  };
}
function IndexModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "dimension": value.dimension,
    "metric": value.metric,
    "host": value.host,
    "private_host": value.privateHost,
    "deletion_protection": value.deletionProtection,
    "tags": value.tags,
    "embed": (0, ModelIndexEmbed_1.ModelIndexEmbedToJSON)(value.embed),
    "spec": (0, IndexModelSpec_1.IndexModelSpecToJSON)(value.spec),
    "status": (0, IndexModelStatus_1.IndexModelStatusToJSON)(value.status),
    "vector_type": value.vectorType
  };
}
Object.defineProperty(IndexList, "__esModule", { value: true });
IndexList.instanceOfIndexList = instanceOfIndexList;
IndexList.IndexListFromJSON = IndexListFromJSON;
IndexList.IndexListFromJSONTyped = IndexListFromJSONTyped;
IndexList.IndexListToJSON = IndexListToJSON;
const runtime_1$1e = runtime$d;
const IndexModel_1 = IndexModel;
function instanceOfIndexList(value) {
  let isInstance = true;
  return isInstance;
}
function IndexListFromJSON(json) {
  return IndexListFromJSONTyped(json);
}
function IndexListFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "indexes": !(0, runtime_1$1e.exists)(json, "indexes") ? void 0 : json["indexes"].map(IndexModel_1.IndexModelFromJSON)
  };
}
function IndexListToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "indexes": value.indexes === void 0 ? void 0 : value.indexes.map(IndexModel_1.IndexModelToJSON)
  };
}
var RestoreJobList = {};
var RestoreJobModel = {};
Object.defineProperty(RestoreJobModel, "__esModule", { value: true });
RestoreJobModel.instanceOfRestoreJobModel = instanceOfRestoreJobModel;
RestoreJobModel.RestoreJobModelFromJSON = RestoreJobModelFromJSON;
RestoreJobModel.RestoreJobModelFromJSONTyped = RestoreJobModelFromJSONTyped;
RestoreJobModel.RestoreJobModelToJSON = RestoreJobModelToJSON;
const runtime_1$1d = runtime$d;
function instanceOfRestoreJobModel(value) {
  let isInstance = true;
  isInstance = isInstance && "restoreJobId" in value;
  isInstance = isInstance && "backupId" in value;
  isInstance = isInstance && "targetIndexName" in value;
  isInstance = isInstance && "targetIndexId" in value;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "createdAt" in value;
  return isInstance;
}
function RestoreJobModelFromJSON(json) {
  return RestoreJobModelFromJSONTyped(json);
}
function RestoreJobModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "restoreJobId": json["restore_job_id"],
    "backupId": json["backup_id"],
    "targetIndexName": json["target_index_name"],
    "targetIndexId": json["target_index_id"],
    "status": json["status"],
    "createdAt": new Date(json["created_at"]),
    "completedAt": !(0, runtime_1$1d.exists)(json, "completed_at") ? void 0 : new Date(json["completed_at"]),
    "percentComplete": !(0, runtime_1$1d.exists)(json, "percent_complete") ? void 0 : json["percent_complete"]
  };
}
function RestoreJobModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "restore_job_id": value.restoreJobId,
    "backup_id": value.backupId,
    "target_index_name": value.targetIndexName,
    "target_index_id": value.targetIndexId,
    "status": value.status,
    "created_at": value.createdAt.toISOString(),
    "completed_at": value.completedAt === void 0 ? void 0 : value.completedAt.toISOString(),
    "percent_complete": value.percentComplete
  };
}
Object.defineProperty(RestoreJobList, "__esModule", { value: true });
RestoreJobList.instanceOfRestoreJobList = instanceOfRestoreJobList;
RestoreJobList.RestoreJobListFromJSON = RestoreJobListFromJSON;
RestoreJobList.RestoreJobListFromJSONTyped = RestoreJobListFromJSONTyped;
RestoreJobList.RestoreJobListToJSON = RestoreJobListToJSON;
const runtime_1$1c = runtime$d;
const PaginationResponse_1 = PaginationResponse;
const RestoreJobModel_1 = RestoreJobModel;
function instanceOfRestoreJobList(value) {
  let isInstance = true;
  isInstance = isInstance && "data" in value;
  return isInstance;
}
function RestoreJobListFromJSON(json) {
  return RestoreJobListFromJSONTyped(json);
}
function RestoreJobListFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "data": json["data"].map(RestoreJobModel_1.RestoreJobModelFromJSON),
    "pagination": !(0, runtime_1$1c.exists)(json, "pagination") ? void 0 : (0, PaginationResponse_1.PaginationResponseFromJSON)(json["pagination"])
  };
}
function RestoreJobListToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "data": value.data.map(RestoreJobModel_1.RestoreJobModelToJSON),
    "pagination": (0, PaginationResponse_1.PaginationResponseToJSON)(value.pagination)
  };
}
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(BYOC, exports);
  __exportStar(BYOC1, exports);
  __exportStar(BYOC1Byoc, exports);
  __exportStar(BYOC2, exports);
  __exportStar(BackupList, exports);
  __exportStar(BackupModel, exports);
  __exportStar(ByocSpec, exports);
  __exportStar(ByocSpecResponse, exports);
  __exportStar(CollectionList, exports);
  __exportStar(CollectionModel, exports);
  __exportStar(ConfigureIndexRequest, exports);
  __exportStar(ConfigureIndexRequestEmbed, exports);
  __exportStar(ConfigureIndexRequestSpec, exports);
  __exportStar(CreateBackupRequest, exports);
  __exportStar(CreateCollectionRequest, exports);
  __exportStar(CreateIndexForModelRequest, exports);
  __exportStar(CreateIndexForModelRequestEmbed, exports);
  __exportStar(CreateIndexFromBackupRequest, exports);
  __exportStar(CreateIndexFromBackupResponse, exports);
  __exportStar(CreateIndexRequest, exports);
  __exportStar(ErrorResponse$3, exports);
  __exportStar(ErrorResponseError$3, exports);
  __exportStar(IndexList, exports);
  __exportStar(IndexModel, exports);
  __exportStar(IndexModelSpec, exports);
  __exportStar(IndexModelStatus, exports);
  __exportStar(IndexSpec, exports);
  __exportStar(MetadataSchema, exports);
  __exportStar(MetadataSchemaFieldsValue, exports);
  __exportStar(ModelIndexEmbed, exports);
  __exportStar(PaginationResponse, exports);
  __exportStar(PodBased, exports);
  __exportStar(PodBased1, exports);
  __exportStar(PodBased1Pod, exports);
  __exportStar(PodSpec, exports);
  __exportStar(PodSpecMetadataConfig, exports);
  __exportStar(ReadCapacity, exports);
  __exportStar(ReadCapacityDedicatedConfig, exports);
  __exportStar(ReadCapacityDedicatedSpec, exports);
  __exportStar(ReadCapacityDedicatedSpecResponse, exports);
  __exportStar(ReadCapacityOnDemandSpec, exports);
  __exportStar(ReadCapacityOnDemandSpecResponse, exports);
  __exportStar(ReadCapacityResponse, exports);
  __exportStar(ReadCapacityStatus, exports);
  __exportStar(RestoreJobList, exports);
  __exportStar(RestoreJobModel, exports);
  __exportStar(ScalingConfigManual, exports);
  __exportStar(Serverless, exports);
  __exportStar(Serverless1, exports);
  __exportStar(Serverless1Serverless, exports);
  __exportStar(Serverless2, exports);
  __exportStar(ServerlessSpec, exports);
  __exportStar(ServerlessSpecResponse, exports);
})(models$5);
var __createBinding$8 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$8 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$8 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$8(result, mod, k);
  }
  __setModuleDefault$8(result, mod);
  return result;
};
Object.defineProperty(ManageIndexesApi$1, "__esModule", { value: true });
ManageIndexesApi$1.ManageIndexesApi = void 0;
const runtime$c = __importStar$8(runtime$d);
const index_1$7 = models$5;
class ManageIndexesApi extends runtime$c.BaseAPI {
  /**
   * Configure an existing index. For guidance and examples, see [Manage indexes](https://docs.pinecone.io/guides/manage-data/manage-indexes).
   * Configure an index
   */
  async configureIndexRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling configureIndex.");
    }
    if (requestParameters.indexName === null || requestParameters.indexName === void 0) {
      throw new runtime$c.RequiredError("indexName", "Required parameter requestParameters.indexName was null or undefined when calling configureIndex.");
    }
    if (requestParameters.configureIndexRequest === null || requestParameters.configureIndexRequest === void 0) {
      throw new runtime$c.RequiredError("configureIndexRequest", "Required parameter requestParameters.configureIndexRequest was null or undefined when calling configureIndex.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes/{index_name}`.replace(`{${"index_name"}}`, encodeURIComponent(String(requestParameters.indexName))),
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$7.ConfigureIndexRequestToJSON)(requestParameters.configureIndexRequest)
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.IndexModelFromJSON)(jsonValue));
  }
  /**
   * Configure an existing index. For guidance and examples, see [Manage indexes](https://docs.pinecone.io/guides/manage-data/manage-indexes).
   * Configure an index
   */
  async configureIndex(requestParameters, initOverrides) {
    const response = await this.configureIndexRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Create a backup of an index.
   * Create a backup of an index
   */
  async createBackupRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling createBackup.");
    }
    if (requestParameters.indexName === null || requestParameters.indexName === void 0) {
      throw new runtime$c.RequiredError("indexName", "Required parameter requestParameters.indexName was null or undefined when calling createBackup.");
    }
    if (requestParameters.createBackupRequest === null || requestParameters.createBackupRequest === void 0) {
      throw new runtime$c.RequiredError("createBackupRequest", "Required parameter requestParameters.createBackupRequest was null or undefined when calling createBackup.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes/{index_name}/backups`.replace(`{${"index_name"}}`, encodeURIComponent(String(requestParameters.indexName))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$7.CreateBackupRequestToJSON)(requestParameters.createBackupRequest)
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.BackupModelFromJSON)(jsonValue));
  }
  /**
   * Create a backup of an index.
   * Create a backup of an index
   */
  async createBackup(requestParameters, initOverrides) {
    const response = await this.createBackupRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Create a Pinecone collection.    Serverless indexes do not support collections.
   * Create a collection
   */
  async createCollectionRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling createCollection.");
    }
    if (requestParameters.createCollectionRequest === null || requestParameters.createCollectionRequest === void 0) {
      throw new runtime$c.RequiredError("createCollectionRequest", "Required parameter requestParameters.createCollectionRequest was null or undefined when calling createCollection.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/collections`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$7.CreateCollectionRequestToJSON)(requestParameters.createCollectionRequest)
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.CollectionModelFromJSON)(jsonValue));
  }
  /**
   * Create a Pinecone collection.    Serverless indexes do not support collections.
   * Create a collection
   */
  async createCollection(requestParameters, initOverrides) {
    const response = await this.createCollectionRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Create a Pinecone index. This is where you specify the measure of similarity, the dimension of vectors to be stored in the index, which cloud provider you would like to deploy with, and more.    For guidance and examples, see [Create an index](https://docs.pinecone.io/guides/index-data/create-an-index).
   * Create an index
   */
  async createIndexRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling createIndex.");
    }
    if (requestParameters.createIndexRequest === null || requestParameters.createIndexRequest === void 0) {
      throw new runtime$c.RequiredError("createIndexRequest", "Required parameter requestParameters.createIndexRequest was null or undefined when calling createIndex.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$7.CreateIndexRequestToJSON)(requestParameters.createIndexRequest)
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.IndexModelFromJSON)(jsonValue));
  }
  /**
   * Create a Pinecone index. This is where you specify the measure of similarity, the dimension of vectors to be stored in the index, which cloud provider you would like to deploy with, and more.    For guidance and examples, see [Create an index](https://docs.pinecone.io/guides/index-data/create-an-index).
   * Create an index
   */
  async createIndex(requestParameters, initOverrides) {
    const response = await this.createIndexRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Create an index with integrated embedding. With this type of index, you provide source text, and  Pinecone uses a [hosted embedding model](https://docs.pinecone.io/guides/index-data/create-an-index#embedding-models)  to convert the text automatically during [upsert](https://docs.pinecone.io/reference/api/2025-10/data-plane/upsert_records)  and [search](https://docs.pinecone.io/reference/api/2025-10/data-plane/search_records).   For guidance and examples, see [Create an index](https://docs.pinecone.io/guides/index-data/create-an-index#integrated-embedding).
   * Create an index with integrated embedding
   */
  async createIndexForModelRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling createIndexForModel.");
    }
    if (requestParameters.createIndexForModelRequest === null || requestParameters.createIndexForModelRequest === void 0) {
      throw new runtime$c.RequiredError("createIndexForModelRequest", "Required parameter requestParameters.createIndexForModelRequest was null or undefined when calling createIndexForModel.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes/create-for-model`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$7.CreateIndexForModelRequestToJSON)(requestParameters.createIndexForModelRequest)
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.IndexModelFromJSON)(jsonValue));
  }
  /**
   * Create an index with integrated embedding. With this type of index, you provide source text, and  Pinecone uses a [hosted embedding model](https://docs.pinecone.io/guides/index-data/create-an-index#embedding-models)  to convert the text automatically during [upsert](https://docs.pinecone.io/reference/api/2025-10/data-plane/upsert_records)  and [search](https://docs.pinecone.io/reference/api/2025-10/data-plane/search_records).   For guidance and examples, see [Create an index](https://docs.pinecone.io/guides/index-data/create-an-index#integrated-embedding).
   * Create an index with integrated embedding
   */
  async createIndexForModel(requestParameters, initOverrides) {
    const response = await this.createIndexForModelRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Create an index from a backup.
   * Create an index from a backup
   */
  async createIndexFromBackupOperationRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling createIndexFromBackupOperation.");
    }
    if (requestParameters.backupId === null || requestParameters.backupId === void 0) {
      throw new runtime$c.RequiredError("backupId", "Required parameter requestParameters.backupId was null or undefined when calling createIndexFromBackupOperation.");
    }
    if (requestParameters.createIndexFromBackupRequest === null || requestParameters.createIndexFromBackupRequest === void 0) {
      throw new runtime$c.RequiredError("createIndexFromBackupRequest", "Required parameter requestParameters.createIndexFromBackupRequest was null or undefined when calling createIndexFromBackupOperation.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/backups/{backup_id}/create-index`.replace(`{${"backup_id"}}`, encodeURIComponent(String(requestParameters.backupId))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$7.CreateIndexFromBackupRequestToJSON)(requestParameters.createIndexFromBackupRequest)
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.CreateIndexFromBackupResponseFromJSON)(jsonValue));
  }
  /**
   * Create an index from a backup.
   * Create an index from a backup
   */
  async createIndexFromBackupOperation(requestParameters, initOverrides) {
    const response = await this.createIndexFromBackupOperationRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Delete a backup.
   * Delete a backup
   */
  async deleteBackupRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling deleteBackup.");
    }
    if (requestParameters.backupId === null || requestParameters.backupId === void 0) {
      throw new runtime$c.RequiredError("backupId", "Required parameter requestParameters.backupId was null or undefined when calling deleteBackup.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/backups/{backup_id}`.replace(`{${"backup_id"}}`, encodeURIComponent(String(requestParameters.backupId))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.VoidApiResponse(response);
  }
  /**
   * Delete a backup.
   * Delete a backup
   */
  async deleteBackup(requestParameters, initOverrides) {
    await this.deleteBackupRaw(requestParameters, initOverrides);
  }
  /**
   * Delete an existing collection. Serverless indexes do not support collections.
   * Delete a collection
   */
  async deleteCollectionRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling deleteCollection.");
    }
    if (requestParameters.collectionName === null || requestParameters.collectionName === void 0) {
      throw new runtime$c.RequiredError("collectionName", "Required parameter requestParameters.collectionName was null or undefined when calling deleteCollection.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/collections/{collection_name}`.replace(`{${"collection_name"}}`, encodeURIComponent(String(requestParameters.collectionName))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.VoidApiResponse(response);
  }
  /**
   * Delete an existing collection. Serverless indexes do not support collections.
   * Delete a collection
   */
  async deleteCollection(requestParameters, initOverrides) {
    await this.deleteCollectionRaw(requestParameters, initOverrides);
  }
  /**
   * Delete an existing index.
   * Delete an index
   */
  async deleteIndexRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling deleteIndex.");
    }
    if (requestParameters.indexName === null || requestParameters.indexName === void 0) {
      throw new runtime$c.RequiredError("indexName", "Required parameter requestParameters.indexName was null or undefined when calling deleteIndex.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes/{index_name}`.replace(`{${"index_name"}}`, encodeURIComponent(String(requestParameters.indexName))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.VoidApiResponse(response);
  }
  /**
   * Delete an existing index.
   * Delete an index
   */
  async deleteIndex(requestParameters, initOverrides) {
    await this.deleteIndexRaw(requestParameters, initOverrides);
  }
  /**
   * Get a description of a backup.
   * Describe a backup
   */
  async describeBackupRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeBackup.");
    }
    if (requestParameters.backupId === null || requestParameters.backupId === void 0) {
      throw new runtime$c.RequiredError("backupId", "Required parameter requestParameters.backupId was null or undefined when calling describeBackup.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/backups/{backup_id}`.replace(`{${"backup_id"}}`, encodeURIComponent(String(requestParameters.backupId))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.BackupModelFromJSON)(jsonValue));
  }
  /**
   * Get a description of a backup.
   * Describe a backup
   */
  async describeBackup(requestParameters, initOverrides) {
    const response = await this.describeBackupRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Get a description of a collection. Serverless indexes do not support collections.
   * Describe a collection
   */
  async describeCollectionRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeCollection.");
    }
    if (requestParameters.collectionName === null || requestParameters.collectionName === void 0) {
      throw new runtime$c.RequiredError("collectionName", "Required parameter requestParameters.collectionName was null or undefined when calling describeCollection.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/collections/{collection_name}`.replace(`{${"collection_name"}}`, encodeURIComponent(String(requestParameters.collectionName))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.CollectionModelFromJSON)(jsonValue));
  }
  /**
   * Get a description of a collection. Serverless indexes do not support collections.
   * Describe a collection
   */
  async describeCollection(requestParameters, initOverrides) {
    const response = await this.describeCollectionRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Get a description of an index.
   * Describe an index
   */
  async describeIndexRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeIndex.");
    }
    if (requestParameters.indexName === null || requestParameters.indexName === void 0) {
      throw new runtime$c.RequiredError("indexName", "Required parameter requestParameters.indexName was null or undefined when calling describeIndex.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes/{index_name}`.replace(`{${"index_name"}}`, encodeURIComponent(String(requestParameters.indexName))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.IndexModelFromJSON)(jsonValue));
  }
  /**
   * Get a description of an index.
   * Describe an index
   */
  async describeIndex(requestParameters, initOverrides) {
    const response = await this.describeIndexRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Get a description of a restore job.
   * Describe a restore job
   */
  async describeRestoreJobRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeRestoreJob.");
    }
    if (requestParameters.jobId === null || requestParameters.jobId === void 0) {
      throw new runtime$c.RequiredError("jobId", "Required parameter requestParameters.jobId was null or undefined when calling describeRestoreJob.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/restore-jobs/{job_id}`.replace(`{${"job_id"}}`, encodeURIComponent(String(requestParameters.jobId))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.RestoreJobModelFromJSON)(jsonValue));
  }
  /**
   * Get a description of a restore job.
   * Describe a restore job
   */
  async describeRestoreJob(requestParameters, initOverrides) {
    const response = await this.describeRestoreJobRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all collections in a project. Serverless indexes do not support collections.
   * List collections
   */
  async listCollectionsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listCollections.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/collections`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.CollectionListFromJSON)(jsonValue));
  }
  /**
   * List all collections in a project. Serverless indexes do not support collections.
   * List collections
   */
  async listCollections(requestParameters, initOverrides) {
    const response = await this.listCollectionsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all backups for an index.
   * List backups for an index
   */
  async listIndexBackupsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listIndexBackups.");
    }
    if (requestParameters.indexName === null || requestParameters.indexName === void 0) {
      throw new runtime$c.RequiredError("indexName", "Required parameter requestParameters.indexName was null or undefined when calling listIndexBackups.");
    }
    const queryParameters = {};
    if (requestParameters.limit !== void 0) {
      queryParameters["limit"] = requestParameters.limit;
    }
    if (requestParameters.paginationToken !== void 0) {
      queryParameters["paginationToken"] = requestParameters.paginationToken;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes/{index_name}/backups`.replace(`{${"index_name"}}`, encodeURIComponent(String(requestParameters.indexName))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.BackupListFromJSON)(jsonValue));
  }
  /**
   * List all backups for an index.
   * List backups for an index
   */
  async listIndexBackups(requestParameters, initOverrides) {
    const response = await this.listIndexBackupsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all indexes in a project.
   * List indexes
   */
  async listIndexesRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listIndexes.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/indexes`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.IndexListFromJSON)(jsonValue));
  }
  /**
   * List all indexes in a project.
   * List indexes
   */
  async listIndexes(requestParameters, initOverrides) {
    const response = await this.listIndexesRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all backups for a project.
   * List backups for all indexes in a project
   */
  async listProjectBackupsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listProjectBackups.");
    }
    const queryParameters = {};
    if (requestParameters.limit !== void 0) {
      queryParameters["limit"] = requestParameters.limit;
    }
    if (requestParameters.paginationToken !== void 0) {
      queryParameters["paginationToken"] = requestParameters.paginationToken;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/backups`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.BackupListFromJSON)(jsonValue));
  }
  /**
   * List all backups for a project.
   * List backups for all indexes in a project
   */
  async listProjectBackups(requestParameters, initOverrides) {
    const response = await this.listProjectBackupsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all restore jobs for a project.
   * List restore jobs
   */
  async listRestoreJobsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$c.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listRestoreJobs.");
    }
    const queryParameters = {};
    if (requestParameters.limit !== void 0) {
      queryParameters["limit"] = requestParameters.limit;
    }
    if (requestParameters.paginationToken !== void 0) {
      queryParameters["paginationToken"] = requestParameters.paginationToken;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/restore-jobs`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$c.JSONApiResponse(response, (jsonValue) => (0, index_1$7.RestoreJobListFromJSON)(jsonValue));
  }
  /**
   * List all restore jobs for a project.
   * List restore jobs
   */
  async listRestoreJobs(requestParameters, initOverrides) {
    const response = await this.listRestoreJobsRaw(requestParameters, initOverrides);
    return await response.value();
  }
}
ManageIndexesApi$1.ManageIndexesApi = ManageIndexesApi;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(ManageIndexesApi$1, exports);
})(apis$5);
var api_version$5 = {};
Object.defineProperty(api_version$5, "__esModule", { value: true });
api_version$5.X_PINECONE_API_VERSION = void 0;
api_version$5.X_PINECONE_API_VERSION = "2025-10";
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(runtime$d, exports);
  __exportStar(apis$5, exports);
  __exportStar(models$5, exports);
  __exportStar(api_version$5, exports);
})(db_control);
var utils$1 = {};
var debugLog$1 = {};
Object.defineProperty(debugLog$1, "__esModule", { value: true });
debugLog$1.debugLog = void 0;
const debugLog = (str2) => {
  if (typeof process !== "undefined" && process && process.env && process.env.PINECONE_DEBUG) {
    console.log(str2);
  }
};
debugLog$1.debugLog = debugLog;
var normalizeUrl$1 = {};
Object.defineProperty(normalizeUrl$1, "__esModule", { value: true });
normalizeUrl$1.normalizeUrl = normalizeUrl;
function normalizeUrl(url) {
  if (!url || url.trim().length === 0) {
    return;
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return "https://" + url;
  }
  return url;
}
var queryParamsStringify$1 = {};
Object.defineProperty(queryParamsStringify$1, "__esModule", { value: true });
queryParamsStringify$1.queryParamsStringify = queryParamsStringify;
function queryParamsStringify(params, prefix = "") {
  return Object.keys(params).map((key) => querystringSingleKey(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
}
function querystringSingleKey(key, value, keyPrefix = "") {
  const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
  if (Array.isArray(value)) {
    const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
    return `${encodeURIComponent(fullKey)}=${multiValue}`;
  }
  if (value instanceof Set) {
    const valueAsArray = Array.from(value);
    return querystringSingleKey(key, valueAsArray, keyPrefix);
  }
  if (value instanceof Date) {
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
  }
  if (value instanceof Object) {
    return queryParamsStringify(value, fullKey);
  }
  return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
}
var userAgent = {};
var environment = {};
Object.defineProperty(environment, "__esModule", { value: true });
environment.isBrowser = environment.isEdge = void 0;
const isEdge = () => {
  return typeof EdgeRuntime === "string";
};
environment.isEdge = isEdge;
const isBrowser = () => {
  return typeof window !== "undefined";
};
environment.isBrowser = isBrowser;
const name = "@pinecone-database/pinecone";
const version = "7.2.0";
const require$$1 = {
  name,
  version
};
var __createBinding$7 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$7 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$7 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$7(result, mod, k);
  }
  __setModuleDefault$7(result, mod);
  return result;
};
Object.defineProperty(userAgent, "__esModule", { value: true });
userAgent.buildUserAgent = void 0;
const environment_1$1 = environment;
const packageInfo = __importStar$7(require$$1);
const buildUserAgent = (config2) => {
  const userAgentParts = [
    `${packageInfo.name} v${packageInfo.version}`,
    "lang=typescript"
  ];
  if ((0, environment_1$1.isEdge)()) {
    userAgentParts.push("Edge Runtime");
  }
  if (typeof process !== "undefined" && process && process.version) {
    userAgentParts.push(`node ${process.version}`);
  }
  if (config2.sourceTag) {
    userAgentParts.push(`source_tag=${normalizeSourceTag(config2.sourceTag)}`);
  }
  if (config2.caller) {
    const callerString = formatCaller(config2.caller);
    if (callerString) {
      userAgentParts.push(`caller=${callerString}`);
    }
  }
  return userAgentParts.join("; ");
};
userAgent.buildUserAgent = buildUserAgent;
const normalizeSourceTag = (sourceTag) => {
  if (!sourceTag) {
    return;
  }
  return sourceTag.toLowerCase().replace(/[^a-z0-9_ :]/g, "").trim().replace(/[ ]+/g, "_");
};
const formatCaller = (caller) => {
  if (!caller.model) {
    return;
  }
  const normalizedModel = normalizeCallerString(caller.model);
  if (!normalizedModel) {
    return;
  }
  if (caller.provider) {
    const normalizedProvider = normalizeCallerString(caller.provider);
    if (normalizedProvider) {
      return `${normalizedProvider}:${normalizedModel}`;
    }
  }
  return normalizedModel;
};
const normalizeCallerString = (str2) => {
  if (!str2) {
    return;
  }
  return str2.toLowerCase().replace(/:/g, "_").replace(/[^a-z0-9_ \-.]/g, "").trim().replace(/[ ]+/g, "_");
};
var fetch$2 = {};
var errors = {};
var config = {};
var base = {};
Object.defineProperty(base, "__esModule", { value: true });
base.BasePineconeError = void 0;
class BasePineconeError extends Error {
  /** The underlying error, if any. */
  cause;
  constructor(message, cause) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
    this.name = this.constructor.name;
    this.cause = cause;
  }
}
base.BasePineconeError = BasePineconeError;
Object.defineProperty(config, "__esModule", { value: true });
config.PineconeUnableToResolveHostError = config.PineconeEnvironmentVarsNotSupportedError = config.PineconeUnexpectedResponseError = config.PineconeConfigurationError = void 0;
const base_1$3 = base;
const CONFIG_HELP$1 = `You can find the configuration values for your project in the Pinecone developer console at https://app.pinecone.io.`;
class PineconeConfigurationError extends base_1$3.BasePineconeError {
  constructor(message) {
    super(`${message} ${CONFIG_HELP$1}`);
    this.name = "PineconeConfigurationError";
  }
}
config.PineconeConfigurationError = PineconeConfigurationError;
class PineconeUnexpectedResponseError extends base_1$3.BasePineconeError {
  constructor(url, status, body, message) {
    super(`Unexpected response while calling ${url}. ${message ? message + " " : ""}Status: ${status}. Body: ${body}`);
    this.name = "PineconeUnexpectedResponseError";
  }
}
config.PineconeUnexpectedResponseError = PineconeUnexpectedResponseError;
class PineconeEnvironmentVarsNotSupportedError extends base_1$3.BasePineconeError {
  constructor(message) {
    super(message);
    this.name = "PineconeEnvironmentVarsNotSupportedError";
  }
}
config.PineconeEnvironmentVarsNotSupportedError = PineconeEnvironmentVarsNotSupportedError;
class PineconeUnableToResolveHostError extends base_1$3.BasePineconeError {
  constructor(message) {
    super(message);
    this.name = "PineconeUnableToResolveHostError";
  }
}
config.PineconeUnableToResolveHostError = PineconeUnableToResolveHostError;
var http = {};
Object.defineProperty(http, "__esModule", { value: true });
http.mapHttpStatusError = http.PineconeUnmappedHttpError = http.PineconeNotImplementedError = http.PineconeUnavailableError = http.PineconeMaxRetriesExceededError = http.PineconeInternalServerError = http.PineconeConflictError = http.PineconeNotFoundError = http.PineconeAuthorizationError = http.PineconeBadRequestError = void 0;
const base_1$2 = base;
const CONFIG_HELP = `You can find the configuration values for your project in the Pinecone developer console at https://app.pinecone.io`;
class PineconeBadRequestError extends base_1$2.BasePineconeError {
  constructor(failedRequest) {
    const { message } = failedRequest;
    super(message);
    this.name = "PineconeBadRequestError";
  }
}
http.PineconeBadRequestError = PineconeBadRequestError;
class PineconeAuthorizationError extends base_1$2.BasePineconeError {
  constructor(failedRequest) {
    const { url } = failedRequest;
    if (url) {
      super(`The API key you provided was rejected while calling ${url}. Please check your configuration values and try again. ${CONFIG_HELP}`);
    } else {
      super(`The API key you provided was rejected. Please check your configuration values and try again. ${CONFIG_HELP}`);
    }
    this.name = "PineconeAuthorizationError";
  }
}
http.PineconeAuthorizationError = PineconeAuthorizationError;
class PineconeNotFoundError extends base_1$2.BasePineconeError {
  constructor(failedRequest) {
    const { url } = failedRequest;
    if (url) {
      super(`A call to ${url} returned HTTP status 404.`);
    } else {
      super("The requested resource could not be found.");
    }
    this.name = "PineconeNotFoundError";
  }
}
http.PineconeNotFoundError = PineconeNotFoundError;
class PineconeConflictError extends base_1$2.BasePineconeError {
  constructor(failedRequest) {
    const { url, message } = failedRequest;
    if (url) {
      super(`A call to ${url} returned HTTP status 409. ${message ? message : ""}`);
    } else {
      super("The resource you are attempting to create already exists.");
    }
    this.name = "PineconeConflictError";
  }
}
http.PineconeConflictError = PineconeConflictError;
class PineconeInternalServerError extends base_1$2.BasePineconeError {
  constructor(failedRequest) {
    const { url, body, status } = failedRequest;
    const intro = url ? `An internal server error occurred while calling the ${url} endpoint.` : "";
    const help = `To see overall service health and learn whether this seems like a large-scale problem or one specific to your request, please go to https://status.pinecone.io/ to view our status page. If you believe the error reflects a problem with this client, please file a bug report in the github issue tracker at https://github.com/pinecone-io/pinecone-ts-client`;
    const statusMessage = status ? `Status Code: ${status}.` : "";
    const bodyMessage = body ? `Body: ${body}` : "";
    super([intro, statusMessage, help, bodyMessage].join(" ").trim());
    this.name = "PineconeInternalServerError";
  }
}
http.PineconeInternalServerError = PineconeInternalServerError;
class PineconeMaxRetriesExceededError extends base_1$2.BasePineconeError {
  constructor(retries) {
    const intro = `You have exceeded the max configured retries (${retries}). `;
    const help = "Increase the maxRetries field in the RetryOptions object to retry more times. If you believe the error reflects a problem with this client, please file a bug report in the github issue tracker at https://github.com/pinecone-io/pinecone-ts-client";
    super([intro, help].join(" ").trim());
    this.name = "PineconeMaxRetriesExceededError";
  }
}
http.PineconeMaxRetriesExceededError = PineconeMaxRetriesExceededError;
class PineconeUnavailableError extends base_1$2.BasePineconeError {
  constructor(failedRequest) {
    const { url, body, status } = failedRequest;
    const intro = url ? `The Pinecone service (${url}) is temporarily unavailable.` : "";
    const statusMessage = status ? `Status Code: ${status}.` : "";
    const help = `To see overall service health and learn whether this seems like a large-scale problem or one specific to your request, please go to https://status.pinecone.io/ to view our status page. If you believe the error reflects a problem with this client, please file a bug report in the github issue tracker at https://github.com/pinecone-io/pinecone-ts-client`;
    const bodyMessage = body ? `Body: ${body}` : "";
    super([intro, statusMessage, help, bodyMessage].join(" ").trim());
    this.name = "PineconeUnavailableError";
  }
}
http.PineconeUnavailableError = PineconeUnavailableError;
class PineconeNotImplementedError extends base_1$2.BasePineconeError {
  constructor(requestInfo) {
    const { url, message } = requestInfo;
    if (url) {
      super(`A call to ${url} returned HTTP status 501. ${message ? message : ""}`);
    } else {
      super();
    }
    this.name = "PineconeNotImplementedError";
  }
}
http.PineconeNotImplementedError = PineconeNotImplementedError;
class PineconeUnmappedHttpError extends base_1$2.BasePineconeError {
  constructor(failedRequest) {
    const { url, status, body, message } = failedRequest;
    const intro = url ? `An unexpected error occured while calling the ${url} endpoint. ` : "";
    const statusMsg = status ? `Status: ${status}. ` : "";
    const bodyMsg = body ? `Body: ${body}` : "";
    super([intro, message, statusMsg, bodyMsg].join(" ").trim());
    this.name = "PineconeUnmappedHttpError";
  }
}
http.PineconeUnmappedHttpError = PineconeUnmappedHttpError;
const mapHttpStatusError = (failedRequestInfo) => {
  switch (failedRequestInfo.status) {
    case 400:
      return new PineconeBadRequestError(failedRequestInfo);
    case 401:
      return new PineconeAuthorizationError(failedRequestInfo);
    case 403:
      return new PineconeBadRequestError(failedRequestInfo);
    case 404:
      return new PineconeNotFoundError(failedRequestInfo);
    case 409:
      return new PineconeConflictError(failedRequestInfo);
    case 500:
      return new PineconeInternalServerError(failedRequestInfo);
    case 501:
      return new PineconeNotImplementedError(failedRequestInfo);
    case 503:
      return new PineconeUnavailableError(failedRequestInfo);
    default:
      throw new PineconeUnmappedHttpError(failedRequestInfo);
  }
};
http.mapHttpStatusError = mapHttpStatusError;
var request = {};
Object.defineProperty(request, "__esModule", { value: true });
request.PineconeRequestError = request.PineconeConnectionError = void 0;
const base_1$1 = base;
class PineconeConnectionError extends base_1$1.BasePineconeError {
  constructor(e, url) {
    let urlMessage = "";
    if (url) {
      urlMessage = ` while calling ${url}`;
    }
    super(`Request failed to reach Pinecone${urlMessage}. This can occur for reasons such as network problems that prevent the request from being completed, or a Pinecone API outage. Check your network connection, and visit https://status.pinecone.io/ to see whether any outages are ongoing.`, e);
    this.name = "PineconeConnectionError";
  }
}
request.PineconeConnectionError = PineconeConnectionError;
class PineconeRequestError extends base_1$1.BasePineconeError {
  constructor(context2) {
    if (context2.response) {
      super(`Request failed during a call to ${context2.init.method} ${context2.url} with status ${context2.response.status}`, context2.error);
    } else {
      super(`Request failed during a call to ${context2.init.method} ${context2.url}`, context2.error);
    }
  }
}
request.PineconeRequestError = PineconeRequestError;
var validation = {};
Object.defineProperty(validation, "__esModule", { value: true });
validation.PineconeArgumentError = void 0;
const base_1 = base;
class PineconeArgumentError extends base_1.BasePineconeError {
  constructor(message) {
    super(`${message}`);
    this.name = "PineconeArgumentError";
  }
}
validation.PineconeArgumentError = PineconeArgumentError;
var utils = {};
Object.defineProperty(utils, "__esModule", { value: true });
utils.extractMessage = void 0;
const extractMessage = async (error) => {
  let message = await error.response.text();
  try {
    const messageJSON = JSON.parse(message);
    if (messageJSON.message) {
      message = messageJSON.message;
    }
  } catch (e) {
  }
  return message;
};
utils.extractMessage = extractMessage;
var handling = {};
Object.defineProperty(handling, "__esModule", { value: true });
handling.handleApiError = void 0;
const utils_1$e = utils;
const http_1 = http;
const request_1 = request;
const handleApiError = async (e, customMessage, url) => {
  if (e instanceof Error && e.name === "ResponseError") {
    const responseError = e;
    const rawMessage = await (0, utils_1$e.extractMessage)(responseError);
    const statusCode = responseError.response.status;
    const message = customMessage ? await customMessage(statusCode, rawMessage) : rawMessage;
    return (0, http_1.mapHttpStatusError)({
      status: responseError.response.status,
      url: responseError.response.url || url,
      message
    });
  } else if (e instanceof request_1.PineconeConnectionError) {
    return e;
  } else {
    const err = e;
    return new request_1.PineconeConnectionError(err);
  }
};
handling.handleApiError = handleApiError;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.handleApiError = exports.extractMessage = exports.PineconeArgumentError = exports.BasePineconeError = exports.PineconeRequestError = exports.PineconeConnectionError = exports.PineconeUnableToResolveHostError = exports.PineconeEnvironmentVarsNotSupportedError = exports.PineconeUnexpectedResponseError = exports.PineconeConfigurationError = void 0;
  var config_1 = config;
  Object.defineProperty(exports, "PineconeConfigurationError", { enumerable: true, get: function() {
    return config_1.PineconeConfigurationError;
  } });
  Object.defineProperty(exports, "PineconeUnexpectedResponseError", { enumerable: true, get: function() {
    return config_1.PineconeUnexpectedResponseError;
  } });
  Object.defineProperty(exports, "PineconeEnvironmentVarsNotSupportedError", { enumerable: true, get: function() {
    return config_1.PineconeEnvironmentVarsNotSupportedError;
  } });
  Object.defineProperty(exports, "PineconeUnableToResolveHostError", { enumerable: true, get: function() {
    return config_1.PineconeUnableToResolveHostError;
  } });
  __exportStar(http, exports);
  var request_12 = request;
  Object.defineProperty(exports, "PineconeConnectionError", { enumerable: true, get: function() {
    return request_12.PineconeConnectionError;
  } });
  Object.defineProperty(exports, "PineconeRequestError", { enumerable: true, get: function() {
    return request_12.PineconeRequestError;
  } });
  var base_12 = base;
  Object.defineProperty(exports, "BasePineconeError", { enumerable: true, get: function() {
    return base_12.BasePineconeError;
  } });
  var validation_1 = validation;
  Object.defineProperty(exports, "PineconeArgumentError", { enumerable: true, get: function() {
    return validation_1.PineconeArgumentError;
  } });
  var utils_12 = utils;
  Object.defineProperty(exports, "extractMessage", { enumerable: true, get: function() {
    return utils_12.extractMessage;
  } });
  var handling_1 = handling;
  Object.defineProperty(exports, "handleApiError", { enumerable: true, get: function() {
    return handling_1.handleApiError;
  } });
})(errors);
Object.defineProperty(fetch$2, "__esModule", { value: true });
fetch$2.getNonRetryingFetch = fetch$2.getFetch = void 0;
const errors_1$I = errors;
const isRetryableError = (error) => {
  if (error?.name) {
    if (["PineconeUnavailableError", "PineconeInternalServerError"].includes(error.name)) {
      return true;
    }
  }
  if (error?.status && error.status >= 500) {
    return true;
  }
  return false;
};
const isRetryableResponse = (response) => {
  return response.status >= 500;
};
const calculateRetryDelay = (attempt, baseDelay, maxDelay, jitterFactor) => {
  let delayMs = baseDelay * 2 ** attempt;
  const jitter = delayMs * jitterFactor * (Math.random() - 0.5);
  delayMs += jitter;
  return Math.min(maxDelay, Math.max(0, delayMs));
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getFetch = (config2) => {
  const baseFetch = getBaseFetch(config2);
  return createRetryingFetch(baseFetch, {
    maxRetries: config2.maxRetries
  });
};
fetch$2.getFetch = getFetch;
const getNonRetryingFetch = (config2) => {
  return getBaseFetch(config2);
};
fetch$2.getNonRetryingFetch = getNonRetryingFetch;
function getBaseFetch(config2) {
  if (config2.fetchApi) {
    return config2.fetchApi;
  } else if (commonjsGlobal.fetch) {
    return commonjsGlobal.fetch;
  } else {
    throw new errors_1$I.PineconeConfigurationError("No global or user-provided fetch implementations found. Please supply a fetch implementation.");
  }
}
function createRetryingFetch(fetchFn, config2 = {}) {
  const maxRetries = Math.min(config2.maxRetries ?? 3, 10);
  const baseDelay = config2.baseDelay ?? 200;
  const maxDelay = config2.maxDelay ?? 2e4;
  const jitterFactor = config2.jitterFactor ?? 0.25;
  return async (url, init) => {
    let attempt = 1;
    const totalAttempts = 1 + maxRetries;
    while (attempt <= totalAttempts) {
      try {
        const response = await fetchFn(url, init);
        if (response.status >= 200 && response.status < 300) {
          return response;
        }
        if (!isRetryableResponse(response)) {
          return response;
        }
        if (attempt >= totalAttempts) {
          throw new errors_1$I.PineconeMaxRetriesExceededError(maxRetries);
        }
        await delay(calculateRetryDelay(attempt - 1, baseDelay, maxDelay, jitterFactor));
        attempt++;
      } catch (error) {
        if (error instanceof errors_1$I.PineconeMaxRetriesExceededError) {
          throw error;
        }
        if (!isRetryableError(error)) {
          throw error;
        }
        if (attempt >= totalAttempts) {
          throw new errors_1$I.PineconeMaxRetriesExceededError(maxRetries);
        }
        await delay(calculateRetryDelay(attempt - 1, baseDelay, maxDelay, jitterFactor));
        attempt++;
      }
    }
    throw new errors_1$I.PineconeMaxRetriesExceededError(maxRetries);
  };
}
var chatStream$2 = {};
var convertKeys = {};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.convertKeysToCamelCase = void 0;
  const convertKeysToCamelCase = (object) => {
    if (Array.isArray(object)) {
      return object.map((item) => (0, exports.convertKeysToCamelCase)(item));
    } else if (object !== null && typeof object === "object") {
      return Object.entries(object).reduce((acc, [key, value]) => {
        const camelKey = toCamelCase(key);
        acc[camelKey] = (0, exports.convertKeysToCamelCase)(value);
        return acc;
      }, {});
    }
    return object;
  };
  exports.convertKeysToCamelCase = convertKeysToCamelCase;
  const toCamelCase = (str2) => str2.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
})(convertKeys);
Object.defineProperty(chatStream$2, "__esModule", { value: true });
chatStream$2.ChatStream = void 0;
const convertKeys_1 = convertKeys;
class ChatStream {
  stream;
  constructor(stream) {
    this.stream = stream;
  }
  async *[Symbol.asyncIterator]() {
    let buffer = "";
    for await (const chunk of this.stream) {
      buffer += chunk.toString();
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line && line.startsWith("data:")) {
          const json = line.slice(5).trim();
          try {
            const parsedJson = JSON.parse(json);
            const convertedJson = (0, convertKeys_1.convertKeysToCamelCase)(parsedJson);
            yield convertedJson;
          } catch (err) {
            console.debug(`Skipping malformed JSON:${line}`);
            continue;
          }
        }
      }
    }
    if (buffer.trim()) {
      try {
        const parsedJson = JSON.parse(buffer);
        const convertedJson = (0, convertKeys_1.convertKeysToCamelCase)(parsedJson);
        yield convertedJson;
      } catch (err) {
        console.debug(`Skipping malformed JSON:${buffer}`);
      }
    }
  }
}
chatStream$2.ChatStream = ChatStream;
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ChatStream = exports.convertKeysToCamelCase = exports.getNonRetryingFetch = exports.getFetch = exports.buildUserAgent = exports.queryParamsStringify = exports.normalizeUrl = exports.debugLog = void 0;
  const debugLog_1 = debugLog$1;
  Object.defineProperty(exports, "debugLog", { enumerable: true, get: function() {
    return debugLog_1.debugLog;
  } });
  const normalizeUrl_1 = normalizeUrl$1;
  Object.defineProperty(exports, "normalizeUrl", { enumerable: true, get: function() {
    return normalizeUrl_1.normalizeUrl;
  } });
  const queryParamsStringify_1 = queryParamsStringify$1;
  Object.defineProperty(exports, "queryParamsStringify", { enumerable: true, get: function() {
    return queryParamsStringify_1.queryParamsStringify;
  } });
  const user_agent_1 = userAgent;
  Object.defineProperty(exports, "buildUserAgent", { enumerable: true, get: function() {
    return user_agent_1.buildUserAgent;
  } });
  const fetch_12 = fetch$2;
  Object.defineProperty(exports, "getFetch", { enumerable: true, get: function() {
    return fetch_12.getFetch;
  } });
  Object.defineProperty(exports, "getNonRetryingFetch", { enumerable: true, get: function() {
    return fetch_12.getNonRetryingFetch;
  } });
  const chatStream_1 = chatStream$2;
  Object.defineProperty(exports, "ChatStream", { enumerable: true, get: function() {
    return chatStream_1.ChatStream;
  } });
  const convertKeys_12 = convertKeys;
  Object.defineProperty(exports, "convertKeysToCamelCase", { enumerable: true, get: function() {
    return convertKeys_12.convertKeysToCamelCase;
  } });
})(utils$1);
var middleware = {};
Object.defineProperty(middleware, "__esModule", { value: true });
middleware.createMiddlewareArray = void 0;
const db_control_1$g = db_control;
const errors_1$H = errors;
const createMiddlewareArray = () => {
  const debugMiddleware = [];
  const chalk = (str2, color) => {
    const colors = {
      blue: "\x1B[34m",
      red: "\x1B[31m",
      green: "\x1B[32m",
      yellow: "\x1B[33m"
    };
    return colors[color] + str2 + "\x1B[39m";
  };
  if (typeof process !== "undefined" && process && process.env && process.env.PINECONE_DEBUG) {
    const debugLogMiddleware = {
      pre: async (context2) => {
        console.debug(chalk(`>>> Request: ${context2.init.method} ${context2.url}`, "blue"));
        const headers = JSON.parse(JSON.stringify(context2.init.headers));
        headers["Api-Key"] = "***REDACTED***";
        console.debug(chalk(`>>> Headers: ${JSON.stringify(headers)}`, "blue"));
        if (context2.init.body) {
          console.debug(chalk(`>>> Body: ${context2.init.body}`, "blue"));
        }
        console.debug("");
      },
      post: async (context2) => {
        console.debug(chalk(`<<< Status: ${context2.response.status}`, "green"));
        console.debug(chalk(`<<< Body: ${await context2.response.text()}`, "green"));
        console.debug("");
      }
    };
    debugMiddleware.push(debugLogMiddleware);
  }
  if (typeof process !== "undefined" && process && process.env && process.env.PINECONE_DEBUG_CURL) {
    const debugCurlMiddleware = {
      post: async (context2) => {
        let headers = `-H "Api-Key: ${(context2.init.headers || {})["Api-Key"]}"`;
        if (context2.init.headers && context2.init.headers["Content-Type"]) {
          headers += ` -H "Content-Type: ${context2.init.headers["Content-Type"]}"`;
        }
        const cmd = `curl -X ${context2.init.method} ${context2.url} ${headers} ${context2.init.body ? `-d '${context2.init.body}'` : ""}`;
        console.debug(chalk(cmd, "red"));
        console.debug("");
      }
    };
    debugMiddleware.push(debugCurlMiddleware);
  }
  return [
    ...debugMiddleware,
    // Error handling middleware - converts ResponseErrors to proper Pinecone error types
    {
      onError: async (context2) => {
        if (context2.error instanceof errors_1$H.PineconeMaxRetriesExceededError) {
          throw context2.error;
        }
        const err = await (0, errors_1$H.handleApiError)(context2.error, void 0, context2.url);
        throw err;
      },
      post: async (context2) => {
        const { response } = context2;
        if (response.status >= 200 && response.status < 300) {
          return response;
        }
        const err = await (0, errors_1$H.handleApiError)(new db_control_1$g.ResponseError(response, "Response returned an error"), void 0, context2.url);
        throw err;
      }
    }
  ];
};
middleware.createMiddlewareArray = createMiddlewareArray;
Object.defineProperty(indexOperationsBuilder$1, "__esModule", { value: true });
indexOperationsBuilder$1.indexOperationsBuilder = void 0;
const db_control_1$f = db_control;
const utils_1$d = utils$1;
const middleware_1$7 = middleware;
const indexOperationsBuilder = (config2) => {
  const { apiKey } = config2;
  const controllerPath = (0, utils_1$d.normalizeUrl)(config2.controllerHostUrl) || "https://api.pinecone.io";
  const headers = config2.additionalHeaders || null;
  const apiConfig = {
    basePath: controllerPath,
    apiKey,
    queryParamsStringify: utils_1$d.queryParamsStringify,
    headers: {
      "User-Agent": (0, utils_1$d.buildUserAgent)(config2),
      "X-Pinecone-Api-Version": db_control_1$f.X_PINECONE_API_VERSION,
      ...headers
    },
    fetchApi: (0, utils_1$d.getFetch)(config2),
    middleware: (0, middleware_1$7.createMiddlewareArray)()
  };
  return new db_control_1$f.ManageIndexesApi(new db_control_1$f.Configuration(apiConfig));
};
indexOperationsBuilder$1.indexOperationsBuilder = indexOperationsBuilder;
var configureIndex = {};
var createIndex = {};
var types = {};
Object.defineProperty(types, "__esModule", { value: true });
types.ValidPodTypes = void 0;
types.ValidPodTypes = [
  "s1.x1",
  "s1.x2",
  "s1.x4",
  "s1.x8",
  "p1.x1",
  "p1.x2",
  "p1.x4",
  "p1.x8",
  "p2.x1",
  "p2.x2",
  "p2.x4",
  "p2.x8"
];
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.toApiReadCapacity = exports.isDedicated = exports.validateReadCapacity = exports.waitUntilIndexIsReady = exports.createIndex = void 0;
  const db_control_12 = db_control;
  const utils_12 = utils$1;
  const types_1 = types;
  const errors_12 = errors;
  const createIndex2 = (api) => {
    return async (options) => {
      if (!options) {
        throw new errors_12.PineconeArgumentError("You must pass an object with required properties (`name`, `dimension`, `spec`) to create an index.");
      }
      if (options.vectorType && options.vectorType.toLowerCase() === "sparse") {
        if (!options.metric) {
          options.metric = "dotproduct";
        }
      } else {
        if (!options.metric) {
          options.metric = "cosine";
        }
      }
      validateCreateIndexRequest(options);
      try {
        let spec;
        if (options.spec.serverless) {
          spec = {
            serverless: {
              ...options.spec.serverless,
              readCapacity: (0, exports.toApiReadCapacity)(options.spec.serverless.readCapacity)
            }
          };
        } else if (options.spec.byoc) {
          spec = {
            byoc: {
              ...options.spec.byoc,
              readCapacity: (0, exports.toApiReadCapacity)(options.spec.byoc.readCapacity)
            }
          };
        } else {
          spec = { pod: options.spec.pod };
        }
        const createRequest = {
          ...options,
          spec
        };
        const createResponse = await api.createIndex({
          createIndexRequest: createRequest,
          xPineconeApiVersion: db_control_12.X_PINECONE_API_VERSION
        });
        if (options.waitUntilReady) {
          return await (0, exports.waitUntilIndexIsReady)(api, options.name);
        }
        return createResponse;
      } catch (e) {
        if (!(options.suppressConflicts && e instanceof Error && e.name === "PineconeConflictError")) {
          throw e;
        }
      }
    };
  };
  exports.createIndex = createIndex2;
  const waitUntilIndexIsReady = async (api, indexName, seconds = 0) => {
    try {
      const indexDescription = await api.describeIndex({
        indexName,
        xPineconeApiVersion: db_control_12.X_PINECONE_API_VERSION
      });
      if (!indexDescription.status?.ready) {
        await new Promise((r) => setTimeout(r, 1e3));
        return await (0, exports.waitUntilIndexIsReady)(api, indexName, seconds + 1);
      } else {
        (0, utils_12.debugLog)(`Index ${indexName} is ready after ${seconds}`);
        return indexDescription;
      }
    } catch (e) {
      const err = await (0, errors_12.handleApiError)(e, async (_, rawMessageText) => `Error creating index ${indexName}: ${rawMessageText}`);
      throw err;
    }
  };
  exports.waitUntilIndexIsReady = waitUntilIndexIsReady;
  const validateCreateIndexRequest = (options) => {
    if (!options.name) {
      throw new errors_12.PineconeArgumentError("You must pass a non-empty string for `name` in order to create an index.");
    }
    if (options.dimension && options.dimension <= 0) {
      throw new errors_12.PineconeArgumentError("You must pass a positive integer for `dimension` in order to create an index.");
    }
    if (!options.spec) {
      throw new errors_12.PineconeArgumentError("You must pass a `pods`, `serverless`, or `byoc` `spec` object in order to create an index.");
    }
    if (options.metric && !["cosine", "euclidean", "dotproduct"].includes(options.metric.toLowerCase())) {
      {
        throw new errors_12.PineconeArgumentError(`Invalid metric value: ${options.metric}. Valid values are: 'cosine', 'euclidean', or 'dotproduct.'`);
      }
    }
    if (options.spec.serverless) {
      const vectorType = options.vectorType ? options.vectorType.toLowerCase() : "dense";
      if (vectorType !== "dense" && vectorType !== "sparse") {
        throw new errors_12.PineconeArgumentError("Invalid `vectorType` value. Valid values are `dense` or `sparse`.");
      }
      if (vectorType == "sparse") {
        if (options.dimension && options.dimension > 0) {
          throw new errors_12.PineconeArgumentError("Sparse indexes cannot have a `dimension`.");
        }
        if (options.metric && options.metric !== "dotproduct") {
          throw new errors_12.PineconeArgumentError("Sparse indexes must have a `metric` of `dotproduct`.");
        }
      } else if (vectorType == "dense") {
        if (!options.dimension || options.dimension <= 0) {
          throw new errors_12.PineconeArgumentError("You must pass a positive `dimension` when creating a dense index.");
        }
      }
      if (!options.spec.serverless.cloud) {
        throw new errors_12.PineconeArgumentError("You must pass a `cloud` for the serverless `spec` object in order to create an index.");
      }
      if (options.spec.serverless.cloud && !["aws", "gcp", "azure"].includes(options.spec.serverless.cloud.toLowerCase())) {
        throw new errors_12.PineconeArgumentError(`Invalid cloud value: ${options.spec.serverless.cloud}. Valid values are: aws, gcp, or azure.`);
      }
      if (!options.spec.serverless.region) {
        throw new errors_12.PineconeArgumentError("You must pass a `region` for the serverless `spec` object in order to create an index.");
      }
      if (options.spec.serverless.readCapacity) {
        (0, exports.validateReadCapacity)(options.spec.serverless.readCapacity);
      }
    } else if (options.spec.pod) {
      if (!options.spec.pod.environment) {
        throw new errors_12.PineconeArgumentError("You must pass an `environment` for the pod `spec` object in order to create an index.");
      }
      if (!options.dimension || options.dimension <= 0) {
        throw new errors_12.PineconeArgumentError("You must pass a positive `dimension` when creating a dense index.");
      }
      const vectorType = "dense";
      if (options.vectorType && options.vectorType.toLowerCase() !== vectorType) {
        throw new errors_12.PineconeArgumentError("Pod indexes must have a `vectorType` of `dense`.");
      }
      if (!options.spec.pod.podType) {
        throw new errors_12.PineconeArgumentError("You must pass a `podType` for the pod `spec` object in order to create an index.");
      }
      if (options.spec.pod.replicas && options.spec.pod.replicas <= 0) {
        throw new errors_12.PineconeArgumentError("You must pass a positive integer for `replicas` in order to create an index.");
      }
      if (options.spec.pod.pods && options.spec.pod.pods <= 0) {
        throw new errors_12.PineconeArgumentError("You must pass a positive integer for `pods` in order to create an index.");
      }
      if (!types_1.ValidPodTypes.includes(options.spec.pod.podType)) {
        throw new errors_12.PineconeArgumentError(`Invalid pod type: ${options.spec.pod.podType}. Valid values are: ${types_1.ValidPodTypes.join(", ")}.`);
      }
    } else if (options.spec.byoc) {
      if (!options.spec.byoc.environment) {
        throw new errors_12.PineconeArgumentError("You must pass an `environment` for the `CreateIndexByocSpec` object to create an index.");
      }
      if (options.spec.byoc.readCapacity) {
        (0, exports.validateReadCapacity)(options.spec.byoc.readCapacity);
      }
    }
  };
  const validateReadCapacity = (readCapacity) => {
    if (!readCapacity)
      return;
    const mode = readCapacity.mode;
    if (mode && mode.toLowerCase() !== "ondemand" && mode.toLowerCase() !== "dedicated") {
      throw new errors_12.PineconeArgumentError(`Invalid read capacity mode: ${mode}. Valid values are: 'OnDemand' or 'Dedicated'.`);
    }
    if (!(0, exports.isDedicated)(readCapacity)) {
      return;
    }
    const { nodeType, manual } = readCapacity;
    if (!nodeType || !["b1", "t1"].includes(nodeType)) {
      throw new errors_12.PineconeArgumentError(`Invalid node type: ${nodeType}. Valid values are: 'b1' or 't1'.`);
    }
    if (!manual) {
      throw new errors_12.PineconeArgumentError("CreateIndexReadCapacity.manual is required for dedicated mode.");
    }
    const { replicas, shards } = manual;
    if (!Number.isInteger(replicas) || replicas < 0) {
      throw new errors_12.PineconeArgumentError("CreateIndexReadCapacity.manual.replicas must be 0 or a positive integer.");
    }
    if (!Number.isInteger(shards) || shards <= 0) {
      throw new errors_12.PineconeArgumentError("CreateIndexReadCapacity.manual.shards must be a positive integer.");
    }
  };
  exports.validateReadCapacity = validateReadCapacity;
  const isDedicated = (rc) => !!rc && typeof rc === "object" && (rc.mode?.toLowerCase() === "dedicated" || "nodeType" in rc || "manual" in rc);
  exports.isDedicated = isDedicated;
  const toApiReadCapacity = (rc) => {
    if (!rc)
      return void 0;
    if (!(0, exports.isDedicated)(rc)) {
      return { mode: "OnDemand" };
    }
    const { nodeType, manual } = rc;
    return {
      mode: "Dedicated",
      dedicated: {
        nodeType,
        scaling: "Manual",
        manual: {
          replicas: manual.replicas,
          shards: manual.shards
        }
      }
    };
  };
  exports.toApiReadCapacity = toApiReadCapacity;
})(createIndex);
var describeIndex$1 = {};
Object.defineProperty(describeIndex$1, "__esModule", { value: true });
describeIndex$1.describeIndex = void 0;
const db_control_1$e = db_control;
const errors_1$G = errors;
const describeIndex = (api) => {
  const removeDeprecatedFields = (result) => {
    if (result.database) {
      for (const key of Object.keys(result.database)) {
        if (result.database[key] === void 0) {
          delete result.database[key];
        }
      }
    }
  };
  return async (indexName) => {
    if (!indexName) {
      throw new errors_1$G.PineconeArgumentError("You must pass a non-empty string for `name` in order to describe an index");
    }
    const result = await api.describeIndex({
      indexName,
      xPineconeApiVersion: db_control_1$e.X_PINECONE_API_VERSION
    });
    removeDeprecatedFields(result);
    return result;
  };
};
describeIndex$1.describeIndex = describeIndex;
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getIndexSpecType = exports.configureIndex = void 0;
  const db_control_12 = db_control;
  const errors_12 = errors;
  const createIndex_12 = createIndex;
  const describeIndex_1 = describeIndex$1;
  const configureIndex2 = (api) => {
    const validator = (options) => {
      if (!options.name) {
        throw new errors_12.PineconeArgumentError("You must pass a non-empty string for `name` to configureIndex.");
      }
      if (!options.deletionProtection && !options.tags && !options.embed && options.podReplicas === void 0 && options.podType === void 0 && options.readCapacity === void 0) {
        throw new errors_12.PineconeArgumentError("You must pass at least one configuration option to configureIndex.");
      }
      if (options.readCapacity) {
        (0, createIndex_12.validateReadCapacity)(options.readCapacity);
      }
    };
    return async (options) => {
      validator(options);
      const needsSpecType = options.podReplicas !== void 0 || options.podType !== void 0 || options.readCapacity !== void 0;
      let specType = "unknown";
      if (needsSpecType) {
        const indexDescription = await (0, describeIndex_1.describeIndex)(api)(options.name);
        specType = (0, exports.getIndexSpecType)(indexDescription.spec);
      }
      if (specType === "pod" && options.readCapacity !== void 0) {
        throw new errors_12.PineconeArgumentError("Cannot configure readCapacity on a pod index; readCapacity is only supported for serverless and BYOC indexes.");
      }
      if ((specType === "serverless" || specType === "byoc") && (options.podReplicas !== void 0 || options.podType !== void 0)) {
        throw new errors_12.PineconeArgumentError(`Cannot configure podReplicas or podType on a ${specType} index; these parameters are only supported for pod indexes.`);
      }
      if (needsSpecType && specType === "unknown") {
        throw new errors_12.PineconeArgumentError("Could not determine the index spec type. Verify the index exists and try again.");
      }
      const spec = buildConfigureSpec(options, specType);
      const request2 = {
        deletionProtection: options.deletionProtection,
        tags: options.tags,
        embed: options.embed,
        spec
      };
      return await api.configureIndex({
        xPineconeApiVersion: db_control_12.X_PINECONE_API_VERSION,
        indexName: options.name,
        configureIndexRequest: request2
      });
    };
  };
  exports.configureIndex = configureIndex2;
  const getIndexSpecType = (spec) => {
    if (spec == null || typeof spec !== "object") {
      return "unknown";
    }
    if ("serverless" in spec && spec.serverless != null && typeof spec.serverless === "object") {
      return "serverless";
    }
    if ("byoc" in spec && spec.byoc != null && typeof spec.byoc === "object") {
      return "byoc";
    }
    if ("pod" in spec && spec.pod != null && typeof spec.pod === "object") {
      return "pod";
    }
    return "unknown";
  };
  exports.getIndexSpecType = getIndexSpecType;
  const buildConfigureSpec = (options, specType) => {
    const hasPod = options.podReplicas !== void 0 || options.podType !== void 0;
    const hasReadCapacity = options.readCapacity !== void 0;
    if (hasPod && hasReadCapacity) {
      throw new errors_12.PineconeArgumentError("Cannot configure both pod (podReplicas/podType) and readCapacity in the same request; these parameters are mutually exclusive.");
    }
    if (hasPod && specType === "pod") {
      return {
        pod: {
          replicas: options.podReplicas,
          podType: options.podType
        }
      };
    }
    if (hasReadCapacity && specType === "serverless") {
      return {
        serverless: {
          readCapacity: (0, createIndex_12.toApiReadCapacity)(options.readCapacity)
        }
      };
    }
    if (hasReadCapacity && specType === "byoc") {
      return {
        byoc: {
          readCapacity: (0, createIndex_12.toApiReadCapacity)(options.readCapacity)
        }
      };
    }
    return void 0;
  };
})(configureIndex);
var createIndexForModel$1 = {};
Object.defineProperty(createIndexForModel$1, "__esModule", { value: true });
createIndexForModel$1.createIndexForModel = void 0;
const db_control_1$d = db_control;
const errors_1$F = errors;
const createIndex_1 = createIndex;
const createIndexForModel = (api) => {
  return async (options) => {
    if (!options) {
      throw new errors_1$F.PineconeArgumentError("You must pass an object with required properties (`name`, `cloud`, `region`, and an `embed`)");
    }
    validateCreateIndexForModelRequest(options);
    try {
      const createRequest = {
        ...options,
        readCapacity: (0, createIndex_1.toApiReadCapacity)(options.readCapacity)
      };
      const createResponse = await api.createIndexForModel({
        createIndexForModelRequest: createRequest,
        xPineconeApiVersion: db_control_1$d.X_PINECONE_API_VERSION
      });
      if (options.waitUntilReady) {
        return await (0, createIndex_1.waitUntilIndexIsReady)(api, createResponse.name);
      }
      return createResponse;
    } catch (e) {
      if (!(options.suppressConflicts && e instanceof Error && e.name === "PineconeConflictError")) {
        throw e;
      }
    }
  };
};
createIndexForModel$1.createIndexForModel = createIndexForModel;
const validateCreateIndexForModelRequest = (options) => {
  if (!options.name) {
    throw new errors_1$F.PineconeArgumentError("You must pass a non-empty string for `name` in order to create an index.");
  }
  if (!options.cloud) {
    throw new errors_1$F.PineconeArgumentError("You must pass a non-empty string for `cloud` in order to create an index.");
  }
  if (options.cloud && !["aws", "gcp", "azure"].includes(options.cloud.toLowerCase())) {
    throw new errors_1$F.PineconeArgumentError(`Invalid cloud value: ${options.cloud}. Valid values are: aws, gcp, or azure.`);
  }
  if (!options.region) {
    throw new errors_1$F.PineconeArgumentError("You must pass a non-empty string for `region` in order to create an index.");
  }
  if (options.readCapacity) {
    (0, createIndex_1.validateReadCapacity)(options.readCapacity);
  }
  if (!options.embed) {
    throw new errors_1$F.PineconeArgumentError("You must pass an `embed` object in order to create an index.");
  }
  if (options.embed.metric && !["cosine", "euclidean", "dotproduct"].includes(options.embed.metric.toLowerCase())) {
    {
      throw new errors_1$F.PineconeArgumentError(`Invalid metric value: ${options.embed.metric}. Valid values are: cosine, euclidean, or dotproduct.`);
    }
  }
};
var deleteIndex$1 = {};
Object.defineProperty(deleteIndex$1, "__esModule", { value: true });
deleteIndex$1.deleteIndex = void 0;
const db_control_1$c = db_control;
const errors_1$E = errors;
const deleteIndex = (api) => {
  return async (indexName) => {
    if (!indexName) {
      throw new errors_1$E.PineconeArgumentError("You must pass a non-empty string for `indexName` in order to delete an index");
    }
    await api.deleteIndex({
      indexName,
      xPineconeApiVersion: db_control_1$c.X_PINECONE_API_VERSION
    });
    return;
  };
};
deleteIndex$1.deleteIndex = deleteIndex;
var listIndexes$1 = {};
Object.defineProperty(listIndexes$1, "__esModule", { value: true });
listIndexes$1.listIndexes = void 0;
const db_control_1$b = db_control;
const listIndexes = (api) => {
  return async () => {
    const response = await api.listIndexes({
      xPineconeApiVersion: db_control_1$b.X_PINECONE_API_VERSION
    });
    return response;
  };
};
listIndexes$1.listIndexes = listIndexes;
var createCollection$1 = {};
Object.defineProperty(createCollection$1, "__esModule", { value: true });
createCollection$1.createCollection = void 0;
const db_control_1$a = db_control;
const errors_1$D = errors;
const createCollection = (api) => {
  const validator = (options) => {
    if (!options || typeof options !== "object") {
      throw new errors_1$D.PineconeArgumentError("You must pass a non-empty object with `name` and `source` fields in order to create a collection.");
    }
    if (!options.name && !options.source) {
      throw new errors_1$D.PineconeArgumentError("The argument to createCollection must have required properties: `name`, `source`.");
    }
    if (!options.name) {
      throw new errors_1$D.PineconeArgumentError("You must pass a non-empty string for `name` in order to create a collection.");
    }
    if (!options.source) {
      throw new errors_1$D.PineconeArgumentError("You must pass a non-empty string for `source` in order to create a collection.");
    }
  };
  return async (options) => {
    validator(options);
    return await api.createCollection({
      xPineconeApiVersion: db_control_1$a.X_PINECONE_API_VERSION,
      createCollectionRequest: options
    });
  };
};
createCollection$1.createCollection = createCollection;
var deleteCollection$1 = {};
Object.defineProperty(deleteCollection$1, "__esModule", { value: true });
deleteCollection$1.deleteCollection = void 0;
const db_control_1$9 = db_control;
const errors_1$C = errors;
const deleteCollection = (api) => {
  return async (collectionName) => {
    if (!collectionName) {
      throw new errors_1$C.PineconeArgumentError("You must pass a non-empty string for `collectionName`");
    }
    await api.deleteCollection({
      collectionName,
      xPineconeApiVersion: db_control_1$9.X_PINECONE_API_VERSION
    });
    return;
  };
};
deleteCollection$1.deleteCollection = deleteCollection;
var describeCollection$1 = {};
Object.defineProperty(describeCollection$1, "__esModule", { value: true });
describeCollection$1.describeCollection = void 0;
const db_control_1$8 = db_control;
const errors_1$B = errors;
const describeCollection = (api) => {
  return async (name2) => {
    if (!name2 || name2.length === 0) {
      throw new errors_1$B.PineconeArgumentError("You must pass a non-empty string for `name` in order to describe a collection");
    }
    return await api.describeCollection({
      collectionName: name2,
      xPineconeApiVersion: db_control_1$8.X_PINECONE_API_VERSION
    });
  };
};
describeCollection$1.describeCollection = describeCollection;
var listCollections$1 = {};
Object.defineProperty(listCollections$1, "__esModule", { value: true });
listCollections$1.listCollections = void 0;
const db_control_1$7 = db_control;
const listCollections = (api) => {
  return async () => {
    const results = await api.listCollections({
      xPineconeApiVersion: db_control_1$7.X_PINECONE_API_VERSION
    });
    return results;
  };
};
listCollections$1.listCollections = listCollections;
var createBackup$1 = {};
Object.defineProperty(createBackup$1, "__esModule", { value: true });
createBackup$1.createBackup = void 0;
const db_control_1$6 = db_control;
const errors_1$A = errors;
const createBackup = (api) => {
  return async (createBackupOptions) => {
    if (!createBackupOptions.indexName) {
      throw new errors_1$A.PineconeArgumentError("You must pass a non-empty string for `indexName` in order to create a backup");
    }
    return await api.createBackup({
      xPineconeApiVersion: db_control_1$6.X_PINECONE_API_VERSION,
      indexName: createBackupOptions.indexName,
      createBackupRequest: {
        name: createBackupOptions.name,
        description: createBackupOptions.description
      }
    });
  };
};
createBackup$1.createBackup = createBackup;
var createIndexFromBackup$1 = {};
Object.defineProperty(createIndexFromBackup$1, "__esModule", { value: true });
createIndexFromBackup$1.createIndexFromBackup = void 0;
const db_control_1$5 = db_control;
const errors_1$z = errors;
const createIndexFromBackup = (api) => {
  return async (createIndexFromBackupOptions) => {
    if (!createIndexFromBackupOptions.backupId) {
      throw new errors_1$z.PineconeArgumentError("You must pass a non-empty string for `backupId` in order to create an index from backup");
    } else if (!createIndexFromBackupOptions.name) {
      throw new errors_1$z.PineconeArgumentError("You must pass a non-empty string for `name` in order to create an index from backup");
    }
    return await api.createIndexFromBackupOperation({
      xPineconeApiVersion: db_control_1$5.X_PINECONE_API_VERSION,
      backupId: createIndexFromBackupOptions.backupId,
      createIndexFromBackupRequest: {
        name: createIndexFromBackupOptions.name,
        tags: createIndexFromBackupOptions.tags,
        deletionProtection: createIndexFromBackupOptions.deletionProtection
      }
    });
  };
};
createIndexFromBackup$1.createIndexFromBackup = createIndexFromBackup;
var describeBackup$1 = {};
Object.defineProperty(describeBackup$1, "__esModule", { value: true });
describeBackup$1.describeBackup = void 0;
const db_control_1$4 = db_control;
const errors_1$y = errors;
const describeBackup = (api) => {
  return async (backupId) => {
    if (!backupId) {
      throw new errors_1$y.PineconeArgumentError("You must pass a non-empty string for `backupId` in order to describe a backup");
    }
    return await api.describeBackup({
      xPineconeApiVersion: db_control_1$4.X_PINECONE_API_VERSION,
      backupId
    });
  };
};
describeBackup$1.describeBackup = describeBackup;
var describeRestoreJob$1 = {};
Object.defineProperty(describeRestoreJob$1, "__esModule", { value: true });
describeRestoreJob$1.describeRestoreJob = void 0;
const db_control_1$3 = db_control;
const errors_1$x = errors;
const describeRestoreJob = (api) => {
  return async (restoreJobId) => {
    if (!restoreJobId) {
      throw new errors_1$x.PineconeArgumentError("You must pass a non-empty string for `restoreJobId` in order to describe a restore job");
    }
    return await api.describeRestoreJob({
      jobId: restoreJobId,
      xPineconeApiVersion: db_control_1$3.X_PINECONE_API_VERSION
    });
  };
};
describeRestoreJob$1.describeRestoreJob = describeRestoreJob;
var listBackups$1 = {};
Object.defineProperty(listBackups$1, "__esModule", { value: true });
listBackups$1.listBackups = void 0;
const db_control_1$2 = db_control;
const listBackups = (api) => {
  return async (listBackupOptions = {}) => {
    const { indexName, ...rest } = listBackupOptions;
    if (!indexName) {
      return await api.listProjectBackups({
        ...rest,
        xPineconeApiVersion: db_control_1$2.X_PINECONE_API_VERSION
      });
    } else {
      return await api.listIndexBackups({
        indexName,
        ...rest,
        xPineconeApiVersion: db_control_1$2.X_PINECONE_API_VERSION
      });
    }
  };
};
listBackups$1.listBackups = listBackups;
var listRestoreJobs$1 = {};
Object.defineProperty(listRestoreJobs$1, "__esModule", { value: true });
listRestoreJobs$1.listRestoreJobs = void 0;
const db_control_1$1 = db_control;
const listRestoreJobs = (api) => {
  return async (listRestoreJobsOptions) => {
    return await api.listRestoreJobs({
      ...listRestoreJobsOptions,
      xPineconeApiVersion: db_control_1$1.X_PINECONE_API_VERSION
    });
  };
};
listRestoreJobs$1.listRestoreJobs = listRestoreJobs;
var deleteBackup$1 = {};
Object.defineProperty(deleteBackup$1, "__esModule", { value: true });
deleteBackup$1.deleteBackup = void 0;
const db_control_1 = db_control;
const errors_1$w = errors;
const deleteBackup = (api) => {
  return async (backupId) => {
    if (!backupId) {
      throw new errors_1$w.PineconeArgumentError("You must pass a non-empty string for `backupId` in order to delete a backup");
    }
    return await api.deleteBackup({
      backupId,
      xPineconeApiVersion: db_control_1.X_PINECONE_API_VERSION
    });
  };
};
deleteBackup$1.deleteBackup = deleteBackup;
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.deleteBackup = exports.listRestoreJobs = exports.listBackups = exports.describeRestoreJob = exports.describeBackup = exports.createIndexFromBackup = exports.createBackup = exports.listCollections = exports.describeCollection = exports.deleteCollection = exports.createCollection = exports.listIndexes = exports.describeIndex = exports.deleteIndex = exports.createIndexForModel = exports.createIndex = exports.configureIndex = exports.indexOperationsBuilder = void 0;
  var indexOperationsBuilder_1 = indexOperationsBuilder$1;
  Object.defineProperty(exports, "indexOperationsBuilder", { enumerable: true, get: function() {
    return indexOperationsBuilder_1.indexOperationsBuilder;
  } });
  var configureIndex_1 = configureIndex;
  Object.defineProperty(exports, "configureIndex", { enumerable: true, get: function() {
    return configureIndex_1.configureIndex;
  } });
  var createIndex_12 = createIndex;
  Object.defineProperty(exports, "createIndex", { enumerable: true, get: function() {
    return createIndex_12.createIndex;
  } });
  var createIndexForModel_1 = createIndexForModel$1;
  Object.defineProperty(exports, "createIndexForModel", { enumerable: true, get: function() {
    return createIndexForModel_1.createIndexForModel;
  } });
  var deleteIndex_1 = deleteIndex$1;
  Object.defineProperty(exports, "deleteIndex", { enumerable: true, get: function() {
    return deleteIndex_1.deleteIndex;
  } });
  var describeIndex_1 = describeIndex$1;
  Object.defineProperty(exports, "describeIndex", { enumerable: true, get: function() {
    return describeIndex_1.describeIndex;
  } });
  var listIndexes_1 = listIndexes$1;
  Object.defineProperty(exports, "listIndexes", { enumerable: true, get: function() {
    return listIndexes_1.listIndexes;
  } });
  var createCollection_1 = createCollection$1;
  Object.defineProperty(exports, "createCollection", { enumerable: true, get: function() {
    return createCollection_1.createCollection;
  } });
  var deleteCollection_1 = deleteCollection$1;
  Object.defineProperty(exports, "deleteCollection", { enumerable: true, get: function() {
    return deleteCollection_1.deleteCollection;
  } });
  var describeCollection_1 = describeCollection$1;
  Object.defineProperty(exports, "describeCollection", { enumerable: true, get: function() {
    return describeCollection_1.describeCollection;
  } });
  var listCollections_1 = listCollections$1;
  Object.defineProperty(exports, "listCollections", { enumerable: true, get: function() {
    return listCollections_1.listCollections;
  } });
  var createBackup_1 = createBackup$1;
  Object.defineProperty(exports, "createBackup", { enumerable: true, get: function() {
    return createBackup_1.createBackup;
  } });
  var createIndexFromBackup_1 = createIndexFromBackup$1;
  Object.defineProperty(exports, "createIndexFromBackup", { enumerable: true, get: function() {
    return createIndexFromBackup_1.createIndexFromBackup;
  } });
  var describeBackup_1 = describeBackup$1;
  Object.defineProperty(exports, "describeBackup", { enumerable: true, get: function() {
    return describeBackup_1.describeBackup;
  } });
  var describeRestoreJob_1 = describeRestoreJob$1;
  Object.defineProperty(exports, "describeRestoreJob", { enumerable: true, get: function() {
    return describeRestoreJob_1.describeRestoreJob;
  } });
  var listBackups_1 = listBackups$1;
  Object.defineProperty(exports, "listBackups", { enumerable: true, get: function() {
    return listBackups_1.listBackups;
  } });
  var listRestoreJobs_1 = listRestoreJobs$1;
  Object.defineProperty(exports, "listRestoreJobs", { enumerable: true, get: function() {
    return listRestoreJobs_1.listRestoreJobs;
  } });
  var deleteBackup_1 = deleteBackup$1;
  Object.defineProperty(exports, "deleteBackup", { enumerable: true, get: function() {
    return deleteBackup_1.deleteBackup;
  } });
})(control$1);
var control = {};
var createAssistant$1 = {};
var assistant_control = {};
var runtime$b = {};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TextApiResponse = exports.BlobApiResponse = exports.VoidApiResponse = exports.JSONApiResponse = exports.COLLECTION_FORMATS = exports.RequiredError = exports.FetchError = exports.ResponseError = exports.BaseAPI = exports.DefaultConfig = exports.Configuration = exports.BASE_PATH = void 0;
  exports.exists = exists;
  exports.querystring = querystring;
  exports.mapValues = mapValues;
  exports.canConsumeForm = canConsumeForm;
  exports.BASE_PATH = "https://api.pinecone.io/assistant".replace(/\/+$/, "");
  class Configuration {
    configuration;
    constructor(configuration = {}) {
      this.configuration = configuration;
    }
    set config(configuration) {
      this.configuration = configuration;
    }
    get basePath() {
      return this.configuration.basePath != null ? this.configuration.basePath : exports.BASE_PATH;
    }
    get fetchApi() {
      return this.configuration.fetchApi;
    }
    get middleware() {
      return this.configuration.middleware || [];
    }
    get queryParamsStringify() {
      return this.configuration.queryParamsStringify || querystring;
    }
    get username() {
      return this.configuration.username;
    }
    get password() {
      return this.configuration.password;
    }
    get apiKey() {
      const apiKey = this.configuration.apiKey;
      if (apiKey) {
        return typeof apiKey === "function" ? apiKey : () => apiKey;
      }
      return void 0;
    }
    get accessToken() {
      const accessToken = this.configuration.accessToken;
      if (accessToken) {
        return typeof accessToken === "function" ? accessToken : async () => accessToken;
      }
      return void 0;
    }
    get headers() {
      return this.configuration.headers;
    }
    get credentials() {
      return this.configuration.credentials;
    }
  }
  exports.Configuration = Configuration;
  exports.DefaultConfig = new Configuration();
  class BaseAPI {
    configuration;
    static jsonRegex = new RegExp("^(:?application/json|[^;/ 	]+/[^;/ 	]+[+]json)[ 	]*(:?;.*)?$", "i");
    middleware;
    constructor(configuration = exports.DefaultConfig) {
      this.configuration = configuration;
      this.middleware = configuration.middleware;
    }
    withMiddleware(...middlewares) {
      const next = this.clone();
      next.middleware = next.middleware.concat(...middlewares);
      return next;
    }
    withPreMiddleware(...preMiddlewares) {
      const middlewares = preMiddlewares.map((pre) => ({ pre }));
      return this.withMiddleware(...middlewares);
    }
    withPostMiddleware(...postMiddlewares) {
      const middlewares = postMiddlewares.map((post) => ({ post }));
      return this.withMiddleware(...middlewares);
    }
    /**
     * Check if the given MIME is a JSON MIME.
     * JSON MIME examples:
     *   application/json
     *   application/json; charset=UTF8
     *   APPLICATION/JSON
     *   application/vnd.company+json
     * @param mime - MIME (Multipurpose Internet Mail Extensions)
     * @return True if the given MIME is JSON, false otherwise.
     */
    isJsonMime(mime) {
      if (!mime) {
        return false;
      }
      return BaseAPI.jsonRegex.test(mime);
    }
    async request(context2, initOverrides) {
      const { url, init } = await this.createFetchParams(context2, initOverrides);
      const response = await this.fetchApi(url, init);
      if (response && (response.status >= 200 && response.status < 300)) {
        return response;
      }
      throw new ResponseError(response, "Response returned an error code");
    }
    async createFetchParams(context2, initOverrides) {
      let url = this.configuration.basePath + context2.path;
      if (context2.query !== void 0 && Object.keys(context2.query).length !== 0) {
        url += "?" + this.configuration.queryParamsStringify(context2.query);
      }
      const headers = Object.assign({}, this.configuration.headers, context2.headers);
      Object.keys(headers).forEach((key) => headers[key] === void 0 ? delete headers[key] : {});
      const initOverrideFn = typeof initOverrides === "function" ? initOverrides : async () => initOverrides;
      const initParams = {
        method: context2.method,
        headers,
        body: context2.body,
        credentials: this.configuration.credentials
      };
      const overriddenInit = {
        ...initParams,
        ...await initOverrideFn({
          init: initParams,
          context: context2
        })
      };
      let body;
      if (isFormData(overriddenInit.body) || overriddenInit.body instanceof URLSearchParams || isBlob(overriddenInit.body)) {
        body = overriddenInit.body;
      } else if (this.isJsonMime(headers["Content-Type"])) {
        body = JSON.stringify(overriddenInit.body);
      } else {
        body = overriddenInit.body;
      }
      const init = {
        ...overriddenInit,
        body
      };
      return { url, init };
    }
    fetchApi = async (url, init) => {
      let fetchParams = { url, init };
      for (const middleware2 of this.middleware) {
        if (middleware2.pre) {
          fetchParams = await middleware2.pre({
            fetch: this.fetchApi,
            ...fetchParams
          }) || fetchParams;
        }
      }
      let response = void 0;
      try {
        response = await (this.configuration.fetchApi || fetch)(fetchParams.url, fetchParams.init);
      } catch (e) {
        for (const middleware2 of this.middleware) {
          if (middleware2.onError) {
            response = await middleware2.onError({
              fetch: this.fetchApi,
              url: fetchParams.url,
              init: fetchParams.init,
              error: e,
              response: response ? response.clone() : void 0
            }) || response;
          }
        }
        if (response === void 0) {
          if (e instanceof Error) {
            throw new FetchError(e, "The request failed and the interceptors did not return an alternative response");
          } else {
            throw e;
          }
        }
      }
      for (const middleware2 of this.middleware) {
        if (middleware2.post) {
          response = await middleware2.post({
            fetch: this.fetchApi,
            url: fetchParams.url,
            init: fetchParams.init,
            response: response.clone()
          }) || response;
        }
      }
      return response;
    };
    /**
     * Create a shallow clone of `this` by constructing a new instance
     * and then shallow cloning data members.
     */
    clone() {
      const constructor = this.constructor;
      const next = new constructor(this.configuration);
      next.middleware = this.middleware.slice();
      return next;
    }
  }
  exports.BaseAPI = BaseAPI;
  function isBlob(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  class ResponseError extends Error {
    response;
    name = "ResponseError";
    constructor(response, msg) {
      super(msg);
      this.response = response;
    }
  }
  exports.ResponseError = ResponseError;
  class FetchError extends Error {
    cause;
    name = "FetchError";
    constructor(cause, msg) {
      super(msg);
      this.cause = cause;
    }
  }
  exports.FetchError = FetchError;
  class RequiredError extends Error {
    field;
    name = "RequiredError";
    constructor(field, msg) {
      super(msg);
      this.field = field;
    }
  }
  exports.RequiredError = RequiredError;
  exports.COLLECTION_FORMATS = {
    csv: ",",
    ssv: " ",
    tsv: "	",
    pipes: "|"
  };
  function exists(json, key) {
    const value = json[key];
    return value !== null && value !== void 0;
  }
  function querystring(params, prefix = "") {
    return Object.keys(params).map((key) => querystringSingleKey2(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
  }
  function querystringSingleKey2(key, value, keyPrefix = "") {
    const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
    if (value instanceof Array) {
      const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
      return `${encodeURIComponent(fullKey)}=${multiValue}`;
    }
    if (value instanceof Set) {
      const valueAsArray = Array.from(value);
      return querystringSingleKey2(key, valueAsArray, keyPrefix);
    }
    if (value instanceof Date) {
      return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
    }
    if (value instanceof Object) {
      return querystring(value, fullKey);
    }
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
  }
  function mapValues(data2, fn) {
    return Object.keys(data2).reduce((acc, key) => ({ ...acc, [key]: fn(data2[key]) }), {});
  }
  function canConsumeForm(consumes) {
    for (const consume of consumes) {
      if ("multipart/form-data" === consume.contentType) {
        return true;
      }
    }
    return false;
  }
  class JSONApiResponse {
    raw;
    transformer;
    constructor(raw, transformer = (jsonValue) => jsonValue) {
      this.raw = raw;
      this.transformer = transformer;
    }
    async value() {
      return this.transformer(await this.raw.json());
    }
  }
  exports.JSONApiResponse = JSONApiResponse;
  class VoidApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return void 0;
    }
  }
  exports.VoidApiResponse = VoidApiResponse;
  class BlobApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.blob();
    }
  }
  exports.BlobApiResponse = BlobApiResponse;
  class TextApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.text();
    }
  }
  exports.TextApiResponse = TextApiResponse;
})(runtime$b);
var apis$4 = {};
var ManageAssistantsApi$3 = {};
var models$4 = {};
var Assistant = {};
Object.defineProperty(Assistant, "__esModule", { value: true });
Assistant.instanceOfAssistant = instanceOfAssistant;
Assistant.AssistantFromJSON = AssistantFromJSON;
Assistant.AssistantFromJSONTyped = AssistantFromJSONTyped;
Assistant.AssistantToJSON = AssistantToJSON;
const runtime_1$1b = runtime$b;
function instanceOfAssistant(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  isInstance = isInstance && "status" in value;
  return isInstance;
}
function AssistantFromJSON(json) {
  return AssistantFromJSONTyped(json);
}
function AssistantFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "instructions": !(0, runtime_1$1b.exists)(json, "instructions") ? void 0 : json["instructions"],
    "metadata": !(0, runtime_1$1b.exists)(json, "metadata") ? void 0 : json["metadata"],
    "status": json["status"],
    "host": !(0, runtime_1$1b.exists)(json, "host") ? void 0 : json["host"],
    "createdAt": !(0, runtime_1$1b.exists)(json, "created_at") ? void 0 : new Date(json["created_at"]),
    "updatedAt": !(0, runtime_1$1b.exists)(json, "updated_at") ? void 0 : new Date(json["updated_at"])
  };
}
function AssistantToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "instructions": value.instructions,
    "metadata": value.metadata,
    "status": value.status,
    "host": value.host,
    "created_at": value.createdAt === void 0 ? void 0 : value.createdAt.toISOString(),
    "updated_at": value.updatedAt === void 0 ? void 0 : value.updatedAt.toISOString()
  };
}
var CreateAssistantRequest = {};
Object.defineProperty(CreateAssistantRequest, "__esModule", { value: true });
CreateAssistantRequest.instanceOfCreateAssistantRequest = instanceOfCreateAssistantRequest;
CreateAssistantRequest.CreateAssistantRequestFromJSON = CreateAssistantRequestFromJSON;
CreateAssistantRequest.CreateAssistantRequestFromJSONTyped = CreateAssistantRequestFromJSONTyped;
CreateAssistantRequest.CreateAssistantRequestToJSON = CreateAssistantRequestToJSON;
const runtime_1$1a = runtime$b;
function instanceOfCreateAssistantRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  return isInstance;
}
function CreateAssistantRequestFromJSON(json) {
  return CreateAssistantRequestFromJSONTyped(json);
}
function CreateAssistantRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "instructions": !(0, runtime_1$1a.exists)(json, "instructions") ? void 0 : json["instructions"],
    "metadata": !(0, runtime_1$1a.exists)(json, "metadata") ? void 0 : json["metadata"],
    "region": !(0, runtime_1$1a.exists)(json, "region") ? void 0 : json["region"]
  };
}
function CreateAssistantRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "instructions": value.instructions,
    "metadata": value.metadata,
    "region": value.region
  };
}
var ErrorResponse$2 = {};
var ErrorResponseError$2 = {};
Object.defineProperty(ErrorResponseError$2, "__esModule", { value: true });
ErrorResponseError$2.instanceOfErrorResponseError = instanceOfErrorResponseError$2;
ErrorResponseError$2.ErrorResponseErrorFromJSON = ErrorResponseErrorFromJSON$2;
ErrorResponseError$2.ErrorResponseErrorFromJSONTyped = ErrorResponseErrorFromJSONTyped$2;
ErrorResponseError$2.ErrorResponseErrorToJSON = ErrorResponseErrorToJSON$2;
const runtime_1$19 = runtime$b;
function instanceOfErrorResponseError$2(value) {
  let isInstance = true;
  isInstance = isInstance && "code" in value;
  isInstance = isInstance && "message" in value;
  return isInstance;
}
function ErrorResponseErrorFromJSON$2(json) {
  return ErrorResponseErrorFromJSONTyped$2(json);
}
function ErrorResponseErrorFromJSONTyped$2(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "code": json["code"],
    "message": json["message"],
    "details": !(0, runtime_1$19.exists)(json, "details") ? void 0 : json["details"]
  };
}
function ErrorResponseErrorToJSON$2(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "code": value.code,
    "message": value.message,
    "details": value.details
  };
}
Object.defineProperty(ErrorResponse$2, "__esModule", { value: true });
ErrorResponse$2.instanceOfErrorResponse = instanceOfErrorResponse$2;
ErrorResponse$2.ErrorResponseFromJSON = ErrorResponseFromJSON$2;
ErrorResponse$2.ErrorResponseFromJSONTyped = ErrorResponseFromJSONTyped$2;
ErrorResponse$2.ErrorResponseToJSON = ErrorResponseToJSON$2;
const ErrorResponseError_1$2 = ErrorResponseError$2;
function instanceOfErrorResponse$2(value) {
  let isInstance = true;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "error" in value;
  return isInstance;
}
function ErrorResponseFromJSON$2(json) {
  return ErrorResponseFromJSONTyped$2(json);
}
function ErrorResponseFromJSONTyped$2(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "status": json["status"],
    "error": (0, ErrorResponseError_1$2.ErrorResponseErrorFromJSON)(json["error"])
  };
}
function ErrorResponseToJSON$2(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "status": value.status,
    "error": (0, ErrorResponseError_1$2.ErrorResponseErrorToJSON)(value.error)
  };
}
var ListAssistants200Response = {};
Object.defineProperty(ListAssistants200Response, "__esModule", { value: true });
ListAssistants200Response.instanceOfListAssistants200Response = instanceOfListAssistants200Response;
ListAssistants200Response.ListAssistants200ResponseFromJSON = ListAssistants200ResponseFromJSON;
ListAssistants200Response.ListAssistants200ResponseFromJSONTyped = ListAssistants200ResponseFromJSONTyped;
ListAssistants200Response.ListAssistants200ResponseToJSON = ListAssistants200ResponseToJSON;
const runtime_1$18 = runtime$b;
const Assistant_1 = Assistant;
function instanceOfListAssistants200Response(value) {
  let isInstance = true;
  return isInstance;
}
function ListAssistants200ResponseFromJSON(json) {
  return ListAssistants200ResponseFromJSONTyped(json);
}
function ListAssistants200ResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "assistants": !(0, runtime_1$18.exists)(json, "assistants") ? void 0 : json["assistants"].map(Assistant_1.AssistantFromJSON)
  };
}
function ListAssistants200ResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "assistants": value.assistants === void 0 ? void 0 : value.assistants.map(Assistant_1.AssistantToJSON)
  };
}
var UpdateAssistant200Response = {};
Object.defineProperty(UpdateAssistant200Response, "__esModule", { value: true });
UpdateAssistant200Response.instanceOfUpdateAssistant200Response = instanceOfUpdateAssistant200Response;
UpdateAssistant200Response.UpdateAssistant200ResponseFromJSON = UpdateAssistant200ResponseFromJSON;
UpdateAssistant200Response.UpdateAssistant200ResponseFromJSONTyped = UpdateAssistant200ResponseFromJSONTyped;
UpdateAssistant200Response.UpdateAssistant200ResponseToJSON = UpdateAssistant200ResponseToJSON;
const runtime_1$17 = runtime$b;
function instanceOfUpdateAssistant200Response(value) {
  let isInstance = true;
  return isInstance;
}
function UpdateAssistant200ResponseFromJSON(json) {
  return UpdateAssistant200ResponseFromJSONTyped(json);
}
function UpdateAssistant200ResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "assistantName": !(0, runtime_1$17.exists)(json, "assistant_name") ? void 0 : json["assistant_name"],
    "instructions": !(0, runtime_1$17.exists)(json, "instructions") ? void 0 : json["instructions"],
    "metadata": !(0, runtime_1$17.exists)(json, "metadata") ? void 0 : json["metadata"]
  };
}
function UpdateAssistant200ResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "assistant_name": value.assistantName,
    "instructions": value.instructions,
    "metadata": value.metadata
  };
}
var UpdateAssistantRequest = {};
Object.defineProperty(UpdateAssistantRequest, "__esModule", { value: true });
UpdateAssistantRequest.instanceOfUpdateAssistantRequest = instanceOfUpdateAssistantRequest;
UpdateAssistantRequest.UpdateAssistantRequestFromJSON = UpdateAssistantRequestFromJSON;
UpdateAssistantRequest.UpdateAssistantRequestFromJSONTyped = UpdateAssistantRequestFromJSONTyped;
UpdateAssistantRequest.UpdateAssistantRequestToJSON = UpdateAssistantRequestToJSON;
const runtime_1$16 = runtime$b;
function instanceOfUpdateAssistantRequest(value) {
  let isInstance = true;
  return isInstance;
}
function UpdateAssistantRequestFromJSON(json) {
  return UpdateAssistantRequestFromJSONTyped(json);
}
function UpdateAssistantRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "instructions": !(0, runtime_1$16.exists)(json, "instructions") ? void 0 : json["instructions"],
    "metadata": !(0, runtime_1$16.exists)(json, "metadata") ? void 0 : json["metadata"]
  };
}
function UpdateAssistantRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "instructions": value.instructions,
    "metadata": value.metadata
  };
}
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(Assistant, exports);
  __exportStar(CreateAssistantRequest, exports);
  __exportStar(ErrorResponse$2, exports);
  __exportStar(ErrorResponseError$2, exports);
  __exportStar(ListAssistants200Response, exports);
  __exportStar(UpdateAssistant200Response, exports);
  __exportStar(UpdateAssistantRequest, exports);
})(models$4);
var __createBinding$6 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$6 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$6 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$6(result, mod, k);
  }
  __setModuleDefault$6(result, mod);
  return result;
};
Object.defineProperty(ManageAssistantsApi$3, "__esModule", { value: true });
ManageAssistantsApi$3.ManageAssistantsApi = void 0;
const runtime$a = __importStar$6(runtime$b);
const index_1$6 = models$4;
let ManageAssistantsApi$2 = class ManageAssistantsApi extends runtime$a.BaseAPI {
  /**
   * Create an assistant. This is where you specify the underlying training model, which cloud provider you would like to deploy with, and more.  For guidance and examples, see [Create an assistant](https://docs.pinecone.io/guides/assistant/create-assistant)
   * Create an assistant
   */
  async createAssistantRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$a.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling createAssistant.");
    }
    if (requestParameters.createAssistantRequest === null || requestParameters.createAssistantRequest === void 0) {
      throw new runtime$a.RequiredError("createAssistantRequest", "Required parameter requestParameters.createAssistantRequest was null or undefined when calling createAssistant.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/assistants`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$6.CreateAssistantRequestToJSON)(requestParameters.createAssistantRequest)
    }, initOverrides);
    return new runtime$a.JSONApiResponse(response, (jsonValue) => (0, index_1$6.AssistantFromJSON)(jsonValue));
  }
  /**
   * Create an assistant. This is where you specify the underlying training model, which cloud provider you would like to deploy with, and more.  For guidance and examples, see [Create an assistant](https://docs.pinecone.io/guides/assistant/create-assistant)
   * Create an assistant
   */
  async createAssistant(requestParameters, initOverrides) {
    const response = await this.createAssistantRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Delete an existing assistant.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#delete-an-assistant)
   * Delete an assistant
   */
  async deleteAssistantRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$a.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling deleteAssistant.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime$a.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling deleteAssistant.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/assistants/{assistant_name}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$a.VoidApiResponse(response);
  }
  /**
   * Delete an existing assistant.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#delete-an-assistant)
   * Delete an assistant
   */
  async deleteAssistant(requestParameters, initOverrides) {
    await this.deleteAssistantRaw(requestParameters, initOverrides);
  }
  /**
   * Get the status of an assistant.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#get-the-status-of-an-assistant)
   * Check assistant status
   */
  async getAssistantRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$a.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling getAssistant.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime$a.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling getAssistant.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/assistants/{assistant_name}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$a.JSONApiResponse(response, (jsonValue) => (0, index_1$6.AssistantFromJSON)(jsonValue));
  }
  /**
   * Get the status of an assistant.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#get-the-status-of-an-assistant)
   * Check assistant status
   */
  async getAssistant(requestParameters, initOverrides) {
    const response = await this.getAssistantRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List of all assistants in a project.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#list-assistants-for-a-project).
   * List assistants
   */
  async listAssistantsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$a.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listAssistants.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/assistants`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$a.JSONApiResponse(response, (jsonValue) => (0, index_1$6.ListAssistants200ResponseFromJSON)(jsonValue));
  }
  /**
   * List of all assistants in a project.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#list-assistants-for-a-project).
   * List assistants
   */
  async listAssistants(requestParameters, initOverrides) {
    const response = await this.listAssistantsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Update an existing assistant. You can modify the assistant\'s instructions.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#add-instructions-to-an-assistant).
   * Update an assistant
   */
  async updateAssistantRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$a.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling updateAssistant.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime$a.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling updateAssistant.");
    }
    if (requestParameters.updateAssistantRequest === null || requestParameters.updateAssistantRequest === void 0) {
      throw new runtime$a.RequiredError("updateAssistantRequest", "Required parameter requestParameters.updateAssistantRequest was null or undefined when calling updateAssistant.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/assistants/{assistant_name}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$6.UpdateAssistantRequestToJSON)(requestParameters.updateAssistantRequest)
    }, initOverrides);
    return new runtime$a.JSONApiResponse(response, (jsonValue) => (0, index_1$6.UpdateAssistant200ResponseFromJSON)(jsonValue));
  }
  /**
   * Update an existing assistant. You can modify the assistant\'s instructions.  For guidance and examples, see [Manage assistants](https://docs.pinecone.io/guides/assistant/manage-assistants#add-instructions-to-an-assistant).
   * Update an assistant
   */
  async updateAssistant(requestParameters, initOverrides) {
    const response = await this.updateAssistantRaw(requestParameters, initOverrides);
    return await response.value();
  }
};
ManageAssistantsApi$3.ManageAssistantsApi = ManageAssistantsApi$2;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(ManageAssistantsApi$3, exports);
})(apis$4);
var api_version$4 = {};
Object.defineProperty(api_version$4, "__esModule", { value: true });
api_version$4.X_PINECONE_API_VERSION = void 0;
api_version$4.X_PINECONE_API_VERSION = "2025-10";
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(runtime$b, exports);
  __exportStar(apis$4, exports);
  __exportStar(models$4, exports);
  __exportStar(api_version$4, exports);
})(assistant_control);
Object.defineProperty(createAssistant$1, "__esModule", { value: true });
createAssistant$1.createAssistant = void 0;
const assistant_control_1$5 = assistant_control;
const errors_1$v = errors;
const createAssistant = (api) => {
  return async (options) => {
    validateCreateAssistantOptions(options);
    return await api.createAssistant({
      xPineconeApiVersion: assistant_control_1$5.X_PINECONE_API_VERSION,
      createAssistantRequest: {
        name: options.name,
        instructions: options?.instructions,
        metadata: options?.metadata,
        region: options?.region
      }
    });
  };
};
createAssistant$1.createAssistant = createAssistant;
const validateCreateAssistantOptions = (options) => {
  if (!options) {
    throw new errors_1$v.PineconeArgumentError("You must pass an object with required properties (`name`) to create an Assistant.");
  }
  if (options.region) {
    const normalizedRegion = options.region.toLowerCase();
    if (normalizedRegion !== "us" && normalizedRegion !== "eu") {
      throw new errors_1$v.PineconeArgumentError('Invalid region specified. Must be one of "us" or "eu"');
    }
    options.region = normalizedRegion;
  }
};
var deleteAssistant$1 = {};
Object.defineProperty(deleteAssistant$1, "__esModule", { value: true });
deleteAssistant$1.deleteAssistant = void 0;
const assistant_control_1$4 = assistant_control;
const errors_1$u = errors;
const deleteAssistant = (api) => {
  return async (assistantName) => {
    if (!assistantName) {
      throw new errors_1$u.PineconeArgumentError("You must pass the name of an assistant to delete.");
    }
    return await api.deleteAssistant({
      assistantName,
      xPineconeApiVersion: assistant_control_1$4.X_PINECONE_API_VERSION
    });
  };
};
deleteAssistant$1.deleteAssistant = deleteAssistant;
var describeAssistant$1 = {};
Object.defineProperty(describeAssistant$1, "__esModule", { value: true });
describeAssistant$1.describeAssistant = void 0;
const assistant_control_1$3 = assistant_control;
const errors_1$t = errors;
const describeAssistant = (api) => {
  return async (assistantName) => {
    if (!assistantName) {
      throw new errors_1$t.PineconeArgumentError("You must pass the name of an assistant to update.");
    }
    return await api.getAssistant({
      assistantName,
      xPineconeApiVersion: assistant_control_1$3.X_PINECONE_API_VERSION
    });
  };
};
describeAssistant$1.describeAssistant = describeAssistant;
var listAssistants$1 = {};
Object.defineProperty(listAssistants$1, "__esModule", { value: true });
listAssistants$1.listAssistants = void 0;
const assistant_control_1$2 = assistant_control;
const listAssistants = (api) => {
  return async () => {
    return await api.listAssistants({
      xPineconeApiVersion: assistant_control_1$2.X_PINECONE_API_VERSION
    });
  };
};
listAssistants$1.listAssistants = listAssistants;
var updateAssistant$1 = {};
Object.defineProperty(updateAssistant$1, "__esModule", { value: true });
updateAssistant$1.updateAssistant = void 0;
const assistant_control_1$1 = assistant_control;
const errors_1$s = errors;
const updateAssistant = (api) => {
  return async (options) => {
    validateUpdateAssistantOptions(options);
    const updateAssistantRequest = {};
    if (options?.instructions) {
      updateAssistantRequest["instructions"] = options.instructions;
    }
    if (options?.metadata) {
      updateAssistantRequest["metadata"] = options.metadata;
    }
    return await api.updateAssistant({
      assistantName: options.name,
      updateAssistantRequest,
      xPineconeApiVersion: assistant_control_1$1.X_PINECONE_API_VERSION
    });
  };
};
updateAssistant$1.updateAssistant = updateAssistant;
const validateUpdateAssistantOptions = (options) => {
  if (!options) {
    throw new errors_1$s.PineconeArgumentError("You must pass an object with at least one property to update an assistant.");
  }
  if (!options.name) {
    throw new errors_1$s.PineconeArgumentError("You must pass the name of an assistant to update.");
  }
};
var evaluate$1 = {};
var assistant_evaluation = {};
var runtime$9 = {};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TextApiResponse = exports.BlobApiResponse = exports.VoidApiResponse = exports.JSONApiResponse = exports.COLLECTION_FORMATS = exports.RequiredError = exports.FetchError = exports.ResponseError = exports.BaseAPI = exports.DefaultConfig = exports.Configuration = exports.BASE_PATH = void 0;
  exports.exists = exists;
  exports.querystring = querystring;
  exports.mapValues = mapValues;
  exports.canConsumeForm = canConsumeForm;
  exports.BASE_PATH = "https://prod-1-data.ke.pinecone.io/assistant".replace(/\/+$/, "");
  class Configuration {
    configuration;
    constructor(configuration = {}) {
      this.configuration = configuration;
    }
    set config(configuration) {
      this.configuration = configuration;
    }
    get basePath() {
      return this.configuration.basePath != null ? this.configuration.basePath : exports.BASE_PATH;
    }
    get fetchApi() {
      return this.configuration.fetchApi;
    }
    get middleware() {
      return this.configuration.middleware || [];
    }
    get queryParamsStringify() {
      return this.configuration.queryParamsStringify || querystring;
    }
    get username() {
      return this.configuration.username;
    }
    get password() {
      return this.configuration.password;
    }
    get apiKey() {
      const apiKey = this.configuration.apiKey;
      if (apiKey) {
        return typeof apiKey === "function" ? apiKey : () => apiKey;
      }
      return void 0;
    }
    get accessToken() {
      const accessToken = this.configuration.accessToken;
      if (accessToken) {
        return typeof accessToken === "function" ? accessToken : async () => accessToken;
      }
      return void 0;
    }
    get headers() {
      return this.configuration.headers;
    }
    get credentials() {
      return this.configuration.credentials;
    }
  }
  exports.Configuration = Configuration;
  exports.DefaultConfig = new Configuration();
  class BaseAPI {
    configuration;
    static jsonRegex = new RegExp("^(:?application/json|[^;/ 	]+/[^;/ 	]+[+]json)[ 	]*(:?;.*)?$", "i");
    middleware;
    constructor(configuration = exports.DefaultConfig) {
      this.configuration = configuration;
      this.middleware = configuration.middleware;
    }
    withMiddleware(...middlewares) {
      const next = this.clone();
      next.middleware = next.middleware.concat(...middlewares);
      return next;
    }
    withPreMiddleware(...preMiddlewares) {
      const middlewares = preMiddlewares.map((pre) => ({ pre }));
      return this.withMiddleware(...middlewares);
    }
    withPostMiddleware(...postMiddlewares) {
      const middlewares = postMiddlewares.map((post) => ({ post }));
      return this.withMiddleware(...middlewares);
    }
    /**
     * Check if the given MIME is a JSON MIME.
     * JSON MIME examples:
     *   application/json
     *   application/json; charset=UTF8
     *   APPLICATION/JSON
     *   application/vnd.company+json
     * @param mime - MIME (Multipurpose Internet Mail Extensions)
     * @return True if the given MIME is JSON, false otherwise.
     */
    isJsonMime(mime) {
      if (!mime) {
        return false;
      }
      return BaseAPI.jsonRegex.test(mime);
    }
    async request(context2, initOverrides) {
      const { url, init } = await this.createFetchParams(context2, initOverrides);
      const response = await this.fetchApi(url, init);
      if (response && (response.status >= 200 && response.status < 300)) {
        return response;
      }
      throw new ResponseError(response, "Response returned an error code");
    }
    async createFetchParams(context2, initOverrides) {
      let url = this.configuration.basePath + context2.path;
      if (context2.query !== void 0 && Object.keys(context2.query).length !== 0) {
        url += "?" + this.configuration.queryParamsStringify(context2.query);
      }
      const headers = Object.assign({}, this.configuration.headers, context2.headers);
      Object.keys(headers).forEach((key) => headers[key] === void 0 ? delete headers[key] : {});
      const initOverrideFn = typeof initOverrides === "function" ? initOverrides : async () => initOverrides;
      const initParams = {
        method: context2.method,
        headers,
        body: context2.body,
        credentials: this.configuration.credentials
      };
      const overriddenInit = {
        ...initParams,
        ...await initOverrideFn({
          init: initParams,
          context: context2
        })
      };
      let body;
      if (isFormData(overriddenInit.body) || overriddenInit.body instanceof URLSearchParams || isBlob(overriddenInit.body)) {
        body = overriddenInit.body;
      } else if (this.isJsonMime(headers["Content-Type"])) {
        body = JSON.stringify(overriddenInit.body);
      } else {
        body = overriddenInit.body;
      }
      const init = {
        ...overriddenInit,
        body
      };
      return { url, init };
    }
    fetchApi = async (url, init) => {
      let fetchParams = { url, init };
      for (const middleware2 of this.middleware) {
        if (middleware2.pre) {
          fetchParams = await middleware2.pre({
            fetch: this.fetchApi,
            ...fetchParams
          }) || fetchParams;
        }
      }
      let response = void 0;
      try {
        response = await (this.configuration.fetchApi || fetch)(fetchParams.url, fetchParams.init);
      } catch (e) {
        for (const middleware2 of this.middleware) {
          if (middleware2.onError) {
            response = await middleware2.onError({
              fetch: this.fetchApi,
              url: fetchParams.url,
              init: fetchParams.init,
              error: e,
              response: response ? response.clone() : void 0
            }) || response;
          }
        }
        if (response === void 0) {
          if (e instanceof Error) {
            throw new FetchError(e, "The request failed and the interceptors did not return an alternative response");
          } else {
            throw e;
          }
        }
      }
      for (const middleware2 of this.middleware) {
        if (middleware2.post) {
          response = await middleware2.post({
            fetch: this.fetchApi,
            url: fetchParams.url,
            init: fetchParams.init,
            response: response.clone()
          }) || response;
        }
      }
      return response;
    };
    /**
     * Create a shallow clone of `this` by constructing a new instance
     * and then shallow cloning data members.
     */
    clone() {
      const constructor = this.constructor;
      const next = new constructor(this.configuration);
      next.middleware = this.middleware.slice();
      return next;
    }
  }
  exports.BaseAPI = BaseAPI;
  function isBlob(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  class ResponseError extends Error {
    response;
    name = "ResponseError";
    constructor(response, msg) {
      super(msg);
      this.response = response;
    }
  }
  exports.ResponseError = ResponseError;
  class FetchError extends Error {
    cause;
    name = "FetchError";
    constructor(cause, msg) {
      super(msg);
      this.cause = cause;
    }
  }
  exports.FetchError = FetchError;
  class RequiredError extends Error {
    field;
    name = "RequiredError";
    constructor(field, msg) {
      super(msg);
      this.field = field;
    }
  }
  exports.RequiredError = RequiredError;
  exports.COLLECTION_FORMATS = {
    csv: ",",
    ssv: " ",
    tsv: "	",
    pipes: "|"
  };
  function exists(json, key) {
    const value = json[key];
    return value !== null && value !== void 0;
  }
  function querystring(params, prefix = "") {
    return Object.keys(params).map((key) => querystringSingleKey2(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
  }
  function querystringSingleKey2(key, value, keyPrefix = "") {
    const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
    if (value instanceof Array) {
      const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
      return `${encodeURIComponent(fullKey)}=${multiValue}`;
    }
    if (value instanceof Set) {
      const valueAsArray = Array.from(value);
      return querystringSingleKey2(key, valueAsArray, keyPrefix);
    }
    if (value instanceof Date) {
      return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
    }
    if (value instanceof Object) {
      return querystring(value, fullKey);
    }
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
  }
  function mapValues(data2, fn) {
    return Object.keys(data2).reduce((acc, key) => ({ ...acc, [key]: fn(data2[key]) }), {});
  }
  function canConsumeForm(consumes) {
    for (const consume of consumes) {
      if ("multipart/form-data" === consume.contentType) {
        return true;
      }
    }
    return false;
  }
  class JSONApiResponse {
    raw;
    transformer;
    constructor(raw, transformer = (jsonValue) => jsonValue) {
      this.raw = raw;
      this.transformer = transformer;
    }
    async value() {
      return this.transformer(await this.raw.json());
    }
  }
  exports.JSONApiResponse = JSONApiResponse;
  class VoidApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return void 0;
    }
  }
  exports.VoidApiResponse = VoidApiResponse;
  class BlobApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.blob();
    }
  }
  exports.BlobApiResponse = BlobApiResponse;
  class TextApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.text();
    }
  }
  exports.TextApiResponse = TextApiResponse;
})(runtime$9);
var apis$3 = {};
var MetricsApi$1 = {};
var models$3 = {};
var AlignmentRequest = {};
Object.defineProperty(AlignmentRequest, "__esModule", { value: true });
AlignmentRequest.instanceOfAlignmentRequest = instanceOfAlignmentRequest;
AlignmentRequest.AlignmentRequestFromJSON = AlignmentRequestFromJSON;
AlignmentRequest.AlignmentRequestFromJSONTyped = AlignmentRequestFromJSONTyped;
AlignmentRequest.AlignmentRequestToJSON = AlignmentRequestToJSON;
function instanceOfAlignmentRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "question" in value;
  isInstance = isInstance && "answer" in value;
  isInstance = isInstance && "groundTruthAnswer" in value;
  return isInstance;
}
function AlignmentRequestFromJSON(json) {
  return AlignmentRequestFromJSONTyped(json);
}
function AlignmentRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "question": json["question"],
    "answer": json["answer"],
    "groundTruthAnswer": json["ground_truth_answer"]
  };
}
function AlignmentRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "question": value.question,
    "answer": value.answer,
    "ground_truth_answer": value.groundTruthAnswer
  };
}
var AlignmentResponse = {};
var Metrics = {};
Object.defineProperty(Metrics, "__esModule", { value: true });
Metrics.instanceOfMetrics = instanceOfMetrics;
Metrics.MetricsFromJSON = MetricsFromJSON;
Metrics.MetricsFromJSONTyped = MetricsFromJSONTyped;
Metrics.MetricsToJSON = MetricsToJSON;
function instanceOfMetrics(value) {
  let isInstance = true;
  isInstance = isInstance && "correctness" in value;
  isInstance = isInstance && "completeness" in value;
  isInstance = isInstance && "alignment" in value;
  return isInstance;
}
function MetricsFromJSON(json) {
  return MetricsFromJSONTyped(json);
}
function MetricsFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "correctness": json["correctness"],
    "completeness": json["completeness"],
    "alignment": json["alignment"]
  };
}
function MetricsToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "correctness": value.correctness,
    "completeness": value.completeness,
    "alignment": value.alignment
  };
}
var Reasoning = {};
var EvaluatedFact = {};
var Fact = {};
Object.defineProperty(Fact, "__esModule", { value: true });
Fact.instanceOfFact = instanceOfFact;
Fact.FactFromJSON = FactFromJSON;
Fact.FactFromJSONTyped = FactFromJSONTyped;
Fact.FactToJSON = FactToJSON;
function instanceOfFact(value) {
  let isInstance = true;
  isInstance = isInstance && "content" in value;
  return isInstance;
}
function FactFromJSON(json) {
  return FactFromJSONTyped(json);
}
function FactFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "content": json["content"]
  };
}
function FactToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "content": value.content
  };
}
Object.defineProperty(EvaluatedFact, "__esModule", { value: true });
EvaluatedFact.instanceOfEvaluatedFact = instanceOfEvaluatedFact;
EvaluatedFact.EvaluatedFactFromJSON = EvaluatedFactFromJSON;
EvaluatedFact.EvaluatedFactFromJSONTyped = EvaluatedFactFromJSONTyped;
EvaluatedFact.EvaluatedFactToJSON = EvaluatedFactToJSON;
const Fact_1 = Fact;
function instanceOfEvaluatedFact(value) {
  let isInstance = true;
  isInstance = isInstance && "fact" in value;
  isInstance = isInstance && "entailment" in value;
  return isInstance;
}
function EvaluatedFactFromJSON(json) {
  return EvaluatedFactFromJSONTyped(json);
}
function EvaluatedFactFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "fact": (0, Fact_1.FactFromJSON)(json["fact"]),
    "entailment": json["entailment"]
  };
}
function EvaluatedFactToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "fact": (0, Fact_1.FactToJSON)(value.fact),
    "entailment": value.entailment
  };
}
Object.defineProperty(Reasoning, "__esModule", { value: true });
Reasoning.instanceOfReasoning = instanceOfReasoning;
Reasoning.ReasoningFromJSON = ReasoningFromJSON;
Reasoning.ReasoningFromJSONTyped = ReasoningFromJSONTyped;
Reasoning.ReasoningToJSON = ReasoningToJSON;
const EvaluatedFact_1 = EvaluatedFact;
function instanceOfReasoning(value) {
  let isInstance = true;
  isInstance = isInstance && "evaluatedFacts" in value;
  return isInstance;
}
function ReasoningFromJSON(json) {
  return ReasoningFromJSONTyped(json);
}
function ReasoningFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "evaluatedFacts": json["evaluated_facts"].map(EvaluatedFact_1.EvaluatedFactFromJSON)
  };
}
function ReasoningToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "evaluated_facts": value.evaluatedFacts.map(EvaluatedFact_1.EvaluatedFactToJSON)
  };
}
var TokenCounts = {};
Object.defineProperty(TokenCounts, "__esModule", { value: true });
TokenCounts.instanceOfTokenCounts = instanceOfTokenCounts;
TokenCounts.TokenCountsFromJSON = TokenCountsFromJSON;
TokenCounts.TokenCountsFromJSONTyped = TokenCountsFromJSONTyped;
TokenCounts.TokenCountsToJSON = TokenCountsToJSON;
function instanceOfTokenCounts(value) {
  let isInstance = true;
  isInstance = isInstance && "promptTokens" in value;
  isInstance = isInstance && "completionTokens" in value;
  isInstance = isInstance && "totalTokens" in value;
  return isInstance;
}
function TokenCountsFromJSON(json) {
  return TokenCountsFromJSONTyped(json);
}
function TokenCountsFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "promptTokens": json["prompt_tokens"],
    "completionTokens": json["completion_tokens"],
    "totalTokens": json["total_tokens"]
  };
}
function TokenCountsToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "prompt_tokens": value.promptTokens,
    "completion_tokens": value.completionTokens,
    "total_tokens": value.totalTokens
  };
}
Object.defineProperty(AlignmentResponse, "__esModule", { value: true });
AlignmentResponse.instanceOfAlignmentResponse = instanceOfAlignmentResponse;
AlignmentResponse.AlignmentResponseFromJSON = AlignmentResponseFromJSON;
AlignmentResponse.AlignmentResponseFromJSONTyped = AlignmentResponseFromJSONTyped;
AlignmentResponse.AlignmentResponseToJSON = AlignmentResponseToJSON;
const Metrics_1 = Metrics;
const Reasoning_1 = Reasoning;
const TokenCounts_1 = TokenCounts;
function instanceOfAlignmentResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "metrics" in value;
  isInstance = isInstance && "reasoning" in value;
  isInstance = isInstance && "usage" in value;
  return isInstance;
}
function AlignmentResponseFromJSON(json) {
  return AlignmentResponseFromJSONTyped(json);
}
function AlignmentResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "metrics": (0, Metrics_1.MetricsFromJSON)(json["metrics"]),
    "reasoning": (0, Reasoning_1.ReasoningFromJSON)(json["reasoning"]),
    "usage": (0, TokenCounts_1.TokenCountsFromJSON)(json["usage"])
  };
}
function AlignmentResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "metrics": (0, Metrics_1.MetricsToJSON)(value.metrics),
    "reasoning": (0, Reasoning_1.ReasoningToJSON)(value.reasoning),
    "usage": (0, TokenCounts_1.TokenCountsToJSON)(value.usage)
  };
}
var BasicErrorResponse = {};
Object.defineProperty(BasicErrorResponse, "__esModule", { value: true });
BasicErrorResponse.instanceOfBasicErrorResponse = instanceOfBasicErrorResponse;
BasicErrorResponse.BasicErrorResponseFromJSON = BasicErrorResponseFromJSON;
BasicErrorResponse.BasicErrorResponseFromJSONTyped = BasicErrorResponseFromJSONTyped;
BasicErrorResponse.BasicErrorResponseToJSON = BasicErrorResponseToJSON;
function instanceOfBasicErrorResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "message" in value;
  return isInstance;
}
function BasicErrorResponseFromJSON(json) {
  return BasicErrorResponseFromJSONTyped(json);
}
function BasicErrorResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "message": json["message"]
  };
}
function BasicErrorResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "message": value.message
  };
}
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(AlignmentRequest, exports);
  __exportStar(AlignmentResponse, exports);
  __exportStar(BasicErrorResponse, exports);
  __exportStar(EvaluatedFact, exports);
  __exportStar(Fact, exports);
  __exportStar(Metrics, exports);
  __exportStar(Reasoning, exports);
  __exportStar(TokenCounts, exports);
})(models$3);
var __createBinding$5 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$5 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$5 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$5(result, mod, k);
  }
  __setModuleDefault$5(result, mod);
  return result;
};
Object.defineProperty(MetricsApi$1, "__esModule", { value: true });
MetricsApi$1.MetricsApi = void 0;
const runtime$8 = __importStar$5(runtime$9);
const index_1$5 = models$3;
class MetricsApi extends runtime$8.BaseAPI {
  /**
   * Evaluate the correctness and completeness of a response from an assistant or a RAG system. The correctness and completeness are evaluated based on the precision and recall of the generated answer with respect to the ground truth answer facts. Alignment is the harmonic mean of correctness and completeness.  For guidance and examples, see [Evaluate answers](https://docs.pinecone.io/guides/assistant/evaluate-answers).
   * Evaluate an answer
   */
  async metricsAlignmentRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$8.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling metricsAlignment.");
    }
    if (requestParameters.alignmentRequest === null || requestParameters.alignmentRequest === void 0) {
      throw new runtime$8.RequiredError("alignmentRequest", "Required parameter requestParameters.alignmentRequest was null or undefined when calling metricsAlignment.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/evaluation/metrics/alignment`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$5.AlignmentRequestToJSON)(requestParameters.alignmentRequest)
    }, initOverrides);
    return new runtime$8.JSONApiResponse(response, (jsonValue) => (0, index_1$5.AlignmentResponseFromJSON)(jsonValue));
  }
  /**
   * Evaluate the correctness and completeness of a response from an assistant or a RAG system. The correctness and completeness are evaluated based on the precision and recall of the generated answer with respect to the ground truth answer facts. Alignment is the harmonic mean of correctness and completeness.  For guidance and examples, see [Evaluate answers](https://docs.pinecone.io/guides/assistant/evaluate-answers).
   * Evaluate an answer
   */
  async metricsAlignment(requestParameters, initOverrides) {
    const response = await this.metricsAlignmentRaw(requestParameters, initOverrides);
    return await response.value();
  }
}
MetricsApi$1.MetricsApi = MetricsApi;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(MetricsApi$1, exports);
})(apis$3);
var api_version$3 = {};
Object.defineProperty(api_version$3, "__esModule", { value: true });
api_version$3.X_PINECONE_API_VERSION = void 0;
api_version$3.X_PINECONE_API_VERSION = "2025-10";
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(runtime$9, exports);
  __exportStar(apis$3, exports);
  __exportStar(models$3, exports);
  __exportStar(api_version$3, exports);
})(assistant_evaluation);
Object.defineProperty(evaluate$1, "__esModule", { value: true });
evaluate$1.evaluate = void 0;
const assistant_evaluation_1$1 = assistant_evaluation;
const errors_1$r = errors;
const evaluate = (metricsApi) => {
  return async (options) => {
    if (!options) {
      throw new errors_1$r.PineconeArgumentError("You must pass an object with required properties (`question`, `answer`, `groundTruth`) to evaluate.");
    }
    if (options.question == "" || options.answer == "" || options.groundTruth == "") {
      throw new errors_1$r.PineconeArgumentError("Invalid input. Question, answer, and groundTruth must be non-empty strings.");
    }
    return await metricsApi.metricsAlignment({
      xPineconeApiVersion: assistant_evaluation_1$1.X_PINECONE_API_VERSION,
      alignmentRequest: {
        question: options.question,
        answer: options.answer,
        groundTruthAnswer: options.groundTruth
      }
    });
  };
};
evaluate$1.evaluate = evaluate;
var asstControlOperationsBuilder$1 = {};
Object.defineProperty(asstControlOperationsBuilder$1, "__esModule", { value: true });
asstControlOperationsBuilder$1.asstControlOperationsBuilder = void 0;
const assistant_control_1 = assistant_control;
const utils_1$c = utils$1;
const middleware_1$6 = middleware;
const asstControlOperationsBuilder = (config2) => {
  const { apiKey } = config2;
  const controllerPath = (0, utils_1$c.normalizeUrl)(config2.controllerHostUrl) || "https://api.pinecone.io/assistant";
  const headers = config2.additionalHeaders || null;
  const apiConfig = {
    basePath: controllerPath,
    apiKey,
    queryParamsStringify: utils_1$c.queryParamsStringify,
    headers: {
      "User-Agent": (0, utils_1$c.buildUserAgent)(config2),
      "X-Pinecone-Api-Version": assistant_control_1.X_PINECONE_API_VERSION,
      ...headers
    },
    fetchApi: (0, utils_1$c.getFetch)(config2),
    middleware: (0, middleware_1$6.createMiddlewareArray)()
  };
  return new assistant_control_1.ManageAssistantsApi(new assistant_control_1.Configuration(apiConfig));
};
asstControlOperationsBuilder$1.asstControlOperationsBuilder = asstControlOperationsBuilder;
var asstMetricsOperationsBuilder$1 = {};
Object.defineProperty(asstMetricsOperationsBuilder$1, "__esModule", { value: true });
asstMetricsOperationsBuilder$1.asstMetricsOperationsBuilder = void 0;
const assistant_evaluation_1 = assistant_evaluation;
const utils_1$b = utils$1;
const middleware_1$5 = middleware;
const asstMetricsOperationsBuilder = (config2) => {
  const { apiKey } = config2;
  let hostUrl = "https://prod-1-data.ke.pinecone.io/assistant";
  if (config2.assistantRegion && config2.assistantRegion.toLowerCase() === "eu") {
    hostUrl = "https://prod-eu-data.ke.pinecone.io/assistant";
  }
  const headers = config2.additionalHeaders || null;
  const apiConfig = {
    basePath: hostUrl,
    apiKey,
    queryParamsStringify: utils_1$b.queryParamsStringify,
    headers: {
      "User-Agent": (0, utils_1$b.buildUserAgent)(config2),
      "X-Pinecone-Api-Version": assistant_evaluation_1.X_PINECONE_API_VERSION,
      ...headers
    },
    fetchApi: (0, utils_1$b.getFetch)(config2),
    middleware: (0, middleware_1$5.createMiddlewareArray)()
  };
  return new assistant_evaluation_1.MetricsApi(new assistant_evaluation_1.Configuration(apiConfig));
};
asstMetricsOperationsBuilder$1.asstMetricsOperationsBuilder = asstMetricsOperationsBuilder;
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.asstMetricsOperationsBuilder = exports.asstControlOperationsBuilder = exports.evaluate = exports.updateAssistant = exports.listAssistants = exports.describeAssistant = exports.deleteAssistant = exports.createAssistant = void 0;
  var createAssistant_1 = createAssistant$1;
  Object.defineProperty(exports, "createAssistant", { enumerable: true, get: function() {
    return createAssistant_1.createAssistant;
  } });
  var deleteAssistant_1 = deleteAssistant$1;
  Object.defineProperty(exports, "deleteAssistant", { enumerable: true, get: function() {
    return deleteAssistant_1.deleteAssistant;
  } });
  var describeAssistant_1 = describeAssistant$1;
  Object.defineProperty(exports, "describeAssistant", { enumerable: true, get: function() {
    return describeAssistant_1.describeAssistant;
  } });
  var listAssistants_1 = listAssistants$1;
  Object.defineProperty(exports, "listAssistants", { enumerable: true, get: function() {
    return listAssistants_1.listAssistants;
  } });
  var updateAssistant_1 = updateAssistant$1;
  Object.defineProperty(exports, "updateAssistant", { enumerable: true, get: function() {
    return updateAssistant_1.updateAssistant;
  } });
  var evaluate_1 = evaluate$1;
  Object.defineProperty(exports, "evaluate", { enumerable: true, get: function() {
    return evaluate_1.evaluate;
  } });
  var asstControlOperationsBuilder_12 = asstControlOperationsBuilder$1;
  Object.defineProperty(exports, "asstControlOperationsBuilder", { enumerable: true, get: function() {
    return asstControlOperationsBuilder_12.asstControlOperationsBuilder;
  } });
  var asstMetricsOperationsBuilder_12 = asstMetricsOperationsBuilder$1;
  Object.defineProperty(exports, "asstMetricsOperationsBuilder", { enumerable: true, get: function() {
    return asstMetricsOperationsBuilder_12.asstMetricsOperationsBuilder;
  } });
})(control);
var assistantHostSingleton = {};
Object.defineProperty(assistantHostSingleton, "__esModule", { value: true });
assistantHostSingleton.AssistantHostSingleton = void 0;
const utils_1$a = utils$1;
const asstControlOperationsBuilder_1$1 = asstControlOperationsBuilder$1;
const control_1$2 = control;
assistantHostSingleton.AssistantHostSingleton = /* @__PURE__ */ function() {
  const hostUrls = {};
  function ensureAssistantPath(url) {
    if (!url.endsWith("/assistant")) {
      url = url.endsWith("/") ? `${url}assistant` : `${url}/assistant`;
    }
    return url;
  }
  const _describeAssistant = async (config2, assistantName) => {
    const assistantControlApi = (0, asstControlOperationsBuilder_1$1.asstControlOperationsBuilder)(config2);
    const describeResponse = await (0, control_1$2.describeAssistant)(assistantControlApi)(assistantName);
    const host = describeResponse?.host;
    if (!host) {
      let defaultHost = "https://prod-1-data.ke.pinecone.io";
      if (config2.assistantRegion && config2.assistantRegion.toLowerCase() === "eu") {
        defaultHost = "https://prod-eu-data.ke.pinecone.io";
      }
      return defaultHost;
    } else {
      return host;
    }
  };
  const _key = (config2, assistantName) => `${config2.apiKey}-${assistantName}`;
  const singleton = {
    getHostUrl: async (config2, assistantName) => {
      const cacheKey = _key(config2, assistantName);
      if (cacheKey in hostUrls) {
        return hostUrls[cacheKey];
      } else {
        const hostUrl = await _describeAssistant(config2, assistantName);
        hostUrls[cacheKey] = (0, utils_1$a.normalizeUrl)(ensureAssistantPath(hostUrl));
      }
      return hostUrls[cacheKey];
    },
    _reset: () => {
      for (const key of Object.keys(hostUrls)) {
        delete hostUrls[key];
      }
    },
    _set: (config2, assistantName, hostUrl) => {
      const normalizedHostUrl = (0, utils_1$a.normalizeUrl)(ensureAssistantPath(hostUrl));
      if (!hostUrl || !normalizedHostUrl) {
        return;
      }
      const cacheKey = _key(config2, assistantName);
      hostUrls[cacheKey] = normalizedHostUrl;
    },
    _delete: (config2, assistantName) => {
      const cacheKey = _key(config2, assistantName);
      delete hostUrls[cacheKey];
    }
  };
  return singleton;
}();
var indexHostSingleton = {};
Object.defineProperty(indexHostSingleton, "__esModule", { value: true });
indexHostSingleton.IndexHostSingleton = void 0;
const control_1$1 = control$1;
const errors_1$q = errors;
const utils_1$9 = utils$1;
indexHostSingleton.IndexHostSingleton = /* @__PURE__ */ function() {
  const hostUrls = {};
  const _describeIndex = async (config2, indexName) => {
    const indexOperationsApi = (0, control_1$1.indexOperationsBuilder)(config2);
    const describeResponse = await (0, control_1$1.describeIndex)(indexOperationsApi)(indexName);
    const host = describeResponse.host;
    const privateHost = describeResponse.privateHost;
    if (!host) {
      throw new errors_1$q.PineconeUnableToResolveHostError("The HTTP call succeeded but the host URL could not be resolved. Please make sure the index exists and is in a ready state.");
    } else {
      return privateHost || host;
    }
  };
  const _key = (config2, indexName) => `${config2.apiKey}-${indexName}`;
  const singleton = {
    getHostUrl: async (config2, indexName) => {
      const cacheKey = _key(config2, indexName);
      if (cacheKey in hostUrls) {
        return hostUrls[cacheKey];
      } else {
        const hostUrl = await _describeIndex(config2, indexName);
        singleton._set(config2, indexName, hostUrl);
        if (!hostUrls[cacheKey]) {
          throw new errors_1$q.PineconeUnableToResolveHostError(`Could not get host for index: ${indexName}. Call describeIndex('${indexName}') to check the current status.`);
        }
        return hostUrls[cacheKey];
      }
    },
    _reset: () => {
      for (const key of Object.keys(hostUrls)) {
        delete hostUrls[key];
      }
    },
    _set: (config2, indexName, hostUrl) => {
      const normalizedHostUrl = (0, utils_1$9.normalizeUrl)(hostUrl);
      if (!normalizedHostUrl) {
        return;
      }
      const cacheKey = _key(config2, indexName);
      hostUrls[cacheKey] = normalizedHostUrl;
    },
    _delete: (config2, indexName) => {
      const cacheKey = _key(config2, indexName);
      delete hostUrls[cacheKey];
    }
  };
  return singleton;
}();
var data = {};
var upsert = {};
var db_data = {};
var runtime$7 = {};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TextApiResponse = exports.BlobApiResponse = exports.VoidApiResponse = exports.JSONApiResponse = exports.COLLECTION_FORMATS = exports.RequiredError = exports.FetchError = exports.ResponseError = exports.BaseAPI = exports.DefaultConfig = exports.Configuration = exports.BASE_PATH = void 0;
  exports.exists = exists;
  exports.querystring = querystring;
  exports.mapValues = mapValues;
  exports.canConsumeForm = canConsumeForm;
  exports.BASE_PATH = "https://unknown".replace(/\/+$/, "");
  class Configuration {
    configuration;
    constructor(configuration = {}) {
      this.configuration = configuration;
    }
    set config(configuration) {
      this.configuration = configuration;
    }
    get basePath() {
      return this.configuration.basePath != null ? this.configuration.basePath : exports.BASE_PATH;
    }
    get fetchApi() {
      return this.configuration.fetchApi;
    }
    get middleware() {
      return this.configuration.middleware || [];
    }
    get queryParamsStringify() {
      return this.configuration.queryParamsStringify || querystring;
    }
    get username() {
      return this.configuration.username;
    }
    get password() {
      return this.configuration.password;
    }
    get apiKey() {
      const apiKey = this.configuration.apiKey;
      if (apiKey) {
        return typeof apiKey === "function" ? apiKey : () => apiKey;
      }
      return void 0;
    }
    get accessToken() {
      const accessToken = this.configuration.accessToken;
      if (accessToken) {
        return typeof accessToken === "function" ? accessToken : async () => accessToken;
      }
      return void 0;
    }
    get headers() {
      return this.configuration.headers;
    }
    get credentials() {
      return this.configuration.credentials;
    }
  }
  exports.Configuration = Configuration;
  exports.DefaultConfig = new Configuration();
  class BaseAPI {
    configuration;
    static jsonRegex = new RegExp("^(:?application/json|[^;/ 	]+/[^;/ 	]+[+]json)[ 	]*(:?;.*)?$", "i");
    middleware;
    constructor(configuration = exports.DefaultConfig) {
      this.configuration = configuration;
      this.middleware = configuration.middleware;
    }
    withMiddleware(...middlewares) {
      const next = this.clone();
      next.middleware = next.middleware.concat(...middlewares);
      return next;
    }
    withPreMiddleware(...preMiddlewares) {
      const middlewares = preMiddlewares.map((pre) => ({ pre }));
      return this.withMiddleware(...middlewares);
    }
    withPostMiddleware(...postMiddlewares) {
      const middlewares = postMiddlewares.map((post) => ({ post }));
      return this.withMiddleware(...middlewares);
    }
    /**
     * Check if the given MIME is a JSON MIME.
     * JSON MIME examples:
     *   application/json
     *   application/json; charset=UTF8
     *   APPLICATION/JSON
     *   application/vnd.company+json
     * @param mime - MIME (Multipurpose Internet Mail Extensions)
     * @return True if the given MIME is JSON, false otherwise.
     */
    isJsonMime(mime) {
      if (!mime) {
        return false;
      }
      return BaseAPI.jsonRegex.test(mime);
    }
    async request(context2, initOverrides) {
      const { url, init } = await this.createFetchParams(context2, initOverrides);
      const response = await this.fetchApi(url, init);
      if (response && (response.status >= 200 && response.status < 300)) {
        return response;
      }
      throw new ResponseError(response, "Response returned an error code");
    }
    async createFetchParams(context2, initOverrides) {
      let url = this.configuration.basePath + context2.path;
      if (context2.query !== void 0 && Object.keys(context2.query).length !== 0) {
        url += "?" + this.configuration.queryParamsStringify(context2.query);
      }
      const headers = Object.assign({}, this.configuration.headers, context2.headers);
      Object.keys(headers).forEach((key) => headers[key] === void 0 ? delete headers[key] : {});
      const initOverrideFn = typeof initOverrides === "function" ? initOverrides : async () => initOverrides;
      const initParams = {
        method: context2.method,
        headers,
        body: context2.body,
        credentials: this.configuration.credentials
      };
      const overriddenInit = {
        ...initParams,
        ...await initOverrideFn({
          init: initParams,
          context: context2
        })
      };
      let body;
      if (isFormData(overriddenInit.body) || overriddenInit.body instanceof URLSearchParams || isBlob(overriddenInit.body)) {
        body = overriddenInit.body;
      } else if (this.isJsonMime(headers["Content-Type"])) {
        body = JSON.stringify(overriddenInit.body);
      } else {
        body = overriddenInit.body;
      }
      const init = {
        ...overriddenInit,
        body
      };
      return { url, init };
    }
    fetchApi = async (url, init) => {
      let fetchParams = { url, init };
      for (const middleware2 of this.middleware) {
        if (middleware2.pre) {
          fetchParams = await middleware2.pre({
            fetch: this.fetchApi,
            ...fetchParams
          }) || fetchParams;
        }
      }
      let response = void 0;
      try {
        response = await (this.configuration.fetchApi || fetch)(fetchParams.url, fetchParams.init);
      } catch (e) {
        for (const middleware2 of this.middleware) {
          if (middleware2.onError) {
            response = await middleware2.onError({
              fetch: this.fetchApi,
              url: fetchParams.url,
              init: fetchParams.init,
              error: e,
              response: response ? response.clone() : void 0
            }) || response;
          }
        }
        if (response === void 0) {
          if (e instanceof Error) {
            throw new FetchError(e, "The request failed and the interceptors did not return an alternative response");
          } else {
            throw e;
          }
        }
      }
      for (const middleware2 of this.middleware) {
        if (middleware2.post) {
          response = await middleware2.post({
            fetch: this.fetchApi,
            url: fetchParams.url,
            init: fetchParams.init,
            response: response.clone()
          }) || response;
        }
      }
      return response;
    };
    /**
     * Create a shallow clone of `this` by constructing a new instance
     * and then shallow cloning data members.
     */
    clone() {
      const constructor = this.constructor;
      const next = new constructor(this.configuration);
      next.middleware = this.middleware.slice();
      return next;
    }
  }
  exports.BaseAPI = BaseAPI;
  function isBlob(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  class ResponseError extends Error {
    response;
    name = "ResponseError";
    constructor(response, msg) {
      super(msg);
      this.response = response;
    }
  }
  exports.ResponseError = ResponseError;
  class FetchError extends Error {
    cause;
    name = "FetchError";
    constructor(cause, msg) {
      super(msg);
      this.cause = cause;
    }
  }
  exports.FetchError = FetchError;
  class RequiredError extends Error {
    field;
    name = "RequiredError";
    constructor(field, msg) {
      super(msg);
      this.field = field;
    }
  }
  exports.RequiredError = RequiredError;
  exports.COLLECTION_FORMATS = {
    csv: ",",
    ssv: " ",
    tsv: "	",
    pipes: "|"
  };
  function exists(json, key) {
    const value = json[key];
    return value !== null && value !== void 0;
  }
  function querystring(params, prefix = "") {
    return Object.keys(params).map((key) => querystringSingleKey2(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
  }
  function querystringSingleKey2(key, value, keyPrefix = "") {
    const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
    if (value instanceof Array) {
      const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
      return `${encodeURIComponent(fullKey)}=${multiValue}`;
    }
    if (value instanceof Set) {
      const valueAsArray = Array.from(value);
      return querystringSingleKey2(key, valueAsArray, keyPrefix);
    }
    if (value instanceof Date) {
      return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
    }
    if (value instanceof Object) {
      return querystring(value, fullKey);
    }
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
  }
  function mapValues(data2, fn) {
    return Object.keys(data2).reduce((acc, key) => ({ ...acc, [key]: fn(data2[key]) }), {});
  }
  function canConsumeForm(consumes) {
    for (const consume of consumes) {
      if ("multipart/form-data" === consume.contentType) {
        return true;
      }
    }
    return false;
  }
  class JSONApiResponse {
    raw;
    transformer;
    constructor(raw, transformer = (jsonValue) => jsonValue) {
      this.raw = raw;
      this.transformer = transformer;
    }
    async value() {
      return this.transformer(await this.raw.json());
    }
  }
  exports.JSONApiResponse = JSONApiResponse;
  class VoidApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return void 0;
    }
  }
  exports.VoidApiResponse = VoidApiResponse;
  class BlobApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.blob();
    }
  }
  exports.BlobApiResponse = BlobApiResponse;
  class TextApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.text();
    }
  }
  exports.TextApiResponse = TextApiResponse;
})(runtime$7);
var apis$2 = {};
var BulkOperationsApi$1 = {};
var models$2 = {};
var CreateNamespaceRequest = {};
var CreateNamespaceRequestSchema = {};
var CreateNamespaceRequestSchemaFieldsValue = {};
Object.defineProperty(CreateNamespaceRequestSchemaFieldsValue, "__esModule", { value: true });
CreateNamespaceRequestSchemaFieldsValue.instanceOfCreateNamespaceRequestSchemaFieldsValue = instanceOfCreateNamespaceRequestSchemaFieldsValue;
CreateNamespaceRequestSchemaFieldsValue.CreateNamespaceRequestSchemaFieldsValueFromJSON = CreateNamespaceRequestSchemaFieldsValueFromJSON;
CreateNamespaceRequestSchemaFieldsValue.CreateNamespaceRequestSchemaFieldsValueFromJSONTyped = CreateNamespaceRequestSchemaFieldsValueFromJSONTyped;
CreateNamespaceRequestSchemaFieldsValue.CreateNamespaceRequestSchemaFieldsValueToJSON = CreateNamespaceRequestSchemaFieldsValueToJSON;
const runtime_1$15 = runtime$7;
function instanceOfCreateNamespaceRequestSchemaFieldsValue(value) {
  let isInstance = true;
  return isInstance;
}
function CreateNamespaceRequestSchemaFieldsValueFromJSON(json) {
  return CreateNamespaceRequestSchemaFieldsValueFromJSONTyped(json);
}
function CreateNamespaceRequestSchemaFieldsValueFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "filterable": !(0, runtime_1$15.exists)(json, "filterable") ? void 0 : json["filterable"]
  };
}
function CreateNamespaceRequestSchemaFieldsValueToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "filterable": value.filterable
  };
}
Object.defineProperty(CreateNamespaceRequestSchema, "__esModule", { value: true });
CreateNamespaceRequestSchema.instanceOfCreateNamespaceRequestSchema = instanceOfCreateNamespaceRequestSchema;
CreateNamespaceRequestSchema.CreateNamespaceRequestSchemaFromJSON = CreateNamespaceRequestSchemaFromJSON;
CreateNamespaceRequestSchema.CreateNamespaceRequestSchemaFromJSONTyped = CreateNamespaceRequestSchemaFromJSONTyped;
CreateNamespaceRequestSchema.CreateNamespaceRequestSchemaToJSON = CreateNamespaceRequestSchemaToJSON;
const runtime_1$14 = runtime$7;
const CreateNamespaceRequestSchemaFieldsValue_1 = CreateNamespaceRequestSchemaFieldsValue;
function instanceOfCreateNamespaceRequestSchema(value) {
  let isInstance = true;
  isInstance = isInstance && "fields" in value;
  return isInstance;
}
function CreateNamespaceRequestSchemaFromJSON(json) {
  return CreateNamespaceRequestSchemaFromJSONTyped(json);
}
function CreateNamespaceRequestSchemaFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "fields": (0, runtime_1$14.mapValues)(json["fields"], CreateNamespaceRequestSchemaFieldsValue_1.CreateNamespaceRequestSchemaFieldsValueFromJSON)
  };
}
function CreateNamespaceRequestSchemaToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "fields": (0, runtime_1$14.mapValues)(value.fields, CreateNamespaceRequestSchemaFieldsValue_1.CreateNamespaceRequestSchemaFieldsValueToJSON)
  };
}
Object.defineProperty(CreateNamespaceRequest, "__esModule", { value: true });
CreateNamespaceRequest.instanceOfCreateNamespaceRequest = instanceOfCreateNamespaceRequest;
CreateNamespaceRequest.CreateNamespaceRequestFromJSON = CreateNamespaceRequestFromJSON;
CreateNamespaceRequest.CreateNamespaceRequestFromJSONTyped = CreateNamespaceRequestFromJSONTyped;
CreateNamespaceRequest.CreateNamespaceRequestToJSON = CreateNamespaceRequestToJSON;
const runtime_1$13 = runtime$7;
const CreateNamespaceRequestSchema_1$1 = CreateNamespaceRequestSchema;
function instanceOfCreateNamespaceRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  return isInstance;
}
function CreateNamespaceRequestFromJSON(json) {
  return CreateNamespaceRequestFromJSONTyped(json);
}
function CreateNamespaceRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "schema": !(0, runtime_1$13.exists)(json, "schema") ? void 0 : (0, CreateNamespaceRequestSchema_1$1.CreateNamespaceRequestSchemaFromJSON)(json["schema"])
  };
}
function CreateNamespaceRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "schema": (0, CreateNamespaceRequestSchema_1$1.CreateNamespaceRequestSchemaToJSON)(value.schema)
  };
}
var DeleteRequest = {};
Object.defineProperty(DeleteRequest, "__esModule", { value: true });
DeleteRequest.instanceOfDeleteRequest = instanceOfDeleteRequest;
DeleteRequest.DeleteRequestFromJSON = DeleteRequestFromJSON;
DeleteRequest.DeleteRequestFromJSONTyped = DeleteRequestFromJSONTyped;
DeleteRequest.DeleteRequestToJSON = DeleteRequestToJSON;
const runtime_1$12 = runtime$7;
function instanceOfDeleteRequest(value) {
  let isInstance = true;
  return isInstance;
}
function DeleteRequestFromJSON(json) {
  return DeleteRequestFromJSONTyped(json);
}
function DeleteRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "ids": !(0, runtime_1$12.exists)(json, "ids") ? void 0 : json["ids"],
    "deleteAll": !(0, runtime_1$12.exists)(json, "deleteAll") ? void 0 : json["deleteAll"],
    "namespace": !(0, runtime_1$12.exists)(json, "namespace") ? void 0 : json["namespace"],
    "filter": !(0, runtime_1$12.exists)(json, "filter") ? void 0 : json["filter"]
  };
}
function DeleteRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "ids": value.ids,
    "deleteAll": value.deleteAll,
    "namespace": value.namespace,
    "filter": value.filter
  };
}
var DescribeIndexStatsRequest = {};
Object.defineProperty(DescribeIndexStatsRequest, "__esModule", { value: true });
DescribeIndexStatsRequest.instanceOfDescribeIndexStatsRequest = instanceOfDescribeIndexStatsRequest;
DescribeIndexStatsRequest.DescribeIndexStatsRequestFromJSON = DescribeIndexStatsRequestFromJSON;
DescribeIndexStatsRequest.DescribeIndexStatsRequestFromJSONTyped = DescribeIndexStatsRequestFromJSONTyped;
DescribeIndexStatsRequest.DescribeIndexStatsRequestToJSON = DescribeIndexStatsRequestToJSON;
const runtime_1$11 = runtime$7;
function instanceOfDescribeIndexStatsRequest(value) {
  let isInstance = true;
  return isInstance;
}
function DescribeIndexStatsRequestFromJSON(json) {
  return DescribeIndexStatsRequestFromJSONTyped(json);
}
function DescribeIndexStatsRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "filter": !(0, runtime_1$11.exists)(json, "filter") ? void 0 : json["filter"]
  };
}
function DescribeIndexStatsRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "filter": value.filter
  };
}
var FetchByMetadataRequest = {};
Object.defineProperty(FetchByMetadataRequest, "__esModule", { value: true });
FetchByMetadataRequest.instanceOfFetchByMetadataRequest = instanceOfFetchByMetadataRequest;
FetchByMetadataRequest.FetchByMetadataRequestFromJSON = FetchByMetadataRequestFromJSON;
FetchByMetadataRequest.FetchByMetadataRequestFromJSONTyped = FetchByMetadataRequestFromJSONTyped;
FetchByMetadataRequest.FetchByMetadataRequestToJSON = FetchByMetadataRequestToJSON;
const runtime_1$10 = runtime$7;
function instanceOfFetchByMetadataRequest(value) {
  let isInstance = true;
  return isInstance;
}
function FetchByMetadataRequestFromJSON(json) {
  return FetchByMetadataRequestFromJSONTyped(json);
}
function FetchByMetadataRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "namespace": !(0, runtime_1$10.exists)(json, "namespace") ? void 0 : json["namespace"],
    "filter": !(0, runtime_1$10.exists)(json, "filter") ? void 0 : json["filter"],
    "limit": !(0, runtime_1$10.exists)(json, "limit") ? void 0 : json["limit"],
    "paginationToken": !(0, runtime_1$10.exists)(json, "paginationToken") ? void 0 : json["paginationToken"]
  };
}
function FetchByMetadataRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "namespace": value.namespace,
    "filter": value.filter,
    "limit": value.limit,
    "paginationToken": value.paginationToken
  };
}
var FetchByMetadataResponse = {};
var Pagination = {};
Object.defineProperty(Pagination, "__esModule", { value: true });
Pagination.instanceOfPagination = instanceOfPagination;
Pagination.PaginationFromJSON = PaginationFromJSON;
Pagination.PaginationFromJSONTyped = PaginationFromJSONTyped;
Pagination.PaginationToJSON = PaginationToJSON;
const runtime_1$$ = runtime$7;
function instanceOfPagination(value) {
  let isInstance = true;
  return isInstance;
}
function PaginationFromJSON(json) {
  return PaginationFromJSONTyped(json);
}
function PaginationFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "next": !(0, runtime_1$$.exists)(json, "next") ? void 0 : json["next"]
  };
}
function PaginationToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "next": value.next
  };
}
var Usage2 = {};
Object.defineProperty(Usage2, "__esModule", { value: true });
Usage2.instanceOfUsage = instanceOfUsage;
Usage2.UsageFromJSON = UsageFromJSON;
Usage2.UsageFromJSONTyped = UsageFromJSONTyped;
Usage2.UsageToJSON = UsageToJSON;
const runtime_1$_ = runtime$7;
function instanceOfUsage(value) {
  let isInstance = true;
  return isInstance;
}
function UsageFromJSON(json) {
  return UsageFromJSONTyped(json);
}
function UsageFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "readUnits": !(0, runtime_1$_.exists)(json, "readUnits") ? void 0 : json["readUnits"]
  };
}
function UsageToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "readUnits": value.readUnits
  };
}
var Vector = {};
var SparseValues = {};
Object.defineProperty(SparseValues, "__esModule", { value: true });
SparseValues.instanceOfSparseValues = instanceOfSparseValues;
SparseValues.SparseValuesFromJSON = SparseValuesFromJSON;
SparseValues.SparseValuesFromJSONTyped = SparseValuesFromJSONTyped;
SparseValues.SparseValuesToJSON = SparseValuesToJSON;
function instanceOfSparseValues(value) {
  let isInstance = true;
  isInstance = isInstance && "indices" in value;
  isInstance = isInstance && "values" in value;
  return isInstance;
}
function SparseValuesFromJSON(json) {
  return SparseValuesFromJSONTyped(json);
}
function SparseValuesFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "indices": json["indices"],
    "values": json["values"]
  };
}
function SparseValuesToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "indices": value.indices,
    "values": value.values
  };
}
Object.defineProperty(Vector, "__esModule", { value: true });
Vector.instanceOfVector = instanceOfVector;
Vector.VectorFromJSON = VectorFromJSON;
Vector.VectorFromJSONTyped = VectorFromJSONTyped;
Vector.VectorToJSON = VectorToJSON;
const runtime_1$Z = runtime$7;
const SparseValues_1$4 = SparseValues;
function instanceOfVector(value) {
  let isInstance = true;
  isInstance = isInstance && "id" in value;
  return isInstance;
}
function VectorFromJSON(json) {
  return VectorFromJSONTyped(json);
}
function VectorFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": json["id"],
    "values": !(0, runtime_1$Z.exists)(json, "values") ? void 0 : json["values"],
    "sparseValues": !(0, runtime_1$Z.exists)(json, "sparseValues") ? void 0 : (0, SparseValues_1$4.SparseValuesFromJSON)(json["sparseValues"]),
    "metadata": !(0, runtime_1$Z.exists)(json, "metadata") ? void 0 : json["metadata"]
  };
}
function VectorToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "values": value.values,
    "sparseValues": (0, SparseValues_1$4.SparseValuesToJSON)(value.sparseValues),
    "metadata": value.metadata
  };
}
Object.defineProperty(FetchByMetadataResponse, "__esModule", { value: true });
FetchByMetadataResponse.instanceOfFetchByMetadataResponse = instanceOfFetchByMetadataResponse;
FetchByMetadataResponse.FetchByMetadataResponseFromJSON = FetchByMetadataResponseFromJSON;
FetchByMetadataResponse.FetchByMetadataResponseFromJSONTyped = FetchByMetadataResponseFromJSONTyped;
FetchByMetadataResponse.FetchByMetadataResponseToJSON = FetchByMetadataResponseToJSON;
const runtime_1$Y = runtime$7;
const Pagination_1$3 = Pagination;
const Usage_1$3 = Usage2;
const Vector_1$2 = Vector;
function instanceOfFetchByMetadataResponse(value) {
  let isInstance = true;
  return isInstance;
}
function FetchByMetadataResponseFromJSON(json) {
  return FetchByMetadataResponseFromJSONTyped(json);
}
function FetchByMetadataResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "vectors": !(0, runtime_1$Y.exists)(json, "vectors") ? void 0 : (0, runtime_1$Y.mapValues)(json["vectors"], Vector_1$2.VectorFromJSON),
    "namespace": !(0, runtime_1$Y.exists)(json, "namespace") ? void 0 : json["namespace"],
    "usage": !(0, runtime_1$Y.exists)(json, "usage") ? void 0 : (0, Usage_1$3.UsageFromJSON)(json["usage"]),
    "pagination": !(0, runtime_1$Y.exists)(json, "pagination") ? void 0 : (0, Pagination_1$3.PaginationFromJSON)(json["pagination"])
  };
}
function FetchByMetadataResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "vectors": value.vectors === void 0 ? void 0 : (0, runtime_1$Y.mapValues)(value.vectors, Vector_1$2.VectorToJSON),
    "namespace": value.namespace,
    "usage": (0, Usage_1$3.UsageToJSON)(value.usage),
    "pagination": (0, Pagination_1$3.PaginationToJSON)(value.pagination)
  };
}
var FetchResponse = {};
Object.defineProperty(FetchResponse, "__esModule", { value: true });
FetchResponse.instanceOfFetchResponse = instanceOfFetchResponse;
FetchResponse.FetchResponseFromJSON = FetchResponseFromJSON;
FetchResponse.FetchResponseFromJSONTyped = FetchResponseFromJSONTyped;
FetchResponse.FetchResponseToJSON = FetchResponseToJSON;
const runtime_1$X = runtime$7;
const Usage_1$2 = Usage2;
const Vector_1$1 = Vector;
function instanceOfFetchResponse(value) {
  let isInstance = true;
  return isInstance;
}
function FetchResponseFromJSON(json) {
  return FetchResponseFromJSONTyped(json);
}
function FetchResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "vectors": !(0, runtime_1$X.exists)(json, "vectors") ? void 0 : (0, runtime_1$X.mapValues)(json["vectors"], Vector_1$1.VectorFromJSON),
    "namespace": !(0, runtime_1$X.exists)(json, "namespace") ? void 0 : json["namespace"],
    "usage": !(0, runtime_1$X.exists)(json, "usage") ? void 0 : (0, Usage_1$2.UsageFromJSON)(json["usage"])
  };
}
function FetchResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "vectors": value.vectors === void 0 ? void 0 : (0, runtime_1$X.mapValues)(value.vectors, Vector_1$1.VectorToJSON),
    "namespace": value.namespace,
    "usage": (0, Usage_1$2.UsageToJSON)(value.usage)
  };
}
var Hit = {};
Object.defineProperty(Hit, "__esModule", { value: true });
Hit.instanceOfHit = instanceOfHit;
Hit.HitFromJSON = HitFromJSON;
Hit.HitFromJSONTyped = HitFromJSONTyped;
Hit.HitToJSON = HitToJSON;
function instanceOfHit(value) {
  let isInstance = true;
  isInstance = isInstance && "_id" in value;
  isInstance = isInstance && "_score" in value;
  isInstance = isInstance && "fields" in value;
  return isInstance;
}
function HitFromJSON(json) {
  return HitFromJSONTyped(json);
}
function HitFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "_id": json["_id"],
    "_score": json["_score"],
    "fields": json["fields"]
  };
}
function HitToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "_id": value._id,
    "_score": value._score,
    "fields": value.fields
  };
}
var ImportErrorMode = {};
Object.defineProperty(ImportErrorMode, "__esModule", { value: true });
ImportErrorMode.instanceOfImportErrorMode = instanceOfImportErrorMode;
ImportErrorMode.ImportErrorModeFromJSON = ImportErrorModeFromJSON;
ImportErrorMode.ImportErrorModeFromJSONTyped = ImportErrorModeFromJSONTyped;
ImportErrorMode.ImportErrorModeToJSON = ImportErrorModeToJSON;
const runtime_1$W = runtime$7;
function instanceOfImportErrorMode(value) {
  let isInstance = true;
  return isInstance;
}
function ImportErrorModeFromJSON(json) {
  return ImportErrorModeFromJSONTyped(json);
}
function ImportErrorModeFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "onError": !(0, runtime_1$W.exists)(json, "onError") ? void 0 : json["onError"]
  };
}
function ImportErrorModeToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "onError": value.onError
  };
}
var ImportModel = {};
Object.defineProperty(ImportModel, "__esModule", { value: true });
ImportModel.instanceOfImportModel = instanceOfImportModel;
ImportModel.ImportModelFromJSON = ImportModelFromJSON;
ImportModel.ImportModelFromJSONTyped = ImportModelFromJSONTyped;
ImportModel.ImportModelToJSON = ImportModelToJSON;
const runtime_1$V = runtime$7;
function instanceOfImportModel(value) {
  let isInstance = true;
  return isInstance;
}
function ImportModelFromJSON(json) {
  return ImportModelFromJSONTyped(json);
}
function ImportModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1$V.exists)(json, "id") ? void 0 : json["id"],
    "uri": !(0, runtime_1$V.exists)(json, "uri") ? void 0 : json["uri"],
    "status": !(0, runtime_1$V.exists)(json, "status") ? void 0 : json["status"],
    "createdAt": !(0, runtime_1$V.exists)(json, "createdAt") ? void 0 : new Date(json["createdAt"]),
    "finishedAt": !(0, runtime_1$V.exists)(json, "finishedAt") ? void 0 : new Date(json["finishedAt"]),
    "percentComplete": !(0, runtime_1$V.exists)(json, "percentComplete") ? void 0 : json["percentComplete"],
    "recordsImported": !(0, runtime_1$V.exists)(json, "recordsImported") ? void 0 : json["recordsImported"],
    "error": !(0, runtime_1$V.exists)(json, "error") ? void 0 : json["error"]
  };
}
function ImportModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "uri": value.uri,
    "status": value.status,
    "createdAt": value.createdAt === void 0 ? void 0 : value.createdAt.toISOString(),
    "finishedAt": value.finishedAt === void 0 ? void 0 : value.finishedAt.toISOString(),
    "percentComplete": value.percentComplete,
    "recordsImported": value.recordsImported,
    "error": value.error
  };
}
var IndexDescription = {};
var NamespaceSummary = {};
Object.defineProperty(NamespaceSummary, "__esModule", { value: true });
NamespaceSummary.instanceOfNamespaceSummary = instanceOfNamespaceSummary;
NamespaceSummary.NamespaceSummaryFromJSON = NamespaceSummaryFromJSON;
NamespaceSummary.NamespaceSummaryFromJSONTyped = NamespaceSummaryFromJSONTyped;
NamespaceSummary.NamespaceSummaryToJSON = NamespaceSummaryToJSON;
const runtime_1$U = runtime$7;
function instanceOfNamespaceSummary(value) {
  let isInstance = true;
  return isInstance;
}
function NamespaceSummaryFromJSON(json) {
  return NamespaceSummaryFromJSONTyped(json);
}
function NamespaceSummaryFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "vectorCount": !(0, runtime_1$U.exists)(json, "vectorCount") ? void 0 : json["vectorCount"]
  };
}
function NamespaceSummaryToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "vectorCount": value.vectorCount
  };
}
Object.defineProperty(IndexDescription, "__esModule", { value: true });
IndexDescription.instanceOfIndexDescription = instanceOfIndexDescription;
IndexDescription.IndexDescriptionFromJSON = IndexDescriptionFromJSON;
IndexDescription.IndexDescriptionFromJSONTyped = IndexDescriptionFromJSONTyped;
IndexDescription.IndexDescriptionToJSON = IndexDescriptionToJSON;
const runtime_1$T = runtime$7;
const NamespaceSummary_1 = NamespaceSummary;
function instanceOfIndexDescription(value) {
  let isInstance = true;
  return isInstance;
}
function IndexDescriptionFromJSON(json) {
  return IndexDescriptionFromJSONTyped(json);
}
function IndexDescriptionFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "namespaces": !(0, runtime_1$T.exists)(json, "namespaces") ? void 0 : (0, runtime_1$T.mapValues)(json["namespaces"], NamespaceSummary_1.NamespaceSummaryFromJSON),
    "dimension": !(0, runtime_1$T.exists)(json, "dimension") ? void 0 : json["dimension"],
    "indexFullness": !(0, runtime_1$T.exists)(json, "indexFullness") ? void 0 : json["indexFullness"],
    "totalVectorCount": !(0, runtime_1$T.exists)(json, "totalVectorCount") ? void 0 : json["totalVectorCount"],
    "metric": !(0, runtime_1$T.exists)(json, "metric") ? void 0 : json["metric"],
    "vectorType": !(0, runtime_1$T.exists)(json, "vectorType") ? void 0 : json["vectorType"],
    "memoryFullness": !(0, runtime_1$T.exists)(json, "memory_fullness") ? void 0 : json["memory_fullness"],
    "storageFullness": !(0, runtime_1$T.exists)(json, "storage_fullness") ? void 0 : json["storage_fullness"]
  };
}
function IndexDescriptionToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "namespaces": value.namespaces === void 0 ? void 0 : (0, runtime_1$T.mapValues)(value.namespaces, NamespaceSummary_1.NamespaceSummaryToJSON),
    "dimension": value.dimension,
    "indexFullness": value.indexFullness,
    "totalVectorCount": value.totalVectorCount,
    "metric": value.metric,
    "vectorType": value.vectorType,
    "memory_fullness": value.memoryFullness,
    "storage_fullness": value.storageFullness
  };
}
var ListImportsResponse = {};
Object.defineProperty(ListImportsResponse, "__esModule", { value: true });
ListImportsResponse.instanceOfListImportsResponse = instanceOfListImportsResponse;
ListImportsResponse.ListImportsResponseFromJSON = ListImportsResponseFromJSON;
ListImportsResponse.ListImportsResponseFromJSONTyped = ListImportsResponseFromJSONTyped;
ListImportsResponse.ListImportsResponseToJSON = ListImportsResponseToJSON;
const runtime_1$S = runtime$7;
const ImportModel_1 = ImportModel;
const Pagination_1$2 = Pagination;
function instanceOfListImportsResponse(value) {
  let isInstance = true;
  return isInstance;
}
function ListImportsResponseFromJSON(json) {
  return ListImportsResponseFromJSONTyped(json);
}
function ListImportsResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "data": !(0, runtime_1$S.exists)(json, "data") ? void 0 : json["data"].map(ImportModel_1.ImportModelFromJSON),
    "pagination": !(0, runtime_1$S.exists)(json, "pagination") ? void 0 : (0, Pagination_1$2.PaginationFromJSON)(json["pagination"])
  };
}
function ListImportsResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "data": value.data === void 0 ? void 0 : value.data.map(ImportModel_1.ImportModelToJSON),
    "pagination": (0, Pagination_1$2.PaginationToJSON)(value.pagination)
  };
}
var ListItem = {};
Object.defineProperty(ListItem, "__esModule", { value: true });
ListItem.instanceOfListItem = instanceOfListItem;
ListItem.ListItemFromJSON = ListItemFromJSON;
ListItem.ListItemFromJSONTyped = ListItemFromJSONTyped;
ListItem.ListItemToJSON = ListItemToJSON;
const runtime_1$R = runtime$7;
function instanceOfListItem(value) {
  let isInstance = true;
  return isInstance;
}
function ListItemFromJSON(json) {
  return ListItemFromJSONTyped(json);
}
function ListItemFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1$R.exists)(json, "id") ? void 0 : json["id"]
  };
}
function ListItemToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id
  };
}
var ListNamespacesResponse = {};
var NamespaceDescription = {};
var NamespaceDescriptionIndexedFields = {};
Object.defineProperty(NamespaceDescriptionIndexedFields, "__esModule", { value: true });
NamespaceDescriptionIndexedFields.instanceOfNamespaceDescriptionIndexedFields = instanceOfNamespaceDescriptionIndexedFields;
NamespaceDescriptionIndexedFields.NamespaceDescriptionIndexedFieldsFromJSON = NamespaceDescriptionIndexedFieldsFromJSON;
NamespaceDescriptionIndexedFields.NamespaceDescriptionIndexedFieldsFromJSONTyped = NamespaceDescriptionIndexedFieldsFromJSONTyped;
NamespaceDescriptionIndexedFields.NamespaceDescriptionIndexedFieldsToJSON = NamespaceDescriptionIndexedFieldsToJSON;
const runtime_1$Q = runtime$7;
function instanceOfNamespaceDescriptionIndexedFields(value) {
  let isInstance = true;
  return isInstance;
}
function NamespaceDescriptionIndexedFieldsFromJSON(json) {
  return NamespaceDescriptionIndexedFieldsFromJSONTyped(json);
}
function NamespaceDescriptionIndexedFieldsFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "fields": !(0, runtime_1$Q.exists)(json, "fields") ? void 0 : json["fields"]
  };
}
function NamespaceDescriptionIndexedFieldsToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "fields": value.fields
  };
}
Object.defineProperty(NamespaceDescription, "__esModule", { value: true });
NamespaceDescription.instanceOfNamespaceDescription = instanceOfNamespaceDescription;
NamespaceDescription.NamespaceDescriptionFromJSON = NamespaceDescriptionFromJSON;
NamespaceDescription.NamespaceDescriptionFromJSONTyped = NamespaceDescriptionFromJSONTyped;
NamespaceDescription.NamespaceDescriptionToJSON = NamespaceDescriptionToJSON;
const runtime_1$P = runtime$7;
const CreateNamespaceRequestSchema_1 = CreateNamespaceRequestSchema;
const NamespaceDescriptionIndexedFields_1 = NamespaceDescriptionIndexedFields;
function instanceOfNamespaceDescription(value) {
  let isInstance = true;
  return isInstance;
}
function NamespaceDescriptionFromJSON(json) {
  return NamespaceDescriptionFromJSONTyped(json);
}
function NamespaceDescriptionFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": !(0, runtime_1$P.exists)(json, "name") ? void 0 : json["name"],
    "recordCount": !(0, runtime_1$P.exists)(json, "record_count") ? void 0 : json["record_count"],
    "schema": !(0, runtime_1$P.exists)(json, "schema") ? void 0 : (0, CreateNamespaceRequestSchema_1.CreateNamespaceRequestSchemaFromJSON)(json["schema"]),
    "indexedFields": !(0, runtime_1$P.exists)(json, "indexed_fields") ? void 0 : (0, NamespaceDescriptionIndexedFields_1.NamespaceDescriptionIndexedFieldsFromJSON)(json["indexed_fields"])
  };
}
function NamespaceDescriptionToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "record_count": value.recordCount,
    "schema": (0, CreateNamespaceRequestSchema_1.CreateNamespaceRequestSchemaToJSON)(value.schema),
    "indexed_fields": (0, NamespaceDescriptionIndexedFields_1.NamespaceDescriptionIndexedFieldsToJSON)(value.indexedFields)
  };
}
Object.defineProperty(ListNamespacesResponse, "__esModule", { value: true });
ListNamespacesResponse.instanceOfListNamespacesResponse = instanceOfListNamespacesResponse;
ListNamespacesResponse.ListNamespacesResponseFromJSON = ListNamespacesResponseFromJSON;
ListNamespacesResponse.ListNamespacesResponseFromJSONTyped = ListNamespacesResponseFromJSONTyped;
ListNamespacesResponse.ListNamespacesResponseToJSON = ListNamespacesResponseToJSON;
const runtime_1$O = runtime$7;
const NamespaceDescription_1 = NamespaceDescription;
const Pagination_1$1 = Pagination;
function instanceOfListNamespacesResponse(value) {
  let isInstance = true;
  return isInstance;
}
function ListNamespacesResponseFromJSON(json) {
  return ListNamespacesResponseFromJSONTyped(json);
}
function ListNamespacesResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "namespaces": !(0, runtime_1$O.exists)(json, "namespaces") ? void 0 : json["namespaces"].map(NamespaceDescription_1.NamespaceDescriptionFromJSON),
    "pagination": !(0, runtime_1$O.exists)(json, "pagination") ? void 0 : (0, Pagination_1$1.PaginationFromJSON)(json["pagination"]),
    "totalCount": !(0, runtime_1$O.exists)(json, "total_count") ? void 0 : json["total_count"]
  };
}
function ListNamespacesResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "namespaces": value.namespaces === void 0 ? void 0 : value.namespaces.map(NamespaceDescription_1.NamespaceDescriptionToJSON),
    "pagination": (0, Pagination_1$1.PaginationToJSON)(value.pagination),
    "total_count": value.totalCount
  };
}
var ListResponse = {};
Object.defineProperty(ListResponse, "__esModule", { value: true });
ListResponse.instanceOfListResponse = instanceOfListResponse;
ListResponse.ListResponseFromJSON = ListResponseFromJSON;
ListResponse.ListResponseFromJSONTyped = ListResponseFromJSONTyped;
ListResponse.ListResponseToJSON = ListResponseToJSON;
const runtime_1$N = runtime$7;
const ListItem_1 = ListItem;
const Pagination_1 = Pagination;
const Usage_1$1 = Usage2;
function instanceOfListResponse(value) {
  let isInstance = true;
  return isInstance;
}
function ListResponseFromJSON(json) {
  return ListResponseFromJSONTyped(json);
}
function ListResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "vectors": !(0, runtime_1$N.exists)(json, "vectors") ? void 0 : json["vectors"].map(ListItem_1.ListItemFromJSON),
    "pagination": !(0, runtime_1$N.exists)(json, "pagination") ? void 0 : (0, Pagination_1.PaginationFromJSON)(json["pagination"]),
    "namespace": !(0, runtime_1$N.exists)(json, "namespace") ? void 0 : json["namespace"],
    "usage": !(0, runtime_1$N.exists)(json, "usage") ? void 0 : (0, Usage_1$1.UsageFromJSON)(json["usage"])
  };
}
function ListResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "vectors": value.vectors === void 0 ? void 0 : value.vectors.map(ListItem_1.ListItemToJSON),
    "pagination": (0, Pagination_1.PaginationToJSON)(value.pagination),
    "namespace": value.namespace,
    "usage": (0, Usage_1$1.UsageToJSON)(value.usage)
  };
}
var ProtobufAny = {};
Object.defineProperty(ProtobufAny, "__esModule", { value: true });
ProtobufAny.instanceOfProtobufAny = instanceOfProtobufAny;
ProtobufAny.ProtobufAnyFromJSON = ProtobufAnyFromJSON;
ProtobufAny.ProtobufAnyFromJSONTyped = ProtobufAnyFromJSONTyped;
ProtobufAny.ProtobufAnyToJSON = ProtobufAnyToJSON;
const runtime_1$M = runtime$7;
function instanceOfProtobufAny(value) {
  let isInstance = true;
  return isInstance;
}
function ProtobufAnyFromJSON(json) {
  return ProtobufAnyFromJSONTyped(json);
}
function ProtobufAnyFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "typeUrl": !(0, runtime_1$M.exists)(json, "typeUrl") ? void 0 : json["typeUrl"],
    "value": !(0, runtime_1$M.exists)(json, "value") ? void 0 : json["value"]
  };
}
function ProtobufAnyToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "typeUrl": value.typeUrl,
    "value": value.value
  };
}
var QueryRequest = {};
var QueryVector = {};
Object.defineProperty(QueryVector, "__esModule", { value: true });
QueryVector.instanceOfQueryVector = instanceOfQueryVector;
QueryVector.QueryVectorFromJSON = QueryVectorFromJSON;
QueryVector.QueryVectorFromJSONTyped = QueryVectorFromJSONTyped;
QueryVector.QueryVectorToJSON = QueryVectorToJSON;
const runtime_1$L = runtime$7;
const SparseValues_1$3 = SparseValues;
function instanceOfQueryVector(value) {
  let isInstance = true;
  isInstance = isInstance && "values" in value;
  return isInstance;
}
function QueryVectorFromJSON(json) {
  return QueryVectorFromJSONTyped(json);
}
function QueryVectorFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "values": json["values"],
    "sparseValues": !(0, runtime_1$L.exists)(json, "sparseValues") ? void 0 : (0, SparseValues_1$3.SparseValuesFromJSON)(json["sparseValues"]),
    "topK": !(0, runtime_1$L.exists)(json, "topK") ? void 0 : json["topK"],
    "namespace": !(0, runtime_1$L.exists)(json, "namespace") ? void 0 : json["namespace"],
    "filter": !(0, runtime_1$L.exists)(json, "filter") ? void 0 : json["filter"]
  };
}
function QueryVectorToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "values": value.values,
    "sparseValues": (0, SparseValues_1$3.SparseValuesToJSON)(value.sparseValues),
    "topK": value.topK,
    "namespace": value.namespace,
    "filter": value.filter
  };
}
Object.defineProperty(QueryRequest, "__esModule", { value: true });
QueryRequest.instanceOfQueryRequest = instanceOfQueryRequest;
QueryRequest.QueryRequestFromJSON = QueryRequestFromJSON;
QueryRequest.QueryRequestFromJSONTyped = QueryRequestFromJSONTyped;
QueryRequest.QueryRequestToJSON = QueryRequestToJSON;
const runtime_1$K = runtime$7;
const QueryVector_1 = QueryVector;
const SparseValues_1$2 = SparseValues;
function instanceOfQueryRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "topK" in value;
  return isInstance;
}
function QueryRequestFromJSON(json) {
  return QueryRequestFromJSONTyped(json);
}
function QueryRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "namespace": !(0, runtime_1$K.exists)(json, "namespace") ? void 0 : json["namespace"],
    "topK": json["topK"],
    "filter": !(0, runtime_1$K.exists)(json, "filter") ? void 0 : json["filter"],
    "includeValues": !(0, runtime_1$K.exists)(json, "includeValues") ? void 0 : json["includeValues"],
    "includeMetadata": !(0, runtime_1$K.exists)(json, "includeMetadata") ? void 0 : json["includeMetadata"],
    "queries": !(0, runtime_1$K.exists)(json, "queries") ? void 0 : json["queries"].map(QueryVector_1.QueryVectorFromJSON),
    "vector": !(0, runtime_1$K.exists)(json, "vector") ? void 0 : json["vector"],
    "sparseVector": !(0, runtime_1$K.exists)(json, "sparseVector") ? void 0 : (0, SparseValues_1$2.SparseValuesFromJSON)(json["sparseVector"]),
    "id": !(0, runtime_1$K.exists)(json, "id") ? void 0 : json["id"],
    "scanFactor": !(0, runtime_1$K.exists)(json, "scanFactor") ? void 0 : json["scanFactor"],
    "maxCandidates": !(0, runtime_1$K.exists)(json, "maxCandidates") ? void 0 : json["maxCandidates"]
  };
}
function QueryRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "namespace": value.namespace,
    "topK": value.topK,
    "filter": value.filter,
    "includeValues": value.includeValues,
    "includeMetadata": value.includeMetadata,
    "queries": value.queries === void 0 ? void 0 : value.queries.map(QueryVector_1.QueryVectorToJSON),
    "vector": value.vector,
    "sparseVector": (0, SparseValues_1$2.SparseValuesToJSON)(value.sparseVector),
    "id": value.id,
    "scanFactor": value.scanFactor,
    "maxCandidates": value.maxCandidates
  };
}
var QueryResponse = {};
var ScoredVector = {};
Object.defineProperty(ScoredVector, "__esModule", { value: true });
ScoredVector.instanceOfScoredVector = instanceOfScoredVector;
ScoredVector.ScoredVectorFromJSON = ScoredVectorFromJSON;
ScoredVector.ScoredVectorFromJSONTyped = ScoredVectorFromJSONTyped;
ScoredVector.ScoredVectorToJSON = ScoredVectorToJSON;
const runtime_1$J = runtime$7;
const SparseValues_1$1 = SparseValues;
function instanceOfScoredVector(value) {
  let isInstance = true;
  isInstance = isInstance && "id" in value;
  return isInstance;
}
function ScoredVectorFromJSON(json) {
  return ScoredVectorFromJSONTyped(json);
}
function ScoredVectorFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": json["id"],
    "score": !(0, runtime_1$J.exists)(json, "score") ? void 0 : json["score"],
    "values": !(0, runtime_1$J.exists)(json, "values") ? void 0 : json["values"],
    "sparseValues": !(0, runtime_1$J.exists)(json, "sparseValues") ? void 0 : (0, SparseValues_1$1.SparseValuesFromJSON)(json["sparseValues"]),
    "metadata": !(0, runtime_1$J.exists)(json, "metadata") ? void 0 : json["metadata"]
  };
}
function ScoredVectorToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "score": value.score,
    "values": value.values,
    "sparseValues": (0, SparseValues_1$1.SparseValuesToJSON)(value.sparseValues),
    "metadata": value.metadata
  };
}
var SingleQueryResults = {};
Object.defineProperty(SingleQueryResults, "__esModule", { value: true });
SingleQueryResults.instanceOfSingleQueryResults = instanceOfSingleQueryResults;
SingleQueryResults.SingleQueryResultsFromJSON = SingleQueryResultsFromJSON;
SingleQueryResults.SingleQueryResultsFromJSONTyped = SingleQueryResultsFromJSONTyped;
SingleQueryResults.SingleQueryResultsToJSON = SingleQueryResultsToJSON;
const runtime_1$I = runtime$7;
const ScoredVector_1$1 = ScoredVector;
function instanceOfSingleQueryResults(value) {
  let isInstance = true;
  return isInstance;
}
function SingleQueryResultsFromJSON(json) {
  return SingleQueryResultsFromJSONTyped(json);
}
function SingleQueryResultsFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "matches": !(0, runtime_1$I.exists)(json, "matches") ? void 0 : json["matches"].map(ScoredVector_1$1.ScoredVectorFromJSON),
    "namespace": !(0, runtime_1$I.exists)(json, "namespace") ? void 0 : json["namespace"]
  };
}
function SingleQueryResultsToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "matches": value.matches === void 0 ? void 0 : value.matches.map(ScoredVector_1$1.ScoredVectorToJSON),
    "namespace": value.namespace
  };
}
Object.defineProperty(QueryResponse, "__esModule", { value: true });
QueryResponse.instanceOfQueryResponse = instanceOfQueryResponse;
QueryResponse.QueryResponseFromJSON = QueryResponseFromJSON;
QueryResponse.QueryResponseFromJSONTyped = QueryResponseFromJSONTyped;
QueryResponse.QueryResponseToJSON = QueryResponseToJSON;
const runtime_1$H = runtime$7;
const ScoredVector_1 = ScoredVector;
const SingleQueryResults_1 = SingleQueryResults;
const Usage_1 = Usage2;
function instanceOfQueryResponse(value) {
  let isInstance = true;
  return isInstance;
}
function QueryResponseFromJSON(json) {
  return QueryResponseFromJSONTyped(json);
}
function QueryResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "results": !(0, runtime_1$H.exists)(json, "results") ? void 0 : json["results"].map(SingleQueryResults_1.SingleQueryResultsFromJSON),
    "matches": !(0, runtime_1$H.exists)(json, "matches") ? void 0 : json["matches"].map(ScoredVector_1.ScoredVectorFromJSON),
    "namespace": !(0, runtime_1$H.exists)(json, "namespace") ? void 0 : json["namespace"],
    "usage": !(0, runtime_1$H.exists)(json, "usage") ? void 0 : (0, Usage_1.UsageFromJSON)(json["usage"])
  };
}
function QueryResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "results": value.results === void 0 ? void 0 : value.results.map(SingleQueryResults_1.SingleQueryResultsToJSON),
    "matches": value.matches === void 0 ? void 0 : value.matches.map(ScoredVector_1.ScoredVectorToJSON),
    "namespace": value.namespace,
    "usage": (0, Usage_1.UsageToJSON)(value.usage)
  };
}
var RpcStatus = {};
Object.defineProperty(RpcStatus, "__esModule", { value: true });
RpcStatus.instanceOfRpcStatus = instanceOfRpcStatus;
RpcStatus.RpcStatusFromJSON = RpcStatusFromJSON;
RpcStatus.RpcStatusFromJSONTyped = RpcStatusFromJSONTyped;
RpcStatus.RpcStatusToJSON = RpcStatusToJSON;
const runtime_1$G = runtime$7;
const ProtobufAny_1 = ProtobufAny;
function instanceOfRpcStatus(value) {
  let isInstance = true;
  return isInstance;
}
function RpcStatusFromJSON(json) {
  return RpcStatusFromJSONTyped(json);
}
function RpcStatusFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "code": !(0, runtime_1$G.exists)(json, "code") ? void 0 : json["code"],
    "message": !(0, runtime_1$G.exists)(json, "message") ? void 0 : json["message"],
    "details": !(0, runtime_1$G.exists)(json, "details") ? void 0 : json["details"].map(ProtobufAny_1.ProtobufAnyFromJSON)
  };
}
function RpcStatusToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "code": value.code,
    "message": value.message,
    "details": value.details === void 0 ? void 0 : value.details.map(ProtobufAny_1.ProtobufAnyToJSON)
  };
}
var SearchMatchTerms = {};
Object.defineProperty(SearchMatchTerms, "__esModule", { value: true });
SearchMatchTerms.instanceOfSearchMatchTerms = instanceOfSearchMatchTerms;
SearchMatchTerms.SearchMatchTermsFromJSON = SearchMatchTermsFromJSON;
SearchMatchTerms.SearchMatchTermsFromJSONTyped = SearchMatchTermsFromJSONTyped;
SearchMatchTerms.SearchMatchTermsToJSON = SearchMatchTermsToJSON;
const runtime_1$F = runtime$7;
function instanceOfSearchMatchTerms(value) {
  let isInstance = true;
  return isInstance;
}
function SearchMatchTermsFromJSON(json) {
  return SearchMatchTermsFromJSONTyped(json);
}
function SearchMatchTermsFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "strategy": !(0, runtime_1$F.exists)(json, "strategy") ? void 0 : json["strategy"],
    "terms": !(0, runtime_1$F.exists)(json, "terms") ? void 0 : json["terms"]
  };
}
function SearchMatchTermsToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "strategy": value.strategy,
    "terms": value.terms
  };
}
var SearchRecordsRequest = {};
var SearchRecordsRequestQuery = {};
var SearchRecordsVector = {};
Object.defineProperty(SearchRecordsVector, "__esModule", { value: true });
SearchRecordsVector.instanceOfSearchRecordsVector = instanceOfSearchRecordsVector;
SearchRecordsVector.SearchRecordsVectorFromJSON = SearchRecordsVectorFromJSON;
SearchRecordsVector.SearchRecordsVectorFromJSONTyped = SearchRecordsVectorFromJSONTyped;
SearchRecordsVector.SearchRecordsVectorToJSON = SearchRecordsVectorToJSON;
const runtime_1$E = runtime$7;
function instanceOfSearchRecordsVector(value) {
  let isInstance = true;
  return isInstance;
}
function SearchRecordsVectorFromJSON(json) {
  return SearchRecordsVectorFromJSONTyped(json);
}
function SearchRecordsVectorFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "values": !(0, runtime_1$E.exists)(json, "values") ? void 0 : json["values"],
    "sparseValues": !(0, runtime_1$E.exists)(json, "sparse_values") ? void 0 : json["sparse_values"],
    "sparseIndices": !(0, runtime_1$E.exists)(json, "sparse_indices") ? void 0 : json["sparse_indices"]
  };
}
function SearchRecordsVectorToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "values": value.values,
    "sparse_values": value.sparseValues,
    "sparse_indices": value.sparseIndices
  };
}
Object.defineProperty(SearchRecordsRequestQuery, "__esModule", { value: true });
SearchRecordsRequestQuery.instanceOfSearchRecordsRequestQuery = instanceOfSearchRecordsRequestQuery;
SearchRecordsRequestQuery.SearchRecordsRequestQueryFromJSON = SearchRecordsRequestQueryFromJSON;
SearchRecordsRequestQuery.SearchRecordsRequestQueryFromJSONTyped = SearchRecordsRequestQueryFromJSONTyped;
SearchRecordsRequestQuery.SearchRecordsRequestQueryToJSON = SearchRecordsRequestQueryToJSON;
const runtime_1$D = runtime$7;
const SearchMatchTerms_1 = SearchMatchTerms;
const SearchRecordsVector_1 = SearchRecordsVector;
function instanceOfSearchRecordsRequestQuery(value) {
  let isInstance = true;
  isInstance = isInstance && "topK" in value;
  return isInstance;
}
function SearchRecordsRequestQueryFromJSON(json) {
  return SearchRecordsRequestQueryFromJSONTyped(json);
}
function SearchRecordsRequestQueryFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "topK": json["top_k"],
    "filter": !(0, runtime_1$D.exists)(json, "filter") ? void 0 : json["filter"],
    "inputs": !(0, runtime_1$D.exists)(json, "inputs") ? void 0 : json["inputs"],
    "vector": !(0, runtime_1$D.exists)(json, "vector") ? void 0 : (0, SearchRecordsVector_1.SearchRecordsVectorFromJSON)(json["vector"]),
    "id": !(0, runtime_1$D.exists)(json, "id") ? void 0 : json["id"],
    "matchTerms": !(0, runtime_1$D.exists)(json, "match_terms") ? void 0 : (0, SearchMatchTerms_1.SearchMatchTermsFromJSON)(json["match_terms"])
  };
}
function SearchRecordsRequestQueryToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "top_k": value.topK,
    "filter": value.filter,
    "inputs": value.inputs,
    "vector": (0, SearchRecordsVector_1.SearchRecordsVectorToJSON)(value.vector),
    "id": value.id,
    "match_terms": (0, SearchMatchTerms_1.SearchMatchTermsToJSON)(value.matchTerms)
  };
}
var SearchRecordsRequestRerank = {};
Object.defineProperty(SearchRecordsRequestRerank, "__esModule", { value: true });
SearchRecordsRequestRerank.instanceOfSearchRecordsRequestRerank = instanceOfSearchRecordsRequestRerank;
SearchRecordsRequestRerank.SearchRecordsRequestRerankFromJSON = SearchRecordsRequestRerankFromJSON;
SearchRecordsRequestRerank.SearchRecordsRequestRerankFromJSONTyped = SearchRecordsRequestRerankFromJSONTyped;
SearchRecordsRequestRerank.SearchRecordsRequestRerankToJSON = SearchRecordsRequestRerankToJSON;
const runtime_1$C = runtime$7;
function instanceOfSearchRecordsRequestRerank(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  isInstance = isInstance && "rankFields" in value;
  return isInstance;
}
function SearchRecordsRequestRerankFromJSON(json) {
  return SearchRecordsRequestRerankFromJSONTyped(json);
}
function SearchRecordsRequestRerankFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "rankFields": json["rank_fields"],
    "topN": !(0, runtime_1$C.exists)(json, "top_n") ? void 0 : json["top_n"],
    "parameters": !(0, runtime_1$C.exists)(json, "parameters") ? void 0 : json["parameters"],
    "query": !(0, runtime_1$C.exists)(json, "query") ? void 0 : json["query"]
  };
}
function SearchRecordsRequestRerankToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "rank_fields": value.rankFields,
    "top_n": value.topN,
    "parameters": value.parameters,
    "query": value.query
  };
}
Object.defineProperty(SearchRecordsRequest, "__esModule", { value: true });
SearchRecordsRequest.instanceOfSearchRecordsRequest = instanceOfSearchRecordsRequest;
SearchRecordsRequest.SearchRecordsRequestFromJSON = SearchRecordsRequestFromJSON;
SearchRecordsRequest.SearchRecordsRequestFromJSONTyped = SearchRecordsRequestFromJSONTyped;
SearchRecordsRequest.SearchRecordsRequestToJSON = SearchRecordsRequestToJSON;
const runtime_1$B = runtime$7;
const SearchRecordsRequestQuery_1 = SearchRecordsRequestQuery;
const SearchRecordsRequestRerank_1 = SearchRecordsRequestRerank;
function instanceOfSearchRecordsRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "query" in value;
  return isInstance;
}
function SearchRecordsRequestFromJSON(json) {
  return SearchRecordsRequestFromJSONTyped(json);
}
function SearchRecordsRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "query": (0, SearchRecordsRequestQuery_1.SearchRecordsRequestQueryFromJSON)(json["query"]),
    "fields": !(0, runtime_1$B.exists)(json, "fields") ? void 0 : json["fields"],
    "rerank": !(0, runtime_1$B.exists)(json, "rerank") ? void 0 : (0, SearchRecordsRequestRerank_1.SearchRecordsRequestRerankFromJSON)(json["rerank"])
  };
}
function SearchRecordsRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "query": (0, SearchRecordsRequestQuery_1.SearchRecordsRequestQueryToJSON)(value.query),
    "fields": value.fields,
    "rerank": (0, SearchRecordsRequestRerank_1.SearchRecordsRequestRerankToJSON)(value.rerank)
  };
}
var SearchRecordsResponse = {};
var SearchRecordsResponseResult = {};
Object.defineProperty(SearchRecordsResponseResult, "__esModule", { value: true });
SearchRecordsResponseResult.instanceOfSearchRecordsResponseResult = instanceOfSearchRecordsResponseResult;
SearchRecordsResponseResult.SearchRecordsResponseResultFromJSON = SearchRecordsResponseResultFromJSON;
SearchRecordsResponseResult.SearchRecordsResponseResultFromJSONTyped = SearchRecordsResponseResultFromJSONTyped;
SearchRecordsResponseResult.SearchRecordsResponseResultToJSON = SearchRecordsResponseResultToJSON;
const Hit_1 = Hit;
function instanceOfSearchRecordsResponseResult(value) {
  let isInstance = true;
  isInstance = isInstance && "hits" in value;
  return isInstance;
}
function SearchRecordsResponseResultFromJSON(json) {
  return SearchRecordsResponseResultFromJSONTyped(json);
}
function SearchRecordsResponseResultFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "hits": json["hits"].map(Hit_1.HitFromJSON)
  };
}
function SearchRecordsResponseResultToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "hits": value.hits.map(Hit_1.HitToJSON)
  };
}
var SearchUsage = {};
Object.defineProperty(SearchUsage, "__esModule", { value: true });
SearchUsage.instanceOfSearchUsage = instanceOfSearchUsage;
SearchUsage.SearchUsageFromJSON = SearchUsageFromJSON;
SearchUsage.SearchUsageFromJSONTyped = SearchUsageFromJSONTyped;
SearchUsage.SearchUsageToJSON = SearchUsageToJSON;
const runtime_1$A = runtime$7;
function instanceOfSearchUsage(value) {
  let isInstance = true;
  isInstance = isInstance && "readUnits" in value;
  return isInstance;
}
function SearchUsageFromJSON(json) {
  return SearchUsageFromJSONTyped(json);
}
function SearchUsageFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "readUnits": json["read_units"],
    "embedTotalTokens": !(0, runtime_1$A.exists)(json, "embed_total_tokens") ? void 0 : json["embed_total_tokens"],
    "rerankUnits": !(0, runtime_1$A.exists)(json, "rerank_units") ? void 0 : json["rerank_units"]
  };
}
function SearchUsageToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "read_units": value.readUnits,
    "embed_total_tokens": value.embedTotalTokens,
    "rerank_units": value.rerankUnits
  };
}
Object.defineProperty(SearchRecordsResponse, "__esModule", { value: true });
SearchRecordsResponse.instanceOfSearchRecordsResponse = instanceOfSearchRecordsResponse;
SearchRecordsResponse.SearchRecordsResponseFromJSON = SearchRecordsResponseFromJSON;
SearchRecordsResponse.SearchRecordsResponseFromJSONTyped = SearchRecordsResponseFromJSONTyped;
SearchRecordsResponse.SearchRecordsResponseToJSON = SearchRecordsResponseToJSON;
const SearchRecordsResponseResult_1 = SearchRecordsResponseResult;
const SearchUsage_1 = SearchUsage;
function instanceOfSearchRecordsResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "result" in value;
  isInstance = isInstance && "usage" in value;
  return isInstance;
}
function SearchRecordsResponseFromJSON(json) {
  return SearchRecordsResponseFromJSONTyped(json);
}
function SearchRecordsResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "result": (0, SearchRecordsResponseResult_1.SearchRecordsResponseResultFromJSON)(json["result"]),
    "usage": (0, SearchUsage_1.SearchUsageFromJSON)(json["usage"])
  };
}
function SearchRecordsResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "result": (0, SearchRecordsResponseResult_1.SearchRecordsResponseResultToJSON)(value.result),
    "usage": (0, SearchUsage_1.SearchUsageToJSON)(value.usage)
  };
}
var StartImportRequest = {};
Object.defineProperty(StartImportRequest, "__esModule", { value: true });
StartImportRequest.instanceOfStartImportRequest = instanceOfStartImportRequest;
StartImportRequest.StartImportRequestFromJSON = StartImportRequestFromJSON;
StartImportRequest.StartImportRequestFromJSONTyped = StartImportRequestFromJSONTyped;
StartImportRequest.StartImportRequestToJSON = StartImportRequestToJSON;
const runtime_1$z = runtime$7;
const ImportErrorMode_1 = ImportErrorMode;
function instanceOfStartImportRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "uri" in value;
  return isInstance;
}
function StartImportRequestFromJSON(json) {
  return StartImportRequestFromJSONTyped(json);
}
function StartImportRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "integrationId": !(0, runtime_1$z.exists)(json, "integrationId") ? void 0 : json["integrationId"],
    "uri": json["uri"],
    "errorMode": !(0, runtime_1$z.exists)(json, "errorMode") ? void 0 : (0, ImportErrorMode_1.ImportErrorModeFromJSON)(json["errorMode"])
  };
}
function StartImportRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "integrationId": value.integrationId,
    "uri": value.uri,
    "errorMode": (0, ImportErrorMode_1.ImportErrorModeToJSON)(value.errorMode)
  };
}
var StartImportResponse = {};
Object.defineProperty(StartImportResponse, "__esModule", { value: true });
StartImportResponse.instanceOfStartImportResponse = instanceOfStartImportResponse;
StartImportResponse.StartImportResponseFromJSON = StartImportResponseFromJSON;
StartImportResponse.StartImportResponseFromJSONTyped = StartImportResponseFromJSONTyped;
StartImportResponse.StartImportResponseToJSON = StartImportResponseToJSON;
const runtime_1$y = runtime$7;
function instanceOfStartImportResponse(value) {
  let isInstance = true;
  return isInstance;
}
function StartImportResponseFromJSON(json) {
  return StartImportResponseFromJSONTyped(json);
}
function StartImportResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1$y.exists)(json, "id") ? void 0 : json["id"]
  };
}
function StartImportResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id
  };
}
var UpdateRequest = {};
Object.defineProperty(UpdateRequest, "__esModule", { value: true });
UpdateRequest.instanceOfUpdateRequest = instanceOfUpdateRequest;
UpdateRequest.UpdateRequestFromJSON = UpdateRequestFromJSON;
UpdateRequest.UpdateRequestFromJSONTyped = UpdateRequestFromJSONTyped;
UpdateRequest.UpdateRequestToJSON = UpdateRequestToJSON;
const runtime_1$x = runtime$7;
const SparseValues_1 = SparseValues;
function instanceOfUpdateRequest(value) {
  let isInstance = true;
  return isInstance;
}
function UpdateRequestFromJSON(json) {
  return UpdateRequestFromJSONTyped(json);
}
function UpdateRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1$x.exists)(json, "id") ? void 0 : json["id"],
    "values": !(0, runtime_1$x.exists)(json, "values") ? void 0 : json["values"],
    "sparseValues": !(0, runtime_1$x.exists)(json, "sparseValues") ? void 0 : (0, SparseValues_1.SparseValuesFromJSON)(json["sparseValues"]),
    "setMetadata": !(0, runtime_1$x.exists)(json, "setMetadata") ? void 0 : json["setMetadata"],
    "namespace": !(0, runtime_1$x.exists)(json, "namespace") ? void 0 : json["namespace"],
    "filter": !(0, runtime_1$x.exists)(json, "filter") ? void 0 : json["filter"],
    "dryRun": !(0, runtime_1$x.exists)(json, "dryRun") ? void 0 : json["dryRun"]
  };
}
function UpdateRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "values": value.values,
    "sparseValues": (0, SparseValues_1.SparseValuesToJSON)(value.sparseValues),
    "setMetadata": value.setMetadata,
    "namespace": value.namespace,
    "filter": value.filter,
    "dryRun": value.dryRun
  };
}
var UpdateResponse = {};
Object.defineProperty(UpdateResponse, "__esModule", { value: true });
UpdateResponse.instanceOfUpdateResponse = instanceOfUpdateResponse;
UpdateResponse.UpdateResponseFromJSON = UpdateResponseFromJSON;
UpdateResponse.UpdateResponseFromJSONTyped = UpdateResponseFromJSONTyped;
UpdateResponse.UpdateResponseToJSON = UpdateResponseToJSON;
const runtime_1$w = runtime$7;
function instanceOfUpdateResponse(value) {
  let isInstance = true;
  return isInstance;
}
function UpdateResponseFromJSON(json) {
  return UpdateResponseFromJSONTyped(json);
}
function UpdateResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "matchedRecords": !(0, runtime_1$w.exists)(json, "matchedRecords") ? void 0 : json["matchedRecords"]
  };
}
function UpdateResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "matchedRecords": value.matchedRecords
  };
}
var UpsertRecord = {};
Object.defineProperty(UpsertRecord, "__esModule", { value: true });
UpsertRecord.instanceOfUpsertRecord = instanceOfUpsertRecord;
UpsertRecord.UpsertRecordFromJSON = UpsertRecordFromJSON;
UpsertRecord.UpsertRecordFromJSONTyped = UpsertRecordFromJSONTyped;
UpsertRecord.UpsertRecordToJSON = UpsertRecordToJSON;
function instanceOfUpsertRecord(value) {
  let isInstance = true;
  isInstance = isInstance && "id" in value;
  return isInstance;
}
function UpsertRecordFromJSON(json) {
  return UpsertRecordFromJSONTyped(json);
}
function UpsertRecordFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": json["_id"]
  };
}
function UpsertRecordToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "_id": value.id
  };
}
var UpsertRequest = {};
Object.defineProperty(UpsertRequest, "__esModule", { value: true });
UpsertRequest.instanceOfUpsertRequest = instanceOfUpsertRequest;
UpsertRequest.UpsertRequestFromJSON = UpsertRequestFromJSON;
UpsertRequest.UpsertRequestFromJSONTyped = UpsertRequestFromJSONTyped;
UpsertRequest.UpsertRequestToJSON = UpsertRequestToJSON;
const runtime_1$v = runtime$7;
const Vector_1 = Vector;
function instanceOfUpsertRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "vectors" in value;
  return isInstance;
}
function UpsertRequestFromJSON(json) {
  return UpsertRequestFromJSONTyped(json);
}
function UpsertRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "vectors": json["vectors"].map(Vector_1.VectorFromJSON),
    "namespace": !(0, runtime_1$v.exists)(json, "namespace") ? void 0 : json["namespace"]
  };
}
function UpsertRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "vectors": value.vectors.map(Vector_1.VectorToJSON),
    "namespace": value.namespace
  };
}
var UpsertResponse = {};
Object.defineProperty(UpsertResponse, "__esModule", { value: true });
UpsertResponse.instanceOfUpsertResponse = instanceOfUpsertResponse;
UpsertResponse.UpsertResponseFromJSON = UpsertResponseFromJSON;
UpsertResponse.UpsertResponseFromJSONTyped = UpsertResponseFromJSONTyped;
UpsertResponse.UpsertResponseToJSON = UpsertResponseToJSON;
const runtime_1$u = runtime$7;
function instanceOfUpsertResponse(value) {
  let isInstance = true;
  return isInstance;
}
function UpsertResponseFromJSON(json) {
  return UpsertResponseFromJSONTyped(json);
}
function UpsertResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "upsertedCount": !(0, runtime_1$u.exists)(json, "upsertedCount") ? void 0 : json["upsertedCount"]
  };
}
function UpsertResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "upsertedCount": value.upsertedCount
  };
}
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(CreateNamespaceRequest, exports);
  __exportStar(CreateNamespaceRequestSchema, exports);
  __exportStar(CreateNamespaceRequestSchemaFieldsValue, exports);
  __exportStar(DeleteRequest, exports);
  __exportStar(DescribeIndexStatsRequest, exports);
  __exportStar(FetchByMetadataRequest, exports);
  __exportStar(FetchByMetadataResponse, exports);
  __exportStar(FetchResponse, exports);
  __exportStar(Hit, exports);
  __exportStar(ImportErrorMode, exports);
  __exportStar(ImportModel, exports);
  __exportStar(IndexDescription, exports);
  __exportStar(ListImportsResponse, exports);
  __exportStar(ListItem, exports);
  __exportStar(ListNamespacesResponse, exports);
  __exportStar(ListResponse, exports);
  __exportStar(NamespaceDescription, exports);
  __exportStar(NamespaceDescriptionIndexedFields, exports);
  __exportStar(NamespaceSummary, exports);
  __exportStar(Pagination, exports);
  __exportStar(ProtobufAny, exports);
  __exportStar(QueryRequest, exports);
  __exportStar(QueryResponse, exports);
  __exportStar(QueryVector, exports);
  __exportStar(RpcStatus, exports);
  __exportStar(ScoredVector, exports);
  __exportStar(SearchMatchTerms, exports);
  __exportStar(SearchRecordsRequest, exports);
  __exportStar(SearchRecordsRequestQuery, exports);
  __exportStar(SearchRecordsRequestRerank, exports);
  __exportStar(SearchRecordsResponse, exports);
  __exportStar(SearchRecordsResponseResult, exports);
  __exportStar(SearchRecordsVector, exports);
  __exportStar(SearchUsage, exports);
  __exportStar(SingleQueryResults, exports);
  __exportStar(SparseValues, exports);
  __exportStar(StartImportRequest, exports);
  __exportStar(StartImportResponse, exports);
  __exportStar(UpdateRequest, exports);
  __exportStar(UpdateResponse, exports);
  __exportStar(UpsertRecord, exports);
  __exportStar(UpsertRequest, exports);
  __exportStar(UpsertResponse, exports);
  __exportStar(Usage2, exports);
  __exportStar(Vector, exports);
})(models$2);
var __createBinding$4 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$4 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$4 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$4(result, mod, k);
  }
  __setModuleDefault$4(result, mod);
  return result;
};
Object.defineProperty(BulkOperationsApi$1, "__esModule", { value: true });
BulkOperationsApi$1.BulkOperationsApi = void 0;
const runtime$6 = __importStar$4(runtime$7);
const index_1$4 = models$2;
class BulkOperationsApi extends runtime$6.BaseAPI {
  /**
   * Cancel an import operation if it is not yet finished. It has no effect if the operation is already finished.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * Cancel an import
   */
  async cancelBulkImportRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$6.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling cancelBulkImport.");
    }
    if (requestParameters.id === null || requestParameters.id === void 0) {
      throw new runtime$6.RequiredError("id", "Required parameter requestParameters.id was null or undefined when calling cancelBulkImport.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/bulk/imports/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters.id))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$6.JSONApiResponse(response);
  }
  /**
   * Cancel an import operation if it is not yet finished. It has no effect if the operation is already finished.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * Cancel an import
   */
  async cancelBulkImport(requestParameters, initOverrides) {
    const response = await this.cancelBulkImportRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Return details of a specific import operation.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * Describe an import
   */
  async describeBulkImportRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$6.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeBulkImport.");
    }
    if (requestParameters.id === null || requestParameters.id === void 0) {
      throw new runtime$6.RequiredError("id", "Required parameter requestParameters.id was null or undefined when calling describeBulkImport.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/bulk/imports/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters.id))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$6.JSONApiResponse(response, (jsonValue) => (0, index_1$4.ImportModelFromJSON)(jsonValue));
  }
  /**
   * Return details of a specific import operation.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * Describe an import
   */
  async describeBulkImport(requestParameters, initOverrides) {
    const response = await this.describeBulkImportRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all recent and ongoing import operations.  By default, `list_imports` returns up to 100 imports per page. If the `limit` parameter is set, `list` returns up to that number of imports instead. Whenever there are additional IDs to return, the response also includes a `pagination_token` that you can use to get the next batch of imports. When the response does not include a `pagination_token`, there are no more imports to return.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * List imports
   */
  async listBulkImportsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$6.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listBulkImports.");
    }
    const queryParameters = {};
    if (requestParameters.limit !== void 0) {
      queryParameters["limit"] = requestParameters.limit;
    }
    if (requestParameters.paginationToken !== void 0) {
      queryParameters["paginationToken"] = requestParameters.paginationToken;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/bulk/imports`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$6.JSONApiResponse(response, (jsonValue) => (0, index_1$4.ListImportsResponseFromJSON)(jsonValue));
  }
  /**
   * List all recent and ongoing import operations.  By default, `list_imports` returns up to 100 imports per page. If the `limit` parameter is set, `list` returns up to that number of imports instead. Whenever there are additional IDs to return, the response also includes a `pagination_token` that you can use to get the next batch of imports. When the response does not include a `pagination_token`, there are no more imports to return.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * List imports
   */
  async listBulkImports(requestParameters, initOverrides) {
    const response = await this.listBulkImportsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Start an asynchronous import of vectors from object storage into an index.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * Start import
   */
  async startBulkImportRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$6.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling startBulkImport.");
    }
    if (requestParameters.startImportRequest === null || requestParameters.startImportRequest === void 0) {
      throw new runtime$6.RequiredError("startImportRequest", "Required parameter requestParameters.startImportRequest was null or undefined when calling startBulkImport.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/bulk/imports`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$4.StartImportRequestToJSON)(requestParameters.startImportRequest)
    }, initOverrides);
    return new runtime$6.JSONApiResponse(response, (jsonValue) => (0, index_1$4.StartImportResponseFromJSON)(jsonValue));
  }
  /**
   * Start an asynchronous import of vectors from object storage into an index.  For guidance and examples, see [Import data](https://docs.pinecone.io/guides/index-data/import-data).
   * Start import
   */
  async startBulkImport(requestParameters, initOverrides) {
    const response = await this.startBulkImportRaw(requestParameters, initOverrides);
    return await response.value();
  }
}
BulkOperationsApi$1.BulkOperationsApi = BulkOperationsApi;
var NamespaceOperationsApi$1 = {};
var __createBinding$3 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$3 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$3 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$3(result, mod, k);
  }
  __setModuleDefault$3(result, mod);
  return result;
};
Object.defineProperty(NamespaceOperationsApi$1, "__esModule", { value: true });
NamespaceOperationsApi$1.NamespaceOperationsApi = void 0;
const runtime$5 = __importStar$3(runtime$7);
const index_1$3 = models$2;
class NamespaceOperationsApi extends runtime$5.BaseAPI {
  /**
   * Create a namespace in a serverless index.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * Create a namespace
   */
  async createNamespaceRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$5.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling createNamespace.");
    }
    if (requestParameters.createNamespaceRequest === null || requestParameters.createNamespaceRequest === void 0) {
      throw new runtime$5.RequiredError("createNamespaceRequest", "Required parameter requestParameters.createNamespaceRequest was null or undefined when calling createNamespace.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/namespaces`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$3.CreateNamespaceRequestToJSON)(requestParameters.createNamespaceRequest)
    }, initOverrides);
    return new runtime$5.JSONApiResponse(response, (jsonValue) => (0, index_1$3.NamespaceDescriptionFromJSON)(jsonValue));
  }
  /**
   * Create a namespace in a serverless index.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * Create a namespace
   */
  async createNamespace(requestParameters, initOverrides) {
    const response = await this.createNamespaceRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Delete a namespace from a serverless index. Deleting a namespace is irreversible; all data in the namespace is permanently deleted.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * Delete a namespace
   */
  async deleteNamespaceRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$5.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling deleteNamespace.");
    }
    if (requestParameters.namespace === null || requestParameters.namespace === void 0) {
      throw new runtime$5.RequiredError("namespace", "Required parameter requestParameters.namespace was null or undefined when calling deleteNamespace.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/namespaces/{namespace}`.replace(`{${"namespace"}}`, encodeURIComponent(String(requestParameters.namespace))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$5.JSONApiResponse(response);
  }
  /**
   * Delete a namespace from a serverless index. Deleting a namespace is irreversible; all data in the namespace is permanently deleted.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * Delete a namespace
   */
  async deleteNamespace(requestParameters, initOverrides) {
    const response = await this.deleteNamespaceRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Describe a namespace in a serverless index, including the total number of vectors in the namespace.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * Describe a namespace
   */
  async describeNamespaceRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$5.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeNamespace.");
    }
    if (requestParameters.namespace === null || requestParameters.namespace === void 0) {
      throw new runtime$5.RequiredError("namespace", "Required parameter requestParameters.namespace was null or undefined when calling describeNamespace.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/namespaces/{namespace}`.replace(`{${"namespace"}}`, encodeURIComponent(String(requestParameters.namespace))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$5.JSONApiResponse(response, (jsonValue) => (0, index_1$3.NamespaceDescriptionFromJSON)(jsonValue));
  }
  /**
   * Describe a namespace in a serverless index, including the total number of vectors in the namespace.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * Describe a namespace
   */
  async describeNamespace(requestParameters, initOverrides) {
    const response = await this.describeNamespaceRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all namespaces in a serverless index.  Up to 100 namespaces are returned at a time by default, in sorted order (bitwise “C” collation). If the `limit` parameter is set, up to that number of namespaces are returned instead. Whenever there are additional namespaces to return, the response also includes a `pagination_token` that you can use to get the next batch of namespaces. When the response does not include a `pagination_token`, there are no more namespaces to return.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * List namespaces
   */
  async listNamespacesOperationRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$5.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listNamespacesOperation.");
    }
    const queryParameters = {};
    if (requestParameters.limit !== void 0) {
      queryParameters["limit"] = requestParameters.limit;
    }
    if (requestParameters.paginationToken !== void 0) {
      queryParameters["paginationToken"] = requestParameters.paginationToken;
    }
    if (requestParameters.prefix !== void 0) {
      queryParameters["prefix"] = requestParameters.prefix;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/namespaces`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$5.JSONApiResponse(response, (jsonValue) => (0, index_1$3.ListNamespacesResponseFromJSON)(jsonValue));
  }
  /**
   * List all namespaces in a serverless index.  Up to 100 namespaces are returned at a time by default, in sorted order (bitwise “C” collation). If the `limit` parameter is set, up to that number of namespaces are returned instead. Whenever there are additional namespaces to return, the response also includes a `pagination_token` that you can use to get the next batch of namespaces. When the response does not include a `pagination_token`, there are no more namespaces to return.  For guidance and examples, see [Manage namespaces](https://docs.pinecone.io/guides/manage-data/manage-namespaces).  **Note:** This operation is not supported for pod-based indexes.
   * List namespaces
   */
  async listNamespacesOperation(requestParameters, initOverrides) {
    const response = await this.listNamespacesOperationRaw(requestParameters, initOverrides);
    return await response.value();
  }
}
NamespaceOperationsApi$1.NamespaceOperationsApi = NamespaceOperationsApi;
var VectorOperationsApi$1 = {};
var __createBinding$2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$2 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$2 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$2(result, mod, k);
  }
  __setModuleDefault$2(result, mod);
  return result;
};
Object.defineProperty(VectorOperationsApi$1, "__esModule", { value: true });
VectorOperationsApi$1.VectorOperationsApi = void 0;
const runtime$4 = __importStar$2(runtime$7);
const index_1$2 = models$2;
class VectorOperationsApi extends runtime$4.BaseAPI {
  /**
   * Delete vectors by id from a single namespace.  For guidance and examples, see [Delete data](https://docs.pinecone.io/guides/manage-data/delete-data).
   * Delete vectors
   */
  async deleteVectorsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling deleteVectors.");
    }
    if (requestParameters.deleteRequest === null || requestParameters.deleteRequest === void 0) {
      throw new runtime$4.RequiredError("deleteRequest", "Required parameter requestParameters.deleteRequest was null or undefined when calling deleteVectors.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/vectors/delete`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$2.DeleteRequestToJSON)(requestParameters.deleteRequest)
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response);
  }
  /**
   * Delete vectors by id from a single namespace.  For guidance and examples, see [Delete data](https://docs.pinecone.io/guides/manage-data/delete-data).
   * Delete vectors
   */
  async deleteVectors(requestParameters, initOverrides) {
    const response = await this.deleteVectorsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Return statistics about the contents of an index, including the vector count per namespace, the number of dimensions, and the index fullness.  Serverless indexes scale automatically as needed, so index fullness is relevant only for pod-based indexes.
   * Get index stats
   */
  async describeIndexStatsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeIndexStats.");
    }
    if (requestParameters.describeIndexStatsRequest === null || requestParameters.describeIndexStatsRequest === void 0) {
      throw new runtime$4.RequiredError("describeIndexStatsRequest", "Required parameter requestParameters.describeIndexStatsRequest was null or undefined when calling describeIndexStats.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/describe_index_stats`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$2.DescribeIndexStatsRequestToJSON)(requestParameters.describeIndexStatsRequest)
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.IndexDescriptionFromJSON)(jsonValue));
  }
  /**
   * Return statistics about the contents of an index, including the vector count per namespace, the number of dimensions, and the index fullness.  Serverless indexes scale automatically as needed, so index fullness is relevant only for pod-based indexes.
   * Get index stats
   */
  async describeIndexStats(requestParameters, initOverrides) {
    const response = await this.describeIndexStatsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Look up and return vectors by ID from a single namespace. The returned vectors include the vector data and/or metadata.  For on-demand indexes, since vector values are retrieved from object storage, fetch operations may have increased latency. If you only need metadata or IDs, consider using the query operation with `includeValues` set to `false` instead.  For guidance and examples, see [Fetch data](https://docs.pinecone.io/guides/manage-data/fetch-data).
   * Fetch vectors
   */
  async fetchVectorsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling fetchVectors.");
    }
    if (requestParameters.ids === null || requestParameters.ids === void 0) {
      throw new runtime$4.RequiredError("ids", "Required parameter requestParameters.ids was null or undefined when calling fetchVectors.");
    }
    const queryParameters = {};
    if (requestParameters.ids) {
      queryParameters["ids"] = requestParameters.ids;
    }
    if (requestParameters.namespace !== void 0) {
      queryParameters["namespace"] = requestParameters.namespace;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/vectors/fetch`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.FetchResponseFromJSON)(jsonValue));
  }
  /**
   * Look up and return vectors by ID from a single namespace. The returned vectors include the vector data and/or metadata.  For on-demand indexes, since vector values are retrieved from object storage, fetch operations may have increased latency. If you only need metadata or IDs, consider using the query operation with `includeValues` set to `false` instead.  For guidance and examples, see [Fetch data](https://docs.pinecone.io/guides/manage-data/fetch-data).
   * Fetch vectors
   */
  async fetchVectors(requestParameters, initOverrides) {
    const response = await this.fetchVectorsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Look up and return vectors by metadata filter from a single namespace. The returned vectors include the vector data and/or metadata. For guidance and examples, see [Fetch data](https://docs.pinecone.io/guides/manage-data/fetch-data).
   * Fetch vectors by metadata
   */
  async fetchVectorsByMetadataRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling fetchVectorsByMetadata.");
    }
    if (requestParameters.fetchByMetadataRequest === null || requestParameters.fetchByMetadataRequest === void 0) {
      throw new runtime$4.RequiredError("fetchByMetadataRequest", "Required parameter requestParameters.fetchByMetadataRequest was null or undefined when calling fetchVectorsByMetadata.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/vectors/fetch_by_metadata`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$2.FetchByMetadataRequestToJSON)(requestParameters.fetchByMetadataRequest)
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.FetchByMetadataResponseFromJSON)(jsonValue));
  }
  /**
   * Look up and return vectors by metadata filter from a single namespace. The returned vectors include the vector data and/or metadata. For guidance and examples, see [Fetch data](https://docs.pinecone.io/guides/manage-data/fetch-data).
   * Fetch vectors by metadata
   */
  async fetchVectorsByMetadata(requestParameters, initOverrides) {
    const response = await this.fetchVectorsByMetadataRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List the IDs of vectors in a single namespace of a serverless index. An optional prefix can be passed to limit the results to IDs with a common prefix.  Returns up to 100 IDs at a time by default in sorted order (bitwise \"C\" collation). If the `limit` parameter is set, `list` returns up to that number of IDs instead. Whenever there are additional IDs to return, the response also includes a `pagination_token` that you can use to get the next batch of IDs. When the response does not include a `pagination_token`, there are no more IDs to return.  For guidance and examples, see [List record IDs](https://docs.pinecone.io/guides/manage-data/list-record-ids).  **Note:** `list` is supported only for serverless indexes.
   * List vector IDs
   */
  async listVectorsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listVectors.");
    }
    const queryParameters = {};
    if (requestParameters.prefix !== void 0) {
      queryParameters["prefix"] = requestParameters.prefix;
    }
    if (requestParameters.limit !== void 0) {
      queryParameters["limit"] = requestParameters.limit;
    }
    if (requestParameters.paginationToken !== void 0) {
      queryParameters["paginationToken"] = requestParameters.paginationToken;
    }
    if (requestParameters.namespace !== void 0) {
      queryParameters["namespace"] = requestParameters.namespace;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/vectors/list`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.ListResponseFromJSON)(jsonValue));
  }
  /**
   * List the IDs of vectors in a single namespace of a serverless index. An optional prefix can be passed to limit the results to IDs with a common prefix.  Returns up to 100 IDs at a time by default in sorted order (bitwise \"C\" collation). If the `limit` parameter is set, `list` returns up to that number of IDs instead. Whenever there are additional IDs to return, the response also includes a `pagination_token` that you can use to get the next batch of IDs. When the response does not include a `pagination_token`, there are no more IDs to return.  For guidance and examples, see [List record IDs](https://docs.pinecone.io/guides/manage-data/list-record-ids).  **Note:** `list` is supported only for serverless indexes.
   * List vector IDs
   */
  async listVectors(requestParameters, initOverrides) {
    const response = await this.listVectorsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Search a namespace using a query vector. It retrieves the ids of the most similar items in a namespace, along with their similarity scores.  For guidance, examples, and limits, see [Search](https://docs.pinecone.io/guides/search/search-overview).
   * Search with a vector
   */
  async queryVectorsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling queryVectors.");
    }
    if (requestParameters.queryRequest === null || requestParameters.queryRequest === void 0) {
      throw new runtime$4.RequiredError("queryRequest", "Required parameter requestParameters.queryRequest was null or undefined when calling queryVectors.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/query`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$2.QueryRequestToJSON)(requestParameters.queryRequest)
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.QueryResponseFromJSON)(jsonValue));
  }
  /**
   * Search a namespace using a query vector. It retrieves the ids of the most similar items in a namespace, along with their similarity scores.  For guidance, examples, and limits, see [Search](https://docs.pinecone.io/guides/search/search-overview).
   * Search with a vector
   */
  async queryVectors(requestParameters, initOverrides) {
    const response = await this.queryVectorsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Search a namespace with a query text, query vector, or record ID and return the most similar records, along with their similarity scores. Optionally, rerank the initial results based on their relevance to the query.   Searching with text is supported only for indexes with [integrated embedding](https://docs.pinecone.io/guides/index-data/indexing-overview#vector-embedding). Searching with a query vector or record ID is supported for all indexes.   For guidance and examples, see [Search](https://docs.pinecone.io/guides/search/search-overview).
   * Search with text
   */
  async searchRecordsNamespaceRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling searchRecordsNamespace.");
    }
    if (requestParameters.namespace === null || requestParameters.namespace === void 0) {
      throw new runtime$4.RequiredError("namespace", "Required parameter requestParameters.namespace was null or undefined when calling searchRecordsNamespace.");
    }
    if (requestParameters.searchRecordsRequest === null || requestParameters.searchRecordsRequest === void 0) {
      throw new runtime$4.RequiredError("searchRecordsRequest", "Required parameter requestParameters.searchRecordsRequest was null or undefined when calling searchRecordsNamespace.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/records/namespaces/{namespace}/search`.replace(`{${"namespace"}}`, encodeURIComponent(String(requestParameters.namespace))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$2.SearchRecordsRequestToJSON)(requestParameters.searchRecordsRequest)
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.SearchRecordsResponseFromJSON)(jsonValue));
  }
  /**
   * Search a namespace with a query text, query vector, or record ID and return the most similar records, along with their similarity scores. Optionally, rerank the initial results based on their relevance to the query.   Searching with text is supported only for indexes with [integrated embedding](https://docs.pinecone.io/guides/index-data/indexing-overview#vector-embedding). Searching with a query vector or record ID is supported for all indexes.   For guidance and examples, see [Search](https://docs.pinecone.io/guides/search/search-overview).
   * Search with text
   */
  async searchRecordsNamespace(requestParameters, initOverrides) {
    const response = await this.searchRecordsNamespaceRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Update a vector in a namespace. If a value is included, it will overwrite the previous value. If a `set_metadata` is included, the values of the fields specified in it will be added or overwrite the previous value.  For guidance and examples, see [Update data](https://docs.pinecone.io/guides/manage-data/update-data).
   * Update a vector
   */
  async updateVectorRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling updateVector.");
    }
    if (requestParameters.updateRequest === null || requestParameters.updateRequest === void 0) {
      throw new runtime$4.RequiredError("updateRequest", "Required parameter requestParameters.updateRequest was null or undefined when calling updateVector.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/vectors/update`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$2.UpdateRequestToJSON)(requestParameters.updateRequest)
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.UpdateResponseFromJSON)(jsonValue));
  }
  /**
   * Update a vector in a namespace. If a value is included, it will overwrite the previous value. If a `set_metadata` is included, the values of the fields specified in it will be added or overwrite the previous value.  For guidance and examples, see [Update data](https://docs.pinecone.io/guides/manage-data/update-data).
   * Update a vector
   */
  async updateVector(requestParameters, initOverrides) {
    const response = await this.updateVectorRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Upsert text into a namespace. Pinecone converts the text to vectors automatically using the hosted embedding model associated with the index.  Upserting text is supported only for [indexes with integrated embedding](https://docs.pinecone.io/reference/api/2025-01/control-plane/create_for_model).  For guidance, examples, and limits, see [Upsert data](https://docs.pinecone.io/guides/index-data/upsert-data).
   * Upsert text
   */
  async upsertRecordsNamespaceRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling upsertRecordsNamespace.");
    }
    if (requestParameters.namespace === null || requestParameters.namespace === void 0) {
      throw new runtime$4.RequiredError("namespace", "Required parameter requestParameters.namespace was null or undefined when calling upsertRecordsNamespace.");
    }
    if (requestParameters.upsertRecord === null || requestParameters.upsertRecord === void 0) {
      throw new runtime$4.RequiredError("upsertRecord", "Required parameter requestParameters.upsertRecord was null or undefined when calling upsertRecordsNamespace.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/x-ndjson";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/records/namespaces/{namespace}/upsert`.replace(`{${"namespace"}}`, encodeURIComponent(String(requestParameters.namespace))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters.upsertRecord.map(index_1$2.UpsertRecordToJSON)
    }, initOverrides);
    return new runtime$4.VoidApiResponse(response);
  }
  /**
   * Upsert text into a namespace. Pinecone converts the text to vectors automatically using the hosted embedding model associated with the index.  Upserting text is supported only for [indexes with integrated embedding](https://docs.pinecone.io/reference/api/2025-01/control-plane/create_for_model).  For guidance, examples, and limits, see [Upsert data](https://docs.pinecone.io/guides/index-data/upsert-data).
   * Upsert text
   */
  async upsertRecordsNamespace(requestParameters, initOverrides) {
    await this.upsertRecordsNamespaceRaw(requestParameters, initOverrides);
  }
  /**
   * Upsert vectors into a namespace. If a new value is upserted for an existing vector ID, it will overwrite the previous value.  For guidance, examples, and limits, see [Upsert data](https://docs.pinecone.io/guides/index-data/upsert-data).
   * Upsert vectors
   */
  async upsertVectorsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$4.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling upsertVectors.");
    }
    if (requestParameters.upsertRequest === null || requestParameters.upsertRequest === void 0) {
      throw new runtime$4.RequiredError("upsertRequest", "Required parameter requestParameters.upsertRequest was null or undefined when calling upsertVectors.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/vectors/upsert`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$2.UpsertRequestToJSON)(requestParameters.upsertRequest)
    }, initOverrides);
    return new runtime$4.JSONApiResponse(response, (jsonValue) => (0, index_1$2.UpsertResponseFromJSON)(jsonValue));
  }
  /**
   * Upsert vectors into a namespace. If a new value is upserted for an existing vector ID, it will overwrite the previous value.  For guidance, examples, and limits, see [Upsert data](https://docs.pinecone.io/guides/index-data/upsert-data).
   * Upsert vectors
   */
  async upsertVectors(requestParameters, initOverrides) {
    const response = await this.upsertVectorsRaw(requestParameters, initOverrides);
    return await response.value();
  }
}
VectorOperationsApi$1.VectorOperationsApi = VectorOperationsApi;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(BulkOperationsApi$1, exports);
  __exportStar(NamespaceOperationsApi$1, exports);
  __exportStar(VectorOperationsApi$1, exports);
})(apis$2);
var api_version$2 = {};
Object.defineProperty(api_version$2, "__esModule", { value: true });
api_version$2.X_PINECONE_API_VERSION = void 0;
api_version$2.X_PINECONE_API_VERSION = "2025-10";
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(runtime$7, exports);
  __exportStar(apis$2, exports);
  __exportStar(models$2, exports);
  __exportStar(api_version$2, exports);
})(db_data);
Object.defineProperty(upsert, "__esModule", { value: true });
upsert.UpsertCommand = void 0;
const db_data_1$m = db_data;
const errors_1$p = errors;
class UpsertCommand {
  apiProvider;
  namespace;
  constructor(apiProvider, namespace) {
    this.apiProvider = apiProvider;
    this.namespace = namespace;
  }
  validator = (options) => {
    if (!options.records || options.records.length === 0) {
      throw new errors_1$p.PineconeArgumentError("Must pass in at least 1 record to upsert.");
    }
    options.records.forEach((record) => {
      if (!record.id) {
        throw new errors_1$p.PineconeArgumentError("Every record must include an `id` property in order to upsert.");
      }
      if (!record.values && !record.sparseValues) {
        throw new errors_1$p.PineconeArgumentError("Every record must include either `values` or `sparseValues` in order to upsert.");
      }
    });
  };
  async run(options) {
    this.validator(options);
    const namespace = options.namespace ?? this.namespace;
    const api = await this.apiProvider.provide();
    await api.upsertVectors({
      xPineconeApiVersion: db_data_1$m.X_PINECONE_API_VERSION,
      upsertRequest: {
        vectors: options.records,
        namespace
      }
    });
  }
}
upsert.UpsertCommand = UpsertCommand;
var fetch$1 = {};
Object.defineProperty(fetch$1, "__esModule", { value: true });
fetch$1.FetchCommand = void 0;
const db_data_1$l = db_data;
const errors_1$o = errors;
class FetchCommand {
  apiProvider;
  namespace;
  constructor(apiProvider, namespace) {
    this.apiProvider = apiProvider;
    this.namespace = namespace;
  }
  validator = (options) => {
    if (!options.ids || options.ids.length === 0) {
      throw new errors_1$o.PineconeArgumentError("Must pass in at least 1 recordID.");
    }
  };
  async run(options) {
    this.validator(options);
    const namespace = options.namespace ?? this.namespace;
    const api = await this.apiProvider.provide();
    const response = await api.fetchVectors({
      xPineconeApiVersion: db_data_1$l.X_PINECONE_API_VERSION,
      ids: options.ids,
      namespace
    });
    return {
      records: response.vectors ? response.vectors : {},
      namespace: response.namespace ? response.namespace : "",
      ...response.usage && { usage: response.usage }
    };
  }
}
fetch$1.FetchCommand = FetchCommand;
var fetchByMetadata = {};
Object.defineProperty(fetchByMetadata, "__esModule", { value: true });
fetchByMetadata.FetchByMetadataCommand = void 0;
const db_data_1$k = db_data;
const errors_1$n = errors;
class FetchByMetadataCommand {
  apiProvider;
  namespace;
  constructor(apiProvider, namespace) {
    this.apiProvider = apiProvider;
    this.namespace = namespace;
  }
  validator = (options) => {
    if (!options || !options.filter) {
      throw new errors_1$n.PineconeArgumentError("You must pass a non-empty object for the `filter` field in order to fetch by metadata.");
    }
  };
  async run(options) {
    this.validator(options);
    const namespace = options.namespace ?? this.namespace;
    const api = await this.apiProvider.provide();
    const request2 = {
      fetchByMetadataRequest: {
        namespace,
        filter: options.filter,
        limit: options.limit,
        paginationToken: options.paginationToken
      },
      xPineconeApiVersion: db_data_1$k.X_PINECONE_API_VERSION
    };
    const response = await api.fetchVectorsByMetadata(request2);
    return {
      records: response.vectors ? response.vectors : {},
      namespace: response.namespace ? response.namespace : "",
      ...response.usage && { usage: response.usage },
      pagination: response.pagination ? response.pagination : void 0
    };
  }
}
fetchByMetadata.FetchByMetadataCommand = FetchByMetadataCommand;
var update = {};
Object.defineProperty(update, "__esModule", { value: true });
update.UpdateCommand = void 0;
const db_data_1$j = db_data;
const errors_1$m = errors;
class UpdateCommand {
  apiProvider;
  namespace;
  constructor(apiProvider, namespace) {
    this.apiProvider = apiProvider;
    this.namespace = namespace;
  }
  validator = (options) => {
    if (options && !options.id && !options.filter) {
      throw new errors_1$m.PineconeArgumentError("You must pass a non-empty string for the `id` field or a `filter` object in order to update records.");
    }
    if (options && options.id && options.filter) {
      throw new errors_1$m.PineconeArgumentError("You cannot pass both an `id` and a `filter` object to update records. Use either `id` to update a single record, or `filter` to update multiple records.");
    }
  };
  async run(options) {
    this.validator(options);
    const namespace = options.namespace ?? this.namespace;
    const request2 = {
      id: options["id"],
      values: options["values"],
      sparseValues: options["sparseValues"],
      setMetadata: options["metadata"],
      filter: options["filter"],
      namespace
    };
    const api = await this.apiProvider.provide();
    await api.updateVector({
      xPineconeApiVersion: db_data_1$j.X_PINECONE_API_VERSION,
      updateRequest: request2
    });
    return;
  }
}
update.UpdateCommand = UpdateCommand;
var query = {};
Object.defineProperty(query, "__esModule", { value: true });
query.QueryCommand = void 0;
const db_data_1$i = db_data;
const errors_1$l = errors;
class QueryCommand {
  apiProvider;
  namespace;
  constructor(apiProvider, namespace) {
    this.apiProvider = apiProvider;
    this.namespace = namespace;
  }
  validator = (options) => {
    if (!options) {
      throw new errors_1$l.PineconeArgumentError("You must enter a query configuration object to query the index.");
    }
    if (options && !options.topK) {
      throw new errors_1$l.PineconeArgumentError("You must enter an integer for the `topK` search results to be returned.");
    }
    if (options && options.topK && options.topK < 1) {
      throw new errors_1$l.PineconeArgumentError("`topK` property must be greater than 0.");
    }
    if (options && options.filter) {
      const keys = Object.keys(options.filter);
      if (keys.length === 0) {
        throw new errors_1$l.PineconeArgumentError("You must enter a `filter` object with at least one key-value pair.");
      }
    }
    if ("id" in options) {
      if (!options.id) {
        throw new errors_1$l.PineconeArgumentError("You must enter non-empty string for `id` to query by record ID.");
      }
    }
    if ("vector" in options) {
      if (options.vector.length === 0) {
        throw new errors_1$l.PineconeArgumentError("You must enter an array of `RecordValues` in order to query by vector values.");
      }
    }
    if ("sparseVector" in options) {
      if (options.sparseVector?.indices.length === 0 || options.sparseVector?.values.length === 0) {
        throw new errors_1$l.PineconeArgumentError("You must enter a `RecordSparseValues` object with `indices` and `values` properties in order to query by sparse vector values.");
      }
    }
    if (options.scanFactor !== void 0) {
      if (options.scanFactor < 0.5 || options.scanFactor > 4) {
        throw new errors_1$l.PineconeArgumentError("`scanFactor` must be between 0.5 and 4 (inclusive).");
      }
    }
    if (options.maxCandidates !== void 0) {
      if (options.maxCandidates < options.topK) {
        throw new errors_1$l.PineconeArgumentError("`maxCandidates` must be greater than or equal to `topK`.");
      }
      if (options.maxCandidates > 1e5) {
        throw new errors_1$l.PineconeArgumentError("`maxCandidates` must be less than or equal to 100000.");
      }
    }
  };
  async run(query2) {
    this.validator(query2);
    const namespace = query2.namespace ?? this.namespace;
    const api = await this.apiProvider.provide();
    const results = await api.queryVectors({
      xPineconeApiVersion: db_data_1$i.X_PINECONE_API_VERSION,
      queryRequest: { ...query2, namespace }
    });
    const matches = results.matches ? results.matches : [];
    return {
      matches,
      namespace,
      ...results.usage && { usage: results.usage }
    };
  }
}
query.QueryCommand = QueryCommand;
var deleteOne$1 = {};
Object.defineProperty(deleteOne$1, "__esModule", { value: true });
deleteOne$1.deleteOne = void 0;
const db_data_1$h = db_data;
const errors_1$k = errors;
const deleteOne = (apiProvider, targetNamespace) => {
  const validator = (options) => {
    if (!options || !options.id) {
      throw new errors_1$k.PineconeArgumentError("You must pass a non-empty string for `id` in order to delete a record.");
    }
  };
  return async (options) => {
    validator(options);
    const namespace = options.namespace ?? targetNamespace;
    const api = await apiProvider.provide();
    await api.deleteVectors({
      xPineconeApiVersion: db_data_1$h.X_PINECONE_API_VERSION,
      deleteRequest: { ids: [options.id], namespace }
    });
    return;
  };
};
deleteOne$1.deleteOne = deleteOne;
var deleteMany$1 = {};
Object.defineProperty(deleteMany$1, "__esModule", { value: true });
deleteMany$1.deleteMany = void 0;
const db_data_1$g = db_data;
const errors_1$j = errors;
const deleteMany = (apiProvider, targetNamespace) => {
  const validator = (options) => {
    if (!options.ids && !options.filter) {
      throw new errors_1$j.PineconeArgumentError("Either `ids` or `filter` must be provided.");
    }
    if (options.ids && options.filter) {
      throw new errors_1$j.PineconeArgumentError("Cannot provide both `ids` and `filter`. Use either `ids` to delete specific records or `filter` to delete by metadata.");
    }
    if (options.ids && options.ids.length === 0) {
      throw new errors_1$j.PineconeArgumentError("Must pass in at least 1 record ID.");
    }
    if (options.filter) {
      for (const key in options.filter) {
        if (!options.filter[key]) {
          throw new errors_1$j.PineconeArgumentError(`\`filter\` property cannot be empty for key ${key}`);
        }
      }
    }
  };
  return async (options) => {
    validator(options);
    const namespace = options.namespace ?? targetNamespace;
    const requestOptions = {};
    if (options.ids) {
      requestOptions.ids = options.ids;
    } else if (options.filter) {
      requestOptions.filter = options.filter;
    }
    const api = await apiProvider.provide();
    await api.deleteVectors({
      xPineconeApiVersion: db_data_1$g.X_PINECONE_API_VERSION,
      deleteRequest: { ...requestOptions, namespace }
    });
    return;
  };
};
deleteMany$1.deleteMany = deleteMany;
var deleteAll$1 = {};
Object.defineProperty(deleteAll$1, "__esModule", { value: true });
deleteAll$1.deleteAll = void 0;
const db_data_1$f = db_data;
const deleteAll = (apiProvider, targetNamespace) => {
  return async (options) => {
    const namespace = options?.namespace ?? targetNamespace;
    const api = await apiProvider.provide();
    await api.deleteVectors({
      xPineconeApiVersion: db_data_1$f.X_PINECONE_API_VERSION,
      deleteRequest: { deleteAll: true, namespace }
    });
    return;
  };
};
deleteAll$1.deleteAll = deleteAll;
var describeIndexStats$1 = {};
Object.defineProperty(describeIndexStats$1, "__esModule", { value: true });
describeIndexStats$1.describeIndexStats = void 0;
const db_data_1$e = db_data;
const errors_1$i = errors;
const describeIndexStats = (apiProvider) => {
  const validator = (options) => {
    const map = options["filter"];
    for (const key in map) {
      if (!map[key]) {
        throw new errors_1$i.PineconeArgumentError(`\`filter\` property cannot be empty for ${key}`);
      }
    }
  };
  return async (options) => {
    if (options) {
      validator(options);
    }
    const api = await apiProvider.provide();
    const results = await api.describeIndexStats({
      xPineconeApiVersion: db_data_1$e.X_PINECONE_API_VERSION,
      describeIndexStatsRequest: { ...options }
    });
    const mappedResult = {
      namespaces: {},
      dimension: results.dimension,
      indexFullness: results.indexFullness,
      totalRecordCount: results.totalVectorCount
    };
    if (results.namespaces) {
      for (const key in results.namespaces) {
        mappedResult.namespaces[key] = {
          recordCount: results.namespaces[key].vectorCount
        };
      }
    }
    return mappedResult;
  };
};
describeIndexStats$1.describeIndexStats = describeIndexStats;
var vectorOperationsProvider = {};
Object.defineProperty(vectorOperationsProvider, "__esModule", { value: true });
vectorOperationsProvider.VectorOperationsProvider = void 0;
const db_data_1$d = db_data;
const utils_1$8 = utils$1;
const indexHostSingleton_1$3 = indexHostSingleton;
const middleware_1$4 = middleware;
const errors_1$h = errors;
class VectorOperationsProvider {
  config;
  indexName;
  indexHostUrl;
  vectorOperations;
  additionalHeaders;
  constructor(config2, indexName, indexHostUrl, additionalHeaders) {
    this.config = config2;
    this.indexName = indexName;
    this.indexHostUrl = (0, utils_1$8.normalizeUrl)(indexHostUrl);
    this.additionalHeaders = additionalHeaders;
  }
  async provide() {
    if (this.vectorOperations) {
      return this.vectorOperations;
    }
    if (this.indexHostUrl) {
      this.vectorOperations = this.buildDataOperationsConfig();
    } else {
      if (!this.indexName) {
        throw new errors_1$h.PineconeArgumentError("Either indexName or indexHostUrl must be provided to VectorOperationsProvider");
      }
      this.indexHostUrl = await indexHostSingleton_1$3.IndexHostSingleton.getHostUrl(this.config, this.indexName);
      this.vectorOperations = this.buildDataOperationsConfig();
    }
    return this.vectorOperations;
  }
  async provideHostUrl() {
    if (this.indexHostUrl) {
      return this.indexHostUrl;
    } else {
      if (!this.indexName) {
        throw new errors_1$h.PineconeArgumentError("Either indexName or indexHostUrl must be provided to VectorOperationsProvider");
      }
      return await indexHostSingleton_1$3.IndexHostSingleton.getHostUrl(this.config, this.indexName);
    }
  }
  buildDataOperationsConfig() {
    const headers = this.additionalHeaders || null;
    const indexConfigurationParameters = {
      basePath: this.indexHostUrl,
      apiKey: this.config.apiKey,
      queryParamsStringify: utils_1$8.queryParamsStringify,
      headers: {
        "User-Agent": (0, utils_1$8.buildUserAgent)(this.config),
        "X-Pinecone-Api-Version": db_data_1$d.X_PINECONE_API_VERSION,
        ...headers
      },
      fetchApi: (0, utils_1$8.getFetch)(this.config),
      middleware: (0, middleware_1$4.createMiddlewareArray)()
    };
    const indexConfiguration = new db_data_1$d.Configuration(indexConfigurationParameters);
    return new db_data_1$d.VectorOperationsApi(indexConfiguration);
  }
}
vectorOperationsProvider.VectorOperationsProvider = VectorOperationsProvider;
var list = {};
Object.defineProperty(list, "__esModule", { value: true });
list.listPaginated = void 0;
const db_data_1$c = db_data;
const errors_1$g = errors;
const listPaginated = (apiProvider, targetNamespace) => {
  const validator = (options) => {
    if (options.limit && options.limit < 0) {
      throw new errors_1$g.PineconeArgumentError("`limit` property must be greater than 0");
    }
  };
  return async (options) => {
    if (options) {
      validator(options);
    }
    const namespace = options?.namespace ?? targetNamespace;
    const listRequest = {
      xPineconeApiVersion: db_data_1$c.X_PINECONE_API_VERSION,
      ...options,
      namespace
    };
    const api = await apiProvider.provide();
    return await api.listVectors(listRequest);
  };
};
list.listPaginated = listPaginated;
var upsertRecords = {};
Object.defineProperty(upsertRecords, "__esModule", { value: true });
upsertRecords.UpsertRecordsCommand = void 0;
const errors_1$f = errors;
const utils_1$7 = utils$1;
const db_data_1$b = db_data;
class UpsertRecordsCommand {
  apiProvider;
  config;
  namespace;
  constructor(apiProvider, namespace, config2) {
    this.apiProvider = apiProvider;
    this.namespace = namespace;
    this.config = config2;
  }
  validator = (options) => {
    for (const record of options.records) {
      if (!record.id && !record._id) {
        throw new errors_1$f.PineconeArgumentError("Every record must include an `id` or `_id` property in order to upsert.");
      }
    }
  };
  async run(options) {
    const fetch2 = (0, utils_1$7.getFetch)(this.config);
    this.validator(options);
    const namespace = options.namespace ?? this.namespace;
    const hostUrl = await this.apiProvider.provideHostUrl();
    const upsertRecordsUrl = `${hostUrl}/records/namespaces/${namespace}/upsert`;
    const requestHeaders = {
      "Api-Key": this.config.apiKey,
      "User-Agent": (0, utils_1$7.buildUserAgent)(this.config),
      "X-Pinecone-Api-Version": db_data_1$b.X_PINECONE_API_VERSION
    };
    const response = await fetch2(upsertRecordsUrl, {
      method: "POST",
      headers: requestHeaders,
      body: toNdJson(options.records)
    });
    if (response.ok) {
      return;
    } else {
      const err = await (0, errors_1$f.handleApiError)(new db_data_1$b.ResponseError(response, "Response returned an error"), void 0, upsertRecordsUrl);
      throw err;
    }
  }
}
upsertRecords.UpsertRecordsCommand = UpsertRecordsCommand;
function toNdJson(data2) {
  return data2.map((record) => JSON.stringify(record)).join("\n");
}
var searchRecords = {};
Object.defineProperty(searchRecords, "__esModule", { value: true });
searchRecords.SearchRecordsCommand = void 0;
const db_data_1$a = db_data;
const errors_1$e = errors;
class SearchRecordsCommand {
  apiProvider;
  namespace;
  constructor(apiProvider, namespace) {
    this.apiProvider = apiProvider;
    this.namespace = namespace;
  }
  validator = (options) => {
    if (!options.query) {
      throw new errors_1$e.PineconeArgumentError("You must pass a `query` object to search.");
    }
  };
  async run(searchOptions) {
    this.validator(searchOptions);
    const namespace = searchOptions.namespace ?? this.namespace;
    const api = await this.apiProvider.provide();
    return await api.searchRecordsNamespace({
      xPineconeApiVersion: db_data_1$a.X_PINECONE_API_VERSION,
      searchRecordsRequest: searchOptions,
      namespace
    });
  }
}
searchRecords.SearchRecordsCommand = SearchRecordsCommand;
var startImport = {};
Object.defineProperty(startImport, "__esModule", { value: true });
startImport.StartImportCommand = void 0;
const db_data_1$9 = db_data;
const errors_1$d = errors;
class StartImportCommand {
  apiProvider;
  constructor(apiProvider) {
    this.apiProvider = apiProvider;
  }
  async run(options) {
    if (!options.uri) {
      throw new errors_1$d.PineconeArgumentError("`uri` field is required and must start with the scheme of a supported storage provider.");
    }
    let error = "continue";
    if (options.errorMode) {
      if (options.errorMode.toLowerCase() !== "continue" && options.errorMode.toLowerCase() !== "abort") {
        throw new errors_1$d.PineconeArgumentError('`errorMode` must be one of "continue" or "abort"');
      }
      if (options.errorMode.toLowerCase() == "abort") {
        error = "abort";
      }
    }
    const req = {
      xPineconeApiVersion: db_data_1$9.X_PINECONE_API_VERSION,
      startImportRequest: {
        uri: options.uri,
        errorMode: { onError: error },
        integrationId: options.integration
      }
    };
    const api = await this.apiProvider.provide();
    return await api.startBulkImport(req);
  }
}
startImport.StartImportCommand = StartImportCommand;
var listImports = {};
Object.defineProperty(listImports, "__esModule", { value: true });
listImports.ListImportsCommand = void 0;
const db_data_1$8 = db_data;
class ListImportsCommand {
  apiProvider;
  constructor(apiProvider) {
    this.apiProvider = apiProvider;
  }
  async run(limit2, paginationToken) {
    const req = {
      xPineconeApiVersion: db_data_1$8.X_PINECONE_API_VERSION,
      limit: limit2,
      paginationToken
    };
    const api = await this.apiProvider.provide();
    return await api.listBulkImports(req);
  }
}
listImports.ListImportsCommand = ListImportsCommand;
var describeImport = {};
Object.defineProperty(describeImport, "__esModule", { value: true });
describeImport.DescribeImportCommand = void 0;
const db_data_1$7 = db_data;
class DescribeImportCommand {
  apiProvider;
  constructor(apiProvider) {
    this.apiProvider = apiProvider;
  }
  async run(id) {
    const req = {
      id
    };
    const api = await this.apiProvider.provide();
    return await api.describeBulkImport({
      xPineconeApiVersion: db_data_1$7.X_PINECONE_API_VERSION,
      ...req
    });
  }
}
describeImport.DescribeImportCommand = DescribeImportCommand;
var cancelImport = {};
Object.defineProperty(cancelImport, "__esModule", { value: true });
cancelImport.CancelImportCommand = void 0;
const db_data_1$6 = db_data;
class CancelImportCommand {
  apiProvider;
  constructor(apiProvider) {
    this.apiProvider = apiProvider;
  }
  async run(id) {
    const req = {
      id
    };
    const api = await this.apiProvider.provide();
    return await api.cancelBulkImport({
      xPineconeApiVersion: db_data_1$6.X_PINECONE_API_VERSION,
      ...req
    });
  }
}
cancelImport.CancelImportCommand = CancelImportCommand;
var bulkOperationsProvider = {};
Object.defineProperty(bulkOperationsProvider, "__esModule", { value: true });
bulkOperationsProvider.BulkOperationsProvider = void 0;
const db_data_1$5 = db_data;
const utils_1$6 = utils$1;
const indexHostSingleton_1$2 = indexHostSingleton;
const middleware_1$3 = middleware;
const errors_1$c = errors;
class BulkOperationsProvider {
  config;
  indexName;
  indexHostUrl;
  bulkOperations;
  additionalHeaders;
  constructor(config2, indexName, indexHostUrl, additionalHeaders) {
    this.config = config2;
    this.indexName = indexName;
    this.indexHostUrl = (0, utils_1$6.normalizeUrl)(indexHostUrl);
    this.additionalHeaders = additionalHeaders;
  }
  async provide() {
    if (this.bulkOperations) {
      return this.bulkOperations;
    }
    if (this.indexHostUrl) {
      this.bulkOperations = this.buildBulkOperationsConfig();
    } else {
      if (!this.indexName) {
        throw new errors_1$c.PineconeArgumentError("Either indexName or indexHostUrl must be provided to BulkOperationsProvider");
      }
      this.indexHostUrl = await indexHostSingleton_1$2.IndexHostSingleton.getHostUrl(this.config, this.indexName);
      this.bulkOperations = this.buildBulkOperationsConfig();
    }
    return this.bulkOperations;
  }
  buildBulkOperationsConfig() {
    const headers = this.additionalHeaders || null;
    const indexConfigurationParameters = {
      basePath: this.indexHostUrl,
      apiKey: this.config.apiKey,
      queryParamsStringify: utils_1$6.queryParamsStringify,
      headers: {
        "User-Agent": (0, utils_1$6.buildUserAgent)(this.config),
        "X-Pinecone-Api-Version": db_data_1$5.X_PINECONE_API_VERSION,
        ...headers
      },
      fetchApi: (0, utils_1$6.getFetch)(this.config),
      middleware: (0, middleware_1$3.createMiddlewareArray)()
    };
    const indexConfiguration = new db_data_1$5.Configuration(indexConfigurationParameters);
    return new db_data_1$5.BulkOperationsApi(indexConfiguration);
  }
}
bulkOperationsProvider.BulkOperationsProvider = BulkOperationsProvider;
var namespacesOperationsProvider = {};
Object.defineProperty(namespacesOperationsProvider, "__esModule", { value: true });
namespacesOperationsProvider.NamespaceOperationsProvider = void 0;
const db_data_1$4 = db_data;
const utils_1$5 = utils$1;
const indexHostSingleton_1$1 = indexHostSingleton;
const middleware_1$2 = middleware;
const errors_1$b = errors;
class NamespaceOperationsProvider {
  config;
  indexName;
  indexHostUrl;
  namespaceOperations;
  additionalHeaders;
  constructor(config2, indexName, indexHostUrl, additionalHeaders) {
    this.config = config2;
    this.indexName = indexName;
    this.indexHostUrl = (0, utils_1$5.normalizeUrl)(indexHostUrl);
    this.additionalHeaders = additionalHeaders;
  }
  async provide() {
    if (this.namespaceOperations) {
      return this.namespaceOperations;
    }
    if (this.indexHostUrl) {
      this.namespaceOperations = this.buildNamespaceOperationsConfig();
    } else {
      if (!this.indexName) {
        throw new errors_1$b.PineconeArgumentError("Either indexName or indexHostUrl must be provided to NamespaceOperationsProvider");
      }
      this.indexHostUrl = await indexHostSingleton_1$1.IndexHostSingleton.getHostUrl(this.config, this.indexName);
      this.namespaceOperations = this.buildNamespaceOperationsConfig();
    }
    return this.namespaceOperations;
  }
  buildNamespaceOperationsConfig() {
    const headers = this.additionalHeaders || null;
    const indexConfigurationParameters = {
      basePath: this.indexHostUrl,
      apiKey: this.config.apiKey,
      queryParamsStringify: utils_1$5.queryParamsStringify,
      headers: {
        "User-Agent": (0, utils_1$5.buildUserAgent)(this.config),
        "X-Pinecone-Api-Version": db_data_1$4.X_PINECONE_API_VERSION,
        ...headers
      },
      fetchApi: (0, utils_1$5.getFetch)(this.config),
      middleware: (0, middleware_1$2.createMiddlewareArray)()
    };
    const indexConfiguration = new db_data_1$4.Configuration(indexConfigurationParameters);
    return new db_data_1$4.NamespaceOperationsApi(indexConfiguration);
  }
}
namespacesOperationsProvider.NamespaceOperationsProvider = NamespaceOperationsProvider;
var createNamespace$1 = {};
Object.defineProperty(createNamespace$1, "__esModule", { value: true });
createNamespace$1.createNamespace = void 0;
const db_data_1$3 = db_data;
const errors_1$a = errors;
const createNamespace = (apiProvider) => {
  return async (options) => {
    const api = await apiProvider.provide();
    if (!options || !options.name) {
      throw new errors_1$a.PineconeArgumentError("You must pass a non-empty string for `name` in order to create a namespace.");
    }
    return await api.createNamespace({
      createNamespaceRequest: options,
      xPineconeApiVersion: db_data_1$3.X_PINECONE_API_VERSION
    });
  };
};
createNamespace$1.createNamespace = createNamespace;
var listNamespaces$1 = {};
Object.defineProperty(listNamespaces$1, "__esModule", { value: true });
listNamespaces$1.listNamespaces = void 0;
const db_data_1$2 = db_data;
const listNamespaces = (apiProvider) => {
  return async (options) => {
    const api = await apiProvider.provide();
    return await api.listNamespacesOperation({
      xPineconeApiVersion: db_data_1$2.X_PINECONE_API_VERSION,
      limit: options?.limit,
      paginationToken: options?.paginationToken,
      prefix: options?.prefix
    });
  };
};
listNamespaces$1.listNamespaces = listNamespaces;
var describeNamespace$1 = {};
Object.defineProperty(describeNamespace$1, "__esModule", { value: true });
describeNamespace$1.describeNamespace = void 0;
const db_data_1$1 = db_data;
const describeNamespace = (apiProvider) => {
  return async (namespace) => {
    const api = await apiProvider.provide();
    return await api.describeNamespace({
      xPineconeApiVersion: db_data_1$1.X_PINECONE_API_VERSION,
      namespace
    });
  };
};
describeNamespace$1.describeNamespace = describeNamespace;
var deleteNamespace$1 = {};
Object.defineProperty(deleteNamespace$1, "__esModule", { value: true });
deleteNamespace$1.deleteNamespace = void 0;
const db_data_1 = db_data;
const deleteNamespace = (apiProvider) => {
  return async (namespace) => {
    const api = await apiProvider.provide();
    await api.deleteNamespace({
      xPineconeApiVersion: db_data_1.X_PINECONE_API_VERSION,
      namespace
    });
    return;
  };
};
deleteNamespace$1.deleteNamespace = deleteNamespace;
Object.defineProperty(data, "__esModule", { value: true });
data.Index = void 0;
const upsert_1 = upsert;
const fetch_1 = fetch$1;
const fetchByMetadata_1 = fetchByMetadata;
const update_1 = update;
const query_1 = query;
const deleteOne_1 = deleteOne$1;
const deleteMany_1 = deleteMany$1;
const deleteAll_1 = deleteAll$1;
const describeIndexStats_1 = describeIndexStats$1;
const vectorOperationsProvider_1 = vectorOperationsProvider;
const list_1 = list;
const upsertRecords_1 = upsertRecords;
const searchRecords_1 = searchRecords;
const startImport_1 = startImport;
const listImports_1 = listImports;
const describeImport_1 = describeImport;
const cancelImport_1 = cancelImport;
const bulkOperationsProvider_1 = bulkOperationsProvider;
const namespacesOperationsProvider_1 = namespacesOperationsProvider;
const createNamespace_1 = createNamespace$1;
const listNamespaces_1 = listNamespaces$1;
const describeNamespace_1 = describeNamespace$1;
const deleteNamespace_1 = deleteNamespace$1;
const errors_1$9 = errors;
class Index {
  /** @hidden */
  _deleteMany;
  /** @hidden */
  _deleteOne;
  /** @hidden */
  _describeIndexStats;
  /** @hidden */
  _listPaginated;
  /** @hidden */
  _deleteAll;
  /** @hidden */
  _fetchCommand;
  /** @hidden */
  _fetchByMetadataCommand;
  /** @hidden */
  _queryCommand;
  /** @hidden */
  _updateCommand;
  /** @hidden */
  _upsertCommand;
  /** @hidden */
  _upsertRecordsCommand;
  /** @hidden */
  _searchRecordsCommand;
  /** @hidden */
  _startImportCommand;
  /** @hidden */
  _listImportsCommand;
  /** @hidden */
  _describeImportCommand;
  /** @hidden */
  _cancelImportCommand;
  /** @hidden */
  _createNamespaceCommand;
  /** @hidden */
  _listNamespacesCommand;
  /** @hidden */
  _describeNamespaceCommand;
  /** @hidden */
  _deleteNamespaceCommand;
  /** @internal */
  config;
  /** @internal */
  target;
  /**
   * Instantiation of Index is handled by {@link Pinecone}
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * // Get host from describeIndex
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * // Or get host from createIndex response
   * const indexModel = await pc.createIndex({
   *   name: 'my-index',
   *   dimension: 1536,
   *   spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
   * });
   * const index = pc.index({ host: indexModel.host });
   * ```
   *
   * @constructor
   * @param options - The {@link IndexOptions} for targeting the index.
   * @param config - The configuration from the Pinecone client.
   */
  constructor(options, config2) {
    if (!options.name && !options.host) {
      throw new errors_1$9.PineconeArgumentError("Either name or host must be provided in IndexOptions");
    }
    this.config = config2;
    this.target = {
      indexName: options.name || "",
      namespace: options.namespace || "__default__",
      indexHostUrl: options.host
    };
    const dataOperationsProvider = new vectorOperationsProvider_1.VectorOperationsProvider(config2, this.target.indexName, this.target.indexHostUrl, options.additionalHeaders);
    this._deleteAll = (0, deleteAll_1.deleteAll)(dataOperationsProvider, this.target.namespace);
    this._deleteMany = (0, deleteMany_1.deleteMany)(dataOperationsProvider, this.target.namespace);
    this._deleteOne = (0, deleteOne_1.deleteOne)(dataOperationsProvider, this.target.namespace);
    this._describeIndexStats = (0, describeIndexStats_1.describeIndexStats)(dataOperationsProvider);
    this._listPaginated = (0, list_1.listPaginated)(dataOperationsProvider, this.target.namespace);
    this._fetchCommand = new fetch_1.FetchCommand(dataOperationsProvider, this.target.namespace);
    this._fetchByMetadataCommand = new fetchByMetadata_1.FetchByMetadataCommand(dataOperationsProvider, this.target.namespace);
    this._queryCommand = new query_1.QueryCommand(dataOperationsProvider, this.target.namespace);
    this._updateCommand = new update_1.UpdateCommand(dataOperationsProvider, this.target.namespace);
    this._upsertCommand = new upsert_1.UpsertCommand(dataOperationsProvider, this.target.namespace);
    this._upsertRecordsCommand = new upsertRecords_1.UpsertRecordsCommand(dataOperationsProvider, this.target.namespace, config2);
    this._searchRecordsCommand = new searchRecords_1.SearchRecordsCommand(dataOperationsProvider, this.target.namespace);
    const bulkApiProvider = new bulkOperationsProvider_1.BulkOperationsProvider(config2, this.target.indexName, this.target.indexHostUrl, options.additionalHeaders);
    this._startImportCommand = new startImport_1.StartImportCommand(bulkApiProvider);
    this._listImportsCommand = new listImports_1.ListImportsCommand(bulkApiProvider);
    this._describeImportCommand = new describeImport_1.DescribeImportCommand(bulkApiProvider);
    this._cancelImportCommand = new cancelImport_1.CancelImportCommand(bulkApiProvider);
    const namespaceApiProvider = new namespacesOperationsProvider_1.NamespaceOperationsProvider(config2, this.target.indexName, this.target.indexHostUrl, options.additionalHeaders);
    this._createNamespaceCommand = (0, createNamespace_1.createNamespace)(namespaceApiProvider);
    this._listNamespacesCommand = (0, listNamespaces_1.listNamespaces)(namespaceApiProvider);
    this._describeNamespaceCommand = (0, describeNamespace_1.describeNamespace)(namespaceApiProvider);
    this._deleteNamespaceCommand = (0, deleteNamespace_1.deleteNamespace)(namespaceApiProvider);
  }
  /**
     * Delete all records from the targeted namespace. To delete all records from across all namespaces,
     * delete the index using {@link Pinecone.deleteIndex} and create a new one using {@link Pinecone.createIndex}.
     *
    * @example
    * ```js
    * import { Pinecone } from '@pinecone-database/pinecone';
    * const pc = new Pinecone();
    * const indexModel = await pc.describeIndex('my-index');
    * const index = pc.index({ host: indexModel.host });
    *
    * await index.describeIndexStats();
    * // {
    * //  namespaces: {
    * //    '': { recordCount: 10 },
    * //   foo: { recordCount: 1 }
    * //   },
    * //   dimension: 8,
    * //   indexFullness: 0,
    * //   totalRecordCount: 11
    * // }
    * // Deletes all records from the default namespace '__default__'. Records in other namespaces are not modified.
    * await index.deleteAll();
    *
    * // Deletes all records from the namespace 'foo'. Records in other namespaces are not modified.
    * await index.deleteAll({ namespace: 'foo' });
    *
  
    * ```
     * @param options - Optional {@link DeleteAllOptions} for the operation.
     * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
     * @returns A promise that resolves when the delete is completed.
     */
  deleteAll(options) {
    return this._deleteAll(options);
  }
  /**
   * Delete records from the index by either an array of ids, or a filter object.
   * See [Filtering with metadata](https://docs.pinecone.io/docs/metadata-filtering#deleting-vectors-by-metadata-filter)
   * for more on deleting records with filters.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * await index.deleteMany({ ids: ['record-1', 'record-2'] });
   *
   * // or
   * await index.deleteMany({ filter: { genre: 'classical' } });
   * ```
   * @param options - The {@link DeleteManyOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves when the delete is completed.
   */
  deleteMany(options) {
    return this._deleteMany(options);
  }
  /**
   * Delete a record from the index by id.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * await index.deleteOne({ id: 'record-1', namespace: 'foo' });
   * ```
   * @param options - The {@link DeleteOneOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves when the delete is completed.
   */
  deleteOne(options) {
    return this._deleteOne(options);
  }
  /**
   * Describes the index's statistics such as total number of records, records per namespace, and the index's dimension size.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * await index.describeIndexStats();
   * // {
   * //  namespaces: {
   * //    '': { recordCount: 10 }
   * //    foo: { recordCount: 2000 },
   * //    bar: { recordCount: 2000 }
   * //   },
   * //   dimension: 1536,
   * //   indexFullness: 0,
   * //   totalRecordCount: 4010
   * // }
   * ```
   * @param options - The {@link DescribeIndexStatsOptions} for the operation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves with the {@link IndexStatsDescription} value when the operation is completed.
   */
  describeIndexStats(options) {
    return this._describeIndexStats(options);
  }
  /**
   * The `listPaginated` operation finds vectors based on an id prefix within a single namespace.
   * It returns matching ids in a paginated form, with a pagination token to fetch the next page of results.
   * This id list can then be passed to fetch or delete options to perform operations on the matching records.
   * See [Get record IDs](https://docs.pinecone.io/docs/get-record-ids) for guidance and examples.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host, namespace: 'my-namespace' });
   *
   * const results = await index.listPaginated({ prefix: 'doc1#' });
   * console.log(results);
   * // {
   * //   vectors: [
   * //     { id: 'doc1#01' }, { id: 'doc1#02' }, { id: 'doc1#03' },
   * //     { id: 'doc1#04' }, { id: 'doc1#05' },  { id: 'doc1#06' },
   * //     { id: 'doc1#07' }, { id: 'doc1#08' }, { id: 'doc1#09' },
   * //     ...
   * //   ],
   * //   pagination: {
   * //     next: 'eyJza2lwX3Bhc3QiOiJwcmVUZXN0LS04MCIsInByZWZpeCI6InByZVRlc3QifQ=='
   * //   },
   * //   namespace: 'my-namespace',
   * //   usage: { readUnits: 1 }
   * // }
   *
   * // Fetch the next page of results
   * await index.listPaginated({ prefix: 'doc1#', paginationToken: results.pagination.next});
   * ```
   *
   * > ⚠️ **Note:**
   * >
   * > `listPaginated` is supported only for serverless indexes.
   *
   * @param options - The {@link ListOptions} for the operation.
   * @returns - A promise that resolves with the {@link ListResponse} when the operation is completed.
   * @throws {@link Errors.PineconeConnectionError} when invalid environment, project id, or index name is configured.
   * @throws {@link Errors.PineconeArgumentError} when invalid arguments are passed.
   */
  listPaginated(options) {
    return this._listPaginated(options);
  }
  /**
   * Upsert records to the index.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * // Upsert to default namespace
   * await index.upsert({
   *   records: [{
   *     id: 'record-1',
   *     values: [0.176, 0.345, 0.263],
   *   },{
   *     id: 'record-2',
   *     values: [0.176, 0.345, 0.263],
   *   }]
   * })
   *
   * // Upsert to a different namespace
   * await index.upsert({
   *   records: [{
   *     id: 'record-3',
   *     values: [0.176, 0.345, 0.263],
   *   }],
   *   namespace: 'my-namespace'
   * })
   * ```
   *
   * @param options - The {@link UpsertOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves when the upsert is completed.
   */
  async upsert(options) {
    return await this._upsertCommand.run(options);
  }
  /**
   * Fetch records from the index.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * // Fetch from default namespace
   * await index.fetch({ ids: ['record-1', 'record-2'] });
   *
   * // Override namespace for this operation
   * await index.fetch({ ids: ['record-1', 'record-2'], namespace: 'my-namespace' });
   * ```
   * @param options - The {@link FetchOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves with the {@link FetchResponse} when the fetch is completed.
   */
  async fetch(options) {
    return await this._fetchCommand.run(options);
  }
  /**
   * Fetch records from the index by metadata filter.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * await index.fetchByMetadata({ filter: { genre: 'classical' } });
   * ```
   *
   * @param options - The {@link FetchByMetadataOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves with the {@link FetchByMetadataResponse} when the fetch is completed.
   */
  async fetchByMetadata(options) {
    return await this._fetchByMetadataCommand.run(options);
  }
  /**
   * Query records from the index. Query is used to find the `topK` records in the index whose vector values are most
   * similar to the vector values of the query according to the distance metric you have configured for your index.
   * See [Query data](https://docs.pinecone.io/docs/query-data) for more on querying.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-index');
   * const index = pc.index({ host: indexModel.host });
   *
   * // Query by id
   * await index.query({ topK: 3, id: 'record-1'});
   *
   * // Query by vector
   * await index.query({ topK: 3, vector: [0.176, 0.345, 0.263] });
   *
   * // Query a different namespace
   * await index.query({ topK: 3, id: 'record-1', namespace: 'custom-namespace' });
   * ```
   *
   * @param options - The {@link QueryOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves with the {@link QueryResponse} when the query is completed.
   */
  async query(options) {
    return await this._queryCommand.run(options);
  }
  /**
   * Update a record in the index by id.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('imdb-movies');
   * const index = pc.index({ host: indexModel.host });
   *
   * await index.update({
   *   id: '18593',
   *   metadata: { genre: 'romance' },
   * });
   * ```
   *
   * @param options - The {@link UpdateOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves when the update is completed.
   */
  async update(options) {
    return await this._updateCommand.run(options);
  }
  /**
   * Upsert integrated records into a specific namespace within an index.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const indexModel = await pc.describeIndex('integrated-index');
   * const namespace = pc.index({ host: indexModel.host, namespace: 'my-namespace' });
   *
   * await namespace.upsertRecords({
   *   records: [
   *     {
   *       id: 'rec1',
   *       chunk_text:
   *         "Apple's first product, the Apple I, was released in 1976 and was hand-built by co-founder Steve Wozniak.",
   *       category: 'product',
   *     },
   *     {
   *       id: 'rec2',
   *       chunk_text:
   *         'Apples are a great source of dietary fiber, which supports digestion and helps maintain a healthy gut.',
   *       category: 'nutrition',
   *     },
   *     {
   *       id: 'rec3',
   *       chunk_text:
   *         'Apples originated in Central Asia and have been cultivated for thousands of years, with over 7,500 varieties available today.',
   *       category: 'cultivation',
   *     },
   *     {
   *       id: 'rec4',
   *       chunk_text:
   *         'In 2001, Apple released the iPod, which transformed the music industry by making portable music widely accessible.',
   *       category: 'product',
   *     },
   *     {
   *       id: 'rec5',
   *       chunk_text:
   *         'Apple went public in 1980, making history with one of the largest IPOs at that time.',
   *       category: 'milestone',
   *     },
   *     {
   *       id: 'rec6',
   *       chunk_text:
   *         'Rich in vitamin C and other antioxidants, apples contribute to immune health and may reduce the risk of chronic diseases.',
   *       category: 'nutrition',
   *     },
   *     {
   *       id: 'rec7',
   *       chunk_text:
   *         "Known for its design-forward products, Apple's branding and market strategy have greatly influenced the technology sector and popularized minimalist design worldwide.",
   *       category: 'influence',
   *     },
   *     {
   *       id: 'rec8',
   *       chunk_text:
   *         'The high fiber content in apples can also help regulate blood sugar levels, making them a favorable snack for people with diabetes.',
   *       category: 'nutrition',
   *     },
   *   ]
   * });
   * ```
   *
   * @param options - The {@link UpsertRecordsOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns a promise that resolves when the operation is complete.
   */
  async upsertRecords(options) {
    return await this._upsertRecordsCommand.run(options);
  }
  /**
   * Search a specific namespace for records within an index.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('integrated-index');
   * const namespace = pc.index({ host: indexModel.host, namespace: 'my-namespace' });
   *
   * const response = await namespace.searchRecords({
   *   query: {
   *     inputs: { text: 'disease prevention' }, topK: 4 },
   *     rerank: {
   *       model: 'bge-reranker-v2-m3',
   *       topN: 2,
   *       rankFields: ['chunk_text'],
   *     },
   *   fields: ['category', 'chunk_text'],
   * });
   * console.log(response);
   * // {
   * //   "result": {
   * //     "hits": [
   * //       {
   * //         "id": "rec6",
   * //         "score": 0.1318424493074417,
   * //         "fields": {
   * //           "category": "nutrition",
   * //           "chunk_text": "Rich in vitamin C and other antioxidants, apples contribute to immune health and may reduce the risk of chronic diseases."
   * //         }
   * //       },
   * //       {
   * //         "id": "rec2",
   * //         "score": 0.004867417272180319,
   * //         "fields": {
   * //           "category": "nutrition",
   * //           "chunk_text": "Apples are a great source of dietary fiber, which supports digestion and helps maintain a healthy gut."
   * //         }
   * //       }
   * //     ]
   * //   },
   * //   "usage": {
   * //     "readUnits": 1,
   * //     "embedTotalTokens": 8,
   * //     "rerankUnits": 1
   * //   }
   * // }
   * ```
   *
   * @param options - The {@link SearchRecordsOptions} for the operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns a promise that resolves to {@link SearchRecordsResponse} when the operation is complete.
   */
  async searchRecords(options) {
    return await this._searchRecordsCommand.run(options);
  }
  /**
   * Start an asynchronous import of vectors from object storage into a Pinecone Serverless index.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * console.log(await index.startImport({ uri: 's3://my-bucket/my-data' }));
   *
   * // {"id":"1"}
   * ```
   *
   * @param options - The {@link StartImportOptions} for the import operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to {@link StartImportResponse} when the import operation is started.
   */
  async startImport(options) {
    return await this._startImportCommand.run(options);
  }
  /**
   * List all recent and ongoing import operations.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * console.log(await index.listImports(10));
   *
   * // {
   * //  data: [
   * //    {
   * //      id: '1',
   * //      uri: 's3://dev-bulk-import-datasets-pub/10-records-dim-10',
   * //      status: 'Completed',
   * //      createdAt: 2024-09-17T16:59:57.973Z,
   * //      finishedAt: 2024-09-17T17:00:12.809Z,
   * //      percentComplete: 100,
   * //      recordsImported: 20,
   * //      error: undefined
   * //    }
   * //  ],
   * //  pagination: undefined  // Example is only 1 item, so no pag. token given.
   * // }
   * ```
   *
   * @param limit - (Optional) Max number of import operations to return per page.
   * @param paginationToken - (Optional) Pagination token to continue a previous listing operation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to a {@link ListImportsResponse} when the operation is complete.
   */
  async listImports(limit2, paginationToken) {
    return await this._listImportsCommand.run(limit2, paginationToken);
  }
  /**
   * Return details of a specific import operation.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * console.log(await index.describeImport('import-id'));
   *
   * // {
   * //  id: '1',
   * //  uri: 's3://dev-bulk-import-datasets-pub/10-records-dim-10',
   * //  status: 'Completed',
   * //  createdAt: 2024-09-17T16:59:57.973Z,
   * //  finishedAt: 2024-09-17T17:00:12.809Z,
   * //  percentComplete: 100,
   * //  recordsImported: 20,
   * //  error: undefined
   * // }
   * ```
   *
   * @param id - The id of the import operation to describe.
   */
  async describeImport(id) {
    return await this._describeImportCommand.run(id);
  }
  /**
   * Cancel a specific import operation.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * console.log(await index.cancelImport('import-id'));
   *
   * // {}
   * ```
   *
   * @param id - The id of the import operation to cancel.
   */
  async cancelImport(id) {
    return await this._cancelImportCommand.run(id);
  }
  /**
   * Creates a new namespace within the index with an optional metadata schema.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * await index.createNamespace({
   *   name: 'my-namespace',
   *   schema: {
   *     fields: {
   *       genre: { filterable: true },
   *       year: { filterable: true }
   *     }
   *   }
   * });
   * ```
   *
   * @param options - Configuration options for creating the namespace.
   * @param options.name - (Required) The name of the namespace to create.
   * @param options.schema - (Optional) The metadata schema for the namespace. By default, all metadata is indexed;
   * when a schema is present, only fields which are present in the `fields` object with `filterable: true` are indexed.
   */
  async createNamespace(options) {
    return await this._createNamespaceCommand(options);
  }
  /**
   * Returns a list of namespaces within the index.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * console.log(await index.listNamespaces({ limit: 10 }));
   *
   * // {
   * //   namespaces: [
   * //     { name: 'ns-1', recordCount: '1' },
   * //     { name: 'ns-2', recordCount: '1' }
   * //   ],
   * //   pagination: undefined
   * // }
   * ```
   *
   * @param options - The {@link ListNamespacesOptions} for the operation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to a {@link ListNamespacesResponse} when the operation is complete.
   */
  async listNamespaces(options) {
    return await this._listNamespacesCommand(options);
  }
  /**
   * Returns the details of a specific namespace.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * console.log(await index.describeNamespace('ns-1'));
   *
   * // { name: 'ns-1', recordCount: '1' }
   * ```
   *
   * @param namespace - The namespace to describe.
   */
  async describeNamespace(namespace) {
    return await this._describeNamespaceCommand(namespace);
  }
  /**
   * Deletes a specific namespace from the index, including all records within it.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const indexModel = await pc.describeIndex('my-serverless-index');
   * const index = pc.index({ host: indexModel.host });
   * await index.deleteNamespace('ns-1');
   * ```
   *
   * @param namespace - The namespace to delete.
   */
  async deleteNamespace(namespace) {
    return await this._deleteNamespaceCommand(namespace);
  }
  /**
   * Returns an {@link Index} targeting the specified namespace.
   * By default if no namespace is provided, all operations take place inside the default namespace `'__default__'`.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * // Create an Index client instance scoped to operate on a
   * // single namespace
   * const ns = pc.index('my-index').namespace('my-namespace');
   *
   * // Now operations against this intance only affect records in
   * // the targeted namespace
   * ns.upsert([
   *   // ... records to upsert in namespace 'my-namespace'
   * ])
   *
   * ns.query({
   *   // ... query records in namespace 'my-namespace'
   * })
   * ```
   * This `namespace()` method will inherit custom metadata types if you are chaining the call off an {@link Index} client instance that is typed with a user-specified metadata type. See {@link Pinecone.index} for more info.
   *
   * @param namespace - The namespace to target within the index. All operations performed with the returned client instance will be scoped only to the targeted namespace.
   * @returns An {@link Index} object that can be used to perform data operations scoped to the specified namespace.
   */
  namespace(namespace) {
    return new Index({
      name: this.target.indexName,
      namespace,
      host: this.target.indexHostUrl,
      additionalHeaders: this.config.additionalHeaders
    }, this.config);
  }
}
data.Index = Index;
var inference$2 = {};
var inference$1 = {};
var inferenceOperationsBuilder$1 = {};
var inference = {};
var runtime$3 = {};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TextApiResponse = exports.BlobApiResponse = exports.VoidApiResponse = exports.JSONApiResponse = exports.COLLECTION_FORMATS = exports.RequiredError = exports.FetchError = exports.ResponseError = exports.BaseAPI = exports.DefaultConfig = exports.Configuration = exports.BASE_PATH = void 0;
  exports.exists = exists;
  exports.querystring = querystring;
  exports.mapValues = mapValues;
  exports.canConsumeForm = canConsumeForm;
  exports.BASE_PATH = "https://api.pinecone.io".replace(/\/+$/, "");
  class Configuration {
    configuration;
    constructor(configuration = {}) {
      this.configuration = configuration;
    }
    set config(configuration) {
      this.configuration = configuration;
    }
    get basePath() {
      return this.configuration.basePath != null ? this.configuration.basePath : exports.BASE_PATH;
    }
    get fetchApi() {
      return this.configuration.fetchApi;
    }
    get middleware() {
      return this.configuration.middleware || [];
    }
    get queryParamsStringify() {
      return this.configuration.queryParamsStringify || querystring;
    }
    get username() {
      return this.configuration.username;
    }
    get password() {
      return this.configuration.password;
    }
    get apiKey() {
      const apiKey = this.configuration.apiKey;
      if (apiKey) {
        return typeof apiKey === "function" ? apiKey : () => apiKey;
      }
      return void 0;
    }
    get accessToken() {
      const accessToken = this.configuration.accessToken;
      if (accessToken) {
        return typeof accessToken === "function" ? accessToken : async () => accessToken;
      }
      return void 0;
    }
    get headers() {
      return this.configuration.headers;
    }
    get credentials() {
      return this.configuration.credentials;
    }
  }
  exports.Configuration = Configuration;
  exports.DefaultConfig = new Configuration();
  class BaseAPI {
    configuration;
    static jsonRegex = new RegExp("^(:?application/json|[^;/ 	]+/[^;/ 	]+[+]json)[ 	]*(:?;.*)?$", "i");
    middleware;
    constructor(configuration = exports.DefaultConfig) {
      this.configuration = configuration;
      this.middleware = configuration.middleware;
    }
    withMiddleware(...middlewares) {
      const next = this.clone();
      next.middleware = next.middleware.concat(...middlewares);
      return next;
    }
    withPreMiddleware(...preMiddlewares) {
      const middlewares = preMiddlewares.map((pre) => ({ pre }));
      return this.withMiddleware(...middlewares);
    }
    withPostMiddleware(...postMiddlewares) {
      const middlewares = postMiddlewares.map((post) => ({ post }));
      return this.withMiddleware(...middlewares);
    }
    /**
     * Check if the given MIME is a JSON MIME.
     * JSON MIME examples:
     *   application/json
     *   application/json; charset=UTF8
     *   APPLICATION/JSON
     *   application/vnd.company+json
     * @param mime - MIME (Multipurpose Internet Mail Extensions)
     * @return True if the given MIME is JSON, false otherwise.
     */
    isJsonMime(mime) {
      if (!mime) {
        return false;
      }
      return BaseAPI.jsonRegex.test(mime);
    }
    async request(context2, initOverrides) {
      const { url, init } = await this.createFetchParams(context2, initOverrides);
      const response = await this.fetchApi(url, init);
      if (response && (response.status >= 200 && response.status < 300)) {
        return response;
      }
      throw new ResponseError(response, "Response returned an error code");
    }
    async createFetchParams(context2, initOverrides) {
      let url = this.configuration.basePath + context2.path;
      if (context2.query !== void 0 && Object.keys(context2.query).length !== 0) {
        url += "?" + this.configuration.queryParamsStringify(context2.query);
      }
      const headers = Object.assign({}, this.configuration.headers, context2.headers);
      Object.keys(headers).forEach((key) => headers[key] === void 0 ? delete headers[key] : {});
      const initOverrideFn = typeof initOverrides === "function" ? initOverrides : async () => initOverrides;
      const initParams = {
        method: context2.method,
        headers,
        body: context2.body,
        credentials: this.configuration.credentials
      };
      const overriddenInit = {
        ...initParams,
        ...await initOverrideFn({
          init: initParams,
          context: context2
        })
      };
      let body;
      if (isFormData(overriddenInit.body) || overriddenInit.body instanceof URLSearchParams || isBlob(overriddenInit.body)) {
        body = overriddenInit.body;
      } else if (this.isJsonMime(headers["Content-Type"])) {
        body = JSON.stringify(overriddenInit.body);
      } else {
        body = overriddenInit.body;
      }
      const init = {
        ...overriddenInit,
        body
      };
      return { url, init };
    }
    fetchApi = async (url, init) => {
      let fetchParams = { url, init };
      for (const middleware2 of this.middleware) {
        if (middleware2.pre) {
          fetchParams = await middleware2.pre({
            fetch: this.fetchApi,
            ...fetchParams
          }) || fetchParams;
        }
      }
      let response = void 0;
      try {
        response = await (this.configuration.fetchApi || fetch)(fetchParams.url, fetchParams.init);
      } catch (e) {
        for (const middleware2 of this.middleware) {
          if (middleware2.onError) {
            response = await middleware2.onError({
              fetch: this.fetchApi,
              url: fetchParams.url,
              init: fetchParams.init,
              error: e,
              response: response ? response.clone() : void 0
            }) || response;
          }
        }
        if (response === void 0) {
          if (e instanceof Error) {
            throw new FetchError(e, "The request failed and the interceptors did not return an alternative response");
          } else {
            throw e;
          }
        }
      }
      for (const middleware2 of this.middleware) {
        if (middleware2.post) {
          response = await middleware2.post({
            fetch: this.fetchApi,
            url: fetchParams.url,
            init: fetchParams.init,
            response: response.clone()
          }) || response;
        }
      }
      return response;
    };
    /**
     * Create a shallow clone of `this` by constructing a new instance
     * and then shallow cloning data members.
     */
    clone() {
      const constructor = this.constructor;
      const next = new constructor(this.configuration);
      next.middleware = this.middleware.slice();
      return next;
    }
  }
  exports.BaseAPI = BaseAPI;
  function isBlob(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  class ResponseError extends Error {
    response;
    name = "ResponseError";
    constructor(response, msg) {
      super(msg);
      this.response = response;
    }
  }
  exports.ResponseError = ResponseError;
  class FetchError extends Error {
    cause;
    name = "FetchError";
    constructor(cause, msg) {
      super(msg);
      this.cause = cause;
    }
  }
  exports.FetchError = FetchError;
  class RequiredError extends Error {
    field;
    name = "RequiredError";
    constructor(field, msg) {
      super(msg);
      this.field = field;
    }
  }
  exports.RequiredError = RequiredError;
  exports.COLLECTION_FORMATS = {
    csv: ",",
    ssv: " ",
    tsv: "	",
    pipes: "|"
  };
  function exists(json, key) {
    const value = json[key];
    return value !== null && value !== void 0;
  }
  function querystring(params, prefix = "") {
    return Object.keys(params).map((key) => querystringSingleKey2(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
  }
  function querystringSingleKey2(key, value, keyPrefix = "") {
    const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
    if (value instanceof Array) {
      const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
      return `${encodeURIComponent(fullKey)}=${multiValue}`;
    }
    if (value instanceof Set) {
      const valueAsArray = Array.from(value);
      return querystringSingleKey2(key, valueAsArray, keyPrefix);
    }
    if (value instanceof Date) {
      return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
    }
    if (value instanceof Object) {
      return querystring(value, fullKey);
    }
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
  }
  function mapValues(data2, fn) {
    return Object.keys(data2).reduce((acc, key) => ({ ...acc, [key]: fn(data2[key]) }), {});
  }
  function canConsumeForm(consumes) {
    for (const consume of consumes) {
      if ("multipart/form-data" === consume.contentType) {
        return true;
      }
    }
    return false;
  }
  class JSONApiResponse {
    raw;
    transformer;
    constructor(raw, transformer = (jsonValue) => jsonValue) {
      this.raw = raw;
      this.transformer = transformer;
    }
    async value() {
      return this.transformer(await this.raw.json());
    }
  }
  exports.JSONApiResponse = JSONApiResponse;
  class VoidApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return void 0;
    }
  }
  exports.VoidApiResponse = VoidApiResponse;
  class BlobApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.blob();
    }
  }
  exports.BlobApiResponse = BlobApiResponse;
  class TextApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.text();
    }
  }
  exports.TextApiResponse = TextApiResponse;
})(runtime$3);
var apis$1 = {};
var InferenceApi$1 = {};
var models$1 = {};
var DenseEmbedding = {};
Object.defineProperty(DenseEmbedding, "__esModule", { value: true });
DenseEmbedding.instanceOfDenseEmbedding = instanceOfDenseEmbedding;
DenseEmbedding.DenseEmbeddingFromJSON = DenseEmbeddingFromJSON;
DenseEmbedding.DenseEmbeddingFromJSONTyped = DenseEmbeddingFromJSONTyped;
DenseEmbedding.DenseEmbeddingToJSON = DenseEmbeddingToJSON;
function instanceOfDenseEmbedding(value) {
  let isInstance = true;
  isInstance = isInstance && "values" in value;
  isInstance = isInstance && "vectorType" in value;
  return isInstance;
}
function DenseEmbeddingFromJSON(json) {
  return DenseEmbeddingFromJSONTyped(json);
}
function DenseEmbeddingFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "values": json["values"],
    "vectorType": json["vector_type"]
  };
}
function DenseEmbeddingToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "values": value.values,
    "vector_type": value.vectorType
  };
}
var EmbedRequest = {};
var EmbedRequestInputsInner = {};
Object.defineProperty(EmbedRequestInputsInner, "__esModule", { value: true });
EmbedRequestInputsInner.instanceOfEmbedRequestInputsInner = instanceOfEmbedRequestInputsInner;
EmbedRequestInputsInner.EmbedRequestInputsInnerFromJSON = EmbedRequestInputsInnerFromJSON;
EmbedRequestInputsInner.EmbedRequestInputsInnerFromJSONTyped = EmbedRequestInputsInnerFromJSONTyped;
EmbedRequestInputsInner.EmbedRequestInputsInnerToJSON = EmbedRequestInputsInnerToJSON;
const runtime_1$t = runtime$3;
function instanceOfEmbedRequestInputsInner(value) {
  let isInstance = true;
  return isInstance;
}
function EmbedRequestInputsInnerFromJSON(json) {
  return EmbedRequestInputsInnerFromJSONTyped(json);
}
function EmbedRequestInputsInnerFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "text": !(0, runtime_1$t.exists)(json, "text") ? void 0 : json["text"]
  };
}
function EmbedRequestInputsInnerToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "text": value.text
  };
}
Object.defineProperty(EmbedRequest, "__esModule", { value: true });
EmbedRequest.instanceOfEmbedRequest = instanceOfEmbedRequest;
EmbedRequest.EmbedRequestFromJSON = EmbedRequestFromJSON;
EmbedRequest.EmbedRequestFromJSONTyped = EmbedRequestFromJSONTyped;
EmbedRequest.EmbedRequestToJSON = EmbedRequestToJSON;
const runtime_1$s = runtime$3;
const EmbedRequestInputsInner_1 = EmbedRequestInputsInner;
function instanceOfEmbedRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  isInstance = isInstance && "inputs" in value;
  return isInstance;
}
function EmbedRequestFromJSON(json) {
  return EmbedRequestFromJSONTyped(json);
}
function EmbedRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "parameters": !(0, runtime_1$s.exists)(json, "parameters") ? void 0 : json["parameters"],
    "inputs": json["inputs"].map(EmbedRequestInputsInner_1.EmbedRequestInputsInnerFromJSON)
  };
}
function EmbedRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "parameters": value.parameters,
    "inputs": value.inputs.map(EmbedRequestInputsInner_1.EmbedRequestInputsInnerToJSON)
  };
}
var Embedding = {};
var SparseEmbedding = {};
Object.defineProperty(SparseEmbedding, "__esModule", { value: true });
SparseEmbedding.instanceOfSparseEmbedding = instanceOfSparseEmbedding;
SparseEmbedding.SparseEmbeddingFromJSON = SparseEmbeddingFromJSON;
SparseEmbedding.SparseEmbeddingFromJSONTyped = SparseEmbeddingFromJSONTyped;
SparseEmbedding.SparseEmbeddingToJSON = SparseEmbeddingToJSON;
const runtime_1$r = runtime$3;
function instanceOfSparseEmbedding(value) {
  let isInstance = true;
  isInstance = isInstance && "sparseValues" in value;
  isInstance = isInstance && "sparseIndices" in value;
  isInstance = isInstance && "vectorType" in value;
  return isInstance;
}
function SparseEmbeddingFromJSON(json) {
  return SparseEmbeddingFromJSONTyped(json);
}
function SparseEmbeddingFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "sparseValues": json["sparse_values"],
    "sparseIndices": json["sparse_indices"],
    "sparseTokens": !(0, runtime_1$r.exists)(json, "sparse_tokens") ? void 0 : json["sparse_tokens"],
    "vectorType": json["vector_type"]
  };
}
function SparseEmbeddingToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "sparse_values": value.sparseValues,
    "sparse_indices": value.sparseIndices,
    "sparse_tokens": value.sparseTokens,
    "vector_type": value.vectorType
  };
}
Object.defineProperty(Embedding, "__esModule", { value: true });
Embedding.EmbeddingFromJSON = EmbeddingFromJSON;
Embedding.EmbeddingFromJSONTyped = EmbeddingFromJSONTyped;
Embedding.EmbeddingToJSON = EmbeddingToJSON;
const DenseEmbedding_1 = DenseEmbedding;
const SparseEmbedding_1 = SparseEmbedding;
function EmbeddingFromJSON(json) {
  return EmbeddingFromJSONTyped(json);
}
function EmbeddingFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  switch (json["vector_type"]) {
    case "dense":
      return { ...(0, DenseEmbedding_1.DenseEmbeddingFromJSONTyped)(json, true), vectorType: "dense" };
    case "sparse":
      return { ...(0, SparseEmbedding_1.SparseEmbeddingFromJSONTyped)(json, true), vectorType: "sparse" };
    default:
      throw new Error(`No variant of Embedding exists with 'vectorType=${json["vectorType"]}'`);
  }
}
function EmbeddingToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  switch (value["vectorType"]) {
    case "dense":
      return (0, DenseEmbedding_1.DenseEmbeddingToJSON)(value);
    case "sparse":
      return (0, SparseEmbedding_1.SparseEmbeddingToJSON)(value);
    default:
      throw new Error(`No variant of Embedding exists with 'vectorType=${value["vectorType"]}'`);
  }
}
var EmbeddingsList = {};
var EmbeddingsListUsage = {};
Object.defineProperty(EmbeddingsListUsage, "__esModule", { value: true });
EmbeddingsListUsage.instanceOfEmbeddingsListUsage = instanceOfEmbeddingsListUsage;
EmbeddingsListUsage.EmbeddingsListUsageFromJSON = EmbeddingsListUsageFromJSON;
EmbeddingsListUsage.EmbeddingsListUsageFromJSONTyped = EmbeddingsListUsageFromJSONTyped;
EmbeddingsListUsage.EmbeddingsListUsageToJSON = EmbeddingsListUsageToJSON;
const runtime_1$q = runtime$3;
function instanceOfEmbeddingsListUsage(value) {
  let isInstance = true;
  return isInstance;
}
function EmbeddingsListUsageFromJSON(json) {
  return EmbeddingsListUsageFromJSONTyped(json);
}
function EmbeddingsListUsageFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "totalTokens": !(0, runtime_1$q.exists)(json, "total_tokens") ? void 0 : json["total_tokens"]
  };
}
function EmbeddingsListUsageToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "total_tokens": value.totalTokens
  };
}
Object.defineProperty(EmbeddingsList, "__esModule", { value: true });
EmbeddingsList.instanceOfEmbeddingsList = instanceOfEmbeddingsList;
EmbeddingsList.EmbeddingsListFromJSON = EmbeddingsListFromJSON;
EmbeddingsList.EmbeddingsListFromJSONTyped = EmbeddingsListFromJSONTyped;
EmbeddingsList.EmbeddingsListToJSON = EmbeddingsListToJSON;
const Embedding_1 = Embedding;
const EmbeddingsListUsage_1 = EmbeddingsListUsage;
function instanceOfEmbeddingsList(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  isInstance = isInstance && "vectorType" in value;
  isInstance = isInstance && "data" in value;
  isInstance = isInstance && "usage" in value;
  return isInstance;
}
function EmbeddingsListFromJSON(json) {
  return EmbeddingsListFromJSONTyped(json);
}
function EmbeddingsListFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "vectorType": json["vector_type"],
    "data": json["data"].map(Embedding_1.EmbeddingFromJSON),
    "usage": (0, EmbeddingsListUsage_1.EmbeddingsListUsageFromJSON)(json["usage"])
  };
}
function EmbeddingsListToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "vector_type": value.vectorType,
    "data": value.data.map(Embedding_1.EmbeddingToJSON),
    "usage": (0, EmbeddingsListUsage_1.EmbeddingsListUsageToJSON)(value.usage)
  };
}
var ErrorResponse$1 = {};
var ErrorResponseError$1 = {};
Object.defineProperty(ErrorResponseError$1, "__esModule", { value: true });
ErrorResponseError$1.instanceOfErrorResponseError = instanceOfErrorResponseError$1;
ErrorResponseError$1.ErrorResponseErrorFromJSON = ErrorResponseErrorFromJSON$1;
ErrorResponseError$1.ErrorResponseErrorFromJSONTyped = ErrorResponseErrorFromJSONTyped$1;
ErrorResponseError$1.ErrorResponseErrorToJSON = ErrorResponseErrorToJSON$1;
const runtime_1$p = runtime$3;
function instanceOfErrorResponseError$1(value) {
  let isInstance = true;
  isInstance = isInstance && "code" in value;
  isInstance = isInstance && "message" in value;
  return isInstance;
}
function ErrorResponseErrorFromJSON$1(json) {
  return ErrorResponseErrorFromJSONTyped$1(json);
}
function ErrorResponseErrorFromJSONTyped$1(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "code": json["code"],
    "message": json["message"],
    "details": !(0, runtime_1$p.exists)(json, "details") ? void 0 : json["details"]
  };
}
function ErrorResponseErrorToJSON$1(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "code": value.code,
    "message": value.message,
    "details": value.details
  };
}
Object.defineProperty(ErrorResponse$1, "__esModule", { value: true });
ErrorResponse$1.instanceOfErrorResponse = instanceOfErrorResponse$1;
ErrorResponse$1.ErrorResponseFromJSON = ErrorResponseFromJSON$1;
ErrorResponse$1.ErrorResponseFromJSONTyped = ErrorResponseFromJSONTyped$1;
ErrorResponse$1.ErrorResponseToJSON = ErrorResponseToJSON$1;
const ErrorResponseError_1$1 = ErrorResponseError$1;
function instanceOfErrorResponse$1(value) {
  let isInstance = true;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "error" in value;
  return isInstance;
}
function ErrorResponseFromJSON$1(json) {
  return ErrorResponseFromJSONTyped$1(json);
}
function ErrorResponseFromJSONTyped$1(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "status": json["status"],
    "error": (0, ErrorResponseError_1$1.ErrorResponseErrorFromJSON)(json["error"])
  };
}
function ErrorResponseToJSON$1(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "status": value.status,
    "error": (0, ErrorResponseError_1$1.ErrorResponseErrorToJSON)(value.error)
  };
}
var ModelInfo = {};
var ModelInfoSupportedParameter = {};
var ModelInfoSupportedParameterAllowedValuesInner = {};
Object.defineProperty(ModelInfoSupportedParameterAllowedValuesInner, "__esModule", { value: true });
ModelInfoSupportedParameterAllowedValuesInner.instanceOfModelInfoSupportedParameterAllowedValuesInner = instanceOfModelInfoSupportedParameterAllowedValuesInner;
ModelInfoSupportedParameterAllowedValuesInner.ModelInfoSupportedParameterAllowedValuesInnerFromJSON = ModelInfoSupportedParameterAllowedValuesInnerFromJSON;
ModelInfoSupportedParameterAllowedValuesInner.ModelInfoSupportedParameterAllowedValuesInnerFromJSONTyped = ModelInfoSupportedParameterAllowedValuesInnerFromJSONTyped;
ModelInfoSupportedParameterAllowedValuesInner.ModelInfoSupportedParameterAllowedValuesInnerToJSON = ModelInfoSupportedParameterAllowedValuesInnerToJSON;
function instanceOfModelInfoSupportedParameterAllowedValuesInner(value) {
  let isInstance = true;
  return isInstance;
}
function ModelInfoSupportedParameterAllowedValuesInnerFromJSON(json) {
  return ModelInfoSupportedParameterAllowedValuesInnerFromJSONTyped(json);
}
function ModelInfoSupportedParameterAllowedValuesInnerFromJSONTyped(json, ignoreDiscriminator) {
  return json;
}
function ModelInfoSupportedParameterAllowedValuesInnerToJSON(value) {
  return value;
}
var ModelInfoSupportedParameterDefault = {};
Object.defineProperty(ModelInfoSupportedParameterDefault, "__esModule", { value: true });
ModelInfoSupportedParameterDefault.instanceOfModelInfoSupportedParameterDefault = instanceOfModelInfoSupportedParameterDefault;
ModelInfoSupportedParameterDefault.ModelInfoSupportedParameterDefaultFromJSON = ModelInfoSupportedParameterDefaultFromJSON;
ModelInfoSupportedParameterDefault.ModelInfoSupportedParameterDefaultFromJSONTyped = ModelInfoSupportedParameterDefaultFromJSONTyped;
ModelInfoSupportedParameterDefault.ModelInfoSupportedParameterDefaultToJSON = ModelInfoSupportedParameterDefaultToJSON;
function instanceOfModelInfoSupportedParameterDefault(value) {
  let isInstance = true;
  return isInstance;
}
function ModelInfoSupportedParameterDefaultFromJSON(json) {
  return ModelInfoSupportedParameterDefaultFromJSONTyped(json);
}
function ModelInfoSupportedParameterDefaultFromJSONTyped(json, ignoreDiscriminator) {
  return json;
}
function ModelInfoSupportedParameterDefaultToJSON(value) {
  return value;
}
Object.defineProperty(ModelInfoSupportedParameter, "__esModule", { value: true });
ModelInfoSupportedParameter.instanceOfModelInfoSupportedParameter = instanceOfModelInfoSupportedParameter;
ModelInfoSupportedParameter.ModelInfoSupportedParameterFromJSON = ModelInfoSupportedParameterFromJSON;
ModelInfoSupportedParameter.ModelInfoSupportedParameterFromJSONTyped = ModelInfoSupportedParameterFromJSONTyped;
ModelInfoSupportedParameter.ModelInfoSupportedParameterToJSON = ModelInfoSupportedParameterToJSON;
const runtime_1$o = runtime$3;
const ModelInfoSupportedParameterAllowedValuesInner_1 = ModelInfoSupportedParameterAllowedValuesInner;
const ModelInfoSupportedParameterDefault_1 = ModelInfoSupportedParameterDefault;
function instanceOfModelInfoSupportedParameter(value) {
  let isInstance = true;
  isInstance = isInstance && "parameter" in value;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "valueType" in value;
  isInstance = isInstance && "required" in value;
  return isInstance;
}
function ModelInfoSupportedParameterFromJSON(json) {
  return ModelInfoSupportedParameterFromJSONTyped(json);
}
function ModelInfoSupportedParameterFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "parameter": json["parameter"],
    "type": json["type"],
    "valueType": json["value_type"],
    "required": json["required"],
    "allowedValues": !(0, runtime_1$o.exists)(json, "allowed_values") ? void 0 : json["allowed_values"].map(ModelInfoSupportedParameterAllowedValuesInner_1.ModelInfoSupportedParameterAllowedValuesInnerFromJSON),
    "min": !(0, runtime_1$o.exists)(json, "min") ? void 0 : json["min"],
    "max": !(0, runtime_1$o.exists)(json, "max") ? void 0 : json["max"],
    "_default": !(0, runtime_1$o.exists)(json, "default") ? void 0 : (0, ModelInfoSupportedParameterDefault_1.ModelInfoSupportedParameterDefaultFromJSON)(json["default"])
  };
}
function ModelInfoSupportedParameterToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "parameter": value.parameter,
    "type": value.type,
    "value_type": value.valueType,
    "required": value.required,
    "allowed_values": value.allowedValues === void 0 ? void 0 : value.allowedValues.map(ModelInfoSupportedParameterAllowedValuesInner_1.ModelInfoSupportedParameterAllowedValuesInnerToJSON),
    "min": value.min,
    "max": value.max,
    "default": (0, ModelInfoSupportedParameterDefault_1.ModelInfoSupportedParameterDefaultToJSON)(value._default)
  };
}
Object.defineProperty(ModelInfo, "__esModule", { value: true });
ModelInfo.instanceOfModelInfo = instanceOfModelInfo;
ModelInfo.ModelInfoFromJSON = ModelInfoFromJSON;
ModelInfo.ModelInfoFromJSONTyped = ModelInfoFromJSONTyped;
ModelInfo.ModelInfoToJSON = ModelInfoToJSON;
const runtime_1$n = runtime$3;
const ModelInfoSupportedParameter_1 = ModelInfoSupportedParameter;
function instanceOfModelInfo(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  isInstance = isInstance && "shortDescription" in value;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "supportedParameters" in value;
  return isInstance;
}
function ModelInfoFromJSON(json) {
  return ModelInfoFromJSONTyped(json);
}
function ModelInfoFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "shortDescription": json["short_description"],
    "type": json["type"],
    "vectorType": !(0, runtime_1$n.exists)(json, "vector_type") ? void 0 : json["vector_type"],
    "defaultDimension": !(0, runtime_1$n.exists)(json, "default_dimension") ? void 0 : json["default_dimension"],
    "modality": !(0, runtime_1$n.exists)(json, "modality") ? void 0 : json["modality"],
    "maxSequenceLength": !(0, runtime_1$n.exists)(json, "max_sequence_length") ? void 0 : json["max_sequence_length"],
    "maxBatchSize": !(0, runtime_1$n.exists)(json, "max_batch_size") ? void 0 : json["max_batch_size"],
    "providerName": !(0, runtime_1$n.exists)(json, "provider_name") ? void 0 : json["provider_name"],
    "supportedDimensions": !(0, runtime_1$n.exists)(json, "supported_dimensions") ? void 0 : json["supported_dimensions"],
    "supportedMetrics": !(0, runtime_1$n.exists)(json, "supported_metrics") ? void 0 : json["supported_metrics"],
    "supportedParameters": json["supported_parameters"].map(ModelInfoSupportedParameter_1.ModelInfoSupportedParameterFromJSON)
  };
}
function ModelInfoToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "short_description": value.shortDescription,
    "type": value.type,
    "vector_type": value.vectorType,
    "default_dimension": value.defaultDimension,
    "modality": value.modality,
    "max_sequence_length": value.maxSequenceLength,
    "max_batch_size": value.maxBatchSize,
    "provider_name": value.providerName,
    "supported_dimensions": value.supportedDimensions,
    "supported_metrics": value.supportedMetrics,
    "supported_parameters": value.supportedParameters.map(ModelInfoSupportedParameter_1.ModelInfoSupportedParameterToJSON)
  };
}
var ModelInfoList = {};
Object.defineProperty(ModelInfoList, "__esModule", { value: true });
ModelInfoList.instanceOfModelInfoList = instanceOfModelInfoList;
ModelInfoList.ModelInfoListFromJSON = ModelInfoListFromJSON;
ModelInfoList.ModelInfoListFromJSONTyped = ModelInfoListFromJSONTyped;
ModelInfoList.ModelInfoListToJSON = ModelInfoListToJSON;
const runtime_1$m = runtime$3;
const ModelInfo_1 = ModelInfo;
function instanceOfModelInfoList(value) {
  let isInstance = true;
  return isInstance;
}
function ModelInfoListFromJSON(json) {
  return ModelInfoListFromJSONTyped(json);
}
function ModelInfoListFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "models": !(0, runtime_1$m.exists)(json, "models") ? void 0 : json["models"].map(ModelInfo_1.ModelInfoFromJSON)
  };
}
function ModelInfoListToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "models": value.models === void 0 ? void 0 : value.models.map(ModelInfo_1.ModelInfoToJSON)
  };
}
var RankedDocument = {};
Object.defineProperty(RankedDocument, "__esModule", { value: true });
RankedDocument.instanceOfRankedDocument = instanceOfRankedDocument;
RankedDocument.RankedDocumentFromJSON = RankedDocumentFromJSON;
RankedDocument.RankedDocumentFromJSONTyped = RankedDocumentFromJSONTyped;
RankedDocument.RankedDocumentToJSON = RankedDocumentToJSON;
const runtime_1$l = runtime$3;
function instanceOfRankedDocument(value) {
  let isInstance = true;
  isInstance = isInstance && "index" in value;
  isInstance = isInstance && "score" in value;
  return isInstance;
}
function RankedDocumentFromJSON(json) {
  return RankedDocumentFromJSONTyped(json);
}
function RankedDocumentFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "index": json["index"],
    "score": json["score"],
    "document": !(0, runtime_1$l.exists)(json, "document") ? void 0 : json["document"]
  };
}
function RankedDocumentToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "index": value.index,
    "score": value.score,
    "document": value.document
  };
}
var RerankRequest = {};
Object.defineProperty(RerankRequest, "__esModule", { value: true });
RerankRequest.instanceOfRerankRequest = instanceOfRerankRequest;
RerankRequest.RerankRequestFromJSON = RerankRequestFromJSON;
RerankRequest.RerankRequestFromJSONTyped = RerankRequestFromJSONTyped;
RerankRequest.RerankRequestToJSON = RerankRequestToJSON;
const runtime_1$k = runtime$3;
function instanceOfRerankRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  isInstance = isInstance && "query" in value;
  isInstance = isInstance && "documents" in value;
  return isInstance;
}
function RerankRequestFromJSON(json) {
  return RerankRequestFromJSONTyped(json);
}
function RerankRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "query": json["query"],
    "topN": !(0, runtime_1$k.exists)(json, "top_n") ? void 0 : json["top_n"],
    "returnDocuments": !(0, runtime_1$k.exists)(json, "return_documents") ? void 0 : json["return_documents"],
    "rankFields": !(0, runtime_1$k.exists)(json, "rank_fields") ? void 0 : json["rank_fields"],
    "documents": json["documents"],
    "parameters": !(0, runtime_1$k.exists)(json, "parameters") ? void 0 : json["parameters"]
  };
}
function RerankRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "query": value.query,
    "top_n": value.topN,
    "return_documents": value.returnDocuments,
    "rank_fields": value.rankFields,
    "documents": value.documents,
    "parameters": value.parameters
  };
}
var RerankResult = {};
var RerankResultUsage = {};
Object.defineProperty(RerankResultUsage, "__esModule", { value: true });
RerankResultUsage.instanceOfRerankResultUsage = instanceOfRerankResultUsage;
RerankResultUsage.RerankResultUsageFromJSON = RerankResultUsageFromJSON;
RerankResultUsage.RerankResultUsageFromJSONTyped = RerankResultUsageFromJSONTyped;
RerankResultUsage.RerankResultUsageToJSON = RerankResultUsageToJSON;
const runtime_1$j = runtime$3;
function instanceOfRerankResultUsage(value) {
  let isInstance = true;
  return isInstance;
}
function RerankResultUsageFromJSON(json) {
  return RerankResultUsageFromJSONTyped(json);
}
function RerankResultUsageFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "rerankUnits": !(0, runtime_1$j.exists)(json, "rerank_units") ? void 0 : json["rerank_units"]
  };
}
function RerankResultUsageToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "rerank_units": value.rerankUnits
  };
}
Object.defineProperty(RerankResult, "__esModule", { value: true });
RerankResult.instanceOfRerankResult = instanceOfRerankResult;
RerankResult.RerankResultFromJSON = RerankResultFromJSON;
RerankResult.RerankResultFromJSONTyped = RerankResultFromJSONTyped;
RerankResult.RerankResultToJSON = RerankResultToJSON;
const RankedDocument_1 = RankedDocument;
const RerankResultUsage_1 = RerankResultUsage;
function instanceOfRerankResult(value) {
  let isInstance = true;
  isInstance = isInstance && "model" in value;
  isInstance = isInstance && "data" in value;
  isInstance = isInstance && "usage" in value;
  return isInstance;
}
function RerankResultFromJSON(json) {
  return RerankResultFromJSONTyped(json);
}
function RerankResultFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "model": json["model"],
    "data": json["data"].map(RankedDocument_1.RankedDocumentFromJSON),
    "usage": (0, RerankResultUsage_1.RerankResultUsageFromJSON)(json["usage"])
  };
}
function RerankResultToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "model": value.model,
    "data": value.data.map(RankedDocument_1.RankedDocumentToJSON),
    "usage": (0, RerankResultUsage_1.RerankResultUsageToJSON)(value.usage)
  };
}
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(DenseEmbedding, exports);
  __exportStar(EmbedRequest, exports);
  __exportStar(EmbedRequestInputsInner, exports);
  __exportStar(Embedding, exports);
  __exportStar(EmbeddingsList, exports);
  __exportStar(EmbeddingsListUsage, exports);
  __exportStar(ErrorResponse$1, exports);
  __exportStar(ErrorResponseError$1, exports);
  __exportStar(ModelInfo, exports);
  __exportStar(ModelInfoList, exports);
  __exportStar(ModelInfoSupportedParameter, exports);
  __exportStar(ModelInfoSupportedParameterAllowedValuesInner, exports);
  __exportStar(ModelInfoSupportedParameterDefault, exports);
  __exportStar(RankedDocument, exports);
  __exportStar(RerankRequest, exports);
  __exportStar(RerankResult, exports);
  __exportStar(RerankResultUsage, exports);
  __exportStar(SparseEmbedding, exports);
})(models$1);
var __createBinding$1 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault$1 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar$1 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$1(result, mod, k);
  }
  __setModuleDefault$1(result, mod);
  return result;
};
Object.defineProperty(InferenceApi$1, "__esModule", { value: true });
InferenceApi$1.InferenceApi = void 0;
const runtime$2 = __importStar$1(runtime$3);
const index_1$1 = models$1;
class InferenceApi extends runtime$2.BaseAPI {
  /**
   * Generate vector embeddings for input data. This endpoint uses Pinecone\'s [hosted embedding models](https://docs.pinecone.io/guides/index-data/create-an-index#embedding-models).
   * Generate vectors
   */
  async embedRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$2.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling embed.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/embed`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$1.EmbedRequestToJSON)(requestParameters.embedRequest)
    }, initOverrides);
    return new runtime$2.JSONApiResponse(response, (jsonValue) => (0, index_1$1.EmbeddingsListFromJSON)(jsonValue));
  }
  /**
   * Generate vector embeddings for input data. This endpoint uses Pinecone\'s [hosted embedding models](https://docs.pinecone.io/guides/index-data/create-an-index#embedding-models).
   * Generate vectors
   */
  async embed(requestParameters, initOverrides) {
    const response = await this.embedRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Get a description of a model hosted by Pinecone.   You can use hosted models as an integrated part of Pinecone operations or for standalone embedding and reranking. For more details, see [Vector embedding](https://docs.pinecone.io/guides/index-data/indexing-overview#vector-embedding) and [Rerank results](https://docs.pinecone.io/guides/search/rerank-results).
   * Describe a model
   */
  async getModelRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$2.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling getModel.");
    }
    if (requestParameters.modelName === null || requestParameters.modelName === void 0) {
      throw new runtime$2.RequiredError("modelName", "Required parameter requestParameters.modelName was null or undefined when calling getModel.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/models/{model_name}`.replace(`{${"model_name"}}`, encodeURIComponent(String(requestParameters.modelName))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$2.JSONApiResponse(response, (jsonValue) => (0, index_1$1.ModelInfoFromJSON)(jsonValue));
  }
  /**
   * Get a description of a model hosted by Pinecone.   You can use hosted models as an integrated part of Pinecone operations or for standalone embedding and reranking. For more details, see [Vector embedding](https://docs.pinecone.io/guides/index-data/indexing-overview#vector-embedding) and [Rerank results](https://docs.pinecone.io/guides/search/rerank-results).
   * Describe a model
   */
  async getModel(requestParameters, initOverrides) {
    const response = await this.getModelRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List the embedding and reranking models hosted by Pinecone.   You can use hosted models as an integrated part of Pinecone operations or for standalone embedding and reranking. For more details, see [Vector embedding](https://docs.pinecone.io/guides/index-data/indexing-overview#vector-embedding) and [Rerank results](https://docs.pinecone.io/guides/search/rerank-results).
   * List available models
   */
  async listModelsRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$2.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listModels.");
    }
    const queryParameters = {};
    if (requestParameters.type !== void 0) {
      queryParameters["type"] = requestParameters.type;
    }
    if (requestParameters.vectorType !== void 0) {
      queryParameters["vector_type"] = requestParameters.vectorType;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/models`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime$2.JSONApiResponse(response, (jsonValue) => (0, index_1$1.ModelInfoListFromJSON)(jsonValue));
  }
  /**
   * List the embedding and reranking models hosted by Pinecone.   You can use hosted models as an integrated part of Pinecone operations or for standalone embedding and reranking. For more details, see [Vector embedding](https://docs.pinecone.io/guides/index-data/indexing-overview#vector-embedding) and [Rerank results](https://docs.pinecone.io/guides/search/rerank-results).
   * List available models
   */
  async listModels(requestParameters, initOverrides) {
    const response = await this.listModelsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Rerank results according to their relevance to a query.  For guidance and examples, see [Rerank results](https://docs.pinecone.io/guides/search/rerank-results).
   * Rerank results
   */
  async rerankRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime$2.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling rerank.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/rerank`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1$1.RerankRequestToJSON)(requestParameters.rerankRequest)
    }, initOverrides);
    return new runtime$2.JSONApiResponse(response, (jsonValue) => (0, index_1$1.RerankResultFromJSON)(jsonValue));
  }
  /**
   * Rerank results according to their relevance to a query.  For guidance and examples, see [Rerank results](https://docs.pinecone.io/guides/search/rerank-results).
   * Rerank results
   */
  async rerank(requestParameters, initOverrides) {
    const response = await this.rerankRaw(requestParameters, initOverrides);
    return await response.value();
  }
}
InferenceApi$1.InferenceApi = InferenceApi;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(InferenceApi$1, exports);
})(apis$1);
var api_version$1 = {};
Object.defineProperty(api_version$1, "__esModule", { value: true });
api_version$1.X_PINECONE_API_VERSION = void 0;
api_version$1.X_PINECONE_API_VERSION = "2025-10";
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(runtime$3, exports);
  __exportStar(apis$1, exports);
  __exportStar(models$1, exports);
  __exportStar(api_version$1, exports);
})(inference);
Object.defineProperty(inferenceOperationsBuilder$1, "__esModule", { value: true });
inferenceOperationsBuilder$1.inferenceOperationsBuilder = void 0;
const inference_1$5 = inference;
const utils_1$4 = utils$1;
const middleware_1$1 = middleware;
const inferenceOperationsBuilder = (config2) => {
  const { apiKey } = config2;
  const controllerPath = (0, utils_1$4.normalizeUrl)(config2.controllerHostUrl) || "https://api.pinecone.io";
  const headers = config2.additionalHeaders || null;
  const apiConfig = {
    basePath: controllerPath,
    apiKey,
    queryParamsStringify: utils_1$4.queryParamsStringify,
    headers: {
      "User-Agent": (0, utils_1$4.buildUserAgent)(config2),
      "X-Pinecone-Api-Version": inference_1$5.X_PINECONE_API_VERSION,
      ...headers
    },
    fetchApi: (0, utils_1$4.getFetch)(config2),
    middleware: (0, middleware_1$1.createMiddlewareArray)()
  };
  return new inference_1$5.InferenceApi(new inference_1$5.Configuration(apiConfig));
};
inferenceOperationsBuilder$1.inferenceOperationsBuilder = inferenceOperationsBuilder;
var embed$1 = {};
Object.defineProperty(embed$1, "__esModule", { value: true });
embed$1.embed = void 0;
const inference_1$4 = inference;
const embed = (infApi) => {
  return async (options) => {
    const typedAndFormattedInputs = options.inputs.map((str2) => {
      return { text: str2 };
    });
    const params = options.parameters ? { ...options.parameters } : void 0;
    if (params && params.inputType) {
      params.input_type = params.inputType;
      delete params.inputType;
    }
    return await infApi.embed({
      embedRequest: {
        model: options.model,
        inputs: typedAndFormattedInputs,
        parameters: params
      },
      xPineconeApiVersion: inference_1$4.X_PINECONE_API_VERSION
    });
  };
};
embed$1.embed = embed;
var rerank$1 = {};
Object.defineProperty(rerank$1, "__esModule", { value: true });
rerank$1.rerank = void 0;
const inference_1$3 = inference;
const errors_1$8 = errors;
const rerank = (infApi) => {
  return async (options) => {
    if (!options.documents || options.documents.length == 0) {
      throw new errors_1$8.PineconeArgumentError("You must pass at least one document to rerank");
    }
    if (!options.query || options.query.length == 0) {
      throw new errors_1$8.PineconeArgumentError("You must pass a query to rerank");
    }
    if (!options.model || options.model.length == 0) {
      throw new errors_1$8.PineconeArgumentError("You must pass the name of a supported reranking model in order to rerank documents. See https://docs.pinecone.io/models for supported models.");
    }
    const topN = options.topN ?? options.documents.length;
    const returnDocuments = options.returnDocuments ?? true;
    const parameters = options.parameters ?? {};
    const rankFields = options.rankFields ?? ["text"];
    const newDocuments = options.documents.map((doc) => typeof doc === "string" ? { text: doc } : doc);
    if (!options.rankFields) {
      if (!newDocuments.every((doc) => typeof doc === "object" && doc.text)) {
        throw new errors_1$8.PineconeArgumentError('Documents must be a list of strings or objects containing the "text" field');
      }
    }
    return await infApi.rerank({
      rerankRequest: {
        model: options.model,
        query: options.query,
        documents: newDocuments,
        topN,
        returnDocuments,
        rankFields,
        parameters
      },
      xPineconeApiVersion: inference_1$3.X_PINECONE_API_VERSION
    });
  };
};
rerank$1.rerank = rerank;
var getModel$1 = {};
Object.defineProperty(getModel$1, "__esModule", { value: true });
getModel$1.getModel = void 0;
const errors_1$7 = errors;
const inference_1$2 = inference;
const getModel = (infApi) => {
  return async (modelName) => {
    if (!modelName) {
      throw new errors_1$7.PineconeArgumentError("You must pass a non-empty string for `modelName` in order to get a model");
    }
    return await infApi.getModel({
      modelName,
      xPineconeApiVersion: inference_1$2.X_PINECONE_API_VERSION
    });
  };
};
getModel$1.getModel = getModel;
var listModels$1 = {};
Object.defineProperty(listModels$1, "__esModule", { value: true });
listModels$1.listModels = void 0;
const inference_1$1 = inference;
const listModels = (infApi) => {
  return async (options) => {
    return await infApi.listModels({
      ...options,
      xPineconeApiVersion: inference_1$1.X_PINECONE_API_VERSION
    });
  };
};
listModels$1.listModels = listModels;
Object.defineProperty(inference$1, "__esModule", { value: true });
inference$1.Inference = void 0;
const inferenceOperationsBuilder_1 = inferenceOperationsBuilder$1;
const embed_1 = embed$1;
const rerank_1 = rerank$1;
const getModel_1 = getModel$1;
const listModels_1 = listModels$1;
class Inference {
  /** @hidden */
  _embed;
  /** @hidden */
  _rerank;
  /** @hidden */
  _listModels;
  /** @hidden */
  _getModel;
  /** @internal */
  config;
  constructor(config2) {
    this.config = config2;
    const inferenceApi = (0, inferenceOperationsBuilder_1.inferenceOperationsBuilder)(this.config);
    this._embed = (0, embed_1.embed)(inferenceApi);
    this._rerank = (0, rerank_1.rerank)(inferenceApi);
    this._listModels = (0, listModels_1.listModels)(inferenceApi);
    this._getModel = (0, getModel_1.getModel)(inferenceApi);
  }
  /**
   * Generates embeddings for the provided inputs using the specified model and (optional) parameters.
   *
   * @example
   * ````typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const embeddings = await pc.inference.embed({
   *   model: 'multilingual-e5-large',
   *   inputs: ['Who created the first computer?'],
   *   parameters: {
   *     inputType: 'passage',
   *     truncate: 'END',
   *   }
   * });
   * console.log(embeddings);
   * // {
   * //   model: 'multilingual-e5-large',
   * //   vectorType: 'dense',
   * //   data: [ { values: [Array], vectorType: 'dense' } ],
   * //   usage: { totalTokens: 10 }
   * // }
   * ```
   *
   * @param options - The {@link EmbedOptions} for generating embeddings.
   * @returns A promise that resolves to {@link EmbeddingsList}.
   * */
  embed(options) {
    return this._embed(options);
  }
  /**
   * Rerank documents against a query with a reranking model. Each document is ranked in descending relevance order
   * against the query provided.
   *
   * @example
   * ````typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const myQuery = 'What are some good Turkey dishes for Thanksgiving?';
   *
   * // Option 1: Documents as an array of strings
   * const myDocsStrings = [
   *   'I love turkey sandwiches with pastrami',
   *   'A lemon brined Turkey with apple sausage stuffing is a classic Thanksgiving main',
   *   'My favorite Thanksgiving dish is pumpkin pie',
   *   'Turkey is a great source of protein',
   * ];
   *
   * // Option 1 response
   * const response = await pc.inference.rerank({
   *   model: 'bge-reranker-v2-m3',
   *   query: myQuery,
   *   documents: myDocsStrings
   * });
   * console.log(response);
   * // {
   * // model: 'bge-reranker-v2-m3',
   * // data: [
   * //   { index: 1, score: 0.5633179, document: [Object] },
   * //   { index: 2, score: 0.02013874, document: [Object] },
   * //   { index: 3, score: 0.00035419367, document: [Object] },
   * //   { index: 0, score: 0.00021485926, document: [Object] }
   * // ],
   * // usage: { rerankUnits: 1 }
   * // }
   *
   * // Option 2: Documents as an array of objects
   * const myDocsObjs = [
   *   {
   *     title: 'Turkey Sandwiches',
   *     body: 'I love turkey sandwiches with pastrami',
   *   },
   *   {
   *     title: 'Lemon Turkey',
   *     body: 'A lemon brined Turkey with apple sausage stuffing is a classic Thanksgiving main',
   *   },
   *   {
   *     title: 'Thanksgiving',
   *     body: 'My favorite Thanksgiving dish is pumpkin pie',
   *   },
   *   { title: 'Protein Sources', body: 'Turkey is a great source of protein' },
   * ];
   *
   * // Option 2: Options object declaring which custom key to rerank on
   * // Note: If no custom key is passed via `rankFields`, each doc must contain a `text` key, and that will act as the default)
   * const response = await pc.inference.rerank({
   *   model: 'bge-reranker-v2-m3',
   *   query: myQuery,
   *   documents: myDocsObjs,
   *   topN: 3,
   *   returnDocuments: false,
   *   rankFields: ['body'],
   *   parameters: {
   *     inputType: 'passage',
   *     truncate: 'END',
   *   },
   * });
   * console.log(response);
   * // {
   * // model: 'bge-reranker-v2-m3',
   * // data: [
   * //   { index: 1, score: 0.5633179, document: undefined },
   * //   { index: 2, score: 0.02013874, document: undefined },
   * //   { index: 3, score: 0.00035419367, document: undefined },
   * // ],
   * // usage: { rerankUnits: 1 }
   * //}
   * ```
   *
   * @param options - The {@link RerankOptions} for the reranking operation.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @returns A promise that resolves to {@link RerankResult}.
   * */
  async rerank(options) {
    return this._rerank(options);
  }
  /**
   * List available models hosted by Pinecone.
   *
   * @example
   * ````typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const models = await pc.inference.listModels();
   * console.log(models);
   * // {
   * //   models: [
   * //     {
   * //       model: 'llama-text-embed-v2',
   * //       shortDescription: 'A high performance dense embedding model optimized for multilingual and cross-lingual text question-answering retrieval with support for long documents (up to 2048 tokens) and dynamic embedding size (Matryoshka Embeddings).',
   * //       type: 'embed',
   * //       vectorType: 'dense',
   * //       defaultDimension: 1024,
   * //       modality: 'text',
   * //       maxSequenceLength: 2048,
   * //       maxBatchSize: 96,
   * //       providerName: 'NVIDIA',
   * //       supportedDimensions: [Array],
   * //       supportedMetrics: [Array],
   * //       supportedParameters: [Array]
   * //     },
   * //     ...
   * //     {
   * //       model: 'pinecone-rerank-v0',
   * //       shortDescription: 'A state of the art reranking model that out-performs competitors on widely accepted benchmarks. It can handle chunks up to 512 tokens (1-2 paragraphs)',
   * //       type: 'rerank',
   * //       vectorType: undefined,
   * //       defaultDimension: undefined,
   * //       modality: 'text',
   * //       maxSequenceLength: 512,
   * //       maxBatchSize: 100,
   * //       providerName: 'Pinecone',
   * //       supportedDimensions: undefined,
   * //       supportedMetrics: undefined,
   * //       supportedParameters: [Array]
   * //     }
   * //   ]
   * // }
   * ```
   *
   * @param options - (Optional) A {@link ListModelsOptions} object to filter the models returned.
   * @returns A promise that resolves to {@link ModelInfoList}.
   * */
  async listModels(options) {
    return this._listModels(options);
  }
  /**
   * Get the information for a model hosted by Pinecone.
   *
   * @example
   * ````typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const model = await pc.inference.getModel('pinecone-sparse-english-v0');
   * console.log(model);
   * // {
   * //   model: 'pinecone-sparse-english-v0',
   * //   shortDescription: 'A sparse embedding model for converting text to sparse vectors for keyword or hybrid semantic/keyword search. Built on the innovations of the DeepImpact architecture.',
   * //   type: 'embed',
   * //   vectorType: 'sparse',
   * //   defaultDimension: undefined,
   * //   modality: 'text',
   * //   maxSequenceLength: 512,
   * //   maxBatchSize: 96,
   * //   providerName: 'Pinecone',
   * //   supportedDimensions: undefined,
   * //   supportedMetrics: [ 'DotProduct' ],
   * //   supportedParameters: [
   * //     {
   * //       parameter: 'input_type',
   * //       type: 'one_of',
   * //       valueType: 'string',
   * //       required: true,
   * //       allowedValues: [Array],
   * //       min: undefined,
   * //       max: undefined,
   * //       _default: undefined
   * //     },
   * //     {
   * //       parameter: 'truncate',
   * //       type: 'one_of',
   * //       valueType: 'string',
   * //       required: false,
   * //       allowedValues: [Array],
   * //       min: undefined,
   * //       max: undefined,
   * //       _default: 'END'
   * //     },
   * //     {
   * //       parameter: 'return_tokens',
   * //       type: 'any',
   * //       valueType: 'boolean',
   * //       required: false,
   * //       allowedValues: undefined,
   * //       min: undefined,
   * //       max: undefined,
   * //       _default: false
   * //     }
   * //   ]
   * // }
   * ```
   *
   * @param modelName - The model name you would like to describe.
   * @returns A promise that resolves to {@link ModelInfo}.
   * */
  async getModel(modelName) {
    return this._getModel(modelName);
  }
}
inference$1.Inference = Inference;
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.listModels = exports.getModel = exports.rerank = exports.embed = exports.inferenceOperationsBuilder = exports.Inference = void 0;
  var inference_12 = inference$1;
  Object.defineProperty(exports, "Inference", { enumerable: true, get: function() {
    return inference_12.Inference;
  } });
  var inferenceOperationsBuilder_12 = inferenceOperationsBuilder$1;
  Object.defineProperty(exports, "inferenceOperationsBuilder", { enumerable: true, get: function() {
    return inferenceOperationsBuilder_12.inferenceOperationsBuilder;
  } });
  var embed_12 = embed$1;
  Object.defineProperty(exports, "embed", { enumerable: true, get: function() {
    return embed_12.embed;
  } });
  var rerank_12 = rerank$1;
  Object.defineProperty(exports, "rerank", { enumerable: true, get: function() {
    return rerank_12.rerank;
  } });
  var getModel_12 = getModel$1;
  Object.defineProperty(exports, "getModel", { enumerable: true, get: function() {
    return getModel_12.getModel;
  } });
  var listModels_12 = listModels$1;
  Object.defineProperty(exports, "listModels", { enumerable: true, get: function() {
    return listModels_12.listModels;
  } });
})(inference$2);
var assistant = {};
var chat = {};
var assistant_data = {};
var runtime$1 = {};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TextApiResponse = exports.BlobApiResponse = exports.VoidApiResponse = exports.JSONApiResponse = exports.COLLECTION_FORMATS = exports.RequiredError = exports.FetchError = exports.ResponseError = exports.BaseAPI = exports.DefaultConfig = exports.Configuration = exports.BASE_PATH = void 0;
  exports.exists = exists;
  exports.querystring = querystring;
  exports.mapValues = mapValues;
  exports.canConsumeForm = canConsumeForm;
  exports.BASE_PATH = "https://unknown".replace(/\/+$/, "");
  class Configuration {
    configuration;
    constructor(configuration = {}) {
      this.configuration = configuration;
    }
    set config(configuration) {
      this.configuration = configuration;
    }
    get basePath() {
      return this.configuration.basePath != null ? this.configuration.basePath : exports.BASE_PATH;
    }
    get fetchApi() {
      return this.configuration.fetchApi;
    }
    get middleware() {
      return this.configuration.middleware || [];
    }
    get queryParamsStringify() {
      return this.configuration.queryParamsStringify || querystring;
    }
    get username() {
      return this.configuration.username;
    }
    get password() {
      return this.configuration.password;
    }
    get apiKey() {
      const apiKey = this.configuration.apiKey;
      if (apiKey) {
        return typeof apiKey === "function" ? apiKey : () => apiKey;
      }
      return void 0;
    }
    get accessToken() {
      const accessToken = this.configuration.accessToken;
      if (accessToken) {
        return typeof accessToken === "function" ? accessToken : async () => accessToken;
      }
      return void 0;
    }
    get headers() {
      return this.configuration.headers;
    }
    get credentials() {
      return this.configuration.credentials;
    }
  }
  exports.Configuration = Configuration;
  exports.DefaultConfig = new Configuration();
  class BaseAPI {
    configuration;
    static jsonRegex = new RegExp("^(:?application/json|[^;/ 	]+/[^;/ 	]+[+]json)[ 	]*(:?;.*)?$", "i");
    middleware;
    constructor(configuration = exports.DefaultConfig) {
      this.configuration = configuration;
      this.middleware = configuration.middleware;
    }
    withMiddleware(...middlewares) {
      const next = this.clone();
      next.middleware = next.middleware.concat(...middlewares);
      return next;
    }
    withPreMiddleware(...preMiddlewares) {
      const middlewares = preMiddlewares.map((pre) => ({ pre }));
      return this.withMiddleware(...middlewares);
    }
    withPostMiddleware(...postMiddlewares) {
      const middlewares = postMiddlewares.map((post) => ({ post }));
      return this.withMiddleware(...middlewares);
    }
    /**
     * Check if the given MIME is a JSON MIME.
     * JSON MIME examples:
     *   application/json
     *   application/json; charset=UTF8
     *   APPLICATION/JSON
     *   application/vnd.company+json
     * @param mime - MIME (Multipurpose Internet Mail Extensions)
     * @return True if the given MIME is JSON, false otherwise.
     */
    isJsonMime(mime) {
      if (!mime) {
        return false;
      }
      return BaseAPI.jsonRegex.test(mime);
    }
    async request(context2, initOverrides) {
      const { url, init } = await this.createFetchParams(context2, initOverrides);
      const response = await this.fetchApi(url, init);
      if (response && (response.status >= 200 && response.status < 300)) {
        return response;
      }
      throw new ResponseError(response, "Response returned an error code");
    }
    async createFetchParams(context2, initOverrides) {
      let url = this.configuration.basePath + context2.path;
      if (context2.query !== void 0 && Object.keys(context2.query).length !== 0) {
        url += "?" + this.configuration.queryParamsStringify(context2.query);
      }
      const headers = Object.assign({}, this.configuration.headers, context2.headers);
      Object.keys(headers).forEach((key) => headers[key] === void 0 ? delete headers[key] : {});
      const initOverrideFn = typeof initOverrides === "function" ? initOverrides : async () => initOverrides;
      const initParams = {
        method: context2.method,
        headers,
        body: context2.body,
        credentials: this.configuration.credentials
      };
      const overriddenInit = {
        ...initParams,
        ...await initOverrideFn({
          init: initParams,
          context: context2
        })
      };
      let body;
      if (isFormData(overriddenInit.body) || overriddenInit.body instanceof URLSearchParams || isBlob(overriddenInit.body)) {
        body = overriddenInit.body;
      } else if (this.isJsonMime(headers["Content-Type"])) {
        body = JSON.stringify(overriddenInit.body);
      } else {
        body = overriddenInit.body;
      }
      const init = {
        ...overriddenInit,
        body
      };
      return { url, init };
    }
    fetchApi = async (url, init) => {
      let fetchParams = { url, init };
      for (const middleware2 of this.middleware) {
        if (middleware2.pre) {
          fetchParams = await middleware2.pre({
            fetch: this.fetchApi,
            ...fetchParams
          }) || fetchParams;
        }
      }
      let response = void 0;
      try {
        response = await (this.configuration.fetchApi || fetch)(fetchParams.url, fetchParams.init);
      } catch (e) {
        for (const middleware2 of this.middleware) {
          if (middleware2.onError) {
            response = await middleware2.onError({
              fetch: this.fetchApi,
              url: fetchParams.url,
              init: fetchParams.init,
              error: e,
              response: response ? response.clone() : void 0
            }) || response;
          }
        }
        if (response === void 0) {
          if (e instanceof Error) {
            throw new FetchError(e, "The request failed and the interceptors did not return an alternative response");
          } else {
            throw e;
          }
        }
      }
      for (const middleware2 of this.middleware) {
        if (middleware2.post) {
          response = await middleware2.post({
            fetch: this.fetchApi,
            url: fetchParams.url,
            init: fetchParams.init,
            response: response.clone()
          }) || response;
        }
      }
      return response;
    };
    /**
     * Create a shallow clone of `this` by constructing a new instance
     * and then shallow cloning data members.
     */
    clone() {
      const constructor = this.constructor;
      const next = new constructor(this.configuration);
      next.middleware = this.middleware.slice();
      return next;
    }
  }
  exports.BaseAPI = BaseAPI;
  function isBlob(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  class ResponseError extends Error {
    response;
    name = "ResponseError";
    constructor(response, msg) {
      super(msg);
      this.response = response;
    }
  }
  exports.ResponseError = ResponseError;
  class FetchError extends Error {
    cause;
    name = "FetchError";
    constructor(cause, msg) {
      super(msg);
      this.cause = cause;
    }
  }
  exports.FetchError = FetchError;
  class RequiredError extends Error {
    field;
    name = "RequiredError";
    constructor(field, msg) {
      super(msg);
      this.field = field;
    }
  }
  exports.RequiredError = RequiredError;
  exports.COLLECTION_FORMATS = {
    csv: ",",
    ssv: " ",
    tsv: "	",
    pipes: "|"
  };
  function exists(json, key) {
    const value = json[key];
    return value !== null && value !== void 0;
  }
  function querystring(params, prefix = "") {
    return Object.keys(params).map((key) => querystringSingleKey2(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
  }
  function querystringSingleKey2(key, value, keyPrefix = "") {
    const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
    if (value instanceof Array) {
      const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
      return `${encodeURIComponent(fullKey)}=${multiValue}`;
    }
    if (value instanceof Set) {
      const valueAsArray = Array.from(value);
      return querystringSingleKey2(key, valueAsArray, keyPrefix);
    }
    if (value instanceof Date) {
      return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
    }
    if (value instanceof Object) {
      return querystring(value, fullKey);
    }
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
  }
  function mapValues(data2, fn) {
    return Object.keys(data2).reduce((acc, key) => ({ ...acc, [key]: fn(data2[key]) }), {});
  }
  function canConsumeForm(consumes) {
    for (const consume of consumes) {
      if ("multipart/form-data" === consume.contentType) {
        return true;
      }
    }
    return false;
  }
  class JSONApiResponse {
    raw;
    transformer;
    constructor(raw, transformer = (jsonValue) => jsonValue) {
      this.raw = raw;
      this.transformer = transformer;
    }
    async value() {
      return this.transformer(await this.raw.json());
    }
  }
  exports.JSONApiResponse = JSONApiResponse;
  class VoidApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return void 0;
    }
  }
  exports.VoidApiResponse = VoidApiResponse;
  class BlobApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.blob();
    }
  }
  exports.BlobApiResponse = BlobApiResponse;
  class TextApiResponse {
    raw;
    constructor(raw) {
      this.raw = raw;
    }
    async value() {
      return await this.raw.text();
    }
  }
  exports.TextApiResponse = TextApiResponse;
})(runtime$1);
var apis = {};
var ManageAssistantsApi$1 = {};
var models = {};
var AssistantFileModel = {};
Object.defineProperty(AssistantFileModel, "__esModule", { value: true });
AssistantFileModel.instanceOfAssistantFileModel = instanceOfAssistantFileModel;
AssistantFileModel.AssistantFileModelFromJSON = AssistantFileModelFromJSON;
AssistantFileModel.AssistantFileModelFromJSONTyped = AssistantFileModelFromJSONTyped;
AssistantFileModel.AssistantFileModelToJSON = AssistantFileModelToJSON;
const runtime_1$i = runtime$1;
function instanceOfAssistantFileModel(value) {
  let isInstance = true;
  isInstance = isInstance && "name" in value;
  isInstance = isInstance && "id" in value;
  return isInstance;
}
function AssistantFileModelFromJSON(json) {
  return AssistantFileModelFromJSONTyped(json);
}
function AssistantFileModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "name": json["name"],
    "id": json["id"],
    "metadata": !(0, runtime_1$i.exists)(json, "metadata") ? void 0 : json["metadata"],
    "createdOn": !(0, runtime_1$i.exists)(json, "created_on") ? void 0 : new Date(json["created_on"]),
    "updatedOn": !(0, runtime_1$i.exists)(json, "updated_on") ? void 0 : new Date(json["updated_on"]),
    "status": !(0, runtime_1$i.exists)(json, "status") ? void 0 : json["status"],
    "percentDone": !(0, runtime_1$i.exists)(json, "percent_done") ? void 0 : json["percent_done"],
    "signedUrl": !(0, runtime_1$i.exists)(json, "signed_url") ? void 0 : json["signed_url"],
    "errorMessage": !(0, runtime_1$i.exists)(json, "error_message") ? void 0 : json["error_message"],
    "multimodal": !(0, runtime_1$i.exists)(json, "multimodal") ? void 0 : json["multimodal"]
  };
}
function AssistantFileModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "name": value.name,
    "id": value.id,
    "metadata": value.metadata,
    "created_on": value.createdOn === void 0 ? void 0 : value.createdOn.toISOString(),
    "updated_on": value.updatedOn === void 0 ? void 0 : value.updatedOn.toISOString(),
    "status": value.status,
    "percent_done": value.percentDone,
    "signed_url": value.signedUrl,
    "error_message": value.errorMessage,
    "multimodal": value.multimodal
  };
}
var ChatCompletionModel = {};
var ChoiceModel = {};
var MessageModel = {};
Object.defineProperty(MessageModel, "__esModule", { value: true });
MessageModel.instanceOfMessageModel = instanceOfMessageModel;
MessageModel.MessageModelFromJSON = MessageModelFromJSON;
MessageModel.MessageModelFromJSONTyped = MessageModelFromJSONTyped;
MessageModel.MessageModelToJSON = MessageModelToJSON;
const runtime_1$h = runtime$1;
function instanceOfMessageModel(value) {
  let isInstance = true;
  return isInstance;
}
function MessageModelFromJSON(json) {
  return MessageModelFromJSONTyped(json);
}
function MessageModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "role": !(0, runtime_1$h.exists)(json, "role") ? void 0 : json["role"],
    "content": !(0, runtime_1$h.exists)(json, "content") ? void 0 : json["content"]
  };
}
function MessageModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "role": value.role,
    "content": value.content
  };
}
Object.defineProperty(ChoiceModel, "__esModule", { value: true });
ChoiceModel.instanceOfChoiceModel = instanceOfChoiceModel;
ChoiceModel.ChoiceModelFromJSON = ChoiceModelFromJSON;
ChoiceModel.ChoiceModelFromJSONTyped = ChoiceModelFromJSONTyped;
ChoiceModel.ChoiceModelToJSON = ChoiceModelToJSON;
const runtime_1$g = runtime$1;
const MessageModel_1$4 = MessageModel;
function instanceOfChoiceModel(value) {
  let isInstance = true;
  return isInstance;
}
function ChoiceModelFromJSON(json) {
  return ChoiceModelFromJSONTyped(json);
}
function ChoiceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "finishReason": !(0, runtime_1$g.exists)(json, "finish_reason") ? void 0 : json["finish_reason"],
    "index": !(0, runtime_1$g.exists)(json, "index") ? void 0 : json["index"],
    "message": !(0, runtime_1$g.exists)(json, "message") ? void 0 : (0, MessageModel_1$4.MessageModelFromJSON)(json["message"])
  };
}
function ChoiceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "finish_reason": value.finishReason,
    "index": value.index,
    "message": (0, MessageModel_1$4.MessageModelToJSON)(value.message)
  };
}
var UsageModel = {};
Object.defineProperty(UsageModel, "__esModule", { value: true });
UsageModel.instanceOfUsageModel = instanceOfUsageModel;
UsageModel.UsageModelFromJSON = UsageModelFromJSON;
UsageModel.UsageModelFromJSONTyped = UsageModelFromJSONTyped;
UsageModel.UsageModelToJSON = UsageModelToJSON;
const runtime_1$f = runtime$1;
function instanceOfUsageModel(value) {
  let isInstance = true;
  return isInstance;
}
function UsageModelFromJSON(json) {
  return UsageModelFromJSONTyped(json);
}
function UsageModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "promptTokens": !(0, runtime_1$f.exists)(json, "prompt_tokens") ? void 0 : json["prompt_tokens"],
    "completionTokens": !(0, runtime_1$f.exists)(json, "completion_tokens") ? void 0 : json["completion_tokens"],
    "totalTokens": !(0, runtime_1$f.exists)(json, "total_tokens") ? void 0 : json["total_tokens"]
  };
}
function UsageModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "prompt_tokens": value.promptTokens,
    "completion_tokens": value.completionTokens,
    "total_tokens": value.totalTokens
  };
}
Object.defineProperty(ChatCompletionModel, "__esModule", { value: true });
ChatCompletionModel.instanceOfChatCompletionModel = instanceOfChatCompletionModel;
ChatCompletionModel.ChatCompletionModelFromJSON = ChatCompletionModelFromJSON;
ChatCompletionModel.ChatCompletionModelFromJSONTyped = ChatCompletionModelFromJSONTyped;
ChatCompletionModel.ChatCompletionModelToJSON = ChatCompletionModelToJSON;
const runtime_1$e = runtime$1;
const ChoiceModel_1 = ChoiceModel;
const UsageModel_1$2 = UsageModel;
function instanceOfChatCompletionModel(value) {
  let isInstance = true;
  return isInstance;
}
function ChatCompletionModelFromJSON(json) {
  return ChatCompletionModelFromJSONTyped(json);
}
function ChatCompletionModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1$e.exists)(json, "id") ? void 0 : json["id"],
    "choices": !(0, runtime_1$e.exists)(json, "choices") ? void 0 : json["choices"].map(ChoiceModel_1.ChoiceModelFromJSON),
    "model": !(0, runtime_1$e.exists)(json, "model") ? void 0 : json["model"],
    "usage": !(0, runtime_1$e.exists)(json, "usage") ? void 0 : (0, UsageModel_1$2.UsageModelFromJSON)(json["usage"])
  };
}
function ChatCompletionModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "choices": value.choices === void 0 ? void 0 : value.choices.map(ChoiceModel_1.ChoiceModelToJSON),
    "model": value.model,
    "usage": (0, UsageModel_1$2.UsageModelToJSON)(value.usage)
  };
}
var ChatModel = {};
var CitationModel = {};
var ReferenceModel = {};
var HighlightModel = {};
Object.defineProperty(HighlightModel, "__esModule", { value: true });
HighlightModel.instanceOfHighlightModel = instanceOfHighlightModel;
HighlightModel.HighlightModelFromJSON = HighlightModelFromJSON;
HighlightModel.HighlightModelFromJSONTyped = HighlightModelFromJSONTyped;
HighlightModel.HighlightModelToJSON = HighlightModelToJSON;
function instanceOfHighlightModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "content" in value;
  return isInstance;
}
function HighlightModelFromJSON(json) {
  return HighlightModelFromJSONTyped(json);
}
function HighlightModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "content": json["content"]
  };
}
function HighlightModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "content": value.content
  };
}
Object.defineProperty(ReferenceModel, "__esModule", { value: true });
ReferenceModel.instanceOfReferenceModel = instanceOfReferenceModel;
ReferenceModel.ReferenceModelFromJSON = ReferenceModelFromJSON;
ReferenceModel.ReferenceModelFromJSONTyped = ReferenceModelFromJSONTyped;
ReferenceModel.ReferenceModelToJSON = ReferenceModelToJSON;
const runtime_1$d = runtime$1;
const AssistantFileModel_1$6 = AssistantFileModel;
const HighlightModel_1 = HighlightModel;
function instanceOfReferenceModel(value) {
  let isInstance = true;
  return isInstance;
}
function ReferenceModelFromJSON(json) {
  return ReferenceModelFromJSONTyped(json);
}
function ReferenceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "file": !(0, runtime_1$d.exists)(json, "file") ? void 0 : (0, AssistantFileModel_1$6.AssistantFileModelFromJSON)(json["file"]),
    "pages": !(0, runtime_1$d.exists)(json, "pages") ? void 0 : json["pages"],
    "highlight": !(0, runtime_1$d.exists)(json, "highlight") ? void 0 : (0, HighlightModel_1.HighlightModelFromJSON)(json["highlight"])
  };
}
function ReferenceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "file": (0, AssistantFileModel_1$6.AssistantFileModelToJSON)(value.file),
    "pages": value.pages,
    "highlight": (0, HighlightModel_1.HighlightModelToJSON)(value.highlight)
  };
}
Object.defineProperty(CitationModel, "__esModule", { value: true });
CitationModel.instanceOfCitationModel = instanceOfCitationModel;
CitationModel.CitationModelFromJSON = CitationModelFromJSON;
CitationModel.CitationModelFromJSONTyped = CitationModelFromJSONTyped;
CitationModel.CitationModelToJSON = CitationModelToJSON;
const runtime_1$c = runtime$1;
const ReferenceModel_1 = ReferenceModel;
function instanceOfCitationModel(value) {
  let isInstance = true;
  return isInstance;
}
function CitationModelFromJSON(json) {
  return CitationModelFromJSONTyped(json);
}
function CitationModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "position": !(0, runtime_1$c.exists)(json, "position") ? void 0 : json["position"],
    "references": !(0, runtime_1$c.exists)(json, "references") ? void 0 : json["references"].map(ReferenceModel_1.ReferenceModelFromJSON)
  };
}
function CitationModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "position": value.position,
    "references": value.references === void 0 ? void 0 : value.references.map(ReferenceModel_1.ReferenceModelToJSON)
  };
}
Object.defineProperty(ChatModel, "__esModule", { value: true });
ChatModel.instanceOfChatModel = instanceOfChatModel;
ChatModel.ChatModelFromJSON = ChatModelFromJSON;
ChatModel.ChatModelFromJSONTyped = ChatModelFromJSONTyped;
ChatModel.ChatModelToJSON = ChatModelToJSON;
const runtime_1$b = runtime$1;
const CitationModel_1 = CitationModel;
const MessageModel_1$3 = MessageModel;
const UsageModel_1$1 = UsageModel;
function instanceOfChatModel(value) {
  let isInstance = true;
  return isInstance;
}
function ChatModelFromJSON(json) {
  return ChatModelFromJSONTyped(json);
}
function ChatModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1$b.exists)(json, "id") ? void 0 : json["id"],
    "finishReason": !(0, runtime_1$b.exists)(json, "finish_reason") ? void 0 : json["finish_reason"],
    "message": !(0, runtime_1$b.exists)(json, "message") ? void 0 : (0, MessageModel_1$3.MessageModelFromJSON)(json["message"]),
    "model": !(0, runtime_1$b.exists)(json, "model") ? void 0 : json["model"],
    "citations": !(0, runtime_1$b.exists)(json, "citations") ? void 0 : json["citations"].map(CitationModel_1.CitationModelFromJSON),
    "usage": !(0, runtime_1$b.exists)(json, "usage") ? void 0 : (0, UsageModel_1$1.UsageModelFromJSON)(json["usage"])
  };
}
function ChatModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "finish_reason": value.finishReason,
    "message": (0, MessageModel_1$3.MessageModelToJSON)(value.message),
    "model": value.model,
    "citations": value.citations === void 0 ? void 0 : value.citations.map(CitationModel_1.CitationModelToJSON),
    "usage": (0, UsageModel_1$1.UsageModelToJSON)(value.usage)
  };
}
var ChatRequest = {};
var ContextOptionsModel = {};
Object.defineProperty(ContextOptionsModel, "__esModule", { value: true });
ContextOptionsModel.instanceOfContextOptionsModel = instanceOfContextOptionsModel;
ContextOptionsModel.ContextOptionsModelFromJSON = ContextOptionsModelFromJSON;
ContextOptionsModel.ContextOptionsModelFromJSONTyped = ContextOptionsModelFromJSONTyped;
ContextOptionsModel.ContextOptionsModelToJSON = ContextOptionsModelToJSON;
const runtime_1$a = runtime$1;
function instanceOfContextOptionsModel(value) {
  let isInstance = true;
  return isInstance;
}
function ContextOptionsModelFromJSON(json) {
  return ContextOptionsModelFromJSONTyped(json);
}
function ContextOptionsModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "topK": !(0, runtime_1$a.exists)(json, "top_k") ? void 0 : json["top_k"],
    "snippetSize": !(0, runtime_1$a.exists)(json, "snippet_size") ? void 0 : json["snippet_size"],
    "multimodal": !(0, runtime_1$a.exists)(json, "multimodal") ? void 0 : json["multimodal"],
    "includeBinaryContent": !(0, runtime_1$a.exists)(json, "include_binary_content") ? void 0 : json["include_binary_content"]
  };
}
function ContextOptionsModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "top_k": value.topK,
    "snippet_size": value.snippetSize,
    "multimodal": value.multimodal,
    "include_binary_content": value.includeBinaryContent
  };
}
Object.defineProperty(ChatRequest, "__esModule", { value: true });
ChatRequest.instanceOfChatRequest = instanceOfChatRequest;
ChatRequest.ChatRequestFromJSON = ChatRequestFromJSON;
ChatRequest.ChatRequestFromJSONTyped = ChatRequestFromJSONTyped;
ChatRequest.ChatRequestToJSON = ChatRequestToJSON;
const runtime_1$9 = runtime$1;
const ContextOptionsModel_1 = ContextOptionsModel;
const MessageModel_1$2 = MessageModel;
function instanceOfChatRequest(value) {
  let isInstance = true;
  isInstance = isInstance && "messages" in value;
  return isInstance;
}
function ChatRequestFromJSON(json) {
  return ChatRequestFromJSONTyped(json);
}
function ChatRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "messages": json["messages"].map(MessageModel_1$2.MessageModelFromJSON),
    "stream": !(0, runtime_1$9.exists)(json, "stream") ? void 0 : json["stream"],
    "model": !(0, runtime_1$9.exists)(json, "model") ? void 0 : json["model"],
    "temperature": !(0, runtime_1$9.exists)(json, "temperature") ? void 0 : json["temperature"],
    "filter": !(0, runtime_1$9.exists)(json, "filter") ? void 0 : json["filter"],
    "jsonResponse": !(0, runtime_1$9.exists)(json, "json_response") ? void 0 : json["json_response"],
    "includeHighlights": !(0, runtime_1$9.exists)(json, "include_highlights") ? void 0 : json["include_highlights"],
    "contextOptions": !(0, runtime_1$9.exists)(json, "context_options") ? void 0 : (0, ContextOptionsModel_1.ContextOptionsModelFromJSON)(json["context_options"])
  };
}
function ChatRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "messages": value.messages.map(MessageModel_1$2.MessageModelToJSON),
    "stream": value.stream,
    "model": value.model,
    "temperature": value.temperature,
    "filter": value.filter,
    "json_response": value.jsonResponse,
    "include_highlights": value.includeHighlights,
    "context_options": (0, ContextOptionsModel_1.ContextOptionsModelToJSON)(value.contextOptions)
  };
}
var ChoiceChunkModel = {};
var ChoiceChunkModelDelta = {};
Object.defineProperty(ChoiceChunkModelDelta, "__esModule", { value: true });
ChoiceChunkModelDelta.instanceOfChoiceChunkModelDelta = instanceOfChoiceChunkModelDelta;
ChoiceChunkModelDelta.ChoiceChunkModelDeltaFromJSON = ChoiceChunkModelDeltaFromJSON;
ChoiceChunkModelDelta.ChoiceChunkModelDeltaFromJSONTyped = ChoiceChunkModelDeltaFromJSONTyped;
ChoiceChunkModelDelta.ChoiceChunkModelDeltaToJSON = ChoiceChunkModelDeltaToJSON;
const runtime_1$8 = runtime$1;
function instanceOfChoiceChunkModelDelta(value) {
  let isInstance = true;
  return isInstance;
}
function ChoiceChunkModelDeltaFromJSON(json) {
  return ChoiceChunkModelDeltaFromJSONTyped(json);
}
function ChoiceChunkModelDeltaFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "role": !(0, runtime_1$8.exists)(json, "role") ? void 0 : json["role"],
    "content": !(0, runtime_1$8.exists)(json, "content") ? void 0 : json["content"]
  };
}
function ChoiceChunkModelDeltaToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "role": value.role,
    "content": value.content
  };
}
Object.defineProperty(ChoiceChunkModel, "__esModule", { value: true });
ChoiceChunkModel.instanceOfChoiceChunkModel = instanceOfChoiceChunkModel;
ChoiceChunkModel.ChoiceChunkModelFromJSON = ChoiceChunkModelFromJSON;
ChoiceChunkModel.ChoiceChunkModelFromJSONTyped = ChoiceChunkModelFromJSONTyped;
ChoiceChunkModel.ChoiceChunkModelToJSON = ChoiceChunkModelToJSON;
const runtime_1$7 = runtime$1;
const ChoiceChunkModelDelta_1 = ChoiceChunkModelDelta;
function instanceOfChoiceChunkModel(value) {
  let isInstance = true;
  return isInstance;
}
function ChoiceChunkModelFromJSON(json) {
  return ChoiceChunkModelFromJSONTyped(json);
}
function ChoiceChunkModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "finishReason": !(0, runtime_1$7.exists)(json, "finish_reason") ? void 0 : json["finish_reason"],
    "index": !(0, runtime_1$7.exists)(json, "index") ? void 0 : json["index"],
    "delta": !(0, runtime_1$7.exists)(json, "delta") ? void 0 : (0, ChoiceChunkModelDelta_1.ChoiceChunkModelDeltaFromJSON)(json["delta"])
  };
}
function ChoiceChunkModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "finish_reason": value.finishReason,
    "index": value.index,
    "delta": (0, ChoiceChunkModelDelta_1.ChoiceChunkModelDeltaToJSON)(value.delta)
  };
}
var ContextModel = {};
var SnippetModel = {};
var MultiModalSnippetModel = {};
var MultiModalContentBlocksModel = {};
var MultiModalContentImageBlockModel = {};
var ImageModel = {};
Object.defineProperty(ImageModel, "__esModule", { value: true });
ImageModel.instanceOfImageModel = instanceOfImageModel;
ImageModel.ImageModelFromJSON = ImageModelFromJSON;
ImageModel.ImageModelFromJSONTyped = ImageModelFromJSONTyped;
ImageModel.ImageModelToJSON = ImageModelToJSON;
function instanceOfImageModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "mimeType" in value;
  isInstance = isInstance && "data" in value;
  return isInstance;
}
function ImageModelFromJSON(json) {
  return ImageModelFromJSONTyped(json);
}
function ImageModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "mimeType": json["mime_type"],
    "data": json["data"]
  };
}
function ImageModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "mime_type": value.mimeType,
    "data": value.data
  };
}
Object.defineProperty(MultiModalContentImageBlockModel, "__esModule", { value: true });
MultiModalContentImageBlockModel.instanceOfMultiModalContentImageBlockModel = instanceOfMultiModalContentImageBlockModel;
MultiModalContentImageBlockModel.MultiModalContentImageBlockModelFromJSON = MultiModalContentImageBlockModelFromJSON;
MultiModalContentImageBlockModel.MultiModalContentImageBlockModelFromJSONTyped = MultiModalContentImageBlockModelFromJSONTyped;
MultiModalContentImageBlockModel.MultiModalContentImageBlockModelToJSON = MultiModalContentImageBlockModelToJSON;
const runtime_1$6 = runtime$1;
const ImageModel_1 = ImageModel;
function instanceOfMultiModalContentImageBlockModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "caption" in value;
  return isInstance;
}
function MultiModalContentImageBlockModelFromJSON(json) {
  return MultiModalContentImageBlockModelFromJSONTyped(json);
}
function MultiModalContentImageBlockModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "caption": json["caption"],
    "image": !(0, runtime_1$6.exists)(json, "image") ? void 0 : (0, ImageModel_1.ImageModelFromJSON)(json["image"])
  };
}
function MultiModalContentImageBlockModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "caption": value.caption,
    "image": (0, ImageModel_1.ImageModelToJSON)(value.image)
  };
}
var MultiModalContentTextBlockModel = {};
Object.defineProperty(MultiModalContentTextBlockModel, "__esModule", { value: true });
MultiModalContentTextBlockModel.instanceOfMultiModalContentTextBlockModel = instanceOfMultiModalContentTextBlockModel;
MultiModalContentTextBlockModel.MultiModalContentTextBlockModelFromJSON = MultiModalContentTextBlockModelFromJSON;
MultiModalContentTextBlockModel.MultiModalContentTextBlockModelFromJSONTyped = MultiModalContentTextBlockModelFromJSONTyped;
MultiModalContentTextBlockModel.MultiModalContentTextBlockModelToJSON = MultiModalContentTextBlockModelToJSON;
function instanceOfMultiModalContentTextBlockModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "text" in value;
  return isInstance;
}
function MultiModalContentTextBlockModelFromJSON(json) {
  return MultiModalContentTextBlockModelFromJSONTyped(json);
}
function MultiModalContentTextBlockModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "text": json["text"]
  };
}
function MultiModalContentTextBlockModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "text": value.text
  };
}
Object.defineProperty(MultiModalContentBlocksModel, "__esModule", { value: true });
MultiModalContentBlocksModel.MultiModalContentBlocksModelFromJSON = MultiModalContentBlocksModelFromJSON;
MultiModalContentBlocksModel.MultiModalContentBlocksModelFromJSONTyped = MultiModalContentBlocksModelFromJSONTyped;
MultiModalContentBlocksModel.MultiModalContentBlocksModelToJSON = MultiModalContentBlocksModelToJSON;
const MultiModalContentImageBlockModel_1 = MultiModalContentImageBlockModel;
const MultiModalContentTextBlockModel_1 = MultiModalContentTextBlockModel;
function MultiModalContentBlocksModelFromJSON(json) {
  return MultiModalContentBlocksModelFromJSONTyped(json);
}
function MultiModalContentBlocksModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  switch (json["type"]) {
    case "image":
      return { ...(0, MultiModalContentImageBlockModel_1.MultiModalContentImageBlockModelFromJSONTyped)(json, true), type: "image" };
    case "text":
      return { ...(0, MultiModalContentTextBlockModel_1.MultiModalContentTextBlockModelFromJSONTyped)(json, true), type: "text" };
    default:
      throw new Error(`No variant of MultiModalContentBlocksModel exists with 'type=${json["type"]}'`);
  }
}
function MultiModalContentBlocksModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  switch (value["type"]) {
    case "image":
      return (0, MultiModalContentImageBlockModel_1.MultiModalContentImageBlockModelToJSON)(value);
    case "text":
      return (0, MultiModalContentTextBlockModel_1.MultiModalContentTextBlockModelToJSON)(value);
    default:
      throw new Error(`No variant of MultiModalContentBlocksModel exists with 'type=${value["type"]}'`);
  }
}
var TypedReferenceModel = {};
var DocxReferenceModel = {};
Object.defineProperty(DocxReferenceModel, "__esModule", { value: true });
DocxReferenceModel.instanceOfDocxReferenceModel = instanceOfDocxReferenceModel;
DocxReferenceModel.DocxReferenceModelFromJSON = DocxReferenceModelFromJSON;
DocxReferenceModel.DocxReferenceModelFromJSONTyped = DocxReferenceModelFromJSONTyped;
DocxReferenceModel.DocxReferenceModelToJSON = DocxReferenceModelToJSON;
const AssistantFileModel_1$5 = AssistantFileModel;
function instanceOfDocxReferenceModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "file" in value;
  isInstance = isInstance && "pages" in value;
  return isInstance;
}
function DocxReferenceModelFromJSON(json) {
  return DocxReferenceModelFromJSONTyped(json);
}
function DocxReferenceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "file": (0, AssistantFileModel_1$5.AssistantFileModelFromJSON)(json["file"]),
    "pages": json["pages"]
  };
}
function DocxReferenceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "file": (0, AssistantFileModel_1$5.AssistantFileModelToJSON)(value.file),
    "pages": value.pages
  };
}
var JsonReferenceModel = {};
Object.defineProperty(JsonReferenceModel, "__esModule", { value: true });
JsonReferenceModel.instanceOfJsonReferenceModel = instanceOfJsonReferenceModel;
JsonReferenceModel.JsonReferenceModelFromJSON = JsonReferenceModelFromJSON;
JsonReferenceModel.JsonReferenceModelFromJSONTyped = JsonReferenceModelFromJSONTyped;
JsonReferenceModel.JsonReferenceModelToJSON = JsonReferenceModelToJSON;
const AssistantFileModel_1$4 = AssistantFileModel;
function instanceOfJsonReferenceModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "file" in value;
  return isInstance;
}
function JsonReferenceModelFromJSON(json) {
  return JsonReferenceModelFromJSONTyped(json);
}
function JsonReferenceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "file": (0, AssistantFileModel_1$4.AssistantFileModelFromJSON)(json["file"])
  };
}
function JsonReferenceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "file": (0, AssistantFileModel_1$4.AssistantFileModelToJSON)(value.file)
  };
}
var MarkdownReferenceModel = {};
Object.defineProperty(MarkdownReferenceModel, "__esModule", { value: true });
MarkdownReferenceModel.instanceOfMarkdownReferenceModel = instanceOfMarkdownReferenceModel;
MarkdownReferenceModel.MarkdownReferenceModelFromJSON = MarkdownReferenceModelFromJSON;
MarkdownReferenceModel.MarkdownReferenceModelFromJSONTyped = MarkdownReferenceModelFromJSONTyped;
MarkdownReferenceModel.MarkdownReferenceModelToJSON = MarkdownReferenceModelToJSON;
const AssistantFileModel_1$3 = AssistantFileModel;
function instanceOfMarkdownReferenceModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "file" in value;
  return isInstance;
}
function MarkdownReferenceModelFromJSON(json) {
  return MarkdownReferenceModelFromJSONTyped(json);
}
function MarkdownReferenceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "file": (0, AssistantFileModel_1$3.AssistantFileModelFromJSON)(json["file"])
  };
}
function MarkdownReferenceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "file": (0, AssistantFileModel_1$3.AssistantFileModelToJSON)(value.file)
  };
}
var PdfReferenceModel = {};
Object.defineProperty(PdfReferenceModel, "__esModule", { value: true });
PdfReferenceModel.instanceOfPdfReferenceModel = instanceOfPdfReferenceModel;
PdfReferenceModel.PdfReferenceModelFromJSON = PdfReferenceModelFromJSON;
PdfReferenceModel.PdfReferenceModelFromJSONTyped = PdfReferenceModelFromJSONTyped;
PdfReferenceModel.PdfReferenceModelToJSON = PdfReferenceModelToJSON;
const AssistantFileModel_1$2 = AssistantFileModel;
function instanceOfPdfReferenceModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "file" in value;
  isInstance = isInstance && "pages" in value;
  return isInstance;
}
function PdfReferenceModelFromJSON(json) {
  return PdfReferenceModelFromJSONTyped(json);
}
function PdfReferenceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "file": (0, AssistantFileModel_1$2.AssistantFileModelFromJSON)(json["file"]),
    "pages": json["pages"]
  };
}
function PdfReferenceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "file": (0, AssistantFileModel_1$2.AssistantFileModelToJSON)(value.file),
    "pages": value.pages
  };
}
var TextReferenceModel = {};
Object.defineProperty(TextReferenceModel, "__esModule", { value: true });
TextReferenceModel.instanceOfTextReferenceModel = instanceOfTextReferenceModel;
TextReferenceModel.TextReferenceModelFromJSON = TextReferenceModelFromJSON;
TextReferenceModel.TextReferenceModelFromJSONTyped = TextReferenceModelFromJSONTyped;
TextReferenceModel.TextReferenceModelToJSON = TextReferenceModelToJSON;
const AssistantFileModel_1$1 = AssistantFileModel;
function instanceOfTextReferenceModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "file" in value;
  return isInstance;
}
function TextReferenceModelFromJSON(json) {
  return TextReferenceModelFromJSONTyped(json);
}
function TextReferenceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "file": (0, AssistantFileModel_1$1.AssistantFileModelFromJSON)(json["file"])
  };
}
function TextReferenceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "file": (0, AssistantFileModel_1$1.AssistantFileModelToJSON)(value.file)
  };
}
Object.defineProperty(TypedReferenceModel, "__esModule", { value: true });
TypedReferenceModel.TypedReferenceModelFromJSON = TypedReferenceModelFromJSON;
TypedReferenceModel.TypedReferenceModelFromJSONTyped = TypedReferenceModelFromJSONTyped;
TypedReferenceModel.TypedReferenceModelToJSON = TypedReferenceModelToJSON;
const DocxReferenceModel_1 = DocxReferenceModel;
const JsonReferenceModel_1 = JsonReferenceModel;
const MarkdownReferenceModel_1 = MarkdownReferenceModel;
const PdfReferenceModel_1 = PdfReferenceModel;
const TextReferenceModel_1 = TextReferenceModel;
function TypedReferenceModelFromJSON(json) {
  return TypedReferenceModelFromJSONTyped(json);
}
function TypedReferenceModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  switch (json["type"]) {
    case "doc_x":
      return { ...(0, DocxReferenceModel_1.DocxReferenceModelFromJSONTyped)(json, true), type: "doc_x" };
    case "json":
      return { ...(0, JsonReferenceModel_1.JsonReferenceModelFromJSONTyped)(json, true), type: "json" };
    case "markdown":
      return { ...(0, MarkdownReferenceModel_1.MarkdownReferenceModelFromJSONTyped)(json, true), type: "markdown" };
    case "pdf":
      return { ...(0, PdfReferenceModel_1.PdfReferenceModelFromJSONTyped)(json, true), type: "pdf" };
    case "text":
      return { ...(0, TextReferenceModel_1.TextReferenceModelFromJSONTyped)(json, true), type: "text" };
    default:
      throw new Error(`No variant of TypedReferenceModel exists with 'type=${json["type"]}'`);
  }
}
function TypedReferenceModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  switch (value["type"]) {
    case "doc_x":
      return (0, DocxReferenceModel_1.DocxReferenceModelToJSON)(value);
    case "json":
      return (0, JsonReferenceModel_1.JsonReferenceModelToJSON)(value);
    case "markdown":
      return (0, MarkdownReferenceModel_1.MarkdownReferenceModelToJSON)(value);
    case "pdf":
      return (0, PdfReferenceModel_1.PdfReferenceModelToJSON)(value);
    case "text":
      return (0, TextReferenceModel_1.TextReferenceModelToJSON)(value);
    default:
      throw new Error(`No variant of TypedReferenceModel exists with 'type=${value["type"]}'`);
  }
}
Object.defineProperty(MultiModalSnippetModel, "__esModule", { value: true });
MultiModalSnippetModel.instanceOfMultiModalSnippetModel = instanceOfMultiModalSnippetModel;
MultiModalSnippetModel.MultiModalSnippetModelFromJSON = MultiModalSnippetModelFromJSON;
MultiModalSnippetModel.MultiModalSnippetModelFromJSONTyped = MultiModalSnippetModelFromJSONTyped;
MultiModalSnippetModel.MultiModalSnippetModelToJSON = MultiModalSnippetModelToJSON;
const MultiModalContentBlocksModel_1 = MultiModalContentBlocksModel;
const TypedReferenceModel_1$1 = TypedReferenceModel;
function instanceOfMultiModalSnippetModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "content" in value;
  isInstance = isInstance && "score" in value;
  isInstance = isInstance && "reference" in value;
  return isInstance;
}
function MultiModalSnippetModelFromJSON(json) {
  return MultiModalSnippetModelFromJSONTyped(json);
}
function MultiModalSnippetModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "content": json["content"].map(MultiModalContentBlocksModel_1.MultiModalContentBlocksModelFromJSON),
    "score": json["score"],
    "reference": (0, TypedReferenceModel_1$1.TypedReferenceModelFromJSON)(json["reference"])
  };
}
function MultiModalSnippetModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "content": value.content.map(MultiModalContentBlocksModel_1.MultiModalContentBlocksModelToJSON),
    "score": value.score,
    "reference": (0, TypedReferenceModel_1$1.TypedReferenceModelToJSON)(value.reference)
  };
}
var TextSnippetModel = {};
Object.defineProperty(TextSnippetModel, "__esModule", { value: true });
TextSnippetModel.instanceOfTextSnippetModel = instanceOfTextSnippetModel;
TextSnippetModel.TextSnippetModelFromJSON = TextSnippetModelFromJSON;
TextSnippetModel.TextSnippetModelFromJSONTyped = TextSnippetModelFromJSONTyped;
TextSnippetModel.TextSnippetModelToJSON = TextSnippetModelToJSON;
const TypedReferenceModel_1 = TypedReferenceModel;
function instanceOfTextSnippetModel(value) {
  let isInstance = true;
  isInstance = isInstance && "type" in value;
  isInstance = isInstance && "content" in value;
  isInstance = isInstance && "score" in value;
  isInstance = isInstance && "reference" in value;
  return isInstance;
}
function TextSnippetModelFromJSON(json) {
  return TextSnippetModelFromJSONTyped(json);
}
function TextSnippetModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "type": json["type"],
    "content": json["content"],
    "score": json["score"],
    "reference": (0, TypedReferenceModel_1.TypedReferenceModelFromJSON)(json["reference"])
  };
}
function TextSnippetModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "type": value.type,
    "content": value.content,
    "score": value.score,
    "reference": (0, TypedReferenceModel_1.TypedReferenceModelToJSON)(value.reference)
  };
}
Object.defineProperty(SnippetModel, "__esModule", { value: true });
SnippetModel.SnippetModelFromJSON = SnippetModelFromJSON;
SnippetModel.SnippetModelFromJSONTyped = SnippetModelFromJSONTyped;
SnippetModel.SnippetModelToJSON = SnippetModelToJSON;
const MultiModalSnippetModel_1 = MultiModalSnippetModel;
const TextSnippetModel_1 = TextSnippetModel;
function SnippetModelFromJSON(json) {
  return SnippetModelFromJSONTyped(json);
}
function SnippetModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  switch (json["type"]) {
    case "multimodal":
      return { ...(0, MultiModalSnippetModel_1.MultiModalSnippetModelFromJSONTyped)(json, true), type: "multimodal" };
    case "text":
      return { ...(0, TextSnippetModel_1.TextSnippetModelFromJSONTyped)(json, true), type: "text" };
    default:
      throw new Error(`No variant of SnippetModel exists with 'type=${json["type"]}'`);
  }
}
function SnippetModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  switch (value["type"]) {
    case "multimodal":
      return (0, MultiModalSnippetModel_1.MultiModalSnippetModelToJSON)(value);
    case "text":
      return (0, TextSnippetModel_1.TextSnippetModelToJSON)(value);
    default:
      throw new Error(`No variant of SnippetModel exists with 'type=${value["type"]}'`);
  }
}
Object.defineProperty(ContextModel, "__esModule", { value: true });
ContextModel.instanceOfContextModel = instanceOfContextModel;
ContextModel.ContextModelFromJSON = ContextModelFromJSON;
ContextModel.ContextModelFromJSONTyped = ContextModelFromJSONTyped;
ContextModel.ContextModelToJSON = ContextModelToJSON;
const runtime_1$5 = runtime$1;
const SnippetModel_1 = SnippetModel;
const UsageModel_1 = UsageModel;
function instanceOfContextModel(value) {
  let isInstance = true;
  isInstance = isInstance && "snippets" in value;
  isInstance = isInstance && "usage" in value;
  return isInstance;
}
function ContextModelFromJSON(json) {
  return ContextModelFromJSONTyped(json);
}
function ContextModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1$5.exists)(json, "id") ? void 0 : json["id"],
    "snippets": json["snippets"].map(SnippetModel_1.SnippetModelFromJSON),
    "usage": (0, UsageModel_1.UsageModelFromJSON)(json["usage"])
  };
}
function ContextModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "snippets": value.snippets.map(SnippetModel_1.SnippetModelToJSON),
    "usage": (0, UsageModel_1.UsageModelToJSON)(value.usage)
  };
}
var ContextRequest = {};
Object.defineProperty(ContextRequest, "__esModule", { value: true });
ContextRequest.instanceOfContextRequest = instanceOfContextRequest;
ContextRequest.ContextRequestFromJSON = ContextRequestFromJSON;
ContextRequest.ContextRequestFromJSONTyped = ContextRequestFromJSONTyped;
ContextRequest.ContextRequestToJSON = ContextRequestToJSON;
const runtime_1$4 = runtime$1;
const MessageModel_1$1 = MessageModel;
function instanceOfContextRequest(value) {
  let isInstance = true;
  return isInstance;
}
function ContextRequestFromJSON(json) {
  return ContextRequestFromJSONTyped(json);
}
function ContextRequestFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "query": !(0, runtime_1$4.exists)(json, "query") ? void 0 : json["query"],
    "filter": !(0, runtime_1$4.exists)(json, "filter") ? void 0 : json["filter"],
    "messages": !(0, runtime_1$4.exists)(json, "messages") ? void 0 : json["messages"].map(MessageModel_1$1.MessageModelFromJSON),
    "topK": !(0, runtime_1$4.exists)(json, "top_k") ? void 0 : json["top_k"],
    "snippetSize": !(0, runtime_1$4.exists)(json, "snippet_size") ? void 0 : json["snippet_size"],
    "multimodal": !(0, runtime_1$4.exists)(json, "multimodal") ? void 0 : json["multimodal"],
    "includeBinaryContent": !(0, runtime_1$4.exists)(json, "include_binary_content") ? void 0 : json["include_binary_content"]
  };
}
function ContextRequestToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "query": value.query,
    "filter": value.filter,
    "messages": value.messages === void 0 ? void 0 : value.messages.map(MessageModel_1$1.MessageModelToJSON),
    "top_k": value.topK,
    "snippet_size": value.snippetSize,
    "multimodal": value.multimodal,
    "include_binary_content": value.includeBinaryContent
  };
}
var ErrorResponse = {};
var ErrorResponseError = {};
Object.defineProperty(ErrorResponseError, "__esModule", { value: true });
ErrorResponseError.instanceOfErrorResponseError = instanceOfErrorResponseError;
ErrorResponseError.ErrorResponseErrorFromJSON = ErrorResponseErrorFromJSON;
ErrorResponseError.ErrorResponseErrorFromJSONTyped = ErrorResponseErrorFromJSONTyped;
ErrorResponseError.ErrorResponseErrorToJSON = ErrorResponseErrorToJSON;
const runtime_1$3 = runtime$1;
function instanceOfErrorResponseError(value) {
  let isInstance = true;
  isInstance = isInstance && "code" in value;
  isInstance = isInstance && "message" in value;
  return isInstance;
}
function ErrorResponseErrorFromJSON(json) {
  return ErrorResponseErrorFromJSONTyped(json);
}
function ErrorResponseErrorFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "code": json["code"],
    "message": json["message"],
    "details": !(0, runtime_1$3.exists)(json, "details") ? void 0 : json["details"]
  };
}
function ErrorResponseErrorToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "code": value.code,
    "message": value.message,
    "details": value.details
  };
}
Object.defineProperty(ErrorResponse, "__esModule", { value: true });
ErrorResponse.instanceOfErrorResponse = instanceOfErrorResponse;
ErrorResponse.ErrorResponseFromJSON = ErrorResponseFromJSON;
ErrorResponse.ErrorResponseFromJSONTyped = ErrorResponseFromJSONTyped;
ErrorResponse.ErrorResponseToJSON = ErrorResponseToJSON;
const ErrorResponseError_1 = ErrorResponseError;
function instanceOfErrorResponse(value) {
  let isInstance = true;
  isInstance = isInstance && "status" in value;
  isInstance = isInstance && "error" in value;
  return isInstance;
}
function ErrorResponseFromJSON(json) {
  return ErrorResponseFromJSONTyped(json);
}
function ErrorResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "status": json["status"],
    "error": (0, ErrorResponseError_1.ErrorResponseErrorFromJSON)(json["error"])
  };
}
function ErrorResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "status": value.status,
    "error": (0, ErrorResponseError_1.ErrorResponseErrorToJSON)(value.error)
  };
}
var ListFiles200Response = {};
Object.defineProperty(ListFiles200Response, "__esModule", { value: true });
ListFiles200Response.instanceOfListFiles200Response = instanceOfListFiles200Response;
ListFiles200Response.ListFiles200ResponseFromJSON = ListFiles200ResponseFromJSON;
ListFiles200Response.ListFiles200ResponseFromJSONTyped = ListFiles200ResponseFromJSONTyped;
ListFiles200Response.ListFiles200ResponseToJSON = ListFiles200ResponseToJSON;
const runtime_1$2 = runtime$1;
const AssistantFileModel_1 = AssistantFileModel;
function instanceOfListFiles200Response(value) {
  let isInstance = true;
  return isInstance;
}
function ListFiles200ResponseFromJSON(json) {
  return ListFiles200ResponseFromJSONTyped(json);
}
function ListFiles200ResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "files": !(0, runtime_1$2.exists)(json, "files") ? void 0 : json["files"].map(AssistantFileModel_1.AssistantFileModelFromJSON)
  };
}
function ListFiles200ResponseToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "files": value.files === void 0 ? void 0 : value.files.map(AssistantFileModel_1.AssistantFileModelToJSON)
  };
}
var SearchCompletions = {};
Object.defineProperty(SearchCompletions, "__esModule", { value: true });
SearchCompletions.instanceOfSearchCompletions = instanceOfSearchCompletions;
SearchCompletions.SearchCompletionsFromJSON = SearchCompletionsFromJSON;
SearchCompletions.SearchCompletionsFromJSONTyped = SearchCompletionsFromJSONTyped;
SearchCompletions.SearchCompletionsToJSON = SearchCompletionsToJSON;
const runtime_1$1 = runtime$1;
const MessageModel_1 = MessageModel;
function instanceOfSearchCompletions(value) {
  let isInstance = true;
  isInstance = isInstance && "messages" in value;
  return isInstance;
}
function SearchCompletionsFromJSON(json) {
  return SearchCompletionsFromJSONTyped(json);
}
function SearchCompletionsFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "messages": json["messages"].map(MessageModel_1.MessageModelFromJSON),
    "stream": !(0, runtime_1$1.exists)(json, "stream") ? void 0 : json["stream"],
    "model": !(0, runtime_1$1.exists)(json, "model") ? void 0 : json["model"],
    "temperature": !(0, runtime_1$1.exists)(json, "temperature") ? void 0 : json["temperature"],
    "filter": !(0, runtime_1$1.exists)(json, "filter") ? void 0 : json["filter"]
  };
}
function SearchCompletionsToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "messages": value.messages.map(MessageModel_1.MessageModelToJSON),
    "stream": value.stream,
    "model": value.model,
    "temperature": value.temperature,
    "filter": value.filter
  };
}
var StreamChatCompletionChunkModel = {};
Object.defineProperty(StreamChatCompletionChunkModel, "__esModule", { value: true });
StreamChatCompletionChunkModel.instanceOfStreamChatCompletionChunkModel = instanceOfStreamChatCompletionChunkModel;
StreamChatCompletionChunkModel.StreamChatCompletionChunkModelFromJSON = StreamChatCompletionChunkModelFromJSON;
StreamChatCompletionChunkModel.StreamChatCompletionChunkModelFromJSONTyped = StreamChatCompletionChunkModelFromJSONTyped;
StreamChatCompletionChunkModel.StreamChatCompletionChunkModelToJSON = StreamChatCompletionChunkModelToJSON;
const runtime_1 = runtime$1;
const ChoiceChunkModel_1 = ChoiceChunkModel;
function instanceOfStreamChatCompletionChunkModel(value) {
  let isInstance = true;
  return isInstance;
}
function StreamChatCompletionChunkModelFromJSON(json) {
  return StreamChatCompletionChunkModelFromJSONTyped(json);
}
function StreamChatCompletionChunkModelFromJSONTyped(json, ignoreDiscriminator) {
  if (json === void 0 || json === null) {
    return json;
  }
  return {
    "id": !(0, runtime_1.exists)(json, "id") ? void 0 : json["id"],
    "choices": !(0, runtime_1.exists)(json, "choices") ? void 0 : json["choices"].map(ChoiceChunkModel_1.ChoiceChunkModelFromJSON),
    "model": !(0, runtime_1.exists)(json, "model") ? void 0 : json["model"]
  };
}
function StreamChatCompletionChunkModelToJSON(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  return {
    "id": value.id,
    "choices": value.choices === void 0 ? void 0 : value.choices.map(ChoiceChunkModel_1.ChoiceChunkModelToJSON),
    "model": value.model
  };
}
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(AssistantFileModel, exports);
  __exportStar(ChatCompletionModel, exports);
  __exportStar(ChatModel, exports);
  __exportStar(ChatRequest, exports);
  __exportStar(ChoiceChunkModel, exports);
  __exportStar(ChoiceChunkModelDelta, exports);
  __exportStar(ChoiceModel, exports);
  __exportStar(CitationModel, exports);
  __exportStar(ContextModel, exports);
  __exportStar(ContextOptionsModel, exports);
  __exportStar(ContextRequest, exports);
  __exportStar(DocxReferenceModel, exports);
  __exportStar(ErrorResponse, exports);
  __exportStar(ErrorResponseError, exports);
  __exportStar(HighlightModel, exports);
  __exportStar(ImageModel, exports);
  __exportStar(JsonReferenceModel, exports);
  __exportStar(ListFiles200Response, exports);
  __exportStar(MarkdownReferenceModel, exports);
  __exportStar(MessageModel, exports);
  __exportStar(MultiModalContentBlocksModel, exports);
  __exportStar(MultiModalContentImageBlockModel, exports);
  __exportStar(MultiModalContentTextBlockModel, exports);
  __exportStar(MultiModalSnippetModel, exports);
  __exportStar(PdfReferenceModel, exports);
  __exportStar(ReferenceModel, exports);
  __exportStar(SearchCompletions, exports);
  __exportStar(SnippetModel, exports);
  __exportStar(StreamChatCompletionChunkModel, exports);
  __exportStar(TextReferenceModel, exports);
  __exportStar(TextSnippetModel, exports);
  __exportStar(TypedReferenceModel, exports);
  __exportStar(UsageModel, exports);
})(models);
var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
  }
  __setModuleDefault(result, mod);
  return result;
};
Object.defineProperty(ManageAssistantsApi$1, "__esModule", { value: true });
ManageAssistantsApi$1.ManageAssistantsApi = void 0;
const runtime = __importStar(runtime$1);
const index_1 = models;
class ManageAssistantsApi2 extends runtime.BaseAPI {
  /**
   * Chat with an assistant and get back citations in structured form.   This is the recommended way to chat with an assistant, as it offers more functionality and control over the assistant\'s responses and references than the OpenAI-compatible chat interface.  For guidance and examples, see [Chat with an assistant](https://docs.pinecone.io/guides/assistant/chat-with-assistant).
   * Chat with an assistant
   */
  async chatAssistantRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling chatAssistant.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling chatAssistant.");
    }
    if (requestParameters.chatRequest === null || requestParameters.chatRequest === void 0) {
      throw new runtime.RequiredError("chatRequest", "Required parameter requestParameters.chatRequest was null or undefined when calling chatAssistant.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/chat/{assistant_name}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1.ChatRequestToJSON)(requestParameters.chatRequest)
    }, initOverrides);
    return new runtime.JSONApiResponse(response, (jsonValue) => (0, index_1.ChatModelFromJSON)(jsonValue));
  }
  /**
   * Chat with an assistant and get back citations in structured form.   This is the recommended way to chat with an assistant, as it offers more functionality and control over the assistant\'s responses and references than the OpenAI-compatible chat interface.  For guidance and examples, see [Chat with an assistant](https://docs.pinecone.io/guides/assistant/chat-with-assistant).
   * Chat with an assistant
   */
  async chatAssistant(requestParameters, initOverrides) {
    const response = await this.chatAssistantRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Chat with an assistant. This endpoint is based on the OpenAI Chat Completion API, a commonly used and adopted API.   It is useful if you need inline citations or OpenAI-compatible responses, but has limited functionality compared to the standard chat interface.  For guidance and examples, see [Chat with an assistant](https://docs.pinecone.io/guides/assistant/chat-with-assistant).
   * Chat through an OpenAI-compatible interface
   */
  async chatCompletionAssistantRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling chatCompletionAssistant.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling chatCompletionAssistant.");
    }
    if (requestParameters.searchCompletions === null || requestParameters.searchCompletions === void 0) {
      throw new runtime.RequiredError("searchCompletions", "Required parameter requestParameters.searchCompletions was null or undefined when calling chatCompletionAssistant.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/chat/{assistant_name}/chat/completions`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1.SearchCompletionsToJSON)(requestParameters.searchCompletions)
    }, initOverrides);
    return new runtime.JSONApiResponse(response, (jsonValue) => (0, index_1.ChatCompletionModelFromJSON)(jsonValue));
  }
  /**
   * Chat with an assistant. This endpoint is based on the OpenAI Chat Completion API, a commonly used and adopted API.   It is useful if you need inline citations or OpenAI-compatible responses, but has limited functionality compared to the standard chat interface.  For guidance and examples, see [Chat with an assistant](https://docs.pinecone.io/guides/assistant/chat-with-assistant).
   * Chat through an OpenAI-compatible interface
   */
  async chatCompletionAssistant(requestParameters, initOverrides) {
    const response = await this.chatCompletionAssistantRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Retrieve context snippets from an assistant to use as part of RAG or any agentic flow.  For guidance and examples, see [Retrieve context snippets](https://docs.pinecone.io/guides/assistant/retrieve-context-snippets).
   * Retrieve context from an assistant
   */
  async contextAssistantRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling contextAssistant.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling contextAssistant.");
    }
    if (requestParameters.contextRequest === null || requestParameters.contextRequest === void 0) {
      throw new runtime.RequiredError("contextRequest", "Required parameter requestParameters.contextRequest was null or undefined when calling contextAssistant.");
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/chat/{assistant_name}/context`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: (0, index_1.ContextRequestToJSON)(requestParameters.contextRequest)
    }, initOverrides);
    return new runtime.JSONApiResponse(response, (jsonValue) => (0, index_1.ContextModelFromJSON)(jsonValue));
  }
  /**
   * Retrieve context snippets from an assistant to use as part of RAG or any agentic flow.  For guidance and examples, see [Retrieve context snippets](https://docs.pinecone.io/guides/assistant/retrieve-context-snippets).
   * Retrieve context from an assistant
   */
  async contextAssistant(requestParameters, initOverrides) {
    const response = await this.contextAssistantRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Delete an uploaded file from an assistant.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#delete-a-file).
   * Delete an uploaded file
   */
  async deleteFileRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling deleteFile.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling deleteFile.");
    }
    if (requestParameters.assistantFileId === null || requestParameters.assistantFileId === void 0) {
      throw new runtime.RequiredError("assistantFileId", "Required parameter requestParameters.assistantFileId was null or undefined when calling deleteFile.");
    }
    const queryParameters = {};
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/files/{assistant_name}/{assistant_file_id}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))).replace(`{${"assistant_file_id"}}`, encodeURIComponent(String(requestParameters.assistantFileId))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime.VoidApiResponse(response);
  }
  /**
   * Delete an uploaded file from an assistant.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#delete-a-file).
   * Delete an uploaded file
   */
  async deleteFile(requestParameters, initOverrides) {
    await this.deleteFileRaw(requestParameters, initOverrides);
  }
  /**
   * Get the status and metadata of a file uploaded to an assistant.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#get-the-status-of-a-file).
   * Describe a file upload
   */
  async describeFileRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling describeFile.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling describeFile.");
    }
    if (requestParameters.assistantFileId === null || requestParameters.assistantFileId === void 0) {
      throw new runtime.RequiredError("assistantFileId", "Required parameter requestParameters.assistantFileId was null or undefined when calling describeFile.");
    }
    const queryParameters = {};
    if (requestParameters.includeUrl !== void 0) {
      queryParameters["include_url"] = requestParameters.includeUrl;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/files/{assistant_name}/{assistant_file_id}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))).replace(`{${"assistant_file_id"}}`, encodeURIComponent(String(requestParameters.assistantFileId))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime.JSONApiResponse(response, (jsonValue) => (0, index_1.AssistantFileModelFromJSON)(jsonValue));
  }
  /**
   * Get the status and metadata of a file uploaded to an assistant.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#get-the-status-of-a-file).
   * Describe a file upload
   */
  async describeFile(requestParameters, initOverrides) {
    const response = await this.describeFileRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List all files in an assistant, with an option to filter files with metadata.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#list-files-in-an-assistant).
   * List Files
   */
  async listFilesRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling listFiles.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling listFiles.");
    }
    const queryParameters = {};
    if (requestParameters.filter !== void 0) {
      queryParameters["filter"] = requestParameters.filter;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const response = await this.request({
      path: `/files/{assistant_name}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new runtime.JSONApiResponse(response, (jsonValue) => (0, index_1.ListFiles200ResponseFromJSON)(jsonValue));
  }
  /**
   * List all files in an assistant, with an option to filter files with metadata.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#list-files-in-an-assistant).
   * List Files
   */
  async listFiles(requestParameters, initOverrides) {
    const response = await this.listFilesRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Upload a file to the specified assistant.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#upload-a-local-file).
   * Upload file to assistant
   */
  async uploadFileRaw(requestParameters, initOverrides) {
    if (requestParameters.xPineconeApiVersion === null || requestParameters.xPineconeApiVersion === void 0) {
      throw new runtime.RequiredError("xPineconeApiVersion", "Required parameter requestParameters.xPineconeApiVersion was null or undefined when calling uploadFile.");
    }
    if (requestParameters.assistantName === null || requestParameters.assistantName === void 0) {
      throw new runtime.RequiredError("assistantName", "Required parameter requestParameters.assistantName was null or undefined when calling uploadFile.");
    }
    if (requestParameters.file === null || requestParameters.file === void 0) {
      throw new runtime.RequiredError("file", "Required parameter requestParameters.file was null or undefined when calling uploadFile.");
    }
    const queryParameters = {};
    if (requestParameters.metadata !== void 0) {
      queryParameters["metadata"] = requestParameters.metadata;
    }
    if (requestParameters.multimodal !== void 0) {
      queryParameters["multimodal"] = requestParameters.multimodal;
    }
    const headerParameters = {};
    if (requestParameters.xPineconeApiVersion !== void 0 && requestParameters.xPineconeApiVersion !== null) {
      headerParameters["X-Pinecone-Api-Version"] = String(requestParameters.xPineconeApiVersion);
    }
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["Api-Key"] = this.configuration.apiKey("Api-Key");
    }
    const consumes = [
      { contentType: "multipart/form-data" }
    ];
    const canConsumeForm = runtime.canConsumeForm(consumes);
    let formParams;
    let useForm = false;
    useForm = canConsumeForm;
    if (useForm) {
      formParams = new FormData();
    } else {
      formParams = new URLSearchParams();
    }
    if (requestParameters.file !== void 0) {
      formParams.append("file", requestParameters.file);
    }
    const response = await this.request({
      path: `/files/{assistant_name}`.replace(`{${"assistant_name"}}`, encodeURIComponent(String(requestParameters.assistantName))),
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: formParams
    }, initOverrides);
    return new runtime.JSONApiResponse(response, (jsonValue) => (0, index_1.AssistantFileModelFromJSON)(jsonValue));
  }
  /**
   * Upload a file to the specified assistant.  For guidance and examples, see [Manage files](https://docs.pinecone.io/guides/assistant/manage-files#upload-a-local-file).
   * Upload file to assistant
   */
  async uploadFile(requestParameters, initOverrides) {
    const response = await this.uploadFileRaw(requestParameters, initOverrides);
    return await response.value();
  }
}
ManageAssistantsApi$1.ManageAssistantsApi = ManageAssistantsApi2;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(ManageAssistantsApi$1, exports);
})(apis);
var api_version = {};
Object.defineProperty(api_version, "__esModule", { value: true });
api_version.X_PINECONE_API_VERSION = void 0;
api_version.X_PINECONE_API_VERSION = "2025-10";
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(runtime$1, exports);
  __exportStar(apis, exports);
  __exportStar(models, exports);
  __exportStar(api_version, exports);
})(assistant_data);
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.modelValidation = exports.messagesValidation = exports.validateChatOptions = exports.chat = void 0;
  const assistant_data_12 = assistant_data;
  const errors_12 = errors;
  const chat2 = (assistantName, apiProvider) => {
    return async (options) => {
      (0, exports.validateChatOptions)(options);
      const api = await apiProvider.provideData();
      const messages = (0, exports.messagesValidation)(options);
      const model = (0, exports.modelValidation)(options);
      return await api.chatAssistant({
        xPineconeApiVersion: assistant_data_12.X_PINECONE_API_VERSION,
        assistantName,
        chatRequest: {
          messages,
          stream: false,
          model,
          filter: options.filter,
          jsonResponse: options.jsonResponse,
          includeHighlights: options.includeHighlights,
          contextOptions: {
            topK: options.contextOptions?.topK,
            snippetSize: options.contextOptions?.snippetSize,
            multimodal: options.contextOptions?.multimodal,
            includeBinaryContent: options.contextOptions?.includeBinaryContent
          }
        }
      });
    };
  };
  exports.chat = chat2;
  const validateChatOptions = (options) => {
    if (!options || !options.messages) {
      throw new errors_12.PineconeArgumentError("You must pass an object with required properties (`messages`) to chat with an assistant.");
    }
    if (options.model && typeof options.model !== "string") {
      throw new errors_12.PineconeArgumentError(`Invalid model: "${options.model}". Must be a string.`);
    }
  };
  exports.validateChatOptions = validateChatOptions;
  const messagesValidation = (options) => {
    let messages = [];
    if (options.messages && typeof options.messages[0] == "string") {
      messages = options.messages.map((message) => {
        return { role: "user", content: message };
      });
    }
    if (Array.isArray(options.messages) && typeof options.messages[0] === "object") {
      if (options.messages[0]["role"]) {
        if (options.messages[0]["role"].toLowerCase() !== "user" && options.messages[0]["role"].toLowerCase() !== "assistant") {
          throw new errors_12.PineconeArgumentError('No role specified in message object. Must be one of "user" or "assistant"');
        }
      }
      const keys = Array.from(new Set(options.messages.flatMap((message) => Object.keys(message))));
      if (keys.length !== 2) {
        throw new errors_12.PineconeArgumentError('Message object must have exactly two keys: "role" and "content"');
      }
      return messages = options.messages;
    }
    return messages;
  };
  exports.messagesValidation = messagesValidation;
  const modelValidation = (options) => {
    const model = options.model || "gpt-4o";
    return model;
  };
  exports.modelValidation = modelValidation;
})(chat);
var chatCompletion$1 = {};
Object.defineProperty(chatCompletion$1, "__esModule", { value: true });
chatCompletion$1.chatCompletion = void 0;
const assistant_data_1$8 = assistant_data;
const chat_1$2 = chat;
const chatCompletion = (assistantName, apiProvider) => {
  return async (options) => {
    (0, chat_1$2.validateChatOptions)(options);
    const api = await apiProvider.provideData();
    const messages = (0, chat_1$2.messagesValidation)(options);
    const model = (0, chat_1$2.modelValidation)(options);
    return await api.chatCompletionAssistant({
      xPineconeApiVersion: assistant_data_1$8.X_PINECONE_API_VERSION,
      assistantName,
      searchCompletions: {
        messages,
        stream: false,
        model,
        filter: options.filter
      }
    });
  };
};
chatCompletion$1.chatCompletion = chatCompletion;
var chatStream$1 = {};
Object.defineProperty(chatStream$1, "__esModule", { value: true });
chatStream$1.chatStream = void 0;
const assistant_data_1$7 = assistant_data;
const utils_1$3 = utils$1;
const errors_1$6 = errors;
const node_stream_1$1 = require$$3;
const chat_1$1 = chat;
const chatStream = (assistantName, apiProvider, config2) => {
  return async (options) => {
    const fetch2 = (0, utils_1$3.getFetch)(config2);
    (0, chat_1$1.validateChatOptions)(options);
    const hostUrl = await apiProvider.provideHostUrl();
    const chatUrl = `${hostUrl}/chat/${assistantName}`;
    const requestHeaders = {
      "Api-Key": config2.apiKey,
      "User-Agent": (0, utils_1$3.buildUserAgent)(config2),
      "X-Pinecone-Api-Version": assistant_data_1$7.X_PINECONE_API_VERSION
    };
    let contextOptions = void 0;
    if (options.contextOptions) {
      contextOptions = {
        top_k: options.contextOptions.topK,
        snippet_size: options.contextOptions.snippetSize,
        multimodal: options.contextOptions.multimodal,
        include_binary_content: options.contextOptions.includeBinaryContent
      };
    }
    const response = await fetch2(chatUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        messages: (0, chat_1$1.messagesValidation)(options),
        stream: true,
        model: (0, chat_1$1.modelValidation)(options),
        filter: options.filter,
        json_response: options.jsonResponse,
        include_highlights: options.includeHighlights,
        context_options: contextOptions
      })
    });
    if (response.ok && response.body) {
      const nodeReadable = node_stream_1$1.Readable.fromWeb(response.body);
      return new utils_1$3.ChatStream(nodeReadable);
    } else {
      const err = await (0, errors_1$6.handleApiError)(new assistant_data_1$7.ResponseError(response, "Response returned an error"), void 0, chatUrl);
      throw err;
    }
  };
};
chatStream$1.chatStream = chatStream;
var chatCompletionStream$1 = {};
Object.defineProperty(chatCompletionStream$1, "__esModule", { value: true });
chatCompletionStream$1.chatCompletionStream = void 0;
const assistant_data_1$6 = assistant_data;
const utils_1$2 = utils$1;
const errors_1$5 = errors;
const node_stream_1 = require$$3;
const chat_1 = chat;
const chatCompletionStream = (assistantName, apiProvider, config2) => {
  return async (options) => {
    const fetch2 = (0, utils_1$2.getFetch)(config2);
    (0, chat_1.validateChatOptions)(options);
    const hostUrl = await apiProvider.provideHostUrl();
    const chatUrl = `${hostUrl}/chat/${assistantName}/chat/completions`;
    const requestHeaders = {
      "Api-Key": config2.apiKey,
      "User-Agent": (0, utils_1$2.buildUserAgent)(config2),
      "X-Pinecone-Api-Version": assistant_data_1$6.X_PINECONE_API_VERSION
    };
    const response = await fetch2(chatUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        messages: (0, chat_1.messagesValidation)(options),
        stream: true,
        model: (0, chat_1.modelValidation)(options),
        filter: options.filter
      })
    });
    if (response.ok && response.body) {
      const nodeReadable = node_stream_1.Readable.fromWeb(response.body);
      return new utils_1$2.ChatStream(nodeReadable);
    } else {
      const err = await (0, errors_1$5.handleApiError)(new assistant_data_1$6.ResponseError(response, "Response returned an error"), void 0, chatUrl);
      throw err;
    }
  };
};
chatCompletionStream$1.chatCompletionStream = chatCompletionStream;
var listFiles$1 = {};
Object.defineProperty(listFiles$1, "__esModule", { value: true });
listFiles$1.listFiles = void 0;
const assistant_data_1$5 = assistant_data;
const listFiles = (assistantName, apiProvider) => {
  return async (options) => {
    const api = await apiProvider.provideData();
    return await api.listFiles({
      xPineconeApiVersion: assistant_data_1$5.X_PINECONE_API_VERSION,
      assistantName,
      filter: options.filter && JSON.stringify(options.filter)
    });
  };
};
listFiles$1.listFiles = listFiles;
var describeFile$1 = {};
Object.defineProperty(describeFile$1, "__esModule", { value: true });
describeFile$1.describeFile = void 0;
const errors_1$4 = errors;
const assistant_data_1$4 = assistant_data;
const describeFile = (assistantName, apiProvider) => {
  return async (fileId, includeUrl) => {
    if (!fileId) {
      throw new errors_1$4.PineconeArgumentError("You must pass the fileId of a file to describe.");
    }
    const api = await apiProvider.provideData();
    return await api.describeFile({
      xPineconeApiVersion: assistant_data_1$4.X_PINECONE_API_VERSION,
      assistantName,
      assistantFileId: fileId,
      includeUrl: includeUrl.toString()
    });
  };
};
describeFile$1.describeFile = describeFile;
var deleteFile$1 = {};
Object.defineProperty(deleteFile$1, "__esModule", { value: true });
deleteFile$1.deleteFile = void 0;
const assistant_data_1$3 = assistant_data;
const errors_1$3 = errors;
const deleteFile = (assistantName, apiProvider) => {
  return async (fileId) => {
    if (!fileId) {
      throw new errors_1$3.PineconeArgumentError("You must pass the fileId of a file to delete.");
    }
    const api = await apiProvider.provideData();
    return await api.deleteFile({
      assistantName,
      assistantFileId: fileId,
      xPineconeApiVersion: assistant_data_1$3.X_PINECONE_API_VERSION
    });
  };
};
deleteFile$1.deleteFile = deleteFile;
var uploadFile$1 = {};
var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
  return mod && mod.__esModule ? mod : { "default": mod };
};
Object.defineProperty(uploadFile$1, "__esModule", { value: true });
uploadFile$1.uploadFile = void 0;
const assistant_data_1$2 = assistant_data;
const errors_1$2 = errors;
const utils_1$1 = utils$1;
const fs_1 = __importDefault(require$$3$1);
const path_1 = __importDefault(require$$4);
const stream_1 = require$$5;
const uploadFile = (assistantName, apiProvider, config2) => {
  return async (options) => {
    validateUploadFileOptions(options);
    const hostUrl = await apiProvider.provideHostUrl();
    const filesUrl = buildFilesUrl(hostUrl, assistantName, options);
    const requestHeaders = buildRequestHeaders(config2);
    if ("path" in options && options.path) {
      return uploadFromPath(options.path, filesUrl, requestHeaders, config2);
    } else {
      return uploadFromFile(options.file, options.fileName, filesUrl, requestHeaders, config2);
    }
  };
};
uploadFile$1.uploadFile = uploadFile;
async function uploadFromPath(filePath, filesUrl, requestHeaders, config2) {
  const fetch2 = (0, utils_1$1.getFetch)(config2);
  const fileBuffer = await fs_1.default.promises.readFile(filePath);
  const fileName = path_1.default.basename(filePath);
  const mimeType = getMimeType(fileName);
  const fileBlob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file", fileBlob, fileName);
  return executeUpload(fetch2, filesUrl, requestHeaders, formData);
}
async function uploadFromFile(file, fileName, filesUrl, requestHeaders, config2) {
  const mimeType = getMimeType(fileName);
  if (file instanceof Blob) {
    const fetch3 = (0, utils_1$1.getFetch)(config2);
    const formData = new FormData();
    formData.append("file", file, fileName);
    return executeUpload(fetch3, filesUrl, requestHeaders, formData);
  }
  if (Buffer.isBuffer(file)) {
    const fetch3 = (0, utils_1$1.getFetch)(config2);
    const fileBlob = new Blob([
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
    ], { type: mimeType });
    const formData = new FormData();
    formData.append("file", fileBlob, fileName);
    return executeUpload(fetch3, filesUrl, requestHeaders, formData);
  }
  const fetch2 = (0, utils_1$1.getNonRetryingFetch)(config2);
  const { body, contentType } = buildMultipartBody(file, fileName, mimeType);
  return executeStreamUpload(fetch2, filesUrl, requestHeaders, body, contentType);
}
async function executeUpload(fetch2, filesUrl, requestHeaders, body) {
  const response = await fetch2(filesUrl, {
    method: "POST",
    headers: requestHeaders,
    body
  });
  return parseResponse(response, filesUrl);
}
async function executeStreamUpload(fetch2, filesUrl, requestHeaders, body, contentType) {
  const response = await fetch2(filesUrl, {
    method: "POST",
    headers: { ...requestHeaders, "Content-Type": contentType },
    body,
    // undici (Node.js built-in fetch) requires duplex: 'half' for streaming
    // request bodies. The RequestInit type doesn't include this field yet.
    ...{ duplex: "half" }
  });
  return parseResponse(response, filesUrl);
}
async function parseResponse(response, filesUrl) {
  if (response.ok) {
    return await new assistant_data_1$2.JSONApiResponse(response, (jsonValue) => (0, assistant_data_1$2.AssistantFileModelFromJSON)(jsonValue)).value();
  } else {
    const err = await (0, errors_1$2.handleApiError)(new assistant_data_1$2.ResponseError(response, "Response returned an error"), void 0, filesUrl);
    throw err;
  }
}
function buildMultipartBody(stream, fileName, mimeType) {
  const boundary = `----PineconeBoundary${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const header = encoder.encode(`--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${escapeFilename(fileName)}"\r
Content-Type: ${mimeType}\r
\r
`);
  const footer = encoder.encode(`\r
--${boundary}--\r
`);
  const webStream = stream_1.Readable.toWeb(stream instanceof stream_1.Readable ? stream : stream_1.Readable.from(stream));
  const reader = webStream.getReader();
  let phase = "header";
  const body = new ReadableStream({
    async pull(controller) {
      if (phase === "header") {
        controller.enqueue(header);
        phase = "body";
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(footer);
        controller.close();
        phase = "done";
      } else {
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
function buildFilesUrl(hostUrl, assistantName, options) {
  let filesUrl = `${hostUrl}/files/${assistantName}`;
  if (options.metadata) {
    const encodedMetadata = encodeURIComponent(JSON.stringify(options.metadata));
    filesUrl += `?metadata=${encodedMetadata}`;
  }
  if (options.multimodal !== void 0) {
    const separator = filesUrl.includes("?") ? "&" : "?";
    filesUrl += `${separator}multimodal=${options.multimodal}`;
  }
  return filesUrl;
}
function buildRequestHeaders(config2) {
  return {
    "Api-Key": config2.apiKey,
    "User-Agent": (0, utils_1$1.buildUserAgent)(config2),
    "X-Pinecone-Api-Version": assistant_data_1$2.X_PINECONE_API_VERSION
  };
}
const validateUploadFileOptions = (options) => {
  if (!options) {
    throw new errors_1$2.PineconeArgumentError("You must pass an object with required properties (`path` or `file` + `fileName`) to upload a file.");
  }
  if (!("path" in options) && !("file" in options)) {
    throw new errors_1$2.PineconeArgumentError("You must pass an object with required properties (`path` or `file` + `fileName`) to upload a file.");
  }
  if ("path" in options && !options.path) {
    throw new errors_1$2.PineconeArgumentError("You must pass an object with required properties (`path` or `file` + `fileName`) to upload a file.");
  }
  if ("file" in options) {
    if (!options.file) {
      throw new errors_1$2.PineconeArgumentError("You must pass an object with required properties (`path` or `file` + `fileName`) to upload a file.");
    }
    if (!options.fileName) {
      throw new errors_1$2.PineconeArgumentError("`fileName` is required when uploading via `file`.");
    }
  }
};
function escapeFilename(fileName) {
  return fileName.replace(/"/g, "%22").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function getMimeType(filePath) {
  const extensionToMimeType = {
    pdf: "application/pdf",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };
  const parts = filePath.split(".");
  if (parts.length < 2) {
    return "application/octet-stream";
  }
  const ext = parts.pop();
  const extension = ext ? ext.toLowerCase() : "";
  return extensionToMimeType[extension] ?? "application/octet-stream";
}
var asstDataOperationsProvider = {};
Object.defineProperty(asstDataOperationsProvider, "__esModule", { value: true });
asstDataOperationsProvider.AsstDataOperationsProvider = void 0;
const assistant_data_1$1 = assistant_data;
const utils_1 = utils$1;
const middleware_1 = middleware;
const assistantHostSingleton_1$1 = assistantHostSingleton;
class AsstDataOperationsProvider {
  config;
  asstName;
  asstHostUrl;
  asstDataOperations;
  additionalHeaders;
  constructor(config2, asstName, asstHostUrl, additionalHeaders) {
    this.config = config2;
    this.asstName = asstName;
    this.asstHostUrl = (0, utils_1.normalizeUrl)(asstHostUrl);
    this.additionalHeaders = additionalHeaders;
  }
  async provideData() {
    if (this.asstDataOperations) {
      return this.asstDataOperations;
    }
    if (this.asstHostUrl) {
      this.asstDataOperations = this.buildAsstDataOperationsConfig();
    } else {
      this.asstHostUrl = await assistantHostSingleton_1$1.AssistantHostSingleton.getHostUrl(this.config, this.asstName);
      this.asstDataOperations = this.buildAsstDataOperationsConfig();
    }
    return this.asstDataOperations;
  }
  async provideHostUrl() {
    if (this.asstHostUrl) {
      return this.asstHostUrl;
    } else {
      return await assistantHostSingleton_1$1.AssistantHostSingleton.getHostUrl(this.config, this.asstName);
    }
  }
  buildAsstDataOperationsConfig() {
    const { apiKey } = this.config;
    const hostUrl = this.asstHostUrl;
    const headers = this.additionalHeaders || null;
    const apiConfig = {
      basePath: hostUrl,
      apiKey,
      queryParamsStringify: utils_1.queryParamsStringify,
      headers: {
        "User-Agent": (0, utils_1.buildUserAgent)(this.config),
        "X-Pinecone-Api-Version": assistant_data_1$1.X_PINECONE_API_VERSION,
        ...headers
      },
      fetchApi: (0, utils_1.getFetch)(this.config),
      middleware: (0, middleware_1.createMiddlewareArray)()
    };
    return new assistant_data_1$1.ManageAssistantsApi(new assistant_data_1$1.Configuration(apiConfig));
  }
}
asstDataOperationsProvider.AsstDataOperationsProvider = AsstDataOperationsProvider;
var context$1 = {};
Object.defineProperty(context$1, "__esModule", { value: true });
context$1.context = void 0;
const assistant_data_1 = assistant_data;
const errors_1$1 = errors;
const context = (assistantName, apiProvider) => {
  return async (options) => {
    validateContextOptions(options);
    const api = await apiProvider.provideData();
    return await api.contextAssistant({
      assistantName,
      xPineconeApiVersion: assistant_data_1.X_PINECONE_API_VERSION,
      contextRequest: {
        query: options.query,
        filter: options.filter,
        messages: toMessageModel(options.messages),
        topK: options.topK,
        snippetSize: options.snippetSize,
        multimodal: options.multimodal,
        includeBinaryContent: options.includeBinaryContent
      }
    });
  };
};
context$1.context = context;
const validateContextOptions = (options) => {
  if (!options || !options.query && !options.messages) {
    throw new errors_1$1.PineconeArgumentError("You must pass an object with required properties (`query`, or `messages`) to retrieve context snippets.");
  }
};
const toMessageModel = (messages) => {
  if (!messages) {
    return void 0;
  }
  if (Array.isArray(messages) && typeof messages[0] === "string") {
    return messages.map((message) => {
      return { role: "user", content: message };
    });
  }
  if (Array.isArray(messages) && typeof messages[0] === "object") {
    return messages;
  }
  return void 0;
};
(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Assistant = exports.ChatStream = void 0;
  const chat_12 = chat;
  const chatCompletion_1 = chatCompletion$1;
  const chatStream_1 = chatStream$1;
  const chatCompletionStream_1 = chatCompletionStream$1;
  const listFiles_1 = listFiles$1;
  const describeFile_1 = describeFile$1;
  const deleteFile_1 = deleteFile$1;
  const uploadFile_1 = uploadFile$1;
  const asstDataOperationsProvider_1 = asstDataOperationsProvider;
  const context_1 = context$1;
  const errors_12 = errors;
  var chatStream_2 = chatStream$2;
  Object.defineProperty(exports, "ChatStream", { enumerable: true, get: function() {
    return chatStream_2.ChatStream;
  } });
  class Assistant2 {
    config;
    _chat;
    _chatStream;
    _chatCompletion;
    _chatCompletionStream;
    _listFiles;
    _describeFile;
    _uploadFile;
    _deleteFile;
    _context;
    assistantName;
    /**
     * Creates an instance of the `Assistant` class.
     *
     * @param options - The {@link AssistantOptions} for targeting the assistant.
     * @param config - The Pinecone configuration object containing an API key and other configuration parameters
     * needed for API calls.
     *
     * @throws An error if no assistant name is provided.
     */
    constructor(options, config2) {
      if (!options.name || options.name.trim() === "") {
        throw new errors_12.PineconeArgumentError("Assistant name is required and cannot be empty.");
      }
      this.config = config2;
      const asstDataOperationsProvider2 = new asstDataOperationsProvider_1.AsstDataOperationsProvider(this.config, options.name, options.host, options.additionalHeaders);
      this.assistantName = options.name;
      this._chat = (0, chat_12.chat)(this.assistantName, asstDataOperationsProvider2);
      this._chatStream = (0, chatStream_1.chatStream)(this.assistantName, asstDataOperationsProvider2, this.config);
      this._chatCompletion = (0, chatCompletion_1.chatCompletion)(this.assistantName, asstDataOperationsProvider2);
      this._chatCompletionStream = (0, chatCompletionStream_1.chatCompletionStream)(this.assistantName, asstDataOperationsProvider2, this.config);
      this._listFiles = (0, listFiles_1.listFiles)(this.assistantName, asstDataOperationsProvider2);
      this._describeFile = (0, describeFile_1.describeFile)(this.assistantName, asstDataOperationsProvider2);
      this._uploadFile = (0, uploadFile_1.uploadFile)(this.assistantName, asstDataOperationsProvider2, this.config);
      this._deleteFile = (0, deleteFile_1.deleteFile)(this.assistantName, asstDataOperationsProvider2);
      this._context = (0, context_1.context)(this.assistantName, asstDataOperationsProvider2);
    }
    // --------- Chat methods ---------
    /**
     * Sends a message to the assistant and receives a response. Retries the request if the server fails.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const chatResp = await assistant.chat({messages: [{role: 'user', content: "What is the capital of France?"}]});
     * // {
     * //  id: '000000000000000023e7fb015be9d0ad',
     * //  finishReason: 'stop',
     * //  message: {
     * //    role: 'assistant',
     * //    content: 'The capital of France is Paris.'
     * //  },
     * //  model: 'gpt-4o-2024-05-13',
     * //  citations: [ { position: 209, references: [Array] } ],
     * //  usage: { promptTokens: 493, completionTokens: 38, totalTokens: 531 }
     * // }
     * ```
     *
     * @example
     * Chat with multimodal context enabled:
     * ```typescript
     * const chatResp = await assistant.chat({
     *   messages: [{role: 'user', content: "What do the charts show?"}],
     *   contextOptions: {
     *     multimodal: true,
     *     includeBinaryContent: true
     *   }
     * });
     * ```
     *
     * @param options - A {@link ChatOptions} object containing the message and optional parameters to send to the
     * assistant, including contextOptions for controlling multimodal content.
     * @returns A promise that resolves to a {@link ChatModel} object containing the response from the assistant.
     */
    chat(options) {
      return this._chat(options);
    }
    /**
     * Sends a message to the assistant and receives a streamed response as {@link ChatStream<StreamedChatResponse>}. Retries the request if the server fails.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const chatStream = await assistant.chatStream({ messages: [{ role: 'user', content: 'What is the capital of France?'}]});
     *
     * // stream the response and log each chunk
     * for await (const chunk of newStream) {
     *   console.log(chunk);
     * }
     * // each chunk will have a variable shape depending on the type:
     * // { type:"message_start", id:"response_id", model:"gpt-4o-2024-05-13", role:"assistant"}
     * // { type:"content_chunk", id:"response_id", model:"gpt-4o-2024-05-13", delta:{ content:"The"}}
     * // { type:"content_chunk", id:"response_id", model:"gpt-4o-2024-05-13", delta:{ content:" test"}}
     * // { type:"message_end", id:"response_id", model:"gpt-4o-2024-05-13", finishReason:"stop",usage:{ promptTokens:371,completionTokens:48,totalTokens:419}}
     * ```
     *
     * @param options - A {@link ChatOptions} object containing the message and optional parameters to send to the
     * assistant.
     * @returns A promise that resolves to a {@link ChatStream<StreamedChatResponse>}.
     */
    chatStream(options) {
      return this._chatStream(options);
    }
    /**
     * Sends a message to the assistant and receives a response that is compatible with
     * [OpenAI's Chat Completion API](https://platform.openai.com/docs/guides/text-generation. Retries the request if the server fails.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const chatCompletion = await assistant.chatCompletion({ messages: [{ role: 'user', content: 'What is the capital of France?' }]});
     * console.log(chatCompletion);
     * // {
     * //  id: "response_id",
     * //  choices: [
     * //  {
     * //    finishReason: "stop",
     * //    index: 0,
     * //    message: {
     * //      role: "assistant",
     * //      content: "The data mentioned is described as \"some temporary data\"  [1].\n\nReferences:\n1. [test-chat.txt](https://storage.googleapis.com/knowledge-prod-files/your_file_resource) \n"
     * //    }
     * //   }
     * //  ],
     * //  model: "gpt-4o-2024-05-13",
     * //  usage: {
     * //    promptTokens: 371,
     * //    completionTokens: 19,
     * //    totalTokens: 390
     * //  }
     * // }
     * ```
     *
     * @param options - A {@link ChatCompletionOptions} object containing the message and optional parameters to send
     * to an assistant.
     * @returns A promise that resolves to a {@link ChatCompletionModel} object containing the response from the assistant.
     */
    chatCompletion(options) {
      return this._chatCompletion(options);
    }
    /**
     * Sends a message to the assistant and receives a streamed response as {@link ChatStream<StreamedChatCompletionResponse>}. Response is compatible with
     * [OpenAI's Chat Completion API](https://platform.openai.com/docs/guides/text-generation. Retries the request if the server fails.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const chatStream = await assistant.chatCompletionStream({messages: [{role: 'user', content: "What is the capital of France?"}]});
     *
     * // stream the response and log each chunk
     * for await (const chunk of newStream) {
     *   if (chunk.choices.length > 0 && chunk.choices[0].delta.content) {
     *     process.stdout.write(chunk.choices[0].delta.content);
     *   }
     * }
     * // { id: 'response_id', choices: [{ index: 0, delta: { role: 'assistant' }, finishReason: null }], model: 'gpt-4o-2024-05-13', usage: null }
     * // { id: 'response_id', choices: [{ index: 0, delta: { content: 'The' }}, finishReason: null }], model: 'gpt-4o-2024-05-13', usage: null }
     * // { id: 'response_id', choices: [{ index: 0, delta: { content: ' test' }}, finishReason: null }], model: 'gpt-4o-2024-05-13', usage: null }
     * // { id: 'response_id', choices: [], model: 'gpt-4o-2024-05-13', usage: { promptTokens: 371, completionTokens: 48, totalTokens: 419 }}
     * ```
     *
     * @param options - A {@link ChatCompletionOptions} object containing the message and optional parameters to send
     * to an assistant.
     * @returns A promise that resolves to a {@link ChatStream<StreamedChatCompletionResponse>}.
     */
    chatCompletionStream(options) {
      return this._chatCompletionStream(options);
    }
    // --------- File methods ---------
    /**
     * Lists files (with optional filter) uploaded to an assistant.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const files = await assistant.listFiles({filter: {key: 'value'}});
     * console.log(files);
     * // {
     * //  files: [
     * //    {
     * //      name: 'temp-file.txt',
     * //      id: '1a56ddd0-c6d8-4295-80c0-9bfd6f5cb87b',
     * //      metadata: undefined,
     * //      createdOn: 2025-01-06T19:14:21.969Z,
     * //      updatedOn: 2025-01-06T19:14:36.925Z,
     * //      status: 'Available',
     * //      percentDone: 1,
     * //      signedUrl: undefined,
     * //      errorMessage: undefined
     * //    }
     * //  ]
     * // }
     * ```
     *
     * @param options - A {@link ListFilesOptions} object containing optional parameters to filter the list of files.
     * @returns A promise that resolves to a {@link AssistantFilesList} object containing a list of files.
     */
    listFiles(options) {
      if (!options) {
        options = {};
      }
      return this._listFiles(options);
    }
    /**
     * Describes a file uploaded to an assistant.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const files = await assistant.listFiles();
     * let fileId: string;
     * if (files.files) {
     *     fileId = files.files[0].id;
     * } else {
     *     fileId = '';
     * }
     * const resp = await assistant.describeFile({fileId: fileId})
     * console.log(resp);
     * // {
     * //  name: 'test-file.txt',
     * //  id: '1a56ddd0-c6d8-4295-80c0-9bfd6f5cb87b',
     * //  metadata: undefined,
     * //  createdOn: 2025-01-06T19:14:21.969Z,
     * //  updatedOn: 2025-01-06T19:14:36.925Z,
     * //  status: 'Available',
     * //  percentDone: 1,
     * //  signedUrl: undefined,
     * //   errorMessage: undefined
     * // }
     * ```
     *
     * @param fileId - The ID of the file to describe.
     * @param includeUrl - Whether to include the signed URL in the response. Defaults to true.
     * @returns A promise that resolves to a {@link AssistantFileModel} object containing the file details.
     */
    describeFile(fileId, includeUrl = true) {
      return this._describeFile(fileId, includeUrl);
    }
    /**
     * Uploads a file to an assistant.
     *
     * Accepts either a local file path or an in-memory `Buffer`, `Blob`, or
     * Node.js `ReadableStream`. Use the `file` + `fileName` form to forward an
     * incoming HTTP upload stream directly to the assistant without writing it
     * to disk or buffering the entire file in memory.
     *
     * Note: This method does *not* use the generated code from the OpenAPI spec.
     *
     * @example
     * Upload from a local path:
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistant = pc.Assistant({ name: 'my-assistant' });
     * await assistant.uploadFile({ path: 'report.pdf', metadata: { category: 'reports' } });
     * ```
     *
     * @example
     * Upload from a Buffer (e.g. from multer memory storage):
     * ```typescript
     * // req.file.buffer is a Buffer provided by multer
     * await assistant.uploadFile({
     *   file: req.file.buffer,
     *   fileName: req.file.originalname,
     * });
     * ```
     *
     * @example
     * Upload from a ReadableStream (zero server-side buffering):
     * ```typescript
     * // Forward an incoming upload stream directly — no disk write, no memory spike.
     * // Note: automatic retries are disabled for stream inputs because the stream
     * // is consumed after the first read and cannot be replayed.
     * await assistant.uploadFile({
     *   file: req.file.stream,   // e.g. from busboy / @fastify/multipart
     *   fileName: req.file.filename,
     * });
     * ```
     *
     * @example
     * Upload a file with multimodal processing enabled:
     * ```typescript
     * await assistant.uploadFile({
     *   path: 'document-with-images.pdf',
     *   metadata: { category: 'reports' },
     *   multimodal: true,
     * });
     * ```
     *
     * @param options - A {@link UploadFileOptions} object. Provide either
     *   `path` (local file path) or `file` ({@link Uploadable}) + `fileName`,
     *   along with optional `metadata` and `multimodal` flags.
     * @returns A promise that resolves to an {@link AssistantFileModel} object containing the file details.
     */
    uploadFile(options) {
      return this._uploadFile(options);
    }
    /**
     * Deletes a file uploaded to an assistant by ID.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const files = await assistant.listFiles();
     * let fileId: string;
     * if (files.files) {
     *    fileId = files.files[0].id;
     *    await assistant.deleteFile({fileId: fileId});
     *  }
     * ```
     *
     * @param options - A {@link DeleteFile} object containing the file ID to delete.
     * @returns A promise that resolves to void on success.
     */
    deleteFile(fileId) {
      return this._deleteFile(fileId);
    }
    /**
     * Retrieves [the context snippets](https://docs.pinecone.io/guides/assistant/understanding-context-snippets) used
     * by an assistant during the retrieval process.
     *
     * @example
     * ```typescript
     * import { Pinecone } from '@pinecone-database/pinecone';
     * const pc = new Pinecone();
     * const assistantName = 'test1';
     * const assistant = pc.assistant({ name: assistantName });
     * const response = await assistant.context({query: "What is the capital of France?"});
     * console.log(response);
     * // {
     * //  snippets: [
     * //    {
     * //      type: 'text',
     * //      content: 'The capital of France is Paris.',
     * //      score: 0.9978925,
     * //      reference: [Object]
     * //    },
     * //  ],
     * //  usage: { promptTokens: 527, completionTokens: 0, totalTokens: 527 }
     * // }
     * ```
     *
     * @example
     * Retrieve multimodal context snippets with image data:
     * ```typescript
     * const response = await assistant.context({
     *   query: "Show me charts about revenue",
     *   multimodal: true,
     *   includeBinaryContent: true
     * });
     * ```
     *
     * @param options - A {@link ContextOptions} object containing the query or messages, optional filter, and optional multimodal parameters.
     * @returns A promise that resolves to a {@link ContextModel} object containing the context snippets.
     */
    context(options) {
      return this._context(options);
    }
  }
  exports.Assistant = Assistant2;
})(assistant);
Object.defineProperty(pinecone, "__esModule", { value: true });
pinecone.Pinecone = void 0;
const control_1 = control$1;
const control_2 = control;
const assistantHostSingleton_1 = assistantHostSingleton;
const indexHostSingleton_1 = indexHostSingleton;
const errors_1 = errors;
const data_1 = data;
const inference_1 = inference$2;
const environment_1 = environment;
const asstControlOperationsBuilder_1 = asstControlOperationsBuilder$1;
const asstMetricsOperationsBuilder_1 = asstMetricsOperationsBuilder$1;
const assistant_1 = assistant;
class Pinecone {
  /** @hidden */
  _configureIndex;
  /** @hidden */
  _createCollection;
  /** @hidden */
  _createIndex;
  /** @hidden */
  _createIndexForModel;
  /** @hidden */
  _describeCollection;
  /** @hidden */
  _describeIndex;
  /** @hidden */
  _deleteCollection;
  /** @hidden */
  _deleteIndex;
  /** @hidden */
  _listCollections;
  /** @hidden */
  _listIndexes;
  /** @hidden */
  _createAssistant;
  /** @hidden */
  _deleteAssistant;
  /** @hidden */
  _updateAssistant;
  /** @hidden */
  _describeAssistant;
  /** @hidden */
  _listAssistants;
  /** @hidden */
  _evaluate;
  /** @hidden */
  _createBackup;
  /** @hidden */
  _createIndexFromBackup;
  /** @hidden */
  _describeBackup;
  /** @hidden */
  _describeRestoreJob;
  /** @hidden */
  _deleteBackup;
  /** @hidden */
  _listBackups;
  /** @hidden */
  _listRestoreJobs;
  inference;
  /**
   * @example
   * ```
   * import { Pinecone } from '@pinecone-database/pinecone';
   *
   * const pc = new Pinecone({
   *  apiKey: 'my-api-key',
   * });
   * ```
   *
   * @constructor
   * @param options - The configuration options for the Pinecone client: {@link PineconeConfiguration}.
   */
  constructor(options) {
    if (options === void 0) {
      options = this._readEnvironmentConfig();
    }
    if (!options.apiKey) {
      throw new errors_1.PineconeConfigurationError("The client configuration must have required property: apiKey.");
    }
    this.config = options;
    this._checkForBrowser();
    const api = (0, control_1.indexOperationsBuilder)(this.config);
    const asstControlApi = (0, asstControlOperationsBuilder_1.asstControlOperationsBuilder)(this.config);
    const asstMetricsApi = (0, asstMetricsOperationsBuilder_1.asstMetricsOperationsBuilder)(this.config);
    this._configureIndex = (0, control_1.configureIndex)(api);
    this._createCollection = (0, control_1.createCollection)(api);
    this._createIndex = (0, control_1.createIndex)(api);
    this._createIndexForModel = (0, control_1.createIndexForModel)(api);
    this._describeCollection = (0, control_1.describeCollection)(api);
    this._deleteCollection = (0, control_1.deleteCollection)(api);
    this._describeIndex = (0, control_1.describeIndex)(api);
    this._deleteIndex = (0, control_1.deleteIndex)(api);
    this._listCollections = (0, control_1.listCollections)(api);
    this._listIndexes = (0, control_1.listIndexes)(api);
    this._createAssistant = (0, control_2.createAssistant)(asstControlApi);
    this._deleteAssistant = (0, control_2.deleteAssistant)(asstControlApi);
    this._updateAssistant = (0, control_2.updateAssistant)(asstControlApi);
    this._describeAssistant = (0, control_2.describeAssistant)(asstControlApi);
    this._listAssistants = (0, control_2.listAssistants)(asstControlApi);
    this._evaluate = (0, control_2.evaluate)(asstMetricsApi);
    this._createBackup = (0, control_1.createBackup)(api);
    this._createIndexFromBackup = (0, control_1.createIndexFromBackup)(api);
    this._describeBackup = (0, control_1.describeBackup)(api);
    this._describeRestoreJob = (0, control_1.describeRestoreJob)(api);
    this._deleteBackup = (0, control_1.deleteBackup)(api);
    this._listBackups = (0, control_1.listBackups)(api);
    this._listRestoreJobs = (0, control_1.listRestoreJobs)(api);
    this.inference = new inference_1.Inference(this.config);
  }
  /**
   * @internal
   * This method is used by {@link Pinecone.constructor} to read configuration from environment variables.
   *
   * It looks for the following environment variables:
   * - `PINECONE_API_KEY`
   * - `PINECONE_CONTROLLER_HOST`
   *
   * @returns A {@link PineconeConfiguration} object populated with values found in environment variables.
   */
  _readEnvironmentConfig() {
    if (typeof process === "undefined" || !process || !process.env) {
      throw new errors_1.PineconeEnvironmentVarsNotSupportedError("Your execution environment does not support reading environment variables from process.env, so a configuration object is required when calling new Pinecone().");
    }
    const environmentConfig = {};
    const requiredEnvVarMap = {
      apiKey: "PINECONE_API_KEY"
    };
    const missingVars = [];
    for (const [key, envVar] of Object.entries(requiredEnvVarMap)) {
      const value = process.env[envVar] || "";
      if (!value) {
        missingVars.push(envVar);
      }
      environmentConfig[key] = value;
    }
    if (missingVars.length > 0) {
      throw new errors_1.PineconeConfigurationError(`Since you called 'new Pinecone()' with no configuration object, we attempted to find client configuration in environment variables but the required environment variables were not set. Missing variables: ${missingVars.join(", ")}.`);
    }
    const optionalEnvVarMap = {
      controllerHostUrl: "PINECONE_CONTROLLER_HOST"
    };
    for (const [key, envVar] of Object.entries(optionalEnvVarMap)) {
      const value = process.env[envVar];
      if (value !== void 0) {
        environmentConfig[key] = value;
      }
    }
    return environmentConfig;
  }
  /** @hidden */
  config;
  /**
   * Describe a Pinecone index
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const indexModel = await pc.describeIndex('my-index')
   * console.log(indexModel)
   * // {
   * //     name: 'sample-index-1',
   * //     dimension: 3,
   * //     metric: 'cosine',
   * //     host: 'sample-index-1-1390950.svc.apw5-4e34-81fa.pinecone.io',
   * //     spec: {
   * //           pod: undefined,
   * //           serverless: {
   * //               cloud: 'aws',
   * //               region: 'us-west-2'
   * //           }
   * //     },
   * //     status: {
   * //           ready: true,
   * //           state: 'Ready'
   * //     }
   * // }
   * ```
   *
   * @param indexName - The name of the index to describe.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to {@link IndexModel}.
   */
  async describeIndex(indexName) {
    const indexModel = await this._describeIndex(indexName);
    const host = indexModel.privateHost || indexModel.host;
    indexHostSingleton_1.IndexHostSingleton._set(this.config, indexName, host);
    return Promise.resolve(indexModel);
  }
  /**
   * List all Pinecone indexes
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const indexList = await pc.listIndexes()
   * console.log(indexList)
   * // {
   * //     indexes: [
   * //       {
   * //         name: "sample-index-1",
   * //         dimension: 3,
   * //         metric: "cosine",
   * //         host: "sample-index-1-1234567.svc.apw5-2e18-32fa.pinecone.io",
   * //         spec: {
   * //           serverless: {
   * //             cloud: "aws",
   * //             region: "us-west-2"
   * //           }
   * //         },
   * //         status: {
   * //           ready: true,
   * //           state: "Ready"
   * //         }
   * //       },
   * //       {
   * //         name: "sample-index-2",
   * //         dimension: 3,
   * //         metric: "cosine",
   * //         host: "sample-index-2-1234567.svc.apw2-5e76-83fa.pinecone.io",
   * //         spec: {
   * //           serverless: {
   * //             cloud: "aws",
   * //             region: "us-west-2"
   * //           }
   * //         },
   * //         status: {
   * //           ready: true,
   * //           state: "Ready"
   * //         }
   * //       }
   * //     ]
   * //   }
   * ```
   *
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to {@link IndexList}.
   */
  async listIndexes() {
    const indexList = await this._listIndexes();
    if (indexList.indexes && indexList.indexes.length > 0) {
      for (let i = 0; i < indexList.indexes.length; i++) {
        const index = indexList.indexes[i];
        const host = index.privateHost || index.host;
        indexHostSingleton_1.IndexHostSingleton._set(this.config, index.name, host);
      }
    }
    return Promise.resolve(indexList);
  }
  /**
   * Creates a new index.
   *
   * @example
   * The minimum required configuration to create an index is the index `name`, `dimension`, and `spec`.
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   *
   * const pc = new Pinecone();
   *
   * await pc.createIndex({ name: 'my-index', dimension: 128, spec: { serverless: { cloud: 'aws', region: 'us-west-2' }}})
   * ```
   *
   * @example
   * The `spec` object defines how the index should be deployed. For serverless indexes, you define only the cloud and region where the index should be hosted.
   * For pod-based indexes, you define the environment where the index should be hosted, the pod type and size to use, and other index characteristics.
   * In a different example, you can create a pod-based index by specifying the `pod` spec object with the `environment`, `pods`, `podType`, and `metric` properties.
   * For more information on creating indexes, see [Understanding indexes](https://docs.pinecone.io/guides/indexes/understanding-indexes).
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.createIndex({
   *  name: 'my-index',
   *  dimension: 1536,
   *  metric: 'cosine',
   *  spec: {
   *    pod: {
   *      environment: 'us-west-2-gcp',
   *      pods: 1,
   *      podType: 'p1.x1'
   *    }
   *   },
   *  tags: { 'team': 'data-science' }
   * })
   * ```
   *
   * @example
   * If you would like to create the index only if it does not already exist, you can use the `suppressConflicts` boolean option.
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.createIndex({
   *   name: 'my-index',
   *   dimension: 1536,
   *   spec: {
   *     serverless: {
   *       cloud: 'aws',
   *       region: 'us-west-2'
   *     }
   *   },
   *   suppressConflicts: true,
   *   tags: { 'team': 'data-science' }
   * })
   * ```
   *
   * @example
   * If you plan to begin upserting immediately after index creation is complete, you should use the `waitUntilReady` option. Otherwise, the index may not be ready to receive data operations when you attempt to upsert.
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const indexModel = await pc.createIndex({
   *  name: 'my-index',
   *   spec: {
   *     serverless: {
   *       cloud: 'aws',
   *       region: 'us-west-2'
   *     }
   *   },
   *  waitUntilReady: true,
   *  tags: { 'team': 'data-science' }
   * });
   *
   * const records = [
   *   // PineconeRecord objects with your embedding values
   * ]
   * const index = pc.index({ host: indexModel.host });
   * await index.upsert({ records })
   * ```
   *
   * @example
   * By default all metadata fields are indexed when records are upserted with metadata, but if you want to improve performance you can specify the specific fields you want to index. This example is showing a few hypothetical metadata fields, but the values you'd use depend on what metadata you plan to store with records in your Pinecone index.
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.createIndex({
   *   name: 'my-index',
   *   dimension: 1536,
   *   spec: {
   *     serverless: {
   *       cloud: 'aws',
   *       region: 'us-west-2',
   *       metadataConfig: { 'indexed' : ['productName', 'productDescription'] }
   *     }
   *   },
   *  tags: { 'team': 'data-science' }
   * })
   * ```
   *
   * @param options - The {@link CreateIndexOptions} for creating the index.
   * @see [Distance metrics](https://docs.pinecone.io/docs/indexes#distance-metrics)
   * @see [Pod types and sizes](https://docs.pinecone.io/docs/indexes#pods-pod-types-and-pod-sizes)
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeBadRequestError} when index creation fails due to invalid parameters being specified or other problem such as project quotas limiting the creation of any additional indexes.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @throws {@link Errors.PineconeConflictError} when attempting to create an index using a name that already exists in your project.
   * @returns A promise that resolves to {@link IndexModel} when the request to create the index is completed. Note that the index is not immediately ready to use. You can use the {@link describeIndex} function to check the status of the index.
   */
  createIndex(options) {
    return this._createIndex(options);
  }
  /**
   * Creates a new integrated index which allows working with integrated inference capabilities.
   * @see [Upsert and search with integrated inference](https://docs.pinecone.io/guides/inference/integrated-inference)
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.createIndexForModel({
   *   name: 'integrated-index',
   *   cloud: 'aws',
   *   region: 'us-east-1',
   *   embed: {
   *     model: 'multilingual-e5-large',
   *     fieldMap: { text: 'chunk_text' },
   *   },
   *   waitUntilReady: true,
   * });
   * ```
   *
   * @param options - The {@link CreateIndexForModelOptions} for creating the index.
   * @see [Distance metrics](https://docs.pinecone.io/docs/indexes#distance-metrics)
   * @see [Pod types and sizes](https://docs.pinecone.io/docs/indexes#pods-pod-types-and-pod-sizes)
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeBadRequestError} when index creation fails due to invalid parameters being specified or other problem such as project quotas limiting the creation of any additional indexes.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @throws {@link Errors.PineconeConflictError} when attempting to create an index using a name that already exists in your project.
   * @returns A promise that resolves to {@link IndexModel} when the request to create the index is completed. Note that the index is not immediately ready to use. You can use the {@link describeIndex} function to check the status of the index.
   */
  createIndexForModel(options) {
    return this._createIndexForModel(options);
  }
  /**
   * Deletes an index
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.deleteIndex('my-index')
   * ```
   *
   * @param indexName - The name of the index to delete.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @returns A promise that resolves when the request to delete the index is completed.
   */
  async deleteIndex(indexName) {
    await this._deleteIndex(indexName);
    indexHostSingleton_1.IndexHostSingleton._delete(this.config, indexName);
    return Promise.resolve();
  }
  /**
   * Configure an index
   *
   * Use this method to update configuration on an existing index. For both pod-based and serverless indexes you can update
   * the deletionProtection status of an index and/or change any index tags. For pod-based index you can also
   * configure the number of replicas and pod type.
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.configureIndex({
   *   name: 'my-index',
   *   deletionProtection: 'enabled',
   *   podReplicas: 2,
   *   podType: 'p1.x2'
   * });
   * ```
   *
   * @param options - The {@link ConfigureIndexOptions} for configuring the index.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to {@link IndexModel} when the request to configure the index is completed.
   */
  configureIndex(options) {
    return this._configureIndex(options);
  }
  /**
   * Create a new collection from an existing index
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const indexList = await pc.listIndexes()
   * const indexName = indexList.indexes[0].name;
   * await pc.createCollection({
   *  name: 'my-collection',
   *  source: indexName
   * })
   * ```
   *
   * @param options - The collection configuration.
   * @param options.name - The name of the collection. Must be unique within the project and contain alphanumeric and hyphen characters. The name must start and end with alphanumeric characters.
   * @param options.source - The name of the index to use as the source for the collection.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns a promise that resolves to {@link CollectionModel} when the request to create the collection is completed.
   */
  createCollection(options) {
    return this._createCollection(options);
  }
  /**
   * List all collections in a project
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.listCollections()
   * ```
   *
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to {@link CollectionList}.
   */
  listCollections() {
    return this._listCollections();
  }
  /**
   * Delete a collection by collection name
   *
   * @example
   * ```
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * const collectionList = await pc.listCollections()
   * const collectionName = collectionList.collections[0].name;
   * await pc.deleteCollection(collectionName)
   * ```
   *
   * @param collectionName - The name of the collection to delete.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves when the request to delete the collection is completed.
   */
  deleteCollection(collectionName) {
    return this._deleteCollection(collectionName);
  }
  /**
   * Describe a collection
   *
   * @example
   * ```js
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   *
   * await pc.describeCollection('my-collection')
   * ```
   *
   * @param collectionName - The name of the collection to describe.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A promise that resolves to a {@link CollectionModel}.
   */
  describeCollection(collectionName) {
    return this._describeCollection(collectionName);
  }
  /**
   * Creates a new Assistant.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * await pc.createAssistant({name: 'test1'});
   * // {
   * //  name: 'test11',
   * //  instructions: undefined,
   * //  metadata: undefined,
   * //  status: 'Initializing',
   * //  host: 'https://prod-1-data.ke.pinecone.io',
   * //  createdAt: 2025-01-08T22:52:49.652Z,
   * //  updatedAt: 2025-01-08T22:52:49.652Z
   * // }
   * ```
   *
   * @param options - A {@link CreateAssistantOptions} object containing the `name` of the Assistant to be created.
   * Optionally, users can also specify instructions, metadata, and host region. Region must be one of "us" or "eu"
   * and determines where the Assistant will be hosted.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to an {@link Assistant} model.
   */
  async createAssistant(options) {
    const assistant2 = await this._createAssistant(options);
    if (assistant2.host) {
      assistantHostSingleton_1.AssistantHostSingleton._set(this.config, assistant2.name, assistant2.host);
    }
    return Promise.resolve(assistant2);
  }
  /**
   * Deletes an Assistant by name.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * await pc.deleteAssistant('test1');
   * ```
   *
   * @param assistantName - The name of the Assistant to be deleted.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   */
  async deleteAssistant(assistantName) {
    await this._deleteAssistant(assistantName);
    assistantHostSingleton_1.AssistantHostSingleton._delete(this.config, assistantName);
    return Promise.resolve();
  }
  /**
   * Retrieves information about an Assistant by name.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const test = await pc.describeAssistant('test1');
   * console.log(test);
   * // {
   * //  name: 'test1',
   * //  instructions: undefined,
   * //  metadata: undefined,
   * //  status: 'Ready',
   * //  host: 'https://prod-1-data.ke.pinecone.io',
   * //  createdAt: 2025-01-08T22:24:50.525Z,
   * //  updatedAt: 2025-01-08T22:24:52.303Z
   * // }
   * ```
   *
   * @param assistantName - The name of the Assistant to retrieve.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to an {@link Assistant} model.
   */
  async describeAssistant(assistantName) {
    const assistant2 = await this._describeAssistant(assistantName);
    if (assistant2.host) {
      assistantHostSingleton_1.AssistantHostSingleton._set(this.config, assistantName, assistant2.host);
    }
    return Promise.resolve(assistant2);
  }
  /**
   * Retrieves a list of all Assistants for a given Pinecone API key.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const assistants = await pc.listAssistants();
   * console.log(assistants);
   * // {
   * //  assistants: [
   * //    {
   * //      name: 'test2',
   * //      instructions: 'test-instructions',
   * //      metadata: [Object],
   * //      status: 'Ready',
   * //      host: 'https://prod-1-data.ke.pinecone.io',
   * //      createdAt: 2025-01-06T19:14:18.633Z,
   * //      updatedAt: 2025-01-06T19:14:36.977Z
   * //    },
   * //  ]
   * // }
   * ```
   *
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to an object containing an array of {@link Assistant} models.
   */
  async listAssistants() {
    const assistantList = await this._listAssistants();
    if (assistantList.assistants && assistantList.assistants.length > 0) {
      for (let i = 0; i < assistantList.assistants.length; i++) {
        const assistant2 = assistantList.assistants[i];
        if (assistant2.host) {
          assistantHostSingleton_1.AssistantHostSingleton._set(this.config, assistant2.name, assistant2.host);
        }
      }
    }
    return Promise.resolve(assistantList);
  }
  /**
   * Updates an Assistant by name.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * await pc.updateAssistant({ name: 'test1', instructions: 'some new instructions!'});
   * // {
   * //  assistantName: test1,
   * //  instructions: 'some new instructions!',
   * //  metadata: undefined
   * // }
   * ```
   *
   * @param options - An {@link UpdateAssistantOptions} object containing the name of the assistant to be updated and
   * optional instructions and metadata.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to an {@link UpdateAssistant200Response} object.
   */
  updateAssistant(options) {
    return this._updateAssistant(options);
  }
  /**
   * Evaluates the alignment of a generated answer against a ground truth answer.
   * Returns metrics for correctness (precision), completeness (recall), and alignment (harmonic mean).
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const result = await pc.evaluate({
   *   question: "What is the capital of France?",
   *   answer: "The capital of France is Paris.",
   *   groundTruth: "Paris is the capital and most populous city of France."
   * });
   * console.log(result);
   * // {
   * //   metrics: {
   * //     correctness: 0.95,
   * //     completeness: 0.90,
   * //     alignment: 0.92
   * //   },
   * //   reasoning: { evaluatedFacts: [...] },
   * //   usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
   * // }
   * ```
   *
   * @param options - An {@link EvaluateOptions} object containing the question, answer, and groundTruth.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to an {@link AlignmentResponse} object containing metrics and reasoning.
   */
  evaluate(options) {
    return this._evaluate(options);
  }
  /** @internal */
  _checkForBrowser() {
    if ((0, environment_1.isBrowser)()) {
      console.warn("The Pinecone SDK is intended for server-side use only. Using the SDK within a browser context can expose your API key(s). If you have deployed the SDK to production in a browser, please rotate your API keys.");
    }
  }
  /**
   * @returns The configuration object that was passed to the Pinecone constructor.
   */
  getConfig() {
    return this.config;
  }
  /**
   * Creates a backup of an index.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const backup = await pc.createBackup({ indexName: 'my-index', name: 'my-index-backup-1', description: 'weekly backup' });
   * console.log(backup);
   * // {
   * //   backupId: '11450b9f-96e5-47e5-9186-03f346b1f385',
   * //   sourceIndexName: 'my-index',
   * //   sourceIndexId: 'b480770b-600d-4c4e-bf19-799c933ae2bf',
   * //   name: 'my-index-backup-1',
   * //   description: 'weekly backup',
   * //   status: 'Initializing',
   * //   cloud: 'aws',
   * //   region: 'us-east-1',
   * //   dimension: 1024,
   * //   metric: 'cosine',
   * //   recordCount: 500,
   * //   namespaceCount: 4,
   * //   sizeBytes: 78294,
   * //   tags: {},
   * //   createdAt: '2025-05-07T03:11:11.722238160Z'
   * // }
   * ```
   *
   * @param options - A {@link CreateBackupOptions} object containing the indexName to backup, and an optional name
   * and description for the backup.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to a {@link BackupModel} object.
   */
  createBackup(options) {
    return this._createBackup(options);
  }
  /**
   * Creates an index from an existing backup.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const response = await pc.createIndexFromBackup({ backupId: '11450b9f-96e5-47e5-9186-03f346b1f385', name: 'my-index-restore-1' });
   * console.log(response);
   * // {
   * //   restoreJobId: '4d4c8693-10fd-4204-a57b-1e3e626fca07',
   * //   indexId: 'deb7688b-9f21-4c16-8eb7-f0027abd27fe'
   * // }
   * ```
   *
   * @param options - A {@link CreateIndexFromBackupOptions} object containing the backupId for the backup to restore
   * the index from, and the name of the new index. Optionally, you can provide new tags or deletionProtection values for the index.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to a {@link CreateIndexFromBackupResponse} object.
   */
  createIndexFromBackup(options) {
    return this._createIndexFromBackup(options);
  }
  /**
   * Describes a backup.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const backup = await pc.describeBackup('11450b9f-96e5-47e5-9186-03f346b1f385');
   * console.log(backup);
   * // {
   * //   backupId: '11450b9f-96e5-47e5-9186-03f346b1f385',
   * //   sourceIndexName: 'my-index',
   * //   sourceIndexId: 'b480770b-600d-4c4e-bf19-799c933ae2bf',
   * //   name: 'my-index-backup-1',
   * //   description: 'weekly backup',
   * //   status: 'Initializing',
   * //   cloud: 'aws',
   * //   region: 'us-east-1',
   * //   dimension: 1024,
   * //   metric: 'cosine',
   * //   recordCount: 500,
   * //   namespaceCount: 4,
   * //   sizeBytes: 78294,
   * //   tags: {},
   * //   createdAt: '2025-05-07T03:11:11.722238160Z'
   * // }
   * ```
   *
   * @param options - The backupId of the backup to describe.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to a {@link BackupModel} object.
   */
  describeBackup(backupName) {
    return this._describeBackup(backupName);
  }
  /**
   * Describes a restore job.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const restoreJob = await pc.describeRestoreJob('4d4c8693-10fd-4204-a57b-1e3e626fca07');
   * console.log(restoreJob);
   * // {
   * //   restoreJobId: '4d4c8693-10fd-4204-a57b-1e3e626fca07',
   * //   backupId: '11450b9f-96e5-47e5-9186-03f346b1f385',
   * //   targetIndexName: 'my-index-restore-1',
   * //   targetIndexId: 'deb7688b-9f21-4c16-8eb7-f0027abd27fe',
   * //   status: 'Completed',
   * //   createdAt: 2025-05-07T03:38:37.107Z,
   * //   completedAt: 2025-05-07T03:40:23.687Z,
   * //   percentComplete: 100
   * // }
   * ```
   *
   * @param options - The restoreJobId of the restore job to describe.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to a {@link RestoreJobModel} object.
   */
  describeRestoreJob(restoreJobId) {
    return this._describeRestoreJob(restoreJobId);
  }
  /**
   * Deletes a backup.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * await pc.deleteBackup('11450b9f-96e5-47e5-9186-03f346b1f385');
   * ```
   *
   * @param options - The backupId of the backup to delete.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves when the request to delete the backup is completed.
   */
  deleteBackup(backupName) {
    return this._deleteBackup(backupName);
  }
  /**
   * Lists backups within a project or a specific index. Pass an indexName to list backups for that index,
   * otherwise the operation will return all backups in the project.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const backupsList = await pc.listBackups({ indexName: 'my-index', limit: 2 });
   * console.log(backupsList);
   * // {
   * //   data: [
   * //     {
   * //       backupId: '6a00902c-d118-4ad3-931c-49328c26d558',
   * //       sourceIndexName: 'my-index',
   * //       sourceIndexId: '0888b4d9-0b7b-447e-a403-ab057ceee4d4',
   * //       name: 'my-index-backup-2',
   * //       description: undefined,
   * //       status: 'Ready',
   * //       cloud: 'aws',
   * //       region: 'us-east-1',
   * //       dimension: 5,
   * //       metric: 'cosine',
   * //       recordCount: 200,
   * //       namespaceCount: 2,
   * //       sizeBytes: 67284,
   * //       tags: {},
   * //       createdAt: '2025-05-07T18:34:13.626650Z'
   * //     },
   * //     {
   * //       backupId: '2b362ea3-b7cf-4950-866f-0dff37ab781e',
   * //       sourceIndexName: 'my-index',
   * //       sourceIndexId: '0888b4d9-0b7b-447e-a403-ab057ceee4d4',
   * //       name: 'my-index-backup-1',
   * //       description: undefined,
   * //       status: 'Ready',
   * //       cloud: 'aws',
   * //       region: 'us-east-1',
   * //       dimension: 1024,
   * //       metric: 'cosine',
   * //       recordCount: 500,
   * //       namespaceCount: 4,
   * //       sizeBytes: 78294,
   * //       tags: {},
   * //       createdAt: '2025-05-07T18:33:59.888270Z'
   * //     },
   * //   ],
   * //   pagination: undefined
   * // }
   * ```
   *
   * @param options - A {@link ListBackupsOptions} object containing the optional indexName, limit, and paginationToken values.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to a {@link BackupList} object.
   */
  listBackups(options) {
    return this._listBackups(options);
  }
  /**
   * Lists restore jobs within a project.
   *
   * @example
   * ```typescript
   * import { Pinecone } from '@pinecone-database/pinecone';
   * const pc = new Pinecone();
   * const restoreJobsList = await pc.listRestoreJobs({ limit: 3 });
   * console.log(restoreJobsList);
   * // {
   * //   data: [
   * //     {
   * //       restoreJobId: '4d4c8693-10fd-4204-a57b-1e3e626fca07',
   * //       backupId: '11450b9f-96e5-47e5-9186-03f346b1f385',
   * //       targetIndexName: 'my-index-restore-1',
   * //       targetIndexId: 'deb7688b-9f21-4c16-8eb7-f0027abd27fe',
   * //       status: 'Completed',
   * //       createdAt: 2025-05-07T03:38:37.107Z,
   * //       completedAt: 2025-05-07T03:40:23.687Z,
   * //       percentComplete: 100
   * //     },
   * //     {
   * //       restoreJobId: 'c60a62e0-63b9-452a-88af-31d89c56c988',
   * //       backupId: '11450b9f-96e5-47e5-9186-03f346b1f385',
   * //       targetIndexName: 'my-index-restore-2',
   * //       targetIndexId: 'f2c9a846-799f-4b19-81a4-f3096b3d6114',
   * //       status: 'Completed',
   * //       createdAt: 2025-05-07T21:42:38.971Z,
   * //       completedAt: 2025-05-07T21:43:11.782Z,
   * //       percentComplete: 100
   * //     },
   * //     {
   * //       restoreJobId: '792837b7-8001-47bf-9c11-1859826b9c10',
   * //       backupId: '11450b9f-96e5-47e5-9186-03f346b1f385',
   * //       targetIndexName: 'my-index-restore-3',
   * //       targetIndexId: '620dda62-c999-4dd1-b083-6beb087b31e7',
   * //       status: 'Pending',
   * //       createdAt: 2025-05-07T21:48:39.580Z,
   * //       completedAt: 2025-05-07T21:49:12.084Z,
   * //       percentComplete: 45
   * //     }
   * //   ],
   * //   pagination: undefined
   * // }
   * ```
   *
   * @param options - A {@link ListBackupsOptions} object containing the optional indexName, limit, and paginationToken values.
   * @throws {@link Errors.PineconeArgumentError} when arguments passed to the method fail a runtime validation.
   * @throws {@link Errors.PineconeConnectionError} when network problems or an outage of Pinecone's APIs prevent the request from being completed.
   * @returns A Promise that resolves to a {@link BackupList} object.
   */
  listRestoreJobs(options) {
    return this._listRestoreJobs(options);
  }
  index(optionsOrName, indexHostUrl, additionalHeaders) {
    if (typeof optionsOrName === "string") {
      return new data_1.Index({
        name: optionsOrName,
        host: indexHostUrl,
        additionalHeaders
      }, this.config);
    }
    return new data_1.Index({
      name: optionsOrName.name,
      namespace: optionsOrName.namespace,
      host: optionsOrName.host,
      additionalHeaders: optionsOrName.additionalHeaders
    }, this.config);
  }
  Index(optionsOrName, indexHostUrl, additionalHeaders) {
    return this.index(optionsOrName, indexHostUrl, additionalHeaders);
  }
  assistant(optionsOrName, host) {
    if (typeof optionsOrName === "string") {
      return new assistant_1.Assistant({
        name: optionsOrName,
        host
      }, this.config);
    }
    return new assistant_1.Assistant(optionsOrName, this.config);
  }
  Assistant(optionsOrName, host) {
    return this.assistant(optionsOrName, host);
  }
}
pinecone.Pinecone = Pinecone;
(function(exports) {
  var __createBinding2 = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault2 = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar2 = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding2(result, mod, k);
    }
    __setModuleDefault2(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Errors = exports.ChatStream = exports.Assistant = exports.Inference = exports.Index = exports.Pinecone = void 0;
  var pinecone_1 = pinecone;
  Object.defineProperty(exports, "Pinecone", { enumerable: true, get: function() {
    return pinecone_1.Pinecone;
  } });
  var data_12 = data;
  Object.defineProperty(exports, "Index", { enumerable: true, get: function() {
    return data_12.Index;
  } });
  var inference_12 = inference$2;
  Object.defineProperty(exports, "Inference", { enumerable: true, get: function() {
    return inference_12.Inference;
  } });
  var assistant_12 = assistant;
  Object.defineProperty(exports, "Assistant", { enumerable: true, get: function() {
    return assistant_12.Assistant;
  } });
  Object.defineProperty(exports, "ChatStream", { enumerable: true, get: function() {
    return assistant_12.ChatStream;
  } });
  exports.Errors = __importStar2(errors);
})(dist);
function createPineconeClient(apiKey, strict = true) {
  if (!apiKey) {
    if (strict) throw new ProviderConfigError("Pinecone API key is not configured");
    return new dist.Pinecone({ apiKey: "not-configured" });
  }
  return new dist.Pinecone({ apiKey });
}
async function testPineconeKey(apiKey) {
  const start = Date.now();
  try {
    const client = createPineconeClient(apiKey);
    await client.listIndexes();
    return { ok: true, error: null, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      error: normalizePineconeError(err),
      latency_ms: Date.now() - start
    };
  }
}
function normalizePineconeError(err) {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("401") || msg.includes("Unauthorized")) return "Invalid API key";
    if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) return "Network error — check your connection";
    return msg;
  }
  return String(err);
}
async function createIndexIfMissing(apiKey, indexName = DEFAULT_PINECONE_INDEX_NAME, dimension = 1536, metric = "cosine") {
  try {
    const client = createPineconeClient(apiKey);
    const existing = await client.listIndexes();
    const exists = existing.indexes?.some((idx) => idx.name === indexName) ?? false;
    if (exists) {
      return { created: false, existed: true, dimension, error: null };
    }
    await client.createIndex({
      name: indexName,
      dimension,
      metric,
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1"
        }
      }
    });
    return { created: true, existed: false, dimension, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { created: false, existed: false, dimension, error };
  }
}
function getSettingJson(db, key, fallback) {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return fallback;
  }
}
function setSettingJson(db, key, value) {
  db.prepare(`
    INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value));
}
class SettingsRepo {
  constructor(db) {
    this.db = db;
  }
  loadProfile() {
    const row = this.db.prepare("SELECT * FROM user_profile WHERE id = 1").get();
    if (!row) return DEFAULT_SETTINGS.profile;
    return {
      name: row.name,
      role: row.role,
      timezone: row.timezone,
      tone_preferences: row.tone_preferences,
      current_projects: JSON.parse(row.current_projects_json)
    };
  }
  saveProfile(profile) {
    this.db.prepare(`
        UPDATE user_profile SET
          name = ?, role = ?, timezone = ?, tone_preferences = ?,
          current_projects_json = ?, updated_at = datetime('now')
        WHERE id = 1
      `).run(
      profile.name,
      profile.role,
      profile.timezone,
      profile.tone_preferences,
      JSON.stringify(profile.current_projects)
    );
  }
  loadNonSecretSettings() {
    return {
      models: getSettingJson(this.db, "models", DEFAULT_SETTINGS.models),
      retrieval: getSettingJson(this.db, "retrieval", DEFAULT_SETTINGS.retrieval),
      spend: getSettingJson(this.db, "spend", DEFAULT_SETTINGS.spend),
      theme: getSettingJson(this.db, "theme", DEFAULT_SETTINGS.theme),
      reminders_mirroring: getSettingJson(
        this.db,
        "reminders_mirroring",
        DEFAULT_SETTINGS.reminders_mirroring
      )
    };
  }
  /**
   * Persists non-secret settings from a patch.
   * API keys (openai_api_key, pinecone_api_key) are intentionally ignored here —
   * they are handled by safeStorage in the electron-pro layer.
   */
  saveFromPatch(patch) {
    if (patch.profile) this.saveProfile(patch.profile);
    if (patch.models) setSettingJson(this.db, "models", patch.models);
    if (patch.retrieval) setSettingJson(this.db, "retrieval", patch.retrieval);
    if (patch.spend) setSettingJson(this.db, "spend", patch.spend);
    if (patch.theme !== void 0) setSettingJson(this.db, "theme", patch.theme);
    if (patch.reminders_mirroring) setSettingJson(this.db, "reminders_mirroring", patch.reminders_mirroring);
  }
}
const SAFE_STORAGE_FILE = () => require$$4.join(electron.app.getPath("userData"), "safe-keys.enc.json");
function readStore() {
  try {
    const file = SAFE_STORAGE_FILE();
    if (require$$3$1.existsSync(file)) {
      return JSON.parse(require$$3$1.readFileSync(file, "utf8"));
    }
  } catch {
  }
  return {};
}
function writeStore(store) {
  require$$3$1.writeFileSync(SAFE_STORAGE_FILE(), JSON.stringify(store), "utf8");
}
function storeKey(keyName, plaintext) {
  if (!electron.safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Secure storage is not available on this system. Cannot store API keys. Ensure you are running macOS with Keychain access enabled."
    );
  }
  const encrypted = electron.safeStorage.encryptString(plaintext);
  const store = readStore();
  store[keyName] = encrypted.toString("base64");
  writeStore(store);
}
function retrieveKey(keyName) {
  if (!electron.safeStorage.isEncryptionAvailable()) return null;
  const store = readStore();
  const encoded = store[keyName];
  if (!encoded) return null;
  try {
    return electron.safeStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
}
function isKeySet(keyName) {
  const store = readStore();
  return !!store[keyName];
}
function getSettingsRepo() {
  return new SettingsRepo(getDb());
}
function buildMaskedSettings(repo) {
  return {
    ...repo.loadNonSecretSettings(),
    profile: repo.loadProfile(),
    openai_api_key_set: isKeySet("openai"),
    pinecone_api_key_set: isKeySet("pinecone")
  };
}
function validatePatch(patch) {
  if (typeof patch !== "object" || patch === null) {
    throw new Error("Invalid patch: expected object");
  }
  const p = patch;
  if ("openai_api_key" in p) {
    if (typeof p["openai_api_key"] !== "string" || p["openai_api_key"].length < 20) {
      throw new Error("openai_api_key must be a string of at least 20 characters");
    }
  }
  if ("pinecone_api_key" in p) {
    if (typeof p["pinecone_api_key"] !== "string" || p["pinecone_api_key"].length < 20) {
      throw new Error("pinecone_api_key must be a string of at least 20 characters");
    }
  }
  if ("models" in p && p["models"] !== void 0) {
    const m = p["models"];
    if (typeof m["embeddings_model"] !== "string") {
      throw new Error("models.embeddings_model must be a string");
    }
    if (typeof m["chat_model"] !== "string") {
      throw new Error("models.chat_model must be a string");
    }
    if (typeof m["transcription_model"] !== "string") {
      throw new Error("models.transcription_model must be a string");
    }
  }
  if ("retrieval" in p && p["retrieval"] !== void 0) {
    const r = p["retrieval"];
    const fields = ["top_k_docs", "top_k_chat", "chunk_size_tokens", "chunk_overlap_tokens"];
    for (const field of fields) {
      if (r[field] !== void 0 && (typeof r[field] !== "number" || r[field] < 1)) {
        throw new Error(`retrieval.${field} must be a positive number`);
      }
    }
  }
  if ("spend" in p && p["spend"] !== void 0) {
    const s = p["spend"];
    if (s["daily_cap_usd"] !== void 0 && (typeof s["daily_cap_usd"] !== "number" || s["daily_cap_usd"] < 0)) {
      throw new Error("spend.daily_cap_usd must be >= 0");
    }
    if (s["confirm_threshold_usd"] !== void 0 && (typeof s["confirm_threshold_usd"] !== "number" || s["confirm_threshold_usd"] < 0)) {
      throw new Error("spend.confirm_threshold_usd must be >= 0");
    }
  }
  if ("theme" in p && !["system", "light", "dark"].includes(p["theme"])) {
    throw new Error("theme must be system, light, or dark");
  }
  return p;
}
function registerSettingsHandlers() {
  electron.ipcMain.handle("settings:get", async () => {
    const repo = getSettingsRepo();
    return buildMaskedSettings(repo);
  });
  electron.ipcMain.handle("settings:set", async (_event, rawPatch) => {
    const patch = validatePatch(rawPatch);
    const repo = getSettingsRepo();
    if (patch.openai_api_key) {
      storeKey("openai", patch.openai_api_key);
    }
    if (patch.pinecone_api_key) {
      storeKey("pinecone", patch.pinecone_api_key);
    }
    repo.saveFromPatch(patch);
    return buildMaskedSettings(repo);
  });
  electron.ipcMain.handle("settings:testConnections", async () => {
    const openaiKey = retrieveKey("openai");
    const pineconeKey = retrieveKey("pinecone");
    const [openai, pinecone2] = await Promise.all([
      openaiKey ? testOpenAIKey(openaiKey) : Promise.resolve({ ok: false, error: "OpenAI API key is not set", latency_ms: null }),
      pineconeKey ? testPineconeKey(pineconeKey) : Promise.resolve({ ok: false, error: "Pinecone API key is not set", latency_ms: null })
    ]);
    return { openai, pinecone: pinecone2 };
  });
  electron.ipcMain.handle("settings:createPineconeIndex", async () => {
    const pineconeKey = retrieveKey("pinecone");
    if (!pineconeKey) {
      return { created: false, existed: false, dimension: 0, error: "Pinecone API key is not set" };
    }
    const repo = getSettingsRepo();
    const { models: models2 } = repo.loadNonSecretSettings();
    const catalogEntry = EMBEDDING_MODEL_CATALOG.find((e) => e.id === models2.embeddings_model);
    const dimension = catalogEntry?.dimension ?? 1536;
    return createIndexIfMissing(pineconeKey, void 0, dimension);
  });
}
function stateFile() {
  return require$$4.join(electron.app.getPath("userData"), "window-state.json");
}
function loadWindowState() {
  try {
    const file = stateFile();
    if (require$$3$1.existsSync(file)) {
      return JSON.parse(require$$3$1.readFileSync(file, "utf8"));
    }
  } catch {
  }
  return { width: 1280, height: 820 };
}
function saveWindowState(win) {
  const bounds = win.getBounds();
  try {
    require$$3$1.writeFileSync(stateFile(), JSON.stringify(bounds));
  } catch {
  }
}
function buildMenu(win) {
  const isMac = process.platform === "darwin";
  const template = [
    ...isMac ? [
      {
        label: electron.app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => win.webContents.send("menu:navigate", "/settings")
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => win.webContents.send("menu:navigate", "/chat")
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Inbox",
          accelerator: "CmdOrCtrl+1",
          click: () => win.webContents.send("menu:navigate", "/inbox")
        },
        {
          label: "Library",
          accelerator: "CmdOrCtrl+2",
          click: () => win.webContents.send("menu:navigate", "/library")
        },
        {
          label: "Chat",
          accelerator: "CmdOrCtrl+3",
          click: () => win.webContents.send("menu:navigate", "/chat")
        },
        {
          label: "Feed",
          accelerator: "CmdOrCtrl+4",
          click: () => win.webContents.send("menu:navigate", "/feed")
        },
        { type: "separator" },
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+\\",
          click: () => win.webContents.send("menu:toggle-sidebar")
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" }
      ]
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Bestfriend Help",
          click: () => electron.shell.openExternal("https://bestfriend.app/help")
        }
      ]
    }
  ];
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
function createWindow() {
  const state = loadWindowState();
  const win = new electron.BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 980,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: require$$4.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  win.on("close", () => saveWindowState(win));
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(require$$4.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
function registerIpcHandlers() {
  electron.ipcMain.handle("ping", () => "pong");
  registerSettingsHandlers();
}
function sendTheme(win) {
  win.webContents.send("theme:update", electron.nativeTheme.shouldUseDarkColors ? "dark" : "light");
}
electron.app.on("quit", () => closeDb());
electron.app.whenReady().then(() => {
  initDb();
  const win = createWindow();
  buildMenu(win);
  registerIpcHandlers();
  electron.nativeTheme.on("updated", () => sendTheme(win));
  win.webContents.once("did-finish-load", () => sendTheme(win));
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      win.show();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
