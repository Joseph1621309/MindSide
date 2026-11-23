/* Página de Configurações — Organizada em categorias claras:
   1. Aparência e Acessibilidade (Modo de Interface + Tema + Orientações)
   2. Conta e Sessão
   3. Preferências de Rotina (Janelas livres + Categorias)
   4. IA, Privacidade e Demonstração */

document.addEventListener("DOMContentLoaded", async () => {
  renderShell("configuracoes.html", "Configurações");
  window.addEventListener("mindside:modechange", syncConfigUiState);
  window.addEventListener("mindside:themechange", syncConfigUiState);
  await renderConfigPage();
});

function syncConfigUiState() {
  window.MindsideMode?.paint();
  const themeLbl = document.getElementById("cfg-theme-status");
  const currTheme = window.MindsideTheme ? window.MindsideTheme.current() : "dark";
  if (themeLbl) {
    themeLbl.textContent = currTheme === "dark" ? "Tema escuro ativo" : "Tema claro ativo";
  }
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    const active = btn.getAttribute("data-theme-choice") === currTheme;
    btn.classList.toggle("btn-primary", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

async function renderConfigPage() {
  const user = Api.user() || { name: "Visitante", email: "Sessão local" };
  const isGuestEmail = user.email && user.email.startsWith("guest_") && user.email.endsWith("@example.com");
  const sessionDisplay = isGuestEmail ? "Sessão visitante local (persistida no banco)" : (user.email || "");
  const currentMode = window.MindsideMode ? window.MindsideMode.current() : "complete";
  const currentTheme = window.MindsideTheme ? window.MindsideTheme.current() : "dark";

  const content = document.getElementById("page-content");
  content.innerHTML = `
    <section class="card list-card settings-section-card" aria-labelledby="cfg-heading-appearance">
      <div class="head">
        <div>
          <h3 class="mt-0" id="cfg-heading-appearance">Aparência e Acessibilidade</h3>
          <div class="section-subtitle">Escolha quanta informação prefere ver por vez e ajuste o contraste visual.</div>
        </div>
      </div>

      <div>
        <div style="font-weight:700; font-size:.94rem; margin-bottom:4px;">Modo de interface</div>
        <div class="text-secondary" style="font-size:.83rem;">
          Você pode alternar entre os modos a qualquer momento sem perder seus dados.
        </div>

        <div class="mode-selector-grid" role="radiogroup" aria-label="Modo de interface">
          <button
            type="button"
            role="radio"
            class="mode-option-card ${currentMode === "complete" ? "is-selected" : ""}"
            data-mode-choice="complete"
            aria-checked="${currentMode === "complete"}"
          >
            <div class="mode-option-head">
              <span>Modo Completo</span>
              <span class="badge badge-em_andamento">Padrão</span>
            </div>
            <p class="mode-option-desc">
              Tenha acesso à experiência completa do MindSide, com mais informações e ferramentas disponíveis.
            </p>
          </button>

          <button
            type="button"
            role="radio"
            class="mode-option-card ${currentMode === "simplified" ? "is-selected" : ""}"
            data-mode-choice="simplified"
            aria-checked="${currentMode === "simplified"}"
          >
            <div class="mode-option-head">
              <span>Modo Simplificado</span>
              <span class="badge badge-concluida">Direto ao ponto</span>
            </div>
            <p class="mode-option-desc">
              Uma experiência mais direta, com menos informações na tela e foco nas atividades essenciais.
            </p>
          </button>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; margin-top:18px; padding-top:16px; border-top:1px solid var(--border);">
        <div>
          <div style="font-weight:600; font-size:.9rem;">Tema visual e orientações</div>
          <div class="text-dim" style="font-size:.81rem;" id="cfg-theme-status">
            ${currentTheme === "dark" ? "Tema escuro ativo" : "Tema claro ativo"}
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="btn btn-sm ${currentTheme === "dark" ? "btn-primary" : ""}" data-theme-choice="dark" aria-pressed="${currentTheme === "dark"}">🌙 Modo Escuro</button>
          <button type="button" class="btn btn-sm ${currentTheme === "light" ? "btn-primary" : ""}" data-theme-choice="light" aria-pressed="${currentTheme === "light"}">☀ Modo Claro</button>
          <button type="button" class="btn btn-sm" id="cfg-theme-btn">Alternar</button>
          <button type="button" class="btn btn-sm btn-ghost" id="cfg-reset-guides-btn">Restaurar orientações</button>
        </div>
      </div>
    </section>

    <section class="card list-card settings-section-card" aria-labelledby="cfg-heading-routine">
      <div class="head">
        <div>
          <h3 class="mt-0" id="cfg-heading-routine">Rotina Fixa em Texto Livre (Proteção de Agenda com IA)</h3>
          <div class="section-subtitle">Informe aulas, trabalho, cursos, treino e horário de dormir. A IA bloqueia automaticamente esses horários ao sugerir tarefas.</div>
        </div>
      </div>
      <form id="cfg-routine-form" style="margin-bottom:14px;">
        <div class="field">
          <label for="cfg-routine-text">Descreva sua rotina em qualquer formato</label>
          <textarea id="cfg-routine-text" class="input-control" rows="4" maxlength="5000" placeholder="Ex.: Estudo das 7h às 12h30 de seg a sex, faço curso técnico à tarde na terça e quinta das 14h às 17h e durmo às 23h"></textarea>
        </div>
        <button type="submit" class="btn btn-sm btn-primary" id="cfg-routine-save-btn">✨ Interpretar e Proteger Rotina</button>
      </form>
      <div id="cfg-routine-blocks"></div>
    </section>

    <div class="grid-2-equal">
      <div>
        <section class="card list-card settings-section-card" aria-labelledby="cfg-heading-account">
          <div class="head">
            <div>
              <h3 class="mt-0" id="cfg-heading-account">Conta e Sessão</h3>
            </div>
          </div>
          <form id="profile-form">
            <div class="field">
              <label for="profile-name">Como prefere ser chamado</label>
              <input type="text" id="profile-name" value="${escapeHtml(user.name || "")}" maxlength="120" required>
            </div>
            <div class="field">
              <label>Identificação da sessão</label>
              <input type="text" value="${escapeHtml(sessionDisplay)}" disabled>
            </div>
            <button type="submit" class="btn btn-sm btn-primary">Salvar nome</button>
          </form>
        </section>

        <section class="card list-card settings-section-card" aria-labelledby="cfg-heading-availability">
          <div class="head">
            <div>
              <h3 class="mt-0" id="cfg-heading-availability">Janelas de Horários Disponíveis</h3>
              <div class="section-subtitle">Horários livres que o Assistente usa ao sugerir encaixes.</div>
            </div>
          </div>
          <form id="avail-form" style="margin-bottom:16px;">
            <div class="form-row">
              <div class="field">
                <label for="avail-day">Dia da semana</label>
                <select id="avail-day">
                  <option value="Segunda">Segunda-feira</option>
                  <option value="Terca">Terça-feira</option>
                  <option value="Quarta">Quarta-feira</option>
                  <option value="Quinta">Quinta-feira</option>
                  <option value="Sexta">Sexta-feira</option>
                  <option value="Sabado">Sábado</option>
                  <option value="Domingo">Domingo</option>
                </select>
              </div>
              <div class="field">
                <label for="avail-start">Intervalo (Início – Fim)</label>
                <div style="display:flex; gap:8px;">
                  <input type="time" id="avail-start" value="14:00" required aria-label="Horário inicial">
                  <input type="time" id="avail-end" value="18:00" required aria-label="Horário final">
                </div>
              </div>
            </div>
            <button type="submit" class="btn btn-sm btn-primary">+ Adicionar janela livre</button>
          </form>
          <div id="avail-container"></div>
        </section>
      </div>

      <div>
        <section class="card list-card settings-section-card" aria-labelledby="cfg-heading-categories">
          <div class="head">
            <div>
              <h3 class="mt-0" id="cfg-heading-categories">Categorias Contextuais</h3>
              <div class="section-subtitle">Organize áreas da sua vida para filtrar tarefas e compromissos.</div>
            </div>
          </div>
          <form id="cat-form" style="margin-bottom:16px;">
            <div class="form-row">
              <div class="field">
                <label for="cat-name">Nome da categoria</label>
                <input type="text" id="cat-name" placeholder="Ex.: Iniciação Científica" maxlength="50" required>
              </div>
              <div class="field">
                <label for="cat-type">Grupo semântico</label>
                <select id="cat-type">
                  <option value="Estudo">Estudo</option>
                  <option value="Trabalho">Trabalho</option>
                  <option value="Saude">Saúde</option>
                  <option value="Lazer">Lazer</option>
                  <option value="Pessoal">Pessoal</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>
            </div>
            <button type="submit" class="btn btn-sm btn-primary">+ Criar categoria</button>
          </form>
          <div id="cat-container"></div>
        </section>

        <section class="card list-card settings-section-card" aria-labelledby="cfg-heading-privacy-demo">
          <div class="head">
            <div>
              <h3 class="mt-0" id="cfg-heading-privacy-demo">Inteligência Artificial, Privacidade e Demonstração</h3>
            </div>
          </div>
          <p class="text-secondary" style="font-size:.85rem; margin-top:0; margin-bottom:14px; line-height:1.6;">
            Você mantém total controle da sua rotina: apenas as mensagens enviadas no Assistente são analisadas pela IA,
            e nenhuma tarefa ou compromisso é salvo sem a sua aprovação explícita.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-primary" id="cfg-seed-btn">Carregar Cenário SIC</button>
            <button type="button" class="btn btn-sm btn-danger" id="cfg-reset-btn">Limpar dados da sessão</button>
          </div>
        </section>
      </div>
    </div>`;

  window.MindsideTheme?.init();
  window.MindsideMode?.init();
  syncConfigUiState();

  document.getElementById("cfg-theme-btn")?.addEventListener("click", () => {
    window.MindsideTheme?.toggle();
    syncConfigUiState();
  });

  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.MindsideTheme?.apply(btn.getAttribute("data-theme-choice"));
      syncConfigUiState();
    });
  });

  document.getElementById("cfg-routine-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ta = document.getElementById("cfg-routine-text");
    const btn = document.getElementById("cfg-routine-save-btn");
    const text = ta?.value?.trim();
    if (!text || btn.disabled) return;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Interpretando rotina...";
    try {
      const res = await Api.saveRoutine(text);
      toast(`Rotina protegida com ${(res?.blocks || []).length} bloco(s) fixo(s)!`, "success");
      await loadConfigLists();
    } catch (err) {
      toast(err.message || "Erro ao salvar rotina fixa.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });

  document.getElementById("cfg-reset-guides-btn")?.addEventListener("click", () => {
    window.MindsideGuides?.resetAll();
    toast("Orientações das páginas restauradas!", "success");
  });

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("profile-name").value.trim();
    if (!name) return;
    try {
      const updated = await Api.updateProfile({ name });
      Api.setUser(updated);
      updateSidebarUserBox(updated);
      toast("Nome atualizado com sucesso!", "success");
    } catch (err) {
      toast(err.message || "Erro ao atualizar perfil.", "error");
    }
  });

  document.getElementById("avail-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Api.createAvailability({
        day_of_week: document.getElementById("avail-day").value,
        start_time: document.getElementById("avail-start").value,
        end_time: document.getElementById("avail-end").value,
        status: "Ativo",
      });
      toast("Janela de disponibilidade adicionada!", "success");
      await loadConfigLists();
    } catch (err) {
      toast(err.message || "Erro ao cadastrar horário.", "error");
    }
  });

  document.getElementById("cat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("cat-name");
    try {
      await Api.createCategory({
        name: input.value.trim(),
        tipo_categoria: document.getElementById("cat-type").value,
      });
      input.value = "";
      toast("Categoria criada!", "success");
      await loadConfigLists();
    } catch (err) {
      toast(err.message || "Erro ao criar categoria.", "error");
    }
  });

  document.getElementById("cfg-seed-btn").addEventListener("click", async () => {
    try {
      await Api.seedDemo();
      toast("Cenário de demonstração SIC carregado!", "success");
      await loadConfigLists();
    } catch (err) {
      toast(err.message || "Erro ao carregar cenário.", "error");
    }
  });

  document.getElementById("cfg-reset-btn").addEventListener("click", async () => {
    const confirmed = await window.MindsideUI.confirmModal({
      title: "Excluir dados da sessão",
      message: "Tem certeza que deseja excluir todas as tarefas, compromissos, objetivos, rotina fixa, planos de estudo e sugestões desta sessão? Esta ação não pode ser desfeita.",
      confirmText: "Excluir dados da sessão",
      cancelText: "Cancelar",
    });
    if (!confirmed) return;
    try {
      if (window.MindsideTimer?.getActive?.()) await window.MindsideTimer.stop();
      await Api.resetDemo();
      window.MindsideTimer?.refresh?.();
      const rt = document.getElementById("cfg-routine-text");
      if (rt) rt.value = "";
      toast("Todos os dados da sessão foram excluídos.", "info");
      await loadConfigLists();
    } catch (err) {
      toast(err.message || "Erro ao excluir dados da sessão.", "error");
    }
  });

  await loadConfigLists();
}

