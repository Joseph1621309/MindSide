import asyncio
import json
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from google.genai import errors as genai_errors

import services.ai_service as ai_service
from config import settings


SUGGESTION = {
    "type": "tarefa",
    "title": "Estudar matemática",
    "description": "Revisar matemática",
    "priority": "alta",
    "date": None,
    "time": None,
    "duration_minutes": 30,
    "category": "estudo",
}


def test_provider_response_requires_valid_suggestions():
    parsed = ai_service._parse_provider_response(json.dumps({
        "suggestions": [SUGGESTION],
        "reasoning_summary": "Tarefa identificada.",
    }))
    assert parsed["suggestions"] == [SUGGESTION]

    for raw in ("", "not-json", '{"suggestions":[]}', '{"suggestions":[null]}'):
        with pytest.raises(ai_service.AIResponseError):
            ai_service._parse_provider_response(raw)


def test_gemini_uses_configured_model_and_parses_response(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-test-flash")

    response = type("Response", (), {
        "text": json.dumps({"suggestions": [SUGGESTION], "reasoning_summary": "Tarefa identificada."})
    })()
    generate_content = AsyncMock(return_value=response)
    close = AsyncMock()
    sync_close = Mock()
    client = type("Client", (), {})()
    client.aio = type("AsyncClient", (), {})()
    client.aio.models = type("Models", (), {"generate_content": generate_content})()
    client.aio.aclose = close
    client.close = sync_close
    monkeypatch.setattr(ai_service.genai, "Client", lambda **kwargs: client)

    result = asyncio.run(ai_service._call_gemini("Preciso estudar matemática"))

    assert result["suggestions"] == [SUGGESTION]
    assert generate_content.await_args.kwargs["model"] == "gemini-test-flash"
    assert generate_content.await_args.kwargs["config"].response_mime_type == "application/json"
    close.assert_awaited_once()
    sync_close.assert_called_once()


def test_analyze_text_selects_gemini_provider(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    call = AsyncMock(return_value={
        "suggestions": [SUGGESTION],
        "reasoning_summary": "Tarefa identificada.",
    })
    monkeypatch.setattr(ai_service, "_call_gemini", call)

    result = asyncio.run(ai_service.analyze_text("Preciso estudar matemática"))

    assert result["suggestions"] == [SUGGESTION]
    call.assert_awaited_once_with("Preciso estudar matemática")


def test_gemini_transport_failure_uses_rule_fallback(monkeypatch, caplog):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        ai_service,
        "_call_gemini",
        AsyncMock(side_effect=httpx.ConnectError("network unavailable")),
    )

    result = asyncio.run(ai_service.analyze_text("Tenho prova amanhã às 14h"))

    assert result["suggestions"][0]["type"] == "compromisso"
    assert "using local rule-based fallback" in caplog.text
    assert "network unavailable" not in caplog.text


@pytest.mark.parametrize("status_code", [400, 403, 404, 429, 503, 504])
def test_gemini_api_errors_use_fallback_without_logging_response(monkeypatch, caplog, status_code):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    error = genai_errors.APIError(
        status_code,
        {"error": {"message": "sensitive provider response"}},
    )
    monkeypatch.setattr(ai_service, "_call_gemini", AsyncMock(side_effect=error))

    result = asyncio.run(ai_service.analyze_text("Tenho prova amanhã"))

    assert result["suggestions"]
    assert f"status={status_code}" in caplog.text
    assert "sensitive provider response" not in caplog.text
    if status_code == 404:
        assert "temporarily unavailable" not in caplog.text


def test_gemini_404_retired_model_is_diagnosed_from_provider_message(monkeypatch, caplog):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    error = genai_errors.APIError(
        404,
        {"error": {"message": "This model is no longer available to new users."}},
    )
    monkeypatch.setattr(ai_service, "_call_gemini", AsyncMock(side_effect=error))

    asyncio.run(ai_service.analyze_text("Tenho prova amanhã"))

    assert "modelo não disponível para novos usuários" in caplog.text
    assert "no longer available to new users" not in caplog.text


def test_gemini_timeout_and_unexpected_failures_use_fallback(monkeypatch, caplog):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    for failure in (httpx.ReadTimeout("private detail"), RuntimeError("private detail")):
        monkeypatch.setattr(ai_service, "_call_gemini", AsyncMock(side_effect=failure))
        result = asyncio.run(ai_service.analyze_text("Revisar matemática"))
        assert result["suggestions"]
    assert "private detail" not in caplog.text
    assert "tempo limite excedido" in caplog.text


def test_gemini_invalid_api_key_is_diagnosed_without_logging_provider_message(monkeypatch, caplog):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    error = genai_errors.APIError(
        400,
        {"error": {"message": "API key not valid. Sensitive details excluded."}},
    )
    monkeypatch.setattr(ai_service, "_call_gemini", AsyncMock(side_effect=error))

    asyncio.run(ai_service.analyze_text("Revisar matemática"))

    assert "chave da API inválida" in caplog.text
    assert "Sensitive details excluded" not in caplog.text


def test_invalid_gemini_response_uses_fallback(monkeypatch, caplog):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        ai_service,
        "_call_gemini",
        AsyncMock(side_effect=ai_service.AIResponseError("invalid response")),
    )

    result = asyncio.run(ai_service.analyze_text("Revisar matemática"))

    assert result["suggestions"]
    assert "AIResponseError" in caplog.text


