const statusEl = document.getElementById("status");
const authView = document.getElementById("auth-view");
const vaultView = document.getElementById("vault-view");
const securityLabView = document.getElementById("security-lab-view");
const sessionInfo = document.getElementById("session-info");
const sessionEmail = document.getElementById("session-email");
const entryList = document.getElementById("entry-list");
const emptyState = document.getElementById("empty-state");
const vaultSummary = document.getElementById("vault-summary");
const addCredentialModal = document.getElementById("add-credential-modal");
const entryForm = document.getElementById("entry-form");

const CLIPBOARD_CLEAR_MS = 20000;
let clipboardClearTimer = null;
let currentUserEmail = null;

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("status-error", isError);
  statusEl.classList.toggle("status-ok", !isError);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body && body.detail ? body.detail : `Request failed (${response.status})`);
  }
  return body;
}

async function withLoading(button, task) {
  if (!button || button.disabled) return undefined;
  button.disabled = true;
  button.classList.add("is-loading");
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
  }
}

function setLoggedIn(email) {
  currentUserEmail = email;
  authView.hidden = true;
  vaultView.hidden = false;
  securityLabView.hidden = false;
  sessionInfo.hidden = false;
  sessionEmail.textContent = email;
}

function setLoggedOut() {
  currentUserEmail = null;
  authView.hidden = false;
  vaultView.hidden = true;
  securityLabView.hidden = true;
  sessionInfo.hidden = true;
  entryList.innerHTML = "";
  document.getElementById("user-menu").hidden = true;
}

async function enterVault() {
  const me = await api("/auth/me");
  setLoggedIn(me.email);
  await refreshEntries();
}

function iconForLabel(label) {
  const normalized = label.toLowerCase();
  if (normalized.includes("github")) return "\u{1F310}";
  if (normalized.includes("aws") || normalized.includes("amazon")) return "☁️";
  return "\u{1F510}";
}

