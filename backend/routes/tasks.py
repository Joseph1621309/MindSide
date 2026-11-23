from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from dependencies import get_db, get_current_user
from services.conflict_service import check_task_schedule_conflict

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _recalculate_goal_progress(db: Session, user_id: int, goal_id: int | None):
    if not goal_id:
        return
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.user_id == user_id).first()
    if not goal:
        return
    linked_tasks = db.query(models.Task).filter(
        models.Task.user_id == user_id,
        models.Task.goal_id == goal_id,
    ).all()
    if not linked_tasks:
        return
    done_count = sum(1 for t in linked_tasks if t.status == "concluida")
    goal.progress = int(round((done_count / len(linked_tasks)) * 100))
    if goal.progress == 100:
        goal.status = "concluido"
    elif goal.status == "concluido" and goal.progress < 100:
        goal.status = "ativo"
    db.commit()


@router.get("", response_model=List[schemas.TaskOut])
def list_tasks(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Task).filter(models.Task.user_id == user.id).order_by(models.Task.created_at.desc()).all()


@router.post("", response_model=schemas.TaskOut, status_code=201)
def create_task(payload: schemas.TaskCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if payload.scheduled_date and payload.scheduled_time:
        conflicts = check_task_schedule_conflict(
            db, user.id, payload.scheduled_date, payload.scheduled_time, payload.duration or 30
        )
        if conflicts:
            raise HTTPException(409, {"message": "Conflito de horário detectado.", "conflicts": conflicts})
    if payload.goal_id:
        goal = db.query(models.Goal).filter(models.Goal.id == payload.goal_id, models.Goal.user_id == user.id).first()
        if not goal:
            raise HTTPException(404, "Objetivo vinculado não encontrado.")
    task = models.Task(user_id=user.id, **payload.model_dump())
    if task.status == "concluida":
        task.completed_at = datetime.now(timezone.utc)
    db.add(task)
    db.commit()
    db.refresh(task)
    _recalculate_goal_progress(db, user.id, task.goal_id)
    db.add(models.History(user_id=user.id, action="tarefa_criada", description=f"Você criou a tarefa '{task.title}'."))
    db.commit()
    return task


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == user.id).first()
    if not task:
        raise HTTPException(404, "Tarefa não encontrada.")
    return task


@router.put("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, payload: schemas.TaskUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == user.id).first()
    if not task:
        raise HTTPException(404, "Tarefa não encontrada.")
    previous_goal_id = task.goal_id
    data = payload.model_dump(exclude_unset=True)
    if "tempo_gasto_segundos" in data:
        tempo_val = data.pop("tempo_gasto_segundos")
        if "time_spent_seconds" not in data and tempo_val is not None:
            data["time_spent_seconds"] = tempo_val
    scheduled_date = data.get("scheduled_date", task.scheduled_date)
    scheduled_time = data.get("scheduled_time", task.scheduled_time)
    duration = data.get("duration", task.duration) or 30
    if scheduled_date and scheduled_time:
        conflicts = check_task_schedule_conflict(
            db, user.id, scheduled_date, scheduled_time, duration, ignore_id=task.id
        )
        if conflicts:
            raise HTTPException(409, {"message": "Conflito de horário detectado.", "conflicts": conflicts})
    if "goal_id" in data and data["goal_id"] is not None:
        goal = db.query(models.Goal).filter(models.Goal.id == data["goal_id"], models.Goal.user_id == user.id).first()
        if not goal:
            raise HTTPException(404, "Objetivo vinculado não encontrado.")
    for field, value in data.items():
        setattr(task, field, value)
    if task.status == "concluida" and not task.completed_at:
        task.completed_at = datetime.now(timezone.utc)
    elif task.status != "concluida":
        task.completed_at = None
    db.commit()
    db.refresh(task)
    if previous_goal_id and previous_goal_id != task.goal_id:
        _recalculate_goal_progress(db, user.id, previous_goal_id)
    _recalculate_goal_progress(db, user.id, task.goal_id)
    db.add(models.History(user_id=user.id, action="tarefa_alterada", description=f"Você alterou a tarefa '{task.title}'."))
    db.commit()
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == user.id).first()
    if not task:
        raise HTTPException(404, "Tarefa não encontrada.")
    title = task.title
    goal_id = task.goal_id
    db.delete(task)
    db.add(models.History(user_id=user.id, action="tarefa_excluida", description=f"Você excluiu a tarefa '{title}'."))
    db.commit()
    _recalculate_goal_progress(db, user.id, goal_id)
    return None
