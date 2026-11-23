/* Página de Agenda — Visão diária/cronológica e grade semanal de 7 dias,
   com detecção explícita de conflitos e adaptação ao Modo Simplificado. */

let agendaData = {
  tasks: [],
  appts: [],
  slots: [],
  loaded: false,
};
let agendaWeekOffset = 0;
let agendaViewMode = "grid"; // usado no Modo Completo ("grid" | "list")

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_DB = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];

function toLocalIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calcDurationMin(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const [sh, sm] = startStr.slice(0, 5).split(":").map(Number);
  const [eh, em] = endStr.slice(0, 5).split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function fmtShortDay(d) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("agenda.html", "Agenda");
  window.addEventListener("mindside:modechange", () => {
    if (agendaData.loaded) renderAgendaPage();
  });

  const content = document.getElementById("page-content");
  content.innerHTML = `<div class="skeleton" style="height:260px;"></div>`;

  try {
    const [tasks, appts, slots] = await Promise.all([
      Api.listTasks(),
      Api.listAppointments(),
      Api.listAvailability(),
    ]);
    agendaData = { tasks, appts, slots, loaded: true };
    renderAgendaPage();
  } catch (err) {
    toast(err.message || "Erro ao carregar agenda.", "error");
  }
});

function buildWeekDays(offset) {
  const base = new Date();
  const dayOfWeek = base.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  base.setDate(base.getDate() + mondayOffset + offset * 7);

  return [...Array(7)].map((_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}

function buildUnifiedDayEvents(iso, tasks, appts, conflictIds) {
  const dayAppts = appts.filter((a) => a.date === iso);
  const dayTasks = tasks.filter((t) => t.scheduled_date === iso);

  return [
    ...dayAppts.map((a) => ({
      kind: "appt",
      id: a.id,
      sortTime: a.start_time ? a.start_time.slice(0, 5) : "00:00",
      timeRange: `${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`,
      title: a.title,
      category: a.category || "geral",
      durationMin: calcDurationMin(a.start_time, a.end_time),
      done: false,
      hasConflict: conflictIds.has(a.id),
    })),
    ...dayTasks.map((t) => ({
      kind: "task",
      id: t.id,
      sortTime: t.scheduled_time ? t.scheduled_time.slice(0, 5) : "23:59",
      timeRange: t.scheduled_time ? t.scheduled_time.slice(0, 5) : "Dia todo",
      title: t.title,
      category: t.category || "geral",
      durationMin: t.duration || 30,
      done: t.status === "concluida",
      hasConflict: false,
    })),
  ].sort((a, b) => a.sortTime.localeCompare(b.sortTime));
}

function renderAgendaPage() {
  const content = document.getElementById("page-content");
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;
  const { tasks, appts, slots } = agendaData;
  const conflictInfo = MindsideUI.detectAppointmentConflicts(appts);

  const days = buildWeekDays(agendaWeekOffset);
  const weekLabelText = `Semana de ${fmtShortDay(days[0])} a ${fmtShortDay(days[6])}`;
  const todayIso = toLocalIsoDate(new Date());
  const weekIsos = new Set(days.map(toLocalIsoDate));

  const weekAppts = appts.filter((a) => weekIsos.has(a.date));
  const weekTasks = tasks.filter((t) => t.scheduled_date && weekIsos.has(t.scheduled_date));
  const activeSlots = slots.filter((s) => s.status === "Ativo");

  let totalWeekMin = 0;
  weekAppts.forEach((a) => { totalWeekMin += calcDurationMin(a.start_time, a.end_time); });
  weekTasks.forEach((t) => { totalWeekMin += (t.duration || 30); });

  const loadFormatted = totalWeekMin >= 60
    ? `${Math.floor(totalWeekMin / 60)}h ${totalWeekMin % 60}m`
    : `${totalWeekMin} min`;

  const summaryStripHtml = `
    <div class="summary-strip">
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Compromissos na semana</div>
          <div class="val">${weekAppts.length}</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Tarefas agendadas</div>
          <div class="val">${weekTasks.length}</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Janelas livres ativas</div>
          <div class="val">${activeSlots.length}</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Carga da semana</div>
          <div class="val">${loadFormatted}</div>
        </div>
      </div>
    </div>
  `;

  const weekNavHtml = `
    <div class="agenda-week-nav" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
      <button type="button" class="btn btn-sm" id="prev-week">‹ Anterior</button>
      <button type="button" class="btn btn-sm btn-primary" id="today-week">Hoje</button>
      <button type="button" class="btn btn-sm" id="next-week">Próxima ›</button>
      ${!isSimplified ? `
        <button type="button" class="btn btn-sm btn-ghost" id="toggle-agenda-view">
          ${agendaViewMode === "grid" ? "Ver em lista" : "Ver grade 7 dias"}
        </button>
      ` : ""}
    </div>
  `;

  const gridMarkup = `
    <div class="agenda-grid" id="agenda-grid">
      ${days.map((d) => {
        const iso = toLocalIsoDate(d);
        const dbDayName = WEEKDAY_DB[d.getDay()];
        const daySlots = activeSlots.filter((s) => s.day_of_week === dbDayName);
        const unified = buildUnifiedDayEvents(iso, tasks, appts, conflictInfo.conflictIds);

        const dayTotalMin = unified.reduce((acc, ev) => acc + ev.durationMin, 0);
        const loadLabel = dayTotalMin > 0
          ? (dayTotalMin >= 60 ? `${Math.floor(dayTotalMin / 60)}h${dayTotalMin % 60 ? (dayTotalMin % 60) + "m" : ""}` : `${dayTotalMin}m`)
          : "Livre";
        const isHeavy = dayTotalMin > 480;

        const availHtml = daySlots.map((s) => `
          <div class="agenda-slot-pill">
            ✓ Livre: ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}
          </div>`).join("");

        const eventsHtml = unified.length
          ? unified.map((ev) => `
            <div class="agenda-event-card ${ev.kind === "task" ? "is-task" : ""} ${ev.done ? "is-done" : ""} ${ev.hasConflict ? "is-conflict" : ""}">
              <div class="agenda-event-time">
                <span>${ev.timeRange}</span>
                <span>${ev.hasConflict ? "⚠ Conflito" : `${ev.durationMin}m`}</span>
              </div>
              <div class="agenda-event-title" style="${ev.done ? "text-decoration:line-through;" : ""}">
                ${escapeHtml(ev.title)}
              </div>
            </div>`).join("")
          : `<div class="empty-state" style="padding:16px 4px; font-size:.74rem; margin:auto 0;">Sem eventos</div>`;

        const isToday = iso === todayIso;
        return `
          <div class="agenda-day-col ${isToday ? "is-today" : ""}">
            <div class="agenda-day-header">
              <span class="agenda-day-label">
                ${WEEKDAY_LABELS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}
                ${isToday ? `<span class="badge badge-concluida" style="margin-left:4px; padding:1px 5px; font-size:.6rem;">HOJE</span>` : ""}
              </span>
              <span class="agenda-day-load" style="${isHeavy ? "color:var(--warn); font-weight:700;" : ""}">${isHeavy ? `⚠ ${loadLabel}` : loadLabel}</span>
            </div>
            ${availHtml}
            ${eventsHtml}
          </div>`;
      }).join("")}
    </div>
  `;

  const listMarkup = (() => {
    const dayBlocks = days.map((d) => {
      const iso = toLocalIsoDate(d);
      const unified = buildUnifiedDayEvents(iso, tasks, appts, conflictInfo.conflictIds);
      if (!unified.length && iso !== todayIso) return "";

      return `
        <div class="timeline-day-group">
          <div class="timeline-day-title">${escapeHtml(MindsideUI.formatDateGroupHeader(iso))}</div>
          ${unified.length ? unified.map((ev) => `
            <div class="appt-card-clean ${ev.hasConflict ? "has-conflict" : ""}">
              <div style="min-width:0; flex:1;">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  <span class="time-badge">${ev.timeRange}</span>
                  <span class="item-title" style="${ev.done ? "text-decoration:line-through; color:var(--text-dim);" : ""}">${escapeHtml(ev.title)}</span>
                  <span class="badge ${ev.kind === "task" ? "badge-media" : "badge-em_andamento"}">${ev.kind === "task" ? "Tarefa" : "Compromisso"}</span>
                </div>
                ${ev.hasConflict ? `<div class="task-meta-clean"><span class="conflict-pill">⚠ Conflito com ${escapeHtml((conflictInfo.byId.get(ev.id) || []).join(", "))}</span></div>` : ""}
              </div>
            </div>`).join("") : `
            <div class="empty-state-box" style="padding:14px;">
              <div>Nenhum compromisso ou tarefa agendada para hoje.</div>
            </div>
          `}
        </div>`;
    }).join("");

    return dayBlocks || `
      <div class="empty-state-box">
        <img class="sticker-img sticker-sm" src="assets/stickers/slime-schedule.svg" alt="">
        <div>Semana livre! Nenhum compromisso agendado neste período.</div>
      </div>`;
  })();

  if (isSimplified) {
    content.innerHTML = `
      <div class="card">
        <div class="head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:12px;">
          <div>
            <h3 class="mt-0" id="week-label" style="font-size:1.05rem;">${escapeHtml(weekLabelText)}</h3>
            <div class="section-subtitle">Visualização cronológica dos seus compromissos e tarefas com hora marcada.</div>
          </div>
          ${weekNavHtml}
        </div>
        ${listMarkup}
      </div>

      <details class="simplified-more-panel">
        <summary>Ver grade semanal completa (7 dias) e resumo de horas</summary>
        <div class="simplified-more-body">
          ${summaryStripHtml}
          <div class="agenda-legend">
            <span><i class="legend-dot" style="background:var(--blue);"></i>Compromissos</span>
            <span><i class="legend-dot" style="background:var(--yellow);"></i>Tarefas agendadas</span>
            <span><i class="legend-dot" style="background:var(--green);"></i>Janela disponível</span>
          </div>
          ${gridMarkup}
        </div>
      </details>
    `;
  } else {
    content.innerHTML = `
      ${summaryStripHtml}
      <div class="card">
        <div class="head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:12px;">
          <div>
            <h3 class="mt-0" id="week-label" style="font-size:1.05rem;">${escapeHtml(weekLabelText)}</h3>
            <div class="agenda-legend" style="margin-top:6px;">
              <span><i class="legend-dot" style="background:var(--blue);"></i>Compromissos</span>
              <span><i class="legend-dot" style="background:var(--yellow);"></i>Tarefas agendadas</span>
              <span><i class="legend-dot" style="background:var(--green);"></i>Janela disponível</span>
            </div>
          </div>
          ${weekNavHtml}
        </div>
        ${agendaViewMode === "list" ? listMarkup : gridMarkup}
      </div>
    `;
  }

  document.getElementById("prev-week")?.addEventListener("click", () => {
    agendaWeekOffset--;
    renderAgendaPage();
  });
  document.getElementById("next-week")?.addEventListener("click", () => {
    agendaWeekOffset++;
    renderAgendaPage();
  });
  document.getElementById("today-week")?.addEventListener("click", () => {
    agendaWeekOffset = 0;
    renderAgendaPage();
  });
  document.getElementById("toggle-agenda-view")?.addEventListener("click", () => {
    agendaViewMode = agendaViewMode === "grid" ? "list" : "grid";
    renderAgendaPage();
  });
}
