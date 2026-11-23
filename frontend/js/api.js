/* Cliente central da API do MINDSIDE com fallback inteligente local para Live Server offline.
   Nenhuma outra parte do frontend deve montar URLs ou headers manualmente — tudo passa por aqui. */
const API_BASE = (() => {
  if (typeof window !== "undefined") {
    if (window.MINDSIDE_API_BASE) {
      return String(window.MINDSIDE_API_BASE).replace(/\/+$/, "");
    }
    const metaApi = typeof document !== "undefined"
      ? document.querySelector('meta[name="mindside-api-base"]')?.getAttribute("content")?.trim()
      : "";
    if (metaApi) {
      return metaApi.replace(/\/+$/, "");
    }
    if (window.location) {
      const { protocol, hostname, port } = window.location;
      if (protocol === "file:") {
        return "http://127.0.0.1:8000";
      }
      const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
      if (isLocalHost) {
        return (port && port !== "8000") ? `${protocol}//${hostname}:8000` : "";
      }
      if (port === "5500" || port === "3000" || port === "5173") {
        return `${protocol}//${hostname}:8000`;
      }
      return "";
    }
  }
  return "http://127.0.0.1:8000";
})();

/* ---- Motor Inteligente Local (Fallback quando backend FastAPI estiver offline) ---- */
const LocalMindsideEngine = (() => {
  const WEEKDAYS = {
    "segunda-feira": 0, segunda: 0,
    "terça-feira": 1, "terca-feira": 1, "terça": 1, terca: 1,
    "quarta-feira": 2, quarta: 2,
    "quinta-feira": 3, quinta: 3,
    "sexta-feira": 4, sexta: 4,
    "sábado": 5, sabado: 5,
    domingo: 6,
  };

  const ACTION_VERBS = [
    "preciso", "precisamos", "quero", "tenho", "temos", "devo", "devemos", "vou", "vamos",
    "falta", "lembrar", "terminar", "comprar", "fazer", "estudar", "revisar", "entregar",
    "enviar", "subir", "atualizar", "ler", "escrever", "preparar", "resolver", "mandar",
    "pagar", "agendar", "ligar", "buscar", "limpar", "arrumar", "organizar", "concluir",
    "finalizar", "ir", "assistir", "praticar", "corrigir", "implementar", "criar", "testar",
    "ver", "levar", "trazer", "pegar", "passar", "responder", "confirmar", "marcar",
    "visitar", "treinar", "correr", "montar", "editar", "publicar", "commitar", "checar",
    "baixar", "instalar", "pesquisar", "completar",
  ];

  const NOTE_TRIGGERS = [
    "ficou decidido", "ficou combinado", "ficou definido", "ficou acordado",
    ...ACTION_VERBS,
  ];

  const VERBS_ALT = ACTION_VERBS.slice().sort((a, b) => b.length - a.length).join("|");
  const SPLIT_REGEX = new RegExp(
    `(?:\\.{2,}|[.;\\n]+|,?\\s+(?:depois|em\\s+seguida|tamb[ée]m|al[ée]m\\s+disso)\\b|,\\s*(?:e\\s+)?(?=(?:eu\\s+|n[óo]s\\s+)?(?:${VERBS_ALT}|(?:o|a)\\s+[A-Za-zÀ-ÿ]{2,}\\s+(?:vai|ir[áa]|deve|precisa)|ficou\\b))|\\s+e\\s+(?=(?:eu\\s+|n[óo]s\\s+|tamb[ée]m\\s+|depois\\s+)?(?:${VERBS_ALT}|(?:o|a)\\s+[A-Za-zÀ-ÿ]{2,}\\s+(?:vai|ir[áa]|deve|precisa)|ficou\\b)))`,
    "i"
  );

  const TEMPORAL_SUFFIX_RE = new RegExp(
    "(?:\\s+(?:at[ée](?:\\s+(?:a|o))?|para(?:\\s+(?:a|o))?|antes\\s+d[aeo]s?|ainda|nesta|neste|na|no|em|pela|de))?" +
      "\\s*(?:\\b(?:pr[óo]xim[oa]|essa|esta)\\s+)?\\b(?:" +
      "segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado|domingo" +
      "|amanh[aã](?:\\s+(?:de\\s+manh[aã]|cedo|[àa]\\s+tarde|[àa]\\s+noite|tarde|noite))?" +
      "|ainda\\s+hoje|hoje(?:\\s+(?:cedo|[àa]\\s+tarde|[àa]\\s+noite|de\\s+manh[aã]|tarde|noite))?" +
      "|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?" +
      ")\\b(?:\\s+(?:de\\s+manh[aã]|cedo|[àa]s?\\s+\\d{1,2}(?:[:h]\\d{2}|h)?|[àa]\\s+tarde|[àa]\\s+noite))?.*$",
    "i"
  );

  function addDays(baseDate, offset) {
    const dt = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset, 12, 0, 0, 0);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function nextWeekdayIso(baseDate, targetWd) {
    // Python weekday: Mon=0..Sun=6 | JS getDay: Sun=0..Sat=6
    const currentWd = (baseDate.getDay() + 6) % 7;
    let ahead = (targetWd - currentWd + 7) % 7;
    if (ahead === 0) ahead = 7;
    return addDays(baseDate, ahead);
  }

  function extractDeadlineIso(clause, baseDate = new Date()) {
    const low = clause.toLowerCase();
    if (/\bhoje\b/i.test(low)) return addDays(baseDate, 0);
    if (/\bamanh[aã]\b/i.test(low)) return addDays(baseDate, 1);
    for (const [word, idx] of Object.entries(WEEKDAYS)) {
      const re = new RegExp(`\\b${word}\\b`, "i");
      if (re.test(low)) return nextWeekdayIso(baseDate, idx);
    }
    return null;
  }

  function splitClauses(text) {
    const normalized = String(text || "").trim().replace(/\.{3,}/g, ". ");
    const parts = normalized.split(SPLIT_REGEX);
    const out = [];
    for (const part of parts) {
      const cleaned = (part || "")
        .trim()
        .replace(/^(?:e\s+|e,\s*|depois\s+|tamb[ée]m\s+)+/i, "")
        .replace(/^[\s,.-]+|[\s,.-]+$/g, "");
      if (cleaned.length >= 4) out.push(cleaned);
    }
    return out.length ? out.slice(0, 8) : [normalized];
  }

  function cleanActionTitle(clause) {
    let title = String(clause || "").trim();
    title = title.replace(
      /^(?:tamb[ée]m\s+)?(?:ficou\s+(?:decidido|combinado|acordado|definido)\s+que\s+(?:o\s+|a\s+)?|lembrete(?:\s+importante)?\s*:\s*|nota\s*:\s*)/i,
      ""
    );
    title = title.replace(
      /^([A-Za-zÀ-ÿ]{2,30})\s+(?:vai|ir[áa]|deve|precisa)\s+([a-zà-ÿ]{3,}(?:ar|er|ir)\b)/i,
      (_, person, verb) => `${person.charAt(0).toUpperCase() + person.slice(1)} ${verb.toLowerCase()}`
    );
    title = title.replace(
      /^(?:(?:eu|n[óo]s)\s+)?(?:tenho\s+que\s+|temos\s+que\s+|tenho\s+uma?\s+|tenho\s+|preciso\s+|precisamos\s+|quero\s+|vou\s+|vamos\s+|devo\s+|falta\s+)/i,
      ""
    );
    title = title.replace(TEMPORAL_SUFFIX_RE, "");
    title = title.replace(/\s+(?:[àa]s|as)\s+\d{1,2}(?:[:h]\d{2}|h)?.*$/i, "");
    title = title.replace(/\s+\b(?:at[ée]|para|ainda|na|no|em)\s*$/i, "");
    title = title.replace(/\s{2,}/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "");
    if (title.length < 3) title = String(clause || "").trim().slice(0, 120);
    return (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 120);
  }

  function inferPriorityDb(lower) {
    if (/\b(?:urgente|urg[êe]ncia|muito importante|importante|prazo final|apresenta[çc][ãa]o|defesa|prova|exame|entregar|entrega)\b/i.test(lower)) {
      return "alta";
    }
    if (/\b(?:comprar|caf[ée]|mercado|supermercado|feira|farm[áa]cia|[áa]gua|limpar|arrumar|lavar|passear|descansar)\b/i.test(lower)
      && !/\b(?:relat[óo]rio|estudar|trabalho|slides|c[óo]digo|github|revisar)\b/i.test(lower)) {
      return "baixa";
    }
    return "media";
  }

  function inferCategoryDb(lower) {
    if (/\b(?:prova|estudar|mat[ée]ria|faculdade|aula|banco de dados|sql|slides|programa[çc][ãa]o|matem[áa]tica)\b/i.test(lower)) return "estudo";
    if (/\b(?:relat[óo]rio|github|c[óo]digo|reuni[ãa]o|projeto|trabalho)\b/i.test(lower)) return "trabalho";
    if (/\b(?:treino|academia|corrida|m[ée]dico)\b/i.test(lower)) return "saude";
    if (/\b(?:cinema|festa|passeio)\b/i.test(lower)) return "lazer";
    if (/\b(?:comprar|caf[ée]|mercado)\b/i.test(lower)) return "pessoal";
    return "geral";
  }

  function hasActionObligation(clause) {
    const low = clause.toLowerCase();
    if (NOTE_TRIGGERS.some((t) => low.includes(t))) return true;
    return /\b(?:vai|ir[áa]|deve|precisa|vamos|temos)\s+[a-zà-ÿ]{3,}(?:ar|er|ir)\b/i.test(low);
  }

  function cleanStudyTopic(raw) {
    let cleaned = String(raw || "").trim();
    cleaned = cleaned.replace(/,?\s*\bestudando\b.*$/i, "");
    cleaned = cleaned.replace(/\s+\bpara\s+(?:uma\s+|um\s+|a\s+|o\s+)?(?:prova|exame|teste|concurso|avalia[çc][ãa]o|entrevista|vestibular|enem|trabalho|apresenta[çc][ãa]o)\b.*$/i, "");
    cleaned = cleaned.replace(/\b(?:em\s+\d+\s*dias?|\d+\s*(?:h|horas?|min|minutos?)(?:\s*(?:por|ao)\s*dia)?|por\s+dia)\b/gi, "");
    cleaned = cleaned.replace(/^(?:(?:eu\s+)?(?:preciso|quero|gostaria\s+de|vou)\s+)?(?:criar\s+(?:um\s+)?plano\s+de\s+estudos?\s+(?:de|sobre|para)\s+|aprender\s+|estudar\s+|revisar\s+|dominar\s+)/i, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "");
    if (cleaned.length < 3) cleaned = String(raw || "").trim().slice(0, 70);

    const acronyms = new Set(["sql", "api", "html", "css", "js", "ts", "poo", "json", "http", "git", "tcc", "bi", "ia", "ml", "ux", "ui"]);
    const lowerWords = new Set(["e", "em", "de", "da", "do", "das", "dos", "para", "com", "no", "na", "nos", "nas", "a", "o", "por"]);
    return cleaned
      .split(/\s+/)
      .map((tok, i) => {
        const low = tok.toLowerCase();
        if (acronyms.has(low)) return low.toUpperCase();
        if (i > 0 && lowerWords.has(low)) return low;
        return tok.charAt(0).toUpperCase() + tok.slice(1);
      })
      .join(" ")
      .slice(0, 90);
  }

  const COMPLEX_TASK_RE = /\b(?:prova|provas|exame|exames|avalia[çc][ãa]o|avalia[çc][õo]es|relat[óo]rio|relat[óo]rios|trabalho|trabalhos|projeto|projetos|sistema|sistemas|c[óo]digo|c[óo]digos|github|programar|programa[çc][ãa]o|implementar|api|sql|banco de dados|apresenta[çc][ãa]o|apresenta[çc][õo]es|slides?|semin[áa]rio|semin[áa]rios|estudar|estudando|estudo|estudos|revisar|revis[ãa]o|plano|planejar|planejamento|pesquisa|pesquisar|artigo|tcc|monografia|documenta[çc][ãa]o|arquitetura|deploy|refatorar|bug|organizar evento|faxina completa|curso|m[óo]dulo|exerc[íi]cios?|cap[íi]tulo|lista de|simulado)\b/i;

  const SIMPLE_TASK_RE = /\b(?:comprar(?:\s+[a-zà-ÿ0-9-]+){0,3}|ir\s+(?:ao\s+mercado|ao\s+supermercado|na\s+padaria|[àa]\s+padaria|[àa]\s+farm[áa]cia|ao\s+banco)|beber\s+[áa]gua|tomar\s+(?:[áa]gua|rem[ée]dio|vitamina|caf[ée])|ligar\s+para|telefonar(?:\s+para)?|pagar\s+(?:a\s+|o\s+)?(?:conta|boleto|fatura|luz|[áa]gua|internet|aluguel|cart[ãa]o)|enviar\s+(?:um\s+|o\s+)?(?:e-?mail|mensagem|[áa]udio)|mandar\s+(?:um\s+|o\s+)?(?:e-?mail|mensagem|zap|whatsapp|[áa]udio)|responder\s+(?:a\s+|o\s+)?(?:e-?mail|mensagem|whatsapp)|levar\s+(?:o\s+)?lixo|tirar\s+(?:o\s+)?lixo|lavar\s+(?:a\s+)?lou[çc]a|arrumar\s+(?:a\s+)?cama|buscar\s+encomenda|pegar\s+encomenda|agendar\s+consulta|marcar\s+consulta)\b/i;

  function isTaskComplex(titleOrObj, description = "", category = "geral") {
    const isObj = Boolean(titleOrObj && typeof titleOrObj === "object");
    const title = isObj ? (titleOrObj.title || titleOrObj.titulo || "") : String(titleOrObj || "");
    const desc = isObj ? (titleOrObj.description || "") : String(description || "");
    const cat = (isObj ? (titleOrObj.category || "geral") : String(category || "geral")).toLowerCase().trim();

    const titleLow = title.toLowerCase().trim();
    if (!titleLow) return false;

    const hasComplexInTitle = COMPLEX_TASK_RE.test(titleLow);
    const hasSimpleInTitle = SIMPLE_TASK_RE.test(titleLow);
    if (hasSimpleInTitle && !hasComplexInTitle) return false;
    if (hasComplexInTitle) return true;

    const descLow = desc.toLowerCase().trim();
    if (descLow && !hasSimpleInTitle && COMPLEX_TASK_RE.test(descLow)) return true;

    const words = titleLow.split(/\s+/).filter(Boolean);
    if (words.length <= 3 && cat !== "estudo" && cat !== "trabalho") return false;
    return true;
  }

  const GOAL_STOPWORDS = new Set([
    "para", "com", "sem", "uma", "uns", "umas", "dos", "das", "nos", "nas",
    "que", "por", "meu", "minha", "meus", "minhas", "seu", "sua", "sobre",
    "fazer", "preciso", "tenho", "quero", "vou", "devo", "hoje", "amanha",
    "sexta", "segunda", "terca", "quarta", "quinta", "sabado", "domingo",
    "ainda", "tudo", "mais", "menos", "entre", "tarefa", "estudar",
    "aprender", "revisar", "preparar", "terminar", "entrega", "entregar",
  ]);

  const GOAL_EXPANSIONS = {
    sql: ["banco", "dados", "queries", "joins", "subqueries", "prova"],
    banco: ["sql", "dados", "relacional", "modelagem"],
    dados: ["sql", "banco"],
    github: ["codigo", "projeto", "sistema", "git", "prototipo", "api"],
    codigo: ["github", "projeto", "sistema", "programacao", "api"],
    api: ["sistema", "projeto", "codigo", "backend", "github"],
    slides: ["apresentar", "apresentacao", "pitch", "seminario", "roteiro"],
    pitch: ["apresentar", "apresentacao", "slides", "roteiro"],
    roteiro: ["apresentar", "pitch", "slides", "seminario"],
    apresentar: ["slides", "pitch", "roteiro", "seminario"],
    sic: ["cientifica", "pesquisa", "apresentar", "mindside", "prototipo", "pitch"],
    tcc: ["monografia", "artigo", "pesquisa", "faculdade", "formatura"],
    relatorio: ["documento", "projeto", "pesquisa"],
  };

  function stripAccentsLower(s) {
    return String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function meaningfulTokens(s) {
    const tokens = stripAccentsLower(s).match(/[a-z0-9]{3,}/g) || [];
    return new Set(tokens.filter((t) => !GOAL_STOPWORDS.has(t)));
  }

  function matchGoalIdLocal(title, description = "") {
    const goals = (typeof Api !== "undefined" && typeof Api.getCachedGoals === "function")
      ? Api.getCachedGoals().filter((g) => !g.status || g.status === "ativo")
      : [];
    if (!goals.length) return null;

    const taskTokens = meaningfulTokens(`${title} ${description}`);
    if (!taskTokens.size) return null;

    const expanded = new Set(taskTokens);
    for (const tok of taskTokens) {
      for (const syn of (GOAL_EXPANSIONS[tok] || [])) expanded.add(syn);
    }

    let bestId = null;
    let bestScore = 0;
    for (const g of goals) {
      if (g?.id == null) continue;
      const goalTokens = meaningfulTokens(`${g.title || ""} ${g.description || ""}`);
      if (!goalTokens.size) continue;
      let direct = 0;
      for (const tok of taskTokens) if (goalTokens.has(tok)) direct++;
      let extra = 0;
      for (const tok of expanded) if (!taskTokens.has(tok) && goalTokens.has(tok)) extra++;
      const score = direct * 2 + extra;
      if (score >= 2 && score > bestScore) {
        bestScore = score;
        bestId = g.id;
      }
    }
    return bestId;
  }

  function computeDomainSteps(title, description = "", category = "geral") {
    if (!isTaskComplex(title, description, category)) return [];
    const lower = `${title || ""} ${description || ""}`.toLowerCase();
    const catLow = String(category || "geral").toLowerCase();
    const isExamOrStudy =
      /\b(?:prova|provas|exame|avalia[çc][ãa]o|estud|mat[ée]ria|aula|exerc[íi]cios?|simulado|cap[íi]tulo|disciplina)\b/i.test(lower)
      || (catLow === "estudo" && !/\b(?:slides?|apresenta[çc][ãa]o|relat[óo]rio|trabalho|tcc)\b/i.test(lower));
    const isCodeOrDev = /\b(?:c[óo]digo|codigo|github|sistema|programar|programa[çc][ãa]o|implementar|api|deploy|bug|refatorar|servidor|frontend|backend)\b/i.test(lower);
    const isReportOrPres = /\b(?:relat[óo]rio|relatorio|apresenta[çc][ãa]o|apresentacao|trabalho|slides?|semin[áa]rio|tcc|artigo|monografia|documento|resenha|proposta)\b/i.test(lower);

    let tpl;
    if (isExamOrStudy) {
      tpl = [
        ["Revisar conceitos principais e anotações", 20],
        ["Resolver exercícios práticos do tema", 25],
        ["Anotar pontos de dúvida para revisão final", 15],
      ];
    } else if (isCodeOrDev) {
      tpl = [
        ["Estruturar lógica principal e requisitos", 20],
        ["Implementar código e testar funcionamento local", 25],
        ["Fazer commit e validar entrega", 15],
      ];
    } else if (isReportOrPres || /\b(?:projeto|sql|banco de dados)\b/i.test(lower)) {
      if (/\b(?:sql|banco de dados)\b/i.test(lower)) {
        tpl = [
          ["Revisar conceitos principais e anotações", 20],
          ["Resolver exercícios práticos do tema", 25],
          ["Anotar pontos de dúvida para revisão final", 15],
        ];
      } else {
        tpl = [
          ["Definir tópicos principais e estrutura", 20],
          ["Redigir conteúdo central e exemplos", 25],
          ["Revisar formatação e versão final", 15],
        ];
      }
    } else {
      tpl = [
        ["Listar itens prioritários e etapas de execução", 15],
        ["Executar etapa principal da atividade", 25],
        ["Conferir pendências finais e concluir", 15],
      ];
    }

    return tpl.map(([stepTitle, duration_min], idx) => ({
      id: `s_${Date.now()}_${idx + 1}`,
      title: stepTitle,
      duration_min,
      done: false,
    }));
  }

  function nextId(list) {
    const max = (list || []).reduce((acc, item) => Math.max(acc, Number(item?.id) || 0), 0);
    return max + 1;
  }

  return {
    isTaskComplex,
    matchGoalIdLocal,
    computeDomainSteps,

    brainDump(text) {
      const clauses = splitClauses(text);
      const existing = Api.getCachedTasks();
      const created = [];
      clauses.forEach((cl) => {
        const low = cl.toLowerCase();
        const title = cleanActionTitle(cl);
        const cat = inferCategoryDb(low);
        const complex = isTaskComplex(title, cl, cat);
        const matchedGoalId = matchGoalIdLocal(title, cl);
        const task = {
          id: nextId([...existing, ...created]),
          title,
          description: cl,
          priority: inferPriorityDb(low),
          category: cat,
          category_id: null,
          goal_id: matchedGoalId,
          deadline: extractDeadlineIso(cl),
          duration: low.includes("prova") ? 60 : 30,
          status: "pendente",
          scheduled_date: null,
          scheduled_time: null,
          subtasks: [],
          precisa_destrinchar: complex,
        };
        created.push(task);
      });
      Api.cacheTasks([...created, ...existing]);
      return {
        items: created.map((t) => ({
          titulo: t.title,
          prioridade: t.priority === "alta" ? "Alta" : t.priority === "baixa" ? "Baixa" : "Média",
          prazo_sugerido: t.deadline,
          categoria: t.category,
          goal_id: t.goal_id,
          precisa_destrinchar: t.precisa_destrinchar,
        })),
        created_tasks: created,
        commentary: `${created.length} tarefa(s) identificada(s) e salva(s) localmente pelo MindSide.`,
        provider: "local_js_fallback",
        fallback_used: true,
      };
    },

    extractNotes(text) {
      const clauses = splitClauses(text);
      const existing = Api.getCachedTasks();
      const created = [];
      clauses.forEach((cl) => {
        if (!hasActionObligation(cl)) return;
        const low = cl.toLowerCase();
        const rawCat = inferCategoryDb(low);
        const cat = rawCat === "geral" ? "estudo" : rawCat;
        const title = cleanActionTitle(cl);
        const matchedGoalId = matchGoalIdLocal(title, cl);
        const task = {
          id: nextId([...existing, ...created]),
          title,
          description: cl,
          priority: inferPriorityDb(low),
          category: cat,
          category_id: null,
          goal_id: matchedGoalId,
          deadline: extractDeadlineIso(cl),
          duration: 30,
          status: "pendente",
          scheduled_date: null,
          scheduled_time: null,
          subtasks: [],
          precisa_destrinchar: isTaskComplex(title, cl, cat),
        };
        created.push(task);
      });
      if (!created.length) {
        const fbTitle = "Revisar pontos-chave da anotação";
        created.push({
          id: nextId(existing),
          title: fbTitle,
          description: text.slice(0, 180),
          priority: "media",
          category: "estudo",
          goal_id: matchGoalIdLocal(fbTitle, text.slice(0, 180)),
          deadline: null,
          duration: 30,
          status: "pendente",
          subtasks: [],
          precisa_destrinchar: true,
        });
      }
      Api.cacheTasks([...created, ...existing]);
      return {
        resumo_filtrado: `${created.length} ação(ões) extraída(s) localmente sem ruído.`,
        created_tasks: created,
        provider: "local_js_fallback",
        fallback_used: true,
      };
    },

    createStudyPlan(promptText) {
      const subject = cleanStudyTopic(promptText);
      const dMatch = promptText.match(/(\d+)\s*dias?/i);
      const hMatch = promptText.match(/(\d+)\s*(?:h|horas?)\b/i);
      const mMatch = promptText.match(/(\d+)\s*(?:min|minutos?)\b/i);
      const totalDays = dMatch ? Math.min(Math.max(parseInt(dMatch[1], 10), 2), 14) : 5;
      const dailyMin = hMatch
        ? Math.min(Math.max(parseInt(hMatch[1], 10) * 60, 20), 240)
        : (mMatch ? Math.min(Math.max(parseInt(mMatch[1], 10), 20), 240) : 60);

      const templates = [
        [
          `Fundamentos e mapa mental de ${subject}`,
          "Leia o básico sem travar nos detalhes e escreva um resumo de 1 página com suas palavras.",
          ["Identificar conceitos centrais e termos-chave", "Ler exemplos iniciais comentados", "Criar 5 perguntas rápidas de auto-teste"],
        ],
        [
          `Prática guiada e exercícios de ${subject}`,
          "Resolva 3 a 5 exercícios simples em sequência alternando teoria e prática.",
          ["Fazer 2 exercícios básicos com consulta", "Resolver 2 exercícios sem olhar o gabarito", "Anotar os erros mais comuns"],
        ],
        [
          `Aprofundamento e casos reais de ${subject}`,
          "Use técnica Feynman: explique em voz alta como resolver problemas intermediários.",
          ["Praticar casos intermediários do tema", "Conectar o tópico com problemas típicos de prova", "Revisar dúvidas da etapa anterior"],
        ],
        [
          `Consolidação cronometrada de ${subject}`,
          "Cronometre um bloco de exercícios mistos para ganhar fluência.",
          ["Bloco de prática cronometrada", "Corrigir falhas passo a passo", "Montar checklist de pontos críticos"],
        ],
        [
          `Simulado final e revisão ativa de ${subject}`,
          "Faça revisão espaçada priorizando apenas os pontos que ainda geram dúvida.",
          ["Simulado completo cronometrado", "Revisar exclusivamente erros e lacunas", "Descanso leve antes da avaliação"],
        ],
      ];

      const now = new Date();
      const stages = Array.from({ length: totalDays }, (_, idx) => {
        const tpl = templates[Math.min(idx, templates.length - 1)];
        return {
          index: idx,
          dia_ou_etapa: `Dia ${idx + 1}`,
          topico_principal: tpl[0],
          tempo_estimado_min: dailyMin,
          como_estudar: tpl[1],
          suggested_date: addDays(now, idx),
          task_id: null,
          subtopicos: tpl[2].map((s, j) => ({ id: `loc_${Date.now()}_${idx}_${j}`, title: s, done: false })),
        };
      });

      const plans = Api.getCachedStudyPlans();
      const plan = {
        id: nextId(plans),
        title: `Plano de Estudos — ${subject}`,
        goal_summary: `Dominar ${subject} em ${totalDays} etapas progressivas de ${dailyMin} min/dia.`,
        total_days: totalDays,
        daily_minutes: dailyMin,
        stages,
        provider_used: "local_js_fallback",
        created_at: new Date().toISOString(),
      };
      Api.cacheStudyPlans([plan, ...plans]);
      return { plan, provider: "local_js_fallback", fallback_used: true };
    },

    breakdownTask(taskId) {
      const tasks = Api.getCachedTasks();
      const target = tasks.find((t) => String(t.id) === String(taskId));
      if (!target) return null;

      if (!isTaskComplex(target.title, target.description, target.category)) {
        const msg = "Esta é uma tarefa rápida e direta — não precisa de sub-etapas!";
        return {
          task: target,
          skipped_simple: true,
          message: msg,
          dica_foco: msg,
          fallback_used: true,
        };
      }

      const steps = computeDomainSteps(target.title, target.description, target.category);
      target.subtasks = steps;
      Api.cacheTasks(tasks);
      return {
        task: target,
        skipped_simple: false,
        dica_foco: "Comece pela primeira etapa prática e avance sem sobrecarga.",
        fallback_used: true,
      };
    },

    dailyBriefing() {
      const pending = Api.getCachedTasks().filter((t) => t.status !== "concluida");
      if (!pending.length) {
        return {
          recomendacao_principal: "Sua lista de pendências está livre! Use a Caixa de Entrada Inteligente para organizar seu dia.",
          tarefa_foco_titulo: null,
          tarefa_foco_id: null,
          motivo_estrategico: "Nenhuma pendência no painel.",
          generated_at: new Date().toTimeString().slice(0, 5),
        };
      }
      const rank = { urgente: 0, alta: 1, media: 2, baixa: 3 };
      const sorted = [...pending].sort((a, b) => {
        const pa = rank[a.priority] ?? 2;
        const pb = rank[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return String(a.deadline || "9999").localeCompare(String(b.deadline || "9999"));
      });
      const top = sorted[0];
      return {
        recomendacao_principal: `Comece agora por "${top.title}". Ela possui maior prioridade${top.deadline ? ` e prazo (${top.deadline})` : ""}.`,
        tarefa_foco_titulo: top.title,
        tarefa_foco_id: top.id,
        motivo_estrategico: "Foco na tarefa de maior impacto.",
        generated_at: new Date().toTimeString().slice(0, 5),
      };
    },

    parseRoutineText(text) {
      const CANON_DAYS = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"];
      const DAY_IDX = {
        segunda: 0, seg: 0, terca: 1, ter: 1, quarta: 2, qua: 2,
        quinta: 3, qui: 3, sexta: 4, sex: 4, sabado: 5, sab: 5, domingo: 6, dom: 6,
      };
      const splitRe = /[,;\n.]+|\s+e\s+(?=(?:eu\s+|tamb[ée]m\s+)?(?:estudo|estudar|fa[çc]o|fazer|trabalho|trabalhar|treino|treinar|durmo|dormir|acordo|tenho|vou|almo[çc]o|janto|curso|aula|escola|faculdade))/i;
      const rangeRe = /(?:das?\s+)?(\d{1,2})(?::(\d{2})|h(\d{2})?)?\s*(?:às|as|até|ate|-)\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)?/i;

      const extractDays = (clause) => {
        const low = stripAccentsLower(clause);
        if (/todos os dias|todo dia|diariamente|seg a dom|segunda a domingo/.test(low)) return [...CANON_DAYS];
        if (/fim de semana|fins de semana/.test(low)) return ["Sabado", "Domingo"];
        const days = [];
        const rm = low.match(/\b(seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?|dom(?:ingo)?)(?:-feira)?\s+(?:a|ate)\s+(seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?|dom(?:ingo)?)(?:-feira)?\b/);
        if (rm) {
          const k1 = Object.keys(DAY_IDX).find((k) => rm[1].startsWith(k));
          const k2 = Object.keys(DAY_IDX).find((k) => rm[2].startsWith(k));
          if (k1 && k2) {
            const i1 = DAY_IDX[k1], i2 = DAY_IDX[k2];
            if (i1 <= i2) for (let i = i1; i <= i2; i++) days.push(CANON_DAYS[i]);
            else {
              for (let i = i1; i < 7; i++) days.push(CANON_DAYS[i]);
              for (let i = 0; i <= i2; i++) days.push(CANON_DAYS[i]);
            }
          }
        }
        const matches = low.match(/\b(?:seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?|dom(?:ingo)?)(?:-feira)?\b/g) || [];
        for (const token of matches) {
          const clean = token.replace(/-feira$/, "");
          const k = Object.keys(DAY_IDX).find((p) => clean.startsWith(p));
          if (k && !days.includes(CANON_DAYS[DAY_IDX[k]])) days.push(CANON_DAYS[DAY_IDX[k]]);
        }
        return days.length ? days : CANON_DAYS.slice(0, 5);
      };

      const parts = String(text || "").split(splitRe).map((s) => s.trim()).filter((s) => s.length >= 3);
      const blocks = [];
      let nextBlkId = 1;

      parts.forEach((cl) => {
        const low = stripAccentsLower(cl);
        const days = extractDays(cl);
        let title = "Rotina fixa";
        let cat = "rotina";
        if (/durmo|dormir|sono/.test(low)) { title = "Sono / Descanso"; cat = "sono"; }
        else if (/curso tecnico/.test(low)) { title = "Curso técnico"; cat = "estudo"; }
        else if (/curso|faculdade|escola|aula/.test(low)) { title = "Aulas / Curso"; cat = "estudo"; }
        else if (/estud/.test(low)) { title = "Horário de Estudos"; cat = "estudo"; }
        else if (/trabalh|estagio|expediente/.test(low)) { title = "Trabalho"; cat = "trabalho"; }
        else if (/academia|treino|corrida/.test(low)) { title = "Treino / Saúde"; cat = "saude"; }

        const rm = cl.match(rangeRe);
        if (rm) {
          const sh = parseInt(rm[1], 10), sm = parseInt(rm[2] || rm[3] || "0", 10);
          const eh = parseInt(rm[4], 10), em = parseInt(rm[5] || rm[6] || "0", 10);
          if (sh <= 23 && sm <= 59 && eh <= 24 && em <= 59) {
            const st = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
            const et = eh === 24 ? "23:59" : `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
            days.forEach((d) => blocks.push({ id: nextBlkId++, title, day_of_week: d, start_time: st, end_time: et, category: cat }));
            return;
          }
        }

        const smMatch = cl.match(/\b(?:durmo|dormir|sono)\s+(?:[àa]s|por volta das?)?\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)?/i);
        if (smMatch) {
          const sh = parseInt(smMatch[1], 10), mn = parseInt(smMatch[2] || smMatch[3] || "0", 10);
          if (sh <= 23 && mn <= 59) {
            const sleepDays = /seg|ter|qua|qui|sex|sab|dom/i.test(cl) ? days : [...CANON_DAYS];
            const st = `${String(sh).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
            sleepDays.forEach((d) => blocks.push({ id: nextBlkId++, title: "Sono / Descanso", day_of_week: d, start_time: st, end_time: "23:59", category: "sono" }));
          }
        }
      });

      const result = {
        routine_text: String(text || "").trim(),
        blocks,
        has_routine: Boolean(String(text || "").trim() || blocks.length),
        summary: `${blocks.length} bloco(s) fixo(s) de rotina identificado(s) localmente.`,
        provider: "local_js_fallback",
        fallback_used: true,
      };
      Api.cacheRoutine(result);
      return result;
    },

    breakdownGoal(goalId, payload = {}) {
      const goals = Api.getCachedGoals();
      const goal = goals.find((g) => String(g.id) === String(goalId));
      const title = goal?.title || "Objetivo";
      const desc = goal?.description || "";
      const combined = stripAccentsLower(`${title} ${desc}`);

      let suggested = payload?.selected_tasks;
      if (!Array.isArray(suggested) || !suggested.length) {
        if (/aprendiz|vaga|estagio|emprego|entrevista|carreira|curriculo|\bti\b/.test(combined)) {
          suggested = [
            { titulo: `Atualizar currículo destacando habilidades para ${title.slice(0, 65)}`, prioridade: "Alta", categoria: "trabalho", duracao_min: 40, resumo: "Liste experiências, cursos e projetos alinhados à vaga." },
            { titulo: "Organizar LinkedIn e portfólio no GitHub com projetos práticos", prioridade: "Alta", categoria: "trabalho", duracao_min: 35, resumo: "Deixe resumo e repositórios claros para recrutadores." },
            { titulo: "Mapear vagas abertas e enviar candidaturas direcionadas", prioridade: "Alta", categoria: "trabalho", duracao_min: 45, resumo: "Separe ao menos 5 oportunidades compatíveis." },
            { titulo: "Treinar perguntas frequentes de entrevista e pitch pessoal", prioridade: "Média", categoria: "trabalho", duracao_min: 30, resumo: "Estruture respostas objetivas sobre aprendizados." },
          ];
        } else if (/prova|passar|banco de dados|sql|estudar|materia|disciplina|vestibular|enem|concurso|curso/.test(combined)) {
          suggested = [
            { titulo: `Mapear ementa e tópicos prioritários de ${title.slice(0, 65)}`, prioridade: "Alta", categoria: "estudo", duracao_min: 35, resumo: "Liste os assuntos de maior peso nas avaliações." },
            { titulo: `Revisar conceitos centrais e montar resumo prático de ${title.slice(0, 55)}`, prioridade: "Alta", categoria: "estudo", duracao_min: 45, resumo: "Foque nos conceitos essenciais." },
            { titulo: `Resolver lista de exercícios e provas anteriores de ${title.slice(0, 50)}`, prioridade: "Alta", categoria: "estudo", duracao_min: 50, resumo: "Identifique erros recorrentes e consolide a prática." },
            { titulo: "Realizar simulado cronometrado e revisar lacunas finais", prioridade: "Média", categoria: "estudo", duracao_min: 40, resumo: "Valide o domínio do conteúdo antes da prova." },
          ];
        } else {
          suggested = [
            { titulo: `Definir plano semanal e marcos iniciais para ${title.slice(0, 65)}`, prioridade: "Alta", categoria: "pessoal", duracao_min: 30, resumo: "Estabeleça o primeiro passo prático." },
            { titulo: `Executar etapa principal de ${title.slice(0, 60)}`, prioridade: "Alta", categoria: "pessoal", duracao_min: 45, resumo: "Avance na entrega de maior impacto." },
            { titulo: `Revisar progresso e concluir pendências de ${title.slice(0, 55)}`, prioridade: "Média", categoria: "pessoal", duracao_min: 35, resumo: "Feche os detalhes finais da meta." },
          ];
        }
      }

      const created = [];
      if (payload?.auto_create) {
        const existing = Api.getCachedTasks();
        let nextTId = nextId(existing);
        suggested.forEach((it) => {
          created.push({
            id: nextTId++,
            goal_id: Number(goalId),
            title: String(it.titulo || it.title || "").slice(0, 200),
            description: String(it.resumo || it.description || ""),
            priority: String(it.prioridade || it.priority || "media").toLowerCase().includes("alta") ? "alta" : "media",
            category: String(it.categoria || it.category || "geral").toLowerCase(),
            deadline: null,
            duration: Number(it.duracao_min || 35),
            status: "pendente",
            subtasks: [],
            time_spent_seconds: 0,
            precisa_destrinchar: true,
          });
        });
        Api.cacheTasks([...created, ...existing]);
      }

      return {
        goal: goal || { id: Number(goalId), title },
        suggested_tasks: suggested,
        estrategia_objetivo: `Meta dividida em ${suggested.length} tarefas práticas conectadas.`,
        created_tasks: created,
        provider: "local_js_fallback",
        fallback_used: true,
      };
    },
  };
})();

const Api = {
  token() { return localStorage.getItem("mindside_token"); },
  getToken() { return this.token(); },

  setToken(t) { localStorage.setItem("mindside_token", t); },

  clearToken() {
    localStorage.removeItem("mindside_token");
    localStorage.removeItem("mindside_user");
    localStorage.removeItem("mindside_cached_tasks");
    localStorage.removeItem("mindside_goals_cache_v1");
    localStorage.removeItem("mindside_study_plans");
    localStorage.removeItem("mindside_daily_briefing");
    localStorage.removeItem("mindside_routine_v1");
    localStorage.removeItem("mindside_task_timers_v1");
  },

  _readCache(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  _writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cota excedida */ }
  },
  getCachedTasks() { return this._readCache("mindside_cached_tasks", []); },
  cacheTasks(tasks) { if (Array.isArray(tasks)) this._writeCache("mindside_cached_tasks", tasks); },
  getCachedGoals() { return this._readCache("mindside_goals_cache_v1", []); },
  cacheGoals(goals) { if (Array.isArray(goals)) this._writeCache("mindside_goals_cache_v1", goals); },
  getCachedStudyPlans() { return this._readCache("mindside_study_plans", []); },
  cacheStudyPlans(plans) { if (Array.isArray(plans)) this._writeCache("mindside_study_plans", plans); },
  getCachedBriefing() { return this._readCache("mindside_daily_briefing", null); },
  cacheBriefing(briefing) { if (briefing && typeof briefing === "object") this._writeCache("mindside_daily_briefing", briefing); },
  getCachedRoutine() { return this._readCache("mindside_routine_v1", { routine_text: "", blocks: [], has_routine: false }); },
  cacheRoutine(routine) { if (routine && typeof routine === "object") this._writeCache("mindside_routine_v1", routine); },

  setUser(u, { applyMode = true, forceServerMode = false } = {}) {
    if (!u) return;
    const localPref = (window.MindsideMode && typeof window.MindsideMode.getStoredPreference === "function")
      ? window.MindsideMode.getStoredPreference()
      : (() => {
          const direct = localStorage.getItem("mindside_interface_mode");
          return (direct === "complete" || direct === "simplified") ? direct : null;
        })();

    const userCopy = { ...u };
    let targetMode = null;

    if (!forceServerMode && localPref) {
      userCopy.interface_mode = localPref;
      targetMode = localPref;
    } else if (u.interface_mode === "complete" || u.interface_mode === "simplified") {
      localStorage.setItem("mindside_interface_mode", u.interface_mode);
      targetMode = u.interface_mode;
    }

    localStorage.setItem("mindside_user", JSON.stringify(userCopy));

    if (applyMode && targetMode && window.MindsideMode && typeof window.MindsideMode.apply === "function") {
      window.MindsideMode.apply(targetMode, {
        persistLocal: false,
        syncBackend: false,
        dispatch: true,
      });
    }
  },

  user() {
    try { return JSON.parse(localStorage.getItem("mindside_user") || "null"); }
    catch { return null; }
  },

  async ensureGuestSession() {
    if (this.token()) return this.token();
    if (this._guestPromise) return this._guestPromise;

    const existingLocalMode = (window.MindsideMode && typeof window.MindsideMode.getStoredPreference === "function")
      ? window.MindsideMode.getStoredPreference()
      : localStorage.getItem("mindside_interface_mode");

    this._guestPromise = (async () => {
      let resp;
      try {
        resp = await fetch(`${API_BASE}/api/auth/guest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        throw { status: 0, message: "Backend offline — operando no modo local." };
      }

      let data = null;
      try { data = await resp.json(); } catch { /* sem corpo */ }

      if (!resp.ok || !data?.access_token) {
        const detail = data && data.detail ? data.detail : "Não foi possível iniciar a sessão de visitante.";
        throw { status: resp.status, message: typeof detail === "string" ? detail : JSON.stringify(detail), raw: data };
      }

      this.setToken(data.access_token);
      if (
        (existingLocalMode === "complete" || existingLocalMode === "simplified")
        && data.user
        && data.user.interface_mode !== existingLocalMode
      ) {
        data.user.interface_mode = existingLocalMode;
        this.setUser(data.user, { applyMode: true });
        try {
          await this.updateProfile({ interface_mode: existingLocalMode });
        } catch {
          // Mantém preferência local
        }
      } else {
        this.setUser(data.user, { applyMode: true });
      }
      return data.access_token;
    })();

    try {
      return await this._guestPromise;
    } finally {
      this._guestPromise = null;
    }
  },

  async request(path, { method = "GET", body = null, auth = true, keepalive = false } = {}) {
    if (auth) await this.ensureGuestSession();

    const serializedBody = body ? JSON.stringify(body) : undefined;
    const useKeepalive = Boolean(keepalive && (!serializedBody || serializedBody.length < 32768));

    const doRequest = async () => {
      const headers = { "Content-Type": "application/json" };
      if (auth && this.token()) headers["Authorization"] = `Bearer ${this.token()}`;

      try {
        return await fetch(`${API_BASE}${path}`, {
          method, headers, body: serializedBody, keepalive: useKeepalive,
        });
      } catch (err) {
        throw { status: 0, message: "Não foi possível conectar ao servidor do MINDSIDE. Verifique se o backend está rodando." };
      }
    };

    let resp = await doRequest();

    if (resp.status === 401 && auth) {
      this.clearToken();
      await this.ensureGuestSession();
      resp = await doRequest();
    }

    if (resp.status === 204) return null;

    let data = null;
    try { data = await resp.json(); } catch { /* sem corpo */ }

    if (!resp.ok) {
      const detail = data && data.detail ? data.detail : "Ocorreu um erro.";
      const message = typeof detail === "string" ? detail : (detail.message || JSON.stringify(detail));
      throw { status: resp.status, message, raw: data };
    }
    return data;
  },

  // ---- Auth ----
  register(payload) { return this.request("/api/auth/register", { method: "POST", body: payload, auth: false }); },
  login(payload) { return this.request("/api/auth/login", { method: "POST", body: payload, auth: false }); },
  async me() {
    try { return await this.request("/api/auth/me"); }
    catch (err) { if (err?.status === 0) return this.user() || { id: 0, name: "Visitante", email: "local", interface_mode: window.MindsideMode?.current?.() || "complete" }; throw err; }
  },
  updateProfile(payload) { return this.request("/api/auth/me", { method: "PUT", body: payload, keepalive: true }); },

  // ---- Categories & Availability ----
  async listCategories() {
    try { return await this.request("/api/categories"); }
    catch (err) { if (err?.status === 0) return []; throw err; }
  },
  createCategory(p) { return this.request("/api/categories", { method: "POST", body: p }); },
  deleteCategory(id) { return this.request(`/api/categories/${id}`, { method: "DELETE" }); },
  async listAvailability() {
    try { return await this.request("/api/availability"); }
    catch (err) { if (err?.status === 0) return []; throw err; }
  },
  createAvailability(p) { return this.request("/api/availability", { method: "POST", body: p }); },
  deleteAvailability(id) { return this.request(`/api/availability/${id}`, { method: "DELETE" }); },

  // ---- Tasks (Sincronizadas com localStorage se backend estiver offline) ----
  async listTasks() {
    try {
      const tasks = await this.request("/api/tasks");
      this.cacheTasks(tasks);
      return tasks;
    } catch (err) {
      if (err?.status === 0) return this.getCachedTasks();
      throw err;
    }
  },
  async createTask(p) {
    try {
      const created = await this.request("/api/tasks", { method: "POST", body: p });
      const cached = this.getCachedTasks().filter((t) => t.id !== created.id);
      this.cacheTasks([created, ...cached]);
      return created;
    } catch (err) {
      if (err?.status === 0) {
        const list = this.getCachedTasks();
        const maxId = list.reduce((acc, t) => Math.max(acc, Number(t.id) || 0), 0);
        const local = { id: maxId + 1, subtasks: [], ...p };
        this.cacheTasks([local, ...list]);
        return local;
      }
      throw err;
    }
  },
  async updateTask(id, p) {
    try {
      const updated = await this.request(`/api/tasks/${id}`, { method: "PUT", body: p });
      const cached = this.getCachedTasks().map((t) => (t.id == updated.id ? updated : t));
      this.cacheTasks(cached);
      return updated;
    } catch (err) {
      if (err?.status === 0) {
        const list = this.getCachedTasks();
        let found = null;
        const next = list.map((t) => {
          if (String(t.id) === String(id)) {
            found = { ...t, ...p };
            return found;
          }
          return t;
        });
        this.cacheTasks(next);
        return found;
      }
      throw err;
    }
  },
  async deleteTask(id) {
    try {
      const res = await this.request(`/api/tasks/${id}`, { method: "DELETE" });
      this.cacheTasks(this.getCachedTasks().filter((t) => t.id != id));
      return res;
    } catch (err) {
      if (err?.status === 0) {
        this.cacheTasks(this.getCachedTasks().filter((t) => String(t.id) !== String(id)));
        return null;
      }
      throw err;
    }
  },

  // ---- Appointments ----
  async listAppointments() {
    try { return await this.request("/api/appointments"); }
    catch (err) { if (err?.status === 0) return []; throw err; }
  },
  createAppointment(p) { return this.request("/api/appointments", { method: "POST", body: p }); },
  updateAppointment(id, p) { return this.request(`/api/appointments/${id}`, { method: "PUT", body: p }); },
  deleteAppointment(id) { return this.request(`/api/appointments/${id}`, { method: "DELETE" }); },

  // ---- Goals ----
  async listGoals() {
    try {
      const goals = await this.request("/api/goals");
      this.cacheGoals(goals);
      return goals;
    } catch (err) {
      if (err?.status === 0) return this.getCachedGoals();
      throw err;
    }
  },
  async createGoal(p) {
    const created = await this.request("/api/goals", { method: "POST", body: p });
    if (created) this.cacheGoals([created, ...this.getCachedGoals().filter((g) => g.id !== created.id)]);
    return created;
  },
  async updateGoal(id, p) {
    const updated = await this.request(`/api/goals/${id}`, { method: "PUT", body: p });
    if (updated) this.cacheGoals(this.getCachedGoals().map((g) => (g.id == updated.id ? updated : g)));
    return updated;
  },
  async deleteGoal(id) {
    const res = await this.request(`/api/goals/${id}`, { method: "DELETE" });
    this.cacheGoals(this.getCachedGoals().filter((g) => g.id != id));
    return res;
  },

  // ---- AI / Suggestions & Inteligência Executiva (com Fallback Local Automático) ----
  analyze(text) { return this.request("/api/ai/analyze", { method: "POST", body: { text } }); },
  async brainDump(text, auto_create = true) {
    try {
      const res = await this.request("/api/ai/brain-dump", { method: "POST", body: { text, auto_create } });
      if (Array.isArray(res?.created_tasks) && res.created_tasks.length) {
        const ids = new Set(res.created_tasks.map((t) => t.id));
        const rest = this.getCachedTasks().filter((t) => !ids.has(t.id));
        this.cacheTasks([...res.created_tasks, ...rest]);
      }
      return res;
    } catch (err) {
      if (err?.status === 0) return LocalMindsideEngine.brainDump(text);
      throw err;
    }
  },
  async breakdownTask(taskId) {
    try {
      const res = await this.request(`/api/ai/tasks/${taskId}/breakdown`, { method: "POST" });
      if (res?.task) {
        const cached = this.getCachedTasks().map((t) => (t.id == res.task.id ? res.task : t));
        this.cacheTasks(cached);
      }
      return res;
    } catch (err) {
      if (err?.status === 0) return LocalMindsideEngine.breakdownTask(taskId);
      throw err;
    }
  },
  async getDailyBriefing(refresh = false) {
    try {
      const res = await this.request("/api/ai/briefing", { method: refresh ? "POST" : "GET" });
      this.cacheBriefing(res);
      return res;
    } catch (err) {
      if (err?.status === 0) {
        const res = LocalMindsideEngine.dailyBriefing();
        this.cacheBriefing(res);
        return res;
      }
      throw err;
    }
  },
  async extractNotes(text, auto_create = true) {
    try {
      const res = await this.request("/api/ai/extract-notes", { method: "POST", body: { text, auto_create } });
      if (Array.isArray(res?.created_tasks) && res.created_tasks.length) {
        const ids = new Set(res.created_tasks.map((t) => t.id));
        const rest = this.getCachedTasks().filter((t) => !ids.has(t.id));
        this.cacheTasks([...res.created_tasks, ...rest]);
      }
      return res;
    } catch (err) {
      if (err?.status === 0) return LocalMindsideEngine.extractNotes(text);
      throw err;
    }
  },
  async listStudyPlans() {
    try {
      const plans = await this.request("/api/ai/study-plans");
      this.cacheStudyPlans(plans);
      return plans;
    } catch (err) {
      if (err?.status === 0) return this.getCachedStudyPlans();
      throw err;
    }
  },
  async createStudyPlan(text) {
    try {
      const res = await this.request("/api/ai/study-plan", { method: "POST", body: { text } });
      if (res?.plan) {
        const rest = this.getCachedStudyPlans().filter((p) => p.id !== res.plan.id);
        this.cacheStudyPlans([res.plan, ...rest]);
      }
      return res;
    } catch (err) {
      if (err?.status === 0) return LocalMindsideEngine.createStudyPlan(text);
      throw err;
    }
  },
  async updateStudyPlan(planId, stages) {
    try {
      const updated = await this.request(`/api/ai/study-plans/${planId}`, { method: "PUT", body: { stages } });
      const cached = this.getCachedStudyPlans().map((p) => (p.id == updated.id ? updated : p));
      this.cacheStudyPlans(cached);
      return updated;
    } catch (err) {
      if (err?.status === 0) {
        let updated = null;
        const next = this.getCachedStudyPlans().map((p) => {
          if (String(p.id) === String(planId)) {
            updated = { ...p, stages };
            return updated;
          }
          return p;
        });
        this.cacheStudyPlans(next);
        return updated;
      }
      throw err;
    }
  },
  async convertStudyPlanToTasks(planId, stage_index = null) {
    try {
      const body = stage_index === null ? {} : { stage_index };
      const res = await this.request(`/api/ai/study-plans/${planId}/to-tasks`, { method: "POST", body });
      if (res?.plan) {
        this.cacheStudyPlans(this.getCachedStudyPlans().map((p) => (p.id == res.plan.id ? res.plan : p)));
      }
      if (Array.isArray(res?.created_tasks) && res.created_tasks.length) {
        const ids = new Set(res.created_tasks.map((t) => t.id));
        const rest = this.getCachedTasks().filter((t) => !ids.has(t.id));
        this.cacheTasks([...res.created_tasks, ...rest]);
      }
      return res;
    } catch (err) {
      if (err?.status === 0) {
        const plans = this.getCachedStudyPlans();
        const plan = plans.find((p) => String(p.id) === String(planId));
        if (!plan) return { plan: null, created_tasks: [] };
        const tasks = this.getCachedTasks();
        let nextIdVal = tasks.reduce((a, t) => Math.max(a, Number(t.id) || 0), 0) + 1;
        const created = [];
        plan.stages.forEach((st, idx) => {
          if (stage_index !== null && idx !== stage_index) return;
          if (st.task_id) return;
          const t = {
            id: nextIdVal++,
            title: `[${st.dia_ou_etapa}] ${st.topico_principal}`,
            description: `Como estudar: ${st.como_estudar || ""}`,
            priority: idx === 0 ? "alta" : "media",
            category: "estudo",
            deadline: st.suggested_date || localTodayIso(),
            duration: st.tempo_estimado_min || 60,
            status: "pendente",
            subtasks: (st.subtopicos || []).map((s, j) => ({
              id: s.id || `sub_${Date.now()}_${j}`,
              title: s.title || String(s),
              duration_min: 20,
              done: Boolean(s.done),
            })),
          };
          st.task_id = t.id;
          created.push(t);
        });
        this.cacheTasks([...created, ...tasks]);
        this.cacheStudyPlans(plans);
        return { plan, created_tasks: created };
      }
      throw err;
    }
  },
  async reorganizeStudyPlan(planId) {
    try {
      const res = await this.request(`/api/ai/study-plans/${planId}/reorganize`, { method: "POST" });
      if (res?.plan) {
        this.cacheStudyPlans(this.getCachedStudyPlans().map((p) => (p.id == res.plan.id ? res.plan : p)));
      }
      return res;
    } catch (err) {
      if (err?.status === 0) {
        const plans = this.getCachedStudyPlans();
        const plan = plans.find((p) => String(p.id) === String(planId));
        if (!plan) return { plan: null, rescheduled_stages: 0, updated_tasks: 0 };
        let offset = 0;
        const today = new Date();
        plan.stages.forEach((st) => {
          const allDone = (st.subtopicos || []).length > 0 && st.subtopicos.every((s) => Boolean(s.done));
          if (allDone) return;
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12);
          st.suggested_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          st.dia_ou_etapa = `Dia ${offset + 1} (reagendado)`;
          offset += 1;
        });
        this.cacheStudyPlans(plans);
        return { plan, rescheduled_stages: offset, updated_tasks: 0 };
      }
      throw err;
    }
  },
  async deleteStudyPlan(planId) {
    try {
      const res = await this.request(`/api/ai/study-plans/${planId}`, { method: "DELETE" });
      this.cacheStudyPlans(this.getCachedStudyPlans().filter((p) => p.id != planId));
      return res;
    } catch (err) {
      if (err?.status === 0) {
        this.cacheStudyPlans(this.getCachedStudyPlans().filter((p) => String(p.id) !== String(planId)));
        return null;
      }
      throw err;
    }
  },
  async getRoutine() {
    try {
      const res = await this.request("/api/ai/routine");
      this.cacheRoutine(res);
      return res;
    } catch (err) {
      if (err?.status === 0) return this.getCachedRoutine();
      throw err;
    }
  },
  async saveRoutine(text) {
    try {
      const res = await this.request("/api/ai/routine", { method: "POST", body: { text } });
      this.cacheRoutine(res);
      return res;
    } catch (err) {
      if (err?.status === 0) return LocalMindsideEngine.parseRoutineText(text);
      throw err;
    }
  },
  async deleteRoutineBlock(blockId) {
    try {
      const res = await this.request(`/api/ai/routine/${blockId}`, { method: "DELETE" });
      const cur = this.getCachedRoutine();
      cur.blocks = (cur.blocks || []).filter((b) => String(b.id) !== String(blockId));
      cur.has_routine = Boolean((cur.routine_text || "").trim() || cur.blocks.length);
      this.cacheRoutine(cur);
      return res;
    } catch (err) {
      if (err?.status === 0) {
        const cur = this.getCachedRoutine();
        cur.blocks = (cur.blocks || []).filter((b) => String(b.id) !== String(blockId));
        cur.has_routine = Boolean((cur.routine_text || "").trim() || cur.blocks.length);
        this.cacheRoutine(cur);
        return null;
      }
      throw err;
    }
  },
  async breakdownGoal(goalId, payload = { auto_create: false }) {
    try {
      const res = await this.request(`/api/ai/goals/${goalId}/breakdown`, { method: "POST", body: payload });
      if (Array.isArray(res?.created_tasks) && res.created_tasks.length) {
        const ids = new Set(res.created_tasks.map((t) => t.id));
        const rest = this.getCachedTasks().filter((t) => !ids.has(t.id));
        this.cacheTasks([...res.created_tasks, ...rest]);
      }
      return res;
    } catch (err) {
      if (err?.status === 0) return LocalMindsideEngine.breakdownGoal(goalId, payload);
      throw err;
    }
  },
  async listSuggestions() {
    try { return await this.request("/api/suggestions"); }
    catch (err) { if (err?.status === 0) return []; throw err; }
  },
  editSuggestion(id, structured_data, note = "") { return this.request(`/api/suggestions/${id}`, { method: "PUT", body: { structured_data, note } }); },
  regenerateSuggestion(id) { return this.request(`/api/suggestions/${id}/regenerate`, { method: "POST" }); },
  approveSuggestion(id) { return this.request(`/api/suggestions/${id}/approve`, { method: "POST" }); },
  rejectSuggestion(id) { return this.request(`/api/suggestions/${id}/reject`, { method: "POST" }); },
  listSuggestionDecisions(id) { return this.request(`/api/suggestions/${id}/decisions`); },
  listSuggestionValidations(id) { return this.request(`/api/suggestions/${id}/validations`); },

  // ---- Demo & History ----
  seedDemo() { return this.request("/api/demo/seed", { method: "POST" }); },
  async resetDemo() {
    const SESSION_CACHE_KEYS = [
      "mindside_cached_tasks",
      "mindside_goals_cache_v1",
      "mindside_study_plans",
      "mindside_daily_briefing",
      "mindside_routine_v1",
      "mindside_task_timers_v1",
      "mindside_ai_chat_history_v1",
    ];
    let res = { status: "ok" };
    try {
      res = await this.request("/api/demo/reset", { method: "POST" });
    } catch (err) {
      if (err?.status !== 0) throw err;
    }
    SESSION_CACHE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* ignora erro */ }
    });
    return res || { status: "ok" };
  },
  listHistory() { return this.request("/api/history"); },
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function localTodayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

window.escapeHtml = escapeHtml;
window.localTodayIso = localTodayIso;
window.LocalMindsideEngine = LocalMindsideEngine;
