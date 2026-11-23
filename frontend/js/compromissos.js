/* Página de Compromissos — Linha do tempo cronológica clara e detecção de conflitos. */

let allAppts = [];
let apptSearch = "";
let apptCatFilter = "todas";
let apptsLoaded = false;

function minutesBetween(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const [sh, sm] = startStr.slice(0, 5).split(":").map(Number);
  const [eh, em] = endStr.slice(0, 5).split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("compromissos.html", "Compromissos");
  document.getElementById("appt-cancel-btn").addEventListener("click", closeApptModal);
  document.getElementById("appt-form").addEventListener("submit", onSaveAppt);

  window.addEventListener("mindside:modechange", () => {
    renderApptsLayout();
    if (apptsLoaded) {
      updateApptSummary();
      renderAppts();
    }
  });

  renderApptsLayout();
  await loadAppts();
});

function renderApptsLayout() {
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;
  const content = document.getElementById("page-content");

  const summaryHtml = `
    <div class="summary-strip">
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Compromissos hoje</div>
          <div class="val" id="appt-sum-today">0</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Próximos agendados</div>
          <div class="val" id="appt-sum-total">0</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Tempo reservado</div>
          <div class="val" id="appt-sum-hours">0h</div>
        </div>
      </div>
    </div>
  `;

  const filtersHtml = `
    <div class="toolbar-row">
      <div class="filter-bar" id="appt-cat-filters">
        <button class="filter-chip ${apptCatFilter === "todas" ? "active" : ""}" data-cat="todas">Todas</button>
        <button class="filter-chip ${apptCatFilter === "estudo" ? "active" : ""}" data-cat="estudo">Estudo</button>
        <button class="filter-chip ${apptCatFilter === "trabalho" ? "active" : ""}" data-cat="trabalho">Trabalho</button>
        <button class="filter-chip ${apptCatFilter === "saude" ? "active" : ""}" data-cat="saude">Saúde</button>
        <button class="filter-chip ${apptCatFilter === "pessoal" ? "active" : ""}" data-cat="pessoal">Pessoal</button>
        <button class="filter-chip ${apptCatFilter === "geral" ? "active" : ""}" data-cat="geral">Geral</button>
      </div>
      <div class="search-box">
        <span class="search-icon"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="14.5" cy="9.5" r="6"/><path d="M10.2 13.8 3.5 20.5"/></svg></span>
        <input type="text" id="appt-search" value="${escapeHtml(apptSearch)}" placeholder="Buscar compromisso..." aria-label="Buscar compromissos">
      </div>
    </div>
  `;

  content.innerHTML = `
    ${!isSimplified ? summaryHtml : ""}
    <div id="appt-conflict-banner-slot"></div>

    <div class="list-card card">
      <div class="head">
        <div>
          <h3 class="mt-0">Seus compromissos</h3>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-sm btn-ghost complete-only" href="agenda.html">Ver agenda semanal</a>
          <button type="button" class="btn btn-primary" id="new-appt-btn">+ Novo compromisso</button>
        </div>
      </div>

      ${!isSimplified ? filtersHtml : ""}
      <div id="appts-container"></div>
    </div>

    ${isSimplified ? `
      <details class="simplified-more-panel">
        <summary>Resumo, busca e filtros por categoria</summary>
        <div class="simplified-more-body">
          ${filtersHtml}
          ${summaryHtml}
        </div>
      </details>
    ` : ""}
  `;

  bindApptsLayoutEvents();
}

function bindApptsLayoutEvents() {
  document.getElementById("new-appt-btn")?.addEventListener("click", () => openApptModal());

  document.querySelectorAll("#appt-cat-filters [data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#appt-cat-filters [data-cat]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      apptCatFilter = btn.dataset.cat;
      renderAppts();
    });
  });

  document.getElementById("appt-search")?.addEventListener("input", (e) => {
    apptSearch = e.target.value.trim().toLowerCase();
    renderAppts();
  });
}

async function loadAppts() {
  const container = document.getElementById("appts-container");
  if (container && !apptsLoaded) {
    container.innerHTML = `<div class="skeleton" style="height:64px;margin-bottom:8px;"></div>`.repeat(3);
  }
  try {
    allAppts = await Api.listAppointments();
    apptsLoaded = true;
    updateApptSummary();
    renderAppts();
  } catch (err) {
    toast(err.message || "Erro ao carregar compromissos.", "error");
  }
}

