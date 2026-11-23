/* Tela Inicial (Dashboard) — Visão acolhedora e objetiva da rotina pessoal
   com Inteligência Executiva: Briefing do Secretário, Brain Dump, Destrinchar,
   Extrator de Anotações e Arquiteto de Estudos. */

let dashState = {
  tasks: [],
  appts: [],
  goals: [],
  suggestions: [],
  slots: [],
  studyPlans: [],
  routine: { routine_text: "", blocks: [], has_routine: false },
  briefing: null,
  briefingLoading: false,
  inboxMode: "task", // "task" | "study"
  loaded: false,
};

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function getUserFirstName() {
  const user = Api.user();
  if (user && user.name && user.name.trim()) {
    return user.name.trim().split(" ")[0];
  }
  return "Visitante";
}

function findNextActivity(pendingTasks, appts, goalMap) {
  const today = localTodayIso();
  const now = new Date();
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const upcomingAppts = appts
    .filter((a) => a.date > today || (a.date === today && (a.end_time || "23:59").slice(0, 5) >= nowHm))
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));

  if (upcomingAppts.length && upcomingAppts[0].date === today) {
    const a = upcomingAppts[0];
    return {
      kind: "appt",
      item: a,
      eyebrow: "Próximo compromisso de hoje",
      title: a.title,
      meta: `Hoje · ${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)} · ${MindsideUI.categoryLabel(a.category)}`,
    };
  }

  if (pendingTasks.length) {
    const sorted = [...pendingTasks].sort((a, b) => {
      const pa = MindsideUI.priorityMeta(a.priority).order;
      const pb = MindsideUI.priorityMeta(b.priority).order;
      if (pa !== pb) return pa - pb;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });
    const t = sorted[0];
    const prio = MindsideUI.priorityMeta(t.priority);
    const parts = [
      `${prio.icon} Prioridade ${prio.label}`,
      t.deadline ? `Prazo: ${MindsideUI.formatDateFriendly(t.deadline)}` : "Sem prazo fixo",
    ];
    if (t.goal_id && goalMap[t.goal_id]) {
      parts.push(`Objetivo: ${goalMap[t.goal_id]}`);
    }
    return {
      kind: "task",
      item: t,
      eyebrow: "Próxima atividade recomendada",
      title: t.title,
      meta: parts.join(" · "),
    };
  }

  if (upcomingAppts.length) {
    const a = upcomingAppts[0];
    return {
      kind: "appt",
      item: a,
      eyebrow: "Próximo compromisso agendado",
      title: a.title,
      meta: `${MindsideUI.formatDateFriendly(a.date)} · ${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}`,
    };
  }

  return null;
}

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("dashboard.html", "Visão Geral");
  window.addEventListener("mindside:modechange", () => {
    if (dashState.loaded) renderDashboardContent();
  });

  // Hidratação imediata do cache local enquanto sincroniza com o banco
  const cachedTasks = Api.getCachedTasks();
  const cachedPlans = Api.getCachedStudyPlans();
  const cachedBriefing = Api.getCachedBriefing();
  if (cachedBriefing) dashState.briefing = cachedBriefing;
  if (cachedTasks.length || cachedPlans.length) {
    dashState.tasks = cachedTasks;
    dashState.studyPlans = cachedPlans;
  }

  await loadDashboard();
});

async function loadDashboard() {
  const content = document.getElementById("page-content");
  if (!dashState.loaded && !dashState.tasks.length) {
    content.innerHTML = `
      <div class="skeleton" style="height:120px; margin-bottom:16px;"></div>
      <div class="skeleton" style="height:96px; margin-bottom:16px;"></div>
      <div class="skeleton" style="height:220px;"></div>
    `;
  }

  try {
    const [tasks, appts, goals, suggestions, slots, studyPlans, routine] = await Promise.all([
      Api.listTasks(),
      Api.listAppointments(),
      Api.listGoals(),
      Api.listSuggestions(),
      Api.listAvailability(),
      Api.listStudyPlans(),
      Api.getRoutine().catch(() => Api.getCachedRoutine()),
    ]);
    dashState = {
      ...dashState,
      tasks,
      appts,
      goals,
      suggestions,
      slots,
      studyPlans,
      routine: routine || { routine_text: "", blocks: [], has_routine: false },
      loaded: true,
    };
    renderDashboardContent();
    void refreshBriefing(false);
    if (!dashState.routine?.has_routine && !sessionStorage.getItem("mindside_routine_prompt_dismissed")) {
      MindsideUI.openRoutineModal(async () => { await loadDashboard(); });
    }
  } catch (err) {
    toast(err.message || "Erro ao carregar a visão geral.", "error");
  }
}

