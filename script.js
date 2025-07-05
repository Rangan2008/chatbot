// ✅ ChatBot JS with Session Persistence and Search Popup

let db;
const DB_NAME = "ChatHistoryDB";
const STORE_NAME = "chats";
const DB_VERSION = 1;
let currentSessionId = null;

// 🌟 Init IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = (event) => { db = event.target.result; resolve(db); };
    request.onerror = (event) => { console.error("IndexedDB error:", event.target.error); reject(event.target.error); };
  });
}

// 💾 Save Chat
async function saveChat(userMessage, aiMessage) {
  if (!db) await initDB();
  if (!currentSessionId) {
    currentSessionId = Date.now();
    localStorage.setItem("currentSessionId", currentSessionId);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const chat = {
      sessionId: currentSessionId,
      userMessage,
      aiMessage,
      timestamp: Date.now()
    };
    const request = store.add(chat);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

// 📤 Send Message
async function sendMessage(text) {
  const input = document.getElementById("user-input");
  const mainBox = document.getElementById("main");
  const messageArea = document.getElementById("messages");

  if (!text) text = input.value.trim();
  if (text === "") return;

  const userMsgDiv = document.createElement("div");
  userMsgDiv.className = "message user";
  userMsgDiv.textContent = text;
  messageArea.appendChild(userMsgDiv);
  input.value = "";
  mainBox.classList.add("shift-down");

  messageArea.scrollTop = messageArea.scrollHeight;
  const aiResponse = await getAIResponse(text);
  await saveChat(text, aiResponse);
  await loadChatSessions();
}

// 🤖 Get AI Response
async function getAIResponse(userText) {
  const messageArea = document.getElementById("messages");
  const aiMsgDiv = document.createElement("div");
  aiMsgDiv.className = "message ai";
  aiMsgDiv.textContent = "AI is typing...";
  messageArea.appendChild(aiMsgDiv);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=AIzaSyBMzso4XRU5VzGmaolfZnFGesRsATWYgvc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] })
    });
    const data = await response.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    aiMsgDiv.textContent = responseText || "(No response)";
    return responseText || "(No response)";
  } catch (err) {
    aiMsgDiv.textContent = "Error: " + err.message;
    return "Error: " + err.message;
  } finally {
    messageArea.scrollTop = messageArea.scrollHeight;
  }
}