function updateApptSummary() {
  const today = localTodayIso();
  const todayCount = allAppts.filter((a) => a.date === today).length;
  const upcomingCount = allAppts.filter((a) => a.date >= today).length;
  const totalMin = allAppts.reduce((acc, a) => acc + minutesBetween(a.start_time, a.end_time), 0);

  const elToday = document.getElementById("appt-sum-today");
  const elTotal = document.getElementById("appt-sum-total");
  const elHours = document.getElementById("appt-sum-hours");
  if (elToday) elToday.textContent = todayCount;
  if (elTotal) elTotal.textContent = upcomingCount;
  if (elHours) {
    elHours.textContent = totalMin >= 60
      ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
      : `${totalMin} min`;
  }
}

function renderApptsGroup(entries, conflictInfo, isSimplified) {
  return entries.map(([dateIso, items]) => {
    const rowsHtml = items.map((a) => {
      const dur = minutesBetween(a.start_time, a.end_time);
      const hasConflict = conflictInfo.conflictIds.has(a.id);
      const conflictNames = (conflictInfo.byId.get(a.id) || []).join(", ");
      return `
        <div class="appt-card-clean ${hasConflict ? "has-conflict" : ""}">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span class="time-badge">${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}</span>
              <span class="item-title">${escapeHtml(a.title)}</span>
              <span class="badge badge-em_andamento">${escapeHtml(MindsideUI.categoryLabel(a.category))}</span>
            </div>
            ${!isSimplified && a.description ? `<div class="item-desc">${escapeHtml(a.description)}</div>` : ""}
            <div class="task-meta-clean">
              ${!isSimplified ? `<span>Duração: ${dur} min</span>` : ""}
              ${hasConflict ? `<span class="conflict-pill">⚠ Conflito com ${escapeHtml(conflictNames)}</span>` : ""}
            </div>
          </div>
          <div class="item-actions">
            <button type="button" class="btn btn-sm" data-edit="${a.id}">Editar</button>
            <button type="button" class="btn btn-sm btn-danger" data-del="${a.id}">Excluir</button>
          </div>
        </div>`;
    }).join("");

    return `
      <div class="timeline-day-group">
        <div class="timeline-day-title">${escapeHtml(MindsideUI.formatDateGroupHeader(dateIso))}</div>
        ${rowsHtml}
      </div>`;
  }).join("");
}