async function refreshBriefing(forceRefresh = true) {
  if (dashState.briefingLoading) return;
  dashState.briefingLoading = true;
  updateBriefingDom();

  try {
    const data = await Api.getDailyBriefing(forceRefresh);
    dashState.briefing = data;
  } catch {
    if (!dashState.briefing) {
      dashState.briefing = {
        recomendacao_principal: "Comece pela tarefa de maior prioridade com prazo mais próximo para ganhar tração hoje.",
        motivo_estrategico: "Foco progressivo sem sobrecarga.",
      };
    }
  } finally {
    dashState.briefingLoading = false;
    updateBriefingDom();
  }
}

function renderBriefingMarkup() {
  const b = dashState.briefing;
  const isLoading = dashState.briefingLoading;

  let bodyMarkup = "";
  if (isLoading && !b) {
    bodyMarkup = `
      <div class="ai-working-pill">
        <span class="ai-working-dot" aria-hidden="true"></span>
        <span>O MindSide está organizando sua rotina...</span>
      </div>`;
  } else if (b) {
    bodyMarkup = `
      <p class="secretary-briefing-body">${escapeHtml(b.recomendacao_principal || "")}</p>
      ${b.alerta_sobrecarga ? `<div class="secretary-overload-note">${escapeHtml(b.alerta_sobrecarga)}</div>` : ""}
    `;
  } else {
    bodyMarkup = `<p class="secretary-briefing-body text-dim">Preparando seu resumo executivo...</p>`;
  }

  return `
    <section class="secretary-briefing-card" id="briefing-card" aria-label="Briefing do Secretário">
      <div class="secretary-briefing-head">
        <div class="secretary-briefing-title">
          <img class="sticker-img sticker-sm" src="assets/stickers/slime-idea.svg" alt="">
          <span>Briefing do Secretário</span>
          ${b?.generated_at ? `<span class="badge badge-pendente">Atualizado ${escapeHtml(b.generated_at)}</span>` : ""}
        </div>
        <button type="button" class="btn btn-sm" id="refresh-briefing-btn" ${isLoading ? "disabled" : ""}>
          ${isLoading ? "O MindSide está organizando sua rotina..." : "↻ Atualizar recomendação"}
        </button>
      </div>
      ${bodyMarkup}
      ${b?.tarefa_foco_id ? `
        <div class="secretary-briefing-actions">
          <button type="button" class="btn btn-xs btn-approve" data-dash-done="${b.tarefa_foco_id}">✓ Concluir tarefa foco agora</button>
          <a class="btn btn-xs btn-ghost" href="tarefas.html">Abrir em Tarefas →</a>
        </div>
      ` : ""}
    </section>
  `;
}

function updateBriefingDom() {
  const slot = document.getElementById("briefing-slot");
  if (!slot) return;
  slot.innerHTML = renderBriefingMarkup();
  bindBriefingEvents(slot);
}

function bindBriefingEvents(scope) {
  const btn = scope.querySelector("#refresh-briefing-btn");
  if (btn) {
    btn.addEventListener("click", () => refreshBriefing(true));
  }
  scope.querySelectorAll("[data-dash-done]").forEach((doneBtn) => {
    doneBtn.addEventListener("click", async () => {
      if (doneBtn.disabled) return;
      doneBtn.disabled = true;
      try {
        const taskObj = dashState.tasks.find((t) => String(t.id) === String(doneBtn.dataset.dashDone));
        const totalSec = window.MindsideTimer
          ? await MindsideTimer.finalizeTaskTimer(doneBtn.dataset.dashDone, taskObj?.time_spent_seconds || 0)
          : (taskObj?.time_spent_seconds || 0);
        await Api.updateTask(doneBtn.dataset.dashDone, { status: "concluida", time_spent_seconds: totalSec });
        toast(totalSec > 0 ? `Tarefa concluída em ${MindsideTimer.formatHuman(totalSec)}!` : "Tarefa concluída!", "success");
        await loadDashboard();
      } catch (err) {
        toast(err.message || "Erro ao concluir tarefa.", "error");
        doneBtn.disabled = false;
      }
    });
  });
}

