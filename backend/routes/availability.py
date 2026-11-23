from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from dependencies import get_db, get_current_user

router = APIRouter(prefix="/api/availability", tags=["availability"])

VALID_DAYS = {"Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"}


@router.get("", response_model=List[schemas.AvailableSlotOut])
def list_availability(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.AvailableSlot).filter(
        models.AvailableSlot.user_id == user.id
    ).order_by(models.AvailableSlot.id.asc()).all()


@router.post("", response_model=schemas.AvailableSlotOut, status_code=201)
def create_availability(payload: schemas.AvailableSlotCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    day_clean = payload.day_of_week.replace("ç", "c").replace("á", "a").capitalize()
    if day_clean not in VALID_DAYS:
        raise HTTPException(400, f"Dia da semana inválido ({payload.day_of_week}). Use: {sorted(VALID_DAYS)}")
    if payload.start_time >= payload.end_time:
        raise HTTPException(400, "O horário final deve ser posterior ao horário inicial.")

    slot = models.AvailableSlot(
        user_id=user.id,
        day_of_week=day_clean,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status=payload.status or "Ativo",
    )
    db.add(slot)
    db.add(models.History(
        user_id=user.id,
        action="disponibilidade_cadastrada",
        description=f"Horário disponível cadastrado: {day_clean} ({payload.start_time.strftime('%H:%M')}–{payload.end_time.strftime('%H:%M')}).",
    ))
    db.commit()
    db.refresh(slot)
    return slot


@router.delete("/{slot_id}", status_code=204)
def delete_availability(slot_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    slot = db.query(models.AvailableSlot).filter(
        models.AvailableSlot.id == slot_id,
        models.AvailableSlot.user_id == user.id,
    ).first()
    if not slot:
        raise HTTPException(404, "Horário disponível não encontrado.")
    db.delete(slot)
    db.commit()
    return None

