/* Página de Tarefas — Caixa de Entrada Inteligente (Brain Dump),
   Destrinchar com IA, Extrator de Anotações e Arquiteto de Estudos. */

let allTasks = [];
let allGoals = [];
let allStudyPlans = [];
let currentFilter = "todas";
let currentPriorityFilter = "todas";
let searchQuery = "";
let inboxMode = "task"; // "task" | "study"
let tasksLoaded = false;

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("tarefas.html", "Tarefas");
  document.getElementById("task-cancel-btn")?.addEventListener("click", closeTaskModal);
  document.getElementById("task-form")?.addEventListener("submit", onSaveTask);

  window.addEventListener("mindside:modechange", () => {
    renderTasksLayout();
    if (tasksLoaded) {
      updateSummaryStrip();
      renderTasks();
      renderStudyPlansSection();
    }
  });

  // Hidratação imediata de cache local para F5 instantâneo
  const cachedTasks = Api.getCachedTasks();
  const cachedPlans = Api.getCachedStudyPlans();
  if (cachedTasks.length) allTasks = cachedTasks;
  if (cachedPlans.length) allStudyPlans = cachedPlans;

  renderTasksLayout();
  await loadTasks();
});

function renderTasksLayout() {
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;
  const content = document.getElementById("page-content");
  const isStudy = inboxMode === "study";

  const summaryHtml = `
    <div class="summary-strip" id="task-summary-strip">
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Pendentes</div>
          <div class="val" id="sum-active">0</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Concluídas</div>
          <div class="val" id="sum-done">0</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Tempo estimado</div>
          <div class="val" id="sum-focus-time">0 min</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Conectadas a objetivos</div>
          <div class="val" id="sum-linked">0</div>
        </div>
      </div>
    </div>
  `;

  const searchAndPriorityHtml = `
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; flex:1; justify-content:flex-end;">
      <select id="priority-filter-select" class="input-control" style="width:auto; flex:1 1 170px; max-width:220px; padding:7px 32px 7px 11px; font-size:.82rem;" aria-label="Filtrar por prioridade">
        <option value="todas" ${currentPriorityFilter === "todas" ? "selected" : ""}>Todas as prioridades</option>
        <option value="urgente" ${currentPriorityFilter === "urgente" ? "selected" : ""}>Prioridade: Urgente</option>
        <option value="alta" ${currentPriorityFilter === "alta" ? "selected" : ""}>Prioridade: Alta</option>
        <option value="media" ${currentPriorityFilter === "media" ? "selected" : ""}>Prioridade: Média</option>
        <option value="baixa" ${currentPriorityFilter === "baixa" ? "selected" : ""}>Prioridade: Baixa</option>
      </select>
      <div class="search-box">
        <span class="search-icon"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="14.5" cy="9.5" r="6"/><path d="M10.2 13.8 3.5 20.5"/></svg></span>
        <input type="text" id="task-search" value="${escapeHtml(searchQuery)}" placeholder="Buscar tarefa..." aria-label="Buscar tarefas">
      </div>
    </div>
  `;

  const filterChips = isSimplified
    ? `
      <button class="filter-chip ${currentFilter === "pendente" ? "active" : ""}" data-filter="pendente">Pendentes</button>
      <button class="filter-chip ${currentFilter === "concluida" ? "active" : ""}" data-filter="concluida">Concluídas</button>
      <button class="filter-chip ${currentFilter === "todas" ? "active" : ""}" data-filter="todas">Todas</button>
    `
    : `
      <button class="filter-chip ${currentFilter === "todas" ? "active" : ""}" data-filter="todas">Todas</button>
      <button class="filter-chip ${currentFilter === "pendente" ? "active" : ""}" data-filter="pendente">Pendentes</button>
      <button class="filter-chip ${currentFilter === "em_andamento" ? "active" : ""}" data-filter="em_andamento">Em andamento</button>
      <button class="filter-chip ${currentFilter === "concluida" ? "active" : ""}" data-filter="concluida">Concluídas</button>
    `;

  content.innerHTML = `
    ${!isSimplified ? summaryHtml : ""}

    <section class="smart-inbox-card" aria-label="Caixa de Entrada Inteligente">
      <div class="smart-inbox-top">
        <div>
          <h3 class="mt-0" style="margin-bottom:2px;">Caixa de Entrada Inteligente</h3>
          <p class="smart-inbox-hint">
            ${isStudy
              ? "Informe o tema e o tempo disponível (ex.: “Aprender SQL para prova em 5 dias, 1h por dia”) para gerar etapas progressivas."
              : "Digite livremente (ex.: “Tenho prova de banco de dados sexta às 14h e terminar relatório amanhã cedo”) — a IA extrai os cards automaticamente."}
          </p>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div class="smart-inbox-modes" role="tablist" aria-label="Modo da caixa de entrada">
            <button type="button" class="smart-mode-btn ${!isStudy ? "active" : ""}" data-inbox-mode="task" role="tab" aria-selected="${!isStudy}">
              Nova Tarefa
            </button>
            <button type="button" class="smart-mode-btn ${isStudy ? "active" : ""}" data-inbox-mode="study" role="tab" aria-selected="${isStudy}">
              Criar Plano de Estudos
            </button>
          </div>
          <button type="button" class="btn btn-sm" id="extract-notes-open-btn">📄 Extrair de Anotação</button>
        </div>
      </div>

      <form class="smart-inbox-form" id="quick-task-form" aria-label="Entrada inteligente">
        <div class="smart-inbox-row">
          <input
            type="text"
            id="quick-task-title"
            class="input-control"
            placeholder="${isStudy ? "Ex.: Joins e subqueries em SQL em 5 dias, 1h por dia..." : "Ex.: Tenho prova de banco de dados sexta às 14h, terminar relatório amanhã cedo e comprar café hoje..."}"
            maxlength="3000"
            aria-label="Descreva suas tarefas livres ou plano de estudos"
            required
          >
          <button type="submit" class="btn btn-primary" id="quick-task-submit">
            ${isStudy ? "✨ Gerar Plano de Estudos" : "✨ Adicionar e Organizar"}
          </button>
        </div>
      </form>
    </section>

    <div class="list-card card">
      <div class="head">
        <div>
          <h3 class="mt-0">Suas atividades</h3>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-sm btn-ghost complete-only" href="assistente.html">Validar agenda com IA</a>
          <button type="button" class="btn btn-sm" id="new-task-btn">+ Nova tarefa completa</button>
        </div>
      </div>

      <div class="toolbar-row">
        <div class="filter-bar" id="task-filters">
          ${filterChips}
        </div>
        ${!isSimplified ? searchAndPriorityHtml : ""}
      </div>

      <div id="tasks-container"></div>
    </div>

    <div id="study-plans-container"></div>

    ${isSimplified ? `
      <details class="simplified-more-panel">
        <summary>Resumo, busca e filtro por prioridade</summary>
        <div class="simplified-more-body">
          ${searchAndPriorityHtml}
          ${summaryHtml}
        </div>
      </details>
    ` : ""}
  `;

  bindTasksLayoutEvents();
}

