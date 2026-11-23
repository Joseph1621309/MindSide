/* Assistente Inteligente — Conversão acolhedora de linguagem natural em sugestões
   com validação determinística em Python e aprovação explícita obrigatória. */

let mainSlime = null;

const EXAMPLE_PROMPTS = [
  "Tenho três trabalhos para entregar esta semana.",
  "Preciso organizar minha rotina de estudos.",
  "Tenho uma consulta amanhã e uma prova na sexta.",
  "Estou com muitas tarefas acumuladas.",
];

function setPipelineStep(activeStep) {
  document.querySelectorAll(".pipeline-step").forEach((el, idx) => {
    el.classList.toggle("active", idx + 1 <= activeStep);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("assistente.html", "Assistente MindSide");

  const content = document.getElementById("page-content");
  content.innerHTML = `
    <section class="assistant-hero-box" aria-label="Boas-vindas do Assistente">
      <div style="display:flex; align-items:center; gap:14px; min-width:0; flex:1;">
        <div style="width:52px; height:42px; flex-shrink:0;" data-slime id="main-assistant-slime"></div>
        <div style="min-width:0;">
          <h2>O que está ocupando sua cabeça hoje?</h2>
          <p>Conte o que você precisa fazer. Vamos organizar tudo juntos — você aprova cada item antes de salvar.</p>
        </div>
      </div>
    </section>

    <div class="assistant-pipeline complete-only" aria-label="Etapas do fluxo de decisão assistida">
      <div class="pipeline-step active" id="pipe-step-1">
        <span class="step-num">1</span>
        <div><div class="step-title">Você Descreve</div></div>
      </div>
      <div class="pipeline-step" id="pipe-step-2">
        <span class="step-num">2</span>
        <div><div class="step-title">IA Estrutura</div></div>
      </div>
      <div class="pipeline-step" id="pipe-step-3">
        <span class="step-num">3</span>
        <div><div class="step-title">Sistema Valida</div></div>
      </div>
      <div class="pipeline-step" id="pipe-step-4">
        <span class="step-num">4</span>
        <div><div class="step-title">Você Decide</div></div>
      </div>
    </div>

    <div class="chat-wrap">
      <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
        <button type="button" class="btn btn-xs btn-ghost" id="chat-reset-btn" style="display:none;" title="Limpar conversa e restaurar sugestões rápidas">↺ Nova conversa</button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="msg ai">
          <div style="font-weight:600; font-size:.94rem; margin-bottom:4px;">
            Estou pronto para ajudar.
          </div>
          <div class="text-secondary" style="font-size:.86rem;">
            Escreva livremente sobre suas tarefas, aulas, consultas ou prazos. Eu separo em propostas organizadas, aviso se houver choque de horários e aguardo sua aprovação.
          </div>
        </div>
      </div>

      <div class="example-prompts-grid" id="example-prompts-grid" aria-label="Exemplos de mensagens para começar">
        ${EXAMPLE_PROMPTS.map((text, idx) => `
          <button type="button" class="example-prompt-btn" data-prompt-idx="${idx}">
            “${escapeHtml(text)}”
          </button>
        `).join("")}
      </div>

      <form class="chat-input-bar" id="chat-form">
        <input
          type="text"
          id="chat-input"
          aria-label="Conte o que você precisa organizar"
          placeholder="Ex.: Tenho uma consulta amanhã às 14h e preciso estudar para a prova de sexta..."
          autocomplete="off"
          maxlength="5000"
          required
        >
        <button type="submit" class="btn btn-primary" id="chat-submit-btn">Organizar →</button>
      </form>
    </div>

    <details class="simplified-more-panel" id="assistant-details-panel">
      <summary>Como o Assistente funciona e como protege sua agenda</summary>
      <div class="simplified-more-body">
        <p class="text-secondary" style="margin:0; font-size:.85rem; line-height:1.55;">
          1. Você descreve seus compromissos e tarefas em linguagem natural.<br>
          2. A inteligência artificial sugere uma organização estruturada em tarefas, compromissos ou metas.<br>
          3. Nosso servidor verifica conflitos de horário com sua agenda atual.<br>
          4. Nada é criado ou alterado automaticamente — você revisa e escolhe aprovar, editar ou rejeitar cada item.
        </p>
      </div>
    </details>
  `;

  document.getElementById("chat-form").addEventListener("submit", onSend);
  document.getElementById("edit-sugg-cancel").addEventListener("click", () =>
    document.getElementById("edit-sugg-overlay").classList.remove("open"));
  document.getElementById("edit-sugg-form").addEventListener("submit", onSaveEdit);

  const hideExamplePrompts = () => {
    const grid = document.getElementById("example-prompts-grid");
    if (grid) grid.style.display = "none";
    const resetBtn = document.getElementById("chat-reset-btn");
    if (resetBtn) resetBtn.style.display = "inline-flex";
  };

  const showExamplePrompts = () => {
    const grid = document.getElementById("example-prompts-grid");
    if (grid) grid.style.display = "";
    const resetBtn = document.getElementById("chat-reset-btn");
    if (resetBtn) resetBtn.style.display = "none";
  };

  document.getElementById("chat-reset-btn")?.addEventListener("click", () => {
    const msgs = document.getElementById("chat-messages");
    if (msgs) {
      msgs.innerHTML = `
        <div class="msg ai">
          <div style="font-weight:600; font-size:.94rem; margin-bottom:4px;">
            Estou pronto para ajudar.
          </div>
          <div class="text-secondary" style="font-size:.86rem;">
            Escreva livremente sobre suas tarefas, aulas, consultas ou prazos. Eu separo em propostas organizadas, aviso se houver choque de horários e aguardo sua aprovação.
          </div>
        </div>
      `;
    }
    showExamplePrompts();
    setPipelineStep(1);
    document.getElementById("chat-input")?.focus();
  });

  document.querySelectorAll("[data-prompt-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.promptIdx, 10);
      const input = document.getElementById("chat-input");
      input.value = EXAMPLE_PROMPTS[idx] || "";
      hideExamplePrompts();
      input.focus();
      setPipelineStep(1);
    });
  });

  const assistantSlimeBox = document.getElementById("main-assistant-slime");
  if (assistantSlimeBox) mainSlime = new Slime(assistantSlimeBox);

  await loadExistingPendingSuggestions();

  // Se veio do campo rápido da Visão Geral (?q=...), preenche e envia automaticamente
  const params = new URLSearchParams(window.location.search);
  const initialQ = params.get("q");
  if (initialQ && initialQ.trim()) {
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
    const input = document.getElementById("chat-input");
    input.value = initialQ.trim();
    document.getElementById("chat-form").dispatchEvent(new Event("submit", { cancelable: true }));
  }
});

