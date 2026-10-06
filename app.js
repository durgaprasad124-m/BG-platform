import { applyMove } from "/game-engine.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const api = async (path, options = {}) => {
  const { headers = {}, ...requestOptions } = options;
  const response = await fetch(path, { ...requestOptions, headers: { "Content-Type": "application/json", ...headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The server could not complete that request.");
  return data;
};
const token = () => localStorage.getItem("bg-platform-auth-token");
const profileKey = "bg-platform-profile-v1";
let profile;
let feed = [];
let friends = [];
let conversations = [];
let activeFriend = null;
let currentGame = null;
let currentPlayerMark = null;
let gameMode = "bot";
let gameState = { board: Array(9).fill(null), currentPlayer: "X", status: "playing", winner: null };
let toastTimer;

const toast = $("#toast");
function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function avatarFor(name) { return name.trim().charAt(0).toUpperCase(); }
function setProfile(user) {
  profile = user;
  localStorage.setItem(profileKey, JSON.stringify(user));
  $("#profile-name").textContent = user.name;
  $("#profile-toggle").setAttribute("aria-label", `${user.name} profile`);
  $("#post-input").placeholder = `What are you playing today, ${user.name}?`;
  $$(".composer-avatar").forEach((element) => { element.textContent = user.avatar || "🧑🏽"; });
}

async function initializeSession() {
  const accessToken = token();
  if (!accessToken) return showAuth();
  try {
    const data = await api("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    setProfile(data.user);
    await loadAllData();
  } catch {
    localStorage.removeItem("bg-platform-auth-token");
    showAuth();
  }
}

function showAuth() {
  $("#setup-modal").classList.add("open");
  $("#signup-name").focus();
}
function setAuth(data) {
  setProfile(data.user);
  localStorage.setItem("bg-platform-auth-token", data.token);
  $("#setup-modal").classList.remove("open");
  notify(`Welcome, ${data.user.name}.`);
  loadAllData();
}

async function loadAllData() {
  await Promise.all([loadFeed(), loadFriends(), loadConversations()]);
}

($("#setup-form"));
function setFormError(element, message) { element.textContent = message; }
async function sendOtp(channel = "both") {
  const error = $("#setup-error");
  const name = $("#signup-name").value.trim();
  const email = $("#signup-email").value.trim();
  const phone = $("#signup-phone").value.trim();
  const dob = $("#signup-dob").value;
  const password = $("#signup-password").value;
  if (!name || !email || !phone || !dob || !password || calculateAge(dob) < 13) {
    setFormError(error, "Complete every field and confirm you are at least 13 years old.");
    return;
  }
  const button = $("#send-otp");
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    const body = channel === "both" ? { name, email, phone, dob, password } : { email, channel };
    const data = await api(channel === "both" ? "/api/auth/request-otp" : "/api/auth/resend-otp", { method: "POST", body: JSON.stringify(body) });
    setFormError(error, "");
    notify(data.message);
    if (channel === "both") $("#signup-email-otp").focus();
    else $(channel === "email" ? "#signup-email-otp" : "#signup-phone-otp").focus();
  } catch (error) { setFormError(error, error.message); }
  finally { button.disabled = false; button.textContent = "Send OTP"; }
}

$("#send-otp").addEventListener("click", () => sendOtp("both"));
$("#resend-email-otp").addEventListener("click", () => sendOtp("email"));
$("#resend-phone-otp").addEventListener("click", () => sendOtp("sms"));
$("#setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#setup-error");
  const body = { email: $("#signup-email").value.trim(), phone: $("#signup-phone").value.trim(), emailOtp: $("#signup-email-otp").value.trim(), phoneOtp: $("#signup-phone-otp").value.trim() };
  try {
    const data = await api("/api/auth/verify", { method: "POST", body: JSON.stringify(body) });
    setAuth(data);
  } catch (requestError) { setFormError(error, requestError.message); }
});
$("#show-login").addEventListener("click", () => { $("#setup-form").hidden = true; $("#login-form").hidden = false; });
$("#show-signup").addEventListener("click", () => { $("#login-form").hidden = true; $("#setup-form").hidden = false; });
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#login-error");
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: $("#login-email").value.trim(), password: $("#login-password").value }) });
    setAuth(data);
  } catch (requestError) { error.textContent = requestError.message; }
});