function renderAppts() {
  const container = document.getElementById("appts-container");
  const conflictBannerSlot = document.getElementById("appt-conflict-banner-slot");
  if (!container) return;

  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;
  const conflictInfo = MindsideUI.detectAppointmentConflicts(allAppts);

  if (conflictBannerSlot) {
    if (conflictInfo.conflictIds.size > 0) {
      conflictBannerSlot.innerHTML = `
        <div class="conflict-alert-banner" role="alert">
          <div style="display:flex; align-items:center; gap:12px;">
            <img class="sticker-img sticker-sm" src="assets/stickers/slime-conflict.svg" alt="">
            <div>
              <div style="font-weight:700; color:var(--danger); font-size:.92rem;">Horários sobrepostos detectados</div>
              <div class="text-secondary" style="font-size:.82rem;">Alguns compromissos coincidem no mesmo horário. Edite um deles para evitar choque na sua rotina.</div>
            </div>
          </div>
        </div>
      `;
    } else {
      conflictBannerSlot.innerHTML = "";
    }
  }

  const filtered = allAppts.filter((a) => {
    if (apptCatFilter !== "todas" && (a.category || "").toLowerCase() !== apptCatFilter) return false;
    if (apptSearch) {
      const hay = `${a.title || ""} ${a.description || ""} ${a.category || ""}`.toLowerCase();
      if (!hay.includes(apptSearch)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state-box">
        <img class="sticker-img" src="assets/stickers/slime-schedule.svg" alt="Sem compromissos">
        <div>Nenhum compromisso encontrado. Adicione um horário fixo ou peça ajuda ao Assistente IA.</div>
      </div>`;
    return;
  }

  const today = localTodayIso();
  const sorted = [...filtered].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

  const upcomingGroups = {};
  const pastGroups = {};
  sorted.forEach((a) => {
    const target = a.date >= today ? upcomingGroups : pastGroups;
    if (!target[a.date]) target[a.date] = [];
    target[a.date].push(a);
  });

  const upcomingEntries = Object.entries(upcomingGroups);
  const pastEntries = Object.entries(pastGroups);

  let html = "";
  if (upcomingEntries.length) {
    html += renderApptsGroup(upcomingEntries, conflictInfo, isSimplified);
  } else {
    html += `
      <div class="empty-state-box" style="margin-bottom:14px;">
        <img class="sticker-img sticker-sm" src="assets/stickers/slime-schedule.svg" alt="">
        <div>Nenhum compromisso futuro agendado.</div>
      </div>`;
  }

  if (pastEntries.length) {
    html += `
      <details class="simplified-more-panel">
        <summary>Compromissos anteriores (${pastEntries.reduce((acc, [, arr]) => acc + arr.length, 0)})</summary>
        <div class="simplified-more-body">
          ${renderApptsGroup(pastEntries.reverse(), conflictInfo, isSimplified)}
        </div>
      </details>`;
  }

  container.innerHTML = html;

  container.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openApptModal(allAppts.find((a) => a.id == btn.dataset.edit))));
  container.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => deleteAppt(btn.dataset.del)));
}

function openApptModal(appt = null) {
  document.getElementById("appt-conflict-warning").style.display = "none";
  document.getElementById("appt-modal-title").textContent = appt ? "Editar compromisso" : "Novo compromisso";
  document.getElementById("appt-id").value = appt ? appt.id : "";
  document.getElementById("appt-title").value = appt ? appt.title : "";
  document.getElementById("appt-description").value = appt ? appt.description : "";
  document.getElementById("appt-category").value = appt ? appt.category : "geral";
  document.getElementById("appt-date").value = appt ? appt.date : localTodayIso();
  document.getElementById("appt-start").value = appt ? appt.start_time.slice(0, 5) : "14:00";
  document.getElementById("appt-end").value = appt ? appt.end_time.slice(0, 5) : "15:00";
  document.getElementById("appt-modal-overlay").classList.add("open");
}

function closeApptModal() {
  document.getElementById("appt-modal-overlay").classList.remove("open");
}

async function onSaveAppt(e) {
  e.preventDefault();
  const id = document.getElementById("appt-id").value;
  const warnBox = document.getElementById("appt-conflict-warning");
  warnBox.style.display = "none";
  const payload = {
    title: document.getElementById("appt-title").value.trim(),
    description: document.getElementById("appt-description").value.trim(),
    category: document.getElementById("appt-category").value,
    date: document.getElementById("appt-date").value,
    start_time: document.getElementById("appt-start").value,
    end_time: document.getElementById("appt-end").value,
  };
  try {
    if (id) { await Api.updateAppointment(id, payload); toast("Compromisso atualizado.", "success"); }
    else { await Api.createAppointment(payload); toast("Compromisso criado.", "success"); }
    closeApptModal();
    await loadAppts();
  } catch (err) {
    if (err.status === 409) {
      const conflicts = (err.raw && err.raw.detail && err.raw.detail.conflicts) || [];
      warnBox.textContent = "Este horário coincide com: " + conflicts.map((c) => `${c.title} (${c.start_time}–${c.end_time})`).join(", ");
      warnBox.style.display = "block";
    } else {
      toast(err.message || "Erro ao salvar compromisso.", "error");
    }
  }
}

async function deleteAppt(id) {
  const target = allAppts.find((a) => String(a.id) === String(id));
  const confirmed = await MindsideUI.confirmModal({
    title: "Excluir compromisso",
    message: `Tem certeza que deseja excluir "${target?.title || "este compromisso"}"?`,
    confirmText: "Excluir",
  });
  if (!confirmed) return;
  try {
    await Api.deleteAppointment(id);
    toast("Compromisso excluído.", "success");
    await loadAppts();
  } catch (err) {
    toast(err.message || "Erro ao excluir compromisso.", "error");
  }
}
