"""
Serviço de validação das sugestões geradas pela IA.
NUNCA confia cegamente na resposta da IA — todo campo é validado aqui
antes de a sugestão ser apresentada ao usuário.
"""
from datetime import datetime
from typing import Dict, Any, Tuple

VALID_PRIORITIES = {"baixa", "media", "alta", "urgente"}
VALID_TYPES = {"tarefa", "compromisso"}
VALID_CATEGORIES = {"estudo", "trabalho", "saude", "lazer", "pessoal", "geral"}


def validate_suggestion(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Retorna (valido, motivo). Se inválido, motivo explica o problema."""
    if not isinstance(data, dict):
        return False, "Formato de dados inválido."

    tipo = data.get("type")
    if tipo not in VALID_TYPES:
        return False, f"Tipo '{tipo}' inválido. Esperado: {VALID_TYPES}."

    if not data.get("title") or not isinstance(data.get("title"), str):
        return False, "Título ausente ou inválido."

    date_str = data.get("date")
    if date_str:
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            return False, "Data em formato inválido (esperado AAAA-MM-DD)."

    time_str = data.get("time")
    if time_str:
        try:
            datetime.strptime(time_str, "%H:%M")
        except ValueError:
            return False, "Horário em formato inválido (esperado HH:MM)."

    duration = data.get("duration_minutes")
    if duration is not None:
        if not isinstance(duration, int) or duration <= 0 or duration > 24 * 60:
            return False, "Duração inválida."

    priority = data.get("priority")
    if priority and priority not in VALID_PRIORITIES:
        return False, f"Prioridade '{priority}' inválida."

    category = data.get("category")
    if category and category not in VALID_CATEGORIES:
        # não bloqueia, apenas normaliza para 'geral'
        data["category"] = "geral"

    return True, "ok"
