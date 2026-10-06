import "dotenv/config";
import express from "express";
import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 4173);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");
const otpFile = path.join(dataDir, "pending-otps.json");
const sessions = new Map();
const pendingOtps = new Map();

function sanitizePhone(value = "") {
  return String(value).replace(/[^\d+]/g, "").slice(0, 15);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = String(storedHash || "").split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = crypto.scryptSync(String(password), salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

async function persistUsers(users) {
  await fs.writeFile(usersFile, JSON.stringify(users, null, 2), "utf8");
}

async function persistPendingOtps() {
  await fs.writeFile(otpFile, JSON.stringify(Object.fromEntries(pendingOtps), null, 2), "utf8");
}

async function bootstrapData() {
  await fs.mkdir(dataDir, { recursive: true });
  const users = await readJson(usersFile, []);
  const pending = await readJson(otpFile, {});
  for (const [key, value] of Object.entries(pending || {})) pendingOtps.set(key, value);
  return users;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function getTokenFromHeader(headerValue) {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue);
  return match ? match[1] : null;
}

async function createTransport() {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured.");
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendOtpEmail({ name, email, code }) {
  const transporter = await createTransport();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Your BG Platform verification code",
    text: `Your BG Platform email verification code is ${code}. It expires in 5 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1d2a2c;">
        <h2>Verify your BG Platform account</h2>
        <p>Hello ${String(name || "member").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character])},</p>
        <p>Your verification code is:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #245b46;">${code}</p>
        <p>This code expires in 5 minutes.</p>
      </div>
    `
  });

  return info.messageId;
}

async function sendOtpSms({ phone, code }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio SMS is not configured.");
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      To: phone,
      From: fromNumber,
      Body: `Your BG Platform phone verification code is ${code}. It expires in 5 minutes.`
    })
  });
  if (!response.ok) {
    throw new Error(`Twilio rejected the SMS request (${response.status}).`);
  }
}

async function getUsers() {
  return readJson(usersFile, []);
}

async function saveUsers(users) {
  await persistUsers(users);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "BG Platform API" });
});

app.get("/api/games", (_req, res) => {
  res.json({
    ok: true,
    games: [
      { id: "tictactoe", name: "Tic-Tac-Toe", players: "1–2 players", type: "solo" },
      { id: "ludo", name: "Ludo", players: "2–4 players", type: "multiplayer" },
      { id: "chess", name: "Chess", players: "1–2 players", type: "solo" },
      { id: "carrom", name: "Carrom", players: "2–4 players", type: "multiplayer" },
      { id: "rummy", name: "Rummy", players: "2–6 players", type: "multiplayer" },
      { id: "pool", name: "Pool", players: "1–2 players", type: "multiplayer" },
      { id: "trivia", name: "Trivia", players: "1–8 players", type: "solo" },
      { id: "word-chain", name: "Word Chain", players: "2–8 players", type: "multiplayer" }
    ]
  });
});

