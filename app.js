const $ = (id) => document.getElementById(id);
let trainings = [];
let filter = "Alle";
let admin = false;
let editingId = null;

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const iconPeople = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const iconCalendar = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M16 3v4M8 3v4M3 10h18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const iconClock = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

function showNotice(id, message, type = "error") {
  const el = $(id);
  el.textContent = message;
  el.className = `notice show ${type}`;
}
function clearNotice(id) { const el = $(id); el.textContent = ""; el.className = "notice"; }
function openModal(id) { $(id).classList.add("open"); }
function closeModal(id) { $(id).classList.remove("open"); }
document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
document.querySelectorAll(".modalback").forEach(back => back.addEventListener("click", e => {
  if (e.target === back) back.classList.remove("open");
}));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modalback.open").forEach(x => x.classList.remove("open")); });

function dateLabel(date) {
  if (!date) return "Dato aftales";
  const parsed = new Date(date + "T12:00:00");
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}
function renderTrainings() {
  const list = trainings.filter(t => t.active && (filter === "Alle" || t.type === filter));
  $("trainingGrid").innerHTML = list.length ? list.map(t => {
    const isOps = t.type === "Operationsuddannelse";
    const full = t.signupCount >= t.capacity;
    return `<article class="card">
      <div class="cardtop"><span class="tag ${isOps ? "ops" : ""}">${isOps ? "✦" : "✚"} &nbsp;${escapeHTML(isOps ? "Operationsuddannelse" : "Akutlægeuddannelse")}</span>
      <span class="people" title="${t.signupCount} tilmeldte">${iconPeople}<span>${t.signupCount}</span></span></div>
      <h4>${escapeHTML(t.title)}</h4><p class="desc">${escapeHTML(t.description)}</p>
      <div class="meta"><span>${iconCalendar}${escapeHTML(dateLabel(t.date))}</span><span>${iconClock}${escapeHTML(t.time || "Tid aftales")}</span></div>
      <div class="cardfoot"><span class="capacity"><strong>${t.signupCount} / ${t.capacity}</strong> pladser brugt</span>
      <button class="${full ? "secondary" : "primary"}" data-signup="${escapeHTML(t.id)}" ${full ? "disabled" : ""}>${full ? "Fuldt booket" : "Tilmeld dig ↗"}</button></div>
    </article>`;
  }).join("") : `<div class="empty">Der er ingen åbne træninger i denne kategori lige nu.</div>`;
  document.querySelectorAll("[data-signup]").forEach(btn => btn.addEventListener("click", () => {
    const t = trainings.find(x => x.id === btn.dataset.signup);
    if (!t) return;
    $("signupTrainingId").value = t.id;
    $("signupTitle").textContent = t.title;
    $("signupSub").textContent = `${t.type} · ${dateLabel(t.date)}${t.time ? " kl. " + t.time : ""}`;
    $("signupForm").reset();
    $("signupTrainingId").value = t.id;
    clearNotice("signupNotice");
    openModal("signupModal");
  }));
}
async function loadTrainings() {
  $("trainingGrid").innerHTML = `<div class="empty">Henter træninger…</div>`;
  try {
    const r = await fetch("/api/trainings");
    if (!r.ok) throw new Error();
    trainings = await r.json();
    renderTrainings();
  } catch {
    $("trainingGrid").innerHTML = `<div class="empty">Kunne ikke hente træninger. Prøv at genindlæse siden.</div>`;
  }
}
$("filters").querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
  filter = btn.dataset.filter;
  $("filters").querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
  renderTrainings();
}));

$("signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("signupSubmit").disabled = true;
  clearNotice("signupNotice");
  try {
    const response = await fetch("/api/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainingId: $("signupTrainingId").value,
        rpName: $("rpName").value,
        rank: $("rank").value,
        pNumber: $("pNumber").value,
        notes: $("notes").value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Tilmeldingen mislykkedes.");
    showNotice("signupNotice", result.message, "success");
    await loadTrainings();
    setTimeout(() => closeModal("signupModal"), 1300);
  } catch (err) { showNotice("signupNotice", err.message); }
  finally { $("signupSubmit").disabled = false; }
});

