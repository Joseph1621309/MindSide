/* Página de Objetivos — Metas pessoais com progresso visual e foco na próxima etapa. */

let allGoals = [];
let allTasks = [];
let goalsLoaded = false;
const goalBreakdownDrafts = new Map();

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("objetivos.html", "Objetivos");
  document.getElementById("goal-cancel-btn").addEventListener("click", closeGoalModal);
  document.getElementById("goal-form").addEventListener("submit", onSaveGoal);

  window.addEventListener("mindside:modechange", () => {
    renderGoalsLayout();
    if (goalsLoaded) {
      updateGoalSummary();
      renderGoals();
    }
  });

  renderGoalsLayout();
  await loadGoals();
});

function renderGoalsLayout() {
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;
  const content = document.getElementById("page-content");

  const summaryHtml = `
    <div class="summary-strip">
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Objetivos ativos</div>
          <div class="val" id="goal-sum-active">0</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Progresso médio</div>
          <div class="val" id="goal-sum-avg">0%</div>
        </div>
      </div>
      <div class="summary-pill-card">
        <div>
          <div class="lbl">Etapas vinculadas</div>
          <div class="val" id="goal-sum-tasks">0</div>
        </div>
      </div>
    </div>
  `;

  content.innerHTML = `
    ${!isSimplified ? summaryHtml : ""}

    <div class="list-card card">
      <div class="head">
        <div>
          <h3 class="mt-0">Seus objetivos</h3>
        </div>
        <button type="button" class="btn btn-primary" id="new-goal-btn">+ Novo objetivo</button>
      </div>
      <div id="goals-container"></div>
    </div>

    ${isSimplified ? `
      <details class="simplified-more-panel">
        <summary>Resumo geral dos objetivos</summary>
        <div class="simplified-more-body">
          ${summaryHtml}
        </div>
      </details>
    ` : ""}
  `;

  document.getElementById("new-goal-btn")?.addEventListener("click", () => openGoalModal());
}

async function loadGoals() {
  const container = document.getElementById("goals-container");
  if (container && !goalsLoaded) {
    container.innerHTML = `<div class="skeleton" style="height:110px;margin-bottom:12px;"></div>`.repeat(2);
  }
  try {
    [allGoals, allTasks] = await Promise.all([Api.listGoals(), Api.listTasks()]);
    goalsLoaded = true;
    updateGoalSummary();
    renderGoals();
  } catch (err) {
    toast(err.message || "Erro ao carregar objetivos.", "error");
  }
}

function updateGoalSummary() {
  const active = allGoals.filter((g) => g.status === "ativo");
  const avg = active.length
    ? Math.round(active.reduce((acc, g) => acc + (g.progress || 0), 0) / active.length)
    : 0;
  const linkedTasks = allTasks.filter((t) => Boolean(t.goal_id));

  const elActive = document.getElementById("goal-sum-active");
  const elAvg = document.getElementById("goal-sum-avg");
  const elTasks = document.getElementById("goal-sum-tasks");
  if (elActive) elActive.textContent = active.length;
  if (elAvg) elAvg.textContent = `${avg}%`;
  if (elTasks) elTasks.textContent = linkedTasks.length;
}

function pickNextStep(linkedTasks) {
  const pending = linkedTasks.filter((t) => t.status !== "concluida");
  if (!pending.length) return null;
  return [...pending].sort((a, b) => {
    const pa = MindsideUI.priorityMeta(a.priority).order;
    const pb = MindsideUI.priorityMeta(b.priority).order;
    if (pa !== pb) return pa - pb;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    return 0;
  })[0];
}

