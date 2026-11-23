/* Monta a sidebar/app-shell comum a todas as páginas internas,
   o seletor rápido de modo (Completo / Simplificado),
   orientações contextuais dispensáveis e utilitários compartilhados de UI. */
const NAV_ITEMS = [
  { href: "dashboard.html", icon: "dashboard", label: "Início", area: "ia", group: "rotina", tier: "core" },
  { href: "assistente.html", icon: "assistente", label: "Assistente IA", area: "ia", group: "rotina", tier: "core" },
  { href: "tarefas.html", icon: "tarefas", label: "Tarefas", area: "tarefas", group: "rotina", tier: "core" },
  { href: "compromissos.html", icon: "compromissos", label: "Compromissos", area: "compromissos", group: "rotina", tier: "core" },
  { href: "objetivos.html", icon: "objetivos", label: "Objetivos", area: "objetivos", group: "rotina", tier: "core" },
  { href: "agenda.html", icon: "agenda", label: "Agenda Semanal", area: "agenda", group: "rotina", tier: "secondary" },
  { href: "historico.html", icon: "historico", label: "Histórico", area: "historico", group: "sistema", tier: "secondary" },
  { href: "configuracoes.html", icon: "configuracoes", label: "Configurações", area: "configuracoes", group: "sistema", tier: "core" },
];

