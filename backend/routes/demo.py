import json
from datetime import date, time, datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from dependencies import get_db, get_current_user
from routes.categories import ensure_default_categories

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/seed")
def seed_demo_data(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """
    Popula a sessão atual com um cenário realista e verificável para a banca do
    Samsung Innovation Campus (SIC 2026), demonstrando tarefas vinculadas a objetivos,
    compromissos com verificação de conflitos, horários disponíveis e sugestões da IA
    aguardando decisão humana.
    """
    ensure_default_categories(db, user.id)
    today = date.today()
    tomorrow = today + timedelta(days=1)
    in_two_days = today + timedelta(days=2)

    # Limpa dados anteriores da sessão para evitar duplicação caso clicado duas vezes
    db.query(models.SuggestionDecision).filter(models.SuggestionDecision.user_id == user.id).delete()
    for s in db.query(models.Suggestion).filter(models.Suggestion.user_id == user.id).all():
        db.delete(s)
    db.query(models.AIAnalysis).filter(models.AIAnalysis.user_id == user.id).delete()
    db.query(models.Task).filter(models.Task.user_id == user.id).delete()
    db.query(models.Appointment).filter(models.Appointment.user_id == user.id).delete()
    db.query(models.Goal).filter(models.Goal.user_id == user.id).delete()
    db.query(models.AvailableSlot).filter(models.AvailableSlot.user_id == user.id).delete()
    db.query(models.StudyPlan).filter(models.StudyPlan.user_id == user.id).delete()
    db.query(models.RoutineBlock).filter(models.RoutineBlock.user_id == user.id).delete()
    db.commit()

    # 1. Horários disponíveis
    slots = [
        models.AvailableSlot(user_id=user.id, day_of_week="Segunda", start_time=time(14, 0), end_time=time(18, 0), status="Ativo"),
        models.AvailableSlot(user_id=user.id, day_of_week="Quarta", start_time=time(14, 0), end_time=time(18, 0), status="Ativo"),
        models.AvailableSlot(user_id=user.id, day_of_week="Sexta", start_time=time(14, 0), end_time=time(20, 0), status="Ativo"),
    ]
    db.add_all(slots)
    db.commit()

    # 2. Objetivos
    g1 = models.Goal(
        user_id=user.id,
        title="Apresentação Final — Samsung Innovation Campus 2026",
        description="Entregar MVP funcional do MindSide com validação Python, persistência SQL e controle humano.",
        start_date=today - timedelta(days=10),
        deadline=today + timedelta(days=30),
        progress=50,
        status="ativo",
    )
    g2 = models.Goal(
        user_id=user.id,
        title="Equilíbrio de Rotina Acadêmica e Saúde",
        description="Conciliar estudos de programação e matemática com 3 sessões semanais de atividade física.",
        start_date=today - timedelta(days=5),
        deadline=today + timedelta(days=45),
        progress=33,
        status="ativo",
    )
    db.add_all([g1, g2])
    db.commit()
    db.refresh(g1)
    db.refresh(g2)

    # 3. Compromissos na agenda (incluindo um hoje às 18:00 para demonstrar detecção de conflito)
    appts = [
        models.Appointment(
            user_id=user.id,
            title="Mentoria Técnica SENAI Anchieta — SIC",
            description="Revisão da arquitetura Python + IA e validação de requisitos",
            date=today,
            start_time=time(15, 0),
            end_time=time(16, 30),
            category="estudo",
            status="Agendada",
        ),
        models.Appointment(
            user_id=user.id,
            title="Aula de Cálculo e Álgebra",
            description="Preparação para avaliação semanal",
            date=tomorrow,
            start_time=time(18, 0),
            end_time=time(19, 30),
            category="estudo",
            status="Agendada",
        ),
        models.Appointment(
            user_id=user.id,
            title="Reunião de Alinhamento do Grupo MindSide",
            description="Divisão do pitch e ensaio da demonstração ao vivo",
            date=in_two_days,
            start_time=time(14, 0),
            end_time=time(15, 30),
            category="trabalho",
            status="Agendada",
        ),
    ]
    db.add_all(appts)
    db.commit()

    # 4. Tarefas vinculadas aos objetivos
    tasks = [
        models.Task(
            user_id=user.id,
            goal_id=g1.id,
            title="Validar suíte de testes automatizados (pytest)",
            description="Garantir 100% dos testes passando antes da banca",
            priority="urgente",
            category="trabalho",
            deadline=today,
            duration=45,
            status="concluida",
            scheduled_date=today,
            scheduled_time=time(10, 0),
            completed_at=datetime.now(timezone.utc),
        ),
        models.Task(
            user_id=user.id,
            goal_id=g1.id,
            title="Ensaiar demonstração de 4 minutos para a banca SIC",
            description="Demonstrar criação de sugestão pela IA, conflito e aprovação humana",
            priority="alta",
            category="estudo",
            deadline=tomorrow,
            duration=45,
            status="em_andamento",
            scheduled_date=today,
            scheduled_time=time(17, 0),
        ),
        models.Task(
            user_id=user.id,
            goal_id=g2.id,
            title="Treino funcional e corrida leve (40 min)",
            description="Pausa ativa para reduzir sobrecarga cognitiva",
            priority="media",
            category="saude",
            deadline=tomorrow,
            duration=40,
            status="pendente",
            scheduled_date=tomorrow,
            scheduled_time=time(16, 30),
        ),
        models.Task(
            user_id=user.id,
            goal_id=g2.id,
            title="Resolver lista de exercícios de programação em Python",
            description="Estruturas de dados e validação com Pydantic",
            priority="alta",
            category="estudo",
            deadline=in_two_days,
            duration=60,
            status="pendente",
        ),
    ]
    db.add_all(tasks)
    db.commit()

    # 5. Análise de IA + 2 sugestões pendentes (uma livre e uma com conflito detectado para demonstração)
    analysis = models.AIAnalysis(
        user_id=user.id,
        analysis_type="Organizacao",
        request_text="Tenho revisão da prova amanhã às 18h30 e preciso separar 45 min para revisar os slides do SIC",
        provider_used="mindside_context_engine",
        reasoning_summary="Identificados 1 compromisso (com alerta de sobreposição às 18:30 de amanhã) e 1 tarefa de alta prioridade.",
        processing_status="Finalizado",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    s1_data = {
        "type": "tarefa",
        "title": "Revisar slides e métricas da apresentação SIC",
        "description": "Revisar slides e métricas da apresentação SIC",
        "priority": "alta",
        "date": tomorrow.isoformat(),
        "time": "14:30",
        "duration_minutes": 45,
        "category": "estudo",
        "conflicts": [],
        "within_availability": True,
    }
    s1 = models.Suggestion(
        user_id=user.id,
        analysis_id=analysis.id,
        type="tarefa",
        action_type="Criar",
        content=f"{s1_data['title']} — {s1_data['date']} às {s1_data['time']}",
        structured_data=json.dumps(s1_data, ensure_ascii=False),
        status="pending",
    )

    s2_data = {
        "type": "compromisso",
        "title": "Grupo de estudo — Revisão de Cálculo",
        "description": "Conflito intencional de demonstração com Aula de Cálculo e Álgebra",
        "priority": "alta",
        "date": tomorrow.isoformat(),
        "time": "18:30",
        "duration_minutes": 60,
        "category": "estudo",
        "conflicts": [
            {
                "type": "appointment",
                "id": appts[1].id,
                "title": "Aula de Cálculo e Álgebra",
                "start_time": "18:00",
                "end_time": "19:30",
            }
        ],
        "within_availability": True,
    }
    s2 = models.Suggestion(
        user_id=user.id,
        analysis_id=analysis.id,
        type="compromisso",
        action_type="Criar",
        content=f"{s2_data['title']} — {s2_data['date']} às {s2_data['time']}",
        structured_data=json.dumps(s2_data, ensure_ascii=False),
        status="pending",
    )
    db.add_all([s1, s2])
    db.commit()
    db.refresh(s1)
    db.refresh(s2)

    v1 = models.SuggestionValidation(
        suggestion_id=s1.id,
        is_valid=True,
        formato_valido=True,
        campos_validos=True,
        possui_conflito=False,
        dentro_disponibilidade=True,
        message="Validado pelo Python: formato JSON íntegro e horário livre na agenda.",
    )
    v2 = models.SuggestionValidation(
        suggestion_id=s2.id,
        is_valid=True,
        formato_valido=True,
        campos_validos=True,
        possui_conflito=True,
        dentro_disponibilidade=True,
        message="Alerta do Python: conflito detectado com 'Aula de Cálculo e Álgebra' (18:00–19:30). Solicite novo horário ou edite antes de aprovar.",
    )
    db.add_all([v1, v2])

    db.add(models.History(
        user_id=user.id,
        action="cenario_demo_carregado",
        description="Cenário de demonstração do Samsung Innovation Campus 2026 carregado com sucesso.",
    ))
    db.commit()

    return {
        "status": "ok",
        "tasks_created": len(tasks),
        "appointments_created": len(appts),
        "goals_created": 2,
        "suggestions_created": 2,
        "available_slots_created": len(slots),
    }


@router.post("/reset")
def reset_demo_data(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Limpa tarefas, compromissos, objetivos, rotina fixa, planos de estudo e sugestões da sessão atual."""
    db.query(models.SuggestionDecision).filter(models.SuggestionDecision.user_id == user.id).delete()
    for s in db.query(models.Suggestion).filter(models.Suggestion.user_id == user.id).all():
        db.delete(s)
    db.query(models.AIAnalysis).filter(models.AIAnalysis.user_id == user.id).delete()
    db.query(models.Task).filter(models.Task.user_id == user.id).delete()
    db.query(models.Appointment).filter(models.Appointment.user_id == user.id).delete()
    db.query(models.Goal).filter(models.Goal.user_id == user.id).delete()
    db.query(models.AvailableSlot).filter(models.AvailableSlot.user_id == user.id).delete()
    db.query(models.StudyPlan).filter(models.StudyPlan.user_id == user.id).delete()
    db.query(models.RoutineBlock).filter(models.RoutineBlock.user_id == user.id).delete()
    user.routine_text = ""
    db.add(models.History(
        user_id=user.id,
        action="dados_limpos",
        description="Você limpou os dados da sessão atual.",
    ))
    db.commit()
    return {"status": "ok"}

