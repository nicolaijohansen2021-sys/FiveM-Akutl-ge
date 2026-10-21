const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "portal-data.json");

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
  console.error("Set ADMIN_USERNAME, ADMIN_PASSWORD, and SESSION_SECRET environment variables.");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

function initialData() {
  return {
    trainings: [
      { id: crypto.randomUUID(), type: "Akutlægeuddannelse", title: "Akutlæge — grundforløb", description: "ABCDE, triage, stabilisering og professionel patientkontakt.", date: "", time: "", capacity: 8, active: true },
      { id: crypto.randomUUID(), type: "Operationsuddannelse", title: "Operationsuddannelse — intro", description: "Operationsstue, sterile procedurer, teamwork og rollefordeling.", date: "", time: "", capacity: 6, active: true }
    ],
    signups: []
  };
}
function readData() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch {
    const data = initialData();
    writeData(data);
    return data;
  }
}
function writeData(data) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: null
  }
}}));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: "medportal.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public"), { etag: true, maxAge: "1h" }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
const signupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });

function adminOnly(req, res, next) {
  if (!req.session || req.session.isAdmin !== true) return res.status(401).json({ error: "Du skal logge ind som administrator." });
  next();
}
function cleanString(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function safeTraining(t) {
  return {
    id: t.id, type: t.type, title: t.title, description: t.description,
    date: t.date, time: t.time, capacity: t.capacity, active: t.active,
    signupCount: undefined
  };
}

app.get("/api/trainings", (req, res) => {
  const data = readData();
  res.json(data.trainings.filter(t => t.active).map(t => ({
    ...safeTraining(t),
    signupCount: data.signups.filter(s => s.trainingId === t.id).length
  })));
});

app.post("/api/signup", signupLimiter, (req, res) => {
  const trainingId = cleanString(req.body?.trainingId, 80);
  const rpName = cleanString(req.body?.rpName, 80);
  const rank = cleanString(req.body?.rank, 80);
  const pNumber = cleanString(req.body?.pNumber, 80);
  const notes = cleanString(req.body?.notes, 1000);

  if (!trainingId || !rpName || !rank || !pNumber) {
    return res.status(400).json({ error: "Udfyld RP-navn, ingame-rank og P-nummer." });
  }
  const data = readData();
  const training = data.trainings.find(t => t.id === trainingId && t.active);
  if (!training) return res.status(404).json({ error: "Træningen findes ikke længere." });
  const count = data.signups.filter(s => s.trainingId === trainingId).length;
  if (count >= Number(training.capacity || 9999)) return res.status(409).json({ error: "Træningen er fuldt booket." });

  // Personal signup details are stored server-side. Public/admin listing endpoints never expose them.
  data.signups.push({
    id: crypto.randomUUID(), trainingId, rpName, rank, pNumber, notes,
    createdAt: new Date().toISOString()
  });
  writeData(data);
  res.json({ success: true, message: "Du er tilmeldt træningen!" });
});

app.post("/api/admin/login", loginLimiter, (req, res, next) => {
  const username = cleanString(req.body?.username, 100);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const userOk = username.length === process.env.ADMIN_USERNAME.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(process.env.ADMIN_USERNAME));
  const passBuf = Buffer.from(password);
  const expectedBuf = Buffer.from(process.env.ADMIN_PASSWORD);
  const passOk = passBuf.length === expectedBuf.length && crypto.timingSafeEqual(passBuf, expectedBuf);
  if (!userOk || !passOk) return res.status(401).json({ error: "Forkert brugernavn eller adgangskode." });
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.isAdmin = true;
    res.json({ success: true });
  });
});
app.post("/api/admin/logout", adminOnly, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("medportal.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ success: true });
  });
});
app.get("/api/admin/me", (req, res) => res.json({ authenticated: req.session?.isAdmin === true }));

app.get("/api/admin/trainings", adminOnly, adminLimiter, (req, res) => {
  const data = readData();
  // Only aggregate signup counts are returned, never names, P-numbers or notes.
  res.json(data.trainings.map(t => ({
    ...safeTraining(t),
    signupCount: data.signups.filter(s => s.trainingId === t.id).length
  })));
});
app.post("/api/admin/trainings", adminOnly, adminLimiter, (req, res) => {
  const type = cleanString(req.body?.type, 40);
  const title = cleanString(req.body?.title, 100);
  const description = cleanString(req.body?.description, 500);
  const date = cleanString(req.body?.date, 10);
  const time = cleanString(req.body?.time, 5);
  const capacity = Number.parseInt(req.body?.capacity, 10);
  if (!["Akutlægeuddannelse", "Operationsuddannelse"].includes(type) ||
      !title || !description || !Number.isInteger(capacity) || capacity < 1 || capacity > 100 ||
      (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
      (time && !/^\d{2}:\d{2}$/.test(time))) {
    return res.status(400).json({ error: "Kontrollér felterne. Kapacitet skal være 1-100." });
  }
  const data = readData();
  const training = {
    id: crypto.randomUUID(), type, title, description, date, time,
    capacity, active: true
  };
  data.trainings.unshift(training);
  writeData(data);
  res.json({ success: true, training });
});
app.put("/api/admin/trainings/:id", adminOnly, adminLimiter, (req, res) => {
  const data = readData();
  const training = data.trainings.find(t => t.id === req.params.id);
  if (!training) return res.status(404).json({ error: "Træningen blev ikke fundet." });
  const type = cleanString(req.body?.type, 40);
  const title = cleanString(req.body?.title, 100);
  const description = cleanString(req.body?.description, 500);
  const date = cleanString(req.body?.date, 10);
  const time = cleanString(req.body?.time, 5);
  const capacity = Number.parseInt(req.body?.capacity, 10);
  const active = req.body?.active === true;
  if (!["Akutlægeuddannelse", "Operationsuddannelse"].includes(type) ||
      !title || !description || !Number.isInteger(capacity) || capacity < 1 || capacity > 100 ||
      (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
      (time && !/^\d{2}:\d{2}$/.test(time))) {
    return res.status(400).json({ error: "Kontrollér felterne. Kapacitet skal være 1-100." });
  }
  Object.assign(training, { type, title, description, date, time, capacity, active });
  writeData(data);
  res.json({ success: true });
});
app.delete("/api/admin/trainings/:id", adminOnly, adminLimiter, (req, res) => {
  const data = readData();
  const index = data.trainings.findIndex(t => t.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Træningen blev ikke fundet." });
  const [training] = data.trainings.splice(index, 1);
  // Keep aggregate counts meaningful by removing associated signup records.
  data.signups = data.signups.filter(s => s.trainingId !== training.id);
  writeData(data);
  res.json({ success: true });
});

app.use((err, req, res, next) => {
  console.error("Request failed:", err?.message || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Der opstod en serverfejl." });
});
app.listen(PORT, "0.0.0.0", () => console.log(`Medical training portal listening on ${PORT}`));