app.post("/api/auth/request-otp", async (req, res) => {
  try {
    const { name, email, phone, dob, password } = req.body || {};
    if (!name || !email || !phone || !dob || !password) {
      return res.status(400).json({ ok: false, error: "All fields are required." });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = sanitizePhone(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      return res.status(400).json({ ok: false, error: "Enter a phone number in international format, such as +15551234567." });
    }
    const birthDate = new Date(`${dob}T00:00:00Z`);
    const ageNow = new Date();
    let age = ageNow.getUTCFullYear() - birthDate.getUTCFullYear();
    if (ageNow.getUTCMonth() < birthDate.getUTCMonth() || (ageNow.getUTCMonth() === birthDate.getUTCMonth() && ageNow.getUTCDate() < birthDate.getUTCDate())) age -= 1;
    if (!Number.isFinite(birthDate.getTime()) || age < 13) {
      return res.status(400).json({ ok: false, error: "Members must be at least 13 years old." });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters." });
    }

    const users = await getUsers();
    const exists = users.some((user) => user.email === normalizedEmail || user.phone === normalizedPhone);
    if (exists) {
      return res.status(409).json({ ok: false, error: "A member with this email or phone already exists." });
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
      return res.status(503).json({ ok: false, error: "Email and SMS delivery are not configured. Set SMTP and Twilio credentials on the server." });
    }

    const emailCode = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const phoneCode = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await Promise.all([
      sendOtpEmail({ name: String(name).trim(), email: normalizedEmail, code: emailCode }),
      sendOtpSms({ phone: normalizedPhone, code: phoneCode })
    ]);
    pendingOtps.set(normalizedEmail, {
      emailCodeHash: sha256(emailCode),
      phoneCodeHash: sha256(phoneCode),
      name: String(name).trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      dob,
      passwordHash: hashPassword(password),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0
    });
    await persistPendingOtps();
    res.json({
      ok: true,
      message: "Separate verification codes were sent to your email and phone.",
      email: normalizedEmail
    });
  } catch (error) {
    console.error("request-otp error", error.message);
    res.status(502).json({ ok: false, error: "Unable to deliver verification codes. Check the email and SMS provider settings." });
  }
});

app.post("/api/auth/resend-otp", async (req, res) => {
  try {
    const { email, channel } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedChannel = String(channel || "").toLowerCase();
    if (!normalizedEmail || !["email", "sms"].includes(normalizedChannel)) {
      return res.status(400).json({ ok: false, error: "Email and a valid channel ('email' or 'sms') are required." });
    }

    const pending = pendingOtps.get(normalizedEmail);
    if (!pending) {
      return res.status(404).json({ ok: false, error: "No active OTP request was found for this email." });
    }

    const now = Date.now();
    const cooldownUntil = Number(pending.resendRequestedAt || 0) + 30_000;
    if (now < cooldownUntil) {
      const seconds = Math.ceil((cooldownUntil - now) / 1000);
      return res.status(429).json({ ok: false, error: `Please wait ${seconds} seconds before resending the ${normalizedChannel === "email" ? "email" : "SMS"} code.` });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    if (normalizedChannel === "email") {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return res.status(503).json({ ok: false, error: "Email delivery is not configured." });
      }
      const { name, email: recipient } = pending;
      await sendOtpEmail({ name, email: recipient, code });
      pending.emailCodeHash = sha256(code);
    } else {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
        return res.status(503).json({ ok: false, error: "SMS delivery is not configured." });
      }
      await sendOtpSms({ phone: pending.phone, code });
      pending.phoneCodeHash = sha256(code);
    }

    pending.attempts = 0;
    pending.resendRequestedAt = now;
    pending.expiresAt = now + 5 * 60 * 1000;
    await persistPendingOtps();
    res.json({ ok: true, message: `${normalizedChannel === "email" ? "Email" : "SMS"} verification code sent.` });
  } catch (error) {
    console.error("resend-otp error", error.message);
    res.status(502).json({ ok: false, error: "Unable to resend the verification code. Check the provider settings." });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { email, phone, emailOtp, phoneOtp } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = sanitizePhone(phone || "");
    if (!normalizedEmail || !normalizedPhone || !emailOtp || !phoneOtp) {
      return res.status(400).json({ ok: false, error: "Email, phone, email code and phone code are required." });
    }

    const pending = pendingOtps.get(normalizedEmail);
    if (!pending || pending.phone !== normalizedPhone) {
      return res.status(400).json({ ok: false, error: "OTP request not found for this email and phone." });
    }
    if (Date.now() > pending.expiresAt) {
      pendingOtps.delete(normalizedEmail);
      return res.status(400).json({ ok: false, error: "OTP expired. Please request a new code." });
    }
    if (sha256(String(emailOtp).trim()) !== pending.emailCodeHash || sha256(String(phoneOtp).trim()) !== pending.phoneCodeHash) {
      pending.attempts += 1;
      if (pending.attempts >= 5) pendingOtps.delete(normalizedEmail);
      await persistPendingOtps();
      return res.status(400).json({ ok: false, error: pending.attempts >= 5 ? "Too many incorrect attempts. Request new codes." : "One or both verification codes are incorrect." });
    }

    const users = await getUsers();
    const user = {
      id: crypto.randomUUID(),
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      dob: pending.dob,
      passwordHash: pending.passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await saveUsers(users);
    pendingOtps.delete(normalizedEmail);
    await persistPendingOtps();

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, user.id);

    res.json({
      ok: true,
      message: "Account verified and logged in successfully.",
      token,
      user: publicUser(user)
    });
  } catch (error) {
    console.error("verify error", error);
    res.status(500).json({ ok: false, error: "Unable to verify your account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required." });
    }

    const users = await getUsers();
    const user = users.find((member) => member.email === normalizedEmail && verifyPassword(password, member.passwordHash));
    if (!user) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, user.id);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (error) {
    console.error("login error", error);
    res.status(500).json({ ok: false, error: "Unable to log in." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = getTokenFromHeader(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }
    const userId = sessions.get(token);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Session expired." });
    }
    const users = await getUsers();
    const user = users.find((member) => member.id === userId);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Member not found." });
    }
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    console.error("me error", error);
    res.status(500).json({ ok: false, error: "Unable to load profile." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = getTokenFromHeader(req.headers.authorization);
  if (token) sessions.delete(token);
  res.json({ ok: true, message: "Logged out." });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

await bootstrapData();

app.listen(port, "127.0.0.1", () => {
  console.log(`BG Platform API ready: http://127.0.0.1:${port}`);
});