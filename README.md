# BG Platform

BG Platform is a social gaming app with verified member accounts, MongoDB-backed posts and messages, and server-authoritative Tic-Tac-Toe. Email and SMS verification require SMTP and Twilio configuration.

## Run locally

Requires Node.js 18 or newer.

```powershell
npm install
Copy-Item .env.example .env
```

In MongoDB Atlas, create a database user and allow your development IP address under Network Access. From the cluster's **Connect** menu, choose **Drivers** and copy the Node.js connection string. Replace the placeholders in `MONGODB_URI` in your local `.env` with that string and a database name. If the database password contains URI-reserved characters, percent-encode them before placing it in the URI.

Set your SMTP and Twilio values in `.env` to enable signup verification. `.env` is gitignored; never commit or share the connection string or provider credentials. Start the app with:

```powershell
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Press `Ctrl+C` in the server terminal to stop it. Set `PORT` to use another local port.

`MONGODB_URI` configures the MongoDB Atlas connection. `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` configure email delivery. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` configure SMS delivery. The Twilio sender must be enabled for the destination region. Signup requires an international phone number in E.164 format, such as `+15551234567`. Verification codes expire after five minutes and are never returned by the API.

User, feed, message, friendship, and match records are stored in MongoDB. Passwords use Node's scrypt hash. Sessions and pending OTP challenges are currently in memory, so they are cleared on server restart and do not support multiple server instances. Real-time chat updates, moderation, and catalog games beyond Tic-Tac-Toe are not implemented yet. Photos and fonts load from external Unsplash and Google Fonts URLs when internet access is available.