const NAV_ICONS = {
  dashboard: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="icon-fill" d="M3 14.5 16 3l13 11.5v14H3z"/><path d="M2 14.5 16 2l14 12.5M5 13v16h22V13M12 29V18h8v11M9 14h4v4H9z"/></svg>`,
  agenda: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="icon-fill" x="3" y="6" width="26" height="23" rx="4"/><path d="M3 13h26M10 3v7M22 3v7M10 18h2m7 0h2m-11 6h2m7 0h2" stroke-linecap="round" stroke-width="2.5"/></svg>`,
  tarefas: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="icon-fill" d="M8 6h16a3 3 0 0 1 3 3v19H5V9a3 3 0 0 1 3-3Z"/><path d="M12 6V4a4 4 0 0 1 8 0v2M10 14h12M10 19h12M10 24h8" stroke-linecap="round"/><circle cx="7" cy="14" r=".7"/><circle cx="7" cy="19" r=".7"/><circle cx="7" cy="24" r=".7"/></svg>`,
  compromissos: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="icon-fill" x="3" y="6" width="26" height="23" rx="4"/><path d="M3 13h26M10 3v7M22 3v7M8 19h3m5 0h3m5 0h1m-17 5h3m4-1 2 2 5-5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"/></svg>`,
  objetivos: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="icon-fill" cx="14" cy="18" r="11"/><circle cx="14" cy="18" r="7"/><circle cx="14" cy="18" r="3"/><path d="m14 18 13-13m-5 0h5v5m-8-1 4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  assistente: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3v3M10 5l2 2M22 5l-2 2" stroke-linecap="round"/><rect x="14.5" y="7" width="3" height="3" rx=".8" fill="currentColor"/><path class="icon-fill" d="M10 12h12v2h2v2h2v9h-2v2H8v-2H6v-9h2v-2h2v-2Z"/><path d="M10 12h12v2h2v2h2v9h-2v2H8v-2H6v-9h2v-2h2v-2Z" stroke-linejoin="round"/><rect x="11" y="18" width="2.5" height="2.5" fill="currentColor"/><rect x="18.5" y="18" width="2.5" height="2.5" fill="currentColor"/><path d="M13.5 23h5" stroke-linecap="round"/></svg>`,
  historico: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="icon-fill" cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="10"/><path d="M16 9v7l5 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 4v2M28 16h-2M16 28v-2M4 16h2" stroke-linecap="round"/></svg>`,
  configuracoes: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="icon-fill" d="m13 3 6 0 1 4 3 1 3-2 4 5-2 3v4l2 3-4 5-3-2-3 1-1 4h-6l-1-4-3-1-3 2-4-5 2-3v-4l-2-3 4-5 3 2 3-1z"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="2.5"/></svg>`,
};

const CONTEXT_GUIDES = {
  "dashboard.html": {
    title: "Visão do seu dia",
    text: "Aqui você acompanha o que precisa fazer.",
  },
  "tarefas.html": {
    title: "Suas tarefas",
    text: "Organize suas atividades e acompanhe os prazos.",
  },
  "agenda.html": {
    title: "Sua agenda",
    text: "Visualize seus próximos compromissos.",
  },
  "compromissos.html": {
    title: "Seus compromissos",
    text: "Visualize seus próximos compromissos.",
  },
  "objetivos.html": {
    title: "Seus objetivos",
    text: "Acompanhe seu progresso e suas próximas etapas.",
  },
  "assistente.html": {
    title: "Assistente MindSide",
    text: "Conte o que você precisa organizar e receba sugestões.",
  },
  "historico.html": {
    title: "Registro de atividades",
    text: "Consulte o registro cronológico das suas ações e decisões.",
  },
  "configuracoes.html": {
    title: "Suas preferências",
    text: "Personalize o modo de interface, o tema e suas preferências.",
  },
};

const GUIDES_STORAGE_KEY = "mindside_dismissed_guides";

window.MindsideGuides = {
  readDismissed() {
    try {
      const raw = JSON.parse(localStorage.getItem(GUIDES_STORAGE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  },
  isDismissed(pageKey) {
    return !!this.readDismissed()[pageKey];
  },
  dismiss(pageKey) {
    const state = this.readDismissed();
    state[pageKey] = true;
    localStorage.setItem(GUIDES_STORAGE_KEY, JSON.stringify(state));
    const slot = document.getElementById("contextual-guide-slot");
    if (slot) slot.innerHTML = "";
  },
  resetAll() {
    localStorage.removeItem(GUIDES_STORAGE_KEY);
    const active = document.body?.getAttribute("data-page");
    if (active) this.render(active);
  },
  render(pageKey) {
    const slot = document.getElementById("contextual-guide-slot");
    if (!slot) return;
    const guide = CONTEXT_GUIDES[pageKey];
    if (!guide || this.isDismissed(pageKey)) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = `
      <aside class="context-guide-banner" role="note" aria-label="${escapeHtml(guide.title)}">
        <div class="context-guide-content">
          <span class="context-guide-dot" aria-hidden="true"></span>
          <p class="context-guide-text">${escapeHtml(guide.text)}</p>
        </div>
        <button type="button" class="context-guide-dismiss" data-dismiss-guide="${escapeHtml(pageKey)}" aria-label="Dispensar orientação desta página">
          Entendi · Ocultar
        </button>
      </aside>
    `;
    const btn = slot.querySelector("[data-dismiss-guide]");
    if (btn) {
      btn.addEventListener("click", () => this.dismiss(pageKey));
    }
  },
};

/* ---- Utilitários compartilhados entre páginas ---- */
const PRIORITY_MAP = {
  urgente: { key: "urgente", label: "Urgente", icon: "▲", className: "prio-urgente", order: 0 },
  alta: { key: "alta", label: "Alta", icon: "●", className: "prio-alta", order: 1 },
  media: { key: "media", label: "Média", icon: "◐", className: "prio-media", order: 2 },
  baixa: { key: "baixa", label: "Baixa", icon: "○", className: "prio-baixa", order: 3 },
};

const CATEGORY_MAP = {
  trabalho: { key: "trabalho", label: "Trabalho" },
  estudo: { key: "estudo", label: "Estudo" },
  saude: { key: "saude", label: "Saúde" },
  pessoal: { key: "pessoal", label: "Pessoal" },
  lazer: { key: "lazer", label: "Lazer" },
  geral: { key: "geral", label: "Geral" },
};

const STATUS_MAP = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  ativo: "Ativo",
  concluido: "Concluído",
  pausado: "Pausado",
};

function parseIsoDateLocal(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return null;
  const parts = isoDate.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function addDaysIso(baseIso, offsetDays) {
  const dt = parseIsoDateLocal(baseIso) || new Date();
  dt.setDate(dt.getDate() + offsetDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateFriendly(isoDate) {
  if (!isoDate) return "Sem prazo";
  const key = String(isoDate).slice(0, 10);
  const today = localTodayIso();
  const tomorrow = addDaysIso(today, 1);
  const yesterday = addDaysIso(today, -1);
  if (key === today) return "Hoje";
  if (key === tomorrow) return "Amanhã";
  if (key === yesterday) return "Ontem";
  const dt = parseIsoDateLocal(key);
  if (!dt) return key;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatDateGroupHeader(isoDate) {
  if (!isoDate) return "Sem data definida";
  const key = String(isoDate).slice(0, 10);
  const today = localTodayIso();
  const tomorrow = addDaysIso(today, 1);
  const yesterday = addDaysIso(today, -1);
  const dt = parseIsoDateLocal(key);
  const full = dt
    ? dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
    : key;
  if (key === today) return `Hoje — ${full}`;
  if (key === tomorrow) return `Amanhã — ${full}`;
  if (key === yesterday) return `Ontem — ${full}`;
  return full.charAt(0).toUpperCase() + full.slice(1);
}

function priorityMeta(priority) {
  const key = String(priority || "media").toLowerCase();
  return PRIORITY_MAP[key] || PRIORITY_MAP.media;
}

function categoryLabel(category) {
  const key = String(category || "geral").toLowerCase();
  return CATEGORY_MAP[key]?.label || (key.charAt(0).toUpperCase() + key.slice(1));
}

function statusLabel(status) {
  return STATUS_MAP[status] || status || "";
}

function timeToMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function detectAppointmentConflicts(appointments) {
  const conflictIds = new Set();
  const byId = new Map();
  const list = Array.isArray(appointments) ? appointments : [];

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a || !a.date || !a.start_time || !a.end_time) continue;
    const aStart = timeToMinutes(a.start_time);
    const aEnd = timeToMinutes(a.end_time);
    if (aStart === null || aEnd === null) continue;

    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b || b.date !== a.date || !b.start_time || !b.end_time) continue;
      const bStart = timeToMinutes(b.start_time);
      const bEnd = timeToMinutes(b.end_time);
      if (bStart === null || bEnd === null) continue;

      if (aStart < bEnd && aEnd > bStart) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
        if (!byId.has(a.id)) byId.set(a.id, []);
        if (!byId.has(b.id)) byId.set(b.id, []);
        byId.get(a.id).push(`${b.title} (${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)})`);
        byId.get(b.id).push(`${a.title} (${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)})`);
      }
    }
  }
  return { conflictIds, byId };
}

const COMPLEX_TASK_RE = /\b(?:prova|provas|exame|exames|avalia[çc][ãa]o|avalia[çc][õo]es|relat[óo]rio|relat[óo]rios|trabalho|trabalhos|projeto|projetos|sistema|sistemas|c[óo]digo|c[óo]digos|github|programar|programa[çc][ãa]o|implementar|api|sql|banco de dados|apresenta[çc][ãa]o|apresenta[çc][õo]es|slides?|semin[áa]rio|semin[áa]rios|estudar|estudando|estudo|estudos|revisar|revis[ãa]o|plano|planejar|planejamento|pesquisa|pesquisar|artigo|tcc|monografia|documenta[çc][ãa]o|arquitetura|deploy|refatorar|bug|organizar evento|faxina completa|curso|m[óo]dulo|exerc[íi]cios?|cap[íi]tulo|lista de|simulado)\b/i;

const SIMPLE_TASK_RE = /\b(?:comprar(?:\s+[a-zà-ÿ0-9-]+){0,3}|ir\s+(?:ao\s+mercado|ao\s+supermercado|na\s+padaria|[àa]\s+padaria|[àa]\s+farm[áa]cia|ao\s+banco)|beber\s+[áa]gua|tomar\s+(?:[áa]gua|rem[ée]dio|vitamina|caf[ée])|ligar\s+para|telefonar(?:\s+para)?|pagar\s+(?:a\s+|o\s+)?(?:conta|boleto|fatura|luz|[áa]gua|internet|aluguel|cart[ãa]o)|enviar\s+(?:um\s+|o\s+)?(?:e-?mail|mensagem|[áa]udio)|mandar\s+(?:um\s+|o\s+)?(?:e-?mail|mensagem|zap|whatsapp|[áa]udio)|responder\s+(?:a\s+|o\s+)?(?:e-?mail|mensagem|whatsapp)|levar\s+(?:o\s+)?lixo|tirar\s+(?:o\s+)?lixo|lavar\s+(?:a\s+)?lou[çc]a|arrumar\s+(?:a\s+)?cama|buscar\s+encomenda|pegar\s+encomenda|agendar\s+consulta|marcar\s+consulta)\b/i;

function isTaskComplex(taskOrTitle, description = "", category = "geral") {
  const isObj = Boolean(taskOrTitle && typeof taskOrTitle === "object");
  const title = isObj ? (taskOrTitle.title || taskOrTitle.titulo || "") : String(taskOrTitle || "");
  const desc = isObj ? (taskOrTitle.description || "") : String(description || "");
  const cat = (isObj ? (taskOrTitle.category || "geral") : String(category || "geral")).toLowerCase().trim();

  const titleLow = title.toLowerCase().trim();
  if (!titleLow) return false;

  const hasComplexInTitle = COMPLEX_TASK_RE.test(titleLow);
  const hasSimpleInTitle = SIMPLE_TASK_RE.test(titleLow);
  if (hasSimpleInTitle && !hasComplexInTitle) return false;
  if (hasComplexInTitle) return true;

  if (isObj && typeof taskOrTitle.precisa_destrinchar === "boolean") {
    return taskOrTitle.precisa_destrinchar;
  }

  const descLow = desc.toLowerCase().trim();
  if (descLow && !hasSimpleInTitle && COMPLEX_TASK_RE.test(descLow)) return true;

  const words = titleLow.split(/\s+/).filter(Boolean);
  if (words.length <= 3 && cat !== "estudo" && cat !== "trabalho") return false;
  return true;
}

function renderTaskBreakdownAction(task, btnSizeClass = "btn-sm") {
  if (!task || task.status === "concluida") return "";
  if (isTaskComplex(task)) {
    return `<button type="button" class="btn ${btnSizeClass}" data-breakdown-task="${task.id}" title="Dividir em 3 a 4 sub-etapas práticas do tema">⚡ Destrinchar</button>`;
  }
  return `<span class="badge badge-pendente" title="Tarefa rápida e direta — não precisa de sub-etapas">Ação direta</span>`;
}

function renderSubtasksChecklist(task) {
  const subs = Array.isArray(task?.subtasks) ? task.subtasks : [];
  if (!subs.length) return "";
  const doneCount = subs.filter((s) => Boolean(s.done)).length;
  return `
    <div class="subtasks-checklist" data-subtask-list="${task.id}">
      <div class="subtasks-header">
        <span>Micro-passos práticos (${doneCount}/${subs.length})</span>
      </div>
      ${subs.map((st, idx) => `
        <div class="subtask-item ${st.done ? "is-done" : ""}">
          <label>
            <input type="checkbox" data-subtask-task="${task.id}" data-subtask-idx="${idx}" ${st.done ? "checked" : ""}>
            <span>${escapeHtml(st.title)}</span>
          </label>
          <span class="subtask-dur">${st.duration_min || 20} min</span>
        </div>
      `).join("")}
    </div>
  `;
}

function bindSubtaskEvents(scope, getTaskById, onUpdated) {
  if (!scope) return;
  scope.querySelectorAll("[data-subtask-task]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const taskId = cb.getAttribute("data-subtask-task");
      const idx = parseInt(cb.getAttribute("data-subtask-idx"), 10);
      const task = getTaskById(taskId);
      if (!task || !Array.isArray(task.subtasks) || !task.subtasks[idx]) return;

      const updatedSubs = task.subtasks.map((s, i) => (i === idx ? { ...s, done: cb.checked } : s));
      const rowEl = cb.closest(".subtask-item");
      if (rowEl) rowEl.classList.toggle("is-done", cb.checked);
      cb.disabled = true;

      try {
        const updatedTask = await Api.updateTask(task.id, { subtasks: updatedSubs });
        task.subtasks = updatedTask.subtasks || updatedSubs;
        if (typeof onUpdated === "function") await onUpdated(updatedTask);
      } catch (err) {
        cb.checked = !cb.checked;
        if (rowEl) rowEl.classList.toggle("is-done", cb.checked);
        toast(err.message || "Erro ao atualizar micro-passo.", "error");
      } finally {
        cb.disabled = false;
      }
    });
  });

  scope.querySelectorAll("[data-breakdown-task]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const taskId = btn.getAttribute("data-breakdown-task");
      const origLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "O MindSide está organizando sua rotina...";
      try {
        const res = await Api.breakdownTask(taskId);
        if (res?.skipped_simple) {
          toast(res.message || res.dica_foco || "Esta é uma tarefa rápida e direta — não precisa de sub-etapas!", "info");
          btn.disabled = false;
          btn.textContent = origLabel;
        } else {
          toast(res?.dica_foco || "Micro-passos gerados com sucesso!", "success");
        }
        if (typeof onUpdated === "function") await onUpdated(res?.task);
      } catch (err) {
        toast(err.message || "Não foi possível destrinchar a tarefa.", "error");
        btn.disabled = false;
        btn.textContent = origLabel;
      }
    });
  });
}

function renderStudyPlanCard(plan) {
  const stages = Array.isArray(plan?.stages) ? plan.stages : [];
  return `
    <article class="study-plan-card" data-plan-id="${plan.id}">
      <div class="study-plan-header">
        <div style="min-width:0; flex:1;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
            <span class="badge badge-em_andamento">Arquiteto de Estudos</span>
            <h4 style="margin:0; font-size:1.02rem;">${escapeHtml(plan.title)}</h4>
          </div>
          ${plan.goal_summary ? `<p class="section-subtitle" style="margin:2px 0 0;">${escapeHtml(plan.goal_summary)}</p>` : ""}
          <div class="task-meta-clean" style="margin-top:6px;">
            <span class="time-badge">${plan.total_days || stages.length} etapas</span>
            <span class="time-badge">${plan.daily_minutes || 60} min/dia</span>
          </div>
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn-sm btn-primary" data-plan-to-tasks="${plan.id}">➕ Virar Tarefas</button>
          <button type="button" class="btn btn-sm" data-plan-reorg="${plan.id}" title="Recalcular datas pendentes a partir de hoje">🗓️ Reorganizar se atrasei</button>
          <button type="button" class="btn btn-sm btn-danger" data-plan-del="${plan.id}" aria-label="Excluir plano">✕</button>
        </div>
      </div>

      <div class="study-stages-list">
        ${stages.map((st, sIdx) => {
          const subs = Array.isArray(st.subtopicos) ? st.subtopicos : [];
          return `
            <div class="study-stage-card">
              <div class="study-stage-top">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <span class="time-badge">${escapeHtml(st.dia_ou_etapa || `Etapa ${sIdx + 1}`)}</span>
                  <strong>${escapeHtml(st.topico_principal || "")}</strong>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  ${st.suggested_date ? `<span class="text-dim" style="font-size:.75rem;">${formatDateFriendly(st.suggested_date)}</span>` : ""}
                  <span class="badge badge-pendente">${st.tempo_estimado_min || 60} min</span>
                  ${st.task_id ? `<span class="badge badge-concluida">Na lista de tarefas</span>` : ""}
                </div>
              </div>
              ${st.como_estudar ? `<p class="study-stage-how"><strong>Como estudar:</strong> ${escapeHtml(st.como_estudar)}</p>` : ""}
              ${subs.length ? `
                <div class="study-subtopics-list">
                  ${subs.map((sub, subIdx) => `
                    <label class="study-subtopic-item ${sub.done ? "is-done" : ""}">
                      <input type="checkbox" data-plan-check="${plan.id}" data-stage-idx="${sIdx}" data-sub-idx="${subIdx}" ${sub.done ? "checked" : ""}>
                      <span>${escapeHtml(typeof sub === "string" ? sub : (sub.title || ""))}</span>
                    </label>
                  `).join("")}
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function bindStudyPlanEvents(scope, getPlanById, onReload) {
  if (!scope) return;
  scope.querySelectorAll("[data-plan-check]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const planId = cb.getAttribute("data-plan-check");
      const sIdx = parseInt(cb.getAttribute("data-stage-idx"), 10);
      const subIdx = parseInt(cb.getAttribute("data-sub-idx"), 10);
      const plan = getPlanById(planId);
      if (!plan || !plan.stages?.[sIdx]?.subtopicos?.[subIdx]) return;

      const nextStages = plan.stages.map((st, i) => {
        if (i !== sIdx) return st;
        const nextSubs = st.subtopicos.map((sub, j) => (j === subIdx ? { ...sub, done: cb.checked } : sub));
        return { ...st, subtopicos: nextSubs };
      });
      const label = cb.closest(".study-subtopic-item");
      if (label) label.classList.toggle("is-done", cb.checked);

      try {
        const updated = await Api.updateStudyPlan(plan.id, nextStages);
        plan.stages = updated.stages || nextStages;
      } catch (err) {
        cb.checked = !cb.checked;
        if (label) label.classList.toggle("is-done", cb.checked);
        toast(err.message || "Erro ao salvar progresso do plano.", "error");
      }
    });
  });

  scope.querySelectorAll("[data-plan-to-tasks]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const planId = btn.getAttribute("data-plan-to-tasks");
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = "O MindSide está organizando sua rotina...";
      try {
        const res = await Api.convertStudyPlanToTasks(planId);
        const count = (res?.created_tasks || []).length;
        toast(count ? `${count} etapa(s) transformada(s) em tarefas reais!` : "Todas as etapas já estão na sua lista de tarefas.", "success");
        if (typeof onReload === "function") await onReload();
      } catch (err) {
        toast(err.message || "Erro ao converter plano em tarefas.", "error");
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  });

  scope.querySelectorAll("[data-plan-reorg]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const planId = btn.getAttribute("data-plan-reorg");
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Reorganizando...";
      try {
        const res = await Api.reorganizeStudyPlan(planId);
        toast(`Datas recalculadas a partir de hoje (${res?.rescheduled_stages || 0} etapa(s)).`, "success");
        if (typeof onReload === "function") await onReload();
      } catch (err) {
        toast(err.message || "Erro ao reorganizar plano.", "error");
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  });

  scope.querySelectorAll("[data-plan-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const planId = btn.getAttribute("data-plan-del");
      const confirmed = await confirmModal({
        title: "Excluir plano de estudos",
        message: "Tem certeza que deseja excluir este plano de estudos?",
        confirmText: "Excluir",
      });
      if (!confirmed) return;
      btn.disabled = true;
      try {
        await Api.deleteStudyPlan(planId);
        toast("Plano de estudos removido.", "info");
        if (typeof onReload === "function") await onReload();
      } catch (err) {
        toast(err.message || "Erro ao remover plano.", "error");
        btn.disabled = false;
      }
    });
  });
}