function bindTasksLayoutEvents() {
  document.getElementById("new-task-btn")?.addEventListener("click", () => openTaskModal());

  document.querySelectorAll("[data-inbox-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      inboxMode = btn.getAttribute("data-inbox-mode") || "task";
      renderTasksLayout();
      if (tasksLoaded) {
        updateSummaryStrip();
        renderTasks();
        renderStudyPlansSection();
      }
      document.getElementById("quick-task-title")?.focus();
    });
  });

  document.getElementById("extract-notes-open-btn")?.addEventListener("click", () => {
    MindsideUI.openExtractNotesModal(async () => {
      await loadTasks();
    });
  });

  const quickForm = document.getElementById("quick-task-form");
  if (quickForm) {
    quickForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("quick-task-title");
      const text = titleInput.value.trim();
      const submitBtn = document.getElementById("quick-task-submit");
      if (!text || submitBtn.disabled) return;

      const origText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "O MindSide está organizando sua rotina...";

      try {
        if (inboxMode === "study") {
          await Api.createStudyPlan(text);
          titleInput.value = "";
          toast("Plano de estudos gerado com etapas progressivas!", "success");
          await loadTasks();
          document.getElementById("study-plans-container")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          const res = await Api.brainDump(text, true);
          const count = (res?.created_tasks || []).length;
          toast(
            `${count} ${count === 1 ? "tarefa identificada e organizada" : "tarefas identificadas e organizadas"} pelo MindSide!`,
            "success"
          );
          titleInput.value = "";
          await loadTasks();
        }
        titleInput.focus();
      } catch (err) {
        toast(err.message || "Erro ao organizar entrada inteligente.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    });
  }

  document.querySelectorAll("#task-filters [data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#task-filters [data-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  document.getElementById("priority-filter-select")?.addEventListener("change", (e) => {
    currentPriorityFilter = e.target.value;
    renderTasks();
  });

  document.getElementById("task-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTasks();
  });
}

