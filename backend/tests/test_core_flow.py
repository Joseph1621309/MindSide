"""
Testes automatizados do fluxo núcleo do MINDSIDE:
cadastro -> login -> tarefas -> compromissos -> conflitos -> objetivos ->
IA -> validação -> sugestão -> aprovação -> histórico -> isolamento de usuários.

Executar com: pytest -v (dentro da pasta backend, com o ambiente ativado)
"""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from main import app
from config import settings
import services.ai_service as ai_service

client = TestClient(app)


def _register(email="ana@example.com"):
    resp = client.post("/api/auth/register", json={
        "name": "Ana", "email": email, "password": "senha123", "password_confirm": "senha123"
    })
    return resp


def test_register_and_login():
    resp = _register("teste1@example.com")
    assert resp.status_code == 201
    token = resp.json()["access_token"]
    assert token

    resp2 = client.post("/api/auth/login", json={"email": "teste1@example.com", "password": "senha123"})
    assert resp2.status_code == 200


def test_password_mismatch_rejected():
    resp = client.post("/api/auth/register", json={
        "name": "Bob", "email": "bob@example.com", "password": "abc123", "password_confirm": "xyz999"
    })
    assert resp.status_code == 400


def test_task_crud_and_isolation():
    r1 = _register("user1@example.com")
    token1 = r1.json()["access_token"]
    r2 = _register("user2@example.com")
    token2 = r2.json()["access_token"]

    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    create = client.post("/api/tasks", json={"title": "Estudar matemática", "priority": "alta"}, headers=headers1)
    assert create.status_code == 201
    task_id = create.json()["id"]

    # usuário 2 não pode ver/alterar a tarefa do usuário 1
    forbidden = client.get(f"/api/tasks/{task_id}", headers=headers2)
    assert forbidden.status_code == 404

    listed = client.get("/api/tasks", headers=headers1)
    assert len(listed.json()) == 1


def test_appointment_conflict_detection():
    r = _register("user3@example.com")
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ok = client.post("/api/appointments", json={
        "title": "Reunião", "date": "2026-10-01", "start_time": "15:00:00", "end_time": "17:00:00"
    }, headers=headers)
    assert ok.status_code == 201

    conflict = client.post("/api/appointments", json={
        "title": "Outro compromisso", "date": "2026-10-01", "start_time": "16:00:00", "end_time": "17:30:00"
    }, headers=headers)
    assert conflict.status_code == 409


def test_ai_suggestion_flow_end_to_end(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai_service, "_call_gemini", AsyncMock(return_value={
        "suggestions": [{
            "type": "compromisso",
            "title": "Prova de matemática",
            "description": "Prova de matemática",
            "priority": "alta",
            "date": "2026-10-30",
            "time": "18:00",
            "duration_minutes": 60,
            "category": "estudo",
        }],
        "reasoning_summary": "Compromisso identificado.",
    }))
    r = _register("user4@example.com")
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    analyze = client.post("/api/ai/analyze", json={
        "text": "Tenho prova de matemática sexta-feira às 18h"
    }, headers=headers)
    assert analyze.status_code == 200
    suggestions = analyze.json()["suggestions"]
    assert len(suggestions) >= 1
    sugg_id = suggestions[0]["id"]

    approve = client.post(f"/api/suggestions/{sugg_id}/approve", headers=headers)
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"

    history = client.get("/api/history", headers=headers)
    actions = [h["action"] for h in history.json()]
    assert "sugestao_aprovada" in actions


def test_editing_suggestion_type_changes_approved_record(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai_service, "_call_gemini", AsyncMock(return_value={
        "suggestions": [{
            "type": "tarefa",
            "title": "Organizar estudo",
            "description": "Organizar estudo",
            "priority": "media",
            "date": None,
            "time": None,
            "duration_minutes": 45,
            "category": "estudo",
        }],
        "reasoning_summary": "Tarefa identificada.",
    }))
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}
    analyzed = client.post("/api/ai/analyze", json={"text": "Organizar estudo"}, headers=headers)
    suggestion = analyzed.json()["suggestions"][0]
    data = suggestion["structured_data"]
    data.update({
        "type": "compromisso",
        "title": "Aula de matemática",
        "date": "2026-11-02",
        "time": "10:00",
        "duration_minutes": 60,
    })

    edited = client.put(f"/api/suggestions/{suggestion['id']}", json={"structured_data": data}, headers=headers)
    assert edited.status_code == 200
    assert edited.json()["type"] == "compromisso"
    assert "Aula de matemática" in edited.json()["content"]
    approved = client.post(f"/api/suggestions/{suggestion['id']}/approve", headers=headers)
    assert approved.status_code == 200
    assert client.get("/api/tasks", headers=headers).json() == []
    appointments = client.get("/api/appointments", headers=headers).json()
    assert len(appointments) == 1
    assert appointments[0]["title"] == "Aula de matemática"