function confirmModal({
  title = "Confirmar exclusão",
  message = "Tem certeza que deseja continuar?",
  confirmText = "Excluir",
  cancelText = "Cancelar",
  onConfirm = null,
} = {}) {
  return new Promise((resolve) => {
    let overlay = document.getElementById("mindside-confirm-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mindside-confirm-overlay";
      overlay.className = "modal-overlay confirm-modal-overlay";
      overlay.innerHTML = `
        <div class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
          <div class="confirm-modal-head">
            <span class="confirm-modal-icon" aria-hidden="true">⚠</span>
            <div>
              <h3 id="confirm-modal-title" style="margin:0;"></h3>
              <p id="confirm-modal-message" class="section-subtitle" style="margin:6px 0 0; line-height:1.5;"></p>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:20px;">
            <button type="button" class="btn" id="confirm-modal-cancel"></button>
            <button type="button" class="btn btn-danger" id="confirm-modal-ok"></button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById("confirm-modal-title");
    const msgEl = document.getElementById("confirm-modal-message");
    const cancelBtn = document.getElementById("confirm-modal-cancel");
    const okBtn = document.getElementById("confirm-modal-ok");

    titleEl.textContent = title;
    msgEl.textContent = message;
    cancelBtn.textContent = cancelText;
    okBtn.textContent = confirmText;

    const cleanup = (result) => {
      overlay.classList.remove("open");
      cancelBtn.onclick = null;
      okBtn.onclick = null;
      overlay.onclick = null;
      resolve(result);
    };

    cancelBtn.onclick = () => cleanup(false);
    overlay.onclick = (ev) => {
      if (ev.target === overlay) cleanup(false);
    };
    okBtn.onclick = async () => {
      if (typeof onConfirm === "function") {
        await onConfirm();
      }
      cleanup(true);
    };

    overlay.classList.add("open");
    setTimeout(() => cancelBtn?.focus(), 30);
  });
}

function openRoutineModal(onSaved) {
  let overlay = document.getElementById("routine-config-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "routine-config-overlay";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="routine-modal-title">
        <h3 id="routine-modal-title">Sua Rotina Fixa (Proteção de Agenda com IA)</h3>
        <p class="section-subtitle" style="margin-bottom:12px;">
          Escreva livremente seus horários fixos de aulas, trabalho, cursos, treino e sono. O MindSide bloqueia esses horários automaticamente para nunca sugerir tarefas neles.
        </p>
        <form id="routine-modal-form">
          <div class="field">
            <label for="routine-modal-text">Descreva sua rotina em texto livre</label>
            <textarea id="routine-modal-text" class="input-control" rows="5" maxlength="5000" placeholder="Ex.: Estudo das 7h às 12h30 de seg a sex, faço curso técnico à tarde na terça e quinta das 14h às 17h e durmo às 23h" required></textarea>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" class="btn btn-xs" id="routine-example-btn">Usar exemplo prático</button>
          </div>
          <div id="routine-blocks-preview"></div>
          <div class="modal-actions">
            <button type="button" class="btn" id="routine-modal-cancel">Agora não</button>
            <button type="submit" class="btn btn-primary" id="routine-modal-save">✨ Salvar e Proteger Rotina</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const form = document.getElementById("routine-modal-form");
  const textarea = document.getElementById("routine-modal-text");
  const cancelBtn = document.getElementById("routine-modal-cancel");
  const submitBtn = document.getElementById("routine-modal-save");
  const preview = document.getElementById("routine-blocks-preview");

  const renderPreview = (blocks) => {
    if (!preview) return;
    if (!blocks || !blocks.length) {
      preview.innerHTML = "";
      return;
    }
    preview.innerHTML = `
      <div style="font-size:.76rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
        Blocos protegidos atualmente (${blocks.length}):
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; max-height:110px; overflow:auto; margin-bottom:8px;">
        ${blocks.slice(0, 12).map((b) => `
          <span class="badge badge-pendente">${escapeHtml(b.day_of_week)} ${String(b.start_time).slice(0, 5)}–${String(b.end_time).slice(0, 5)} · ${escapeHtml(b.title)}</span>
        `).join("")}
      </div>
    `;
  };

  if (!overlay.dataset.bound) {
    overlay.dataset.bound = "1";
    cancelBtn?.addEventListener("click", () => {
      sessionStorage.setItem("mindside_routine_prompt_dismissed", "1");
      overlay.classList.remove("open");
    });
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) {
        sessionStorage.setItem("mindside_routine_prompt_dismissed", "1");
        overlay.classList.remove("open");
      }
    });
    document.getElementById("routine-example-btn")?.addEventListener("click", () => {
      if (textarea) {
        textarea.value = "Estudo das 7h às 12h30 de seg a sex, faço curso técnico à tarde na terça e quinta das 14h às 17h e durmo às 23h";
        textarea.focus();
      }
    });
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = textarea?.value?.trim();
      if (!text || submitBtn.disabled) return;
      const orig = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Interpretando rotina com IA...";
      try {
        const res = await Api.saveRoutine(text);
        sessionStorage.setItem("mindside_routine_prompt_dismissed", "1");
        overlay.classList.remove("open");
        const count = (res?.blocks || []).length;
        toast(`Rotina salva! ${count} bloco(s) protegido(s) contra conflitos da IA.`, "success");
        if (typeof overlay._onSavedCallback === "function") await overlay._onSavedCallback(res);
      } catch (err) {
        toast(err.message || "Não foi possível interpretar a rotina.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = orig;
      }
    });
  }

  overlay._onSavedCallback = onSaved;
  Api.getRoutine().then((data) => {
    if (textarea && data?.routine_text && !textarea.value) textarea.value = data.routine_text;
    renderPreview(data?.blocks || []);
  }).catch(() => {});

  overlay.classList.add("open");
  setTimeout(() => textarea?.focus(), 40);
}

function openExtractNotesModal(onCreated) {
  let overlay = document.getElementById("extract-notes-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "extract-notes-overlay";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="extract-notes-title">
        <h3 id="extract-notes-title">Extrair ações de anotação</h3>
        <p class="section-subtitle" style="margin-bottom:14px;">
          Cole um resumo de aula, ata de reunião ou mensagem. O MindSide filtra o texto e transforma apenas as ações reais em tarefas no seu painel.
        </p>
        <form id="extract-notes-form">
          <div class="field">
            <label for="extract-notes-text">Texto ou anotação</label>
            <textarea id="extract-notes-text" class="input-control" rows="7" maxlength="15000" placeholder="Ex.: Pessoal, lembrar de entregar o trabalho de Redes até sexta-feira e enviar o diagrama no portal antes das 18h..." required></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" id="extract-notes-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="extract-notes-submit">Extrair e criar tarefas</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const form = document.getElementById("extract-notes-form");
  const textarea = document.getElementById("extract-notes-text");
  const cancelBtn = document.getElementById("extract-notes-cancel");
  const submitBtn = document.getElementById("extract-notes-submit");

  if (!overlay.dataset.bound) {
    overlay.dataset.bound = "1";
    cancelBtn?.addEventListener("click", () => overlay.classList.remove("open"));
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) overlay.classList.remove("open");
    });
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;
      const text = textarea.value.trim();
      if (!text) return;
      const origText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "O MindSide está organizando sua rotina...";
      try {
        const res = await Api.extractNotes(text, true);
        textarea.value = "";
        overlay.classList.remove("open");
        const count = (res?.created_tasks || []).length;
        toast(
          res?.resumo_filtrado || `${count} ação(ões) extraída(s) e salva(s) nas tarefas!`,
          "success"
        );
        if (typeof overlay._onCreatedCallback === "function") {
          await overlay._onCreatedCallback(res);
        }
      } catch (err) {
        toast(err.message || "Não foi possível extrair ações do texto.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    });
  }

  overlay._onCreatedCallback = onCreated;
  overlay.classList.add("open");
  setTimeout(() => textarea?.focus(), 40);
}

window.MindsideTimer = (() => {
  const KEY = "mindside_task_timers_v1";
  let ticker = null;

  function readState() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        return {
          activeTaskId: parsed.activeTaskId || null,
          activeTitle: parsed.activeTitle || "",
          startedAtMs: Number(parsed.startedAtMs) || 0,
          accumulated: parsed.accumulated && typeof parsed.accumulated === "object" ? parsed.accumulated : {},
        };
      }
    } catch { /* ignora erro */ }
    return { activeTaskId: null, activeTitle: "", startedAtMs: 0, accumulated: {} };
  }

  function writeState(st) {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* cota */ }
  }

  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  function formatHuman(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m`;
    if (mins > 0) return `${mins}m ${String(secs).padStart(2, "0")}s`;
    return `${secs}s`;
  }

  function getElapsedSeconds(taskId, initSec = 0) {
    const st = readState();
    const idKey = String(taskId);
    const storedBase = Math.max(Number(initSec) || 0, Number(st.accumulated?.[idKey]) || 0);
    if (st.activeTaskId && String(st.activeTaskId) === idKey && st.startedAtMs > 0) {
      return storedBase + Math.max(0, Math.floor((Date.now() - st.startedAtMs) / 1000));
    }
    return storedBase;
  }

  function isRunning(taskId) {
    const st = readState();
    return Boolean(st.activeTaskId && String(st.activeTaskId) === String(taskId) && st.startedAtMs > 0);
  }

  function ensureFloatingBar() {
    if (typeof document === "undefined" || !document.body) return null;
    let bar = document.getElementById("mindside-floating-timer");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "mindside-floating-timer";
      bar.className = "floating-timer-bar";
      bar.style.display = "none";
      bar.innerHTML = `
        <div class="floating-timer-info">
          <span class="ai-working-dot" aria-hidden="true"></span>
          <span class="floating-timer-label">Em foco:</span>
          <strong id="floating-timer-title"></strong>
        </div>
        <div class="floating-timer-controls">
          <span class="floating-timer-clock" id="floating-timer-clock">00:00</span>
          <button type="button" class="btn btn-xs" id="floating-timer-pause">⏸ Pausar</button>
        </div>
      `;
      document.body.appendChild(bar);
      document.getElementById("floating-timer-pause")?.addEventListener("click", async () => {
        const cur = readState();
        if (cur.activeTaskId) {
          await pause(cur.activeTaskId);
          updateDomDisplays();
        }
      });
    }
    return bar;
  }

  function updateDomDisplays() {
    if (typeof document === "undefined") return;
    const st = readState();

    document.querySelectorAll("[data-timer-toggle]").forEach((btn) => {
      const id = btn.getAttribute("data-timer-toggle");
      const initSec = parseInt(btn.getAttribute("data-timer-init") || "0", 10) || 0;
      const running = st.activeTaskId && String(st.activeTaskId) === String(id);
      const sec = getElapsedSeconds(id, initSec);
      btn.classList.toggle("is-running", Boolean(running));
      const labelEl = btn.querySelector("[data-timer-label]");
      const dispEl = btn.querySelector("[data-timer-display]");
      if (labelEl) labelEl.textContent = running ? "⏸ Pausar" : "▶ Iniciar";
      if (dispEl) dispEl.textContent = (running || sec > 0) ? formatClock(sec) : "";
    });

    const bar = ensureFloatingBar();
    if (bar) {
      if (st.activeTaskId && st.startedAtMs > 0) {
        bar.style.display = "flex";
        const tEl = document.getElementById("floating-timer-title");
        const cEl = document.getElementById("floating-timer-clock");
        if (tEl) tEl.textContent = st.activeTitle || "Tarefa em foco";
        if (cEl) cEl.textContent = formatClock(getElapsedSeconds(st.activeTaskId));
      } else {
        bar.style.display = "none";
      }
    }
  }

  function startTicker() {
    if (ticker) clearInterval(ticker);
    const st = readState();
    if (!st.activeTaskId) {
      updateDomDisplays();
      return;
    }
    updateDomDisplays();
    ticker = setInterval(updateDomDisplays, 1000);
  }

  async function pause(taskId, fallbackInitSec = 0) {
    const st = readState();
    const idKey = String(taskId);
    const total = getElapsedSeconds(idKey, fallbackInitSec);
    st.accumulated[idKey] = total;
    if (String(st.activeTaskId) === idKey) {
      st.activeTaskId = null;
      st.activeTitle = "";
      st.startedAtMs = 0;
    }
    writeState(st);
    startTicker();
    if (typeof Api !== "undefined" && typeof Api.updateTask === "function") {
      try {
        await Api.updateTask(idKey, { time_spent_seconds: total });
      } catch { /* mantém localStorage */ }
    }
    return total;
  }

  async function start(taskId, taskTitle = "", initSec = 0) {
    const st = readState();
    const idKey = String(taskId);
    if (st.activeTaskId && String(st.activeTaskId) !== idKey) {
      await pause(st.activeTaskId);
    }
    const fresh = readState();
    fresh.accumulated[idKey] = Math.max(Number(initSec) || 0, Number(fresh.accumulated?.[idKey]) || 0);
    fresh.activeTaskId = idKey;
    fresh.activeTitle = taskTitle || "Tarefa em andamento";
    fresh.startedAtMs = Date.now();
    writeState(fresh);
    startTicker();
    return fresh.accumulated[idKey];
  }

  async function finalizeTaskTimer(taskId, fallbackInitSec = 0) {
    const st = readState();
    const idKey = String(taskId);
    const total = getElapsedSeconds(idKey, fallbackInitSec);
    st.accumulated[idKey] = total;
    if (String(st.activeTaskId) === idKey) {
      st.activeTaskId = null;
      st.activeTitle = "";
      st.startedAtMs = 0;
    }
    writeState(st);
    startTicker();
    return total;
  }

  function renderTaskTimerControl(task, sizeClass = "btn-sm") {
    if (!task) return "";
    const sec = getElapsedSeconds(task.id, task.time_spent_seconds || task.tempo_gasto_segundos || 0);
    if (task.status === "concluida") {
      return sec > 0
        ? `<span class="badge badge-concluida" title="Tempo investido nesta tarefa">⏱ ${formatHuman(sec)}</span>`
        : "";
    }
    const running = isRunning(task.id);
    return `
      <button type="button" class="btn ${sizeClass} task-timer-btn ${running ? "is-running" : ""}" data-timer-toggle="${task.id}" data-timer-title="${escapeHtml(task.title)}" data-timer-init="${task.time_spent_seconds || 0}" title="${running ? "Pausar cronômetro" : "Iniciar cronômetro de execução"}">
        <span data-timer-label>${running ? "⏸ Pausar" : "▶ Iniciar"}</span>
        <span class="timer-live-val" data-timer-display="${task.id}">${running || sec > 0 ? formatClock(sec) : ""}</span>
      </button>
    `;
  }

  function bindTimerEvents(scope, getTaskById, onSynced) {
    if (!scope) return;
    startTicker();
    scope.querySelectorAll("[data-timer-toggle]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-timer-toggle");
        const task = typeof getTaskById === "function" ? getTaskById(id) : null;
        const initSec = task?.time_spent_seconds ?? (parseInt(btn.getAttribute("data-timer-init") || "0", 10) || 0);
        const title = task?.title || btn.getAttribute("data-timer-title") || "Tarefa";
        if (isRunning(id)) {
          const total = await pause(id, initSec);
          if (task) task.time_spent_seconds = total;
          btn.setAttribute("data-timer-init", String(total));
          toast(`Tempo salvo: ${formatHuman(total)}.`, "info");
          if (typeof onSynced === "function") await onSynced(id, total);
        } else {
          await start(id, title, initSec);
          toast(`Cronômetro iniciado para "${title}"!`, "success");
        }
        updateDomDisplays();
      });
    });
  }

  return {
    formatClock,
    formatHuman,
    getElapsedSeconds,
    isRunning,
    start,
    pause,
    finalizeTaskTimer,
    renderTaskTimerControl,
    bindTimerEvents,
    refresh: startTicker,
  };
})();