async function loadExistingPendingSuggestions() {
  try {
    const list = await Api.listSuggestions();
    const pending = list.filter((s) => s.status === "pending" || s.status === "edited");
    if (!pending.length) return;

    setPipelineStep(4);
    let html = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
        <strong>Sugestões aguardando sua decisão (${pending.length}):</strong>
        <span class="badge badge-em_andamento">Aguardando aprovação</span>
      </div>`;
    pending.forEach((s) => {
      let data = {};
      try { data = JSON.parse(s.structured_data || "{}"); } catch { /* ignora */ }
      html += renderSuggestionCard(s.id, data);
    });
    const msgEl = addMessage(html, "ai");
    bindSuggestionButtons(msgEl);
  } catch {
    // carga silenciosa
  }
}

function addMessage(html, cls) {
  const wrap = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.innerHTML = html;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

async function onSend(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const submitButton = document.getElementById("chat-submit-btn");
  const text = input.value.trim();
  if (!text) return;

  const promptsGrid = document.getElementById("example-prompts-grid");
  if (promptsGrid) promptsGrid.style.display = "none";
  const resetBtn = document.getElementById("chat-reset-btn");
  if (resetBtn) resetBtn.style.display = "inline-flex";

  submitButton.disabled = true;
  submitButton.textContent = "Organizando...";
  addMessage(escapeHtml(text), "user");
  input.value = "";
  if (mainSlime) mainSlime.processing();
  setPipelineStep(3);

  const thinkingMsg = addMessage(`
    <div style="display:flex; align-items:center; gap:10px;">
      <div class="skeleton" style="width:18px; height:18px; border-radius:50%;"></div>
      <span class="text-secondary" style="font-size:.86rem;">
        Organizando suas ideias e verificando conflitos na agenda...
      </span>
    </div>`, "ai");

  try {
    const result = await Api.analyze(text);
    thinkingMsg.remove();
    if (mainSlime) mainSlime.respond();
    setPipelineStep(4);

    if (!result || !Array.isArray(result.suggestions) || result.suggestions.length === 0) {
      addMessage(`
        <div style="display:flex; align-items:center; gap:10px;">
          <img class="sticker-img sticker-sm" src="assets/stickers/slime-empty.svg" alt="Sem sugestões">
          <div>Não identifiquei atividades específicas nessa mensagem. Tente contar quais tarefas ou horários você quer organizar.</div>
        </div>`, "ai");
      return;
    }

    let html = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
        <strong>${escapeHtml(result.reasoning_summary || "Organizei estas sugestões para você revisar:")}</strong>
        <span class="badge badge-concluida">${result.suggestions.length} sugestão(ões)</span>
      </div>`;
    result.suggestions.forEach((s) => {
      html += renderSuggestionCard(s.id, s.structured_data, s.validation);
    });
    const msgEl = addMessage(html, "ai");
    bindSuggestionButtons(msgEl);
  } catch (err) {
    thinkingMsg.remove();
    if (mainSlime) mainSlime.errorState();
    addMessage(`
      <div style="display:flex; align-items:center; gap:10px; color:var(--danger);">
        <img class="sticker-img sticker-sm" src="assets/stickers/slime-conflict.svg" alt="Erro">
        <div>
          <strong>Não foi possível analisar agora:</strong> ${escapeHtml(err.message || "Tente novamente em instantes.")}
        </div>
      </div>`, "ai");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Organizar →";
    input.focus();
  }
}

