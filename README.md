# BG-platform

A responsive social gaming front-end prototype for desktop and mobile. It has a social feed, friend stories, a 205-title categorized game catalog, browser-local friend conversations, sample posts, local post/like/comment interactions, friend/game previews, a daily reward, and playable Tic-Tac-Toe against a bot or in pass-and-play mode.

## Run locally

Requires Node.js 18 or newer. No package installation is needed.

```powershell
node serve.mjs
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Press `Ctrl+C` in the server terminal to stop it. Set `PORT` to use another local port.

The sample profile, stories, posts, friends, messages, event, reward, and social actions are browser-local demo behavior; they are not saved to a database or shared with other users. Only Tic-Tac-Toe is playable; other catalog titles are previews. Authentication, OTP delivery, server-backed real-time chat, multiplayer rooms, moderation services, and deployment infrastructure have not been implemented yet. Photos and fonts load from external Unsplash and Google Fonts URLs when internet access is available.
