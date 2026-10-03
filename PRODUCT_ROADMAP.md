# Product Requirements and Roadmap

**Working title:** `[PLATFORM NAME]` (final brand name TBD)  
**Audience:** Teens (13+) and adults, India-first with internationalization planned  
**Product:** A mobile-first social gaming service for meeting friends, chatting safely, and playing short multiplayer games.

## 1. Product Principles

- Make it easy to get from sign-in to a playable game with friends.
- Treat safety, privacy, and moderation as core product capabilities, not later add-ons.
- Keep game rules and results trustworthy by making the server authoritative.
- Build a shared room and game-plugin contract; add games incrementally rather than building a one-off platform per game.
- Use virtual rewards only. No cash-out, real-money betting, or gambling mechanics.
- Start with responsive web/PWA. Native iOS and Android apps are a later delivery decision.

## 2. Primary User Journeys

1. **Join safely:** Register with email or phone and password, verify with a short-lived OTP, confirm age eligibility, and select basic privacy settings.
2. **Play with a friend:** Find or add a friend, invite them to a public or private room, complete a ready check, play, see results, and rematch.
3. **Play solo:** Choose a supported game and play against its documented bot where the game supports one.
4. **Meet someone new:** Join a game-type matchmaking queue, with clear controls to leave, block, or report the other player.
5. **Manage account access:** Stay signed in on a trusted device, review active sessions, and revoke one or all sessions.
6. **Get help with harm:** Block or mute a user, report a message/player, and access account and safety controls without leaving the experience.

## 3. Product Requirements

### Accounts and sessions

- Sign up and sign in using email or phone number plus password; verify the chosen contact method with OTP.
- Require OTP verification at signup, password recovery, and sign-in from a new device. OTPs expire after five minutes, have at most five attempts, and are rate-limited.
- Store passwords with Argon2id or bcrypt. Use secure, httpOnly, sameSite cookies for refresh sessions, rotate refresh tokens, and revoke tokens on logout or suspicious activity.
- Provide device/session listing, single-session logout, and logout-all. Do not expose raw refresh tokens or sensitive device identifiers in the UI.
- Require users to confirm they meet the minimum age of 13. Apply age-aware defaults and restrictions for users under 18; do not rely on age confirmation alone as a complete child-safety control.
- Optional Google sign-in and authenticator-based 2FA are not MVP requirements.

### Social, chat, and matchmaking

- Support friend requests, acceptance/removal, blocking, and invitations to a game room.
- MVP chat is real-time text and emoji in direct, group, and game-room contexts, subject to privacy settings and moderation controls.
- Show presence, typing, and read state only where user privacy settings permit it.
- Provide report, block, and mute actions at relevant user/message surfaces. Enforce message and invitation rate limits and prevent blocked users from contacting or inviting the blocker.
- Matchmaking is opt-in, game-specific, cancellable, and does not reveal a user's personal contact details.
- Defer image, GIF, sticker, voice-note, and voice-chat support until moderation, consent, retention, and abuse-response controls are ready.

### Games and rooms

- Define one common lifecycle: lobby, room creation/join, ready check, play, result, rematch, and leave/reconnect.
- Each game declares supported player count (1-12), turn-based or real-time mode, rules/version, and bot support where applicable.
- MVP launches with Tic-Tac-Toe as the reference implementation for the server-authoritative game contract. Add Ludo next after the contract and room lifecycle are proven. Chess, Carrom, and Cricket follow in the next content tranche.
- Support public and invite-only rooms, invite codes/links, reconnects, and room chat. Spectating is a post-MVP feature.
- Validate every move on the server, enforce turn/clock rules there, and record enough state to recover an interrupted match. Client rendering is presentation, not authority.
- Do not promise 400 games in the initial release. Grow the catalogue through versioned game plugins and operational readiness checks.

### Engagement and profile

- MVP: editable display name/avatar, basic profile and match history, a daily reward, and a small set of non-purchasable XP/badges.
- Later: avatar builder, levels, streaks, missions, achievements, virtual gifts/coins, leaderboards, tournaments, seasonal events, clubs, replays, and share cards.
- Virtual currency has no monetary value, is not transferable for cash, and cannot be wagered for cash or cash-equivalent prizes.

### Safety, privacy, and operations

- Establish community rules and a report-review workflow before opening public matchmaking.
- Provide configurable message/profile discovery controls, user blocking, abuse/spam filtering, and moderation escalation for reports.
- For minors, apply restrictive defaults: private profile, limited discoverability/contact, controls on unsolicited direct messages, and no collection or display of personal contact details in chat. Provide an age-appropriate parental-safety experience; determine legally required parental consent and verification requirements before launch.
- Do not allow chat to be used to exchange phone numbers, addresses, or other personal details; use detection and user-facing warnings, with an appeal/escalation process for enforcement.
- Admin tools must use role-based access, audit sensitive actions, and support report triage, user sanctions, and appeal handling.
- Define data minimization, retention/deletion, access/export, incident response, and vendor controls before launch. Obtain qualified legal review for India DPDP Act and applicable rules, GDPR where offered, child-safety obligations, and platform policies. This roadmap is product planning, not legal advice.
- Image moderation, anti-cheat, anti-bot, abuse detection, and rate limits must be introduced before enabling the feature surface they protect.