def test_missing_gemini_key_uses_rule_fallback(monkeypatch, caplog):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    result = asyncio.run(ai_service.analyze_text("Estudar para a prova"))

    assert result["suggestions"][0]["type"] == "compromisso"
    assert "GEMINI_API_KEY is missing" in caplog.text


def test_structured_gemini_wrapper_uses_schema_system_instruction_and_temp(monkeypatch):
    import schemas

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")

    payload = {
        "itens": [
            {
                "titulo": "Revisar Banco de Dados",
                "prioridade": "Alta",
                "prazo_sugerido": "2026-11-20",
                "categoria": "estudo",
                "duracao_min": 45,
                "resumo": "Prova na sexta",
            }
        ],
        "comentario_secretario": "Prioridade definida.",
    }
    response = type("Response", (), {"text": json.dumps(payload)})()
    generate_content = AsyncMock(return_value=response)
    close = AsyncMock()
    sync_close = Mock()
    client = type("Client", (), {})()
    client.aio = type("AsyncClient", (), {})()
    client.aio.models = type("Models", (), {"generate_content": generate_content})()
    client.aio.aclose = close
    client.close = sync_close
    monkeypatch.setattr(ai_service.genai, "Client", lambda **kwargs: client)

    ctx = ai_service.build_user_context_block(
        [{"id": 1, "title": "Pendente X", "priority": "alta", "deadline": "2026-11-18"}],
        [],
    )
    assert "CONTEXTO DO SISTEMA:" in ctx
    assert "Pendente X" in ctx

    result = asyncio.run(
        ai_service._call_gemini_structured(
            "Prova sexta",
            schemas.BrainDumpGeminiSchema,
            context_block=ctx,
            temperature=0.2,
        )
    )
    assert result["itens"][0]["titulo"] == "Revisar Banco de Dados"
    cfg = generate_content.await_args.kwargs["config"]
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_schema is schemas.BrainDumpGeminiSchema
    assert cfg.system_instruction == ai_service.EXECUTIVE_SYSTEM_INSTRUCTION
    assert cfg.temperature == 0.2
    close.assert_awaited_once()
    sync_close.assert_called_once()


