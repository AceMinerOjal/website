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
  return user.displayName?.trim() || `user-${user.uid.slice(0, 8)}`;
}

function setStatus(text, color = "#cdd6f4") {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function appendMessage({ sender_id, payload_cipher, created_at }, isLocal = false) {
  const li = document.createElement("li");
  li.className = `message ${isLocal ? "me" : ""}`;

  const meta = document.createElement("p");
  meta.className = "meta";
  const ts = new Date(created_at).toLocaleTimeString();
  meta.textContent = `${sender_id} • ${ts}`;

  const body = document.createElement("p");
  body.className = "body";
  body.textContent = decodeUtf8(payload_cipher) ?? toHex(payload_cipher);

  li.append(meta, body);
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
  connectBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  messageInputEl.disabled = !connected;
}

function setAuthUi(user) {
  if (user) {
    authPanelEl.classList.add("hidden");
    chatShellEl.classList.remove("hidden");
    userChipEl.textContent = `Signed in as ${user.displayName || user.email || user.uid}`;
    setStatus(`Ready. Sender ID: ${senderIdFor(user)}`);
    return;
  }

  authPanelEl.classList.remove("hidden");
  chatShellEl.classList.add("hidden");
}

function connect() {
  if (!currentUser) {
    throw new Error("Please sign in first");
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  const wsUrl = buildRoomSocketUrl();
  const senderId = senderIdFor(currentUser);
  socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";

  setStatus(`Connecting to ${wsUrl}...`, "#89b4fa");

  socket.onopen = () => {
    setConnectedState(true);
    setStatus(`Connected as ${senderId}`, "#a6e3a1");
  };

  socket.onmessage = async (event) => {
    try {
      const incoming = await parseIncomingMessageData(event.data);
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
    setConnectedState(false);
    const reason = event.reason ? ` (${event.reason})` : "";
    setStatus(`Disconnected [${event.code}]${reason}`, "#cdd6f4");
    socket = null;
  };
}

function disconnect() {
  if (socket) {
    socket.close(1000, "Client closed connection");
  }
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
  setConnectedState(false);
  setAuthUi(null);
});

connectBtn.addEventListener("click", () => {
  try {
    connect();
  } catch (error) {
    setStatus(error.message, "#f38ba8");
  }
});

disconnectBtn.addEventListener("click", () => {
  disconnect();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInputEl.value.trim();
  if (!text) {
    return;
  }

  try {
    sendMessage(text);
    messageInputEl.value = "";
  } catch (error) {
    setStatus(error.message, "#f38ba8");
  }
});

setConnectedState(false);
setStatus("Please sign in to continue");
