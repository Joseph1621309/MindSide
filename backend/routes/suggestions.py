import json
import unicodedata
from datetime import datetime, timezone, timedelta, date as date_cls, time as time_cls
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

import models, schemas
from dependencies import get_db, get_current_user
from services.validation_service import validate_suggestion
from services.conflict_service import check_appointment_conflict, check_task_schedule_conflict
from services.ai_service import build_domain_subtasks_list, is_task_complex

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])

WEEKDAY_NAMES_ASCII = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]


def _norm_day_name(raw: str) -> str:
    norm = unicodedata.normalize("NFKD", raw or "")
    return norm.encode("ascii", "ignore").decode("ascii").strip().lower()


def _find_next_free_slot(
    db: Session,
    user_id: int,
    start_date: date_cls,
    duration_minutes: int,
    after_time: Optional[time_cls] = None,
) -> tuple[date_cls, time_cls]:
    """Encontra o próximo horário livre cruzando AvailableSlot com compromissos/tarefas existentes."""
    dur = max(15, int(duration_minutes or 30))

    active_slots = db.query(models.AvailableSlot).filter(
        models.AvailableSlot.user_id == user_id,
        models.AvailableSlot.status == "Ativo",
    ).order_by(models.AvailableSlot.start_time.asc()).all()

    if active_slots:
        slots_by_day = {}
        for slot in active_slots:
            slots_by_day.setdefault(_norm_day_name(slot.day_of_week), []).append(slot)

        for day_offset in range(0, 14):
            day = start_date + timedelta(days=day_offset)
            day_key = WEEKDAY_NAMES_ASCII[day.weekday()]
            day_slots = slots_by_day.get(day_key, [])
            for slot in day_slots:
                s_min = slot.start_time.hour * 60 + slot.start_time.minute
                e_min = slot.end_time.hour * 60 + slot.end_time.minute
                cur_min = s_min
                if day_offset == 0 and after_time is not None:
                    min_after = after_time.hour * 60 + after_time.minute + 30
                    if cur_min < min_after:
                        cur_min = ((min_after + 29) // 30) * 30
                while cur_min + dur <= e_min and cur_min + dur < 24 * 60:
                    cand_start = time_cls(hour=cur_min // 60, minute=cur_min % 60)
                    cand_end_min = cur_min + dur
                    cand_end = time_cls(hour=cand_end_min // 60, minute=cand_end_min % 60)
                    if not check_appointment_conflict(db, user_id, day, cand_start, cand_end):
                        return day, cand_start
                    cur_min += 30

    candidate_hours = [9, 10, 11, 14, 15, 16, 17, 18, 19, 20]
    for day_offset in range(0, 7):
        day = start_date + timedelta(days=day_offset)
        for h in candidate_hours:
            if day_offset == 0 and after_time is not None and h <= after_time.hour:
                continue
            start_t = time_cls(hour=h, minute=0)
            end_min = h * 60 + dur
            if end_min >= 24 * 60:
                continue
            end_t = time_cls(hour=end_min // 60, minute=end_min % 60)
            if not check_appointment_conflict(db, user_id, day, start_t, end_t):
                return day, start_t
    return start_date + timedelta(days=1), time_cls(hour=14, minute=0)


@router.get("", response_model=List[schemas.SuggestionOut])
def list_suggestions(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Suggestion).filter(models.Suggestion.user_id == user.id).order_by(models.Suggestion.created_at.desc()).all()


@router.get("/{sugg_id}/decisions", response_model=List[schemas.SuggestionDecisionOut])
def list_suggestion_decisions(sugg_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sugg = db.query(models.Suggestion).filter(models.Suggestion.id == sugg_id, models.Suggestion.user_id == user.id).first()
    if not sugg:
        raise HTTPException(404, "Sugestão não encontrada.")
    return db.query(models.SuggestionDecision).filter(
        models.SuggestionDecision.suggestion_id == sugg_id,
        models.SuggestionDecision.user_id == user.id,
    ).order_by(models.SuggestionDecision.created_at.asc()).all()


@router.get("/{sugg_id}/validations", response_model=List[schemas.SuggestionValidationOut])
def list_suggestion_validations(sugg_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sugg = db.query(models.Suggestion).filter(models.Suggestion.id == sugg_id, models.Suggestion.user_id == user.id).first()
    if not sugg:
        raise HTTPException(404, "Sugestão não encontrada.")
    return db.query(models.SuggestionValidation).filter(
        models.SuggestionValidation.suggestion_id == sugg_id,
    ).order_by(models.SuggestionValidation.validated_at.desc()).all()


@router.put("/{sugg_id}", response_model=schemas.SuggestionOut)
def edit_suggestion(sugg_id: int, payload: schemas.SuggestionEdit, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sugg = db.query(models.Suggestion).filter(models.Suggestion.id == sugg_id, models.Suggestion.user_id == user.id).first()
    if not sugg:
        raise HTTPException(404, "Sugestão não encontrada.")
    if sugg.status not in ("pending", "edited"):
        raise HTTPException(400, "Apenas sugestões pendentes podem ser editadas.")
    valid, reason = validate_suggestion(payload.structured_data)
    if not valid:
        raise HTTPException(400, f"Dados inválidos: {reason}")
    data = payload.structured_data
    conflicts = []
    if data.get("date") and data.get("time"):
        day = datetime.strptime(data["date"], "%Y-%m-%d").date()
        start = datetime.strptime(data["time"], "%H:%M").time()
        duration = data.get("duration_minutes") or 30
        end_minutes = start.hour * 60 + start.minute + duration
        end = time_cls(hour=min(end_minutes // 60, 23), minute=end_minutes % 60)
        conflicts = check_appointment_conflict(db, user.id, day, start, end)
    data["conflicts"] = conflicts
    sugg.type = data["type"]
    sugg.content = data["title"]
    if data.get("date"):
        sugg.content += f" — {data['date']}"
    if data.get("time"):
        sugg.content += f" às {data['time']}"
    sugg.structured_data = json.dumps(data, ensure_ascii=False)
    sugg.status = "edited"
    db.add(models.SuggestionDecision(
        user_id=user.id,
        suggestion_id=sugg.id,
        decision_type="Editar",
        note=(payload.note or f"Editada para '{data['title']}'")[:255],
    ))
    db.add(models.SuggestionValidation(
        suggestion_id=sugg.id,
        is_valid=True,
        formato_valido=True,
        campos_validos=True,
        possui_conflito=bool(conflicts),
        dentro_disponibilidade=True,
        message="Revalidação após edição do usuário.",
    ))
    db.commit()
    db.refresh(sugg)
    db.add(models.History(user_id=user.id, action="sugestao_editada", description="Você editou uma sugestão da IA."))
    db.commit()
    return sugg


@router.post("/{sugg_id}/regenerate", response_model=schemas.SuggestionOut)
def regenerate_suggestion(sugg_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Requisito B7: permite solicitar uma nova sugestão/encaixe sem conflito de horário."""
    sugg = db.query(models.Suggestion).filter(models.Suggestion.id == sugg_id, models.Suggestion.user_id == user.id).first()
    if not sugg:
        raise HTTPException(404, "Sugestão não encontrada.")
    if sugg.status not in ("pending", "edited"):
        raise HTTPException(400, "Esta sugestão já foi decidida.")

    data = json.loads(sugg.structured_data)
    dur = data.get("duration_minutes") or 45
    base_date = datetime.strptime(data["date"], "%Y-%m-%d").date() if data.get("date") else date_cls.today()
    cur_t = None
    if data.get("time"):
        try:
            cur_t = datetime.strptime(data["time"], "%H:%M").time()
        except ValueError:
            cur_t = None

    has_active_slots = db.query(models.AvailableSlot).filter(
        models.AvailableSlot.user_id == user.id,
        models.AvailableSlot.status == "Ativo",
    ).first() is not None

    if cur_t is not None and not has_active_slots:
        next_hour = (cur_t.hour + 2) % 20
        if next_hour < 8:
            next_hour = 14
            base_date = base_date + timedelta(days=1)
        start_t = time_cls(hour=next_hour, minute=0)
        end_min = next_hour * 60 + dur
        end_t = time_cls(hour=min(end_min // 60, 23), minute=end_min % 60)
        if check_appointment_conflict(db, user.id, base_date, start_t, end_t):
            base_date, start_t = _find_next_free_slot(db, user.id, base_date, dur, after_time=cur_t)
    else:
        base_date, start_t = _find_next_free_slot(db, user.id, base_date, dur, after_time=cur_t)

    data["date"] = base_date.isoformat()
    data["time"] = start_t.strftime("%H:%M")
    data["conflicts"] = []
    data["within_availability"] = True
    data.pop("suggested_free_slot", None)
    sugg.content = f"{data['title']} — {data['date']} às {data['time']}"
    sugg.structured_data = json.dumps(data, ensure_ascii=False)
    sugg.status = "edited"

    db.add(models.SuggestionDecision(
        user_id=user.id,
        suggestion_id=sugg.id,
        decision_type="Nova_sugestao",
        note=f"Novo encaixe sugerido: {data['date']} às {data['time']}",
    ))
    db.add(models.SuggestionValidation(
        suggestion_id=sugg.id,
        is_valid=True,
        formato_valido=True,
        campos_validos=True,
        possui_conflito=False,
        dentro_disponibilidade=True,
        message=f"Novo horário livre verificado pelo Python: {data['date']} às {data['time']}.",
    ))
    db.add(models.History(
        user_id=user.id,
        action="nova_sugestao_solicitada",
        description=f"Você solicitou uma nova sugestão de horário para '{data['title']}'.",
    ))
    db.commit()
    db.refresh(sugg)
    return sugg


@router.post("/{sugg_id}/approve", response_model=schemas.SuggestionOut)
def approve_suggestion(sugg_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sugg = db.query(models.Suggestion).filter(models.Suggestion.id == sugg_id, models.Suggestion.user_id == user.id).first()
    if not sugg:
        raise HTTPException(404, "Sugestão não encontrada.")
    if sugg.status not in ("pending", "edited"):
        raise HTTPException(400, "Esta sugestão já foi decidida.")

    data = json.loads(sugg.structured_data)
    valid, reason = validate_suggestion(data)
    if not valid:
        raise HTTPException(400, f"Não é possível aprovar: {reason}")

    sched_date = datetime.strptime(data["date"], "%Y-%m-%d").date() if data.get("date") else None
    sched_time = datetime.strptime(data["time"], "%H:%M").time() if data.get("time") else None

    if data["type"] == "compromisso" and sched_date and sched_time:
        dur = data.get("duration_minutes") or 60
        end_minutes = sched_time.hour * 60 + sched_time.minute + dur
        end_t = time_cls(hour=min(end_minutes // 60, 23), minute=end_minutes % 60)
        conflicts = check_appointment_conflict(db, user.id, sched_date, sched_time, end_t)
        if conflicts:
            raise HTTPException(409, {"message": "Conflito de horário detectado. Edite a sugestão.", "conflicts": conflicts})
        appt = models.Appointment(
            user_id=user.id, title=data["title"], description=data.get("description", ""),
            date=sched_date, start_time=sched_time, end_time=end_t,
            category=data.get("category", "geral"),
        )
        db.add(appt)
    else:
        if sched_date and sched_time:
            conflicts = check_task_schedule_conflict(
                db, user.id, sched_date, sched_time, data.get("duration_minutes") or 30
            )
            if conflicts:
                raise HTTPException(409, {"message": "Conflito de horário detectado. Edite a sugestão.", "conflicts": conflicts})
        valid_goal_id = None
        raw_gid = data.get("goal_id")
        if raw_gid is not None:
            try:
                gid_int = int(raw_gid)
                goal = db.query(models.Goal).filter(
                    models.Goal.id == gid_int,
                    models.Goal.user_id == user.id,
                ).first()
                if goal:
                    valid_goal_id = goal.id
            except (TypeError, ValueError):
                valid_goal_id = None

        task = models.Task(
            user_id=user.id,
            goal_id=valid_goal_id,
            title=data["title"],
            description=data.get("description", ""),
            priority=data.get("priority", "media"),
            category=data.get("category", "geral"),
            duration=data.get("duration_minutes") or 30,
            scheduled_date=sched_date,
            scheduled_time=sched_time,
        )
        if is_task_complex(task.title, task.description or "", task.category or "geral"):
            if isinstance(data.get("subtasks"), list) and data["subtasks"]:
                task.subtasks = build_domain_subtasks_list(
                    task.title, task.description or "", task.category or "geral", candidate_steps=data["subtasks"]
                )
        db.add(task)

    sugg.status = "approved"
    sugg.decided_at = datetime.now(timezone.utc)
    db.add(models.SuggestionDecision(
        user_id=user.id,
        suggestion_id=sugg.id,
        decision_type="Aprovar",
        note=f"Aprovada e incorporada à rotina como {data['type']}.",
    ))
    db.commit()
    db.refresh(sugg)
    db.add(models.History(user_id=user.id, action="sugestao_aprovada", description=f"Você aprovou a sugestão '{data['title']}'."))
    db.commit()
    return sugg


@router.post("/{sugg_id}/reject", response_model=schemas.SuggestionOut)
def reject_suggestion(sugg_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sugg = db.query(models.Suggestion).filter(models.Suggestion.id == sugg_id, models.Suggestion.user_id == user.id).first()
    if not sugg:
        raise HTTPException(404, "Sugestão não encontrada.")
    if sugg.status not in ("pending", "edited"):
        raise HTTPException(400, "Esta sugestão já foi decidida.")
    sugg.status = "rejected"
    sugg.decided_at = datetime.now(timezone.utc)
    db.add(models.SuggestionDecision(
        user_id=user.id,
        suggestion_id=sugg.id,
        decision_type="Rejeitar",
        note="Rejeitada pelo usuário.",
    ))
    db.commit()
    db.refresh(sugg)
    db.add(models.History(user_id=user.id, action="sugestao_rejeitada", description="Você rejeitou uma sugestão da IA."))
    db.commit()
    return sugg