function renderDashboardContent() {
  const content = document.getElementById("page-content");
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;
  const { tasks, appts, goals, suggestions, slots, studyPlans } = dashState;

  const today = localTodayIso();
  const pendingTasks = tasks.filter((t) => t.status !== "concluida");
  const doneTasks = tasks.filter((t) => t.status === "concluida");
  const upcomingAppts = appts
    .filter((a) => a.date >= today)
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
  const todayAppts = upcomingAppts.filter((a) => a.date === today);
  const activeGoals = goals.filter((g) => g.status === "ativo");
  const pendingSuggestions = suggestions.filter((s) => s.status === "pending" || s.status === "edited");
  const goalMap = Object.fromEntries(goals.map((g) => [g.id, g.title]));

  const apptConflictInfo = MindsideUI.detectAppointmentConflicts(appts);
  const conflictedSuggestions = pendingSuggestions.filter((s) => {
    try {
      const d = JSON.parse(s.structured_data || "{}");
      return d.conflicts && d.conflicts.length > 0;
    } catch { return false; }
  });
  const totalConflictSources = conflictedSuggestions.length + (apptConflictInfo.conflictIds.size > 0 ? 1 : 0);

  const greeting = `${getTimeGreeting()}, ${escapeHtml(getUserFirstName())}!`;
  const nextActivity = findNextActivity(pendingTasks, appts, goalMap);

  const tasksPillText = pendingTasks.length === 1
    ? "<strong>1</strong> tarefa pendente"
    : `<strong>${pendingTasks.length}</strong> tarefas pendentes`;
  const apptsPillText = upcomingAppts.length === 1
    ? "<strong>1</strong> compromisso próximo"
    : `<strong>${upcomingAppts.length}</strong> compromissos próximos`;
  const todayPillText = todayAppts.length === 1
    ? "<strong>1</strong> compromisso hoje"
    : `<strong>${todayAppts.length}</strong> compromissos hoje`;

  const heroHtml = `
    <section class="welcome-hero" aria-label="Saudação e resumo do dia">
      <div class="welcome-hero-copy">
        <h2>${greeting} Vamos organizar seu dia?</h2>
        <p class="welcome-sub">
          ${tasks.length === 0 && appts.length === 0 && goals.length === 0
            ? "Sua rotina está livre para começar no seu ritmo."
            : (pendingTasks.length === 0
              ? "Todas as suas tarefas cadastradas estão concluídas."
              : "Veja o que pede atenção primeiro sem precisar olhar tudo ao mesmo tempo.")}
        </p>
        <div class="summary-pills-row">
          <a class="summary-pill" href="tarefas.html">${tasksPillText}</a>
          <a class="summary-pill" href="compromissos.html">${apptsPillText}</a>
          ${!isSimplified ? `<a class="summary-pill" href="agenda.html">${todayPillText}</a>` : ""}
          ${pendingSuggestions.length > 0
            ? `<a class="summary-pill" href="assistente.html"><strong>${pendingSuggestions.length}</strong> sugestão(ões) aguardando decisão</a>`
            : ""}
          <button type="button" class="summary-pill" id="open-routine-modal-btn" style="cursor:pointer;">
            ${dashState.routine?.has_routine
              ? `🛡 <strong>${(dashState.routine.blocks || []).length}</strong> bloco(s) de rotina protegida`
              : `⚠ Configurar rotina fixa`}
          </button>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <img class="sticker-img sticker-lg" src="assets/stickers/slime-${totalConflictSources > 0 ? "conflict" : (pendingTasks.length === 0 && tasks.length > 0 ? "done" : "focus")}.svg" alt="Mascote MindSide">
      </div>
    </section>
  `;

  const routineOnboardingHtml = !dashState.routine?.has_routine
    ? `
      <section class="routine-onboarding-banner" aria-label="Configuração de rotina base">
        <div style="min-width:0; flex:1;">
          <div style="font-weight:700; font-size:.95rem;">Proteja seus horários fixos com a IA</div>
          <p class="section-subtitle" style="margin:3px 0 0;">
            Conte quando você estuda, trabalha, faz cursos ou dorme (em texto livre). O MindSide bloqueia esses horários automaticamente para nunca sugerir tarefas neles.
          </p>
        </div>
        <button type="button" class="btn btn-sm btn-primary" id="banner-routine-btn">🗓️ Configurar Rotina Agora</button>
      </section>
    `
    : "";

  let conflictHtml = "";
  if (totalConflictSources > 0) {
    const msgs = [];
    conflictedSuggestions.forEach((s) => {
      try {
        const d = JSON.parse(s.structured_data || "{}");
        const cNames = (d.conflicts || []).map((c) => `${c.title} (${c.start_time}–${c.end_time})`).join(", ");
        msgs.push(`A sugestão "${d.title}" coincide com ${cNames}.`);
      } catch { /* ignora */ }
    });
    if (apptConflictInfo.conflictIds.size > 0) {
      msgs.push("Existem compromissos com horários sobrepostos na sua agenda.");
    }
    conflictHtml = `
      <div class="conflict-alert-banner" role="alert">
        <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
          <img class="sticker-img sticker-sm" src="assets/stickers/slime-conflict.svg" alt="">
          <div>
            <div style="font-weight:700; color:var(--danger); font-size:.92rem;">Atenção a horários sobrepostos</div>
            <div class="text-secondary" style="font-size:.82rem; margin-top:2px;">${escapeHtml(msgs.join(" "))}</div>
          </div>
        </div>
        <a class="btn btn-sm btn-danger" href="${conflictedSuggestions.length ? "assistente.html" : "compromissos.html"}">Revisar horários →</a>
      </div>
    `;
  }

  // Caixa de Entrada Inteligente unificada (Brain Dump + Arquiteto de Estudos + Extrair de Anotação)
  const isStudy = dashState.inboxMode === "study";
  const smartInboxHtml = `
    <section class="smart-inbox-card" aria-label="Caixa de Entrada Inteligente">
      <div class="smart-inbox-top">
        <div>
          <h3 class="mt-0" style="margin-bottom:2px;">Caixa de Entrada Inteligente</h3>
          <p class="smart-inbox-hint">
            ${isStudy
              ? "Informe o tema e o tempo disponível (ex.: “Aprender SQL para prova em 5 dias, 1h por dia”) para montar etapas progressivas."
              : "Despeje ideias livres (ex.: “Tenho prova de banco de dados sexta às 14h e terminar o relatório amanhã cedo”)."}
          </p>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div class="smart-inbox-modes" role="tablist" aria-label="Tipo de criação inteligente">
            <button type="button" class="smart-mode-btn ${!isStudy ? "active" : ""}" data-dash-inbox-mode="task" role="tab" aria-selected="${!isStudy}">
              Nova Tarefa
            </button>
            <button type="button" class="smart-mode-btn ${isStudy ? "active" : ""}" data-dash-inbox-mode="study" role="tab" aria-selected="${isStudy}">
              Criar Plano de Estudos
            </button>
          </div>
          <button type="button" class="btn btn-sm" id="dash-extract-notes-btn">📄 Extrair de Anotação</button>
        </div>
      </div>
      <form class="smart-inbox-form" id="dash-smart-inbox-form">
        <div class="smart-inbox-row">
          <input
            type="text"
            class="input-control"
            id="dash-smart-inbox-input"
            placeholder="${isStudy ? "Ex.: Aprender SQL para prova em 5 dias, 1h por dia..." : "Ex.: Tenho prova de banco de dados sexta às 14h e terminar relatório amanhã cedo..."}"
            maxlength="3000"
            aria-label="Entrada inteligente"
            required
          >
          <button type="submit" class="btn btn-primary" id="dash-smart-inbox-submit">
            ${isStudy ? "✨ Gerar Plano de Estudos" : "✨ Organizar no Painel"}
          </button>
        </div>
      </form>
    </section>
  `;

  const nextActivityHtml = nextActivity
    ? `
      <section class="next-activity-card" aria-label="Próxima atividade">
        <div style="min-width:0; flex:1;">
          <div class="next-activity-eyebrow">${escapeHtml(nextActivity.eyebrow)}</div>
          <h3 class="next-activity-title">${escapeHtml(nextActivity.title)}</h3>
          <div class="next-activity-meta">${escapeHtml(nextActivity.meta)}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${nextActivity.kind === "task"
            ? `<button type="button" class="btn btn-approve" data-dash-done="${nextActivity.item.id}">✓ Concluir agora</button>`
            : `<a class="btn btn-primary" href="compromissos.html">Ver compromisso →</a>`}
        </div>
      </section>
    `
    : "";

  const sortedTasks = [...pendingTasks].sort((a, b) => {
    const pa = MindsideUI.priorityMeta(a.priority).order;
    const pb = MindsideUI.priorityMeta(b.priority).order;
    if (pa !== pb) return pa - pb;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    return 0;
  });
  const taskSlice = sortedTasks.slice(0, isSimplified ? 5 : 7);
  const tasksHtml = `
    <section class="card list-card" style="margin-bottom:0;" aria-label="Suas tarefas prioritárias">
      <div class="head">
        <div>
          <h3 class="mt-0">Suas tarefas</h3>
          <div class="section-subtitle">${pendingTasks.length} pendente(s) · ${doneTasks.length} concluída(s)</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-sm" href="tarefas.html">Ver todas</a>
        </div>
      </div>
      ${taskSlice.length ? taskSlice.map((t) => {
        const prio = MindsideUI.priorityMeta(t.priority);
        const isOverdue = t.deadline && t.deadline < today;
        return `
          <div class="task-card-row">
            <div class="task-card-main">
              <button type="button" class="task-check-btn" data-dash-done="${t.id}" aria-label="Concluir tarefa ${escapeHtml(t.title)}" title="Marcar como concluída">✓</button>
              <div style="min-width:0; flex:1;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <div class="task-title-text">${escapeHtml(t.title)}</div>
                  ${t.goal_id && goalMap[t.goal_id] ? `<span class="badge badge-em_andamento">🎯 Meta: ${escapeHtml(goalMap[t.goal_id])}</span>` : ""}
                </div>
                <div class="task-meta-clean">
                  <span class="prio-pill ${prio.className}">${prio.icon} ${prio.label}</span>
                  <span>${t.deadline ? (isOverdue ? `Atrasada (${MindsideUI.formatDateFriendly(t.deadline)})` : `Prazo: ${MindsideUI.formatDateFriendly(t.deadline)}`) : "Sem prazo"}</span>
                </div>
                ${MindsideUI.renderSubtasksChecklist(t)}
              </div>
            </div>
            <div class="item-actions">
              ${window.MindsideTimer ? MindsideTimer.renderTaskTimerControl(t, "btn-xs") : ""}
              ${MindsideUI.renderTaskBreakdownAction(t, "btn-xs")}
            </div>
          </div>
        `;
      }).join("") : `
        <div class="empty-state-box">
          <img class="sticker-img sticker-sm" src="assets/stickers/slime-done.svg" alt="">
          <div>Nenhuma tarefa pendente no momento. Use a Caixa de Entrada Inteligente acima para começar!</div>
        </div>
      `}
    </section>
  `;

  const pendingSuggHtml = pendingSuggestions.length ? `
    <div style="margin-top:14px;">
      <div style="font-size:.82rem; font-weight:700; color:var(--text-secondary); margin-bottom:8px;">
        Sugestões aguardando sua aprovação (${pendingSuggestions.length}):
      </div>
      ${pendingSuggestions.slice(0, isSimplified ? 2 : 4).map((s) => {
        let parsed = {};
        try { parsed = JSON.parse(s.structured_data || "{}"); } catch { /* ignora */ }
        const conflicts = parsed.conflicts || [];
        const hasConflict = conflicts.length > 0;
        return `
          <div class="suggestion-card ${hasConflict ? "has-conflict" : ""}" style="margin-top:0; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
              <strong style="font-size:.92rem;">${escapeHtml(parsed.title || s.content)}</strong>
              <span class="badge ${hasConflict ? "badge-urgente" : "badge-concluida"}">${hasConflict ? "Conflito de horário" : "Pronta para aprovar"}</span>
            </div>
            <div class="task-meta-clean">
              <span>${parsed.type === "compromisso" ? "Compromisso" : "Tarefa"}</span>
              ${parsed.date ? `<span>· ${MindsideUI.formatDateFriendly(parsed.date)}${parsed.time ? " às " + escapeHtml(parsed.time) : ""}</span>` : ""}
              <span>· Prioridade: ${MindsideUI.priorityMeta(parsed.priority).label}</span>
            </div>
            ${hasConflict ? `<div class="conflict-explain-box"><strong>Conflito:</strong> coincide com ${conflicts.map((c) => `${escapeHtml(c.title)} (${c.start_time}–${c.end_time})`).join(", ")}.</div>` : ""}
            <div class="suggestion-actions">
              <button type="button" class="btn btn-xs btn-approve" data-dash-approve="${s.id}">✓ Aprovar</button>
              <a class="btn btn-xs" href="assistente.html">✎ Revisar</a>
              <button type="button" class="btn btn-xs btn-danger" data-dash-reject="${s.id}">✕ Rejeitar</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  ` : "";

  const assistantCardHtml = `
    <section class="assistant-prompt-card" style="margin-bottom:0;" aria-label="Assistente MindSide">
      <div class="assistant-prompt-header">
        <div style="display:flex; align-items:center; gap:12px;">
          <img class="sticker-img sticker-sm" src="assets/stickers/slime-default.svg" alt="">
          <div>
            <h3 class="mt-0" style="margin-bottom:2px;">Assistente Conversacional</h3>
            <div class="section-subtitle">Para agendar compromissos ou validar horários com sua agenda.</div>
          </div>
        </div>
        <a class="btn btn-sm" href="assistente.html">Abrir Assistente →</a>
      </div>
      <form class="assistant-inline-form" id="dash-quick-ai-form">
        <input type="text" class="input-control" id="dash-quick-ai-input" placeholder="Ex.: Tenho consulta médica quinta às 15h..." maxlength="500" aria-label="Descreva rapidamente um compromisso">
        <button type="submit" class="btn">Validar agenda</button>
      </form>
      ${pendingSuggHtml}
    </section>
  `;

  const studyPlansHtml = studyPlans.length ? `
    <section id="dash-study-plans-section" style="margin-top:18px;" aria-label="Seus planos de estudos">
      ${studyPlans.map((plan) => MindsideUI.renderStudyPlanCard(plan)).join("")}
    </section>
  ` : "";

  const apptsBlockHtml = `
    <section class="card list-card" style="margin-bottom:0;" aria-label="Próximos compromissos">
      <div class="head">
        <div>
          <h3 class="mt-0">Próximos compromissos</h3>
        </div>
        <div style="display:flex; gap:6px;">
          <a class="btn btn-sm btn-ghost" href="agenda.html">Ver agenda</a>
          <a class="btn btn-sm" href="compromissos.html">Gerenciar</a>
        </div>
      </div>
      ${upcomingAppts.length ? upcomingAppts.slice(0, 5).map((a) => {
        const hasOverlap = apptConflictInfo.conflictIds.has(a.id);
        return `
          <div class="appt-card-clean ${hasOverlap ? "has-conflict" : ""}">
            <div style="min-width:0; flex:1;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="time-badge">${MindsideUI.formatDateFriendly(a.date)} · ${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}</span>
                <span class="item-title">${escapeHtml(a.title)}</span>
              </div>
              <div class="task-meta-clean">
                <span>${MindsideUI.categoryLabel(a.category)}</span>
                ${hasOverlap ? `<span class="conflict-pill">⚠ Conflito com ${escapeHtml((apptConflictInfo.byId.get(a.id) || []).join(", "))}</span>` : ""}
              </div>
            </div>
          </div>
        `;
      }).join("") : `
        <div class="empty-state-box">
          <img class="sticker-img sticker-sm" src="assets/stickers/slime-schedule.svg" alt="">
          <div>Nenhum compromisso próximo agendado.</div>
          <a class="btn btn-sm" href="compromissos.html">+ Agendar compromisso</a>
        </div>
      `}
    </section>
  `;

  const goalsBlockHtml = `
    <section class="card list-card" style="margin-bottom:0;" aria-label="Objetivos ativos">
      <div class="head">
        <div>
          <h3 class="mt-0">Objetivos em andamento</h3>
        </div>
        <a class="btn btn-sm" href="objetivos.html">Ver objetivos</a>
      </div>
      ${activeGoals.length ? activeGoals.slice(0, 4).map((g) => {
        const linked = tasks.filter((t) => t.goal_id === g.id);
        const nextStep = linked.find((t) => t.status !== "concluida");
        return `
          <div class="goal-card" style="padding:14px 16px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <div>
                <div class="item-title">${escapeHtml(g.title)}</div>
                <div class="task-meta-clean">
                  <span>${g.deadline ? `Prazo: ${MindsideUI.formatDateFriendly(g.deadline)}` : "Sem prazo definido"}</span>
                  ${nextStep ? `<span>· Próxima etapa: ${escapeHtml(nextStep.title)}</span>` : ""}
                </div>
              </div>
              <span class="time-badge">${g.progress || 0}%</span>
            </div>
            <div class="goal-progress-track" style="margin-top:8px; height:8px;">
              <div class="goal-progress-fill" style="width:${g.progress || 0}%;"></div>
            </div>
          </div>
        `;
      }).join("") : `
        <div class="empty-state-box">
          <img class="sticker-img sticker-sm" src="assets/stickers/slime-goal.svg" alt="">
          <div>Nenhum objetivo ativo no momento.</div>
          <a class="btn btn-sm" href="objetivos.html">+ Criar objetivo</a>
        </div>
      `}
    </section>
  `;

  const demoStripHtml = `
    <div class="demo-banner" style="margin-top:18px; margin-bottom:0;">
      <div>
        <strong style="font-size:.9rem;">Quer testar com uma rotina de exemplo?</strong>
        <div class="text-secondary" style="font-size:.82rem;">Carregue o cenário de demonstração SIC 2026 ou personalize suas janelas de horário (${slots.length} cadastrada(s)).</div>
      </div>
      <div class="demo-banner-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn btn-sm" id="seed-demo-btn">Carregar Cenário SIC</button>
        <a class="btn btn-sm btn-ghost" href="configuracoes.html">Preferências</a>
      </div>
    </div>
  `;

  if (isSimplified) {
    content.innerHTML = `
      ${heroHtml}
      ${routineOnboardingHtml}
      <div id="briefing-slot">${renderBriefingMarkup()}</div>
      ${conflictHtml}
      ${smartInboxHtml}
      <div style="display:flex; flex-direction:column; gap:18px;">
        ${tasksHtml}
        ${studyPlansHtml}
      </div>
      <details class="simplified-more-panel">
        <summary>Ver assistente de agenda, compromissos futuros, objetivos e demonstração</summary>
        <div class="simplified-more-body">
          ${nextActivityHtml}
          ${assistantCardHtml}
          <div class="grid-2">${apptsBlockHtml}${goalsBlockHtml}</div>
          ${demoStripHtml}
        </div>
      </details>
    `;
  } else {
    content.innerHTML = `
      ${heroHtml}
      ${routineOnboardingHtml}
      <div id="briefing-slot">${renderBriefingMarkup()}</div>
      ${conflictHtml}
      ${smartInboxHtml}
      ${nextActivityHtml}
      <div class="grid-2">
        <div>${tasksHtml}</div>
        <div>${assistantCardHtml}</div>
      </div>
      ${studyPlansHtml}
      <div class="grid-2" style="margin-top:18px;">
        <div>${apptsBlockHtml}</div>
        <div>${goalsBlockHtml}</div>
      </div>
      ${demoStripHtml}
    `;
  }

  bindDashboardEvents();
}

function bindDashboardEvents() {
  const content = document.getElementById("page-content");
  bindBriefingEvents(content);

  document.getElementById("open-routine-modal-btn")?.addEventListener("click", () => {
    MindsideUI.openRoutineModal(async () => { await loadDashboard(); });
  });
  document.getElementById("banner-routine-btn")?.addEventListener("click", () => {
    MindsideUI.openRoutineModal(async () => { await loadDashboard(); });
  });

  if (window.MindsideTimer) {
    MindsideTimer.bindTimerEvents(
      content,
      (id) => dashState.tasks.find((t) => String(t.id) === String(id)),
      null
    );
  }

  content.querySelectorAll("[data-dash-inbox-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      dashState.inboxMode = btn.getAttribute("data-dash-inbox-mode") || "task";
      renderDashboardContent();
      document.getElementById("dash-smart-inbox-input")?.focus();
    });
  });

  document.getElementById("dash-extract-notes-btn")?.addEventListener("click", () => {
    MindsideUI.openExtractNotesModal(async () => {
      await loadDashboard();
    });
  });

  const smartForm = document.getElementById("dash-smart-inbox-form");
  if (smartForm) {
    smartForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("dash-smart-inbox-input");
      const btn = document.getElementById("dash-smart-inbox-submit");
      const text = input.value.trim();
      if (!text || btn.disabled) return;

      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "O MindSide está organizando sua rotina...";

      try {
        if (dashState.inboxMode === "study") {
          await Api.createStudyPlan(text);
          toast("Plano de estudos criado com etapas progressivas!", "success");
        } else {
          const res = await Api.brainDump(text, true);
          const count = (res?.created_tasks || []).length;
          toast(
            `${count} ${count === 1 ? "tarefa identificada e organizada" : "tarefas identificadas e organizadas"} pelo MindSide!`,
            "success"
          );
        }
        input.value = "";
        await loadDashboard();
      } catch (err) {
        toast(err.message || "Não foi possível processar agora.", "error");
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  }

  MindsideUI.bindSubtaskEvents(
    content,
    (id) => dashState.tasks.find((t) => String(t.id) === String(id)),
    async () => { await loadDashboard(); }
  );

  MindsideUI.bindStudyPlanEvents(
    content,
    (id) => dashState.studyPlans.find((p) => String(p.id) === String(id)),
    async () => { await loadDashboard(); }
  );

  const aiForm = document.getElementById("dash-quick-ai-form");
  if (aiForm) {
    aiForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = document.getElementById("dash-quick-ai-input").value.trim();
      if (!q) {
        location.href = "assistente.html";
        return;
      }
      location.href = `assistente.html?q=${encodeURIComponent(q)}`;
    });
  }

  const seedBtn = document.getElementById("seed-demo-btn");
  if (seedBtn) {
    seedBtn.addEventListener("click", async () => {
      seedBtn.disabled = true;
      seedBtn.textContent = "Carregando...";
      try {
        await Api.seedDemo();
        toast("Cenário de demonstração SIC 2026 carregado!", "success");
        await loadDashboard();
      } catch (err) {
        toast(err.message || "Não foi possível carregar o cenário.", "error");
        seedBtn.disabled = false;
        seedBtn.textContent = "Carregar Cenário SIC";
      }
    });
  }

  content.querySelectorAll("[data-dash-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await Api.approveSuggestion(btn.dataset.dashApprove);
        toast("Sugestão aprovada e adicionada à sua rotina!", "success");
        await loadDashboard();
      } catch (err) {
        toast(err.message || "Erro ao aprovar sugestão.", "error");
        btn.disabled = false;
      }
    });
  });

  content.querySelectorAll("[data-dash-reject]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await Api.rejectSuggestion(btn.dataset.dashReject);
        toast("Sugestão rejeitada.", "info");
        await loadDashboard();
      } catch (err) {
        toast(err.message || "Erro ao rejeitar sugestão.", "error");
        btn.disabled = false;
      }
    });
  });
}