function calculateAge(dateString) {
  const birth = new Date(`${dateString}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime())) return -1;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function makeElement(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function postCard(post) {
  const article = makeElement("article", "post-card");
  article.dataset.postId = post.id;
  const head = makeElement("div", "post-head");
  const avatar = makeElement("span", "avatar post-avatar", post.avatar || "🧑🏽");
  const author = makeElement("span", "post-author");
  author.append(makeElement("b", "", post.authorName), makeElement("small", "", formatDate(post.createdAt)));
  head.append(avatar, author);
  const copy = makeElement("p", "post-copy", post.text);
  const meta = makeElement("div", "post-meta");
  const likes = makeElement("span", "like-count", `💚 ${post.likes.length} likes`);
  const comments = makeElement("span", "", `${post.comments.length} comments`);
  meta.append(likes, comments);
  const actions = makeElement("div", "post-actions");
  const like = makeElement("button", "post-action", "♡ Like"); like.dataset.like = post.id;
  const comment = makeElement("button", "post-action", "▢ Comment"); comment.dataset.comment = post.id;
  const share = makeElement("button", "post-action", "↗ Share"); share.dataset.share = post.id;
  actions.append(like, comment, share);
  const form = makeElement("form", "post-comments");
  const input = document.createElement("input"); input.type = "text"; input.maxLength = 180; input.placeholder = "Write a kind comment…"; input.required = true;
  const submit = makeElement("button", "", "Send"); submit.type = "submit";
  form.append(input, submit);
  article.append(head, copy, meta, actions, form);
  return article;
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
async function loadFeed() {
  const feedElement = $(".feed-column");
  const existing = $$(".post-card", feedElement);
  existing.forEach((element) => element.remove());
  try {
    const data = await api("/api/feed", { headers: { Authorization: `Bearer ${token()}` } });
    feed = data.posts;
    if (!feed.length) {
      const empty = makeElement("div", "friends-empty", "No posts yet. Be the first member to share something with the community.");
      feedElement.append(empty);
      return;
    }
    feed.forEach((post) => feedElement.insertBefore(postCard(post), feedElement.querySelector(".post-composer").nextSibling));
  } catch (error) { notify(error.message); }
}

async function loadFriends() {
  try {
    const data = await api("/api/friends", { headers: { Authorization: `Bearer ${token()}` } });
    friends = data.users;
    const grid = $("#friends-grid"); grid.replaceChildren();
    friends.forEach((friend) => {
      const card = makeElement("button", "friend-card"); card.dataset.friendId = friend.id;
      const avatar = makeElement("span", `friend-card-avatar ${friend.style || ""}`.trim(), friend.avatar || "👤");
      card.append(avatar, makeElement("b", "", friend.name), makeElement("small", "", "Available to connect"));
      card.addEventListener("click", () => openFriendProfile(friend));
      grid.append(card);
    });
    if (!friends.length) $("#friends-grid").textContent = "No other members are available yet.";
  } catch (error) { notify(error.message); }
}

async function loadConversations() {
  try {
    const data = await api("/api/conversations", { headers: { Authorization: `Bearer ${token()}` } });
    conversations = data.messages;
    renderChatList();
  } catch (error) { notify(error.message); }
}
function renderChatList() {
  const list = $("#chat-list-body"); list.replaceChildren();
  const grouped = new Map();
  conversations.forEach((message) => {
    const otherId = message.senderId === profile.id ? message.recipientId : message.senderId;
    const latest = grouped.get(otherId) || { message, messages: [] };
    latest.messages.push(message); latest.message = message;
    grouped.set(otherId, latest);
  });
  [...grouped.entries()].sort((a, b) => new Date(b[1].message.createdAt) - new Date(a[1].message.createdAt)).forEach(([id, thread]) => {
    const friend = friends.find((item) => item.id === id);
    if (!friend) return;
    const button = makeElement("button", `chat-person${activeFriend?.id === id ? " selected" : ""}`);
    button.addEventListener("click", () => openChat(id));
    button.append(makeElement("span", "chat-person-avatar", friend.avatar || "👤"), makeElement("span", "chat-person-copy", ""));
    const copy = button.lastElementChild; copy.append(makeElement("b", "", friend.name), makeElement("small", "", thread.message.text));
    list.append(button);
  });
  $("#chat-count").textContent = grouped.size ? `(${grouped.size})` : "";
}
function openChat(id) {
  activeFriend = friends.find((friend) => friend.id === id);
  if (!activeFriend) return;
  $("#chat-layout").hidden = false; $("#friends-directory").hidden = true;
  $("#thread-avatar").textContent = activeFriend.avatar || "👤";
  $("#thread-name").textContent = activeFriend.name;
  $("#thread-status").textContent = "Online · Connected";
  renderMessages(); renderChatList(); $("#chat-input").focus();
}
function renderMessages() {
  const list = $("#chat-messages"); list.replaceChildren();
  const messages = conversations.filter((message) => (message.senderId === profile.id && message.recipientId === activeFriend?.id) || (message.recipientId === profile.id && message.senderId === activeFriend?.id));
  if (!messages.length) { list.append(makeElement("p", "friends-empty", "Start a conversation with this member.")); return; }
  messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach((message) => {
    const bubble = makeElement("div", `chat-bubble${message.senderId === profile.id ? " mine" : ""}`);
    bubble.append(makeElement("div", "", message.text), makeElement("div", "chat-time", new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })));
    list.append(bubble);
  }); list.scrollTop = list.scrollHeight;
}

function showFriendDirectory() { $("#friends-directory").hidden = false; $("#chat-layout").hidden = true; $("#friends-grid").hidden = false; }
function openFriendProfile(friend) {
  $("#friend-profile-avatar").textContent = friend.avatar || "👤";
  $("#friend-profile-name").textContent = friend.name;
  $("#friend-profile-status").textContent = "Member · Active on BG Platform";
  $("#friend-profile-modal").classList.add("open");
}

$("#chat-compose").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeFriend) return notify("Choose a member first.");
  const text = $("#chat-input").value.trim();
  if (!text) return;
  try {
    const data = await api("/api/messages", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify({ recipientId: activeFriend.id, text }) });
    conversations.push(data.message); renderMessages(); renderChatList(); $("#chat-input").value = "";
  } catch (error) { notify(error.message); }
});

$("#post-composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#post-input"); const text = input.value.trim(); if (!text) return notify("Write something before posting.");
  try { const data = await api("/api/posts", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify({ text }) }); feed.unshift(data.post); await loadFeed(); input.value = ""; notify("Your post is now live."); }
  catch (error) { notify(error.message); }
});
$(".feed-column").addEventListener("click", async (event) => {
  const like = event.target.closest("[data-like]"); const comment = event.target.closest("[data-comment]"); const share = event.target.closest("[data-share]");
  if (like) { try { const data = await api(`/api/posts/${like.dataset.like}/like`, { method: "POST", headers: { Authorization: `Bearer ${token()}` } }); await loadFeed(); notify(data.likes ? "Post updated." : "Unable to update post."); } catch (error) { notify(error.message); } }
  if (comment) { const card = comment.closest(".post-card"); card.querySelector(".post-comments").classList.toggle("open"); if (card.querySelector(".post-comments").classList.contains("open")) card.querySelector("input").focus(); }
  if (share) { await navigator.clipboard?.writeText(window.location.href); notify("Post link copied."); }
});
$(".feed-column").addEventListener("submit", async (event) => {
  if (!event.target.matches(".post-comments")) return; event.preventDefault();
  const text = event.target.querySelector("input").value.trim(); if (!text) return;
  const postId = event.target.closest(".post-card").dataset.postId;
  try { await api(`/api/posts/${postId}/comments`, { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify({ text }) }); await loadFeed(); notify("Comment added."); } catch (error) { notify(error.message); }
});

const gameModal = $("#game-modal");
const board = $("#board"); const status = $("#match-status");
function renderBoard() { board.replaceChildren(); gameState.board.forEach((mark, index) => { const button = makeElement("button", `cell${mark === "X" ? " x-mark" : mark === "O" ? " o-mark" : ""}`, mark || ""); button.type = "button"; button.setAttribute("role", "gridcell"); button.disabled = Boolean(mark || gameState.status !== "playing" || (currentGame && currentPlayerMark !== gameState.currentPlayer)); button.addEventListener("click", () => makeMove(index)); board.append(button); }); updateGameStatus(); }
function updateGameStatus() { const winner = gameState.winner; if (winner) status.textContent = `Round complete · ${winner} wins`; else if (gameState.board.every(Boolean)) status.textContent = "Round complete · Draw"; else status.textContent = gameMode === "bot" ? "Your turn · You are X" : `${gameState.currentPlayer === "X" ? "Player 1" : "Player 2"} to move`; }
async function openGame() {
  gameMode = "bot";
  currentGame = null;
  currentPlayerMark = null;
  await createGame("bot");
}
async function createGame(mode) {
  gameMode = mode;
  if (mode === "bot") {
    try {
      const data = await api("/api/games", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify({ mode: "bot" }) });
      currentGame = data.game;
      currentPlayerMark = "X";
      gameState = currentGame.state;
      $("#modal-title").textContent = "Tic-Tac-Toe";
      $("#modal-title").nextElementSibling.textContent = "A trusted server-authoritative match.";
      $$("[data-mode]").forEach((button) => button.classList.toggle("selected", button.dataset.mode === "bot"));
      gameModal.classList.add("open");
      renderBoard();
    } catch (error) { notify(error.message); }
    return;
  }
  if (!activeFriend) return notify("Choose a friend before starting a private match.");
  try { const data = await api("/api/games", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify({ opponentId: activeFriend.id, mode: "friend" }) }); currentGame = data.game; currentPlayerMark = currentGame.players[0] === profile.id ? "X" : "O"; gameState = currentGame.state; $("#modal-title").textContent = `Match with ${activeFriend.name}`; gameModal.classList.add("open"); renderBoard(); }
  catch (error) { notify(error.message); }
}
async function makeMove(index) {
  if (currentGame) {
    if (gameState.currentPlayer !== currentPlayerMark) return notify("It is not your turn.");
    try { const data = await api(`/api/games/${currentGame.id}/move`, { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify({ index }) }); currentGame = data.game; gameState = data.game.state; renderBoard(); if (data.game.status === "finished") notify(data.game.state.winner ? "Match complete." : "The match ended in a draw."); }
    catch (error) { notify(error.message); }
    return;
  }
  if (gameMode !== "bot" || gameState.currentPlayer !== "X") return;
  try { const data = await api(`/api/games/${currentGame.id}/move`, { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify({ index }) }); currentGame = data.game; gameState = data.game.state; renderBoard(); if (data.game.status === "finished") notify(data.game.state.winner ? "Match complete." : "The match ended in a draw."); }
  catch (error) { notify(error.message); }
}
$("#new-game").addEventListener("click", () => { if (currentGame) return createGame("friend"); openGame(); });
$("#game-modal").addEventListener("click", (event) => { if (event.target === gameModal) gameModal.classList.remove("open"); });
$$("[data-mode]").forEach((button) => button.addEventListener("click", () => { gameMode = button.dataset.mode; $$("[data-mode]").forEach(option => option.classList.toggle("selected", option === button)); if (gameMode === "local") { gameState = { board: Array(9).fill(null), currentPlayer: "X", status: "playing", winner: null }; gameState.currentPlayer = "X"; currentGame = null; renderBoard(); } else { openGame(); } }));

function showAppView(name) {
  $$("[data-nav]").forEach(item => item.classList.toggle("active", item.dataset.nav === name));
  $(".breadcrumbs").innerHTML = `Playroom&nbsp; / &nbsp;<b>${name}</b>`;
  $("#discover-view").hidden = name !== "Discover"; $("#catalog-view").hidden = name !== "My games"; $("#friends-view").hidden = name !== "Friends";
  $("#back-home").hidden = name === "Discover";
  if (name === "Friends") { loadFriends(); loadConversations(); }
  if (name === "My games") loadFeed();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-nav]").forEach(button => button.addEventListener("click", () => showAppView(button.dataset.nav)));
$("#back-home").addEventListener("click", () => showAppView("Discover"));
$("#home-button").addEventListener("click", () => showAppView("Discover"));
$(".brand").addEventListener("click", event => { event.preventDefault(); showAppView("Discover"); });
$("#profile-toggle").addEventListener("click", () => { const menu = $("#profile-menu"); menu.hidden = !menu.hidden; $("#profile-toggle").setAttribute("aria-expanded", String(!menu.hidden)); });
$$("[data-profile-action]").forEach(button => button.addEventListener("click", () => { $("#profile-menu").hidden = true; if (button.dataset.profileAction === "logout") logout(); else notify("Account settings are managed by your verified profile."); }));
async function logout() { try { await api("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token()}` } }); } catch {} localStorage.removeItem("bg-platform-auth-token"); localStorage.removeItem(profileKey); profile = null; $("#setup-modal").classList.add("open"); }
$("#theme-toggle").addEventListener("click", () => { bodyDataset(); });
function bodyDataset() { const theme = document.body.dataset.theme === "dark" ? "light" : "dark"; document.body.dataset.theme = theme; $("#theme-toggle").textContent = theme === "dark" ? "☾" : "☀"; localStorage.setItem("bg-platform-theme", theme); }
bodyDataset();

$$("[data-open-game]").forEach(button => button.addEventListener("click", openGame));
$$("[data-close]").forEach(button => button.addEventListener("click", () => gameModal.classList.remove("open")));
$("#game-modal").addEventListener("click", event => { if (event.target === gameModal) gameModal.classList.remove("open"); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && gameModal.classList.contains("open")) gameModal.classList.remove("open"); });

initializeSession();
