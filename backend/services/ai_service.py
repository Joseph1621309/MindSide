"""Camada de IA: converte texto em sugestões, sem acessar ou alterar o banco."""
import asyncio
import json
import logging
import re
import unicodedata
import uuid
from contextvars import ContextVar
from datetime import date, datetime, timedelta
from typing import Dict, Any, List, Optional, Type, Callable

import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError
import schemas
from config import settings
from services.validation_service import validate_suggestion

logger = logging.getLogger(__name__)

WEEKDAYS = {
    "segunda": 0, "segunda-feira": 0,
    "terca": 1, "terça": 1, "terca-feira": 1, "terça-feira": 1,
    "quarta": 2, "quarta-feira": 2,
    "quinta": 3, "quinta-feira": 3,
    "sexta": 4, "sexta-feira": 4,
    "sabado": 5, "sábado": 5,
    "domingo": 6,
}

PRIORITY_KEYWORDS = {
    "urgente": "urgente",
    "urgência": "urgente",
    "muito importante": "alta",
    "importante": "alta",
    "prazo final": "alta",
    "apresentação": "alta",
    "defesa": "alta",
    "prova": "alta",
    "exame": "alta",
    "prazo": "alta",
    "entregar": "alta",
    "entrega": "alta",
}

LOW_PRIORITY_KEYWORDS = (
    "comprar", "café", "cafe", "mercado", "supermercado", "feira",
    "farmácia", "agua", "água", "limpar", "arrumar", "lavar", "passear", "descansar",
)

ACTION_SPLIT_VERBS = (
    "preciso", "precisamos", "quero", "tenho", "temos", "devo", "devemos", "vou", "vamos",
    "falta", "lembrar", "terminar", "comprar", "fazer", "estudar", "revisar", "entregar",
    "enviar", "subir", "atualizar", "ler", "escrever", "preparar", "resolver", "mandar",
    "pagar", "agendar", "ligar", "buscar", "limpar", "arrumar", "organizar", "concluir",
    "finalizar", "ir", "assistir", "praticar", "corrigir", "implementar", "criar", "testar",
    "ver", "levar", "trazer", "pegar", "passar", "responder", "confirmar", "marcar",
    "visitar", "treinar", "correr", "montar", "editar", "publicar", "commitar", "checar",
    "baixar", "instalar", "pesquisar", "completar",
)

CATEGORY_KEYWORDS = {
    "prova": "estudo", "estudar": "estudo", "matéria": "estudo", "trabalho de": "estudo",
    "faculdade": "estudo", "aula": "estudo", "programação": "estudo", "matemática": "estudo",
    "banco de dados": "estudo", "sql": "estudo", "slides": "estudo",
    "relatório": "trabalho", "relatorio": "trabalho", "github": "trabalho",
    "código": "trabalho", "codigo": "trabalho", "reunião": "trabalho",
    "projeto": "trabalho", "trabalho": "trabalho",
    "treino": "saude", "academia": "saude", "corrida": "saude", "médico": "saude",
    "cinema": "lazer", "festa": "lazer", "passeio": "lazer",
    "comprar": "pessoal", "café": "pessoal", "mercado": "pessoal",
}

COMPLEX_TASK_REGEX = re.compile(
    r"\b(?:"
    r"prova|provas|exame|exames|avalia[çc][ãa]o|avalia[çc][õo]es|"
    r"relat[óo]rio|relat[óo]rios|trabalho|trabalhos|projeto|projetos|"
    r"sistema|sistemas|c[óo]digo|c[óo]digos|github|programar|programa[çc][ãa]o|"
    r"implementar|api|sql|banco de dados|"
    r"apresenta[çc][ãa]o|apresenta[çc][õo]es|slides?|semin[áa]rio|semin[áa]rios|"
    r"estudar|estudando|estudo|estudos|revisar|revis[ãa]o|plano|planejar|planejamento|"
    r"pesquisa|pesquisar|artigo|tcc|monografia|documenta[çc][ãa]o|"
    r"arquitetura|deploy|refatorar|bug|organizar evento|faxina completa|"
    r"curso|m[óo]dulo|exerc[íi]cios?|cap[íi]tulo|lista de|simulado"
    r")\b",
    re.IGNORECASE,
)

SIMPLE_TASK_REGEX = re.compile(
    r"\b(?:"
    r"comprar(?:\s+[a-zà-ÿ0-9-]+){0,3}|"
    r"ir\s+(?:ao\s+mercado|ao\s+supermercado|na\s+padaria|[àa]\s+padaria|[àa]\s+farm[áa]cia|ao\s+banco)|"
    r"beber\s+[áa]gua|tomar\s+(?:[áa]gua|rem[ée]dio|vitamina|caf[ée])|"
    r"ligar\s+para|telefonar(?:\s+para)?|"
    r"pagar\s+(?:a\s+|o\s+)?(?:conta|boleto|fatura|luz|[áa]gua|internet|aluguel|cart[ãa]o)|"
    r"enviar\s+(?:um\s+|o\s+)?(?:e-?mail|mensagem|[áa]udio)|"
    r"mandar\s+(?:um\s+|o\s+)?(?:e-?mail|mensagem|zap|whatsapp|[áa]udio)|"
    r"responder\s+(?:a\s+|o\s+)?(?:e-?mail|mensagem|whatsapp)|"
    r"levar\s+(?:o\s+)?lixo|tirar\s+(?:o\s+)?lixo|"
    r"lavar\s+(?:a\s+)?lou[çc]a|arrumar\s+(?:a\s+)?cama|"
    r"buscar\s+encomenda|pegar\s+encomenda|agendar\s+consulta|marcar\s+consulta"
    r")\b",
    re.IGNORECASE,
)


def is_task_complex(title: str, description: str = "", category: str = "geral") -> bool:
    """Identifica se uma tarefa demanda micro-passos ('⚡ Destrinchar') ou se é ação rápida/atômica."""
    title_low = (title or "").strip().lower()
    if not title_low:
        return False

    cat_low = (category or "geral").strip().lower()
    has_complex_in_title = bool(COMPLEX_TASK_REGEX.search(title_low))
    has_simple_in_title = bool(SIMPLE_TASK_REGEX.search(title_low))

    if has_simple_in_title and not has_complex_in_title:
        return False
    if has_complex_in_title:
        return True

    desc_low = (description or "").strip().lower()
    if desc_low and not has_simple_in_title and COMPLEX_TASK_REGEX.search(desc_low):
        return True

    words = [w for w in re.split(r"\s+", title_low) if w]
    if len(words) <= 3 and cat_low not in ("estudo", "trabalho"):
        return False

    return True


WEEKDAYS_PT_FULL = [
    "segunda-feira", "terça-feira", "quarta-feira",
    "quinta-feira", "sexta-feira", "sábado", "domingo",
]

_ANALYZE_CONTEXT_VAR: ContextVar[str] = ContextVar("_ANALYZE_CONTEXT_VAR", default="")

FORBIDDEN_SUBTASK_PHRASES = (
    "preparar ambiente",
    "preparar o ambiente",
    "separar materiais",
    "bloco focado",
    "25 min sem distrações",
    "25 minutos sem distrações",
    "pomodoro",
)


def _contains_forbidden_subtask_phrase(text: str) -> bool:
    low = (text or "").lower()
    return any(phrase in low for phrase in FORBIDDEN_SUBTASK_PHRASES)


def _domain_steps_for_task(
    task_title: str,
    task_desc: str = "",
    category: str = "geral",
) -> List[Dict[str, Any]]:
    """Gera 3 passos práticos e específicos para o domínio da tarefa, sem frases genéricas."""
    lower = f"{task_title} {task_desc}".lower()
    cat_low = (category or "geral").strip().lower()

    is_exam_or_study = bool(
        re.search(
            r"\b(?:prova|provas|exame|avalia[çc][ãa]o|estud|mat[ée]ria|aula|exerc[íi]cios?|simulado|cap[íi]tulo|disciplina)\b",
            lower,
        )
        or (cat_low == "estudo" and not re.search(r"\b(?:slides?|apresenta[çc][ãa]o|relat[óo]rio|trabalho|tcc)\b", lower))
    )
    is_code_or_dev = bool(
        re.search(
            r"\b(?:c[óo]digo|codigo|github|sistema|programar|programa[çc][ãa]o|implementar|api|deploy|bug|refatorar|servidor|frontend|backend)\b",
            lower,
        )
    )
    is_report_or_pres = bool(
        re.search(
            r"\b(?:relat[óo]rio|relatorio|apresenta[çc][ãa]o|apresentacao|trabalho|slides?|semin[áa]rio|tcc|artigo|monografia|documento|resenha|proposta)\b",
            lower,
        )
    )

    if is_exam_or_study:
        return [
            {"titulo": "Revisar conceitos principais e anotações", "tempo_estimado_min": 20},
            {"titulo": "Resolver exercícios práticos do tema", "tempo_estimado_min": 25},
            {"titulo": "Anotar pontos de dúvida para revisão final", "tempo_estimado_min": 15},
        ]
    if is_code_or_dev:
        return [
            {"titulo": "Estruturar lógica principal e requisitos", "tempo_estimado_min": 20},
            {"titulo": "Implementar código e testar funcionamento local", "tempo_estimado_min": 25},
            {"titulo": "Fazer commit e validar entrega", "tempo_estimado_min": 15},
        ]
    if is_report_or_pres or re.search(r"\b(?:projeto|sql|banco de dados)\b", lower):
        if re.search(r"\b(?:sql|banco de dados)\b", lower):
            return [
                {"titulo": "Revisar conceitos principais e anotações", "tempo_estimado_min": 20},
                {"titulo": "Resolver exercícios práticos do tema", "tempo_estimado_min": 25},
                {"titulo": "Anotar pontos de dúvida para revisão final", "tempo_estimado_min": 15},
            ]
        return [
            {"titulo": "Definir tópicos principais e estrutura", "tempo_estimado_min": 20},
            {"titulo": "Redigir conteúdo central e exemplos", "tempo_estimado_min": 25},
            {"titulo": "Revisar formatação e versão final", "tempo_estimado_min": 15},
        ]
    return [
        {"titulo": "Listar itens prioritários e etapas de execução", "tempo_estimado_min": 15},
        {"titulo": "Executar etapa principal da atividade", "tempo_estimado_min": 25},
        {"titulo": "Conferir pendências finais e concluir", "tempo_estimado_min": 15},
    ]