function renderGoals() {
  const container = document.getElementById("goals-container");
  if (!container) return;
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;

  if (!allGoals.length) {
    container.innerHTML = `
      <div class="empty-state-box">
        <img class="sticker-img" src="assets/stickers/slime-goal.svg" alt="Sem objetivos">
        <div>Nenhum objetivo cadastrado ainda. Crie um objetivo e acompanhe suas etapas!</div>
      </div>`;
    return;
  }

  container.innerHTML = allGoals.map((g) => {
    const linked = allTasks.filter((t) => t.goal_id === g.id);
    const doneCount = linked.filter((t) => t.status === "concluida").length;
    const nextStep = pickNextStep(linked);

    const nextStepHtml = nextStep
      ? `
        <div class="goal-next-step">
          <div style="min-width:0; flex:1;">
            <div class="goal-next-step-label">Próxima etapa</div>
            <div class="goal-next-step-title">${escapeHtml(nextStep.title)}</div>
            ${nextStep.deadline ? `<div class="text-dim" style="font-size:.76rem; margin-top:2px;">Prazo: ${MindsideUI.formatDateFriendly(nextStep.deadline)}</div>` : ""}
          </div>
          <button type="button" class="btn btn-sm btn-approve" data-toggle-task="${nextStep.id}" data-next-status="concluida">
            ✓ Concluir etapa
          </button>
        </div>`
      : `
        <div class="goal-next-step">
          <div style="min-width:0; flex:1;">
            <div class="goal-next-step-label">Próxima etapa</div>
            <div class="goal-next-step-title" style="color:var(--text-secondary);">
              ${linked.length ? "Todas as etapas vinculadas foram concluídas!" : "Nenhuma etapa vinculada ainda."}
            </div>
          </div>
        </div>`;

    const linkedTasksListHtml = linked.length
      ? `
        <div class="goal-linked-tasks" style="${isSimplified ? "margin-top:0; padding-top:0; border-top:none;" : ""}">
          ${!isSimplified ? `<div style="font-family:var(--font-mono); font-size:.7rem; color:var(--text-dim); margin-bottom:4px;">ETAPAS CONECTADAS A ESTE OBJETIVO (${doneCount}/${linked.length}):</div>` : ""}
          ${linked.map((t) => {
            const isDone = t.status === "concluida";
            const prio = MindsideUI.priorityMeta(t.priority);
            return `
              <div class="goal-task-chip">
                <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                  <span class="prio-pill ${prio.className}">${prio.icon} ${prio.label}</span>
                  <span style="${isDone ? "text-decoration:line-through; color:var(--text-dim);" : "font-weight:500;"}">
                    ${escapeHtml(t.title)}
                  </span>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                  <button type="button" class="btn btn-xs ${isDone ? "btn-ghost" : "btn-approve"}" data-toggle-task="${t.id}" data-next-status="${isDone ? "pendente" : "concluida"}">
                    ${isDone ? "↩ Reabrir" : "✓ Concluir"}
                  </button>
                </div>
              </div>`;
          }).join("")}
        </div>`
      : "";

    const quickLinkFormHtml = `
      <form class="quick-link-task-form" data-goal-id="${g.id}" style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <input type="text" class="input-control" name="quickTitle" placeholder="+ Adicionar nova etapa para este objetivo..." style="flex:1; min-width:200px; padding:8px 12px; font-size:.84rem;" required>
        <button type="submit" class="btn btn-sm">+ Adicionar etapa</button>
      </form>`;

    const detailsSectionHtml = isSimplified
      ? `
        <details class="simplified-more-panel" style="margin-top:12px;">
          <summary>Gerenciar todas as etapas (${linked.length})</summary>
          <div class="simplified-more-body">
            ${linkedTasksListHtml || `<div class="text-dim" style="font-size:.84rem;">Nenhuma etapa conectada ainda.</div>`}
            ${quickLinkFormHtml}
          </div>
        </details>`
      : `${linkedTasksListHtml}${quickLinkFormHtml}`;

    return `
      <div class="goal-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="item-title" style="font-size:1.06rem;">${escapeHtml(g.title)}</span>
              <span class="badge badge-${g.status === "concluido" ? "concluida" : (g.status === "ativo" ? "em_andamento" : "pendente")}">${escapeHtml(MindsideUI.statusLabel(g.status))}</span>
            </div>
            ${g.description ? `<div class="item-desc" style="margin-top:5px;">${escapeHtml(g.description)}</div>` : ""}
            <div class="task-meta-clean" style="margin-top:7px;">
              <span>${g.deadline ? "Prazo: " + MindsideUI.formatDateFriendly(g.deadline) : "Sem prazo fixo"}</span>
              <span>· ${linked.length ? `${doneCount} de ${linked.length} etapas concluídas` : "Progresso manual"}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="time-badge" style="font-size:.86rem;">
              ${g.progress || 0}% concluído
            </span>
            <button type="button" class="btn btn-sm btn-primary" data-breakdown-goal="${g.id}" title="Decompor meta em 3 a 5 tarefas práticas com IA">⚡ Destrinchar Meta com IA</button>
            <button type="button" class="btn btn-sm" data-edit="${g.id}">Editar</button>
            <button type="button" class="btn btn-sm btn-danger" data-del="${g.id}">Excluir</button>
          </div>
        </div>

        <div class="goal-progress-track" role="progressbar" aria-valuenow="${g.progress || 0}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso de ${escapeHtml(g.title)}">
          <div class="goal-progress-fill" style="width:${g.progress || 0}%;"></div>
        </div>

        <div id="goal-breakdown-slot-${g.id}">${renderGoalBreakdownPreview(g.id)}</div>
        ${nextStepHtml}
        ${detailsSectionHtml}
      </div>`;
  }).join("");

  container.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openGoalModal(allGoals.find((g) => g.id == btn.dataset.edit))));
  container.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => deleteGoal(btn.dataset.del)));
  container.querySelectorAll("[data-breakdown-goal]").forEach((btn) =>
    btn.addEventListener("click", () => onBreakdownGoal(btn.dataset.breakdownGoal, btn)));
  bindGoalBreakdownPreviewEvents(container);

  container.querySelectorAll("[data-toggle-task]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await Api.updateTask(btn.dataset.toggleTask, { status: btn.dataset.nextStatus });
        toast("Etapa atualizada e progresso recalculado!", "success");
        await loadGoals();
      } catch (err) {
        toast(err.message || "Erro ao atualizar etapa.", "error");
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll(".quick-link-task-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const goalId = parseInt(form.dataset.goalId, 10);
      const input = form.querySelector('input[name="quickTitle"]');
      const title = input.value.trim();
      if (!title) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        await Api.createTask({
          title,
          description: "",
          priority: "alta",
          category: "estudo",
          duration: 30,
          goal_id: goalId,
          status: "pendente",
        });
        toast("Etapa criada e vinculada ao objetivo!", "success");
        await loadGoals();
      } catch (err) {
        toast(err.message || "Erro ao criar etapa vinculada.", "error");
        btn.disabled = false;
      }
    });
  });
}