async function loadTasks() {
  const container = document.getElementById("tasks-container");
  if (container && !tasksLoaded && !allTasks.length) {
    container.innerHTML = `<div class="skeleton" style="height:64px;margin-bottom:8px;"></div>`.repeat(3);
  }
  try {
    [allTasks, allGoals, allStudyPlans] = await Promise.all([
      Api.listTasks(),
      Api.listGoals(),
      Api.listStudyPlans(),
    ]);
    tasksLoaded = true;
    populateGoalSelect();
    updateSummaryStrip();
    renderTasks();
    renderStudyPlansSection();
  } catch (err) {
    toast(err.message || "Erro ao carregar tarefas.", "error");
  }
}

function updateSummaryStrip() {
  const active = allTasks.filter((t) => t.status !== "concluida");
  const done = allTasks.filter((t) => t.status === "concluida");
  const focusMin = active.reduce((acc, t) => acc + (t.duration || 30), 0);
  const linked = allTasks.filter((t) => Boolean(t.goal_id));

  const elActive = document.getElementById("sum-active");
  const elDone = document.getElementById("sum-done");
  const elFocus = document.getElementById("sum-focus-time");
  const elLinked = document.getElementById("sum-linked");

  if (elActive) elActive.textContent = active.length;
  if (elDone) elDone.textContent = done.length;
  if (elFocus) {
    elFocus.textContent = focusMin >= 60
      ? `${Math.floor(focusMin / 60)}h ${focusMin % 60}m`
      : `${focusMin} min`;
  }
  if (elLinked) elLinked.textContent = linked.length;
}

function populateGoalSelect() {
  const sel = document.getElementById("task-goal-id");
  if (!sel) return;
  sel.innerHTML = `<option value="">Sem vínculo com objetivo</option>` +
    allGoals.map((g) => `<option value="${g.id}">${escapeHtml(g.title)} (${g.progress}%)</option>`).join("");
}