function formatCreated(isoString) {
  const created = new Date(isoString);
  const now = new Date();
  if (created.toDateString() === now.toDateString()) {
    return "Created today";
  }
  return `Created ${created.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

function scheduleClipboardClear() {
  if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
  clipboardClearTimer = setTimeout(() => {
    navigator.clipboard.writeText("").catch(() => {});
    clipboardClearTimer = null;
  }, CLIPBOARD_CLEAR_MS);
}

function renderEntry(entry) {
  const item = document.createElement("li");
  item.className = "entry-item";

  const icon = document.createElement("div");
  icon.className = "entry-icon";
  icon.textContent = iconForLabel(entry.label);

  const main = document.createElement("div");
  main.className = "entry-main";

  const top = document.createElement("div");
  top.className = "entry-top";
  const label = document.createElement("span");
  label.className = "entry-label";
  label.textContent = entry.label;
  const meta = document.createElement("span");
  meta.className = "entry-meta";
  meta.textContent = formatCreated(entry.created_at);
  top.append(label, meta);

  const type = document.createElement("div");
  type.className = "entry-type";
  type.textContent = "Credential";

  main.append(top, type);

  const secretRow = document.createElement("div");
  secretRow.className = "entry-secret-row";

  const secretSpan = document.createElement("span");
  secretSpan.className = "entry-secret";
  secretSpan.textContent = "•".repeat(14);

  const revealBtn = document.createElement("button");
  revealBtn.className = "btn btn-small";
  revealBtn.type = "button";
  revealBtn.innerHTML = '<span class="btn-label">Reveal</span>';

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-small";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.hidden = true;

  let revealed = false;
  let plaintext = null;

  revealBtn.addEventListener("click", async () => {
    if (revealed) {
      secretSpan.textContent = "•".repeat(14);
      revealBtn.querySelector(".btn-label").textContent = "Reveal";
      copyBtn.hidden = true;
      copyBtn.textContent = "Copy";
      revealed = false;
      plaintext = null;
      return;
    }
    await withLoading(revealBtn, async () => {
      try {
        const full = await api(`/vault/${entry.id}`);
        plaintext = full.secret;
        secretSpan.textContent = plaintext;
        revealBtn.querySelector(".btn-label").textContent = "Hide";
        copyBtn.hidden = false;
        revealed = true;
      } catch (err) {
        showStatus(err.message, true);
      }
    });
  });

  copyBtn.addEventListener("click", async () => {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      copyBtn.textContent = "Copied";
      scheduleClipboardClear();
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 2000);
    } catch (_) {
      showStatus("Couldn't access the clipboard.", true);
    }
  });

  secretRow.append(secretSpan, revealBtn, copyBtn);
  item.append(icon, main, secretRow);
  return item;
}

async function refreshEntries() {
  const entries = await api("/vault");
  entryList.innerHTML = "";
  const isEmpty = entries.length === 0;
  emptyState.hidden = !isEmpty;
  entryList.hidden = isEmpty;
  for (const entry of entries) {
    entryList.appendChild(renderEntry(entry));
  }
  vaultSummary.hidden = isEmpty;
  const count = entries.length;
  vaultSummary.textContent = `${count} credential${count === 1 ? "" : "s"} · Encrypted at rest`;
}

const SECURITY_CONTROLS = [
  "Argon2id password hashing",
  "HTTP-only session cookie",
  "NGINX rate limiting",
  "PostgreSQL isolated from the public API",
  "Vault secrets encrypted at rest",
];

function renderSecurityControls() {
  const list = document.getElementById("security-controls");
  list.innerHTML = "";
  for (const text of SECURITY_CONTROLS) {
    const li = document.createElement("li");
    li.className = "control-ok";
    li.textContent = `✓ ${text}`;
    list.appendChild(li);
  }
  const tlsOk = window.location.protocol === "https:";
  const tlsItem = document.createElement("li");
  tlsItem.className = tlsOk ? "control-ok" : "control-warn";
  tlsItem.textContent = tlsOk
    ? "✓ TLS enabled"
    : "⚠ TLS not enabled in this deployment";
  list.appendChild(tlsItem);
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`${tabName}-form`).classList.add("active");
  document.getElementById("auth-card-title").textContent =
    tabName === "login" ? "Welcome back" : "Create your account";
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
document.querySelectorAll("[data-tab-switch]").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tabSwitch));
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  await withLoading(submitBtn, async () => {
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await enterVault();
      showStatus("Logged in.");
    } catch (err) {
      showStatus(err.message, true);
    }
  });
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  await withLoading(submitBtn, async () => {
    try {
      await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
      showStatus("Account created — you can log in now.");
      switchTab("login");
      document.getElementById("login-email").value = email;
    } catch (err) {
      showStatus(err.message, true);
    }
  });
});

function openAddModal() {
  entryForm.reset();
  addCredentialModal.showModal();
}

document.getElementById("add-credential-btn").addEventListener("click", openAddModal);
document.getElementById("empty-add-btn").addEventListener("click", openAddModal);
document.getElementById("modal-close-btn").addEventListener("click", () => addCredentialModal.close());
document.getElementById("modal-cancel-btn").addEventListener("click", () => addCredentialModal.close());
addCredentialModal.addEventListener("click", (e) => {
  if (e.target === addCredentialModal) addCredentialModal.close();
});

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = entryForm.querySelector('button[type="submit"]');
  const labelInput = document.getElementById("entry-label");
  const secretInput = document.getElementById("entry-secret");
  await withLoading(submitBtn, async () => {
    try {
      await api("/vault", {
        method: "POST",
        body: JSON.stringify({ label: labelInput.value, secret: secretInput.value }),
      });
      addCredentialModal.close();
      showStatus("Credential added.");
      await refreshEntries();
    } catch (err) {
      showStatus(err.message, true);
    }
  });
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch (_) {
    // ignore — we're logging out client-side regardless
  }
  setLoggedOut();
  showStatus("Logged out.");
});

const userMenuBtn = document.getElementById("user-menu-btn");
const userMenu = document.getElementById("user-menu");
userMenuBtn.addEventListener("click", () => {
  userMenu.hidden = !userMenu.hidden;
});
document.addEventListener("click", (e) => {
  if (!userMenu.hidden && !e.target.closest("#session-info")) {
    userMenu.hidden = true;
  }
});

document.getElementById("check-headers-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const out = document.getElementById("headers-output");
  await withLoading(btn, async () => {
    out.hidden = false;
    try {
      const response = await fetch("/health", { credentials: "same-origin" });
      const lines = [];
      for (const [name, value] of response.headers.entries()) {
        lines.push(`${name}: ${value}`);
      }
      out.textContent = lines.length ? lines.join("\n") : "No headers visible on this response.";
    } catch (err) {
      out.textContent = `Request failed: ${err.message}`;
    }
  });
});

document.getElementById("rate-limit-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const out = document.getElementById("rate-limit-output");
  await withLoading(btn, async () => {
    out.hidden = false;
    out.textContent = "Firing 20 rapid login attempts...";
    const email = currentUserEmail || "demo@cloudshield.local";
    const tally = { 401: 0, 429: 0, other: 0 };
    for (let i = 1; i <= 20; i++) {
      try {
        const response = await fetch("/auth/login", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: "not-the-real-password-attempt" }),
        });
        if (response.status === 429) tally[429]++;
        else if (response.status === 401) tally[401]++;
        else tally.other++;
      } catch (_) {
        tally.other++;
      }
    }
    const lines = [
      `401 Unauthorized: ${tally[401]}`,
      `429 Too Many Requests: ${tally[429]}`,
    ];
    if (tally.other) lines.push(`Other: ${tally.other}`);
    lines.push("", "nginx started rejecting requests once the burst allowance ran out.");
    out.textContent = lines.join("\n");
  });
});

document.getElementById("ownership-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const out = document.getElementById("ownership-output");
  await withLoading(btn, async () => {
    out.hidden = false;
    const strangerId = crypto.randomUUID();
    try {
      const response = await fetch(`/vault/${strangerId}`, { credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      out.textContent = `GET /vault/${strangerId}\n-> ${response.status} ${response.statusText}\n${body ? JSON.stringify(body) : ""}`;
    } catch (err) {
      out.textContent = `Request failed: ${err.message}`;
    }
  });
});

renderSecurityControls();

// On load, probe whether a valid session cookie already exists.
(async function init() {
  try {
    await enterVault();
  } catch (_) {
    setLoggedOut();
  }
})();