function openGoalModal(goal = null) {
  document.getElementById("goal-modal-title").textContent = goal ? "Editar objetivo" : "Novo objetivo";
  document.getElementById("goal-id").value = goal ? goal.id : "";
  document.getElementById("goal-title").value = goal ? goal.title : "";
  document.getElementById("goal-description").value = goal ? goal.description : "";
  document.getElementById("goal-deadline").value = goal && goal.deadline ? goal.deadline : "";
  document.getElementById("goal-progress").value = goal ? goal.progress : 0;
  document.getElementById("goal-status").value = goal ? goal.status : "ativo";
  document.getElementById("goal-modal-overlay").classList.add("open");
}

function closeGoalModal() {
  document.getElementById("goal-modal-overlay").classList.remove("open");
}

async function onSaveGoal(e) {
  e.preventDefault();
  const id = document.getElementById("goal-id").value;
  const payload = {
    title: document.getElementById("goal-title").value.trim(),
    description: document.getElementById("goal-description").value.trim(),
    deadline: document.getElementById("goal-deadline").value || null,
    progress: parseInt(document.getElementById("goal-progress").value, 10) || 0,
    status: document.getElementById("goal-status").value,
  };
  try {
    if (id) { await Api.updateGoal(id, payload); toast("Objetivo atualizado.", "success"); }
    else { await Api.createGoal(payload); toast("Objetivo criado.", "success"); }
    closeGoalModal();
    await loadGoals();
  } catch (err) {
    toast(err.message || "Erro ao salvar objetivo.", "error");
  }
}