function renderStudyPlansSection() {
  const container = document.getElementById("study-plans-container");
  if (!container) return;
  if (!allStudyPlans.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = allStudyPlans.map((plan) => MindsideUI.renderStudyPlanCard(plan)).join("");
  MindsideUI.bindStudyPlanEvents(
    container,
    (id) => allStudyPlans.find((p) => String(p.id) === String(id)),
    async () => { await loadTasks(); }
  );
}

function renderTasks() {
  const container = document.getElementById("tasks-container");
  if (!container) return;
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;

  const filtered = allTasks.filter((t) => {
    if (currentFilter === "pendente" && t.status === "concluida") return false;
    if (currentFilter !== "todas" && currentFilter !== "pendente" && t.status !== currentFilter) return false;
    if (currentPriorityFilter !== "todas" && t.priority !== currentPriorityFilter) return false;
    if (searchQuery) {
      const hay = `${t.title || ""} ${t.description || ""} ${t.category || ""}`.toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    const emptyMsg = allTasks.length === 0
      ? "Nenhuma tarefa cadastrada ainda. Use a Caixa de Entrada Inteligente acima para criar sua primeira tarefa."
      : "Nenhuma tarefa encontrada neste filtro.";
    container.innerHTML = `
      <div class="empty-state-box">
        <img class="sticker-img" src="assets/stickers/slime-focus.svg" alt="Sem tarefas">
        <div>${emptyMsg}</div>
      </div>`;
    return;
  }

  const statusOrder = { em_andamento: 0, pendente: 1, concluida: 2 };
  const sorted = [...filtered].sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    const pa = MindsideUI.priorityMeta(a.priority).order;
    const pb = MindsideUI.priorityMeta(b.priority).order;
    if (pa !== pb) return pa - pb;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    return 0;
  });

  const goalMap = Object.fromEntries(allGoals.map((g) => [g.id, g.title]));
  const today = localTodayIso();

  container.innerHTML = sorted.map((t) => {
    const isDone = t.status === "concluida";
    const prio = MindsideUI.priorityMeta(t.priority);
    const isOverdue = !isDone && t.deadline && t.deadline < today;
    const goalTitle = t.goal_id && goalMap[t.goal_id] ? escapeHtml(goalMap[t.goal_id]) : "";
    const deadlineText = t.deadline
      ? (isOverdue ? `Prazo vencido (${MindsideUI.formatDateFriendly(t.deadline)})` : `Prazo: ${MindsideUI.formatDateFriendly(t.deadline)}`)
      : "Sem prazo";

    return `
      <div class="task-card-row ${isDone ? "is-done" : ""}">
        <div class="task-card-main">
          <button
            type="button"
            class="task-check-btn ${isDone ? "checked" : ""}"
            ${isDone ? `data-reopen="${t.id}" aria-label="Reabrir tarefa ${escapeHtml(t.title)}" title="Reabrir tarefa"` : `data-done="${t.id}" aria-label="Concluir tarefa ${escapeHtml(t.title)}" title="Concluir tarefa"`}
          >${isDone ? "✓" : ""}</button>
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="task-title-text">${escapeHtml(t.title)}</span>
              ${goalTitle ? `<span class="badge badge-em_andamento">🎯 Meta: ${goalTitle}</span>` : ""}
              ${!isSimplified && t.status === "em_andamento" ? `<span class="badge badge-em_andamento">Em andamento</span>` : ""}
              ${isOverdue ? `<span class="badge badge-urgente">Atrasada</span>` : ""}
            </div>
            ${!isSimplified && t.description ? `<div class="item-desc">${escapeHtml(t.description)}</div>` : ""}
            <div class="task-meta-clean">
              <span class="prio-pill ${prio.className}">${prio.icon} ${prio.label}</span>
              <span>${deadlineText}</span>
              <span>· ${isDone ? "Concluída" : (t.status === "em_andamento" ? "Em andamento" : "Pendente")}</span>
              ${!isSimplified ? `<span>· ${MindsideUI.categoryLabel(t.category)} · ${t.duration || 30} min</span>` : ""}
              ${!isSimplified && t.scheduled_date ? `<span>· Agendada: ${MindsideUI.formatDateFriendly(t.scheduled_date)}${t.scheduled_time ? " às " + t.scheduled_time.slice(0, 5) : ""}</span>` : ""}
            </div>
            ${MindsideUI.renderSubtasksChecklist(t)}
          </div>
        </div>
        <div class="item-actions">
          ${window.MindsideTimer ? MindsideTimer.renderTaskTimerControl(t, "btn-sm") : ""}
          ${MindsideUI.renderTaskBreakdownAction(t, "btn-sm")}
          <button type="button" class="btn btn-sm" data-edit="${t.id}">Editar</button>
          <button type="button" class="btn btn-sm btn-danger" data-del="${t.id}">Excluir</button>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll("[data-done]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const taskObj = allTasks.find((t) => String(t.id) === String(btn.dataset.done));
        const totalSec = window.MindsideTimer
          ? await MindsideTimer.finalizeTaskTimer(btn.dataset.done, taskObj?.time_spent_seconds || 0)
          : (taskObj?.time_spent_seconds || 0);
        await Api.updateTask(btn.dataset.done, { status: "concluida", time_spent_seconds: totalSec });
        toast(totalSec > 0 ? `Tarefa concluída em ${MindsideTimer.formatHuman(totalSec)}!` : "Tarefa concluída!", "success");
        await loadTasks();
      } catch (err) {
        toast(err.message || "Erro ao concluir tarefa.", "error");
        btn.disabled = false;
      }
    }));

  container.querySelectorAll("[data-reopen]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await Api.updateTask(btn.dataset.reopen, { status: "pendente" });
        toast("Tarefa reaberta.", "info");
        await loadTasks();
      } catch (err) {
        toast(err.message || "Erro ao reabrir tarefa.", "error");
        btn.disabled = false;
      }
    }));

  if (window.MindsideTimer) {
    MindsideTimer.bindTimerEvents(
      container,
      (id) => allTasks.find((t) => String(t.id) === String(id)),
      null
    );
  }

  MindsideUI.bindSubtaskEvents(
    container,
    (id) => allTasks.find((t) => String(t.id) === String(id)),
    async () => { await loadTasks(); }
  );

  container.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openTaskModal(allTasks.find((t) => t.id == btn.dataset.edit))));
  container.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => deleteTask(btn.dataset.del)));
}

function openTaskModal(task = null) {
  const warnBox = document.getElementById("task-conflict-warning");
  if (warnBox) warnBox.style.display = "none";
  document.getElementById("task-modal-title").textContent = task ? "Editar tarefa" : "Nova tarefa";
  document.getElementById("task-id").value = task ? task.id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-description").value = task ? task.description : "";
  document.getElementById("task-priority").value = task ? task.priority : "media";
  document.getElementById("task-category").value = task ? task.category : "geral";
  document.getElementById("task-deadline").value = task && task.deadline ? task.deadline : "";
  document.getElementById("task-duration").value = task ? task.duration : 30;
  document.getElementById("task-scheduled-date").value = task && task.scheduled_date ? task.scheduled_date : "";
  document.getElementById("task-scheduled-time").value = task && task.scheduled_time ? task.scheduled_time.slice(0, 5) : "";
  document.getElementById("task-goal-id").value = task && task.goal_id ? task.goal_id : "";
  document.getElementById("task-status").value = task ? task.status : "pendente";
  document.getElementById("task-modal-overlay").classList.add("open");
}

function closeTaskModal() {
  document.getElementById("task-modal-overlay").classList.remove("open");
}

async function onSaveTask(e) {
  e.preventDefault();
  const id = document.getElementById("task-id").value;
  const warnBox = document.getElementById("task-conflict-warning");
  if (warnBox) warnBox.style.display = "none";
  const goalVal = document.getElementById("task-goal-id").value;
  const payload = {
    title: document.getElementById("task-title").value.trim(),
    description: document.getElementById("task-description").value.trim(),
    priority: document.getElementById("task-priority").value,
    category: document.getElementById("task-category").value,
    deadline: document.getElementById("task-deadline").value || null,
    duration: parseInt(document.getElementById("task-duration").value, 10) || 30,
    scheduled_date: document.getElementById("task-scheduled-date").value || null,
    scheduled_time: document.getElementById("task-scheduled-time").value || null,
    goal_id: goalVal ? parseInt(goalVal, 10) : null,
    status: document.getElementById("task-status").value,
  };
  try {
    if (id) { await Api.updateTask(id, payload); toast("Tarefa atualizada.", "success"); }
    else { await Api.createTask(payload); toast("Tarefa criada.", "success"); }
    closeTaskModal();
    await loadTasks();
  } catch (err) {
    if (err.status === 409 && warnBox) {
      const conflicts = (err.raw && err.raw.detail && err.raw.detail.conflicts) || [];
      warnBox.textContent = "Conflito de horário com: " + conflicts.map((c) => `${c.title} (${c.start_time}–${c.end_time})`).join(", ");
      warnBox.style.display = "block";
    } else {
      toast(err.message || "Erro ao salvar tarefa.", "error");
    }
  }
}

async function deleteTask(id) {
  const target = allTasks.find((t) => String(t.id) === String(id));
  const confirmed = await MindsideUI.confirmModal({
    title: "Excluir tarefa",
    message: `Tem certeza que deseja excluir "${target?.title || "esta tarefa"}"? Esta ação não pode ser desfeita.`,
    confirmText: "Excluir",
  });
  if (!confirmed) return;
  try {
    await Api.deleteTask(id);
    toast("Tarefa excluída.", "success");
    await loadTasks();
  } catch (err) {
    toast(err.message || "Erro ao excluir tarefa.", "error");
  }
}
