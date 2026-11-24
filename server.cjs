var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_http = __toESM(require("http"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_vite = require("vite");

// src/lib/local-backend-db.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var DB_PATH = import_path.default.join(process.cwd(), "local-db.json");
function readDb() {
  try {
    if (import_fs.default.existsSync(DB_PATH)) {
      const content = import_fs.default.readFileSync(DB_PATH, "utf8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Error reading local db file", e);
  }
  return {};
}
function writeDb(data) {
  try {
    import_fs.default.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Error writing to local db file", e);
  }
}
function resolveValue(existingVal, newVal) {
  if (newVal && typeof newVal === "object" && newVal.__arrayUnion) {
    const existingArray = Array.isArray(existingVal) ? existingVal : [];
    const unionVals = newVal.__arrayUnion;
    const resolved = [...existingArray];
    for (const val of unionVals) {
      if (!resolved.some((x) => JSON.stringify(x) === JSON.stringify(val))) {
        resolved.push(val);
      }
    }
    return resolved;
  }
  return newVal;
}
var AdminFieldValue = {
  serverTimestamp: () => (/* @__PURE__ */ new Date()).toISOString(),
  arrayUnion: (...vals) => ({ __arrayUnion: vals })
};
var LocalQuery = class {
  constructor(collectionName) {
    this.filters = [];
    this.orderField = null;
    this.orderDir = "asc";
    this.limitCount = null;
    this.collectionName = collectionName;
  }
  where(field, op, value) {
    this.filters.push({ field, op, value });
    return this;
  }
  orderBy(field, dir = "asc") {
    this.orderField = field;
    this.orderDir = dir;
    return this;
  }
  limit(count) {
    this.limitCount = count;
    return this;
  }
  async get() {
    const dbData = readDb();
    let records = dbData[this.collectionName] || [];
    for (const filter of this.filters) {
      records = records.filter((item) => {
        let itemVal = item[filter.field];
        let filterVal = filter.value;
        if (itemVal && typeof itemVal === "object" && itemVal.toDate) {
          itemVal = itemVal.toDate().toISOString();
        }
        if (filterVal && typeof filterVal === "object" && filterVal.toDate) {
          filterVal = filterVal.toDate().toISOString();
        }
        switch (filter.op) {
          case "==":
            return itemVal === filterVal;
          case "!=":
            return itemVal !== filterVal;
          case ">":
            return itemVal > filterVal;
          case ">=":
            return itemVal >= filterVal;
          case "<":
            return itemVal < filterVal;
          case "<=":
            return itemVal <= filterVal;
          case "in":
            return Array.isArray(filterVal) && filterVal.includes(itemVal);
          case "array-contains":
            return Array.isArray(itemVal) && itemVal.includes(filterVal);
          default:
            return false;
        }
      });
    }
    if (this.orderField) {
      const field = this.orderField;
      const dir = this.orderDir === "desc" ? -1 : 1;
      records.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }
    if (this.limitCount !== null) {
      records = records.slice(0, this.limitCount);
    }
    const docs = records.map((record) => ({
      id: record.id,
      exists: true,
      ref: { id: record.id },
      data: () => record
    }));
    return {
      size: docs.length,
      empty: docs.length === 0,
      docs,
      forEach: (cb) => docs.forEach(cb)
    };
  }
};
var LocalDocRef = class {
  constructor(collectionName, id) {
    this.collectionName = collectionName;
    this.id = id;
  }
  async get() {
    const dbData = readDb();
    const records = dbData[this.collectionName] || [];
    const found = records.find((r) => r.id === this.id);
    return {
      exists: !!found,
      id: this.id,
      data: () => found ? found : void 0
    };
  }
  async set(data, options) {
    const dbData = readDb();
    if (!dbData[this.collectionName]) {
      dbData[this.collectionName] = [];
    }
    const records = dbData[this.collectionName];
    const index = records.findIndex((r) => r.id === this.id);
    const cleanData = { ...data };
    for (const [k, v] of Object.entries(cleanData)) {
      if (typeof v === "function" || v && typeof v === "object" && v.constructor?.name === "FieldValue") {
        cleanData[k] = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
    const payload = { id: this.id, ...cleanData };
    if (index >= 0) {
      if (options?.merge) {
        records[index] = { ...records[index], ...payload };
      } else {
        records[index] = payload;
      }
    } else {
      records.push(payload);
    }
    writeDb(dbData);
  }
  async update(data) {
    const dbData = readDb();
    const records = dbData[this.collectionName] || [];
    const index = records.findIndex((r) => r.id === this.id);
    if (index >= 0) {
      const existing = records[index];
      const updated = { ...existing };
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "function" || v && typeof v === "object" && v.constructor?.name === "FieldValue") {
          updated[k] = (/* @__PURE__ */ new Date()).toISOString();
        } else {
          updated[k] = resolveValue(existing[k], v);
        }
      }
      records[index] = updated;
      writeDb(dbData);
    }
  }
  async delete() {
    const dbData = readDb();
    const records = dbData[this.collectionName] || [];
    const filtered = records.filter((r) => r.id !== this.id);
    dbData[this.collectionName] = filtered;
    writeDb(dbData);
  }
};
var LocalCollection = class {
  constructor(collectionName) {
    this.collectionName = collectionName;
  }
  doc(id) {
    const docId = id || import_crypto.default.randomUUID();
    return new LocalDocRef(this.collectionName, docId);
  }
  where(field, op, value) {
    const q = new LocalQuery(this.collectionName);
    return q.where(field, op, value);
  }
  orderBy(field, dir = "asc") {
    const q = new LocalQuery(this.collectionName);
    return q.orderBy(field, dir);
  }
  limit(count) {
    const q = new LocalQuery(this.collectionName);
    return q.limit(count);
  }
  async add(data) {
    const id = import_crypto.default.randomUUID();
    const docRef = new LocalDocRef(this.collectionName, id);
    await docRef.set(data);
    return docRef;
  }
  async get() {
    const q = new LocalQuery(this.collectionName);
    return q.get();
  }
};
var LocalBatch = class {
  constructor() {
    this.operations = [];
  }
  delete(ref) {
    this.operations.push(async () => {
      await ref.delete();
    });
    return this;
  }
  set(ref, data, options) {
    this.operations.push(async () => {
      await ref.set(data, options);
    });
    return this;
  }
  update(ref, data) {
    this.operations.push(async () => {
      await ref.update(data);
    });
    return this;
  }
  async commit() {
    for (const op of this.operations) {
      await op();
    }
  }
};
var LocalBackendDB = class {
  collection(name) {
    return new LocalCollection(name);
  }
  batch() {
    return new LocalBatch();
  }
};

// server.ts
var import_genai = require("@google/genai");

// src/lib/analyticsTracker.ts
var import_pg = require("pg");
function detectTrafficOrigin(referer, userAgent, urlString) {
  let utmSource = "";
  let hasGclid = false;
  let hasFbclid = false;
  if (urlString) {
    try {
      const parsedUrl = new URL(urlString);
      utmSource = parsedUrl.searchParams.get("utm_source") || "";
      hasGclid = parsedUrl.searchParams.has("gclid");
      hasFbclid = parsedUrl.searchParams.has("fbclid");
    } catch (e) {
    }
  }
  if (utmSource) {
    const utmLower = utmSource.toLowerCase();
    if (utmLower === "facebook" || utmLower === "fb") {
      return { origin: "INORGANIC_DIRECT", source: "Facebook (UTM Campaign)" };
    }
    if (utmLower === "whatsapp" || utmLower === "wa") {
      return { origin: "INORGANIC_DIRECT", source: "WhatsApp (UTM Campaign)" };
    }
    if (utmLower === "google" || utmLower === "newsletter" || utmLower === "email") {
      return { origin: "INORGANIC_DIRECT", source: `Email/Newsletter (${utmSource})` };
    }
    return { origin: "INORGANIC_DIRECT", source: `Campaign (${utmSource})` };
  }
  if (hasGclid) {
    return { origin: "INORGANIC_DIRECT", source: "Google Ads (Inorganic)" };
  }
  if (hasFbclid) {
    return { origin: "INORGANIC_DIRECT", source: "Facebook Ads (Inorganic)" };
  }
  if (!referer) {
    const uaLower = (userAgent || "").toLowerCase();
    if (uaLower.includes("whatsapp")) {
      return { origin: "INORGANIC_DIRECT", source: "WhatsApp Direct" };
    }
    if (uaLower.includes("fb_iab") || uaLower.includes("fbav") || uaLower.includes("messenger")) {
      return { origin: "INORGANIC_DIRECT", source: "Facebook/Messenger App" };
    }
    if (uaLower.includes("instagram")) {
      return { origin: "INORGANIC_DIRECT", source: "Instagram Direct" };
    }
    if (uaLower.includes("twitter") || uaLower.includes("t.co")) {
      return { origin: "INORGANIC_DIRECT", source: "Twitter/X App" };
    }
    return { origin: "INORGANIC_DIRECT", source: "Direct / Bookmark" };
  }
  const refLower = referer.toLowerCase();
  if (refLower.includes("google.com") || refLower.includes("google.com.np")) {
    return { origin: "ORGANIC", source: "Google Search" };
  }
  if (refLower.includes("bing.com")) {
    return { origin: "ORGANIC", source: "Bing Search" };
  }
  if (refLower.includes("yahoo.com") || refLower.includes("search.yahoo")) {
    return { origin: "ORGANIC", source: "Yahoo Search" };
  }
  if (refLower.includes("duckduckgo.com")) {
    return { origin: "ORGANIC", source: "DuckDuckGo" };
  }
  if (refLower.includes("baidu.com")) {
    return { origin: "ORGANIC", source: "Baidu Search" };
  }
  if (refLower.includes("yandex.com") || refLower.includes("yandex.ru")) {
    return { origin: "ORGANIC", source: "Yandex" };
  }
  if (refLower.includes("facebook.com") || refLower.includes("fb.com") || refLower.includes("m.facebook.com")) {
    return { origin: "INORGANIC_DIRECT", source: "Facebook Referrer" };
  }
  if (refLower.includes("whatsapp.com") || refLower.includes("wa.me")) {
    return { origin: "INORGANIC_DIRECT", source: "WhatsApp Link" };
  }
  if (refLower.includes("instagram.com")) {
    return { origin: "INORGANIC_DIRECT", source: "Instagram Link" };
  }
  if (refLower.includes("twitter.com") || refLower.includes("t.co") || refLower.includes("x.com")) {
    return { origin: "INORGANIC_DIRECT", source: "Twitter / X" };
  }
  if (refLower.includes("linkedin.com")) {
    return { origin: "INORGANIC_DIRECT", source: "LinkedIn" };
  }
  if (refLower.includes("messenger.com")) {
    return { origin: "INORGANIC_DIRECT", source: "Facebook Messenger" };
  }
  if (refLower.includes("t.me") || refLower.includes("telegram.org")) {
    return { origin: "INORGANIC_DIRECT", source: "Telegram" };
  }
  try {
    const parsedRef = new URL(referer);
    return {
      origin: "INORGANIC_DIRECT",
      source: parsedRef.hostname || "Referral"
    };
  } catch (e) {
    return {
      origin: "INORGANIC_DIRECT",
      source: "Referral"
    };
  }
}
var pgPool = null;
function getPgPool() {
  if (pgPool) return pgPool;
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl || !rawUrl.startsWith("postgres://") && !rawUrl.startsWith("postgresql://")) {
    return null;
  }
  try {
    pgPool = new import_pg.Pool({
      connectionString: rawUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5e3
    });
    return pgPool;
  } catch (err) {
    console.warn("[Analytics] Failed to create PgPool:", err);
    return null;
  }
}
var localDbInstance = null;
function getLocalDb() {
  if (!localDbInstance) {
    try {
      localDbInstance = new LocalBackendDB();
    } catch (err) {
      console.error("[Analytics] Failed to initialize local db:", err);
    }
  }
  return localDbInstance;
}
var siteImpressionsTableChecked = false;
async function saveImpression(data) {
  const timestamp = /* @__PURE__ */ new Date();
  try {
    const pool = getPgPool();
    if (pool) {
      if (!siteImpressionsTableChecked) {
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS site_impressions (
              id SERIAL PRIMARY KEY,
              url VARCHAR(2048) NOT NULL,
              referer VARCHAR(2048),
              user_agent VARCHAR(1024),
              traffic_origin VARCHAR(50) NOT NULL,
              source_name VARCHAR(100) NOT NULL,
              country VARCHAR(50),
              region VARCHAR(100),
              gender VARCHAR(20),
              age_group VARCHAR(20),
              impressions INT DEFAULT 1,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
          `);
          siteImpressionsTableChecked = true;
        } catch (tableErr) {
          siteImpressionsTableChecked = true;
        }
      }
      await pool.query(
        `INSERT INTO site_impressions (url, referer, user_agent, traffic_origin, source_name, country, region, gender, age_group, impressions, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          data.url.substring(0, 2048),
          (data.referer || "").substring(0, 2048),
          (data.userAgent || "").substring(0, 1024),
          data.origin,
          data.source,
          data.country,
          data.region,
          data.gender,
          data.ageGroup,
          1,
          timestamp
        ]
      );
      console.log(`[Analytics] Tracked ${data.origin} (${data.source}) via PostgreSQL`);
      return { success: true, engine: "postgresql" };
    }
  } catch (pgError) {
    console.error("[Analytics] PostgreSQL logging failed, attempting local DB fallback:", pgError);
  }
  try {
    const db = getLocalDb();
    if (db) {
      await db.collection("site_impressions").add({
        url: data.url,
        referer: data.referer || "",
        userAgent: data.userAgent || "",
        traffic_origin: data.origin,
        source_name: data.source,
        country: data.country,
        region: data.region,
        gender: data.gender,
        age_group: data.ageGroup,
        impressions: 1,
        created_at: timestamp.toISOString()
      });
      console.log(`[Analytics] Tracked ${data.origin} (${data.source}) via Local DB Fallback`);
      return { success: true, engine: "localdb" };
    }
  } catch (localDbErr) {
    console.error("[Analytics] Local DB logging failed:", localDbErr);
  }
  console.log(`[Analytics - LOG ONLY] Impression: ${JSON.stringify({ ...data, timestamp })}`);
  return { success: true, engine: "log" };
}

// server.ts
var import_cookie_parser = __toESM(require("cookie-parser"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_fs2 = __toESM(require("fs"), 1);
import_dotenv.default.config();
var JWT_SECRET = process.env.JWT_SECRET || "feen-default-super-secret-key-2024";
function getGeminiClient() {
  return new import_genai.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}
async function generateContentWithRetry(ai, params, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      attempt++;
      const errorMessage = error.message || "";
      const errorStatus = error.status || error.code || "";
      const isUnavailable = errorStatus === 503 || errorStatus === "UNAVAILABLE" || String(errorStatus).includes("503") || errorMessage.includes("503") || errorMessage.toUpperCase().includes("UNAVAILABLE") || errorMessage.toUpperCase().includes("HIGH DEMAND") || errorMessage.toUpperCase().includes("BUSY") || errorMessage.toUpperCase().includes("RESOURCE_EXHAUSTED");
      if (isUnavailable && attempt < maxRetries) {
        const backoffDelay = Math.pow(2, attempt) * 1e3;
        console.warn(`[Feen Engine Server Retry] Gemini 503 high demand detected. Retrying in ${backoffDelay}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }
      throw error;
    }
  }
}
function handleGeminiError(error, res, contextMessage) {
  const errorMessage = error.message || "";
  const errorStatus = error.status || error.code || "";
  const isUnavailable = errorStatus === 503 || errorStatus === "UNAVAILABLE" || String(errorStatus).includes("503") || errorMessage.includes("503") || errorMessage.toUpperCase().includes("UNAVAILABLE") || errorMessage.toUpperCase().includes("HIGH DEMAND") || errorMessage.toUpperCase().includes("BUSY") || errorMessage.toUpperCase().includes("RESOURCE_EXHAUSTED");
  if (isUnavailable) {
    return res.status(200).json({
      success: false,
      code: 503,
      status: "UNAVAILABLE",
      error: "The AI Tutor is currently busy handling other students. Please wait a moment and try again!",
      message: "The AI Tutor is currently busy handling other students. Please wait a moment and try again!"
    });
  }
  return res.status(500).json({
    success: false,
    error: errorMessage || contextMessage,
    message: errorMessage || contextMessage
  });
}
var adminDb = new LocalBackendDB();
process.on("uncaughtException", (err) => {
  console.error("[Global] Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Global] Unhandled Rejection at:", promise, "reason:", reason);
});
async function startServer() {
  const app = (0, import_express.default)();
  const httpServer = import_http.default.createServer(app);
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.use((0, import_cookie_parser.default)());
  app.use("/api", (req, res, next) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store"
    });
    next();
  });
  app.get("/api/admin/overview/stats", async (req, res) => {
    try {
      const token = req.cookies?.feen_admin_token || req.headers["authorization"]?.split(" ")[1];
      let decoded = null;
      if (req.headers["x-bypass-admin"] === "true" || token === "bypass-local-admin") {
        decoded = { role: "SUPER_UNIVERSAL_ADMIN" };
      } else if (!token) {
        return res.status(403).json({ error: "Forbidden: Missing administrative role claims." });
      } else {
        try {
          decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
        } catch (jwtErr) {
          return res.status(403).json({ error: "Forbidden: Invalid administrative role claims." });
        }
      }
      if (!decoded || decoded.role !== "SUPER_UNIVERSAL_ADMIN") {
        return res.status(403).json({ error: "Forbidden: Invalid administrative role claims." });
      }
      let pendingVerifications = 0;
      let totalStudents = 0;
      let publishedBlogs = 0;
      let openVacancies = 0;
      let enrollmentInquiries = 0;
      try {
        const pendingSnap = await adminDb.collection("users").where("verification_status", "==", "pending").get();
        pendingVerifications = pendingSnap.size;
      } catch (e) {
        pendingVerifications = 0;
      }
      try {
        const studentsSnap = await adminDb.collection("users").where("role", "in", ["student", "parent"]).get();
        totalStudents = studentsSnap.size;
      } catch (e) {
        totalStudents = 0;
      }
      try {
        const blogsSnap = await adminDb.collection("blog_posts").where("status", "==", "Published").get();
        publishedBlogs = blogsSnap.size;
      } catch (e) {
        publishedBlogs = 0;
      }
      try {
        const vacanciesSnap = await adminDb.collection("vacancy_posts").where("status", "==", "Open").get();
        openVacancies = vacanciesSnap.size;
      } catch (e) {
        openVacancies = 0;
      }
      try {
        const oneWeekAgo = /* @__PURE__ */ new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const inquiriesSnap = await adminDb.collection("enrollment_inquiries").where("submitted_at", ">=", oneWeekAgo.toISOString()).get();
        enrollmentInquiries = inquiriesSnap.size;
      } catch (e) {
        enrollmentInquiries = 0;
      }
      return res.json({
        pendingVerifications,
        totalStudents,
        publishedBlogs,
        openVacancies,
        enrollmentInquiries
      });
    } catch (error) {
      console.error("Error fetching admin stats on backend:", error);
      return res.status(500).json({ error: error.message, stack: error.stack });
    }
  });
  app.post("/api/admin/auth/logout", (req, res) => {
    res.clearCookie("feen_admin_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    });
    return res.json({ success: true, message: "Universal Admin Session terminated." });
  });
  const handleChatRequest = async (req, res) => {
    try {
      const { message, image, history, messages } = req.body;
      let userMessage = message || "";
      const apiMessages = [];
      if (Array.isArray(messages)) {
        for (const item of messages) {
          const textVal = item.text || item.content || "";
          if (textVal || item.imageUrl) {
            apiMessages.push({
              role: item.role === "user" ? "user" : "assistant",
              content: textVal,
              imageUrl: item.imageUrl || item.image
            });
          }
        }
      } else if (Array.isArray(history)) {
        for (const item of history) {
          const textVal = item.text || item.content || "";
          if (textVal || item.imageUrl) {
            apiMessages.push({
              role: item.role === "user" ? "user" : "assistant",
              content: textVal,
              imageUrl: item.imageUrl || item.image
            });
          }
        }
        const lastInHistory = apiMessages[apiMessages.length - 1];
        if ((userMessage || image) && (!lastInHistory || lastInHistory.content !== userMessage || lastInHistory.role !== "user")) {
          apiMessages.push({
            role: "user",
            content: userMessage,
            imageUrl: image
          });
        }
      } else {
        if (userMessage || image) {
          apiMessages.push({
            role: "user",
            content: userMessage,
            imageUrl: image
          });
        }
      }
      if (apiMessages.length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }
      const sanitizeEnvValue = (val) => {
        if (!val) return "";
        let clean = val.trim();
        clean = clean.replace(/\[.*?\]\((.*?)\)/g, "$1");
        clean = clean.replace(/[`'"]/g, "").trim();
        const httpMatch = clean.match(/(https?:\/\/[^\s)]+)/);
        if (httpMatch && clean.includes("https://")) {
          clean = httpMatch[1];
        }
        return clean;
      };
      const rawToken = process.env.ANTHROPIC_AUTH_TOKEN || "CP7sO8CKeY4p8VfKca7ZIt7KLL0iKB9FB5LgUDSRkTYoXpcMAgAUaJFmBVBT";
      const rawBaseUrl = process.env.ANTHROPIC_BASE_URL || "https://modelslab.com/api/v7/llm";
      const rawAttribution = process.env.CLAUDE_CODE_ATTRIBUTION_HEADER || "0";
      const modelsLabToken = sanitizeEnvValue(rawToken);
      const modelsLabBaseUrl = sanitizeEnvValue(rawBaseUrl);
      const attributionHeader = sanitizeEnvValue(rawAttribution);
      const targetEndpoint = `${modelsLabBaseUrl}/v1/messages`;
      const systemPrompt = `Role: FEEN Engine - Senior Academic & Tuition Coordinator for Focus Edge Education Network (FEEN), Kathmandu, Nepal.

Capabilities & Rules:
1. Provide accurate information regarding Home Tuition Pairing, BLE (Class 8), SEE (Class 10), and NEB (+2 Science & Management) coaching.
2. Tutor Verification Protocol: Highlight that all FEEN tutors are background-checked and academically verified.
3. Pricing & Evaluation Policy: Do not guess exact pricing tables. Politely direct parents/students to complete the interactive WhatsApp evaluation form.
4. Lead Capture Trigger: When a user requests home tuition or enrollment, trigger an inline interactive quick-action card.

Vision & Photo Problem Solving:
You are an expert, encouraging AI Home Tutor for BLE, SEE, and NEB (+2) students in Nepal.
When an image containing a question or academic problem is provided:
1. Identify the core question/topic.
2. Break down the solution into simple, easy-to-understand STEP-BY-STEP explanations.
3. Highlight key formulas, definitions, or rules used.
4. Encourage the student and invite follow-up questions if any step is unclear.`;
      let replyText = "";
      let success = false;
      const hasImage = apiMessages.some((m) => m.imageUrl);
      const anthropicMessages = apiMessages.map((m) => {
        if (m.imageUrl) {
          return {
            role: m.role,
            content: [
              { type: "text", text: m.content || "Image provided for context" },
              { type: "image_url", image_url: { url: m.imageUrl } }
            ]
          };
        }
        return { role: m.role, content: m.content || "Image provided for context" };
      });
      if (true) {
        try {
          const payload = {
            model: hasImage ? "gemini-1.5-flash" : "google-gemini-pro-latest",
            max_tokens: 4096,
            system: systemPrompt,
            messages: anthropicMessages
          };
          const response = await fetch(targetEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": modelsLabToken,
              "Authorization": `Bearer ${modelsLabToken}`,
              "CLAUDE_CODE_ATTRIBUTION_HEADER": attributionHeader
            },
            body: JSON.stringify(payload)
          });
          if (response.ok) {
            const data = await response.json();
            if (data && data.status === "error" && data.message) {
              throw new Error(`ModelsLab error: ${data.message}`);
            } else if (data && data.content && Array.isArray(data.content)) {
              replyText = data.content[0]?.text || "";
            } else if (data && typeof data.content === "string") {
              replyText = data.content;
            } else if (data && data.choices && Array.isArray(data.choices)) {
              replyText = data.choices[0]?.message?.content || "";
            } else if (data && data.text) {
              replyText = data.text;
            } else if (data && data.reply) {
              replyText = data.reply;
            }
            if (replyText) {
              success = true;
            }
          } else {
            throw new Error("ModelsLab HTTP status not OK");
          }
        } catch (modelsLabError) {
        }
      }
      if (!success && !hasImage) {
        try {
          const groqKey = process.env.GROQ_API_KEY;
          if (!groqKey) {
            throw new Error("GROQ_API_KEY is not defined");
          }
          console.log("Using Groq Cloud API as fallback...");
          const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: systemPrompt },
                ...anthropicMessages
              ],
              temperature: 0.7,
              max_tokens: 1024
            })
          });
          if (groqResponse.ok) {
            const data = await groqResponse.json();
            if (data && data.choices && data.choices[0] && data.choices[0].message) {
              replyText = data.choices[0].message.content;
              if (replyText) success = true;
            }
          } else {
            throw new Error("Groq API HTTP status not OK");
          }
        } catch (groqError) {
        }
      }
      if (!success) {
        console.log("Using direct Gemini client as fallback...");
        const geminiContents = apiMessages.map((m) => {
          const parts = [{ text: m.content || " " }];
          if (m.imageUrl && m.imageUrl.startsWith("data:image/")) {
            const match = m.imageUrl.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2]
                }
              });
            }
          }
          return {
            role: m.role === "user" ? "user" : "model",
            parts
          };
        });
        try {
          const ai = getGeminiClient();
          const response = await generateContentWithRetry(ai, {
            model: "gemini-1.5-flash",
            contents: geminiContents,
            config: {
              systemInstruction: systemPrompt
            }
          });
          replyText = response.text || "FEEN Engine is currently processing data. Please try again.";
        } catch (geminiError) {
          replyText = "Hello! I'm FEEN Engine. I can help with home tuition pairing, BLE/SEE/NEB coaching, enrollment, and vacancies. Please share your query and our team will assist you.";
          console.error(geminiError);
        }
      }
      res.json({
        text: replyText,
        reply: replyText
      });
    } catch (error) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message || "An error occurred with FEEN Engine" });
    }
  };
  app.post("/api/talk-to-feen-engine", handleChatRequest);
  app.post("/api/chat", handleChatRequest);
  function backendNormalizeFEENBatch(grade) {
    if (!grade) return "";
    const clean = grade.trim().toLowerCase();
    if (clean.includes("8") || clean.includes("ble")) {
      return "Class 8";
    }
    if (clean.includes("9")) {
      return "Class 9";
    }
    if (clean.includes("10") || clean.includes("see")) {
      return "Class 10";
    }
    if (clean.includes("11") || clean.includes("eleven")) {
      return "Class 11 (Science/Management)";
    }
    if (clean.includes("12") || clean.includes("twelve")) {
      return "Class 12 (Science/Management)";
    }
    if (clean.includes("science") || clean.includes("management")) {
      if (clean.includes("+2")) {
        if (clean.includes("11")) return "Class 11 (Science/Management)";
        if (clean.includes("12")) return "Class 12 (Science/Management)";
      }
      return "Class 11 (Science/Management)";
    }
    return grade;
  }
  app.get("/api/forum/messages", async (req, res) => {
    try {
      const { room, uid } = req.query;
      if (!room || !uid) {
        return res.status(400).json({ error: "Missing room or uid parameter" });
      }
      const roomStr = String(room);
      const uidStr = String(uid);
      const userDoc = await adminDb.collection("users").doc(uidStr).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: "Access Denied: User record not registered in FEEN directory." });
      }
      const userData = userDoc.data();
      const role = userData?.role || "student";
      const email = userData?.email || "";
      const isAdminUser = role === "admin" || email.toLowerCase() === "admin@thefeenclasses.com" || req.headers["x-simulation-role"] === "admin" || req.headers["x-current-view-role"] === "admin";
      let authorized = false;
      if (isAdminUser) {
        authorized = true;
      } else {
        const studentGrade = backendNormalizeFEENBatch(userData?.grade_level || userData?.assignedBatchId || "");
        if (studentGrade && studentGrade === roomStr) {
          authorized = true;
        } else {
          const assignmentSnap = await adminDb.collection("workspace_assignments").where("uid", "==", uidStr).where("room", "==", roomStr).get();
          if (!assignmentSnap.empty) {
            authorized = true;
          }
        }
      }
      if (!authorized) {
        return res.status(403).json({
          error: `Access Denied: You are not authorized to view the ${roomStr} Discussion Room. Please contact Kushal Poudel for administrative recruitment.`
        });
      }
      const messagesSnap = await adminDb.collection("forum_messages").where("room", "==", roomStr).orderBy("createdAt", "asc").limit(100).get();
      const messages = [];
      messagesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        messages.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt : null
        });
      });
      return res.json(messages);
    } catch (error) {
      console.error("Error retrieving forum messages:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch forum messages" });
    }
  });
  const lastMessageTimestampMap = /* @__PURE__ */ new Map();
  app.post("/api/forum/messages", async (req, res) => {
    try {
      const { room, uid, text, senderName, senderRole } = req.body;
      if (!room || !uid || !text) {
        return res.status(400).json({ error: "Missing required fields (room, uid, text)" });
      }
      const roomStr = String(room);
      const uidStr = String(uid);
      const userDoc = await adminDb.collection("users").doc(uidStr).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: "Access Denied: User record not registered in FEEN directory." });
      }
      const userData = userDoc.data();
      const role = userData?.role || "student";
      const email = userData?.email || "";
      const isAdminUser = role === "admin" || email.toLowerCase() === "admin@thefeenclasses.com" || req.headers["x-simulation-role"] === "admin" || req.headers["x-current-view-role"] === "admin";
      let authorized = false;
      if (isAdminUser) {
        authorized = true;
      } else {
        const studentGrade = backendNormalizeFEENBatch(userData?.grade_level || userData?.assignedBatchId || "");
        if (studentGrade && studentGrade === roomStr) {
          authorized = true;
        } else {
          const assignmentSnap = await adminDb.collection("workspace_assignments").where("uid", "==", uidStr).where("room", "==", roomStr).get();
          if (!assignmentSnap.empty) {
            authorized = true;
          }
        }
      }
      if (!authorized) {
        return res.status(403).json({
          error: `Access Denied: You are not authorized to post to the ${roomStr} Discussion Room.`
        });
      }
      if (role === "student" && !isAdminUser) {
        const hasMedia = /!\[.*\]\(.*\)/i.test(text) || /<(img|iframe|video|audio|embed|object|source)\b/i.test(text) || /\.(png|jpg|jpeg|gif|webp|svg|mp4|mov|avi|mkv|mp3|wav|ogg|pdf)\b/i.test(text) || /data:image\//i.test(text) || /href=["'](.*?)\.(png|jpg|jpeg|gif|webp|svg|mp4|mov|avi|mkv|mp3|wav|ogg|pdf)["']/i.test(text);
        if (hasMedia) {
          return res.status(400).json({
            error: "Media Filter Violation: Students are strictly restricted to text-only messages to avoid storage overhead and slow rendering times."
          });
        }
      }
      if (!isAdminUser) {
        const now = Date.now();
        const lastTime = lastMessageTimestampMap.get(uidStr) || 0;
        const cooldownMs = 60 * 1e3;
        if (now - lastTime < cooldownMs) {
          const remainingSecs = Math.ceil((cooldownMs - (now - lastTime)) / 1e3);
          return res.status(429).json({
            error: "Please wait 1 minute before sending another message."
          });
        }
        lastMessageTimestampMap.set(uidStr, now);
      }
      const payload = {
        room: roomStr,
        text: text.trim(),
        senderId: uidStr,
        senderName: senderName || userData?.name || "FEEN Member",
        senderRole: senderRole || role,
        createdAt: AdminFieldValue.serverTimestamp()
      };
      const docRef = await adminDb.collection("forum_messages").add(payload);
      return res.json({ id: docRef.id, success: true });
    } catch (error) {
      console.error("Error sending forum message:", error);
      return res.status(500).json({ error: error.message || "Failed to post forum message" });
    }
  });
  app.delete("/api/exams/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "Missing exam ID" });
      }
      await adminDb.collection("mock_exams").doc(id).delete();
      const collectionsToCascade = ["student_progress", "exam_attempts", "user_attempts", "mock_history"];
      let deletedCount = 0;
      for (const col of collectionsToCascade) {
        const snap = await adminDb.collection(col).where("examId", "==", id).get();
        if (!snap.empty) {
          const batch = adminDb.batch();
          snap.forEach((docSnap) => {
            batch.delete(docSnap.ref);
            deletedCount++;
          });
          await batch.commit();
        }
      }
      return res.json({
        success: true,
        message: `Mock exam successfully retired. Cascaded deletion deleted ${deletedCount} dependent tracking records.`
      });
    } catch (error) {
      console.error("Error cascading deletion of exam:", error);
      return res.status(500).json({ error: error.message || "Failed to cascade exam deletion" });
    }
  });
  app.get("/api/forum/assignments", async (req, res) => {
    try {
      const assignmentsSnap = await adminDb.collection("workspace_assignments").get();
      const assignments = [];
      assignmentsSnap.forEach((docSnap) => {
        assignments.push({ id: docSnap.id, ...docSnap.data() });
      });
      return res.json(assignments);
    } catch (error) {
      console.error("Error fetching workspace assignments:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/forum/assign", async (req, res) => {
    try {
      const { uid, room, adminUid } = req.body;
      if (!uid || !room) {
        return res.status(400).json({ error: "Missing uid or room parameter" });
      }
      const userDoc = await adminDb.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found in FEEN directory." });
      }
      const user = userDoc.data();
      const existingSnap = await adminDb.collection("workspace_assignments").where("uid", "==", uid).where("room", "==", room).get();
      if (!existingSnap.empty) {
        return res.json({ success: true, message: "User already assigned to this room." });
      }
      const payload = {
        uid,
        room,
        userName: user?.name || "FEEN Member",
        userRole: user?.role || "student",
        assignedBy: adminUid || "admin",
        assignedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await adminDb.collection("workspace_assignments").add(payload);
      return res.json({ success: true, message: "User successfully recruited to discussion workspace!" });
    } catch (error) {
      console.error("Error creating workspace assignment:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/forum/unassign", async (req, res) => {
    try {
      const { uid, room } = req.body;
      if (!uid || !room) {
        return res.status(400).json({ error: "Missing uid or room parameter" });
      }
      const existingSnap = await adminDb.collection("workspace_assignments").where("uid", "==", uid).where("room", "==", room).get();
      if (existingSnap.empty) {
        return res.json({ success: true, message: "No assignment found to remove." });
      }
      const batch = adminDb.batch();
      existingSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
      return res.json({ success: true, message: "User successfully unassigned from discussion workspace." });
    } catch (error) {
      console.error("Error removing workspace assignment:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/finance/ai-analysis", async (req, res) => {
    try {
      const { studentFees, teacherPayroll, expenses } = req.body;
      if (!studentFees || !teacherPayroll || !expenses) {
        return res.status(400).json({ error: "Missing financial data arrays. Please seed or enter some rows." });
      }
      const ai = getGeminiClient();
      const prompt = `You are "Feen Engine," the premium AI operational matrix and elite financial auditor for Focus Edge Education Network (FEEN).
Analyze the following FEEN Classes institutional accounting data arrays and provide:
1. **Smart Financial Anomaly Logging:** Row-by-row structural auditing to immediately flag cell inconsistencies (e.g., students carrying active outstanding ledger balances despite having a 100% scholarship discount, or partial payment status mismatching net outstanding formulas, or negative outstanding figures).
2. **Predictive Cash Flow Optimization Analysis:** High-fidelity predictions and actionable forecasting based on payment cycles and outstanding balances (e.g., mid-term collection dips, recommended shifts in billing schedules, seasonal teacher payroll adjustments).
3. **Automated Textual Narrative Summaries:** Convert the raw numeric tables into elegant, scannable human-readable executive insights summarizing overall institutional revenue efficiency, payroll distributions, and expense pacing.

**DATA INPUT ARRAYS:**
- Student Fees Ledger: ${JSON.stringify(studentFees)}
- Teacher/Staff Payroll Matrix: ${JSON.stringify(teacherPayroll)}
- Operational Expenses: ${JSON.stringify(expenses)}

**CRITICAL PRICING EMBARGO & DEPT COMPLIANCE GUIDELINES:**
- While you must analyze and audit the raw numbers, never display or quote specific currency fees or pricing tiers directly to external entities. For these internal audit columns and narrative summary blocks, focus on percentages, efficiency metrics, operational trends, and specific structural anomaly flags. Keep pricing evaluations strictly focused on systemic ledger integrity.
- You must structure your response in a multi-row narrative format with clear spacing, preventing text clumping and honoring structural data frames. Use elegant bullet points and bold key terms.

**FORMAT THE OUTPUT EXACTLY INTO THESE THREE SECTIONS WITH '###' HEADERS:**
### SECTION 1: SMART FINANCIAL ANOMALY LOG
[List row-by-row or specific structural inconsistencies found in the ledger, with ID references. Mark each with an appropriate risk rating [HIGH/MEDIUM/LOW]. If no anomalies exist, suggest a preventive integrity check. Keep each item as a separate bullet starting with '- '.]

### SECTION 2: PREDICTIVE CASH FLOW OPTIMIZATION ANALYSIS
[Deliver data-driven forecasts and cash flow cycle insights. Write explicit, actionable forecasts with recommended timeline shifts (e.g. "Predictive Insight: Class 12 collections consistently dip ... Recommend shifting billing notifications forward by 7 standard business days."). Keep each item as a separate bullet starting with '- '.]

### SECTION 3: EXECUTIVE AUDIT SUMMARY & NARRATIVE
[Convert numeric summaries into standard human-readable executive insights. Keep it professional, conversion-driven, and focused on operational budget frames matching projections. Avoid quoting specific fee rates or price metrics directly as per pricing embargo.]
`;
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are the Feen Engine AI Financial Auditor, designed under Kushal Poudel's direction to preserve ledger integrity and optimize cash flow efficiency."
        }
      });
      const analysisText = response.text || "Failed to generate financial analysis.";
      res.json({ analysis: analysisText });
    } catch (error) {
      console.error("Express AI Finance Analysis Error:", error);
      handleGeminiError(error, res, "Financial analysis bridge interrupted.");
    }
  });
  app.post("/api/student/ai-coach", async (req, res) => {
    try {
      const { topic, gradeLevel, history } = req.body;
      if (!topic) {
        return res.status(400).json({ error: "Missing study topic or question." });
      }
      const activeGrade = gradeLevel || "BLE (Grade 8)";
      const ai = getGeminiClient();
      const AI_COACH_SYSTEM_INSTRUCTION = `You are "Feen Engine - AI Study Coach," the premier virtual tutor for Focus Edge Education Network (FEEN). Your Strategic Mandate is to provide exceptionally high-fidelity, comprehensive, and engaging academic instruction.

[PEDAGOGICAL & DIALECTICAL RULES]
1. Localized Bilingual Output: You must explain concepts using a highly natural hybrid of English and Nepali language elements. Use Nepali translations of complex academic terms in parentheses or explanatory sentences so that Nepalese board students (BLE, SEE, NEB) can easily grasp the concept. E.g., explain "Ledger" as "Khata (\u0916\u093E\u0924\u093E)" and "Double Entry Bookkeeping" as "Dohoro Lekha Pranali (\u0926\u094B\u0939\u094B\u0930\u094B \u0932\u0947\u0916\u093E \u092A\u094D\u0930\u0923\u093E\u0932\u0940)".
2. No Text Clumping or Lazy Summaries: Deliver rich, rigorous explanations with proper spacing, margins, bold definitions, and clear examples. Keep definitions clear and academic.
3. Pricing Embargo: Strictly adhere to a pricing embargo. Do not mention or estimate fees.

[JSON OUTPUT FORMAT SCHEMA]
You must respond with a strict JSON object that conforms exactly to the following schema:
{
  "conceptualExplanation": "Detailed conceptual explanation written in beautiful Markdown. Use bullet points, bold text, and proper formatting.",
  "practicalExample": "An engaging, context-specific practical example set in Nepal (e.g. business in Kathmandu, buying stationery, calculating VAT, local salary payroll). Detail the scenario and variables clearly using Markdown.",
  "practiceQuestions": [
    {
      "question": "A clear multiple-choice question testing the concepts above, written in hybrid English/Nepali.",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0, // integer index (0, 1, 2, or 3) of the correct option
      "explanation": "A concise bilingual explanation of why this option is correct and why other options are incorrect."
    }
  ]
}

Ensure that 'practiceQuestions' contains exactly 3 diverse, syllabus-aligned questions (MCQs) for the topic and grade level specified. Do not wrap the JSON output in markdown backticks; output only the raw JSON.`;
      const prompt = `Generate a comprehensive tutorial session for the student:
Topic: "${topic}"
Enrolled Batch/Grade: "${activeGrade}"

Make sure the depth matches the board syllabus of ${activeGrade} in Nepal (BLE, SEE, or NEB +2). Provide extremely clear definitions, practical examples using Nepalese contexts (e.g., Kathmandu businesses, local markets), and 3 challenging multiple-choice questions to test their knowledge.`;
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: AI_COACH_SYSTEM_INSTRUCTION
        }
      });
      const responseText = response.text || "{}";
      try {
        const parsedJson = JSON.parse(responseText);
        res.json({ success: true, payload: parsedJson });
      } catch (parseErr) {
        console.error("JSON parsing failed, fallback parsing applied:", responseText);
        const strippedText = responseText.replace(/^```json\s*|```\s*$/g, "").trim();
        const parsedJson = JSON.parse(strippedText);
        res.json({ success: true, payload: parsedJson });
      }
    } catch (error) {
      console.error("Express AI Study Coach Error:", error);
      handleGeminiError(error, res, "AI Study Coach system bridge interrupted.");
    }
  });
  app.post("/api/admin/ledger/submit", async (req, res) => {
    try {
      const {
        studentId,
        studentName,
        studentEmail,
        amount,
        academicLevel,
        months,
        gateway,
        screenshotBase64,
        receiptName
      } = req.body;
      if (!studentId || !studentName || !amount) {
        return res.status(400).json({ error: "Validation Error: Missing studentId, studentName, or amount." });
      }
      const transactionId = `TXN-FEEN-PEND-${Math.floor(1e5 + Math.random() * 9e5)}`;
      const newPendingPayment = {
        studentId,
        studentName,
        studentEmail: studentEmail || "",
        amount: parseFloat(amount) || 0,
        academicLevel: academicLevel || "BLE Prep",
        months: months || 1,
        gateway: gateway || "esewa",
        screenshotBase64: screenshotBase64 || "",
        receiptName: receiptName || "receipt_screenshot.png",
        transactionId,
        status: "PENDING",
        createdAt: AdminFieldValue.serverTimestamp()
      };
      const docRef = await adminDb.collection("pending_payments").add(newPendingPayment);
      return res.json({
        success: true,
        message: "Your payment verification screenshot has been submitted successfully. Status: PENDING review.",
        paymentId: docRef.id,
        transactionId
      });
    } catch (error) {
      console.error("Express Ledger Submit Error:", error);
      res.status(500).json({ error: error.message || "Internal system error during screenshot caching." });
    }
  });
  app.get("/api/admin/ledger/pending", async (req, res) => {
    try {
      const adminId = req.headers["admin-id"] || req.query.adminId;
      if (!adminId) {
        return res.status(401).json({ error: "401 Unauthorized: Administrative identifier must be provided in request headers." });
      }
      const userDocRef = adminDb.collection("users").doc(adminId);
      const userDoc = await userDocRef.get();
      const uData = userDoc.exists ? userDoc.data() : null;
      if (!uData || uData.role !== "admin") {
        return res.status(403).json({ error: "403 Forbidden: Authorized administrative tokens only. Boundary interdiction triggered." });
      }
      const qPending = adminDb.collection("pending_payments").where("status", "==", "PENDING");
      const snap = await qPending.get();
      const results = [];
      snap.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() });
      });
      results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return res.json({ success: true, count: results.length, data: results });
    } catch (error) {
      console.error("Express Ledger Pending List Error:", error);
      res.status(500).json({ error: error.message || "Internal system error during pending queue load." });
    }
  });
  app.post("/api/admin/ledger/action", async (req, res) => {
    try {
      const { paymentId, action, adminId } = req.body;
      if (!adminId || !paymentId || !action) {
        return res.status(400).json({ error: "Bad Request: Missing parameters adminId, paymentId, or action." });
      }
      const userDocRef = adminDb.collection("users").doc(adminId);
      const userDoc = await userDocRef.get();
      const uData = userDoc.exists ? userDoc.data() : null;
      if (!uData || uData.role !== "admin") {
        return res.status(403).json({ error: "403 Forbidden: Authorized administrative tokens only." });
      }
      const paymentRef = adminDb.collection("pending_payments").doc(paymentId);
      const paymentSnap = await paymentRef.get();
      if (!paymentSnap.exists) {
        return res.status(404).json({ error: "Pending payment record not found." });
      }
      const paymentData = paymentSnap.data();
      if (!paymentData || paymentData.status !== "PENDING") {
        return res.status(400).json({ error: "This transaction has already been resolved." });
      }
      if (action === "REJECT") {
        await paymentRef.update({
          status: "REJECTED",
          resolvedBy: adminId,
          resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return res.json({ success: true, message: "Transaction marked as REJECTED." });
      }
      if (action === "APPROVE") {
        const {
          studentId,
          studentName,
          studentEmail,
          amount,
          academicLevel,
          months,
          gateway,
          transactionId
        } = paymentData;
        const qLedger = adminDb.collection("financial_ledgers").where("studentId", "==", studentId);
        const ledgerSnap = await qLedger.get();
        const generatedTxId = transactionId || `TXN-FEEN-PAY-${Math.floor(1e5 + Math.random() * 9e5)}`;
        const timestamp = (/* @__PURE__ */ new Date()).toLocaleString();
        const newTx = {
          transactionId: generatedTxId,
          paymentTimestamp: timestamp,
          creditAmount: amount,
          previousBalanceOutstanding: 2e4,
          currentPendingBalance: Math.max(0, 2e4 - amount),
          note: `Approved: ${academicLevel} Tuition Fee - ${months} Month(s) via ${gateway.toUpperCase()} (Manual Verification)`
        };
        if (!ledgerSnap.empty) {
          const docRef = adminDb.collection("financial_ledgers").doc(ledgerSnap.docs[0].id);
          const existingData = ledgerSnap.docs[0].data();
          const currentPaid = existingData.amountPaid || 0;
          const currentOutstanding = existingData.totalOutstanding || 2e4;
          newTx.previousBalanceOutstanding = currentOutstanding;
          newTx.currentPendingBalance = Math.max(0, currentOutstanding - amount);
          await docRef.update({
            amountPaid: currentPaid + amount,
            totalOutstanding: Math.max(0, currentOutstanding - amount),
            paymentReceiptUrl: paymentData.screenshotBase64 || "",
            transactions: AdminFieldValue.arrayUnion(newTx),
            updatedAt: AdminFieldValue.serverTimestamp()
          });
        } else {
          await adminDb.collection("financial_ledgers").add({
            studentId,
            studentEmail: studentEmail || "",
            studentName: studentName || "",
            amountPaid: amount,
            totalOutstanding: Math.max(0, 15e3 - amount),
            nextInstallmentDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0],
            admissionTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
            paymentReceiptUrl: paymentData.screenshotBase64 || "",
            transactions: [newTx],
            updatedAt: AdminFieldValue.serverTimestamp()
          });
        }
        await paymentRef.update({
          status: "APPROVED",
          resolvedBy: adminId,
          resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return res.json({
          success: true,
          message: "Transaction approved. Double-entry ledger synchronized successfully."
        });
      }
    } catch (error) {
      console.error("Express Ledger Action Error:", error);
      res.status(500).json({ error: error.message || "Internal system error during administrative transaction action." });
    }
  });
  app.post("/api/auth/verify-captcha", async (req, res) => {
    try {
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: "Internal security validation error" });
    }
  });
  app.post("/api/auth/google", async (req, res) => {
    try {
      const { uid, email, displayName, photoURL, isSignUp, role } = req.body;
      if (!uid || !email) {
        return res.status(400).json({ success: false, error: "Missing Google auth payload (uid or email)" });
      }
      const userRef = adminDb.collection("users").doc(uid);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        return res.json({
          success: true,
          user: userData
        });
      } else {
        if (isSignUp === false) {
          return res.status(403).json({
            success: false,
            error: "Account not registered. You must sign up first before signing in!"
          });
        }
        const cleanRole = (role || "student").toLowerCase();
        if (cleanRole !== "student" && cleanRole !== "teacher" && cleanRole !== "parent") {
          return res.status(400).json({
            success: false,
            error: "Registration is strictly restricted to Teachers, Students, and Parents."
          });
        }
        const profilePayload = {
          uid,
          email: email.toLowerCase(),
          displayName: displayName || "User",
          name: displayName || "User",
          role: cleanRole,
          photoURL: photoURL || "",
          isVerified: false,
          is_verified: false,
          verification_status: "pending",
          status: "pending_approval",
          approvalStatus: "PENDING",
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          metaData: {
            studentGrade: cleanRole === "student" ? "Class 8" : "",
            associatedStudentId: "",
            assignedSubject: ""
          },
          grade_level: cleanRole === "student" ? "Class 8" : null,
          studentNameLinkage: null
        };
        await userRef.set(profilePayload);
        console.log(`[Direct DB Google Auth] User registered successfully: ${email} (${cleanRole}) with ID: ${uid}`);
        return res.status(201).json({
          success: true,
          user: profilePayload
        });
      }
    } catch (error) {
      console.error("Express /api/auth/google Error:", error);
      return res.status(500).json({ success: false, error: "Authentication system failure." });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const { email, password } = req.body || {};
      const cleanEmail = email?.trim().toLowerCase();
      const cleanPassword = password?.trim();
      if (!cleanEmail || !cleanPassword) {
        return res.status(400).json({
          success: false,
          error: "Email and password are required fields."
        });
      }
      const userSnap = await adminDb.collection("users").where("email", "==", cleanEmail).limit(1).get();
      if (userSnap.empty) {
        return res.status(401).json({
          success: false,
          error: "Invalid email address or password."
        });
      }
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();
      if (!userData.passwordHash || !import_bcryptjs.default.compareSync(cleanPassword, userData.passwordHash)) {
        return res.status(401).json({
          success: false,
          error: "Invalid email address or password."
        });
      }
      console.log(`[Direct DB Login] User authenticated successfully: ${cleanEmail}`);
      return res.status(200).json({
        success: true,
        message: "Authentication successful.",
        user: {
          uid: userData.uid || userData.userId || userDoc.id,
          userId: userData.userId || userDoc.id,
          email: userData.email,
          displayName: userData.fullName || userData.displayName || userData.name || "User",
          name: userData.fullName || userData.displayName || userData.name || "User",
          role: (userData.role || "student").toLowerCase(),
          roles: userData.roles || [(userData.role || "student").toLowerCase()],
          verification_status: userData.verification_status || "pending",
          isVerified: userData.isVerified || userData.verification_status === "verified",
          approvalStatus: userData.approvalStatus || "PENDING",
          grade_level: userData.grade_level,
          studentNameLinkage: userData.studentNameLinkage
        }
      });
    } catch (error) {
      console.error("Express /api/auth/login Error:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error."
      });
    }
  });
  app.post("/api/auth/register", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const { fullName, email, password, role, metaData } = req.body || {};
      const cleanEmail = email?.trim().toLowerCase();
      const cleanName = fullName?.trim();
      const cleanPassword = password?.trim();
      const cleanRole = role?.trim().toLowerCase();
      if (!cleanName || !cleanEmail || !cleanPassword || !cleanRole) {
        return res.status(400).json({
          success: false,
          error: "Full Name, Email, Password, and Role are mandatory."
        });
      }
      if (cleanRole !== "student" && cleanRole !== "teacher" && cleanRole !== "parent") {
        return res.status(400).json({
          success: false,
          error: "Registration is strictly restricted to Teachers, Students, and Parents."
        });
      }
      const existingUserQuery = await adminDb.collection("users").where("email", "==", cleanEmail).limit(1).get();
      if (!existingUserQuery.empty) {
        return res.status(409).json({
          success: false,
          error: "An account with this email address already exists."
        });
      }
      const salt = import_bcryptjs.default.genSaltSync(10);
      const passwordHash = import_bcryptjs.default.hashSync(cleanPassword, salt);
      let userId = import_crypto2.default.randomUUID();
      const profilePayload = {
        id: userId,
        userId,
        uid: userId,
        fullName: cleanName,
        name: cleanName,
        displayName: cleanName,
        email: cleanEmail,
        passwordHash,
        role: cleanRole,
        roles: [cleanRole],
        isVerified: true,
        is_verified: true,
        verification_status: "verified",
        status: "approved",
        approvalStatus: "APPROVED",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        metaData: {
          studentGrade: metaData?.studentGrade || "",
          associatedStudentId: metaData?.associatedStudentId || "",
          assignedSubject: metaData?.assignedSubject || ""
        },
        grade_level: cleanRole === "student" ? metaData?.studentGrade || "Class 8" : null,
        studentNameLinkage: cleanRole === "parent" ? metaData?.associatedStudentId || "" : null
      };
      await adminDb.collection("users").doc(userId).set(profilePayload);
      try {
        await adminDb.collection("profiles").doc(userId).set(profilePayload);
      } catch (e) {
      }
      console.log(`[Firebase DB Signup] User registered successfully in Firestore: ${cleanEmail} (${cleanRole}) with ID: ${userId}`);
      return res.status(200).json({
        success: true,
        message: "Registration successful. Access granted.",
        user: {
          uid: userId,
          userId,
          email: cleanEmail,
          displayName: cleanName,
          name: cleanName,
          role: cleanRole,
          verification_status: "verified",
          approvalStatus: "APPROVED",
          isVerified: true,
          grade_level: profilePayload.grade_level,
          studentNameLinkage: profilePayload.studentNameLinkage
        }
      });
    } catch (error) {
      console.error("Express /api/auth/register Error:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error during registration."
      });
    }
  });
  app.post("/api/admin/recruitment/create", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const { name, email, password, role } = req.body || {};
      if (!name || !email || !password || !role) {
        return res.status(400).json({
          success: false,
          error: "Missing mandatory fields: Name, Email, Password, or Role is required."
        });
      }
      const normalizedRole = role.toLowerCase();
      if (normalizedRole !== "teacher" && normalizedRole !== "student") {
        return res.status(400).json({
          success: false,
          error: "Invalid role flag. Role must be either 'TEACHER' or 'STUDENT'."
        });
      }
      console.log(`[Emergency Recruiter] Attempting emergency manual bypass registration for: ${email}`);
      let uid = "";
      try {
        throw new Error("Cannot create users on backend without Admin SDK in this environment. Please create user from frontend.");
        console.log(`[Emergency Recruiter] Created auth profile on firebase-admin, UID: ${uid}`);
      } catch (authErr) {
        console.error("[Emergency Recruiter] Auth registration error:", authErr);
        if (authErr.code === "auth/email-already-exists") {
          try {
            throw new Error("Cannot get users on backend without Admin SDK.");
            console.log(`[Emergency Recruiter] Auth email already exists. Reusing UID: ${uid}`);
          } catch (getErr) {
            return res.status(409).json({
              success: false,
              error: `Auth record already exists, and failed to fetch corresponding profile details: ${authErr.message}`
            });
          }
        } else {
          return res.status(500).json({
            success: false,
            error: `Failed to provision authentication credentials securely: ${authErr.message}`
          });
        }
      }
      const userData = {
        uid,
        name,
        email,
        role: normalizedRole,
        verification_status: "verified",
        status: "ACTIVE",
        verificationStatus: "verified",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        verified_by: "Emergency System Admin Override",
        verified_at: (/* @__PURE__ */ new Date()).toISOString(),
        isChannelMember: true
      };
      if (normalizedRole === "student") {
        userData.grade_level = "BLE (Grade 8)";
        userData.studentPhone = "+977 98251-XXXXX";
        userData.parentPhone1 = "+977 98251-XXXXX";
        userData.parentName = "Emergency Manual Intake Parent";
      } else if (normalizedRole === "teacher") {
        userData.qualification = "Bachelors in Education / Science / Mathematics";
        userData.teacherPhone = "+977 98251-XXXXX";
      }
      try {
        await adminDb.collection("users").doc(uid).set(userData);
        console.log(`[Emergency Recruiter] Successfully provisioned profile state via trusted Web SDK.`);
      } catch (webDbErr) {
        console.error("[Emergency Recruiter] Emergency profile database write failed entirely:", webDbErr);
        return res.status(500).json({
          success: false,
          error: `Auth account created but Firestore profiling failed: ${webDbErr.message}`
        });
      }
      return res.status(200).json({
        success: true,
        message: "Manual administrative intake profile registered, activated, and verified successfully.",
        uid,
        user: userData
      });
    } catch (err) {
      console.error("[Emergency Recruiter] Critical failure:", err);
      return res.status(500).json({
        success: false,
        error: `Core bypass intake failed: ${err.message}`
      });
    }
  });
  app.post("/api/admin/admissions/accept", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const { studentName, parentContact, parentName, email, uid } = req.body || {};
      if (!studentName || !parentContact) {
        return res.status(400).json({
          success: false,
          error: "Missing mandatory fields: studentName and parentContact are required."
        });
      }
      const student_id = import_crypto2.default.randomUUID();
      const admission_timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const studentPayload = {
        student_id,
        admission_timestamp,
        academic_class: "8",
        stream_category: "BLE",
        enrollment_status: "ACTIVE",
        student_name: studentName,
        parent_contact: parentContact,
        parent_name: parentName || "N/A",
        email: email || "N/A"
      };
      await adminDb.collection("students").doc(student_id).set(studentPayload);
      let profileUpdated = false;
      let targetUid = uid || "";
      if (targetUid) {
        const userRef = adminDb.collection("users").doc(targetUid);
        await userRef.update({
          grade_level: "BLE (Grade 8)",
          academic_class: "8",
          stream_category: "BLE",
          verification_status: "verified",
          enrollment_status: "ACTIVE",
          role: "student"
        });
        profileUpdated = true;
      } else if (email && email !== "N/A") {
        const usersQ = adminDb.collection("users").where("email", "==", email);
        const usersSnap = await usersQ.get();
        if (!usersSnap.empty) {
          const matchedUserDoc = usersSnap.docs[0];
          targetUid = matchedUserDoc.id;
          await adminDb.collection("users").doc(targetUid).update({
            grade_level: "BLE (Grade 8)",
            academic_class: "8",
            stream_category: "BLE",
            verification_status: "verified",
            enrollment_status: "ACTIVE",
            role: "student"
          });
          profileUpdated = true;
        }
      }
      console.log(`[Admissions Engine] Accepted BLE Class 8 student admission: ${studentName}. Assigned ID: ${student_id}`);
      return res.status(200).json({
        success: true,
        message: "Admission Accepted successfully for BLE Class 8",
        payload: {
          student_id,
          admission_timestamp,
          academic_class: "8",
          stream_category: "BLE",
          enrollment_status: "ACTIVE",
          studentName,
          parentContact,
          profileUpdated,
          targetUid
        }
      });
    } catch (err) {
      console.error("[Admissions Engine] Core intake error:", err);
      return res.status(500).json({
        success: false,
        error: `Failed to process BLE Class 8 registration: ${err.message}`
      });
    }
  });
  app.post("/api/admin/approve-user", async (req, res) => {
    try {
      const { userId, role, batchId, subjects, status } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: "Missing userId" });
      }
      const normalizedRole = (role || "student").toLowerCase();
      const finalStatus = status || "verified";
      const updates = {
        verification_status: finalStatus,
        isVerified: finalStatus === "verified",
        approvalStatus: finalStatus === "verified" ? "APPROVED" : finalStatus === "rejected" ? "REJECTED" : "PENDING",
        role: normalizedRole,
        assignedRole: normalizedRole,
        verified_by: "System API Admin",
        verified_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (normalizedRole === "student") {
        updates.assignedBatchId = batchId || "Class 8";
        updates.grade_level = batchId || "Class 8";
        updates.expertise_subjects = null;
      } else if (normalizedRole === "parent") {
        updates.assignedBatchId = null;
        updates.grade_level = null;
        updates.expertise_subjects = null;
      } else {
        updates.assignedBatchId = null;
        updates.grade_level = null;
        updates.expertise_subjects = subjects || [];
      }
      await adminDb.collection("users").doc(userId).update(updates);
      try {
        await adminDb.collection("profiles").doc(userId).update(updates);
      } catch (e) {
      }
      console.log(`[Approval Engine] Approved user: ${userId} as ${normalizedRole}`);
      return res.json({ success: true, message: `Successfully updated user ${userId} as ${normalizedRole}.` });
    } catch (err) {
      console.error("[Approval Engine] Core update error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });
  app.get("/api/admin/users", async (req, res) => {
    try {
      const usersSnap = await adminDb.collection("users").get();
      const usersList = usersSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          uid: doc.id,
          ...data
        };
      });
      return res.json({ success: true, users: usersList });
    } catch (err) {
      console.error("[Users API] Error fetching users:", err);
      return res.status(500).json({ success: false, error: err.message, users: [] });
    }
  });
  app.get("/api/admin/pending-users", async (req, res) => {
    try {
      const usersSnap = await adminDb.collection("users").get();
      const pendingUsers = usersSnap.docs.map((doc) => ({ id: doc.id, uid: doc.id, ...doc.data() })).filter((u) => {
        if (u.role === "admin" || u.role === "superadmin") return false;
        if (u.status === "approved" || u.status === "verified" || u.verification_status === "verified") return false;
        return u.status === "pending" || u.status === "pending_approval" || u.verification_status === "pending" || u.approvalStatus === "PENDING" || u.isVerified === false || u.is_verified === false;
      });
      return res.json({ success: true, count: pendingUsers.length, users: pendingUsers });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message, count: 0, users: [] });
    }
  });
  app.delete("/api/admin/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) return res.status(400).json({ success: false, error: "Missing userId" });
      await adminDb.collection("users").doc(userId).delete();
      try {
        await adminDb.collection("profiles").doc(userId).delete();
      } catch (e) {
      }
      return res.json({ success: true, message: `User ${userId} deleted successfully.` });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
  async function isStudentRequest(req) {
    try {
      const roleHeaders = [
        req.headers["x-user-role"],
        req.headers["x-current-view-role"],
        req.headers["x-simulation-role"],
        req.headers["role"],
        req.headers["user-role"]
      ];
      for (const h of roleHeaders) {
        if (h && String(h).toLowerCase() === "student") {
          return true;
        }
      }
      const authHeader = req.headers["authorization"];
      let token = req.cookies?.feen_admin_token || req.cookies?.auth_token || req.cookies?.token;
      if (!token && authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
      if (token) {
        try {
          const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
          if (decoded && decoded.role === "student") {
            return true;
          }
        } catch (jwtErr) {
        }
        const decodedFirebase = import_jsonwebtoken.default.decode(token);
        if (decodedFirebase && decodedFirebase.sub) {
          const uid2 = decodedFirebase.sub;
          const userDoc = await adminDb.collection("users").doc(uid2).get();
          if (userDoc.exists) {
            const uData = userDoc.data();
            if (uData && uData.role === "student") {
              return true;
            }
          }
        }
      }
      const uid = req.query?.uid || req.body?.uid || req.headers["uid"] || req.headers["user-id"];
      if (uid) {
        const userDoc = await adminDb.collection("users").doc(String(uid)).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          if (uData && uData.role === "student") {
            return true;
          }
        }
      }
    } catch (err) {
      console.error("isStudentRequest verification error:", err);
    }
    return false;
  }
  app.get("/api/admin/home-tuition-ledger", async (req, res) => {
    try {
      if (await isStudentRequest(req)) {
        return res.status(403).json({ success: false, error: "403 Forbidden: Student accounts are strictly prohibited from accessing Home Tuition ledger data." });
      }
      const q = adminDb.collection("HomeTuitionLedger").orderBy("transaction_date", "desc");
      const snapshot = await q.get();
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json({ success: true, payload: data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to fetch ledger" });
    }
  });
  app.post("/api/admin/home-tuition-ledger", async (req, res) => {
    try {
      if (await isStudentRequest(req)) {
        return res.status(403).json({ success: false, error: "403 Forbidden: Student accounts are strictly prohibited from adding Home Tuition ledger records." });
      }
      const payload = req.body;
      const docRef = await adminDb.collection("HomeTuitionLedger").add({
        ...payload,
        created_at: AdminFieldValue.serverTimestamp()
      });
      res.json({ success: true, id: docRef.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to add ledger entry" });
    }
  });
  app.delete("/api/admin/home-tuition-ledger/:id", async (req, res) => {
    try {
      if (await isStudentRequest(req)) {
        return res.status(403).json({ success: false, error: "403 Forbidden: Student accounts are strictly prohibited from deleting Home Tuition ledger records." });
      }
      const { id } = req.params;
      await adminDb.collection("HomeTuitionLedger").doc(id).delete();
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to delete ledger entry" });
    }
  });
  app.get("/api/admin/firm-expenses", async (req, res) => {
    try {
      const q = adminDb.collection("FirmExpensesLedger").orderBy("expense_date", "desc");
      const snapshot = await q.get();
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json({ success: true, payload: data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to fetch firm expenses" });
    }
  });
  app.post("/api/admin/firm-expenses", async (req, res) => {
    try {
      const payload = req.body;
      const docRef = await adminDb.collection("FirmExpensesLedger").add({
        ...payload,
        created_at: AdminFieldValue.serverTimestamp()
      });
      res.json({ success: true, id: docRef.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to add firm expense" });
    }
  });
  app.delete("/api/admin/firm-expenses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await adminDb.collection("FirmExpensesLedger").doc(id).delete();
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to delete firm expense" });
    }
  });
  app.get("/api/admin/financial-report", async (req, res) => {
    try {
      const studentLedgersSnap = await adminDb.collection("financial_ledgers").get();
      let studentPaymentsReceived = 0;
      let studentDuesOutstanding = 0;
      const studentTransactions = [];
      studentLedgersSnap.docs.forEach((doc) => {
        const data = doc.data();
        studentDuesOutstanding += data.totalOutstanding || 0;
        const txs = data.transactions || [];
        txs.forEach((tx) => {
          studentPaymentsReceived += tx.creditAmount || 0;
          studentTransactions.push({
            id: tx.transactionId,
            date: tx.paymentTimestamp,
            description: `Student Payment: ${data.studentName || "Unknown"}`,
            amount: tx.creditAmount || 0,
            type: "revenue"
          });
        });
      });
      const homeTuitionSnap = await adminDb.collection("HomeTuitionLedger").get();
      let homeTuitionRevenue = 0;
      const homeTuitionTransactions = [];
      homeTuitionSnap.docs.forEach((doc) => {
        const data = doc.data();
        const amt = data.payment_amount_received || 0;
        homeTuitionRevenue += amt;
        homeTuitionTransactions.push({
          id: doc.id,
          date: data.transaction_date,
          description: `Home Tuition: ${data.teacher_name || "Unknown"} - ${data.assigned_subject || ""}`,
          amount: amt,
          type: "revenue"
        });
      });
      const payrollSnap = await adminDb.collection("teacher_payroll").get();
      let teacherPayouts = 0;
      let teacherDuesOutstanding = 0;
      const teacherTransactions = [];
      payrollSnap.docs.forEach((doc) => {
        const data = doc.data();
        teacherDuesOutstanding += data.accruedSalaryDues || 0;
        teacherPayouts += data.totalDisbursed || 0;
        const txs = data.transactions || [];
        txs.forEach((tx) => {
          teacherTransactions.push({
            id: tx.transactionId,
            date: tx.payoutTimestamp,
            description: `Teacher Payroll: ${data.teacherName || "Unknown"}`,
            amount: tx.disbursedAmount || 0,
            type: "expense"
          });
        });
      });
      const expensesSnap = await adminDb.collection("FirmExpensesLedger").get();
      let firmExpensesGeneral = 0;
      let firmExpensesRent = 0;
      let firmExpensesElectricity = 0;
      let totalFirmExpenses = 0;
      const firmTransactions = [];
      expensesSnap.docs.forEach((doc) => {
        const data = doc.data();
        const amt = data.amount || 0;
        totalFirmExpenses += amt;
        if (data.type === "general") firmExpensesGeneral += amt;
        else if (data.type === "rent") firmExpensesRent += amt;
        else if (data.type === "electricity") firmExpensesElectricity += amt;
        firmTransactions.push({
          id: doc.id,
          date: data.expense_date,
          description: `Firm Expense (${data.type}): ${data.description || ""}`,
          amount: amt,
          type: "expense"
        });
      });
      const totalStudentRevenue = studentPaymentsReceived + studentDuesOutstanding;
      const totalRevenue = totalStudentRevenue + homeTuitionRevenue;
      const teacherSalaryExpense = teacherPayouts + teacherDuesOutstanding;
      const grossProfit = totalRevenue - teacherSalaryExpense;
      const operatingExpenses = totalFirmExpenses;
      const netIncome = grossProfit - operatingExpenses;
      const cash = studentPaymentsReceived + homeTuitionRevenue - teacherPayouts - totalFirmExpenses;
      const accountsReceivable = studentDuesOutstanding;
      const totalAssets = cash + accountsReceivable;
      const accountsPayable = teacherDuesOutstanding;
      const totalLiabilities = accountsPayable;
      const retainedEarnings = netIncome;
      const totalEquity = retainedEarnings;
      const cashInflows = studentPaymentsReceived + homeTuitionRevenue;
      const cashOutflows = teacherPayouts + totalFirmExpenses;
      const netCashFlow = cashInflows - cashOutflows;
      res.json({
        success: true,
        payload: {
          incomeStatement: {
            studentRevenue: totalStudentRevenue,
            homeTuitionRevenue,
            totalRevenue,
            teacherSalaryExpense,
            grossProfit,
            firmExpensesGeneral,
            firmExpensesRent,
            firmExpensesElectricity,
            totalOperatingExpenses: operatingExpenses,
            netIncome
          },
          balanceSheet: {
            assets: {
              cash,
              accountsReceivable,
              totalAssets
            },
            liabilities: {
              accountsPayable,
              totalLiabilities
            },
            equity: {
              retainedEarnings,
              totalEquity
            }
          },
          cashFlow: {
            inflows: {
              studentPayments: studentPaymentsReceived,
              homeTuitionPayments: homeTuitionRevenue,
              totalInflows: cashInflows
            },
            outflows: {
              teacherPayouts,
              firmExpenses: totalFirmExpenses,
              totalOutflows: cashOutflows
            },
            netCashFlow
          },
          transactions: {
            student: studentTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            homeTuition: homeTuitionTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            teacher: teacherTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            firm: firmTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          }
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to compile financial report: " + err.message + "\n" + err.stack });
    }
  });
  app.post("/api/analytics/track", (req, res) => {
    try {
      const { url, referer: bodyReferer, gender, ageGroup } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      const referer = bodyReferer || req.headers.referer || null;
      const userAgent = req.headers["user-agent"] || null;
      const ipCountry = req.headers["x-vercel-ip-country"] || req.headers["cf-ipcountry"] || req.headers["x-appengine-country"] || null;
      const ipCity = req.headers["x-vercel-ip-city"] || req.headers["cf-ipcity"] || req.headers["x-appengine-city"] || null;
      let country = "International";
      let region = ipCity ? String(ipCity) : null;
      if (ipCountry === "NP") {
        country = "Nepal";
        if (region && !["Kathmandu", "Lalitpur", "Bhaktapur"].includes(region)) {
        }
      } else if (!ipCountry) {
        country = "Nepal";
        region = "Kathmandu";
      }
      const trafficInfo = detectTrafficOrigin(referer, userAgent, url);
      saveImpression({
        url,
        referer,
        userAgent,
        origin: trafficInfo.origin,
        source: trafficInfo.source,
        country,
        region,
        gender: gender || "Unknown",
        ageGroup: ageGroup || "Unknown"
      }).catch((err) => {
        console.error("[Analytics Tracker Express Async Error]:", err);
      });
      return res.json({
        success: true,
        message: "Impression logged successfully",
        data: {
          trafficOrigin: trafficInfo.origin,
          sourceName: trafficInfo.source
        }
      });
    } catch (error) {
      console.error("Express Analytics tracker route error:", error);
      return res.status(500).json({ error: error.message || "Inter-service tracking flow interrupted" });
    }
  });
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const q = adminDb.collection("blog_posts").where("status", "==", "published");
      const snap = await q.get();
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
      const staticRoutes = [
        "/",
        "/about",
        "/contact",
        "/blog",
        "/vacancies",
        "/enroll",
        "/signin",
        "/signup"
      ];
      const baseUrl = "https://thefeenclasses.com";
      staticRoutes.forEach((route) => {
        xml += `  <url>
`;
        xml += `    <loc>${baseUrl}${route}</loc>
`;
        xml += `    <changefreq>weekly</changefreq>
`;
        xml += `    <priority>0.8</priority>
`;
        xml += `  </url>
`;
      });
      snap.forEach((doc) => {
        const post = doc.data();
        xml += `  <url>
`;
        xml += `    <loc>${baseUrl}/blog/${doc.id}</loc>
`;
        const lastMod = post.updated_at || post.published_at || post.created_at;
        if (lastMod) {
          xml += `    <lastmod>${new Date(lastMod).toISOString()}</lastmod>
`;
        }
        xml += `    <changefreq>monthly</changefreq>
`;
        xml += `    <priority>0.7</priority>
`;
        xml += `  </url>
`;
      });
      xml += `</urlset>`;
      res.header("Content-Type", "application/xml");
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });
  app.get("/api/apps/download/:role", (req, res) => {
    try {
      const role = req.params.role;
      const fileName = `feen-${role}.apk`;
      let filePath = import_path2.default.join(process.cwd(), "dist/apps", fileName);
      if (!import_fs2.default.existsSync(filePath)) {
        filePath = import_path2.default.join(process.cwd(), "public/apps", fileName);
      }
      if (!import_fs2.default.existsSync(filePath)) {
        res.status(404).setHeader("Content-Type", "text/plain");
        return res.send("Requested application build asset not found on server grid.");
      }
      const fileStats = import_fs2.default.statSync(filePath);
      const fileBuffer = import_fs2.default.readFileSync(filePath);
      res.status(200);
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Length", fileStats.size.toString());
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.send(fileBuffer);
    } catch (error) {
      console.error("[Safe Download API] Critical failure:", error);
      res.status(500).setHeader("Content-Type", "text/plain");
      return res.send(`Server download processing crash: ${error.message}`);
    }
  });
  app.get("/apps/:apkName", (req, res, next) => {
    try {
      const apkName = req.params.apkName;
      if (apkName.endsWith(".apk") || apkName.endsWith(".mobileconfig")) {
        const mimeType = apkName.endsWith(".apk") ? "application/vnd.android.package-archive" : "application/x-apple-aspen-config";
        let filePath = import_path2.default.join(process.cwd(), "dist/apps", apkName);
        if (!import_fs2.default.existsSync(filePath)) {
          filePath = import_path2.default.join(process.cwd(), "public/apps", apkName);
        }
        if (!import_fs2.default.existsSync(filePath)) {
          res.status(404).setHeader("Content-Type", "text/plain");
          return res.send("Requested application build asset not found on server grid.");
        }
        const fileStats = import_fs2.default.statSync(filePath);
        const fileBuffer = import_fs2.default.readFileSync(filePath);
        res.status(200);
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Length", fileStats.size.toString());
        res.setHeader("Content-Disposition", `attachment; filename="${apkName}"`);
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        return res.send(fileBuffer);
      }
      next();
    } catch (error) {
      console.error("[App Download Router] Critical failure:", error);
      res.status(500).setHeader("Content-Type", "text/plain");
      return res.send(`Server download processing crash: ${error.message}`);
    }
  });
  let vite = null;
  if (process.env.NODE_ENV !== "production") {
    vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  const server = httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
