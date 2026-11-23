import json
import uuid
from datetime import datetime, timezone, timedelta, date as date_cls, time as time_cls
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

import models, schemas
from dependencies import get_db, get_current_user
from services.ai_service import (
    _ANALYZE_CONTEXT_VAR,
    analyze_text,
    build_domain_subtasks_list,
    build_user_context_block,
    extract_actions_from_notes,
    generate_brain_dump_items,
    generate_daily_briefing,
    generate_goal_breakdown,
    generate_study_plan,
    generate_task_breakdown,
    is_task_complex,
    match_goal_id_for_task,
    parse_freeform_routine,
)
from services.validation_service import validate_suggestion
from services.conflict_service import check_appointment_conflict
from routes.suggestions import _find_next_free_slot
from routes.tasks import _recalculate_goal_progress

router = APIRouter(prefix="/api/ai", tags=["ai"])

WEEKDAY_NAMES_PT = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"]


def _check_within_availability(db: Session, user_id: int, day, start: time_cls, end: time_cls) -> bool:
    day_name = WEEKDAY_NAMES_PT[day.weekday()]
    slots = db.query(models.AvailableSlot).filter(
        models.AvailableSlot.user_id == user_id,
        models.AvailableSlot.day_of_week == day_name,
        models.AvailableSlot.status == "Ativo",
    ).all()
    if not slots:
        return True  # sem restrição explícita cadastrada para esse dia
    return any(s.start_time <= start and end <= s.end_time for s in slots)