function renderGoalBreakdownPreview(goalId) {
  const draft = goalBreakdownDrafts.get(String(goalId));
  if (!draft || !Array.isArray(draft.suggested_tasks) || !draft.suggested_tasks.length) return "";
  return `
    <div class="goal-breakdown-box">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <div>
          <strong style="font-size:.9rem;">Plano prático sugerido pela IA (${draft.suggested_tasks.length} tarefas)</strong>
          ${draft.estrategia_objetivo ? `<div class="text-secondary" style="font-size:.78rem;">${escapeHtml(draft.estrategia_objetivo)}</div>` : ""}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-approve" data-confirm-goal-breakdown="${goalId}">✓ Enviar todas para Tarefas</button>
          <button type="button" class="btn btn-sm btn-ghost" data-cancel-goal-breakdown="${goalId}">Fechar</button>
        </div>
      </div>
      <div class="subtasks-checklist" style="margin-top:4px;">
        ${draft.suggested_tasks.map((st, idx) => `
          <div class="subtask-item">
            <label>
              <input type="checkbox" data-goal-draft-check="${goalId}" data-draft-idx="${idx}" checked>
              <span>${escapeHtml(st.titulo || st.title || "")}</span>
            </label>
            <span class="subtask-dur">${st.duracao_min || 35} min · ${escapeHtml(st.prioridade || "Média")}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function bindGoalBreakdownPreviewEvents(scope) {
  if (!scope) return;
  scope.querySelectorAll("[data-cancel-goal-breakdown]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gid = btn.getAttribute("data-cancel-goal-breakdown");
      goalBreakdownDrafts.delete(String(gid));
      const slot = document.getElementById(`goal-breakdown-slot-${gid}`);
      if (slot) slot.innerHTML = "";
    });
  });

  scope.querySelectorAll("[data-confirm-goal-breakdown]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const gid = btn.getAttribute("data-confirm-goal-breakdown");
      const draft = goalBreakdownDrafts.get(String(gid));
      if (!draft) return;
      const selected = [];
      scope.querySelectorAll(`[data-goal-draft-check="${gid}"]`).forEach((cb) => {
        if (cb.checked) {
          const idx = parseInt(cb.getAttribute("data-draft-idx"), 10);
          if (draft.suggested_tasks[idx]) selected.push(draft.suggested_tasks[idx]);
        }
      });
      if (!selected.length) {
        toast("Selecione ao menos uma tarefa para enviar.", "info");
        return;
      }
      btn.disabled = true;
      btn.textContent = "Criando tarefas...";
      try {
        const res = await Api.breakdownGoal(gid, { auto_create: true, selected_tasks: selected });
        goalBreakdownDrafts.delete(String(gid));
        const createdCount = (res?.created_tasks || []).length;
        toast(`${createdCount} tarefa(s) prática(s) criada(s) e conectada(s) ao objetivo!`, "success");
        await loadGoals();
      } catch (err) {
        toast(err.message || "Erro ao criar tarefas do objetivo.", "error");
        btn.disabled = false;
        btn.textContent = "✓ Enviar todas para Tarefas";
      }
    });
  });
}

async function onBreakdownGoal(goalId, btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Analisando objetivo...";
  try {
    const res = await Api.breakdownGoal(goalId, { auto_create: false });
    goalBreakdownDrafts.set(String(goalId), res);
    const slot = document.getElementById(`goal-breakdown-slot-${goalId}`);
    if (slot) {
      slot.innerHTML = renderGoalBreakdownPreview(goalId);
      bindGoalBreakdownPreviewEvents(slot);
    }
    toast(`${(res?.suggested_tasks || []).length} tarefas práticas sugeridas para o objetivo!`, "success");
  } catch (err) {
    toast(err.message || "Não foi possível destrinchar este objetivo.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function deleteGoal(id) {
  const target = allGoals.find((g) => String(g.id) === String(id));
  const confirmed = await MindsideUI.confirmModal({
    title: "Excluir objetivo",
    message: `Tem certeza que deseja excluir o objetivo "${target?.title || "selecionado"}"?`,
    confirmText: "Excluir",
  });
  if (!confirmed) return;
  try {
    await Api.deleteGoal(id);
    toast("Objetivo excluído.", "success");
    await loadGoals();
  } catch (err) {
    toast(err.message || "Erro ao excluir objetivo.", "error");
  }
}