// 🧠 Load Sessions to Sidebar
async function loadChatSessions(filter = "") {
  if (!db) await initDB();
  const store = db.transaction([STORE_NAME], "readonly").objectStore(STORE_NAME);
  const request = store.getAll();

  request.onsuccess = () => {
    const grouped = {};
    request.result.forEach(chat => {
      if (!grouped[chat.sessionId]) grouped[chat.sessionId] = [];
      grouped[chat.sessionId].push(chat);
    });

    const list = document.getElementById("chat-history-list");
    if (!list) return;
    list.innerHTML = "";

    Object.entries(grouped).sort((a, b) => b[0] - a[0]).forEach(([id, msgs]) => {
      const preview = msgs[0]?.userMessage?.slice(0, 30) || "Chat";
      const match = filter === "" || msgs.some(m => m.userMessage.toLowerCase().includes(filter) || m.aiMessage.toLowerCase().includes(filter));
      if (match) {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${preview}</strong><br><small>📅 ${new Date(+id).toLocaleString()}</small>`;
        li.onclick = () => loadChatSession(id);

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.style.float = "right";
        delBtn.onclick = (e) => { e.stopPropagation(); deleteChatSession(id); };

        li.appendChild(delBtn);
        list.appendChild(li);
      }
    });
  };
}

// 📥 Load One Session
async function loadChatSession(id) {
  if (!db) await initDB();
  currentSessionId = Number(id);
  localStorage.setItem("currentSessionId", currentSessionId);

  const store = db.transaction([STORE_NAME], "readonly").objectStore(STORE_NAME);
  const request = store.getAll();

  request.onsuccess = () => {
    const chats = request.result.filter(c => c.sessionId == id);
    const msgArea = document.getElementById("messages");
    msgArea.innerHTML = "";
    document.getElementById("main").classList.add("shift-down");

    chats.forEach(c => {
      const u = document.createElement("div");
      u.className = "message user";
      u.textContent = c.userMessage;
      msgArea.appendChild(u);

      const a = document.createElement("div");
      a.className = "message ai";
      a.textContent = c.aiMessage;
      msgArea.appendChild(a);
    });
  };
}

// 🗑️ Delete Session
async function deleteChatSession(id) {
  if (!db) await initDB();
  const tx = db.transaction([STORE_NAME], "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();

  request.onsuccess = () => {
    request.result.forEach(chat => { if (chat.sessionId == id) store.delete(chat.id); });
    setTimeout(loadChatSessions, 300);
  };
}

// 🎤 Voice
function startVoiceRecognition() {
  if (!('webkitSpeechRecognition' in window)) return alert("Voice only in Chrome");
  const rec = new webkitSpeechRecognition();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  const mic = document.getElementById("voice-btn");
  mic.classList.add("recording");
  rec.onresult = e => {
    const t = e.results[0][0].transcript;
    document.getElementById("user-input").value = t;
  };
  rec.onerror = e => alert("Voice error: " + e.error);
  rec.onend = () => mic.classList.remove("recording");
  rec.start();
}

// ⌨️ Handle input
function handleKeyPress(e) { if (e.key === "Enter") sendMessage(); }

// 🔍 Open Search Popup
const searchBtn = document.getElementById("search-chat-btn");
if (searchBtn) {
  searchBtn.addEventListener("click", () => {
    const popup = document.createElement("div");
    popup.id = "search-popup";
    popup.style.position = "fixed";
    popup.style.top = "20%";
    popup.style.left = "50%";
    popup.style.transform = "translateX(-50%)";
    popup.style.width = "300px";
    popup.style.padding = "20px";
    popup.style.background = "#fff";
    popup.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
    popup.style.borderRadius = "10px";
    popup.style.zIndex = "9999";

    popup.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <input type="text" id="popup-search-input" placeholder="Search previous chats..." style="width: 85%; padding: 8px; border: 1px solid #aaa; border-radius: 5px;">
        <span id="popup-close-btn" style="cursor: pointer; font-size: 20px; margin-left: 10px;">&times;</span>
      </div>
      <ul id="popup-search-results" style="list-style: none; margin-top: 10px; max-height: 200px; overflow-y: auto; padding: 0;"></ul>
    `;

    document.body.appendChild(popup);

    // Handle closing the popup
    const closeBtn = document.getElementById("popup-close-btn");
    closeBtn.addEventListener("click", () => {
      document.body.removeChild(popup);
    });

    const input = document.getElementById("popup-search-input");
    input.focus();
    input.addEventListener("input", async (e) => {
      const value = e.target.value.toLowerCase();
      const store = db.transaction([STORE_NAME], "readonly").objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result.filter(chat =>
          chat.userMessage.toLowerCase().includes(value) ||
          chat.aiMessage.toLowerCase().includes(value)
        );

        const list = document.getElementById("popup-search-results");
        list.innerHTML = "";
        results.forEach(chat => {
          const li = document.createElement("li");
          li.textContent = chat.userMessage; // ✅ Only show user message
          li.style.padding = "6px";
          li.style.borderBottom = "1px solid #eee";
          li.style.cursor = "pointer";
          li.onclick = async () => {
            await loadChatSession(chat.sessionId);
            document.body.removeChild(popup);
          };
          list.appendChild(li);
        });
      };
    });
  });
}

// 🆕 New Chat
const newChatBtn = document.getElementById("new-chat-btn");
if (newChatBtn) newChatBtn.addEventListener("click", () => {
  currentSessionId = Date.now();
  localStorage.setItem("currentSessionId", currentSessionId);
  document.getElementById("messages").innerHTML = "";
  document.getElementById("main").classList.remove("shift-down");
});

// 📁 Export
const exportBtn = document.getElementById("export-chat-btn");
if (exportBtn) exportBtn.addEventListener("click", async () => {
  const store = db.transaction([STORE_NAME], "readonly").objectStore(STORE_NAME);
  const req = store.getAll();
  req.onsuccess = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(req.result, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "chat_history.json");
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
});

// 🚀 Initialize
window.addEventListener("DOMContentLoaded", async () => {
  await initDB();
  await loadChatSessions();

  const lastSession = localStorage.getItem("currentSessionId");
  if (lastSession) {
    await loadChatSession(Number(lastSession));
  }
});

// 🔘 Button bindings
const sendBtn = document.getElementById("send-btn");
if (sendBtn) sendBtn.onclick = () => sendMessage();
const voiceBtn = document.getElementById("voice-btn");
if (voiceBtn) voiceBtn.onclick = startVoiceRecognition;

// Example: Render a message with avatar (add this logic to your message rendering in script.js)
function renderMessage(text, sender, timestamp) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message ' + (sender === 'user' ? 'user' : 'ai');
  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'avatar ' + (sender === 'user' ? 'user-avatar' : 'bot-avatar');
  avatarDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
  msgDiv.appendChild(avatarDiv);
  const textDiv = document.createElement('div');
  textDiv.innerHTML = text;
  msgDiv.appendChild(textDiv);
  if (timestamp) {
    const ts = document.createElement('span');
    ts.className = 'timestamp';
    ts.textContent = timestamp;
    msgDiv.appendChild(ts);
  }
  document.getElementById('messages').appendChild(msgDiv);
}

// To use: replace your message rendering logic with renderMessage(text, sender, timestamp)
// and call showTypingIndicator(true/false) as needed.
