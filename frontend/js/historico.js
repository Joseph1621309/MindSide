/* Página de Histórico — Linha do tempo cronológica agrupada por data e fácil de ler. */

let allHistory = [];
let currentHistFilter = "todos";
let historyLoaded = false;

function classifyAction(action = "") {
  const a = action.toLowerCase();
  if (a.includes("sugest") || a.includes("ia") || a.includes("analis")) {
    return { group: "ia", label: "Assistente IA", badgeClass: "badge-concluida" };
  }
  if (a.includes("taref") || a.includes("task")) {
    return { group: "tarefas", label: "Tarefa", badgeClass: "badge-media" };
  }
  if (a.includes("compromisso") || a.includes("appt") || a.includes("agenda")) {
    return { group: "compromissos", label: "Compromisso", badgeClass: "badge-em_andamento" };
  }
  if (a.includes("objetivo") || a.includes("goal") || a.includes("meta")) {
    return { group: "objetivos", label: "Objetivo", badgeClass: "badge-urgente" };
  }
  return { group: "sistema", label: "Preferência", badgeClass: "badge-pendente" };
}

function friendlyActionName(action = "") {
  const map = {
    tarefa_criada: "Tarefa criada",
    tarefa_atualizada: "Tarefa atualizada",
    tarefa_concluida: "Tarefa concluída",
    tarefa_excluida: "Tarefa excluída",
    compromisso_criado: "Compromisso agendado",
    compromisso_atualizado: "Compromisso atualizado",
    compromisso_excluido: "Compromisso excluído",
    objetivo_criado: "Objetivo criado",
    objetivo_atualizado: "Objetivo atualizado",
    objetivo_excluido: "Objetivo excluído",
    analise_ia: "Análise no Assistente",
    sugestao_aprovada: "Sugestão aprovada",
    sugestao_editada: "Sugestão editada",
    sugestao_rejeitada: "Sugestão rejeitada",
    sugestao_regenerada: "Novo horário sugerido",
    brain_dump_executado: "Brain Dump organizado pela IA",
    tarefa_destrinchada: "Tarefa destrinchada em micro-passos",
    acoes_extraidas_anotacao: "Ações extraídas de anotação",
    plano_estudo_criado: "Plano de estudos criado",
    plano_estudo_convertido_tarefas: "Plano de estudos convertido em tarefas",
    plano_estudo_reorganizado: "Plano de estudos reorganizado",
    modo_interface_alterado: "Modo de interface alterado",
    cenario_demo_carregado: "Cenário de exemplo carregado",
    sessao_reiniciada: "Sessão reiniciada",
  };
  if (map[action]) return map[action];
  const cleaned = String(action || "evento").replace(/_/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function localDateKeyFromIsoTimestamp(ts) {
  if (!ts) return localTodayIso();
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return String(ts).slice(0, 10);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeOnly(ts) {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("historico.html", "Histórico");
  window.addEventListener("mindside:modechange", () => {
    renderHistoryLayout();
    if (historyLoaded) renderHistory();
  });

  renderHistoryLayout();
  const container = document.getElementById("history-container");
  container.innerHTML = `<div class="skeleton" style="height:56px;margin-bottom:8px;"></div>`.repeat(4);

  try {
    allHistory = await Api.listHistory();
    historyLoaded = true;
    const badge = document.getElementById("hist-count-badge");
    if (badge) badge.textContent = `${allHistory.length} registro(s)`;
    renderHistory();
  } catch (err) {
    toast(err.message || "Erro ao carregar histórico.", "error");
  }
});

function renderHistoryLayout() {
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;
  const content = document.getElementById("page-content");

  const filterBarHtml = `
    <div class="toolbar-row" style="${isSimplified ? "margin-bottom:0;" : ""}">
      <div class="filter-bar" id="hist-filters">
        <button type="button" class="filter-chip ${currentHistFilter === "todos" ? "active" : ""}" data-filter="todos">Todos</button>
        <button type="button" class="filter-chip ${currentHistFilter === "ia" ? "active" : ""}" data-filter="ia">Assistente IA</button>
        <button type="button" class="filter-chip ${currentHistFilter === "tarefas" ? "active" : ""}" data-filter="tarefas">Tarefas</button>
        <button type="button" class="filter-chip ${currentHistFilter === "compromissos" ? "active" : ""}" data-filter="compromissos">Compromissos</button>
        <button type="button" class="filter-chip ${currentHistFilter === "objetivos" ? "active" : ""}" data-filter="objetivos">Objetivos</button>
      </div>
    </div>
  `;

  content.innerHTML = `
    <div class="card list-card">
      <div class="head">
        <div>
          <h3 class="mt-0">Atividades recentes</h3>
        </div>
        <span class="badge badge-concluida complete-only" id="hist-count-badge">${allHistory.length} registro(s)</span>
      </div>

      ${!isSimplified ? filterBarHtml : ""}
      <div id="history-container"></div>
    </div>

    ${isSimplified ? `
      <details class="simplified-more-panel">
        <summary>Filtrar por tipo de atividade</summary>
        <div class="simplified-more-body">
          ${filterBarHtml}
        </div>
      </details>
    ` : ""}
  `;

  document.querySelectorAll("#hist-filters [data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#hist-filters [data-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentHistFilter = btn.dataset.filter;
      renderHistory();
    });
  });
}

function renderHistory() {
  const container = document.getElementById("history-container");
  if (!container) return;
  const isSimplified = window.MindsideMode ? window.MindsideMode.isSimplified() : false;

  const badge = document.getElementById("hist-count-badge");
  if (badge) badge.textContent = `${allHistory.length} registro(s)`;

  const filtered = allHistory.filter((h) => {
    if (currentHistFilter === "todos") return true;
    return classifyAction(h.action).group === currentHistFilter;
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state-box">
        <img class="sticker-img" src="assets/stickers/slime-empty.svg" alt="Sem histórico">
        <div>Nenhuma atividade registrada para este filtro ainda.</div>
      </div>`;
    return;
  }

  const groups = new Map();
  filtered.forEach((h) => {
    const key = localDateKeyFromIsoTimestamp(h.created_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  });

  container.innerHTML = Array.from(groups.entries()).map(([dateKey, items]) => {
    const rowsHtml = items.map((h) => {
      const info = classifyAction(h.action);
      const timeStr = formatTimeOnly(h.created_at);
      return `
        <div class="history-item-clean">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              ${timeStr ? `<span class="history-time-tag">${escapeHtml(timeStr)}</span>` : ""}
              <span class="item-title" style="font-size:.9rem;">${escapeHtml(h.description)}</span>
            </div>
            ${!isSimplified ? `<div class="task-meta-clean"><span>${escapeHtml(friendlyActionName(h.action))}</span></div>` : ""}
          </div>
          <span class="badge ${info.badgeClass}">${info.label}</span>
        </div>`;
    }).join("");

    return `
      <div class="history-day-group">
        <div class="history-day-label">${escapeHtml(MindsideUI.formatDateGroupHeader(dateKey))}</div>
        ${rowsHtml}
      </div>`;
  }).join("");
}