window.MindsideUI = {
  addDaysIso,
  parseIsoDateLocal,
  formatDateFriendly,
  formatDateGroupHeader,
  priorityMeta,
  categoryLabel,
  statusLabel,
  timeToMinutes,
  detectAppointmentConflicts,
  isTaskComplex,
  renderTaskBreakdownAction,
  renderSubtasksChecklist,
  bindSubtaskEvents,
  renderStudyPlanCard,
  bindStudyPlanEvents,
  openExtractNotesModal,
  openRoutineModal,
  confirmModal,
};

function formatUserSubtitle(email) {
  if (!email) return "Sessão local";
  if (email.startsWith("guest_") && email.endsWith("@example.com")) {
    return "Sessão visitante";
  }
  return email;
}

function formatTodayHeader() {
  const now = new Date();
  return now.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).replace(".", "");
}

function buildSidebarNavMarkup(activePage, isSimplified) {
  const renderLinks = (items) => items.map((item) => `
    <a class="side-link ${item.href === activePage ? "active" : ""}" href="${item.href}" ${item.href === activePage ? 'aria-current="page"' : ""}>
      <span class="ic ic-${item.icon}">${NAV_ICONS[item.icon]}</span>
      <span>${item.label}</span>
    </a>`).join("");

  if (isSimplified) {
    const coreItems = NAV_ITEMS.filter((i) => i.tier === "core");
    const secondaryItems = NAV_ITEMS.filter((i) => i.tier === "secondary");
    const secondaryActive = secondaryItems.some((i) => i.href === activePage);
    return `
      <div class="sidebar-nav-label">Essencial</div>
      ${renderLinks(coreItems)}
      <details class="sidebar-more-nav" ${secondaryActive ? "open" : ""}>
        <summary>Mais visualizações</summary>
        <div class="sidebar-more-links">
          ${renderLinks(secondaryItems)}
        </div>
      </details>
    `;
  }

  const rotinaItems = NAV_ITEMS.filter((i) => i.group === "rotina");
  const sistemaItems = NAV_ITEMS.filter((i) => i.group === "sistema");
  return `
    <div class="sidebar-nav-label">Rotina</div>
    ${renderLinks(rotinaItems)}
    <div class="sidebar-nav-label" style="margin-top:10px;">Sistema</div>
    ${renderLinks(sistemaItems)}
  `;
}