$("adminOpen").addEventListener("click", async () => {
  $("loginView").hidden = false; $("adminView").hidden = true; $("editView").hidden = true;
  clearNotice("loginNotice");
  try {
    const r = await fetch("/api/admin/me");
    admin = (await r.json()).authenticated;
    if (admin) { $("loginView").hidden = true; $("adminView").hidden = false; await loadAdminTrainings(); }
  } catch {}
  openModal("adminModal");
});
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.submitter; if (btn) btn.disabled = true;
  clearNotice("loginNotice");
  try {
    const r = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("username").value, password: $("password").value })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Login mislykkedes.");
    admin = true; $("password").value = "";
    $("loginView").hidden = true; $("adminView").hidden = false; $("editView").hidden = true;
    await loadAdminTrainings();
  } catch (err) { showNotice("loginNotice", err.message); }
  finally { if (btn) btn.disabled = false; }
});
$("logout").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  admin = false; $("adminView").hidden = true; $("editView").hidden = true; $("loginView").hidden = false;
  closeModal("adminModal");
});
async function loadAdminTrainings() {
  const r = await fetch("/api/admin/trainings");
  if (r.status === 401) { admin = false; $("adminView").hidden = true; $("loginView").hidden = false; return; }
  const list = await r.json();
  $("adminList").innerHTML = list.length ? list.map(t => `<div class="adminitem">
    <div class="adminitemtop"><div><h4>${escapeHTML(t.title)}</h4><p>${escapeHTML(t.type)} · ${t.active ? "Åben" : "Skjult"}</p></div>
      <span class="people">${iconPeople}<span>${t.signupCount}</span></span></div>
    <div class="actions"><button class="secondary smallbtn" data-edit="${escapeHTML(t.id)}">Rediger</button>
    <button class="secondary smallbtn" data-toggle="${escapeHTML(t.id)}">${t.active ? "Skjul" : "Åbn"}</button>
    <button class="danger smallbtn" data-delete="${escapeHTML(t.id)}">Slet</button></div>
  </div>`).join("") : `<div class="empty">Ingen træninger endnu.</div>`;
  $("adminList").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openEdit(list.find(t => t.id === b.dataset.edit))));
  $("adminList").querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", async () => {
    const t = list.find(x => x.id === b.dataset.toggle); if (!t) return;
    await saveTraining({ ...t, active: !t.active }, t.id);
  }));
  $("adminList").querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", async () => {
    const t = list.find(x => x.id === b.dataset.delete);
    if (!t || !confirm(`Slet "${t.title}"? Tilmeldinger knyttet til træningen slettes også.`)) return;
    const r = await fetch("/api/admin/trainings/" + encodeURIComponent(t.id), { method: "DELETE" });
    if (r.ok) { await loadAdminTrainings(); await loadTrainings(); }
    else alert("Kunne ikke slette træningen.");
  }));
}
$("newTraining").addEventListener("click", () => openEdit(null));
function openEdit(t) {
  editingId = t?.id || null;
  $("editId").value = editingId || "";
  $("editEyebrow").textContent = editingId ? "Rediger forløb" : "Opret forløb";
  $("editTitle").textContent = editingId ? "Rediger træning" : "Ny træning";
  $("trainingType").value = t?.type || "Akutlægeuddannelse";
  $("trainingTitle").value = t?.title || "";
  $("trainingDescription").value = t?.description || "";
  $("trainingDate").value = t?.date || "";
  $("trainingTime").value = t?.time || "";
  $("capacity").value = t?.capacity || 8;
  $("active").value = String(t?.active ?? true);
  clearNotice("editNotice");
  $("adminView").hidden = true; $("editView").hidden = false;
}
$("editCancel").addEventListener("click", () => { $("editView").hidden = true; $("adminView").hidden = false; });
$("trainingForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    type: $("trainingType").value, title: $("trainingTitle").value,
    description: $("trainingDescription").value, date: $("trainingDate").value,
    time: $("trainingTime").value, capacity: Number($("capacity").value),
    active: $("active").value === "true"
  };
  const ok = await saveTraining(data, editingId);
  if (ok) { $("editView").hidden = true; $("adminView").hidden = false; await loadAdminTrainings(); await loadTrainings(); }
});
async function saveTraining(data, id) {
  try {
    const r = await fetch(id ? "/api/admin/trainings/" + encodeURIComponent(id) : "/api/admin/trainings", {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Kunne ikke gemme.");
    return true;
  } catch (err) { showNotice("editNotice", err.message); return false; }
}

loadTrainings();