def build_domain_subtasks_list(
    task_title: str,
    task_desc: str = "",
    category: str = "geral",
    candidate_steps: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Decompõe apenas tarefas complexas em micro-etapas práticas sem frases genéricas."""
    if not is_task_complex(task_title, task_desc, category):
        return []

    steps_raw: Optional[List[Dict[str, Any]]] = None
    if candidate_steps and isinstance(candidate_steps, list):
        cleaned: List[Dict[str, Any]] = []
        for s in candidate_steps[:5]:
            if not isinstance(s, dict):
                continue
            step_title = str(s.get("titulo") or s.get("title") or "").strip()[:180]
            if not step_title or _contains_forbidden_subtask_phrase(step_title):
                cleaned = []
                break
            cleaned.append({
                "id": str(s.get("id") or uuid.uuid4().hex[:8]),
                "title": step_title,
                "duration_min": int(s.get("tempo_estimado_min") or s.get("duration_min") or 20),
                "done": bool(s.get("done", False)),
            })
        if len(cleaned) >= 2:
            return cleaned

    steps_raw = _domain_steps_for_task(task_title, task_desc, category)
    return [
        {
            "id": uuid.uuid4().hex[:8],
            "title": step["titulo"][:180],
            "duration_min": int(step.get("tempo_estimado_min") or 20),
            "done": False,
        }
        for step in steps_raw
    ]


_GOAL_STOPWORDS = {
    "para", "com", "sem", "uma", "uns", "umas", "dos", "das", "nos", "nas",
    "que", "por", "meu", "minha", "meus", "minhas", "seu", "sua", "sobre",
    "fazer", "preciso", "tenho", "quero", "vou", "devo", "hoje", "amanha",
    "sexta", "segunda", "terca", "quarta", "quinta", "sabado", "domingo",
    "ainda", "tudo", "mais", "menos", "entre", "tarefa", "estudar",
    "aprender", "revisar", "preparar", "terminar", "entrega", "entregar",
}

_GOAL_DOMAIN_EXPANSIONS = {
    "sql": {"banco", "dados", "queries", "joins", "subqueries", "prova"},
    "banco": {"sql", "dados", "relacional", "modelagem"},
    "dados": {"sql", "banco"},
    "github": {"codigo", "projeto", "sistema", "git", "prototipo", "api"},
    "codigo": {"github", "projeto", "sistema", "programacao", "api"},
    "api": {"sistema", "projeto", "codigo", "backend", "github"},
    "slides": {"apresentar", "apresentacao", "pitch", "seminario", "roteiro"},
    "pitch": {"apresentar", "apresentacao", "slides", "roteiro"},
    "roteiro": {"apresentar", "pitch", "slides", "seminario"},
    "apresentar": {"slides", "pitch", "roteiro", "seminario"},
    "sic": {"cientifica", "pesquisa", "apresentar", "mindside", "prototipo", "pitch"},
    "tcc": {"monografia", "artigo", "pesquisa", "faculdade", "formatura"},
    "relatorio": {"documento", "projeto", "pesquisa"},
}


def _strip_accents_lower(text: str) -> str:
    norm = unicodedata.normalize("NFKD", text or "")
    return norm.encode("ascii", "ignore").decode("ascii").lower()


def _meaningful_tokens(text: str) -> set[str]:
    ascii_low = _strip_accents_lower(text)
    tokens = re.findall(r"[a-z0-9]{3,}", ascii_low)
    return {t for t in tokens if t not in _GOAL_STOPWORDS}


def match_goal_id_for_task(
    title: str,
    description: str = "",
    active_goals: Optional[List[Dict[str, Any]]] = None,
    candidate_goal_id: Optional[int] = None,
) -> Optional[int]:
    """Associa automaticamente o ID de um Objetivo ativo compatível com a tarefa."""
    goals = active_goals or []
    if not goals:
        return None

    valid_ids = {int(g["id"]) for g in goals if g.get("id") is not None}
    if candidate_goal_id is not None:
        try:
            cand = int(candidate_goal_id)
            if cand in valid_ids:
                return cand
        except (TypeError, ValueError):
            pass

    task_tokens = _meaningful_tokens(f"{title} {description}")
    if not task_tokens:
        return None

    task_expanded = set(task_tokens)
    for tok in task_tokens:
        task_expanded.update(_GOAL_DOMAIN_EXPANSIONS.get(tok, set()))

    best_id = None
    best_score = 0
    for g in goals:
        gid = g.get("id")
        if gid is None:
            continue
        goal_tokens = _meaningful_tokens(f"{g.get('title', '')} {g.get('description', '')}")
        if not goal_tokens:
            continue
        direct_hits = len(task_tokens & goal_tokens)
        expanded_hits = len(task_expanded & goal_tokens) - direct_hits
        score = direct_hits * 2 + max(0, expanded_hits)
        if score >= 2 and score > best_score:
            best_score = score
            best_id = int(gid)

    return best_id


def build_analyze_system_prompt(today: Optional[date] = None, extra_context: str = "") -> str:
    """Constroi o SYSTEM_PROMPT com data/dia atual em português e regras do schema Pydantic."""
    ref_today = today or date.today()
    weekday_pt = WEEKDAYS_PT_FULL[ref_today.weekday()]
    prompt = (
        "Você é a camada de interpretação de linguagem natural do MINDSIDE, um "
        "secretário digital para jovens e estudantes.\n"
        f"DATA ATUAL DO SISTEMA: Hoje é {weekday_pt}, {ref_today.isoformat()}.\n"
        "REGRAS OBRIGATÓRIAS:\n"
        "1. Converta termos relativos como 'hoje', 'amanhã', 'sexta', 'sábado', 'segunda' na data EXATA no formato AAAA-MM-DD com base na DATA ATUAL DO SISTEMA.\n"
        "2. Extraia DE 1 A 5 sugestões estruturadas (uma para cada compromisso ou tarefa distinta mencionada).\n"
        "3. Se houver OBJETIVOS ATIVOS no contexto e a tarefa contribuir diretamente para um deles, preencha goal_id com o id numérico correspondente (caso contrário use null).\n"
        "4. Defina precisa_destrinchar=false para tarefas simples/atômicas (ex.: 'comprar café', 'pagar conta', 'enviar mensagem') e true para tarefas complexas (estudos, provas, projetos, código, relatórios).\n"
        "5. Para tarefas complexas (precisa_destrinchar=true), sugira 3 sub-tarefas práticas específicas do tema em subtasks — PROIBIDO usar frases genéricas como 'Executar bloco focado de 25 minutos' ou 'Preparar ambiente'.\n"
        "6. Ao sugerir ou validar horários, considere os compromissos existentes e prefira os HORÁRIOS DISPONÍVEIS (AvailableSlot) do contexto.\n"
        "7. Responda EXCLUSIVAMENTE com JSON válido aderente ao schema estruturado, usando:\n"
        '{"suggestions":[{"type":"tarefa|compromisso","title":"...","description":"...",'
        '"priority":"baixa|media|alta|urgente","date":"AAAA-MM-DD ou null",'
        '"time":"HH:MM ou null","duration_minutes":30,"category":"estudo|trabalho|saude|lazer|pessoal|geral",'
        '"goal_id":null,"precisa_destrinchar":true,"subtasks":null}],'
        '"reasoning_summary":"..."}'
    )
    if extra_context and extra_context.strip():
        prompt = f"{prompt}\n\n{extra_context.strip()}"
    return prompt


SYSTEM_PROMPT = build_analyze_system_prompt()


class AIResponseError(ValueError):
    """Resposta do provedor não corresponde ao contrato de sugestões do Mindside."""


def _parse_provider_response(raw_text: str) -> Dict[str, Any]:
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise AIResponseError("resposta vazia")

    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.removeprefix("```json").removeprefix("```")
        raw_text = raw_text.removesuffix("```").strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise AIResponseError("JSON inválido") from exc

    if not isinstance(result, dict):
        raise AIResponseError("objeto JSON esperado")
    suggestions = result.get("suggestions")
    if not isinstance(suggestions, list) or not suggestions or len(suggestions) > 5:
        raise AIResponseError("lista de sugestões ausente ou vazia")
    for item in suggestions:
        if not isinstance(item, dict):
            raise AIResponseError("formato de sugestão inválido")
        title = item.get("title")
        description = item.get("description", "")
        if not isinstance(title, str) or len(title) > 200:
            raise AIResponseError("título incompatível")
        if not isinstance(description, str) or len(description) > 5000:
            raise AIResponseError("descrição incompatível")
        try:
            valid, _ = validate_suggestion(item)
        except (TypeError, ValueError):
            valid = False
        if not valid:
            raise AIResponseError("sugestão incompatível")
        item.setdefault("description", "")
        item["priority"] = item.get("priority") or "media"
        item["date"] = item.get("date") or None
        item["time"] = item.get("time") or None
        item["duration_minutes"] = item.get("duration_minutes") or 30
        item["category"] = item.get("category") or "geral"
        for opt_key in ("goal_id", "precisa_destrinchar", "subtasks"):
            if opt_key in item and item[opt_key] is None:
                item.pop(opt_key, None)

    summary = result.get("reasoning_summary", "")
    if not isinstance(summary, str):
        raise AIResponseError("resumo em formato inválido")

    return {"suggestions": suggestions, "reasoning_summary": summary}


def _next_weekday(base: date, weekday_index: int) -> date:
    days_ahead = (weekday_index - base.weekday()) % 7
    days_ahead = days_ahead if days_ahead != 0 else 7
    return base + timedelta(days=days_ahead)


_VERBS_ALT = "|".join(sorted(ACTION_SPLIT_VERBS, key=len, reverse=True))
_DELEGATION_SPLIT_RE = r"(?:(?:o|a)\s+[A-ZÀ-Ýa-zà-ÿ]{2,}\s+(?:vai|irá|deve|precisa))"
_SPLIT_PATTERN = re.compile(
    rf"(?:\.{{2,}}|[.;\n]+|,?\s+(?:depois|em\s+seguida|tamb[ée]m|al[ée]m\s+disso)\b|,\s*(?:e\s+)?(?=(?:eu\s+|n[óo]s\s+)?(?:{_VERBS_ALT}|{_DELEGATION_SPLIT_RE}|ficou\b))|\s+e\s+(?=(?:eu\s+|n[óo]s\s+|tamb[ée]m\s+|depois\s+)?(?:{_VERBS_ALT}|{_DELEGATION_SPLIT_RE}|ficou\b)))",
    flags=re.IGNORECASE,
)

_TEMPORAL_SUFFIX_RE = re.compile(
    r"(?:\s+(?:at[ée](?:\s+(?:a|o))?|para(?:\s+(?:a|o))?|antes\s+d[aeo]s?|ainda|nesta|neste|na|no|em|pela|de))?"
    r"\s*(?:\b(?:pr[óo]xim[oa]|essa|esta)\s+)?\b(?:"
    r"segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado|domingo"
    r"|amanh[aã](?:\s+(?:de\s+manh[aã]|cedo|[àa]\s+tarde|[àa]\s+noite|tarde|noite))?"
    r"|ainda\s+hoje|hoje(?:\s+(?:cedo|[àa]\s+tarde|[àa]\s+noite|de\s+manh[aã]|tarde|noite))?"
    r"|\d{1,2}/\d{1,2}(?:/\d{2,4})?"
    r")\b(?:\s+(?:de\s+manh[aã]|cedo|[àa]s?\s+\d{1,2}(?:[:h]\d{2}|h)?|[àa]\s+tarde|[àa]\s+noite))?.*$",
    flags=re.IGNORECASE,
)


def _split_clauses(text: str) -> List[str]:
    """Divide um texto com múltiplas demandas ou anotações em cláusulas independentes."""
    normalized = re.sub(r"\.{3,}", ". ", text.strip())
    raw_parts = _SPLIT_PATTERN.split(normalized)
    cleaned = []
    for part in raw_parts:
        p = re.sub(r"^(?:e\s+|e,\s*|depois\s+|tamb[ée]m\s+)+", "", part.strip(), flags=re.IGNORECASE).strip(" ,.-")
        if len(p) >= 4:
            cleaned.append(p)
    return cleaned[:8] if cleaned else [text.strip()]


def _clean_clause_title(clause: str) -> str:
    """Transforma uma frase natural num título conciso sem cortes de preposição ou gatilhos de ata."""
    title = clause.strip()
    # Remove gatilhos de delegação/reunião preservando o responsável quando houver ("Ficou decidido que o Guilherme vai revisar...")
    title = re.sub(
        r"^(?:tamb[ée]m\s+)?(?:ficou\s+(?:decidido|combinado|acordado|definido)\s+que\s+(?:o\s+|a\s+)?|lembrete(?:\s+importante)?\s*:\s*|nota\s*:\s*)",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"^([A-ZÀ-Ýa-zà-ÿ]{2,30})\s+(?:vai|ir[áa]|deve|precisa)\s+([a-zà-ÿ]{3,}(?:ar|er|ir)\b)",
        lambda m: f"{m.group(1).capitalize()} {m.group(2).lower()}",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"^(?:(?:eu|n[óo]s)\s+)?(?:tenho\s+que\s+|temos\s+que\s+|tenho\s+uma?\s+|tenho\s+|preciso\s+|precisamos\s+|quero\s+|vou\s+|vamos\s+|devo\s+|falta\s+)",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = _TEMPORAL_SUFFIX_RE.sub("", title)
    title = re.sub(r"\s+(?:[àa]s|as)\s+\d{1,2}(?:[:h]\d{2}|h)?.*$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s+\b(?:at[ée]|para|ainda|na|no|em)\s*$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s{2,}", " ", title).strip(" ,.-")
    if len(title) < 3:
        title = clause.strip()[:120]
    return (title[0].upper() + title[1:])[:120]


def _interpret_single_clause(clause: str, today: date) -> Dict[str, Any]:
    lowered = clause.lower()

    found_date = None
    for word, idx in sorted(WEEKDAYS.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(word)}\b", lowered):
            found_date = _next_weekday(today, idx)
            break
    if "amanhã" in lowered or "amanha" in lowered:
        found_date = today + timedelta(days=1)
    if re.search(r"\bhoje\b", lowered):
        found_date = today

    found_time = None
    m = re.search(r"(?:às|as|\b)(\d{1,2})\s*(?:[:h]\s*(\d{2})|h\b)", lowered)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2)) if m.group(2) else 0
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            found_time = f"{hour:02d}:{minute:02d}"

    priority = "media"
    matched_high = False
    for kw, p in PRIORITY_KEYWORDS.items():
        if kw in lowered:
            priority = p
            matched_high = True
            break
    if not matched_high and any(kw in lowered for kw in LOW_PRIORITY_KEYWORDS):
        # Mantém média se houver entrega/estudo explícito; caso contrário rotina simples -> baixa
        if not any(w in lowered for w in ("relatório", "relatorio", "estudar", "trabalho", "slides", "código", "codigo", "github", "revisar")):
            priority = "baixa"

    category = "geral"
    for kw, c in CATEGORY_KEYWORDS.items():
        if kw in lowered:
            category = c
            break

    tipo = (
        "compromisso"
        if (found_date and found_time) or "prova" in lowered or "reunião" in lowered or "consulta" in lowered
        else "tarefa"
    )
    title = _clean_clause_title(clause)

    return {
        "type": tipo,
        "title": title,
        "description": clause.strip(),
        "priority": priority,
        "date": found_date.isoformat() if found_date else None,
        "time": found_time,
        "duration_minutes": 60 if tipo == "compromisso" else 45 if category == "estudo" else 30,
        "category": category,
    }


def _rule_based_interpret(text: str, today: date = None) -> Dict[str, Any]:
    """Fallback local inteligente: extrai de 1 a 5 sugestões (datas, horários, prioridades e categorias)."""
    today = today or date.today()
    clauses = _split_clauses(text)
    suggestions = [_interpret_single_clause(c, today) for c in clauses]

    count_label = f"{len(suggestions)} itens identificados" if len(suggestions) > 1 else "1 item identificado"
    return {
        "suggestions": suggestions,
        "conflicts": [],
        "provider": "local_fallback",
        "reasoning_summary": (
            f"Análise contextual concluída ({count_label}): extraídos compromissos, tarefas, "
            "datas, horários, prioridades e categorias para sua revisão."
        ),
    }


async def _call_anthropic(text: str) -> Dict[str, Any]:
    headers = {
        "x-api-key": settings.AI_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 800,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": text}],
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    raw_text = "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
    return _parse_provider_response(raw_text)


async def _call_gemini(text: str) -> Dict[str, Any]:
    ctx = _ANALYZE_CONTEXT_VAR.get("")
    system_instruction = build_analyze_system_prompt(today=date.today(), extra_context=ctx)
    client = genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=20_000,
            retry_options=types.HttpRetryOptions(attempts=2),
        ),
    )
    try:
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=text,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=schemas.AIAnalyzeGeminiSchema,
                temperature=0.2,
            ),
        )
        return _parse_provider_response(response.text)
    finally:
        try:
            await client.aio.aclose()
        finally:
            client.close()


def _provider_error_message(exc: Exception) -> str:
    payload = getattr(exc, "details", None) or getattr(exc, "response_json", None)
    if payload is None and len(exc.args) > 1 and isinstance(exc.args[1], dict):
        payload = exc.args[1]
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error", payload)
    if not isinstance(error, dict):
        return ""
    message = error.get("message", "")
    return message.lower() if isinstance(message, str) else ""


def _log_provider_failure(provider: str, exc: Exception) -> None:
    status_code = getattr(exc, "code", None)
    detail = ""

    if isinstance(exc, AIResponseError):
        detail = "; resposta fora do formato esperado"
    elif provider == "gemini" and isinstance(exc, (httpx.TimeoutException, asyncio.TimeoutError)):
        detail = "; tempo limite excedido"
    elif provider == "gemini" and status_code in (503, 504):
        detail = "; indisponibilidade temporária do serviço"
    elif provider == "gemini" and status_code == 429:
        detail = "; limite de requisições ou cota atingida"
    elif provider == "gemini" and status_code in (401, 403):
        detail = "; verifique a chave, o projeto e a permissão da API"
    elif provider == "gemini" and status_code == 400:
        message = _provider_error_message(exc)
        if "api key not valid" in message or "invalid api key" in message or "api_key_invalid" in message:
            detail = "; chave da API inválida"
        else:
            detail = "; solicitação ou configuração rejeitada pelo provedor"
    elif provider == "gemini" and status_code == 404:
        message = _provider_error_message(exc)
        if "no longer available to new users" in message:
            detail = "; modelo não disponível para novos usuários deste projeto"
        else:
            detail = "; modelo não encontrado ou indisponível para este projeto"

    logger.warning(
        "AI provider %s failed (%s, status=%s)%s; using local rule-based fallback",
        provider,
        type(exc).__name__,
        status_code if isinstance(status_code, (int, str)) else "unknown",
        detail,
    )


async def analyze_text(text: str) -> Dict[str, Any]:
    """
    Ponto de entrada único da camada de IA.
    Tenta usar a API configurada (se houver chave); em qualquer falha,
    cai de volta para o interpretador local baseado em regras — o fluxo
    do MINDSIDE nunca fica bloqueado por falta de uma chave de IA.
    """
    if settings.AI_PROVIDER == "gemini":
        if not settings.GEMINI_API_KEY:
            logger.warning("Gemini selected but GEMINI_API_KEY is missing; using local rule-based fallback")
        else:
            try:
                result = await _call_gemini(text)
                result.setdefault("provider", f"gemini:{settings.GEMINI_MODEL}")
                logger.info("AI analysis completed with Gemini model %s", settings.GEMINI_MODEL)
                return result
            except Exception as exc:
                _log_provider_failure("gemini", exc)
    elif settings.AI_PROVIDER == "anthropic" and settings.AI_API_KEY:
        try:
            result = await _call_anthropic(text)
            result.setdefault("provider", "anthropic")
            logger.info("AI analysis completed with Anthropic")
            return result
        except Exception as exc:
            _log_provider_failure("anthropic", exc)
    elif settings.AI_PROVIDER == "anthropic":
        logger.warning("Anthropic selected but AI_API_KEY is missing; using local rule-based fallback")
    elif settings.AI_PROVIDER != "none":
        logger.warning("Unknown AI provider %s; using local rule-based fallback", settings.AI_PROVIDER)
    else:
        logger.info("No external AI provider selected; using local rule-based fallback")
    return _rule_based_interpret(text)


# =============================================================================
# CAMADA EXECUTIVA DE IA (System Instruction + Structured Outputs + Contexto + Fallback)
# =============================================================================

EXECUTIVE_SYSTEM_INSTRUCTION = (
    "Você é o Secretário Executivo Digital e Tutor Estrategista do MindSide. "
    "Regras obrigatórias de conduta:\n"
    "1. Seja direto, claro, encorajador e focado em produtividade prática e passos acionáveis.\n"
    "2. É estritamente proibido inventar fatos, prazos, notas, reuniões ou compromissos inexistentes no contexto fornecido.\n"
    "3. Elimine introduções longas e textos conversacionais desnecessários.\n"
    "4. Responda EXCLUSIVAMENTE com JSON válido aderente ao schema estruturado definido.\n"
    "5. Use sempre o idioma Português do Brasil e datas no formato ISO AAAA-MM-DD quando aplicável."
)


def build_user_context_block(
    pending_tasks: Optional[List[Dict[str, Any]]] = None,
    upcoming_appointments: Optional[List[Dict[str, Any]]] = None,
    now: Optional[datetime] = None,
    active_goals: Optional[List[Dict[str, Any]]] = None,
    available_slots: Optional[List[Dict[str, Any]]] = None,
    routine_blocks: Optional[List[Dict[str, Any]]] = None,
    routine_text: str = "",
) -> str:
    """Injeta automaticamente a data/hora atual, tarefas, compromissos, objetivos, disponibilidade e rotina fixa."""
    current = now or datetime.now()
    weekday_name = WEEKDAYS_PT_FULL[current.weekday()]
    lines = [
        f"CONTEXTO DO SISTEMA: Hoje é {weekday_name}, {current.strftime('%Y-%m-%d')}, hora atual {current.strftime('%H:%M')}."
    ]
    tasks = pending_tasks or []
    overdue = [
        t for t in tasks
        if t.get("deadline") and str(t["deadline"])[:10] < current.strftime("%Y-%m-%d")
    ]
    lines.append(f"RESUMO DE CARGA: {len(tasks)} tarefa(s) pendente(s), sendo {len(overdue)} atrasada(s).")
    if tasks:
        lines.append("TAREFAS PENDENTES ATUAIS:")
        for t in tasks[:12]:
            dl = t.get("deadline") or "sem prazo"
            pr = t.get("priority") or "media"
            dur = t.get("duration") or 30
            lines.append(f"- [#{t.get('id', '?')}] {t.get('title', '')} | prioridade={pr} | prazo={dl} | duracao={dur}min | cat={t.get('category', 'geral')}")
    appts = upcoming_appointments or []
    if appts:
        lines.append("PRÓXIMOS COMPROMISSOS:")
        for a in appts[:6]:
            lines.append(f"- {a.get('date', '')} {str(a.get('start_time', ''))[:5]}-{str(a.get('end_time', ''))[:5]}: {a.get('title', '')}")
    goals = active_goals or []
    if goals:
        lines.append("OBJETIVOS ATIVOS (associe goal_id quando a atividade contribuir para um destes objetivos):")
        for g in goals[:10]:
            desc = f" — {g['description'][:100]}" if g.get("description") else ""
            lines.append(f"- [goal_id={g.get('id')}] {g.get('title', '')} ({g.get('progress', 0)}%){desc}")
    slots = available_slots or []
    if slots:
        lines.append("HORÁRIOS DISPONÍVEIS DO USUÁRIO (AvailableSlot - prefira sugerir compromissos dentro destas janelas):")
        for s in slots[:12]:
            lines.append(f"- {s.get('day_of_week', '')}: {str(s.get('start_time', ''))[:5]} às {str(s.get('end_time', ''))[:5]}")
    rblocks = routine_blocks or []
    if rblocks or (routine_text and routine_text.strip()):
        lines.append("ROTINA FIXA OCUPADA DO USUÁRIO (REGRA DE OURO: JAMAIS sugira tarefas ou compromissos que sobreponham estes horários):")
        for rb in rblocks[:24]:
            lines.append(
                f"- {rb.get('day_of_week', '')} {str(rb.get('start_time', ''))[:5]}–{str(rb.get('end_time', ''))[:5]}: {rb.get('title', '')} [{rb.get('category', 'rotina')}]"
            )
        if not rblocks and routine_text.strip():
            lines.append(f"- Descrição livre da rotina: {routine_text.strip()[:400]}")
    return "\n".join(lines)


async def _call_gemini_structured(
    user_prompt: str,
    response_schema: Type[BaseModel],
    context_block: str = "",
    temperature: float = 0.25,
) -> Dict[str, Any]:
    """Chama a API Gemini com System Instruction fixa e JSON Schema Pydantic rigoroso."""
    combined_prompt = f"{context_block}\n\nSOLICITAÇÃO DO USUÁRIO:\n{user_prompt}".strip() if context_block else user_prompt
    client = genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=20_000,
            retry_options=types.HttpRetryOptions(attempts=2),
        ),
    )
    try:
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_MODEL or "gemini-2.5-flash",
            contents=combined_prompt,
            config=types.GenerateContentConfig(
                system_instruction=EXECUTIVE_SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=response_schema,
                temperature=temperature,
            ),
        )
        raw_text = (getattr(response, "text", None) or "").strip()
        if not raw_text:
            raise AIResponseError("resposta estruturada vazia")
        try:
            validated = response_schema.model_validate_json(raw_text)
        except ValidationError as exc:
            raise AIResponseError("resposta incompatível com schema Pydantic") from exc
        return validated.model_dump()
    finally:
        try:
            await client.aio.aclose()
        finally:
            client.close()


async def _run_structured_with_fallback(
    task_name: str,
    prompt: str,
    schema_cls: Type[BaseModel],
    context_block: str,
    fallback_fn: Callable[[], Dict[str, Any]],
    temperature: float = 0.25,
) -> Dict[str, Any]:
    """Executa chamada estruturada ao Gemini protegida contra timeouts/rate limits, ativando Plano B sem HTTP 500."""
    if settings.AI_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
        try:
            data = await _call_gemini_structured(
                prompt,
                schema_cls,
                context_block=context_block,
                temperature=temperature,
            )
            return {
                "data": data,
                "provider": f"gemini:{settings.GEMINI_MODEL or 'gemini-2.5-flash'}",
                "fallback_used": False,
            }
        except Exception as exc:
            _log_provider_failure("gemini", exc)
    else:
        logger.info("AI %s using local fallback (provider=%s)", task_name, settings.AI_PROVIDER)

    fallback_data = fallback_fn()
    return {
        "data": fallback_data,
        "provider": "local_fallback",
        "fallback_used": True,
    }


def _map_priority_pt(raw_priority: str) -> str:
    low = (raw_priority or "media").strip().lower()
    if low in ("urgente", "alta"):
        return "Alta"
    if low == "baixa":
        return "Baixa"
    return "Média"


def _normalize_iso_or_none(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    s = str(value).strip()[:10]
    try:
        date.fromisoformat(s)
        return s
    except ValueError:
        return None


async def generate_brain_dump_items(
    text: str,
    context_block: str = "",
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Feature 1 — Brain Dump: converte texto livre em cards estruturados (titulo, prioridade, prazo_sugerido, categoria)."""
    ref_today = today or date.today()

    def fallback() -> Dict[str, Any]:
        interpreted = _rule_based_interpret(text, today=ref_today)
        itens = []
        for s in interpreted.get("suggestions", []):
            title = (s.get("title") or text.strip()[:120])[:200]
            cat = s.get("category") or "geral"
            resumo = s.get("description") or text.strip()[:200]
            itens.append({
                "titulo": title,
                "prioridade": _map_priority_pt(s.get("priority", "media")),
                "prazo_sugerido": s.get("date"),
                "categoria": cat,
                "duracao_min": int(s.get("duration_minutes") or 30),
                "resumo": resumo,
                "precisa_destrinchar": is_task_complex(title, resumo, cat),
            })
        if not itens:
            title = text.strip()[:180]
            resumo = "Salvo automaticamente no modo rápido."
            itens.append({
                "titulo": title,
                "prioridade": "Média",
                "prazo_sugerido": None,
                "categoria": "geral",
                "duracao_min": 30,
                "resumo": resumo,
                "precisa_destrinchar": is_task_complex(title, resumo, "geral"),
            })
        return {
            "itens": itens,
            "comentario_secretario": (
                f"{len(itens)} atividade(s) organizada(s) no modo rápido e salva(s) para você começar sem perder o fio."
            ),
        }

    prompt = (
        "Analise o despejo mental (Brain Dump) abaixo e extraia de 1 a 6 tarefas/itens acionáveis.\n"
        "Para cada item informe:\n"
        "- titulo: claro e objetivo no infinitivo ou substantivo curto\n"
        "- prioridade: exatamente 'Alta', 'Média' ou 'Baixa'\n"
        "- prazo_sugerido: data no formato AAAA-MM-DD (use o contexto de hoje para resolver dias como 'amanhã', 'sexta', etc.) ou null se não houver\n"
        "- categoria: uma entre estudo, trabalho, saude, lazer, pessoal ou geral\n"
        "- duracao_min: estimativa realista em minutos (entre 15 e 180)\n"
        "- resumo: 1 frase curta com contexto prático mencionado pelo usuário\n"
        "- precisa_destrinchar: booleano — false para tarefas simples/atômicas (ex.: 'comprar café', 'beber água', 'ligar para', 'pagar conta', 'enviar e-mail rápido', 'levar o lixo') e true para tarefas complexas (estudos, provas, trabalhos, relatórios, código/programação, projetos, apresentações)\n"
        "E em comentario_secretario dê uma orientação curta de 1 frase.\n\n"
        f"TEXTO:\n{text.strip()}"
    )
    res = await _run_structured_with_fallback(
        "brain_dump", prompt, schemas.BrainDumpGeminiSchema, context_block, fallback, temperature=0.25
    )
    for item in res["data"].get("itens", []):
        item["prazo_sugerido"] = _normalize_iso_or_none(item.get("prazo_sugerido"))
        item["precisa_destrinchar"] = is_task_complex(
            item.get("titulo", ""), item.get("resumo", ""), item.get("categoria", "geral")
        )
    return res


async def generate_task_breakdown(
    task_title: str,
    task_desc: str = "",
    context_block: str = "",
    category: str = "geral",
) -> Dict[str, Any]:
    """Feature 2 — Destrinchar Tarefa: gera de 3 a 4 sub-etapas práticas 100% específicas do tema."""

    def fallback() -> Dict[str, Any]:
        return {
            "passos": _domain_steps_for_task(task_title, task_desc, category),
            "dica_foco": "Comece pela primeira etapa prática e avance sem sobrecarga.",
        }

    prompt = (
        f"Divida a tarefa abaixo em 3 a 4 sub-tarefas concretas e 100% específicas para o domínio real da tarefa "
        f"(cada etapa entre 15 e 30 minutos).\n"
        f"REGRAS OBRIGATÓRIAS:\n"
        f"- Gere apenas etapas práticas diretamente ligadas ao conteúdo da tarefa (nunca use passos genéricos de Pomodoro).\n"
        f"- PROIBIDO escrever frases genéricas como 'Preparar ambiente', 'Separar materiais', 'Executar primeiro bloco focado', '25 min sem distrações' ou 'Pomodoro'.\n"
        f"TAREFA: {task_title}\n"
        f"CATEGORIA: {category}\n"
        f"DESCRIÇÃO/DETALHES: {task_desc or 'Não informada'}"
    )
    res = await _run_structured_with_fallback(
        "task_breakdown", prompt, schemas.TaskBreakdownGeminiSchema, context_block, fallback, temperature=0.25
    )
    passos = res["data"].get("passos", [])[:5]
    if not passos or any(_contains_forbidden_subtask_phrase(p.get("titulo", "")) for p in passos):
        passos = _domain_steps_for_task(task_title, task_desc, category)
    res["data"]["passos"] = passos
    return res


async def generate_daily_briefing(
    pending_tasks: List[Dict[str, Any]],
    appointments: List[Dict[str, Any]],
    context_block: str = "",
) -> Dict[str, Any]:
    """Feature 3 — Briefing Matinal: aponta por qual tarefa começar hoje e o porquê."""

    def fallback() -> Dict[str, Any]:
        if not pending_tasks:
            return {
                "recomendacao_principal": "Sua lista de pendências está em dia! Aproveite para adiantar algo leve ou fazer um despejo mental do que precisa organizar para a semana.",
                "tarefa_foco_titulo": None,
                "motivo_estrategico": "Nenhuma tarefa pendente encontrada no momento.",
                "alerta_sobrecarga": None,
            }
        prio_rank = {"urgente": 0, "alta": 1, "media": 2, "baixa": 3}
        today_str = date.today().isoformat()
        sorted_tasks = sorted(
            pending_tasks,
            key=lambda t: (
                0 if (t.get("deadline") and str(t["deadline"])[:10] <= today_str) else 1,
                prio_rank.get(str(t.get("priority", "media")).lower(), 2),
                str(t.get("deadline") or "9999-12-31"),
            ),
        )
        top = sorted_tasks[0]
        dl = top.get("deadline")
        overdue = [t for t in pending_tasks if t.get("deadline") and str(t["deadline"])[:10] < today_str]
        if dl and dl < today_str:
            reason = f"Ela está com prazo vencido ({dl}) e prioridade {top.get('priority', 'média')}; resolver primeiro reduz pressão mental."
        elif dl == today_str:
            reason = f"O prazo termina hoje ({dl}) — concluir cedo evita correria perto dos demais compromissos."
        elif dl:
            reason = f"É a tarefa mais prioritária ({top.get('priority', 'média')}) com prazo mais próximo ({dl})."
        else:
            reason = f"Possui maior prioridade ({top.get('priority', 'média')}) entre suas atividades abertas."
        overload = (
            f"Atenção: você tem {len(overdue)} tarefa(s) atrasada(s) e {len(pending_tasks)} pendência(s) abertas. Foque uma de cada vez."
            if (overdue or len(pending_tasks) >= 5)
            else None
        )
        return {
            "recomendacao_principal": f"Comece agora por \"{top['title']}\". {reason}",
            "tarefa_foco_titulo": top["title"],
            "motivo_estrategico": reason,
            "alerta_sobrecarga": overload,
        }

    if not pending_tasks:
        return {
            "data": fallback(),
            "provider": "local_summary",
            "fallback_used": False,
        }

    prompt = (
        "Atue como Secretário Executivo do dia. Olhando exclusivamente o CONTEXTO DO SISTEMA e as TAREFAS PENDENTES ATUAIS, "
        "escreva um briefing executivo muito curto (máximo 2 frases em recomendacao_principal) dizendo EXATAMENTE "
        "por qual tarefa o usuário deve começar agora e por quê.\n"
        "Não invente tarefas que não existam na lista. Copie exatamente o título da tarefa escolhida em tarefa_foco_titulo."
    )
    return await _run_structured_with_fallback(
        "daily_briefing", prompt, schemas.DailyBriefingGeminiSchema, context_block, fallback, temperature=0.2
    )


NOTE_ACTION_TRIGGERS = (
    "ficou decidido", "ficou combinado", "ficou definido", "ficou acordado",
    "preciso", "precisa", "precisamos", "temos que", "tenho que",
    "deve", "devem", "devemos", "lembrar", "lembrete",
    "entregar", "fazer", "enviar", "revisar", "estudar", "preparar",
    "resolver", "pesquisar", "ler", "mandar", "pagar", "agendar",
    "responder", "completar", "finalizar", "corrigir", "subir",
    "atualizar", "publicar", "commitar", "terminar", "comprar",
    "organizar", "montar", "implementar", "criar", "apresentar",
)


def _has_action_obligation(clause: str) -> bool:
    low = clause.lower().strip()
    if any(t in low for t in NOTE_ACTION_TRIGGERS):
        return True
    if re.search(r"\b(?:vai|ir[áa]|deve|precisa|vamos|temos)\s+[a-zà-ÿ]{3,}(?:ar|er|ir)\b", low):
        return True
    return False


async def extract_actions_from_notes(
    notes_text: str,
    context_block: str = "",
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Feature 4 — Extrator de Ações: filtra textos longos (atas, aulas, recados) e devolve itens acionáveis."""
    ref_today = today or date.today()

    def fallback() -> Dict[str, Any]:
        clauses = _split_clauses(notes_text)
        acoes = []
        for cl in clauses:
            if not _has_action_obligation(cl):
                continue
            parsed = _interpret_single_clause(cl, ref_today)
            cat = parsed["category"] if parsed["category"] != "geral" else "estudo"
            acoes.append({
                "titulo": parsed["title"],
                "prioridade": _map_priority_pt(parsed["priority"]),
                "prazo_sugerido": parsed["date"],
                "categoria": cat,
                "contexto_origem": cl[:180],
                "precisa_destrinchar": is_task_complex(parsed["title"], cl[:180], cat),
            })
            if len(acoes) >= 8:
                break
        if not acoes:
            fallback_title = (
                f"Revisar pontos-chave da anotação ({notes_text.strip()[:55]}...)"
                if len(notes_text.strip()) > 55
                else notes_text.strip()[:120]
            )
            acoes.append({
                "titulo": fallback_title,
                "prioridade": "Média",
                "prazo_sugerido": None,
                "categoria": "estudo",
                "contexto_origem": notes_text.strip()[:180],
                "precisa_destrinchar": is_task_complex(fallback_title, notes_text.strip()[:180], "estudo"),
            })
        return {
            "resumo_filtrado": f"{len(acoes)} item(ns) de ação filtrado(s) da anotação fornecida.",
            "acoes": acoes,
        }

    prompt = (
        "Leia o texto bruto abaixo (ata de reunião, resumo de aula, conversa ou recado).\n"
        "REGRAS ESTRITAS:\n"
        "1. IGNORE frases puramente descritivas ou opinativas sem verbo de obrigação/ação (ex.: 'A reunião da equipe hoje foi ótima').\n"
        "2. Ao encontrar gatilhos como 'Ficou decidido que X vai Y até Z' ou 'preciso Z ainda hoje', crie uma ação limpa e completa "
        "(ex.: 'Guilherme revisar os slides', 'Subir o código atualizado no GitHub') SEM cortar a frase nem deixar preposições como 'até' no final do título.\n"
        "3. Coloque prazos mencionados ('quarta-feira', 'ainda hoje', 'amanhã') apenas no campo prazo_sugerido (AAAA-MM-DD).\n"
        "4. Para cada ação informe: titulo, prioridade ('Alta', 'Média' ou 'Baixa'), prazo_sugerido, categoria, contexto_origem e precisa_destrinchar.\n\n"
        f"ANOTAÇÃO BRUTA:\n{notes_text.strip()}"
    )
    res = await _run_structured_with_fallback(
        "extract_notes", prompt, schemas.NoteExtractGeminiSchema, context_block, fallback, temperature=0.2
    )
    for act in res["data"].get("acoes", []):
        act["prazo_sugerido"] = _normalize_iso_or_none(act.get("prazo_sugerido"))
        if act.get("titulo"):
            act["titulo"] = re.sub(r"\s+\b(?:at[ée]|para|ainda)\s*$", "", act["titulo"], flags=re.IGNORECASE).strip(" ,.-")
        act["precisa_destrinchar"] = is_task_complex(
            act.get("titulo", ""), act.get("contexto_origem", ""), act.get("categoria", "estudo")
        )
    return res


STUDY_ACRONYMS = {"sql", "api", "html", "css", "js", "ts", "poo", "json", "http", "git", "tcc", "bi", "ia", "ml", "ux", "ui"}
STUDY_LOWER_WORDS = {"e", "em", "de", "da", "do", "das", "dos", "para", "com", "no", "na", "nos", "nas", "a", "o", "por"}


def _extract_clean_study_topic(prompt_text: str) -> str:
    """Limpa prefixos de pedido, prazos e sufixos repetitivos ('para uma prova, estudando...') do tema de estudo."""
    cleaned = prompt_text.strip()
    cleaned = re.sub(r",?\s*\bestudando\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"\s+\bpara\s+(?:uma\s+|um\s+|a\s+|o\s+)?(?:prova|exame|teste|concurso|avalia[çc][ãa]o|entrevista|vestibular|enem|trabalho|apresenta[çc][ãa]o)\b.*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(?:em\s+\d+\s*dias?|\d+\s*(?:h|horas?|min|minutos?)(?:\s*(?:por|ao)\s*dia)?|por\s+dia)\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^(?:(?:eu\s+)?(?:preciso|quero|gostaria\s+de|vou)\s+)?(?:criar\s+(?:um\s+)?plano\s+de\s+estudos?\s+(?:de|sobre|para)\s+|aprender\s+|estudar\s+|revisar\s+|dominar\s+)",
        "",
        cleaned.strip(),
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,.-:;")
    if len(cleaned) < 3:
        cleaned = prompt_text.strip()[:70].strip(" ,.-")

    tokens = cleaned.split()
    formatted = []
    for idx, tok in enumerate(tokens):
        low = tok.lower()
        if low in STUDY_ACRONYMS:
            formatted.append(low.upper())
        elif idx > 0 and low in STUDY_LOWER_WORDS:
            formatted.append(low)
        else:
            formatted.append(tok[:1].upper() + tok[1:])
    return " ".join(formatted)[:90]


async def generate_study_plan(
    prompt_text: str,
    context_block: str = "",
) -> Dict[str, Any]:
    """Feature 5 — Arquiteto de Estudos: divide o tema em etapas progressivas com títulos limpos e checklist."""
    clean_subject = _extract_clean_study_topic(prompt_text)

    def fallback() -> Dict[str, Any]:
        days_match = re.search(r"(\d+)\s*dias?", prompt_text, re.IGNORECASE)
        hours_match = re.search(r"(\d+)\s*(?:h|horas?)\b", prompt_text, re.IGNORECASE)
        mins_match = re.search(r"(\d+)\s*(?:min|minutos?)\b", prompt_text, re.IGNORECASE)

        total_days = min(max(int(days_match.group(1)), 2), 14) if days_match else 5
        if hours_match:
            daily_min = min(max(int(hours_match.group(1)) * 60, 20), 240)
        elif mins_match:
            daily_min = min(max(int(mins_match.group(1)), 20), 240)
        else:
            daily_min = 60

        stage_templates = [
            (
                f"Fundamentos e mapa mental de {clean_subject}",
                "Leia o básico sem travar nos detalhes e escreva um resumo de 1 página com suas palavras.",
                ["Identificar conceitos centrais e termos-chave", "Ler exemplos iniciais comentados", "Criar 5 perguntas rápidas de auto-teste"],
            ),
            (
                f"Prática guiada e exercícios de {clean_subject}",
                "Resolva 3 a 5 exercícios simples em sequência alternando teoria e prática.",
                ["Fazer 2 exercícios básicos com consulta", "Resolver 2 exercícios sem olhar o gabarito", "Anotar os erros mais comuns"],
            ),
            (
                f"Aprofundamento e casos reais de {clean_subject}",
                "Use técnica Feynman: tente explicar em voz alta como resolver problemas intermediários.",
                ["Praticar casos intermediários do tema", "Conectar o tópico com problemas típicos de prova", "Revisar dúvidas da etapa anterior"],
            ),
            (
                f"Consolidação cronometrada de {clean_subject}",
                "Cronometre um bloco de exercícios mistos para ganhar fluência e segurança.",
                ["Bloco de prática cronometrada", "Corrigir falhas passo a passo", "Montar checklist de pontos críticos"],
            ),
            (
                f"Simulado final e revisão ativa de {clean_subject}",
                "Faça revisão espaçada priorizando apenas os tópicos em que ainda erra.",
                ["Simulado completo cronometrado", "Revisar exclusivamente erros e lacunas", "Descanso leve antes da avaliação"],
            ),
        ]

        etapas = []
        for idx in range(total_days):
            tpl = stage_templates[min(idx, len(stage_templates) - 1)]
            topico = tpl[0]
            if total_days > len(stage_templates) and idx >= len(stage_templates) - 1:
                suffix = f" (Ciclo {idx + 1})" if idx < total_days - 1 else " — Revisão Final"
                topico = f"{topico}{suffix}"
            etapas.append({
                "dia_ou_etapa": f"Dia {idx + 1}",
                "topico_principal": topico[:180],
                "tempo_estimado_min": daily_min,
                "como_estudar": tpl[1],
                "subtopicos": list(tpl[2]),
            })

        return {
            "titulo_plano": f"Plano de Estudos — {clean_subject}"[:180],
            "objetivo_geral": f"Dominar {clean_subject} em {total_days} etapas progressivas de {daily_min} min/dia.",
            "total_dias_ou_etapas": total_days,
            "tempo_diario_min": daily_min,
            "etapas": etapas,
        }

    prompt = (
        f"Atue como Tutor Estrategista (Arquiteto de Estudos) sobre o tema central '{clean_subject}'.\n"
        "REGRAS PARA TÍTULOS LIMPOS:\n"
        "- NÃO repita o texto inteiro do usuário (ex.: nunca escreva 'para uma prova, estudando' dentro do tópico).\n"
        "- NÃO inclua prefixos como 'Dia 1:' em topico_principal (use topico_principal direto como 'Fundamentos e mapa mental de Joins e Subqueries').\n"
        "Para CADA etapa inclua: dia_ou_etapa ('Dia 1', 'Dia 2'...), topico_principal conciso, tempo_estimado_min, "
        "como_estudar (método ativo prático) e subtopicos (3 a 4 itens).\n\n"
        f"SOLICITAÇÃO DO USUÁRIO:\n{prompt_text.strip()}"
    )
    res = await _run_structured_with_fallback(
        "study_plan", prompt, schemas.StudyPlanGeminiSchema, context_block, fallback, temperature=0.3
    )
    for st in res["data"].get("etapas", []):
        tp = st.get("topico_principal") or ""
        tp = re.sub(r"^(?:Dia\s*\d+\s*:\s*)+", "", tp, flags=re.IGNORECASE)
        tp = re.sub(r",?\s*\bestudando\b", "", tp, flags=re.IGNORECASE)
        tp = re.sub(r"\bpara\s+uma\s+prova\b", "", tp, flags=re.IGNORECASE)
        st["topico_principal"] = re.sub(r"\s{2,}", " ", tp).strip(" ,.-:")[:180] or clean_subject
    return res


CANONICAL_ROUTINE_DAYS = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"]
_ROUTINE_DAY_INDEX = {
    "segunda": 0, "seg": 0,
    "terca": 1, "ter": 1,
    "quarta": 2, "qua": 2,
    "quinta": 3, "qui": 3,
    "sexta": 4, "sex": 4,
    "sabado": 5, "sab": 5,
    "domingo": 6, "dom": 6,
}

_ROUTINE_SPLIT_RE = re.compile(
    r"[,;\n.]+|\s+e\s+(?=(?:eu\s+|tamb[ée]m\s+)?(?:estudo|estudar|fa[çc]o|fazer|trabalho|trabalhar|treino|treinar|durmo|dormir|acordo|tenho|vou|almo[çc]o|janto|curso|aula|escola|faculdade))",
    flags=re.IGNORECASE,
)

_ROUTINE_RANGE_RE = re.compile(
    r"(?:das?\s+)?(\d{1,2})(?::(\d{2})|h(\d{2})?)?\s*(?:às|as|até|ate|-)\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)?",
    flags=re.IGNORECASE,
)


def _normalize_canonical_day(raw_day: str) -> Optional[str]:
    ascii_day = _strip_accents_lower(raw_day)
    ascii_day = re.sub(r"-feira$", "", ascii_day).strip()
    if ascii_day in _ROUTINE_DAY_INDEX:
        return CANONICAL_ROUTINE_DAYS[_ROUTINE_DAY_INDEX[ascii_day]]
    for prefix, idx in _ROUTINE_DAY_INDEX.items():
        if ascii_day.startswith(prefix):
            return CANONICAL_ROUTINE_DAYS[idx]
    return None


def _parse_hhmm_safe(raw: str) -> Optional[str]:
    m = re.match(r"^\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)?\s*$", str(raw or ""), re.IGNORECASE)
    if not m:
        return None
    h = int(m.group(1))
    mn = int(m.group(2) or m.group(3) or 0)
    if h == 24 and mn == 0:
        return "23:59"
    if 0 <= h <= 23 and 0 <= mn <= 59:
        return f"{h:02d}:{mn:02d}"
    return None


def _extract_days_from_routine_clause(clause: str) -> List[str]:
    low = _strip_accents_lower(clause)
    if any(p in low for p in ("todos os dias", "todo dia", "diariamente", "seg a dom", "segunda a domingo")):
        return list(CANONICAL_ROUTINE_DAYS)
    if any(p in low for p in ("fim de semana", "fins de semana")):
        return ["Sabado", "Domingo"]

    range_m = re.search(
        r"\b(seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?|dom(?:ingo)?)(?:-feira)?\s+(?:a|ate)\s+"
        r"(seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?|dom(?:ingo)?)(?:-feira)?\b",
        low,
    )
    days: List[str] = []
    if range_m:
        start_canon = _normalize_canonical_day(range_m.group(1))
        end_canon = _normalize_canonical_day(range_m.group(2))
        if start_canon and end_canon:
            i1 = CANONICAL_ROUTINE_DAYS.index(start_canon)
            i2 = CANONICAL_ROUTINE_DAYS.index(end_canon)
            if i1 <= i2:
                days.extend(CANONICAL_ROUTINE_DAYS[i1:i2 + 1])
            else:
                days.extend(CANONICAL_ROUTINE_DAYS[i1:] + CANONICAL_ROUTINE_DAYS[:i2 + 1])

    for match in re.finditer(
        r"\b(seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?|dom(?:ingo)?)(?:-feira)?\b",
        low,
    ):
        canon = _normalize_canonical_day(match.group(1))
        if canon and canon not in days:
            days.append(canon)

    return days or CANONICAL_ROUTINE_DAYS[:5]


def _extract_routine_title_and_cat(clause: str) -> tuple[str, str]:
    low = _strip_accents_lower(clause)
    if "durmo" in low or "dormir" in low or "sono" in low:
        return "Sono / Descanso", "sono"
    if "curso tecnico" in low:
        return "Curso técnico", "estudo"
    if "curso" in low or "faculdade" in low or "escola" in low or "aula" in low:
        return "Aulas / Curso", "estudo"
    if "estud" in low:
        return "Horário de Estudos", "estudo"
    if "trabalh" in low or "estagio" in low or "escritorio" in low or "expediente" in low:
        return "Trabalho", "trabalho"
    if "academia" in low or "treino" in low or "corrida" in low or "pilates" in low:
        return "Treino / Saúde", "saude"
    if "almoc" in low or "jantar" in low or "janto" in low or "refeicao" in low:
        return "Refeição", "pessoal"

    cleaned = _ROUTINE_RANGE_RE.sub("", clause)
    cleaned = re.sub(
        r"\b(?:de|da|do|das|dos|na|no|em|para|a|ate|até|às|as)\b\s*(?:seg(?:unda)?|ter[çc]a?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|s[aá]b(?:ado)?|dom(?:ingo)?)(?:-feira)?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(?:seg(?:unda)?|ter[çc]a?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|s[aá]b(?:ado)?|dom(?:ingo)?|todos os dias|pela manh[aã]|[àa] tarde|[àa] noite)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(?:eu\s+)?(?:fa[çc]o|tenho|vou\s+(?:ao|a|na|no)?)\s+", "", cleaned.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,.-:;")
    if len(cleaned) >= 3:
        return (cleaned[0].upper() + cleaned[1:])[:80], "rotina"
    return "Compromisso fixo da rotina", "rotina"


def _expand_routine_blocks(raw_blocks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    expanded: List[Dict[str, str]] = []
    seen = set()
    for blk in raw_blocks:
        titulo = str(blk.get("titulo") or blk.get("title") or "Rotina fixa").strip()[:120]
        cat = str(blk.get("categoria") or blk.get("category") or "rotina").strip().lower()[:30] or "rotina"
        h_ini = _parse_hhmm_safe(blk.get("hora_inicio") or blk.get("start_time"))
        h_fim = _parse_hhmm_safe(blk.get("hora_fim") or blk.get("end_time"))
        if not h_ini or not h_fim:
            continue
        raw_days = blk.get("dias_semana") or []
        if isinstance(raw_days, str):
            raw_days = [raw_days]
        norm_days = []
        for rd in raw_days:
            c = _normalize_canonical_day(rd)
            if c and c not in norm_days:
                norm_days.append(c)
        if not norm_days:
            norm_days = list(CANONICAL_ROUTINE_DAYS[:5])

        intervals = [(h_ini, h_fim)] if h_ini < h_fim else [(h_ini, "23:59"), ("00:00", h_fim)]
        for s_t, e_t in intervals:
            if s_t >= e_t:
                continue
            for d_name in norm_days:
                key = (titulo.lower(), d_name, s_t, e_t)
                if key in seen:
                    continue
                seen.add(key)
                expanded.append({
                    "title": titulo,
                    "day_of_week": d_name,
                    "start_time": s_t,
                    "end_time": e_t,
                    "category": cat,
                })
    return expanded


def _parse_routine_fallback(text: str) -> Dict[str, Any]:
    parts = [p.strip(" ,.-;") for p in _ROUTINE_SPLIT_RE.split(text.strip()) if p and len(p.strip()) >= 3]
    blocos: List[Dict[str, Any]] = []

    for cl in parts:
        days = _extract_days_from_routine_clause(cl)
        range_m = _ROUTINE_RANGE_RE.search(cl)
        if range_m:
            sh = int(range_m.group(1))
            sm = int(range_m.group(2) or range_m.group(3) or 0)
            eh = int(range_m.group(4))
            em = int(range_m.group(5) or range_m.group(6) or 0)
            if 0 <= sh <= 23 and 0 <= sm <= 59 and 0 <= eh <= 24 and 0 <= em <= 59:
                start_str = f"{sh:02d}:{sm:02d}"
                end_str = "23:59" if eh == 24 else f"{eh:02d}:{em:02d}"
                title, cat = _extract_routine_title_and_cat(cl)
                blocos.append({
                    "titulo": title,
                    "dias_semana": days,
                    "hora_inicio": start_str,
                    "hora_fim": end_str,
                    "categoria": cat,
                })
                continue

        sleep_m = re.search(
            r"\b(?:durmo|dormir|sono|vou\s+dormir)\s+(?:[àa]s|por\s+volta\s+das?)?\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)?",
            cl,
            flags=re.IGNORECASE,
        )
        if sleep_m:
            sh = int(sleep_m.group(1))
            sm = int(sleep_m.group(2) or sleep_m.group(3) or 0)
            if 0 <= sh <= 23 and 0 <= sm <= 59:
                sleep_days = list(CANONICAL_ROUTINE_DAYS) if days == CANONICAL_ROUTINE_DAYS[:5] and "seg" not in cl.lower() else days
                blocos.append({
                    "titulo": "Sono / Descanso",
                    "dias_semana": sleep_days,
                    "hora_inicio": f"{sh:02d}:{sm:02d}",
                    "hora_fim": "23:59",
                    "categoria": "sono",
                })

    return {
        "blocos": blocos,
        "resumo_rotina": f"{len(blocos)} bloco(s) fixo(s) de rotina identificado(s) para proteger sua agenda.",
    }


async def parse_freeform_routine(
    text: str,
    context_block: str = "",
) -> Dict[str, Any]:
    """Interpreta texto livre da rotina diária em blocos ocupados (Gemini Structured Outputs + Fallback)."""

    def fallback() -> Dict[str, Any]:
        return _parse_routine_fallback(text)

    prompt = (
        "Analise a rotina fixa descrita em linguagem livre abaixo (aulas, cursos, trabalho, treino, sono, etc.).\n"
        "Converta CADA compromisso fixo recorrente em objetos para bloquear esses horários na agenda:\n"
        "- titulo: nome claro e curto (ex.: 'Horário de Estudos', 'Curso Técnico', 'Trabalho', 'Sono / Descanso')\n"
        "- dias_semana: lista usando exclusivamente entre: Segunda, Terca, Quarta, Quinta, Sexta, Sabado, Domingo\n"
        "- hora_inicio e hora_fim: no formato exato HH:MM (24h). Se o usuário disser apenas 'durmo às 23h', use 23:00 até 23:59 todos os dias.\n"
        "- categoria: estudo, trabalho, saude, sono, pessoal ou rotina\n\n"
        f"ROTINA DO USUÁRIO:\n{text.strip()}"
    )
    res = await _run_structured_with_fallback(
        "parse_routine", prompt, schemas.RoutineParseGeminiSchema, context_block, fallback, temperature=0.15
    )
    expanded = _expand_routine_blocks(res["data"].get("blocos", []))
    res["expanded_blocks"] = expanded
    return res


async def generate_goal_breakdown(
    goal_title: str,
    goal_desc: str = "",
    context_block: str = "",
) -> Dict[str, Any]:
    """Feature 6 — Decompõe um Objetivo/Meta grande em 3 a 5 tarefas práticas conectadas a ele."""

    def fallback() -> Dict[str, Any]:
        combined = _strip_accents_lower(f"{goal_title} {goal_desc}")
        if any(k in combined for k in ("aprendiz", "vaga", "estagio", "emprego", "entrevista", "carreira", "curriculo", "ti")):
            raw_items = [
                (f"Atualizar currículo destacando habilidades para {goal_title[:65]}", "Alta", "trabalho", 40, "Liste experiências, cursos e projetos alinhados à vaga."),
                ("Organizar LinkedIn e portfólio no GitHub com projetos práticos", "Alta", "trabalho", 35, "Deixe resumo e repositórios claros para recrutadores."),
                ("Mapear vagas abertas e enviar candidaturas direcionadas", "Alta", "trabalho", 45, "Separe ao menos 5 oportunidades compatíveis para aplicar."),
                ("Treinar perguntas frequentes de entrevista e pitch pessoal", "Média", "trabalho", 30, "Estruture respostas curtas sobre motivações e aprendizados."),
            ]
        elif any(k in combined for k in ("prova", "passar", "banco de dados", "sql", "estudar", "materia", "disciplina", "vestibular", "enem", "concurso", "curso")):
            raw_items = [
                (f"Mapear ementa e tópicos prioritários de {goal_title[:65]}", "Alta", "estudo", 35, "Liste os assuntos de maior peso nas avaliações."),
                (f"Revisar conceitos centrais e montar resumo prático de {goal_title[:55]}", "Alta", "estudo", 45, "Foque nos pontos principais sem copiar tudo."),
                (f"Resolver lista de exercícios e provas anteriores de {goal_title[:50]}", "Alta", "estudo", 50, "Identifique padrões de questão e erros recorrentes."),
                ("Realizar simulado cronometrado e revisar lacunas finais", "Média", "estudo", 40, "Valide o nível de domínio antes da entrega ou prova."),
            ]
        elif any(k in combined for k in ("projeto", "sistema", "codigo", "github", "tcc", "prototipo", "app", "site", "apresentar", "sic")):
            raw_items = [
                (f"Definir escopo, requisitos e etapas de {goal_title[:65]}", "Alta", "trabalho", 35, "Quebre a entrega em funcionalidades essenciais."),
                (f"Implementar núcleo funcional de {goal_title[:60]}", "Alta", "trabalho", 50, "Construa o fluxo principal testando localmente."),
                ("Validar testes, corrigir ajustes e atualizar documentação", "Média", "trabalho", 40, "Garanta estabilidade e commit limpo do projeto."),
                (f"Preparar roteiro e apresentação de {goal_title[:60]}", "Média", "trabalho", 30, "Monte tópicos visuais objetivos para demonstrar valor."),
            ]
        else:
            raw_items = [
                (f"Definir plano de ação semanal e recursos para {goal_title[:65]}", "Alta", "pessoal", 30, "Estabeleça o primeiro marco concreto e alcançável."),
                (f"Executar primeira entrega prática de {goal_title[:60]}", "Alta", "pessoal", 45, "Avance no bloco de maior impacto para tirar a meta do papel."),
                (f"Revisar progresso intermediário e remover bloqueios de {goal_title[:50]}", "Média", "pessoal", 30, "Ajuste prazos e prioridades conforme o avanço."),
                (f"Finalizar critérios de conclusão de {goal_title[:60]}", "Média", "pessoal", 35, "Valide tudo o que faltava para fechar a meta."),
            ]

        tarefas = [
            {
                "titulo": t[0][:200],
                "prioridade": t[1],
                "prazo_sugerido": None,
                "categoria": t[2],
                "duracao_min": t[3],
                "resumo": t[4],
                "precisa_destrinchar": True,
            }
            for t in raw_items
        ]
        return {
            "tarefas": tarefas,
            "estrategia_objetivo": f"Meta dividida em {len(tarefas)} tarefas práticas progressivas e conectadas.",
        }

    prompt = (
        "Decomponha o OBJETIVO grande abaixo em 3 a 5 TAREFAS PRÁTICAS concretas que avancem diretamente rumo à meta.\n"
        "REGRAS OBRIGATÓRIAS:\n"
        "- Cada tarefa deve ter ação clara e específica para o objetivo real (PROIBIDO gerar frases genéricas como 'Executar bloco focado de 25 minutos' ou 'Preparar ambiente').\n"
        "- Para cada tarefa informe: titulo, prioridade ('Alta', 'Média' ou 'Baixa'), prazo_sugerido (AAAA-MM-DD ou null), categoria (estudo, trabalho, saude, pessoal, geral), duracao_min e resumo curto.\n\n"
        f"OBJETIVO: {goal_title}\n"
        f"DESCRIÇÃO: {goal_desc or 'Não informada'}"
    )
    res = await _run_structured_with_fallback(
        "goal_breakdown", prompt, schemas.GoalBreakdownGeminiSchema, context_block, fallback, temperature=0.25
    )
    cleaned_tasks = []
    for item in res["data"].get("tarefas", [])[:5]:
        if _contains_forbidden_subtask_phrase(item.get("titulo", "")):
            cleaned_tasks = fallback()["tarefas"]
            break
        item["prazo_sugerido"] = _normalize_iso_or_none(item.get("prazo_sugerido"))
        item["precisa_destrinchar"] = is_task_complex(item.get("titulo", ""), item.get("resumo", ""), item.get("categoria", "geral"))
        cleaned_tasks.append(item)
    if not cleaned_tasks:
        cleaned_tasks = fallback()["tarefas"]
    res["data"]["tarefas"] = cleaned_tasks
    return res