function updateSidebarUserBox(user) {
  const box = document.querySelector(".sidebar-user");
  if (!box || !user) return;
  box.setAttribute("title", user.email || "");
  const nameEl = box.querySelector(".name");
  const emailEl = box.querySelector(".email");
  if (nameEl) nameEl.textContent = user.name || "Visitante";
  if (emailEl) emailEl.textContent = formatUserSubtitle(user.email || "");
}

function renderShell(activePage, pageTitle, pageSubtitle) {
  if (!requireAuth()) return;
  document.body?.setAttribute("data-page", activePage);
  const user = Api.user() || { name: "Visitante", email: "Sessão sem login" };
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;

  const shellRoot = document.getElementById("app-shell");
  const showQuickAssistant = activePage !== "assistente.html";

  if (!document.querySelector('link[rel="icon"]')) {
    const fav = document.createElement("link");
    fav.rel = "icon";
    fav.type = "image/svg+xml";
    fav.href = "assets/stickers/slime-default.svg";
    document.head.appendChild(fav);
  }

  shellRoot.innerHTML = `
    <a class="skip-link" href="#page-content">Pular para o conteúdo principal</a>
    <div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>
    <aside class="sidebar" id="sidebar" role="navigation" aria-label="Navegação principal">
      <div class="sidebar-header-row">
        <a class="brand" href="index.html"><span class="brand-dot"></span> MINDSIDE</a>
        <button class="sidebar-close" id="sidebar-close" aria-label="Fechar menu de navegação">✕</button>
      </div>
      <nav id="sidebar-nav" aria-label="Seções do MindSide">
        ${buildSidebarNavMarkup(activePage, isSimplified)}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user" title="${escapeHtml(user.email || "")}">
          <div style="width:38px;height:32px;flex-shrink:0;" data-slime></div>
          <div class="sidebar-user-info">
            <div class="name">${escapeHtml(user ? user.name : "Visitante")}</div>
            <div class="email">${escapeHtml(formatUserSubtitle(user ? user.email : ""))}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-ghost" data-logout title="Reiniciar uma nova sessão limpa">↻ Nova sessão</button>
      </div>
    </aside>
    <main class="main-area" id="main-content">
      <header class="topbar">
        <div class="topbar-title-group">
          <button class="menu-toggle" id="menu-toggle" aria-label="Abrir menu de navegação">☰</button>
          <span class="topbar-accent-bar" aria-hidden="true"></span>
          <div class="topbar-titles">
            <h1>${pageTitle}</h1>
            ${pageSubtitle ? `<div class="sub">${pageSubtitle}</div>` : ""}
          </div>
        </div>
        <div class="top-actions">
          <span class="topbar-date-pill complete-only" title="Data de hoje">${formatTodayHeader()}</span>
          <div class="mode-segmented" role="group" aria-label="Modo de interface">
            <button type="button" class="mode-seg-btn" data-mode-choice="complete" aria-pressed="${!isSimplified}">
              Completo
            </button>
            <button type="button" class="mode-seg-btn" data-mode-choice="simplified" aria-pressed="${isSimplified}">
              Simplificado
            </button>
          </div>
          ${showQuickAssistant ? `<a class="btn btn-sm btn-primary" href="assistente.html">Organizar com IA</a>` : ""}
        </div>
      </header>
      <div id="contextual-guide-slot"></div>
      <div id="page-content" tabindex="-1"></div>
    </main>
  `;

  window.MindsideGuides.render(activePage);

  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const closeSidebar = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  };
  document.getElementById("menu-toggle").addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("open");
    overlay.classList.toggle("open", isOpen);
  });
  document.getElementById("sidebar-close").addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);

  if (!window.__mindsideGlobalEscBound) {
    window.__mindsideGlobalEscBound = true;
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSidebar();
        document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open"));
      }
    });
  }

  window.addEventListener("mindside:modechange", (ev) => {
    const nav = document.getElementById("sidebar-nav");
    if (nav) {
      nav.innerHTML = buildSidebarNavMarkup(activePage, ev.detail?.mode === "simplified");
    }
    window.MindsideMode?.paint();
  });

  window.MindsideTheme.init();
  window.MindsideMode?.init();
  window.MindsideTimer?.refresh();
  initLogout();
  initSlimes();

  // Sincroniza usuário e modo de interface persistidos no backend em segundo plano
  if (typeof Api !== "undefined" && typeof Api.me === "function") {
    Api.me().then((freshUser) => {
      if (!freshUser) return;
      const storedPref = window.MindsideMode?.getStoredPreference?.();
      if (storedPref) {
        // Mantém a preferência local do usuário e reconcilia com o backend se divergirem
        Api.setUser(freshUser, { applyMode: false });
        if (freshUser.interface_mode !== storedPref && typeof Api.updateProfile === "function") {
          Api.updateProfile({ interface_mode: storedPref }).catch(() => { /* ignora erro silencioso */ });
        }
      } else {
        Api.setUser(freshUser, { applyMode: true, forceServerMode: true });
      }
      updateSidebarUserBox(Api.user() || freshUser);
    }).catch(() => { /* ignora erro silencioso de bootstrap */ });
  }
}
