/* Tema claro/escuro e Modo de Interface (completo/simplificado).
   Aplica atributos em <html> antes da pintura para evitar flash visual
   e mantém preferência sincronizada entre abas e navegações. */
(function () {
  const THEME_KEY = "mindside_theme";
  const MODE_KEY = "mindside_interface_mode";
  const USER_KEY = "mindside_user";
  const WNAME_PREFIX = "__mindside_mode__=";

  function isValidMode(value) {
    return value === "complete" || value === "simplified";
  }

  function readWindowNameMode() {
    try {
      const wn = typeof window.name === "string" ? window.name : "";
      if (wn.startsWith(WNAME_PREFIX)) {
        const val = wn.slice(WNAME_PREFIX.length);
        if (isValidMode(val)) return val;
      }
    } catch { /* ignora restrição de window.name */ }
    return null;
  }

  function writeWindowNameMode(mode) {
    try {
      const wn = typeof window.name === "string" ? window.name : "";
      if (!wn || wn.startsWith(WNAME_PREFIX)) {
        window.name = `${WNAME_PREFIX}${mode}`;
      }
    } catch { /* ignora restrição de window.name */ }
  }

  function readLocalStorageMode() {
    try {
      const val = localStorage.getItem(MODE_KEY);
      if (isValidMode(val)) return val;
    } catch { /* ignora falha de storage */ }
    return null;
  }

  function readSessionStorageMode() {
    try {
      const val = sessionStorage.getItem(MODE_KEY);
      if (isValidMode(val)) return val;
    } catch { /* ignora falha de storage */ }
    return null;
  }

  function getStoredPreference() {
    return readLocalStorageMode() || readSessionStorageMode() || readWindowNameMode();
  }

  function readStoredMode() {
    const explicit = getStoredPreference();
    if (explicit) return explicit;
    try {
      const user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
      if (user && isValidMode(user.interface_mode)) {
        return user.interface_mode;
      }
    } catch { /* ignora JSON inválido */ }
    return "complete";
  }

  function persistLocalPreference(normalized) {
    try {
      if (localStorage.getItem(MODE_KEY) !== normalized) {
        localStorage.setItem(MODE_KEY, normalized);
      }
    } catch { /* ignora falha de storage */ }
    try {
      if (sessionStorage.getItem(MODE_KEY) !== normalized) {
        sessionStorage.setItem(MODE_KEY, normalized);
      }
    } catch { /* ignora falha de storage */ }
    writeWindowNameMode(normalized);
    try {
      const user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
      if (user && typeof user === "object" && user.interface_mode !== normalized) {
        user.interface_mode = normalized;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
    } catch { /* ignora JSON inválido */ }
  }

  function normalizeMode(value) {
    return value === "simplified" ? "simplified" : "complete";
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);

  const savedMode = normalizeMode(readStoredMode());
  document.documentElement.setAttribute("data-mode", savedMode);
  if (getStoredPreference()) {
    persistLocalPreference(savedMode);
  }

  const ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>`;

  function labelForTheme(theme) {
    return theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";
  }

  function paintThemeBtn(btn, theme) {
    btn.innerHTML = ICON;
    btn.setAttribute("aria-label", labelForTheme(theme));
    btn.setAttribute("title", labelForTheme(theme));
  }

  function paintModeControls(mode) {
    document.querySelectorAll("[data-mode-choice]").forEach((el) => {
      const choice = el.getAttribute("data-mode-choice");
      const active = choice === mode;
      el.classList.toggle("active", active);
      el.classList.toggle("is-selected", active);
      if (el.getAttribute("role") === "radio") {
        el.setAttribute("aria-checked", active ? "true" : "false");
      } else {
        el.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
    document.querySelectorAll("[data-mode-toggle]").forEach((btn) => {
      const isSimp = mode === "simplified";
      btn.setAttribute("aria-pressed", isSimp ? "true" : "false");
      btn.setAttribute(
        "title",
        isSimp
          ? "Modo Simplificado ativo — clique para voltar ao Modo Completo"
          : "Modo Completo ativo — clique para ativar o Modo Simplificado"
      );
    });
  }

  window.MindsideTheme = {
    current() {
      return localStorage.getItem(THEME_KEY) || "dark";
    },
    apply(theme) {
      const next = theme === "light" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
      document.querySelectorAll("[data-theme-toggle]").forEach((btn) => paintThemeBtn(btn, next));
      window.dispatchEvent(new CustomEvent("mindside:themechange", { detail: { theme: next } }));
      return next;
    },
    toggle() {
      return this.apply(this.current() === "dark" ? "light" : "dark");
    },
    init() {
      const curr = this.current();
      document.documentElement.setAttribute("data-theme", curr);
      document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
        paintThemeBtn(btn, curr);
        if (btn.__themeBound) return;
        btn.__themeBound = true;
        btn.addEventListener("click", () => this.toggle());
      });
    },
  };

  window.MindsideMode = {
    normalize: normalizeMode,
    getStoredPreference,
    current() {
      return normalizeMode(readStoredMode());
    },
    isSimplified() {
      return this.current() === "simplified";
    },
    paint() {
      paintModeControls(this.current());
    },
    async apply(mode, { persistLocal = true, syncBackend = false, dispatch = true, announce = false } = {}) {
      const normalized = normalizeMode(mode);
      const previous = document.documentElement.getAttribute("data-mode");
      document.documentElement.setAttribute("data-mode", normalized);

      if (persistLocal) {
        persistLocalPreference(normalized);
      } else {
        writeWindowNameMode(normalized);
        try {
          if (sessionStorage.getItem(MODE_KEY) !== normalized) {
            sessionStorage.setItem(MODE_KEY, normalized);
          }
        } catch { /* ignora falha de storage */ }
      }

      paintModeControls(normalized);

      if (dispatch && previous !== normalized) {
        window.dispatchEvent(new CustomEvent("mindside:modechange", { detail: { mode: normalized } }));
      }

      if (announce && typeof window.toast === "function" && previous !== normalized) {
        window.toast(
          normalized === "simplified"
            ? "Modo Simplificado ativado — foco no que é essencial agora."
            : "Modo Completo ativado — todos os recursos e visões disponíveis.",
          "info"
        );
      }

      if (syncBackend && window.Api && typeof window.Api.getToken === "function" && window.Api.getToken()) {
        try {
          const updated = await window.Api.updateProfile({ interface_mode: normalized });
          if (updated && typeof window.Api.setUser === "function") {
            window.Api.setUser(updated, { applyMode: false });
          }
        } catch {
          // Mantém preferência local mesmo se a rede estiver temporariamente indisponível
        }
      }

      return normalized;
    },
    setMode(mode, opts = {}) {
      return this.apply(mode, { persistLocal: true, syncBackend: true, dispatch: true, announce: false, ...opts });
    },
    toggle(opts = {}) {
      const next = this.current() === "simplified" ? "complete" : "simplified";
      return this.setMode(next, opts);
    },
    init() {
      paintModeControls(this.current());

      if (!window.__mindsideSyncBound) {
        window.__mindsideSyncBound = true;
        window.addEventListener("storage", (ev) => {
          if (ev.key === THEME_KEY && (ev.newValue === "light" || ev.newValue === "dark")) {
            window.MindsideTheme.apply(ev.newValue);
          }
          if (ev.key === MODE_KEY && isValidMode(ev.newValue)) {
            this.apply(ev.newValue, { persistLocal: false, syncBackend: false, dispatch: true, announce: false });
          }
        });
        window.addEventListener("pageshow", () => {
          const latestTheme = localStorage.getItem(THEME_KEY) || "dark";
          if (document.documentElement.getAttribute("data-theme") !== latestTheme) {
            window.MindsideTheme.apply(latestTheme);
          }
          const latestMode = this.current();
          if (document.documentElement.getAttribute("data-mode") !== latestMode) {
            this.apply(latestMode, { persistLocal: false, syncBackend: false, dispatch: true, announce: false });
          } else {
            paintModeControls(latestMode);
          }
        });
      }

      if (document.__mindsideModeDelegated) return;
      document.__mindsideModeDelegated = true;

      document.addEventListener("click", (e) => {
        const choiceBtn = e.target.closest("[data-mode-choice]");
        if (choiceBtn) {
          const choice = choiceBtn.getAttribute("data-mode-choice");
          this.setMode(choice, { announce: true });
          return;
        }
        const toggleBtn = e.target.closest("[data-mode-toggle]");
        if (toggleBtn) {
          this.toggle({ announce: true });
        }
      });
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.MindsideTheme.init();
    window.MindsideMode.init();
  });
})();