function resolveSuggestionGoalTitle(data) {
  if (data?.goal_title) return data.goal_title;
  if (!data?.goal_id || typeof Api?.getCachedGoals !== "function") return null;
  const found = Api.getCachedGoals().find((g) => String(g.id) === String(data.goal_id));
  return found ? found.title : null;
}

function renderSuggestionSubtasksPreview(id, data) {
  const subs = Array.isArray(data?.subtasks) ? data.subtasks : [];
  if (!subs.length) return "";
  return `
    <div class="subtasks-checklist" id="sugg-steps-${id}">
      <div class="subtasks-header">
        <span>Micro-etapas sugeridas (${subs.length})</span>
      </div>
      ${subs.map((st) => `
        <div class="subtask-item">
          <span style="flex:1; min-width:0; color:var(--text);">• ${escapeHtml(st.title || st.titulo || "")}</span>
          <span class="subtask-dur">${st.duration_min || st.tempo_estimado_min || 20} min</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSuggestionCard(id, data, validation = null) {
  const conflicts = data.conflicts || [];
  const hasConflict = conflicts.length > 0;
  const prio = MindsideUI.priorityMeta(data.priority || "media");
  const typeLabel = data.type === "compromisso" ? "Compromisso" : (data.type === "objetivo" ? "Objetivo" : "Tarefa");
  const dateLabel = data.date ? MindsideUI.formatDateFriendly(data.date) : "Sem data fixa";
  const goalTitle = resolveSuggestionGoalTitle(data);
  const willBecomeTask = data.type !== "compromisso" || !(data.date && data.time);
  const isComplexTask = willBecomeTask && MindsideUI.isTaskComplex(data);
  const freeSlot = data.suggested_free_slot;
  const valMsg = validation?.message
    || (hasConflict
      ? `Sobreposição com ${conflicts.length} atividade(s) da sua agenda.`
      : (data.within_availability === false && freeSlot
        ? `Fora da disponibilidade cadastrada. Horário livre sugerido: ${MindsideUI.formatDateFriendly(freeSlot.date)} às ${freeSlot.time}.`
        : "Horário livre na sua agenda."));

  return `
    <div class="suggestion-card ${hasConflict ? "has-conflict" : ""}" data-sugg-id="${id}" data-sugg-title="${escapeHtml(data.title || "")}" data-sugg-type="${escapeHtml(data.type || "tarefa")}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="badge ${data.type === "compromisso" ? "badge-em_andamento" : "badge-media"}">${typeLabel}</span>
          ${goalTitle ? `<span class="badge badge-em_andamento">🎯 Meta: ${escapeHtml(goalTitle)}</span>` : ""}
          <strong style="font-size:.96rem;">${escapeHtml(data.title)}</strong>
        </div>
        <span class="prio-pill ${prio.className}">${prio.icon} ${prio.label}</span>
      </div>

      <div class="suggestion-meta-grid">
        <span class="suggestion-meta-pill">${escapeHtml(dateLabel)}${data.time ? ` às ${escapeHtml(data.time.slice(0, 5))}` : ""}</span>
        <span class="suggestion-meta-pill complete-only">${data.duration_minutes || 30} min</span>
        <span class="suggestion-meta-pill complete-only">${escapeHtml(MindsideUI.categoryLabel(data.category || "geral"))}</span>
        ${willBecomeTask && !isComplexTask ? `<span class="suggestion-meta-pill">Ação direta</span>` : ""}
      </div>

      <div class="validation-pill complete-only ${hasConflict || data.within_availability === false ? "warn" : ""}">
        ${escapeHtml(valMsg)}
      </div>

      ${hasConflict ? `
        <div class="conflict-explain-box" role="alert">
          <strong>Conflito de horário:</strong> este horário coincide com ${conflicts.map((c) => `<strong>${escapeHtml(c.title)}</strong> (${c.start_time || ""}–${c.end_time || ""})`).join(", ")}.
          ${freeSlot ? `Horário livre disponível: <strong>${MindsideUI.formatDateFriendly(freeSlot.date)} às ${escapeHtml(freeSlot.time)}</strong>. ` : ""}
          Você pode clicar em <em>“Sugerir outro horário”</em> para encontrar um espaço livre ou <em>“Editar”</em> antes de aprovar.
        </div>` : ""}

      <div id="sugg-steps-slot-${id}">
        ${isComplexTask ? renderSuggestionSubtasksPreview(id, data) : ""}
      </div>

      <div class="suggestion-actions">
        <button type="button" class="btn btn-sm btn-approve" data-approve="${id}">✓ ${hasConflict ? "Aprovar mesmo assim" : "Aprovar"}</button>
        ${isComplexTask ? `<button type="button" class="btn btn-sm" data-sugg-breakdown="${id}" title="Decompor ou atualizar micro-etapas práticas do tema">⚡ Destrinchar</button>` : ""}
        <button type="button" class="btn btn-sm" data-edit="${id}">✎ Editar</button>
        <button type="button" class="btn btn-sm" data-regenerate="${id}" title="Encontrar um horário livre automaticamente">↻ Sugerir outro horário</button>
        <button type="button" class="btn btn-sm btn-danger" data-reject="${id}">✕ Rejeitar</button>
      </div>
    </div>`;
}

function bindSuggestionButtons(scope) {
  scope.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", () => decide(btn.dataset.approve, "approve", btn)));
  scope.querySelectorAll("[data-reject]").forEach((btn) =>
    btn.addEventListener("click", () => decide(btn.dataset.reject, "reject", btn)));
  scope.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openEditModal(btn.dataset.edit, btn.closest(".suggestion-card"))));
  scope.querySelectorAll("[data-regenerate]").forEach((btn) =>
    btn.addEventListener("click", () => onRegenerate(btn.dataset.regenerate, btn)));
  scope.querySelectorAll("[data-sugg-breakdown]").forEach((btn) =>
    btn.addEventListener("click", () => onBreakdownSuggestion(btn.dataset.suggBreakdown, btn)));
}