def test_five_executive_features_fallback_gracefully_on_rate_limit(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    err = genai_errors.APIError(429, {"error": {"message": "Quota exceeded"}})
    monkeypatch.setattr(ai_service, "_call_gemini_structured", AsyncMock(side_effect=err))

    bd = asyncio.run(ai_service.generate_brain_dump_items("Tenho prova sexta às 14h e terminar relatório amanhã"))
    assert bd["fallback_used"] is True
    assert len(bd["data"]["itens"]) >= 1

    brk = asyncio.run(ai_service.generate_task_breakdown("Estudar SQL para prova"))
    assert brk["fallback_used"] is True
    assert 3 <= len(brk["data"]["passos"]) <= 5

    brief = asyncio.run(ai_service.generate_daily_briefing(
        [{"id": 7, "title": "Entregar TCC", "priority": "urgente", "deadline": "2026-11-16"}],
        [],
    ))
    assert brief["fallback_used"] is True
    assert "Entregar TCC" in brief["data"]["recomendacao_principal"]

    ext = asyncio.run(ai_service.extract_actions_from_notes("Ata: enviar relatório até amanhã.\nBom dia a todos."))
    assert ext["fallback_used"] is True
    assert len(ext["data"]["acoes"]) >= 1

    plan = asyncio.run(ai_service.generate_study_plan("Aprender SQL para prova em 4 dias, 1h por dia"))
    assert plan["fallback_used"] is True
    assert plan["data"]["total_dias_ou_etapas"] == 4
    assert plan["data"]["tempo_diario_min"] == 60
    assert len(plan["data"]["etapas"]) == 4


def test_surgical_brain_dump_extract_notes_and_clean_study_plan(monkeypatch):
    from datetime import date
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")

    ref_today = date(2026, 11, 16)  # Segunda-feira

    # 1. Brain Dump com 3 tarefas misturadas
    bd = asyncio.run(
        ai_service.generate_brain_dump_items(
            "Tenho prova de banco de dados sexta às 14h, preciso terminar o relatório amanhã cedo e comprar café hoje",
            today=ref_today,
        )
    )
    items = bd["data"]["itens"]
    assert len(items) == 3
    assert items[0]["prioridade"] == "Alta"
    assert items[0]["prazo_sugerido"] == "2026-11-20"
    assert items[1]["prioridade"] == "Média"
    assert items[1]["prazo_sugerido"] == "2026-11-17"
    assert items[2]["prioridade"] == "Baixa"
    assert items[2]["prazo_sugerido"] == "2026-11-16"
    assert "comprar" not in items[1]["titulo"].lower()

    # 2. Extrair de Anotação ignorando frase descritiva e sem cortar na palavra "até"
    ext = asyncio.run(
        ai_service.extract_actions_from_notes(
            "A reunião da equipe hoje foi ótima... Ficou decidido que o Guilherme vai revisar os slides até quarta-feira, e eu preciso subir o código atualizado no GitHub ainda hoje",
            today=ref_today,
        )
    )
    acoes = ext["data"]["acoes"]
    assert len(acoes) == 2
    assert not any("reunião" in a["titulo"].lower() for a in acoes)
    assert acoes[0]["titulo"] == "Guilherme revisar os slides"
    assert acoes[0]["prazo_sugerido"] == "2026-11-18"
    assert not acoes[0]["titulo"].lower().endswith("até")
    assert acoes[1]["titulo"] == "Subir o código atualizado no GitHub"
    assert acoes[1]["prazo_sugerido"] == "2026-11-16"

    # 3. Arquiteto de Estudos sem repetição de "para uma prova, estudando"
    plan = asyncio.run(
        ai_service.generate_study_plan("Joins e subqueries em sql para uma prova , estudando")
    )["data"]
    assert "Joins e Subqueries em SQL" in plan["titulo_plano"]
    first_topic = plan["etapas"][0]["topico_principal"]
    assert "para uma prova" not in first_topic.lower()
    assert "estudando" not in first_topic.lower()
    assert first_topic == "Fundamentos e mapa mental de Joins e Subqueries em SQL"


def test_task_complexity_and_domain_specific_breakdown(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")

    # 1. Tarefas simples / rápidas devem retornar precisa_destrinchar = False
    for simple in (
        ("Comprar café", "pessoal"),
        ("Beber água", "saude"),
        ("Ligar para o médico", "pessoal"),
        ("Pagar conta de luz", "pessoal"),
        ("Enviar e-mail rápido", "trabalho"),
        ("Levar o lixo", "pessoal"),
    ):
        assert ai_service.is_task_complex(simple[0], "", simple[1]) is False

    # 2. Tarefas complexas devem retornar precisa_destrinchar = True
    for complex_task in (
        ("Prova de banco de dados", "estudo"),
        ("Subir o código atualizado no GitHub", "trabalho"),
        ("Terminar o relatório amanhã", "trabalho"),
        ("Guilherme revisar os slides", "estudo"),
        ("Organizar evento acadêmico", "pessoal"),
    ):
        assert ai_service.is_task_complex(complex_task[0], "", complex_task[1]) is True

    # 3. Brain Dump anexa precisa_destrinchar corretamente por card
    bd = asyncio.run(
        ai_service.generate_brain_dump_items(
            "Tenho prova de banco de dados sexta às 14h, preciso terminar o relatório amanhã cedo e comprar café hoje"
        )
    )["data"]["itens"]
    assert bd[0]["precisa_destrinchar"] is True
    assert bd[1]["precisa_destrinchar"] is True
    assert bd[2]["precisa_destrinchar"] is False

    # 4. Breakdown específico por domínio (sem passos genéricos Pomodoro/Preparar ambiente)
    study_steps = [
        p["titulo"]
        for p in asyncio.run(ai_service.generate_task_breakdown("Prova de banco de dados", category="estudo"))["data"]["passos"]
    ]
    assert study_steps == [
        "Revisar conceitos principais e anotações",
        "Resolver exercícios práticos do tema",
        "Anotar pontos de dúvida para revisão final",
    ]

    code_steps = [
        p["titulo"]
        for p in asyncio.run(ai_service.generate_task_breakdown("Subir o código atualizado no GitHub", category="trabalho"))["data"]["passos"]
    ]
    assert code_steps == [
        "Estruturar lógica principal e requisitos",
        "Implementar código e testar funcionamento local",
        "Fazer commit e validar entrega",
    ]

    report_steps = [
        p["titulo"]
        for p in asyncio.run(ai_service.generate_task_breakdown("Terminar o relatório mensal", category="trabalho"))["data"]["passos"]
    ]
    assert report_steps == [
        "Definir tópicos principais e estrutura",
        "Redigir conteúdo central e exemplos",
        "Revisar formatação e versão final",
    ]

    for step in study_steps + code_steps + report_steps:
        assert "preparar ambiente" not in step.lower()
        assert "25 min sem distrações" not in step.lower()


def test_analyze_system_prompt_has_today_and_call_gemini_uses_native_schema(monkeypatch):
    from datetime import date
    import schemas

    today = date.today()
    assert today.isoformat() in ai_service.SYSTEM_PROMPT
    assert ai_service.WEEKDAYS_PT_FULL[today.weekday()] in ai_service.SYSTEM_PROMPT

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")

    response = type("Response", (), {
        "text": json.dumps({
            "suggestions": [{
                "type": "tarefa",
                "title": "Estudar SQL",
                "description": "Revisar Joins",
                "priority": "alta",
                "date": today.isoformat(),
                "time": None,
                "duration_minutes": 45,
                "category": "estudo",
                "goal_id": 42,
                "precisa_destrinchar": True,
            }],
            "reasoning_summary": "Meta e data associadas.",
        })
    })()
    generate_content = AsyncMock(return_value=response)
    client = type("Client", (), {})()
    client.aio = type("AsyncClient", (), {})()
    client.aio.models = type("Models", (), {"generate_content": generate_content})()
    client.aio.aclose = AsyncMock()
    client.close = Mock()
    monkeypatch.setattr(ai_service.genai, "Client", lambda **kwargs: client)

    ctx = ai_service.build_user_context_block(
        pending_tasks=[],
        upcoming_appointments=[],
        active_goals=[{"id": 42, "title": "Dominar Banco de Dados", "progress": 20}],
        available_slots=[{"day_of_week": "Sexta", "start_time": "14:00", "end_time": "17:00"}],
    )
    assert "goal_id=42" in ctx
    assert "HORÁRIOS DISPONÍVEIS" in ctx

    tok = ai_service._ANALYZE_CONTEXT_VAR.set(ctx)
    try:
        res = asyncio.run(ai_service._call_gemini("Estudar SQL hoje"))
    finally:
        ai_service._ANALYZE_CONTEXT_VAR.reset(tok)

    cfg = generate_content.await_args.kwargs["config"]
    assert cfg.response_schema is schemas.AIAnalyzeGeminiSchema
    assert "goal_id=42" in cfg.system_instruction
    assert res["suggestions"][0]["goal_id"] == 42


def test_goal_matching_and_forbidden_subtask_sanitization(monkeypatch):
    goals = [
        {"id": 10, "title": "Dominar Banco de Dados e SQL", "description": "Foco em consultas e modelagem"},
        {"id": 11, "title": "Correr 5km na semana", "description": "Treino físico"},
    ]
    assert ai_service.match_goal_id_for_task("Estudar Joins em SQL", "Prova na sexta", goals) == 10
    assert ai_service.match_goal_id_for_task("Comprar café hoje", "", goals) is None

    # Filtro proíbe passos genéricos mesmo se a IA tentar gerá-los
    sanitized = ai_service.build_domain_subtasks_list(
        "Estudar SQL para prova",
        category="estudo",
        candidate_steps=[
            {"titulo": "Preparar ambiente e separar materiais", "tempo_estimado_min": 15},
            {"titulo": "Executar bloco focado de 25 minutos", "tempo_estimado_min": 25},
        ],
    )
    assert len(sanitized) == 3
    for step in sanitized:
        assert not ai_service._contains_forbidden_subtask_phrase(step["title"])

    # Tarefa simples nunca é decomposta mesmo se candidate_steps for passado
    assert ai_service.build_domain_subtasks_list(
        "Comprar café",
        category="pessoal",
        candidate_steps=[{"titulo": "Ir até a cafeteria", "tempo_estimado_min": 15}],
    ) == []
