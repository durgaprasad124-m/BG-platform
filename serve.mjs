import "dotenv/config";
import express from "express";
import nodemailer from "nodemailer";
import { MongoClient } from "mongodb";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMove, chooseBotMove, createGameState } from "./game-engine.mjs";

const app = express();
const port = Number(process.env.PORT || 4173);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mongoUri = process.env.MONGODB_URI;
const client = mongoUri ? new MongoClient(mongoUri) : null;
let db;
const pending = new Map();
const sessions = new Map();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname, { extensions: ["html"] }));

function sanitizePhone(value) {
  return String(value || "").replace(/[\d+]/g, "").length ? String(value).replace(/[^\d+]/g, "").slice(0, 15) : "";
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return Buffer.from(expected, "hex").length === actual.length && crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}
function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}
function token() { return crypto.randomBytes(32).toString("hex"); }
function requireAuth(req, res, next) {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!auth || !sessions.get(auth)) return res.status(401).json({ ok: false, error: "Please log in." });
  req.authToken = auth;
  next();
}
async function database() {
  if (!db) throw new Error("MongoDB is not configured.");
  return db;
}
async function sendEmail({ name, email, code }) {
  const host = process.env.SMTP_HOST;
  if (!host || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error("SMTP is not configured.");
  const transporter = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject: "Verify your BG Platform account", text: `Your verification code is ${code}. It expires in five minutes.`, html: `<h2>Verify your BG Platform account</h2><p>Hello ${String(name).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c])},</p><p>Your code is <strong>${code}</strong>.</p>` });
}
async function sendSms({ phone, code }) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) throw new Error("Twilio is not configured.");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: phone, From: TWILIO_FROM_NUMBER, Body: `Your BG Platform verification code is ${code}. It expires in five minutes.` }) });
  if (!response.ok) throw new Error(`Twilio error ${response.status}`);
}
function validateAge(dob) {
  const birth = new Date(`${dob}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime())) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--;
  return age >= 13;
}
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

app.get("/api/health", async (_req, res) => res.json({ ok: true, service: "BG Platform API", mongodb: Boolean(db) }));

app.post("/api/auth/request-otp", async (req, res) => {
  try {
    const { name, email, phone, dob, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = sanitizePhone(phone);
    if (!name?.trim() || !isValidEmail(normalizedEmail) || !/^\+[1-9]\d{7,14}$/.test(normalizedPhone) || !validateAge(dob) || String(password || "").length < 8) return res.status(400).json({ ok: false, error: "Complete valid account details are required." });
    const collection = (await database()).collection("users");
    const existing = await collection.findOne({ $or: [{ email: normalizedEmail }, { phone: normalizedPhone }] });
    if (existing) return res.status(409).json({ ok: false, error: "An account with these details already exists." });
    const emailCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const phoneCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const record = { emailCodeHash: sha256(emailCode), phoneCodeHash: sha256(phoneCode), name: name.trim(), email: normalizedEmail, phone: normalizedPhone, dob, passwordHash: hashPassword(String(password)), expiresAt: Date.now() + 5 * 60_000, attempts: 0, createdAt: new Date() };
    pending.set(normalizedEmail, record);
    await Promise.all([sendEmail({ name: name.trim(), email: normalizedEmail, code: emailCode }), sendSms({ phone: normalizedPhone, code: phoneCode })]);
    res.json({ ok: true, message: "Email and SMS verification codes sent.", email: normalizedEmail });
  } catch (error) {
    console.error("request-otp", error);
    res.status(502).json({ ok: false, error: error.message.includes("not configured") ? "Email or SMS delivery is not configured." : "Unable to send verification codes." });
  }
});

app.post("/api/auth/resend-otp", async (req, res) => {
  try {
    const { email, channel } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const record = pending.get(normalizedEmail);
    if (!record) return res.status(404).json({ ok: false, error: "No active verification request exists." });
    if (channel !== "email" && channel !== "sms") return res.status(400).json({ ok: false, error: "Choose email or sms." });
    const cooldown = Number(record.resendRequestedAt || 0) + 30_000;
    if (Date.now() < cooldown) return res.status(429).json({ ok: false, error: `Please wait ${Math.ceil((cooldown - Date.now()) / 1000)} seconds.` });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    if (channel === "email") { await sendEmail({ name: record.name, email: record.email, code }); record.emailCodeHash = sha256(code); }
    else { await sendSms({ phone: record.phone, code }); record.phoneCodeHash = sha256(code); }
    record.resendRequestedAt = Date.now(); record.expiresAt = Date.now() + 5 * 60_000; record.attempts = 0;
    res.json({ ok: true, message: `${channel === "email" ? "Email" : "SMS"} code sent.` });
  } catch (error) { console.error("resend-otp", error); res.status(502).json({ ok: false, error: "Unable to resend the verification code." }); }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { email, phone, emailOtp, phoneOtp } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = sanitizePhone(phone);
    const record = pending.get(normalizedEmail);
    if (!record || record.phone !== normalizedPhone) return res.status(400).json({ ok: false, error: "Verification request not found." });
    if (Date.now() > record.expiresAt) { pending.delete(normalizedEmail); return res.status(400).json({ ok: false, error: "Verification code expired." }); }
    if (sha256(emailOtp || "") !== record.emailCodeHash || sha256(phoneOtp || "") !== record.phoneCodeHash) {
      record.attempts++; if (record.attempts >= 5) pending.delete(normalizedEmail);
      return res.status(400).json({ ok: false, error: record.attempts >= 5 ? "Too many attempts. Request new codes." : "One or more codes are incorrect." });
    }
    const user = { id: crypto.randomUUID(), name: record.name, email: record.email, phone: record.phone, dob: record.dob, passwordHash: record.passwordHash, avatar: "🧑🏽", createdAt: new Date(), profile: { visibility: "friends" } };
    const users = await database();
    await users.collection("users").insertOne(user);
    pending.delete(normalizedEmail);
    const accessToken = token(); sessions.set(accessToken, user.id);
    res.json({ ok: true, token: accessToken, user: publicUser(user) });
  } catch (error) { console.error("verify", error); res.status(500).json({ ok: false, error: "Unable to verify account." }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!isValidEmail(normalizedEmail) || !password) return res.status(400).json({ ok: false, error: "Email and password are required." });
    const user = await (await database()).collection("users").findOne({ email: normalizedEmail });
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ ok: false, error: "Invalid email or password." });
    const accessToken = token(); sessions.set(accessToken, user.id);
    res.json({ ok: true, token: accessToken, user: publicUser(user) });
  } catch (error) { console.error("login", error); res.status(500).json({ ok: false, error: "Unable to log in." }); }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await (await database()).collection("users").findOne({ id: sessions.get(req.authToken) });
  if (!user) return res.status(401).json({ ok: false, error: "Session is no longer valid." });
  res.json({ ok: true, user: publicUser(user) });
});
app.post("/api/auth/logout", requireAuth, (req, res) => { sessions.delete(req.authToken); res.json({ ok: true, message: "Signed out." }); });

app.get("/api/feed", requireAuth, async (req, res) => {
  const posts = await (await database()).collection("posts").find({}).sort({ createdAt: -1 }).limit(50).toArray();
  res.json({ ok: true, posts });
});
app.post("/api/posts", requireAuth, async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ ok: false, error: "Post text is required." });
  const user = await (await database()).collection("users").findOne({ id: sessions.get(req.authToken) });
  const post = { id: crypto.randomUUID(), authorId: user.id, authorName: user.name, avatar: user.avatar, text, createdAt: new Date(), likes: [], comments: [] };
  await (await database()).collection("posts").insertOne(post);
  res.status(201).json({ ok: true, post });
});
app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
  const collection = (await database()).collection("posts"); const id = req.params.id; const userId = sessions.get(req.authToken);
  const post = await collection.findOne({ id }); if (!post) return res.status(404).json({ ok: false, error: "Post not found." });
  const liked = post.likes.includes(userId); await collection.updateOne({ id }, { $set: { likes: liked ? post.likes.filter(item => item !== userId) : [...post.likes, userId] } });
  res.json({ ok: true, likes: (await collection.findOne({ id })).likes.length });
});
app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 500); if (!text) return res.status(400).json({ ok: false, error: "Comment is required." });
  const collection = (await database()).collection("posts"); const post = await collection.findOne({ id: req.params.id }); if (!post) return res.status(404).json({ ok: false, error: "Post not found." });
  const user = await (await database()).collection("users").findOne({ id: sessions.get(req.authToken) }); const comment = { id: crypto.randomUUID(), authorId: user.id, authorName: user.name, text, createdAt: new Date() };
  await collection.updateOne({ id: req.params.id }, { $push: { comments: comment } }); res.status(201).json({ ok: true, comment });
});

app.get("/api/friends", requireAuth, async (req, res) => {
  const userId = sessions.get(req.authToken); const users = await (await database()).collection("users").find({ id: { $ne: userId } }).project({ passwordHash: 0 }).toArray();
  res.json({ ok: true, users });
});
app.post("/api/friends/:id/request", requireAuth, async (req, res) => {
  const userId = sessions.get(req.authToken); if (userId === req.params.id) return res.status(400).json({ ok: false, error: "You cannot add yourself." });
  const { id } = await (await database()).collection("users").findOne({ id: req.params.id }) || {};
  if (!id) return res.status(404).json({ ok: false, error: "User not found." });
  await (await database()).collection("friendships").insertOne({ from: userId, to: id, status: "pending", createdAt: new Date() }); res.json({ ok: true, message: "Friend request sent." });
});
app.get("/api/conversations", requireAuth, async (req, res) => {
  const userId = sessions.get(req.authToken); const messages = await (await database()).collection("messages").find({ $or: [{ senderId: userId }, { recipientId: userId }] }).sort({ createdAt: -1 }).limit(200).toArray(); res.json({ ok: true, messages });
});
app.post("/api/messages", requireAuth, async (req, res) => {
  const { recipientId, text } = req.body || {}; const senderId = sessions.get(req.authToken); const messageText = String(text || "").trim().slice(0, 1000);
  if (!recipientId || !messageText) return res.status(400).json({ ok: false, error: "Recipient and message are required." });
  const message = { id: crypto.randomUUID(), senderId, recipientId, text: messageText, createdAt: new Date(), read: false }; await (await database()).collection("messages").insertOne(message); res.status(201).json({ ok: true, message });
});

app.post("/api/games", requireAuth, async (req, res) => {
  const { opponentId, mode = "bot" } = req.body || {}; const userId = sessions.get(req.authToken); const game = { id: crypto.randomUUID(), status: "waiting", gameType: "tictactoe", mode, players: [userId], opponentId: mode === "bot" ? null : opponentId, state: createGameState(), createdAt: new Date(), updatedAt: new Date() };
  if (mode === "bot") {
    game.players.push("bot"); game.status = "playing";
  } else {
    if (!opponentId || opponentId === userId) return res.status(400).json({ ok: false, error: "Choose a different opponent." });
    const opponent = await (await database()).collection("users").findOne({ id: opponentId });
    if (!opponent) return res.status(404).json({ ok: false, error: "Opponent not found." });
    game.players.push(opponentId); game.status = "playing";
  }
  await (await database()).collection("games").insertOne(game); res.status(201).json({ ok: true, game });
});
app.get("/api/games/:id", requireAuth, async (req, res) => { const game = await (await database()).collection("games").findOne({ id: req.params.id }); if (!game) return res.status(404).json({ ok: false, error: "Game not found." }); res.json({ ok: true, game }); });
app.post("/api/games/:id/move", requireAuth, async (req, res) => {
  const game = await (await database()).collection("games").findOne({ id: req.params.id }); if (!game) return res.status(404).json({ ok: false, error: "Game not found." });
  const userId = sessions.get(req.authToken); const player = game.players[0] === userId ? "X" : game.players[1] === userId ? "O" : null; if (!player || game.status !== "playing") return res.status(403).json({ ok: false, error: "Move not allowed." });
  const result = applyMove(game.state, Number(req.body.index), player); if (!result.ok) return res.status(400).json(result);
  let state = { ...result.state, lastMove: { index: Number(req.body.index), player, at: new Date() } };
  if (game.mode === "bot" && state.status === "playing") {
    const botIndex = chooseBotMove(state.board);
    const botResult = applyMove(state, botIndex, "O");
    if (botResult.ok) state = { ...botResult.state, lastMove: { index: botIndex, player: "O", at: new Date() } };
  }
  const next = { ...game, state, status: state.status === "finished" || state.status === "draw" ? "finished" : game.status, updatedAt: new Date() };
  await (await database()).collection("games").replaceOne({ id: game.id }, next); res.json({ ok: true, game: next });
});

async function start() {
  if (!mongoUri) throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.");
  await client.connect(); db = client.db(); await Promise.all([db.collection("users").createIndex({ email: 1 }, { unique: true }), db.collection("users").createIndex({ phone: 1 }, { unique: true }), db.collection("messages").createIndex({ senderId: 1, recipientId: 1 }), db.collection("games").createIndex({ players: 1 })]);
  app.listen(port, "127.0.0.1", () => console.log(`BG Platform API ready at http://127.0.0.1:${port}`));
}
start().catch(error => { console.error(error); process.exit(1); });