async function loadConfigLists() {
  const availContainer = document.getElementById("avail-container");
  const catContainer = document.getElementById("cat-container");
  const routineContainer = document.getElementById("cfg-routine-blocks");
  const routineTextarea = document.getElementById("cfg-routine-text");
  try {
    const [slots, cats, routineData] = await Promise.all([
      Api.listAvailability(),
      Api.listCategories(),
      Api.getRoutine().catch(() => Api.getCachedRoutine()),
    ]);
    if (routineTextarea && routineData?.routine_text && !routineTextarea.value) {
      routineTextarea.value = routineData.routine_text;
    }
    if (routineContainer) {
      const blocks = routineData?.blocks || [];
      routineContainer.innerHTML = blocks.length ? blocks.map((rb) => `
        <div class="item-row" style="padding:10px 14px;">
          <div>
            <div class="item-title">${escapeHtml(rb.title)}</div>
            <div class="meta">${escapeHtml(rb.day_of_week)} · ${String(rb.start_time).slice(0, 5)} às ${String(rb.end_time).slice(0, 5)}</div>
          </div>
          <div class="item-actions">
            <span class="badge badge-pendente">Protegido</span>
            <button type="button" class="btn btn-sm btn-danger" data-del-routine="${rb.id}">Remover</button>
          </div>
        </div>`).join("") : `
        <div class="text-dim" style="font-size:.82rem;">Nenhum bloco de rotina fixa cadastrado ainda.</div>`;
      routineContainer.querySelectorAll("[data-del-routine]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const confirmed = await window.MindsideUI.confirmModal({
            title: "Excluir bloco da rotina",
            message: "Tem certeza que deseja excluir este horário fixo protegido da sua rotina?",
            confirmText: "Excluir bloco",
          });
          if (!confirmed) return;
          try {
            await Api.deleteRoutineBlock(btn.dataset.delRoutine);
            toast("Bloco de rotina removido.", "info");
            await loadConfigLists();
          } catch (err) {
            toast(err.message || "Erro ao excluir bloco de rotina.", "error");
          }
        });
      });
    }
    availContainer.innerHTML = slots.length ? slots.map((s) => `
      <div class="item-row" style="padding:10px 14px;">
        <div>
          <div class="item-title">${escapeHtml(s.day_of_week)}</div>
          <div class="meta">${s.start_time.slice(0, 5)} às ${s.end_time.slice(0, 5)}</div>
        </div>
        <div class="item-actions">
          <span class="badge badge-concluida">Ativo</span>
          <button type="button" class="btn btn-sm btn-danger" data-del-slot="${s.id}">Remover</button>
        </div>
      </div>`).join("") : `
      <div class="empty-state-box">
        <img class="sticker-img sticker-sm" src="assets/stickers/slime-empty.svg" alt="Sem horários">
        <div>Nenhuma janela cadastrada ainda.</div>
      </div>`;

    availContainer.querySelectorAll("[data-del-slot]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const confirmed = await window.MindsideUI.confirmModal({
          title: "Excluir janela disponível",
          message: "Tem certeza que deseja excluir esta janela de horário disponível?",
          confirmText: "Excluir horário",
        });
        if (!confirmed) return;
        try {
          await Api.deleteAvailability(btn.dataset.delSlot);
          toast("Horário removido.", "info");
          await loadConfigLists();
        } catch (err) {
          toast(err.message || "Erro ao excluir janela disponível.", "error");
        }
      });
    });

    catContainer.innerHTML = cats.map((c) => `
      <div class="item-row" style="padding:10px 14px;">
        <div>
          <div class="item-title">${escapeHtml(c.name)}</div>
          <div class="meta">Grupo: ${escapeHtml(c.tipo_categoria)}</div>
        </div>
        <span class="badge badge-pendente">${escapeHtml(c.tipo_categoria)}</span>
      </div>`).join("");
  } catch (err) {
    toast(err.message || "Erro ao carregar listas de configuração.", "error");
  }
}