def test_rejected_suggestion_does_not_create_task(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai_service, "_call_gemini", AsyncMock(return_value={
        "suggestions": [{
            "type": "tarefa",
            "title": "Ler capítulo",
            "description": "Ler capítulo",
            "priority": "media",
            "date": None,
            "time": None,
            "duration_minutes": 30,
            "category": "estudo",
        }],
        "reasoning_summary": "Tarefa identificada.",
    }))
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}
    analyzed = client.post("/api/ai/analyze", json={"text": "Ler capítulo"}, headers=headers)
    suggestion_id = analyzed.json()["suggestions"][0]["id"]

    rejected = client.post(f"/api/suggestions/{suggestion_id}/reject", headers=headers)

    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert client.get("/api/tasks", headers=headers).json() == []


def test_task_schedule_conflicts_with_appointments_and_ignores_itself():
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}
    appointment = client.post("/api/appointments", json={
        "title": "Reunião",
        "date": "2026-11-03",
        "start_time": "15:00:00",
        "end_time": "16:00:00",
    }, headers=headers)
    assert appointment.status_code == 201

    conflict = client.post("/api/tasks", json={
        "title": "Estudar",
        "scheduled_date": "2026-11-03",
        "scheduled_time": "15:30:00",
        "duration": 30,
    }, headers=headers)
    assert conflict.status_code == 409

    created = client.post("/api/tasks", json={
        "title": "Ler",
        "scheduled_date": "2026-11-03",
        "scheduled_time": "16:30:00",
        "duration": 30,
    }, headers=headers)
    assert created.status_code == 201

    unchanged = client.put(f"/api/tasks/{created.json()['id']}", json={"title": "Ler capítulo"}, headers=headers)
    assert unchanged.status_code == 200
    moved_into_conflict = client.put(f"/api/tasks/{created.json()['id']}", json={
        "scheduled_time": "15:45:00",
    }, headers=headers)
    assert moved_into_conflict.status_code == 409


