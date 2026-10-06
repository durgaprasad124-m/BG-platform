# BG Platform

BG Platform is a social gaming app with member signup, email and SMS verification, member login, a social feed, and a categorized game catalog. Most social content remains browser-local, and only Tic-Tac-Toe is currently playable.

## Run locally

Requires Node.js 18 or newer.

```powershell
npm install
Copy-Item .env.example .env
```

Set the SMTP and Twilio values in `.env`, then start the app:

```powershell
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Press `Ctrl+C` in the server terminal to stop it. Set `PORT` to use another local port.

`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` configure email delivery. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` configure SMS delivery. The Twilio sender must be enabled for the destination region. Signup requires an international phone number in E.164 format, such as `+15551234567`. Verification codes expire after five minutes and are never returned by the API.

Member records are stored in the ignored `data/` directory, and passwords use Node's scrypt hash. This file-backed storage and in-memory sessions are suitable only for a single local server; production deployment needs a managed database and persistent session storage. Real-time chat, multiplayer rooms, moderation, and most catalog games are not implemented yet. Photos and fonts load from external Unsplash and Google Fonts URLs when internet access is available.
