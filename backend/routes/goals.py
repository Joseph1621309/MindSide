from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from dependencies import get_db, get_current_user

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.get("", response_model=List[schemas.GoalOut])
def list_goals(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Goal).filter(models.Goal.user_id == user.id).order_by(models.Goal.created_at.desc()).all()


@router.post("", response_model=schemas.GoalOut, status_code=201)
def create_goal(payload: schemas.GoalCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    goal = models.Goal(user_id=user.id, **payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    db.add(models.History(user_id=user.id, action="objetivo_criado", description=f"Você criou o objetivo '{goal.title}'."))
    db.commit()
    return goal


@router.put("/{goal_id}", response_model=schemas.GoalOut)
def update_goal(goal_id: int, payload: schemas.GoalUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.user_id == user.id).first()
    if not goal:
        raise HTTPException(404, "Objetivo não encontrado.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    db.add(models.History(user_id=user.id, action="objetivo_alterado", description=f"Você alterou o objetivo '{goal.title}'."))
    db.commit()
    return goal


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.user_id == user.id).first()
    if not goal:
        raise HTTPException(404, "Objetivo não encontrado.")
    title = goal.title
    db.delete(goal)
    db.add(models.History(user_id=user.id, action="objetivo_excluido", description=f"Você excluiu o objetivo '{title}'."))
    db.commit()
    return None