### Experience and accessibility

- Responsive, touch-first web experience with installable PWA capability and graceful behavior on slower mobile networks.
- Home should prioritize continue playing, start/invite a game, friends/presence, trending games, and one daily activity without making the initial screen feel crowded.
- Support loading, empty, error, reconnecting, and moderation states as first-class UI states.
- Support keyboard navigation, visible focus, accessible names, sufficient contrast, reduced-motion preference, and scalable text.
- Launch in English; prepare localization infrastructure for Hindi, Telugu, and additional languages without embedding user-facing copy in game logic.
- Themes and festival/event presentation are post-MVP, with contrast and motion accessibility preserved.

## 4. Phased Roadmap

### MVP — Safe, playable foundation

**Goal:** A small, reliable web product where users can create an account, connect with friends, and complete a multiplayer match.

- Email or phone registration/login, password recovery, OTP verification, age confirmation, secure persistent sessions, device management, and logout.
- Responsive home, profile basics, friends/requests, privacy controls, and online presence.
- Real-time text/emoji chat for direct, group, and game rooms; typing/read indicators subject to privacy settings.
- User report/block/mute, basic abuse/spam filtering, rate limiting, admin report queue, and account sanctions.
- Shared room lifecycle, invite-only/public rooms, ready check, reconnect support, and server-authoritative Tic-Tac-Toe.
- Ludo is the first planned post-MVP game, unless validated scope and schedule permit it without reducing safety or test coverage.
- Minimal daily reward/XP and match history; no purchasable currency, public voice, media uploads, or open-ended anonymous chat.
- Operational basics: monitoring, audit logging, backups, privacy/terms pages, deletion workflow, incident contacts, and staged rollout.

**MVP exit criteria:** New and returning users can complete auth and session-revocation flows; a full game can be created, joined, played, recovered after reconnect, and rematched; abuse reports can be reviewed and actioned; core mobile and accessibility paths pass acceptance tests; operational owners can detect service failure and restore data.

### V2 — More ways to play and connect

**Goal:** Increase repeat play and safe social discovery after MVP retention and moderation operations are measured.

- Add Ludo, then Chess, Carrom, and Cricket as individually tested plugins; add bots where game design permits.
- Opt-in game-specific matchmaking, spectator mode, richer game history/replays, tournaments, and friends/weekly leaderboards.
- Expand profiles, avatar customization, achievements, missions, streaks, and non-cash virtual gifts.
- Add media sharing only after image scanning/moderation, consent, reporting, storage retention, and abuse response are production-ready.
- Add push notifications with granular consent and quiet controls; improve localization and festival events.
- Add stronger trust tooling: moderator queues, appeals, safety analytics, and documented service-level targets.

### V3 — Scale and platform breadth

**Goal:** Grow catalogue, communities, and geographic reach while maintaining safety and reliability.

- Expand the plugin catalogue toward 20, 50, and beyond based on demand, quality, moderation risk, and support cost; 400+ is an aspiration, not a committed delivery date.
- Clubs/communities, seasonal events, advanced leagues/tournaments, richer replay/share features, and carefully governed creator/community tools.
- Evaluate native mobile applications, voice rooms, additional login providers, and advanced 2FA based on usage and safety readiness.
- Scale real-time infrastructure, regional deployments, fraud/anti-cheat systems, localization, and policy operations to measured demand.

## 5. Success Measures

Instrument privacy-conscious, aggregate metrics and review them by age band and platform only where lawful and necessary.

- **Activation:** signup completion, first friend/game invite, and first completed match.
- **Reliability:** auth success, room-join success, match completion, reconnect recovery, latency, and crash/error rates.
- **Retention/quality:** repeat play, rematches, friend-assisted sessions, and player-rated match quality.
- **Safety:** reports per active user, time to triage/action, repeat-abuse rate, block success, false-positive/appeal outcomes, and unsolicited-contact incidence.
- **Accessibility/inclusion:** completion of key flows with keyboard/screen reader and successful localization testing.

Set numeric targets only after a closed beta establishes a trustworthy baseline; do not optimize engagement at the expense of safety or user control.

## 6. Decisions to Confirm Before Implementation

- Final platform name, domain, and brand identity.
- Whether the first closed beta supports both email and phone OTP, and which SMS/email vendors are available in launch regions.
- Initial launch regions and legal review scope.
- Minor onboarding, parental consent/verification, and messaging policy validated with qualified counsel and child-safety specialists.
- Whether MVP must include Ludo or whether the reference Tic-Tac-Toe game is sufficient to validate the platform foundation.
- Moderation staffing and response expectations for reports, appeals, and urgent safety concerns.
- Beta scale, availability expectations, and an initial operating budget.

## Next Step

After this product scope is approved, Step 2 will define the system architecture and database schema against these MVP boundaries. No application code has been started in this step.