async function onBreakdownSuggestion(id, btn) {
  const slot = document.getElementById(`sugg-steps-slot-${id}`);
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "Organizando micro-etapas...";
  try {
    const list = await Api.listSuggestions();
    const sugg = list.find((s) => String(s.id) === String(id));
    if (!sugg) throw new Error("Sugestão não encontrada.");
    const data = JSON.parse(sugg.structured_data || "{}");
    if (!MindsideUI.isTaskComplex(data)) {
      toast("Esta é uma tarefa rápida e direta — não precisa de sub-etapas!", "info");
      return;
    }
    const steps = (Array.isArray(data.subtasks) && data.subtasks.length)
      ? data.subtasks
      : LocalMindsideEngine.computeDomainSteps(data.title, data.description, data.category);
    data.subtasks = steps;
    data.precisa_destrinchar = true;
    await Api.editSuggestion(id, data);
    if (slot) slot.innerHTML = renderSuggestionSubtasksPreview(id, data);
    toast(`${steps.length} micro-etapas práticas prontas na sugestão!`, "success");
  } catch (err) {
    toast(err.message || "Não foi possível destrinchar a sugestão.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function onRegenerate(id, btn) {
  const card = btn.closest(".suggestion-card");
  btn.disabled = true;
  btn.textContent = "Procurando horário livre...";
  try {
    const updated = await Api.regenerateSuggestion(id);
    const data = JSON.parse(updated.structured_data);
    const template = document.createElement("template");
    template.innerHTML = renderSuggestionCard(id, data, {
      message: `Horário livre encontrado: ${MindsideUI.formatDateFriendly(data.date)} às ${data.time}.`,
    });
    const newCard = template.content.firstElementChild;
    card.replaceWith(newCard);
    bindSuggestionButtons(newCard);
    toast("Novo horário livre sugerido!", "success");
  } catch (err) {
    toast(err.message || "Não foi possível sugerir outro horário.", "error");
    btn.disabled = false;
    btn.textContent = "↻ Sugerir outro horário";
  }
}

async function decide(id, action, btn) {
  const card = btn.closest(".suggestion-card");
  const title = card.getAttribute("data-sugg-title") || "Item";
  const type = card.getAttribute("data-sugg-type") || "tarefa";
  btn.disabled = true;
  try {
    if (action === "approve") {
      await Api.approveSuggestion(id);
      card.classList.remove("has-conflict");
      card.classList.add("is-approved");
      const targetHref = type === "compromisso" ? "compromissos.html" : (type === "objetivo" ? "objetivos.html" : "tarefas.html");
      const targetLabel = type === "compromisso" ? "Ver em Compromissos →" : (type === "objetivo" ? "Ver em Objetivos →" : "Ver em Tarefas →");
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px; color:var(--success);">
            <img class="sticker-img sticker-sm" src="assets/stickers/slime-done.svg" alt="Aprovada">
            <div>
              <strong>✓ Aprovada: “${escapeHtml(title)}” adicionada à sua rotina!</strong>
            </div>
          </div>
          <a class="btn btn-xs" href="${targetHref}">${targetLabel}</a>
        </div>`;
      toast("Sugestão aprovada e salva na rotina!", "success");
    } else {
      await Api.rejectSuggestion(id);
      card.classList.remove("has-conflict");
      card.classList.add("is-rejected");
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <span class="text-dim">✕ Sugestão <strong>“${escapeHtml(title)}”</strong> rejeitada — nada foi adicionado.</span>
          <span class="badge badge-pendente">Rejeitada</span>
        </div>`;
      toast("Sugestão rejeitada.", "info");
    }
  } catch (err) {
    toast(err.message || "Erro ao processar decisão.", "error");
    btn.disabled = false;
  }
}

let currentEditCard = null;
let currentEditOriginalData = null;
function openEditModal(id, card) {
  currentEditCard = card;
  Api.listSuggestions().then((list) => {
    const sugg = list.find((s) => s.id == id);
    if (!sugg) {
      toast("Sugestão não encontrada.", "error");
      return;
    }
    const data = JSON.parse(sugg.structured_data);
    currentEditOriginalData = data;
    document.getElementById("edit-sugg-id").value = id;
    document.getElementById("edit-sugg-title").value = data.title || "";
    document.getElementById("edit-sugg-type").value = data.type || "tarefa";
    document.getElementById("edit-sugg-priority").value = data.priority || "media";
    document.getElementById("edit-sugg-date").value = data.date || "";
    document.getElementById("edit-sugg-time").value = data.time || "";
    document.getElementById("edit-sugg-duration").value = data.duration_minutes || 30;
    document.getElementById("edit-sugg-category").value = data.category || "geral";
    document.getElementById("edit-sugg-overlay").classList.add("open");
  }).catch((err) => toast(err.message || "Não foi possível carregar a sugestão.", "error"));
}

async function onSaveEdit(e) {
  e.preventDefault();
  const id = document.getElementById("edit-sugg-id").value;
  const titleVal = document.getElementById("edit-sugg-title").value.trim();
  const typeVal = document.getElementById("edit-sugg-type").value;
  const catVal = document.getElementById("edit-sugg-category").value;
  const complexFlag = typeVal !== "compromisso" && MindsideUI.isTaskComplex({
    title: titleVal,
    description: titleVal,
    category: catVal,
  });
  const payload = {
    type: typeVal,
    title: titleVal,
    description: titleVal,
    priority: document.getElementById("edit-sugg-priority").value,
    date: document.getElementById("edit-sugg-date").value || null,
    time: document.getElementById("edit-sugg-time").value || null,
    duration_minutes: parseInt(document.getElementById("edit-sugg-duration").value, 10) || 30,
    category: catVal,
    goal_id: currentEditOriginalData?.goal_id ?? null,
    goal_title: currentEditOriginalData?.goal_title ?? null,
    precisa_destrinchar: complexFlag,
    subtasks: complexFlag
      ? (currentEditOriginalData?.title === titleVal && Array.isArray(currentEditOriginalData?.subtasks) && currentEditOriginalData.subtasks.length
          ? currentEditOriginalData.subtasks
          : LocalMindsideEngine.computeDomainSteps(titleVal, titleVal, catVal))
      : [],
    conflicts: [],
  };
  try {
    const updated = await Api.editSuggestion(id, payload);
    const updatedData = JSON.parse(updated.structured_data);
    document.getElementById("edit-sugg-overlay").classList.remove("open");
    toast("Sugestão atualizada! Aprove quando estiver pronta.", "success");
    if (currentEditCard) {
      const template = document.createElement("template");
      template.innerHTML = renderSuggestionCard(id, updatedData);
      const updatedCard = template.content.firstElementChild;
      currentEditCard.replaceWith(updatedCard);
      bindSuggestionButtons(updatedCard);
    }
  } catch (err) {
    toast(err.message || "Erro ao editar sugestão.", "error");
  }
}