@router.post("/analyze")
async def analyze(payload: schemas.AIAnalyzeRequest, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """
    Fluxo: texto do usuário -> registro AIAnalysis -> IA (services/ai_service) ->
    validação técnica (Python) + persistência SuggestionValidation ->
    verificação de conflitos e disponibilidade -> criação de Suggestion pendente.
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(400, "Escreva algo para o assistente analisar.")

    clean_text = payload.text.strip()
    context_block, _, _, goal_dicts, slot_dicts = _build_db_context(db, user.id)
    ctx_token = _ANALYZE_CONTEXT_VAR.set(context_block)
    try:
        ai_result = await analyze_text(clean_text)
    finally:
        _ANALYZE_CONTEXT_VAR.reset(ctx_token)
    raw_suggestions = ai_result.get("suggestions", [])
    if not raw_suggestions:
        raise HTTPException(422, "Não foi possível identificar uma sugestão válida no texto.")

    analysis = models.AIAnalysis(
        user_id=user.id,
        analysis_type="Organizacao" if len(raw_suggestions) > 1 else "Planejamento",
        request_text=clean_text[:500],
        provider_used=ai_result.get("provider", "local_fallback"),
        reasoning_summary=ai_result.get("reasoning_summary", "")[:1000],
        processing_status="Finalizado",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    created = []
    goal_title_map = {g["id"]: g["title"] for g in goal_dicts}
    for item in raw_suggestions:
        valid, reason = validate_suggestion(item)
        if not valid:
            continue  # ignora sugestões inválidas da IA, nunca confia cegamente

        conflicts = []
        within_availability = True
        parsed_day = None
        dur = item.get("duration_minutes") or 30
        if item.get("date") and item.get("time"):
            try:
                parsed_day = datetime.strptime(item["date"], "%Y-%m-%d").date()
                t = datetime.strptime(item["time"], "%H:%M").time()
                end_minutes = t.hour * 60 + t.minute + dur
                end_t = time_cls(hour=min(end_minutes // 60, 23), minute=end_minutes % 60)
                conflicts = check_appointment_conflict(db, user.id, parsed_day, t, end_t)
                within_availability = _check_within_availability(db, user.id, parsed_day, t, end_t)
            except ValueError:
                parsed_day = None
        item["conflicts"] = conflicts
        item["within_availability"] = within_availability

        if conflicts or not within_availability:
            free_day, free_time = _find_next_free_slot(
                db, user.id, parsed_day or date_cls.today(), dur
            )
            item["suggested_free_slot"] = {
                "date": free_day.isoformat(),
                "time": free_time.strftime("%H:%M"),
            }

        is_complex = is_task_complex(
            item["title"],
            item.get("description", ""),
            item.get("category", "geral"),
        )
        item["precisa_destrinchar"] = is_complex
        will_save_as_task = item["type"] == "tarefa" or not (item.get("date") and item.get("time"))

        if will_save_as_task:
            matched_gid = match_goal_id_for_task(
                item["title"],
                item.get("description", ""),
                goal_dicts,
                item.get("goal_id"),
            )
            item["goal_id"] = matched_gid
            item["goal_title"] = goal_title_map.get(matched_gid) if matched_gid else None
            if is_complex:
                item["subtasks"] = build_domain_subtasks_list(
                    item["title"],
                    item.get("description", ""),
                    item.get("category", "geral"),
                    candidate_steps=item.get("subtasks"),
                )
            else:
                item["subtasks"] = []
        else:
            item["goal_id"] = None
            item["goal_title"] = None
            item["subtasks"] = []

        content = f"{item['title']}"
        if item.get("date"):
            content += f" — {item['date']}"
        if item.get("time"):
            content += f" às {item['time']}"

        suggestion = models.Suggestion(
            user_id=user.id,
            analysis_id=analysis.id,
            type=item["type"],
            action_type="Criar",
            content=content,
            structured_data=json.dumps(item, ensure_ascii=False),
            status="pending",
        )
        db.add(suggestion)
        db.commit()
        db.refresh(suggestion)

        free_slot_hint = ""
        if item.get("suggested_free_slot"):
            fs = item["suggested_free_slot"]
            free_slot_hint = f" Horário livre sugerido: {fs['date']} às {fs['time']}."

        if conflicts:
            val_msg = f"Conflito detectado com {len(conflicts)} atividade(s) na agenda.{free_slot_hint}"
        elif not within_availability:
            val_msg = f"Horário fora da disponibilidade cadastrada.{free_slot_hint}"
        else:
            val_msg = "Estrutura JSON, campos obrigatórios e agenda verificados pelo Python sem conflitos."
        validation = models.SuggestionValidation(
            suggestion_id=suggestion.id,
            is_valid=True,
            formato_valido=True,
            campos_validos=True,
            possui_conflito=bool(conflicts),
            dentro_disponibilidade=within_availability,
            message=val_msg,
        )
        db.add(validation)
        db.commit()
        db.refresh(validation)

        created.append((suggestion, validation))

    if not created:
        raise HTTPException(422, "A IA não retornou nenhuma sugestão válida após a validação.")

    return {
        "analysis_id": analysis.id,
        "provider": analysis.provider_used,
        "reasoning_summary": ai_result.get("reasoning_summary", ""),
        "suggestions": [
            {
                "id": s.id,
                "analysis_id": s.analysis_id,
                "type": s.type,
                "content": s.content,
                "structured_data": json.loads(s.structured_data),
                "status": s.status,
                "validation": {
                    "id": v.id,
                    "is_valid": v.is_valid,
                    "formato_valido": v.formato_valido,
                    "campos_validos": v.campos_validos,
                    "possui_conflito": v.possui_conflito,
                    "dentro_disponibilidade": v.dentro_disponibilidade,
                    "message": v.message,
                },
            }
            for s, v in created
        ],
    }


VALID_CATEGORIES = {"estudo", "trabalho", "saude", "lazer", "pessoal", "geral"}


def _map_priority_db(raw: Optional[str]) -> str:
    low = (raw or "media").strip().lower()
    if "urgente" in low:
        return "urgente"
    if "alta" in low:
        return "alta"
    if "baixa" in low:
        return "baixa"
    return "media"


def _normalize_category_db(raw: Optional[str]) -> str:
    low = (raw or "geral").strip().lower()
    if "estud" in low or "academ" in low:
        return "estudo"
    if "trabalh" in low or "prof" in low:
        return "trabalho"
    if "saud" in low or "saúd" in low:
        return "saude"
    if "laz" in low:
        return "lazer"
    if "pess" in low:
        return "pessoal"
    return low if low in VALID_CATEGORIES else "geral"


def _parse_iso_date_safe(raw: Optional[str]) -> Optional[date_cls]:
    if not raw:
        return None
    try:
        return date_cls.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        return None


def _build_db_context(
    db: Session,
    user_id: int,
) -> tuple[str, List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    today = date_cls.today()
    pending = db.query(models.Task).filter(
        models.Task.user_id == user_id,
        models.Task.status != "concluida",
        models.Task.status != "cancelada",
    ).order_by(models.Task.deadline.asc().nullslast(), models.Task.created_at.desc()).all()

    appts = db.query(models.Appointment).filter(
        models.Appointment.user_id == user_id,
        models.Appointment.date >= today,
    ).order_by(models.Appointment.date.asc(), models.Appointment.start_time.asc()).all()

    goals = db.query(models.Goal).filter(
        models.Goal.user_id == user_id,
        models.Goal.status == "ativo",
    ).order_by(models.Goal.deadline.asc().nullslast(), models.Goal.created_at.desc()).all()

    slots = db.query(models.AvailableSlot).filter(
        models.AvailableSlot.user_id == user_id,
        models.AvailableSlot.status == "Ativo",
    ).order_by(models.AvailableSlot.id.asc()).all()

    pending_dicts = [
        {
            "id": t.id,
            "title": t.title,
            "priority": t.priority,
            "category": t.category,
            "deadline": t.deadline.isoformat() if t.deadline else None,
            "duration": t.duration or 30,
            "status": t.status,
            "goal_id": t.goal_id,
        }
        for t in pending
    ]
    appt_dicts = [
        {
            "id": a.id,
            "title": a.title,
            "date": a.date.isoformat(),
            "start_time": a.start_time.strftime("%H:%M"),
            "end_time": a.end_time.strftime("%H:%M"),
            "category": a.category,
        }
        for a in appts
    ]
    goal_dicts = [
        {
            "id": g.id,
            "title": g.title,
            "description": g.description or "",
            "progress": g.progress or 0,
            "deadline": g.deadline.isoformat() if g.deadline else None,
        }
        for g in goals
    ]
    slot_dicts = [
        {
            "id": s.id,
            "day_of_week": s.day_of_week,
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
        }
        for s in slots
    ]
    routine_blocks = db.query(models.RoutineBlock).filter(
        models.RoutineBlock.user_id == user_id,
    ).order_by(models.RoutineBlock.id.asc()).all()
    routine_dicts = [
        {
            "id": rb.id,
            "title": rb.title,
            "day_of_week": rb.day_of_week,
            "start_time": rb.start_time.strftime("%H:%M"),
            "end_time": rb.end_time.strftime("%H:%M"),
            "category": rb.category,
        }
        for rb in routine_blocks
    ]
    user_obj = db.query(models.User).filter(models.User.id == user_id).first()
    routine_text = (user_obj.routine_text or "") if user_obj else ""
    ctx = build_user_context_block(
        pending_dicts,
        appt_dicts,
        now=datetime.now(),
        active_goals=goal_dicts,
        available_slots=slot_dicts,
        routine_blocks=routine_dicts,
        routine_text=routine_text,
    )
    return ctx, pending_dicts, appt_dicts, goal_dicts, slot_dicts


@router.post("/brain-dump")
async def brain_dump(
    payload: schemas.BrainDumpRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Feature 1: Caixa de Entrada Inteligente ('Brain Dump') com Structured Outputs e persistência."""
    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(400, "Descreva o que está na sua mente para o MindSide organizar.")

    context_block, _, _, goal_dicts, _ = _build_db_context(db, user.id)
    ai_res = await generate_brain_dump_items(clean_text, context_block=context_block)
    items = ai_res["data"].get("itens", [])

    created_tasks: List[schemas.TaskOut] = []
    if payload.auto_create:
        for item in items:
            matched_gid = match_goal_id_for_task(
                item["titulo"],
                item.get("resumo") or "",
                goal_dicts,
                item.get("goal_id"),
            )
            item["goal_id"] = matched_gid
            task = models.Task(
                user_id=user.id,
                goal_id=matched_gid,
                title=item["titulo"][:200],
                description=(item.get("resumo") or clean_text[:280]),
                priority=_map_priority_db(item.get("prioridade")),
                category=_normalize_category_db(item.get("categoria")),
                deadline=_parse_iso_date_safe(item.get("prazo_sugerido")),
                duration=int(item.get("duracao_min") or 30),
                status="pendente",
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            created_tasks.append(schemas.TaskOut.model_validate(task))

        db.add(models.History(
            user_id=user.id,
            action="brain_dump_executado",
            description=f"Caixa de Entrada Inteligente organizou {len(created_tasks)} tarefa(s).",
        ))
        db.commit()

    return {
        "items": items,
        "created_tasks": [t.model_dump(mode="json") for t in created_tasks],
        "commentary": ai_res["data"].get("comentario_secretario", ""),
        "provider": ai_res["provider"],
        "fallback_used": ai_res["fallback_used"],
    }


@router.post("/tasks/{task_id}/breakdown")
async def breakdown_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Feature 2: 'Destrinchar com IA' — gera de 3 a 4 sub-etapas práticas do domínio apenas quando a tarefa é complexa."""
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == user.id).first()
    if not task:
        raise HTTPException(404, "Tarefa não encontrada.")

    if not is_task_complex(task.title, task.description or "", task.category or "geral"):
        msg = "Esta é uma tarefa rápida e direta — não precisa de sub-etapas!"
        return {
            "task": schemas.TaskOut.model_validate(task).model_dump(mode="json"),
            "skipped_simple": True,
            "message": msg,
            "dica_foco": msg,
            "provider": "complexity_guard",
            "fallback_used": False,
        }

    context_block, _, _, _, _ = _build_db_context(db, user.id)
    ai_res = await generate_task_breakdown(
        task.title,
        task.description or "",
        context_block=context_block,
        category=task.category or "geral",
    )
    passos = ai_res["data"].get("passos", [])

    checklist = [
        {
            "id": uuid.uuid4().hex[:8],
            "title": step["titulo"][:180],
            "duration_min": int(step.get("tempo_estimado_min") or 20),
            "done": False,
        }
        for step in passos[:5]
    ]
    task.subtasks = checklist
    db.commit()
    db.refresh(task)

    db.add(models.History(
        user_id=user.id,
        action="tarefa_destrinchada",
        description=f"IA dividiu '{task.title}' em {len(checklist)} micro-passos.",
    ))
    db.commit()

    return {
        "task": schemas.TaskOut.model_validate(task).model_dump(mode="json"),
        "skipped_simple": False,
        "dica_foco": ai_res["data"].get("dica_foco", ""),
        "provider": ai_res["provider"],
        "fallback_used": ai_res["fallback_used"],
    }


@router.get("/briefing")
@router.post("/briefing")
async def daily_briefing(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Feature 3: Resumo Executivo do Dia ('Briefing do Secretário')."""
    context_block, pending_dicts, appt_dicts, _, _ = _build_db_context(db, user.id)
    ai_res = await generate_daily_briefing(pending_dicts, appt_dicts, context_block=context_block)

    focus_title = ai_res["data"].get("tarefa_foco_titulo")
    focus_task_id = None
    if focus_title:
        lower_focus = focus_title.strip().lower()
        for t in pending_dicts:
            if t["title"].strip().lower() == lower_focus or lower_focus in t["title"].strip().lower():
                focus_task_id = t["id"]
                break

    return {
        "recomendacao_principal": ai_res["data"].get("recomendacao_principal", ""),
        "tarefa_foco_titulo": focus_title,
        "tarefa_foco_id": focus_task_id,
        "motivo_estrategico": ai_res["data"].get("motivo_estrategico", ""),
        "alerta_sobrecarga": ai_res["data"].get("alerta_sobrecarga"),
        "pending_count": len(pending_dicts),
        "generated_at": datetime.now().strftime("%H:%M"),
        "provider": ai_res["provider"],
        "fallback_used": ai_res["fallback_used"],
    }


@router.post("/extract-notes")
async def extract_notes(
    payload: schemas.NoteExtractRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Feature 4: Extrator de Ações de Textos/Anotações convertendo direto em tarefas no painel."""
    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(400, "Cole o texto da anotação para extrair ações.")

    context_block, _, _, goal_dicts, _ = _build_db_context(db, user.id)
    ai_res = await extract_actions_from_notes(clean_text, context_block=context_block)
    actions = ai_res["data"].get("acoes", [])

    created_tasks: List[schemas.TaskOut] = []
    if payload.auto_create:
        for act in actions:
            matched_gid = match_goal_id_for_task(
                act["titulo"],
                act.get("contexto_origem") or "",
                goal_dicts,
                act.get("goal_id"),
            )
            act["goal_id"] = matched_gid
            task = models.Task(
                user_id=user.id,
                goal_id=matched_gid,
                title=act["titulo"][:200],
                description=(act.get("contexto_origem") or "")[:500],
                priority=_map_priority_db(act.get("prioridade")),
                category=_normalize_category_db(act.get("categoria")),
                deadline=_parse_iso_date_safe(act.get("prazo_sugerido")),
                duration=30,
                status="pendente",
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            created_tasks.append(schemas.TaskOut.model_validate(task))

        db.add(models.History(
            user_id=user.id,
            action="acoes_extraidas_anotacao",
            description=f"Extraídas e criadas {len(created_tasks)} tarefa(s) a partir de anotação.",
        ))
        db.commit()

    return {
        "resumo_filtrado": ai_res["data"].get("resumo_filtrado", ""),
        "actions": actions,
        "created_tasks": [t.model_dump(mode="json") for t in created_tasks],
        "provider": ai_res["provider"],
        "fallback_used": ai_res["fallback_used"],
    }


@router.get("/study-plans", response_model=List[schemas.StudyPlanOut])
def list_study_plans(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.StudyPlan).filter(
        models.StudyPlan.user_id == user.id
    ).order_by(models.StudyPlan.created_at.desc()).all()


@router.post("/study-plan")
async def create_study_plan_route(
    payload: schemas.StudyPlanRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Feature 5: Módulo 'Arquiteto de Estudos' — gera etapas progressivas com dicas ativas e checklist."""
    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(400, "Descreva o tema e o tempo disponível para montar o plano.")

    context_block, _, _, _, _ = _build_db_context(db, user.id)
    ai_res = await generate_study_plan(clean_text, context_block=context_block)
    raw = ai_res["data"]
    today = date_cls.today()

    normalized_stages = []
    for idx, st in enumerate(raw.get("etapas", [])):
        subtopics = [
            {"id": uuid.uuid4().hex[:8], "title": str(sub)[:180], "done": False}
            for sub in (st.get("subtopicos") or [])
        ]
        normalized_stages.append({
            "index": idx,
            "dia_ou_etapa": st.get("dia_ou_etapa") or f"Dia {idx + 1}",
            "topico_principal": st.get("topico_principal") or f"Etapa {idx + 1}",
            "tempo_estimado_min": int(st.get("tempo_estimado_min") or raw.get("tempo_diario_min") or 60),
            "como_estudar": st.get("como_estudar") or "Estude com prática ativa e revisão rápida ao final.",
            "suggested_date": (today + timedelta(days=idx)).isoformat(),
            "task_id": None,
            "subtopicos": subtopics,
        })

    plan = models.StudyPlan(
        user_id=user.id,
        title=(raw.get("titulo_plano") or "Plano de Estudos")[:200],
        goal_summary=raw.get("objetivo_geral") or "",
        total_days=int(raw.get("total_dias_ou_etapas") or len(normalized_stages) or 1),
        daily_minutes=int(raw.get("tempo_diario_min") or 60),
        provider_used=ai_res["provider"],
    )
    plan.stages = normalized_stages
    db.add(plan)
    db.commit()
    db.refresh(plan)

    db.add(models.History(
        user_id=user.id,
        action="plano_estudo_criado",
        description=f"Arquiteto de Estudos criou '{plan.title}' com {len(normalized_stages)} etapas.",
    ))
    db.commit()

    return {
        "plan": schemas.StudyPlanOut.model_validate(plan).model_dump(mode="json"),
        "provider": ai_res["provider"],
        "fallback_used": ai_res["fallback_used"],
    }


@router.put("/study-plans/{plan_id}", response_model=schemas.StudyPlanOut)
def update_study_plan_route(
    plan_id: int,
    payload: schemas.StudyPlanUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    plan = db.query(models.StudyPlan).filter(
        models.StudyPlan.id == plan_id,
        models.StudyPlan.user_id == user.id,
    ).first()
    if not plan:
        raise HTTPException(404, "Plano de estudos não encontrado.")
    plan.stages = payload.stages
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/study-plans/{plan_id}/to-tasks")
def convert_study_plan_to_tasks(
    plan_id: int,
    body: Optional[Dict[str, Any]] = Body(default=None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Transforma todas as etapas (ou uma etapa específica) do Plano de Estudos em tarefas reais."""
    plan = db.query(models.StudyPlan).filter(
        models.StudyPlan.id == plan_id,
        models.StudyPlan.user_id == user.id,
    ).first()
    if not plan:
        raise HTTPException(404, "Plano de estudos não encontrado.")

    target_index = body.get("stage_index") if isinstance(body, dict) else None
    stages = plan.stages
    created_tasks: List[schemas.TaskOut] = []

    for idx, st in enumerate(stages):
        if target_index is not None and idx != target_index:
            continue
        if st.get("task_id"):
            existing = db.query(models.Task).filter(
                models.Task.id == st["task_id"],
                models.Task.user_id == user.id,
            ).first()
            if existing:
                continue

        subtasks = [
            {
                "id": sub.get("id") or uuid.uuid4().hex[:8],
                "title": sub.get("title") or str(sub),
                "duration_min": 20,
                "done": bool(sub.get("done", False)),
            }
            for sub in (st.get("subtopicos") or [])
        ]
        dl = _parse_iso_date_safe(st.get("suggested_date")) or (date_cls.today() + timedelta(days=idx))
        task = models.Task(
            user_id=user.id,
            title=f"[{st.get('dia_ou_etapa', f'Etapa {idx + 1}')}] {st.get('topico_principal', plan.title)}"[:200],
            description=f"Como estudar: {st.get('como_estudar', '')}".strip(),
            priority="alta" if idx == 0 else "media",
            category="estudo",
            deadline=dl,
            duration=int(st.get("tempo_estimado_min") or plan.daily_minutes or 60),
            status="pendente",
        )
        task.subtasks = subtasks
        db.add(task)
        db.commit()
        db.refresh(task)
        st["task_id"] = task.id
        st["suggested_date"] = dl.isoformat()
        created_tasks.append(schemas.TaskOut.model_validate(task))

    plan.stages = stages
    db.commit()
    db.refresh(plan)

    if created_tasks:
        db.add(models.History(
            user_id=user.id,
            action="plano_estudo_convertido_tarefas",
            description=f"{len(created_tasks)} etapa(s) de '{plan.title}' convertida(s) em tarefas.",
        ))
        db.commit()

    return {
        "plan": schemas.StudyPlanOut.model_validate(plan).model_dump(mode="json"),
        "created_tasks": [t.model_dump(mode="json") for t in created_tasks],
    }


@router.post("/study-plans/{plan_id}/reorganize")
def reorganize_study_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Recalcula datas das etapas não concluídas (e suas tarefas vinculadas) a partir de hoje em caso de atraso."""
    plan = db.query(models.StudyPlan).filter(
        models.StudyPlan.id == plan_id,
        models.StudyPlan.user_id == user.id,
    ).first()
    if not plan:
        raise HTTPException(404, "Plano de estudos não encontrado.")

    stages = plan.stages
    today = date_cls.today()
    offset = 0
    updated_tasks_count = 0

    for st in stages:
        subs = st.get("subtopicos") or []
        all_subs_done = bool(subs) and all(bool(s.get("done")) for s in subs)
        linked_task = None
        if st.get("task_id"):
            linked_task = db.query(models.Task).filter(
                models.Task.id == st["task_id"],
                models.Task.user_id == user.id,
            ).first()
        is_completed = all_subs_done or (linked_task is not None and linked_task.status == "concluida")
        if is_completed:
            continue

        new_date = today + timedelta(days=offset)
        st["suggested_date"] = new_date.isoformat()
        st["dia_ou_etapa"] = f"Dia {offset + 1} (reagendado)"
        if linked_task:
            linked_task.deadline = new_date
            updated_tasks_count += 1
        offset += 1

    plan.stages = stages
    db.commit()
    db.refresh(plan)

    db.add(models.History(
        user_id=user.id,
        action="plano_estudo_reorganizado",
        description=f"Plano '{plan.title}' reorganizado a partir de hoje ({offset} etapa(s) pendente(s)).",
    ))
    db.commit()

    return {
        "plan": schemas.StudyPlanOut.model_validate(plan).model_dump(mode="json"),
        "rescheduled_stages": offset,
        "updated_tasks": updated_tasks_count,
    }


@router.delete("/study-plans/{plan_id}", status_code=204)
def delete_study_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    plan = db.query(models.StudyPlan).filter(
        models.StudyPlan.id == plan_id,
        models.StudyPlan.user_id == user.id,
    ).first()
    if not plan:
        raise HTTPException(404, "Plano de estudos não encontrado.")
    db.delete(plan)
    db.commit()
    return None


@router.get("/routine")
def get_routine(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Retorna a rotina fixa configurada pelo usuário e os blocos de proteção de agenda."""
    blocks = db.query(models.RoutineBlock).filter(
        models.RoutineBlock.user_id == user.id,
    ).order_by(models.RoutineBlock.start_time.asc(), models.RoutineBlock.id.asc()).all()
    serialized = [schemas.RoutineBlockOut.model_validate(b).model_dump(mode="json") for b in blocks]
    return {
        "routine_text": user.routine_text or "",
        "blocks": serialized,
        "has_routine": bool((user.routine_text or "").strip() or serialized),
    }


@router.post("/routine")
async def save_freeform_routine(
    payload: schemas.RoutineFreeformRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Interpreta texto livre da rotina (aulas, trabalho, cursos, treino, sono) e protege horários contra conflitos."""
    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(400, "Descreva sua rotina para proteger seus horários.")

    ai_res = await parse_freeform_routine(clean_text)
    expanded = ai_res.get("expanded_blocks") or []

    db.query(models.RoutineBlock).filter(models.RoutineBlock.user_id == user.id).delete()
    user.routine_text = clean_text

    saved_blocks: List[models.RoutineBlock] = []
    for blk in expanded:
        try:
            st = datetime.strptime(blk["start_time"], "%H:%M").time()
            et = datetime.strptime(blk["end_time"], "%H:%M").time()
        except (ValueError, KeyError):
            continue
        if st >= et:
            continue
        row = models.RoutineBlock(
            user_id=user.id,
            title=blk["title"][:120],
            day_of_week=blk["day_of_week"],
            start_time=st,
            end_time=et,
            category=blk.get("category", "rotina")[:30],
        )
        db.add(row)
        saved_blocks.append(row)

    db.add(models.History(
        user_id=user.id,
        action="rotina_configurada",
        description=f"Rotina fixa atualizada com {len(saved_blocks)} bloco(s) de proteção.",
    ))
    db.commit()
    for row in saved_blocks:
        db.refresh(row)

    return {
        "routine_text": user.routine_text or "",
        "blocks": [schemas.RoutineBlockOut.model_validate(b).model_dump(mode="json") for b in saved_blocks],
        "has_routine": True,
        "summary": ai_res["data"].get("resumo_rotina", ""),
        "provider": ai_res["provider"],
        "fallback_used": ai_res["fallback_used"],
    }


@router.delete("/routine/{block_id}", status_code=204)
def delete_routine_block(
    block_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    block = db.query(models.RoutineBlock).filter(
        models.RoutineBlock.id == block_id,
        models.RoutineBlock.user_id == user.id,
    ).first()
    if not block:
        raise HTTPException(404, "Bloco de rotina não encontrado.")
    db.delete(block)
    db.commit()
    return None


@router.post("/goals/{goal_id}/breakdown")
async def breakdown_goal(
    goal_id: int,
    payload: Optional[schemas.GoalBreakdownRequest] = Body(default=None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Destrincha um Objetivo grande em 3 a 5 tarefas práticas conectadas automaticamente ao goal_id."""
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == user.id,
    ).first()
    if not goal:
        raise HTTPException(404, "Objetivo não encontrado.")

    req = payload or schemas.GoalBreakdownRequest()
    context_block, _, _, _, _ = _build_db_context(db, user.id)

    if req.selected_tasks:
        suggested_tasks = req.selected_tasks[:5]
        estrategia = f"{len(suggested_tasks)} tarefa(s) selecionada(s) para o objetivo."
        provider = "user_confirmed"
        fallback_used = False
    else:
        ai_res = await generate_goal_breakdown(goal.title, goal.description or "", context_block=context_block)
        suggested_tasks = ai_res["data"].get("tarefas", [])[:5]
        estrategia = ai_res["data"].get("estrategia_objetivo", "")
        provider = ai_res["provider"]
        fallback_used = ai_res["fallback_used"]

    created_tasks: List[schemas.TaskOut] = []
    if req.auto_create:
        for item in suggested_tasks:
            title = str(item.get("titulo") or item.get("title") or "").strip()[:200]
            if not title:
                continue
            prio = _map_priority_db(item.get("prioridade") or item.get("priority"))
            cat = _normalize_category_db(item.get("categoria") or item.get("category"))
            dur = int(item.get("duracao_min") or item.get("duration") or 35)
            desc = str(item.get("resumo") or item.get("description") or "").strip()[:500]
            dl = _parse_iso_date_safe(item.get("prazo_sugerido") or item.get("deadline"))
            task = models.Task(
                user_id=user.id,
                goal_id=goal.id,
                title=title,
                description=desc,
                priority=prio,
                category=cat,
                deadline=dl,
                duration=dur,
                status="pendente",
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            created_tasks.append(schemas.TaskOut.model_validate(task))

        _recalculate_goal_progress(db, user.id, goal.id)
        db.refresh(goal)
        db.add(models.History(
            user_id=user.id,
            action="objetivo_destrinchado",
            description=f"IA gerou e vinculou {len(created_tasks)} tarefa(s) ao objetivo '{goal.title}'.",
        ))
        db.commit()

    return {
        "goal": schemas.GoalOut.model_validate(goal).model_dump(mode="json"),
        "suggested_tasks": suggested_tasks,
        "estrategia_objetivo": estrategia,
        "created_tasks": [t.model_dump(mode="json") for t in created_tasks],
        "provider": provider,
        "fallback_used": fallback_used,
    }
