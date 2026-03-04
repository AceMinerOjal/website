import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirebaseConfig } from "/assets/js/firebase-config.js";

const authPanelEl = document.getElementById("authPanel");
const chatShellEl = document.getElementById("chatShell");
const loginLinkEl = document.getElementById("loginLink");
const logoutBtn = document.getElementById("logoutBtn");
const userChipEl = document.getElementById("userChip");
const userEmailEl = document.getElementById("userEmail");
const userUidEl = document.getElementById("userUid");
const profileAvatarEl = document.getElementById("profileAvatar");
const toastEl = document.getElementById("loginToast");
const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const baseUrlEl = document.getElementById("baseUrl");
const roomIdEl = document.getElementById("roomId");
const composer = document.getElementById("composer");
const messageInputEl = document.getElementById("messageInput");

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let currentUser = null;
let socket = null;
let connectedRoomId = "";
let reconnectAfterClose = false;
const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
loginLinkEl.href = `/auth/?next=${encodeURIComponent(returnPath)}`;

const showToast = (message) => {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3000);
};

function senderIdFor(user) {
  if (!user) {
    throw new Error("Authentication required");
  }
  const uidShort = user.uid.slice(0, 8);
  const label = user.displayName?.trim() || user.email?.trim() || "user";
  return `${label} [${uidShort}]`;
}

function setStatus(text, color = "#cdd6f4") {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function handleAction(action) {
  try {
    action();
  } catch (error) {
    setStatus(error.message, "#f38ba8");
  }
}

function setButtonContent(button, iconClass, label) {
  button.innerHTML = `<i class="${iconClass}"></i> ${label}`;
}

function clearChatHistory() {
  messagesEl.replaceChildren();
}

function isPresenceJoinEvent(frame) {
  return (
    frame?.kind === "presence.join" && typeof frame?.sender_id === "string"
  );
}

function isPresenceLeaveEvent(frame) {
  return (
    frame?.kind === "presence.leave" && typeof frame?.sender_id === "string"
  );
}

function sendPresenceJoin(senderId) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const event = {
    kind: "presence.join",
    sender_id: senderId,
    avatar_url: profileAvatarUrl(currentUser),
    created_at: Date.now(),
  };
  socket.send(JSON.stringify(event));
}