def test_ai_input_validation_and_cors_preflight():
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}
    blank = client.post("/api/ai/analyze", json={"text": "   "}, headers=headers)
    oversized = client.post("/api/ai/analyze", json={"text": "x" * 5001}, headers=headers)
    assert blank.status_code == 400
    assert oversized.status_code == 422

    allowed = client.options("/api/ai/analyze", headers={
        "Origin": "http://localhost:5500",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] in ("*", "http://localhost:5500")
    live_server = client.options("/api/ai/brain-dump", headers={
        "Origin": "http://127.0.0.1:5500",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert live_server.status_code == 200
    assert live_server.headers["access-control-allow-origin"] in ("*", "http://127.0.0.1:5500")


def test_guest_gemini_suggestion_waits_for_approval(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    call = AsyncMock(return_value={
        "suggestions": [{
            "type": "tarefa",
            "title": "Revisar matemática",
            "description": "Revisar matemática",
            "priority": "alta",
            "date": None,
            "time": None,
            "duration_minutes": 30,
            "category": "estudo",
        }],
        "reasoning_summary": "Tarefa de estudo identificada.",
    })
    monkeypatch.setattr(ai_service, "_call_gemini", call)

    guest = client.post("/api/auth/guest")
    assert guest.status_code == 200
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    analyze = client.post("/api/ai/analyze", json={"text": "Preciso revisar matemática"}, headers=headers)
    assert analyze.status_code == 200
    call.assert_awaited_once_with("Preciso revisar matemática")
    suggestion = analyze.json()["suggestions"][0]
    assert suggestion["status"] == "pending"
    assert client.get("/api/tasks", headers=headers).json() == []

    approve = client.post(f"/api/suggestions/{suggestion['id']}/approve", headers=headers)
    assert approve.status_code == 200
    tasks = client.get("/api/tasks", headers=headers)
    assert len(tasks.json()) == 1
    assert tasks.json()[0]["title"] == "Revisar matemática"


def test_goal_crud():
    r = _register("user5@example.com")
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create = client.post("/api/goals", json={"title": "Terminar projeto", "progress": 10}, headers=headers)
    assert create.status_code == 201
    goal_id = create.json()["id"]

    update = client.put(f"/api/goals/{goal_id}", json={"progress": 50}, headers=headers)
    assert update.status_code == 200
    assert update.json()["progress"] == 50


def test_extended_database_models_and_audit_trail(monkeypatch):
    """Verifica novas entidades do banco: Categorias, Horários Disponíveis,
    Análise de IA, Validação técnica persistida e Decisões do usuário."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    guest = client.post("/api/auth/guest")
    assert guest.status_code == 200
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    # 1. Categorias padrão são inicializadas ou listadas para o usuário
    cats = client.get("/api/categories", headers=headers)
    assert cats.status_code == 200
    cat_names = [c["slug"] for c in cats.json()]
    assert "estudo" in cat_names and "trabalho" in cat_names

    # Criar nova categoria personalizada
    new_cat = client.post("/api/categories", json={
        "name": "Iniciação Científica",
        "slug": "ic",
        "tipo_categoria": "Estudo",
        "description": "Pesquisa SIC 2026"
    }, headers=headers)
    assert new_cat.status_code == 201

    # 2. Horários disponíveis (tb_horarios_disponiveis / available_slots)
    slot = client.post("/api/availability", json={
        "day_of_week": "Sexta",
        "start_time": "14:00:00",
        "end_time": "17:00:00",
        "status": "Ativo"
    }, headers=headers)
    assert slot.status_code == 201
    slots = client.get("/api/availability", headers=headers)
    assert slots.status_code == 200
    assert len(slots.json()) >= 1

    # 3. Análise multi-item (texto do Documento de Requisitos)
    analyze = client.post("/api/ai/analyze", json={
        "text": "Tenho prova de matemática sexta-feira às 18h, preciso estudar programação para um trabalho e também quero organizar meu treino durante a semana"
    }, headers=headers)
    assert analyze.status_code == 200
    body = analyze.json()
    assert len(body["suggestions"]) >= 3
    assert "analysis_id" in body

    # Cada sugestão retornada traz seu relatório de validação técnica do Python
    first_sugg = body["suggestions"][0]
    assert "validation" in first_sugg
    assert first_sugg["validation"]["formato_valido"] is True
    assert first_sugg["validation"]["campos_validos"] is True

    # 4. Solicitar nova sugestão / variação (B7 - Requisito Funcional)
    regenerated = client.post(f"/api/suggestions/{first_sugg['id']}/regenerate", headers=headers)
    assert regenerated.status_code == 200
    assert regenerated.json()["status"] in ("pending", "edited")

    # 5. Aprovar sugestão registra decisão em tb_descricao_sugestao / suggestion_decisions
    approved = client.post(f"/api/suggestions/{first_sugg['id']}/approve", headers=headers)
    assert approved.status_code == 200
    decisions = client.get(f"/api/suggestions/{first_sugg['id']}/decisions", headers=headers)
    assert decisions.status_code == 200
    decision_types = [d["decision_type"] for d in decisions.json()]
    assert "Nova_sugestao" in decision_types
    assert "Aprovar" in decision_types


def test_task_goal_linking_and_auto_progress():
    """Verifica vínculo entre tarefas e objetivos e atualização de progresso."""
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    goal = client.post("/api/goals", json={
        "title": "Apresentar MindSide no SIC 2026",
        "description": "Concluir protótipo e pitch",
        "progress": 0
    }, headers=headers).json()

    t1 = client.post("/api/tasks", json={
        "title": "Preparar slides",
        "goal_id": goal["id"],
        "priority": "alta"
    }, headers=headers)
    assert t1.status_code == 201
    assert t1.json()["goal_id"] == goal["id"]

    t2 = client.post("/api/tasks", json={
        "title": "Treinar roteiro de 4 minutos",
        "goal_id": goal["id"],
        "priority": "alta"
    }, headers=headers)
    assert t2.status_code == 201

    # Concluir 1 de 2 tarefas vinculadas atualiza progresso do objetivo para 50%
    done1 = client.put(f"/api/tasks/{t1.json()['id']}", json={"status": "concluida"}, headers=headers)
    assert done1.status_code == 200

    goals = client.get("/api/goals", headers=headers).json()
    updated_goal = next(g for g in goals if g["id"] == goal["id"])
    assert updated_goal["progress"] == 50


def test_profile_update_and_demo_seed():
    """Verifica atualização de perfil (/api/auth/me) e carga de demonstração SIC (/api/demo/seed)."""
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    updated = client.put("/api/auth/me", json={"name": "Luiz Victor (Demo SIC)"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["name"] == "Luiz Victor (Demo SIC)"

    seed = client.post("/api/demo/seed", headers=headers)
    assert seed.status_code == 200
    seed_data = seed.json()
    assert seed_data["tasks_created"] >= 3
    assert seed_data["appointments_created"] >= 2
    assert seed_data["goals_created"] >= 2
    assert seed_data["suggestions_created"] >= 2


def test_sql_schema_file_executes_cleanly_in_sqlite():
    """Garante que o arquivo backend/schema_mindside.sql (versão corrigida do Banco de dados.docx)
    possui sintaxe SQL 100% válida e cria todas as tabelas e constraints no SQLite."""
    import sqlite3
    from pathlib import Path

    sql_path = Path(__file__).resolve().parent.parent / "schema_mindside.sql"
    assert sql_path.exists()
    sql_script = sql_path.read_text(encoding="utf-8")

    conn = sqlite3.connect(":memory:")
    conn.executescript(sql_script)
    cur = conn.cursor()
    tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    expected = {
        "users", "categories", "available_slots", "goals", "tasks",
        "appointments", "user_files", "ai_analyses", "analysis_file_links",
        "suggestions", "suggestion_validations", "suggestion_decisions", "history", "study_plans", "routine_blocks"
    }
    assert expected.issubset(tables)
    user_cols = {r[1] for r in cur.execute("PRAGMA table_info(users)").fetchall()}
    assert "interface_mode" in user_cols
    assert "routine_text" in user_cols
    task_cols = {r[1] for r in cur.execute("PRAGMA table_info(tasks)").fetchall()}
    assert "subtasks_json" in task_cols
    assert "time_spent_seconds" in task_cols
    conn.close()


def test_guest_and_registered_default_interface_mode():
    """Garante que novos usuários convidados e registrados iniciam no modo 'complete'."""
    guest = client.post("/api/auth/guest")
    assert guest.status_code == 200
    assert guest.json()["user"]["interface_mode"] == "complete"

    reg = _register("mode_default@example.com")
    assert reg.status_code == 201
    assert reg.json()["user"]["interface_mode"] == "complete"


def test_interface_mode_persistence_and_history_in_auth_me():
    """Verifica alteração e persistência de interface_mode (complete <-> simplified) e auditoria no histórico."""
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    me_initial = client.get("/api/auth/me", headers=headers)
    assert me_initial.status_code == 200
    assert me_initial.json()["interface_mode"] == "complete"

    to_simplified = client.put("/api/auth/me", json={"interface_mode": "simplified"}, headers=headers)
    assert to_simplified.status_code == 200
    assert to_simplified.json()["interface_mode"] == "simplified"

    me_after = client.get("/api/auth/me", headers=headers)
    assert me_after.status_code == 200
    assert me_after.json()["interface_mode"] == "simplified"

    to_complete = client.put("/api/auth/me", json={"interface_mode": "complete"}, headers=headers)
    assert to_complete.status_code == 200
    assert to_complete.json()["interface_mode"] == "complete"

    history = client.get("/api/history", headers=headers)
    assert history.status_code == 200
    actions = [h["action"] for h in history.json()]
    assert "modo_interface_alterado" in actions


def test_interface_mode_rejects_invalid_values():
    """Garante que valores fora de ('complete', 'simplified') sejam rejeitados com 422."""
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    bad = client.put("/api/auth/me", json={"interface_mode": "invalido"}, headers=headers)
    assert bad.status_code == 422

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["interface_mode"] == "complete"


def test_executive_ai_five_features_end_to_end():
    """Valida ponta a ponta Brain Dump, Destrinchar Tarefa, Briefing, Extrator de Anotações e Arquiteto de Estudos."""
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    # 1. Brain Dump cria múltiplas tarefas estruturadas
    bd_resp = client.post(
        "/api/ai/brain-dump",
        json={"text": "Tenho prova de banco de dados sexta às 14h e preciso terminar o relatório amanhã cedo"},
        headers=headers,
    )
    assert bd_resp.status_code == 200
    bd_data = bd_resp.json()
    assert len(bd_data["created_tasks"]) >= 2
    first_task_id = bd_data["created_tasks"][0]["id"]

    # 2. Destrinchar com IA cria 3-5 micro-passos e persiste check via PUT
    brk_resp = client.post(f"/api/ai/tasks/{first_task_id}/breakdown", headers=headers)
    assert brk_resp.status_code == 200
    subtasks = brk_resp.json()["task"]["subtasks"]
    assert 3 <= len(subtasks) <= 5
    subtasks[0]["done"] = True
    upd_resp = client.put(f"/api/tasks/{first_task_id}", json={"subtasks": subtasks}, headers=headers)
    assert upd_resp.status_code == 200
    assert upd_resp.json()["subtasks"][0]["done"] is True

    # 3. Briefing Matinal recomenda uma tarefa existente
    brief_resp = client.get("/api/ai/briefing", headers=headers)
    assert brief_resp.status_code == 200
    assert brief_resp.json()["pending_count"] >= 2
    assert brief_resp.json()["recomendacao_principal"]

    # 4. Extrator de Ações de Anotações
    notes_resp = client.post(
        "/api/ai/extract-notes",
        json={"text": "Aula de Redes: hoje vimos TCP/IP. Lembrete importante: entregar lista de exercícios amanhã e enviar slides até sexta."},
        headers=headers,
    )
    assert notes_resp.status_code == 200
    assert len(notes_resp.json()["created_tasks"]) >= 1

    # 5. Arquiteto de Estudos: gera, edita subtópico, converte em tarefas, reorganiza e lista
    plan_resp = client.post(
        "/api/ai/study-plan",
        json={"text": "Aprender SQL para prova em 5 dias, 1h por dia"},
        headers=headers,
    )
    assert plan_resp.status_code == 200
    plan = plan_resp.json()["plan"]
    plan_id = plan["id"]
    assert len(plan["stages"]) == 5

    # Marca subtópico 0 como concluído na etapa 0
    stages = plan["stages"]
    stages[0]["subtopicos"][0]["done"] = True
    put_plan = client.put(f"/api/ai/study-plans/{plan_id}", json={"stages": stages}, headers=headers)
    assert put_plan.status_code == 200
    assert put_plan.json()["stages"][0]["subtopicos"][0]["done"] is True

    # Converte etapas em tarefas reais
    conv_resp = client.post(f"/api/ai/study-plans/{plan_id}/to-tasks", headers=headers)
    assert conv_resp.status_code == 200
    assert len(conv_resp.json()["created_tasks"]) == 5

    # Reorganiza datas em caso de atraso
    reorg_resp = client.post(f"/api/ai/study-plans/{plan_id}/reorganize", headers=headers)
    assert reorg_resp.status_code == 200
    assert reorg_resp.json()["rescheduled_stages"] == 5

    # Lista planos salvos
    list_plans = client.get("/api/ai/study-plans", headers=headers)
    assert list_plans.status_code == 200
    assert any(p["id"] == plan_id for p in list_plans.json())


def test_task_precisa_destrinchar_and_simple_task_breakdown_skip():
    """Verifica exposição de precisa_destrinchar nas tarefas e recusa amigável para tarefas simples no /breakdown."""
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    bd = client.post(
        "/api/ai/brain-dump",
        json={"text": "Prova de banco de dados sexta e comprar café hoje"},
        headers=headers,
    )
    assert bd.status_code == 200
    created = bd.json()["created_tasks"]
    assert len(created) == 2

    prova_task = next(t for t in created if "prova" in t["title"].lower())
    cafe_task = next(t for t in created if "café" in t["title"].lower() or "cafe" in t["title"].lower())

    assert prova_task["precisa_destrinchar"] is True
    assert cafe_task["precisa_destrinchar"] is False

    # Tentar destrinchar tarefa simples deve devolver skipped_simple=True sem sujar subtasks
    simple_brk = client.post(f"/api/ai/tasks/{cafe_task['id']}/breakdown", headers=headers)
    assert simple_brk.status_code == 200
    simple_data = simple_brk.json()
    assert simple_data["skipped_simple"] is True
    assert simple_data["message"] == "Esta é uma tarefa rápida e direta — não precisa de sub-etapas!"
    assert simple_data["task"]["subtasks"] == []

    # Destrinchar tarefa complexa gera sub-etapas específicas de estudo (sem Pomodoro genérico)
    complex_brk = client.post(f"/api/ai/tasks/{prova_task['id']}/breakdown", headers=headers)
    assert complex_brk.status_code == 200
    complex_data = complex_brk.json()
    assert complex_data["skipped_simple"] is False
    titles = [st["title"] for st in complex_data["task"]["subtasks"]]
    assert titles == [
        "Revisar conceitos principais e anotações",
        "Resolver exercícios práticos do tema",
        "Anotar pontos de dúvida para revisão final",
    ]


def test_ai_analyze_and_brain_dump_link_goals_and_filter_complexity(monkeypatch):
    """Verifica melhorias #2 e #5 ponta a ponta: vinculação automática de goal_id e decomposição com filtro de complexidade."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    goal = client.post(
        "/api/goals",
        json={"title": "Dominar Banco de Dados e SQL", "description": "Consultas avançadas e modelagem"},
        headers=headers,
    ).json()

    # 1. /api/ai/analyze associa goal_id e gera subtasks apenas na tarefa complexa
    analyze = client.post(
        "/api/ai/analyze",
        json={"text": "Preciso estudar Joins em SQL para a prova e comprar café hoje"},
        headers=headers,
    )
    assert analyze.status_code == 200
    suggs = analyze.json()["suggestions"]
    assert len(suggs) == 2

    sugg_sql = next(s for s in suggs if "sql" in s["structured_data"]["title"].lower())
    sugg_cafe = next(s for s in suggs if "caf" in s["structured_data"]["title"].lower())

    assert sugg_sql["structured_data"]["goal_id"] == goal["id"]
    assert sugg_sql["structured_data"]["precisa_destrinchar"] is True
    assert len(sugg_sql["structured_data"]["subtasks"]) == 3

    assert sugg_cafe["structured_data"]["goal_id"] is None
    assert sugg_cafe["structured_data"]["precisa_destrinchar"] is False
    assert sugg_cafe["structured_data"]["subtasks"] == []

    # Aprovar sugestão complexa preserva goal_id e subtasks na Task criada
    approved = client.post(f"/api/suggestions/{sugg_sql['id']}/approve", headers=headers)
    assert approved.status_code == 200
    tasks = client.get("/api/tasks", headers=headers).json()
    saved_sql = next(t for t in tasks if "sql" in t["title"].lower())
    assert saved_sql["goal_id"] == goal["id"]
    assert len(saved_sql["subtasks"]) == 3

    # 2. /api/ai/brain-dump também vincula goal_id automaticamente
    bd = client.post(
        "/api/ai/brain-dump",
        json={"text": "Revisar modelagem de banco de dados amanhã e pagar conta de água hoje"},
        headers=headers,
    )
    assert bd.status_code == 200
    created_bd = bd.json()["created_tasks"]
    bd_db_task = next(t for t in created_bd if "banco de dados" in t["title"].lower())
    bd_bill_task = next(t for t in created_bd if "pagar" in t["title"].lower())
    assert bd_db_task["goal_id"] == goal["id"]
    assert bd_bill_task["goal_id"] is None
    assert bd_bill_task["precisa_destrinchar"] is False


def test_available_slot_crossing_in_free_slot_and_regenerate(monkeypatch):
    """Verifica melhoria #3: _find_next_free_slot e /regenerate cruzam AvailableSlot com compromissos existentes."""
    from datetime import date, timedelta

    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    tomorrow = date.today() + timedelta(days=1)
    weekdays_ascii = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"]
    tomorrow_name = weekdays_ascii[tomorrow.weekday()]

    # Cadastra janela livre amanhã das 14:00 às 17:00
    slot_resp = client.post(
        "/api/availability",
        json={"day_of_week": tomorrow_name, "start_time": "14:00:00", "end_time": "17:00:00", "status": "Ativo"},
        headers=headers,
    )
    assert slot_resp.status_code == 201

    # Ocupa 14:00–15:30 com um compromisso existente
    appt_resp = client.post(
        "/api/appointments",
        json={
            "title": "Aula fixa",
            "date": tomorrow.isoformat(),
            "start_time": "14:00:00",
            "end_time": "15:30:00",
        },
        headers=headers,
    )
    assert appt_resp.status_code == 201

    # Solicita compromisso conflitante às 14h de amanhã
    analyze = client.post(
        "/api/ai/analyze",
        json={"text": "Tenho reunião de projeto amanhã às 14h"},
        headers=headers,
    )
    assert analyze.status_code == 200
    sugg = analyze.json()["suggestions"][0]
    s_data = sugg["structured_data"]
    assert len(s_data["conflicts"]) >= 1
    assert s_data["suggested_free_slot"]["date"] == tomorrow.isoformat()
    assert s_data["suggested_free_slot"]["time"] == "15:30"

    # Regenerar sugestão encontra exatamente 15:30 dentro do AvailableSlot livre
    regen = client.post(f"/api/suggestions/{sugg['id']}/regenerate", headers=headers)
    assert regen.status_code == 200
    import json
    regen_data = json.loads(regen.json()["structured_data"])
    assert regen_data["date"] == tomorrow.isoformat()
    assert regen_data["time"] == "15:30"
    assert regen_data["conflicts"] == []


def test_freeform_routine_parsing_conflict_blocking_and_ai_context(monkeypatch):
    """Verifica onboarding de rotina em texto livre, bloqueio de conflitos e injeção no contexto da IA."""
    from datetime import date, timedelta
    import routes.ai as ai_routes
    from database import SessionLocal

    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}
    user_id = guest.json()["user"]["id"]

    routine_desc = (
        "Estudo das 7h às 12h30 de seg a sex, faço curso técnico à tarde na terça e quinta das 14h às 17h e durmo às 23h"
    )
    saved = client.post("/api/ai/routine", json={"text": routine_desc}, headers=headers)
    assert saved.status_code == 200
    body = saved.json()
    assert body["has_routine"] is True
    blocks = body["blocks"]
    # 5 blocos estudo (seg-sex) + 2 blocos curso técnico (ter, qui) + 7 blocos sono = 14 blocos
    assert len(blocks) >= 12
    assert any(b["day_of_week"] == "Terca" and b["start_time"].startswith("14:00") and b["end_time"].startswith("17:00") for b in blocks)
    assert any(b["day_of_week"] == "Segunda" and b["start_time"].startswith("07:00") and b["end_time"].startswith("12:30") for b in blocks)

    # Verifica GET /api/ai/routine
    fetched = client.get("/api/ai/routine", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["has_routine"] is True
    assert fetched.json()["routine_text"] == routine_desc

    # Verifica injeção no contexto do sistema para a IA
    db = SessionLocal()
    try:
        ctx, *_ = ai_routes._build_db_context(db, user_id)
    finally:
        db.close()
    assert "ROTINA FIXA OCUPADA DO USUÁRIO" in ctx
    assert "07:00–12:30" in ctx

    # Encontra a próxima sexta-feira e tenta agendar compromisso às 09:00 (dentro do bloco fixo 07:00–12:30)
    today = date.today()
    days_to_fri = (4 - today.weekday()) % 7 or 7
    next_fri = today + timedelta(days=days_to_fri)
    conflict_appt = client.post(
        "/api/appointments",
        json={
            "title": "Reunião matinal proibida",
            "date": next_fri.isoformat(),
            "start_time": "09:00:00",
            "end_time": "10:00:00",
        },
        headers=headers,
    )
    assert conflict_appt.status_code == 409

    # Também verifica /api/ai/analyze detectando conflito com rotina fixa e sugerindo horário livre fora de 07:00-12:30 e sono
    analyze = client.post(
        "/api/ai/analyze",
        json={"text": "Tenho reunião de trabalho sexta-feira às 9h"},
        headers=headers,
    )
    assert analyze.status_code == 200
    s_data = analyze.json()["suggestions"][0]["structured_data"]
    assert any(c["type"] == "routine" for c in s_data["conflicts"])
    assert s_data["suggested_free_slot"]["time"] not in ("07:00", "08:00", "09:00", "10:00", "11:00", "23:00")


def test_task_timer_persistence_and_goal_ai_breakdown(monkeypatch):
    """Verifica persistência de time_spent_seconds / tempo_gasto_segundos e decomposição de Objetivos com IA."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    # 1. Cronômetro de tarefa (time_spent_seconds & tempo_gasto_segundos)
    t_resp = client.post("/api/tasks", json={"title": "Revisar algoritmos", "priority": "alta"}, headers=headers)
    assert t_resp.status_code == 201
    t_id = t_resp.json()["id"]
    assert t_resp.json()["time_spent_seconds"] == 0

    upd = client.put(f"/api/tasks/{t_id}", json={"tempo_gasto_segundos": 325, "status": "concluida"}, headers=headers)
    assert upd.status_code == 200
    assert upd.json()["time_spent_seconds"] == 325
    assert upd.json()["tempo_gasto_segundos"] == 325

    # 2. Destrinchar Meta com IA (preview -> auto_create conectado ao goal_id)
    g_resp = client.post(
        "/api/goals",
        json={"title": "Conseguir vaga de Jovem Aprendiz em TI", "description": "Foco em currículo, GitHub e entrevistas"},
        headers=headers,
    )
    assert g_resp.status_code == 201
    g_id = g_resp.json()["id"]

    preview = client.post(f"/api/ai/goals/{g_id}/breakdown", json={"auto_create": False}, headers=headers)
    assert preview.status_code == 200
    suggested = preview.json()["suggested_tasks"]
    assert 3 <= len(suggested) <= 5
    for st in suggested:
        assert "25 min" not in st["titulo"].lower()
        assert "preparar ambiente" not in st["titulo"].lower()

    created = client.post(
        f"/api/ai/goals/{g_id}/breakdown",
        json={"auto_create": True, "selected_tasks": suggested},
        headers=headers,
    )
    assert created.status_code == 200
    created_tasks = created.json()["created_tasks"]
    assert len(created_tasks) == len(suggested)
    assert all(ct["goal_id"] == g_id for ct in created_tasks)


def test_demo_reset_clears_all_session_entities(monkeypatch):
    """Verifica se POST /api/demo/reset remove tarefas, compromissos, objetivos, rotina, planos e sugestões."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    guest = client.post("/api/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['access_token']}"}

    assert client.post("/api/demo/seed", headers=headers).status_code == 200
    assert client.post(
        "/api/ai/routine",
        json={"text": "Estudo das 8h às 12h de seg a sex e durmo às 23h"},
        headers=headers,
    ).status_code == 200
    assert client.post(
        "/api/ai/study-plan",
        json={"text": "Estudar SQL em 3 dias"},
        headers=headers,
    ).status_code == 200

    assert len(client.get("/api/tasks", headers=headers).json()) > 0
    assert len(client.get("/api/appointments", headers=headers).json()) > 0
    assert len(client.get("/api/goals", headers=headers).json()) > 0
    assert len(client.get("/api/availability", headers=headers).json()) > 0
    assert len(client.get("/api/suggestions", headers=headers).json()) > 0
    assert client.get("/api/ai/routine", headers=headers).json()["has_routine"] is True
    assert len(client.get("/api/ai/study-plans", headers=headers).json()) > 0

    reset = client.post("/api/demo/reset", headers=headers)
    assert reset.status_code == 200
    assert reset.json()["status"] == "ok"

    assert client.get("/api/tasks", headers=headers).json() == []
    assert client.get("/api/appointments", headers=headers).json() == []
    assert client.get("/api/goals", headers=headers).json() == []
    assert client.get("/api/availability", headers=headers).json() == []
    assert client.get("/api/suggestions", headers=headers).json() == []
    assert client.get("/api/ai/study-plans", headers=headers).json() == []

    routine_after = client.get("/api/ai/routine", headers=headers).json()
    assert routine_after["has_routine"] is False
    assert routine_after["routine_text"] == ""
    assert routine_after["blocks"] == []


def test_aws_deployment_readiness():
    """Verifica normalização de URL do AWS RDS, rota de saúde e entrega estática do frontend."""
    from database import normalize_database_url

    assert normalize_database_url("postgres://u:p@rds.amazonaws.com:5432/db") == "postgresql+psycopg://u:p@rds.amazonaws.com:5432/db"
    assert normalize_database_url("postgresql://u:p@rds.amazonaws.com:5432/db") == "postgresql+psycopg://u:p@rds.amazonaws.com:5432/db"
    assert normalize_database_url("sqlite:///./mindside.db") == "sqlite:///./mindside.db"

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    home = client.get("/")
    assert home.status_code == 200
    assert "MINDSIDE" in home.text

    dash = client.get("/dashboard.html")
    assert dash.status_code == 200
    assert "dashboard.js" in dash.text