function appendSystemMessage(text) {
  const li = document.createElement("li");
  li.className = "message";

  const content = document.createElement("div");
  content.className = "message-content";

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = "system";

  const body = document.createElement("p");
  body.className = "body";
  body.textContent = text;

  content.append(meta, body);
  li.append(content);
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function initialsFromLabel(value) {
  const source = (value || "User").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function avatarFallbackDataUrl(label) {
  const initials = initialsFromLabel(label);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#89b4fa"/>
      <stop offset="100%" stop-color="#a6e3a1"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="24" fill="url(#g)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="34" font-family="sans-serif" font-weight="700" fill="#1e1e2e">${initials}</text>
</svg>`.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function profileAvatarUrl(user) {
  if (user?.photoURL && user.photoURL.trim()) {
    return user.photoURL;
  }
  return avatarFallbackDataUrl(user?.displayName || user?.email || "User");
}

function messageAvatarUrl(message) {
  if (message?.avatar_url && message.avatar_url.trim()) {
    return message.avatar_url;
  }
  return avatarFallbackDataUrl(message?.sender_id || "User");
}

function appendMessage(
  { sender_id, payload_cipher, created_at, avatar_url },
  isLocal = false,
) {
  const li = document.createElement("li");
  li.className = `message ${isLocal ? "me" : ""}`;

  const avatar = document.createElement("img");
  avatar.className = "message-avatar";
  avatar.src = messageAvatarUrl({ avatar_url, sender_id });
  avatar.alt = `${sender_id || "User"} avatar`;

  const content = document.createElement("div");
  content.className = "message-content";

  const meta = document.createElement("p");
  meta.className = "meta";
  const ts = new Date(created_at).toLocaleTimeString();
  meta.textContent = `${sender_id} • ${ts}`;

  const body = document.createElement("p");
  body.className = "body";
  body.textContent = decodeUtf8(payload_cipher) ?? toHex(payload_cipher);

  content.append(meta, body);
  li.append(avatar, content);
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function toCipherBytes(plaintext) {
  return Array.from(new TextEncoder().encode(plaintext));
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function toHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseIncomingMessageData(data) {
  if (typeof data === "string") {
    return JSON.parse(data);
  }
  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(data)));
  }
  if (data instanceof Blob) {
    const text = await data.text();
    return JSON.parse(text);
  }
  throw new Error("unsupported websocket frame type");
}

function buildRoomSocketUrl() {
  const base = baseUrlEl.value.trim().replace(/\/$/, "");
  const roomId = roomIdEl.value.trim();
  if (!base || !roomId) {
    throw new Error("Base URL and room ID are required");
  }

  if (!base.startsWith("ws://") && !base.startsWith("wss://")) {
    throw new Error("Base URL must start with ws:// or wss://");
  }

  return `${base}/room/${encodeURIComponent(roomId)}`;
}

function setConnectedState(connected) {
  connectBtn.disabled = false;
  disconnectBtn.disabled = !connected;
  messageInputEl.disabled = !connected;
  connectBtn.classList.toggle("is-connected", connected);
  setButtonContent(
    connectBtn,
    connected ? "fas fa-right-left" : "fas fa-plug",
    connected ? "Switch Room" : "Connect",
  );
  setButtonContent(disconnectBtn, "fas fa-link-slash", "Disconnect");
}

function setAuthUi(user) {
  if (user) {
    authPanelEl.classList.add("hidden");
    chatShellEl.classList.remove("hidden");
    const primary = user.displayName || user.email || user.uid;
    userChipEl.textContent = primary;
    userEmailEl.textContent = user.email || "No email available";
    userUidEl.textContent = `[${user.uid.slice(0, 8)}]`;
    profileAvatarEl.src = profileAvatarUrl(user);
    profileAvatarEl.alt = `${primary} avatar`;
    setStatus(`Ready. Sender ID: ${senderIdFor(user)}`);
    return;
  }

  authPanelEl.classList.remove("hidden");
  chatShellEl.classList.add("hidden");
  userChipEl.textContent = "Signed in";
  userEmailEl.textContent = "No email available";
  userUidEl.textContent = "[UID]";
  profileAvatarEl.src = avatarFallbackDataUrl("User");
  profileAvatarEl.alt = "Signed in user avatar";
}

function connect() {
  if (!currentUser) {
    throw new Error("Please sign in first");
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    setStatus(
      `Already connected to ${connectedRoomId || roomIdEl.value.trim()}`,
      "#89b4fa",
    );
    return;
  }
  if (socket && socket.readyState === WebSocket.CONNECTING) {
    setStatus("Still connecting...", "#89b4fa");
    return;
  }

  const roomId = roomIdEl.value.trim();
  const wsUrl = buildRoomSocketUrl();
  const senderId = senderIdFor(currentUser);
  connectBtn.disabled = true;
  disconnectBtn.disabled = false;
  messageInputEl.disabled = true;
  setButtonContent(connectBtn, "fas fa-spinner fa-spin", "Connecting...");
  socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";

  setStatus(`Connecting to ${wsUrl}...`, "#89b4fa");

  socket.onopen = () => {
    setConnectedState(true);
    connectedRoomId = roomId;
    sendPresenceJoin(senderId);
    setStatus(`Connected to ${roomId} as ${senderId}`, "#a6e3a1");
  };

  socket.onmessage = async (event) => {
    try {
      const incoming = await parseIncomingMessageData(event.data);
      if (isPresenceJoinEvent(incoming)) {
        if (incoming.sender_id !== senderId) {
          appendSystemMessage(
            `${incoming.sender_id} joined room ${connectedRoomId || roomId}`,
          );
        }
        return;
      }
      if (isPresenceLeaveEvent(incoming)) {
        if (incoming.sender_id !== senderId) {
          appendSystemMessage(
            `${incoming.sender_id} left room ${connectedRoomId || roomId}`,
          );
        }
        return;
      }
      if (incoming.sender_id && Array.isArray(incoming.payload_cipher)) {
        appendMessage(incoming, incoming.sender_id === senderId);
      }
    } catch {
      setStatus("Received non-JSON message from server", "#f38ba8");
    }
  };

  socket.onerror = () => {
    setStatus(`WebSocket error at ${wsUrl}`, "#f38ba8");
  };

  socket.onclose = (event) => {
    const shouldReconnect = reconnectAfterClose;
    reconnectAfterClose = false;
    connectedRoomId = "";
    setConnectedState(false);
    clearChatHistory();
    socket = null;

    if (shouldReconnect) {
      handleAction(connect);
      return;
    }

    const reason = event.reason ? ` (${event.reason})` : "";
    setStatus(`Disconnected [${event.code}]${reason}`, "#cdd6f4");
  };
}

function disconnect(
  reconnect = false,
  closeReason = "Client closed connection",
) {
  reconnectAfterClose = reconnect;
  if (!socket) {
    setConnectedState(false);
    if (!reconnect) {
      clearChatHistory();
      setStatus("Already disconnected", "#89b4fa");
    }
    connectedRoomId = "";
    return;
  }

  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    setStatus(reconnect ? "Switching rooms..." : "Disconnecting...", "#f9e2af");
    disconnectBtn.disabled = true;
    connectBtn.disabled = true;
    messageInputEl.disabled = true;
    setButtonContent(
      reconnect ? connectBtn : disconnectBtn,
      "fas fa-spinner fa-spin",
      reconnect ? "Switching..." : "Disconnecting...",
    );
  }

  if (socket.readyState !== WebSocket.CLOSED) {
    socket.close(1000, closeReason);
  }
}

function switchToSelectedRoom() {
  const selectedRoom = roomIdEl.value.trim();
  if (!selectedRoom) {
    throw new Error("Room ID is required");
  }
  buildRoomSocketUrl();

  if (!socket || socket.readyState === WebSocket.CLOSED) {
    clearChatHistory();
    connect();
    return;
  }

  if (
    selectedRoom === connectedRoomId &&
    socket.readyState === WebSocket.OPEN
  ) {
    setStatus(`Already in room ${selectedRoom}`, "#89b4fa");
    return;
  }

  clearChatHistory();
  disconnect(true, "Switching room");
}

function sendMessage(text) {
  if (!currentUser) {
    throw new Error("Please sign in first");
  }
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("No active WebSocket connection");
  }

  const senderId = senderIdFor(currentUser);
  const message = {
    sender_id: senderId,
    avatar_url: profileAvatarUrl(currentUser),
    payload_cipher: toCipherBytes(text),
    created_at: Date.now(),
  };

  socket.send(JSON.stringify(message));
  appendMessage(message, true);
}

logoutBtn.onclick = async () => {
  try {
    disconnect();
    await signOut(auth);
    showToast("Signed out");
  } catch (err) {
    console.error("Logout error:", err?.code || "unknown");
    showToast("Sign out failed. Please try again.");
  }
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    showToast(`Welcome back, ${user.displayName || "friend"}`);
    setAuthUi(user);
    return;
  }

  disconnect();
  setAuthUi(null);
});

connectBtn.addEventListener("click", () => {
  handleAction(switchToSelectedRoom);
});

disconnectBtn.addEventListener("click", () => {
  disconnect();
});

roomIdEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  handleAction(switchToSelectedRoom);
});

roomIdEl.addEventListener("change", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  handleAction(switchToSelectedRoom);
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInputEl.value.trim();
  if (!text) {
    return;
  }

  handleAction(() => {
    sendMessage(text);
    messageInputEl.value = "";
  });
});

setConnectedState(false);
setStatus("Please sign in to continue");

window.addEventListener("beforeunload", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.close(1000, "Page unload");
});
