from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from dependencies import get_db, get_current_user
from services.conflict_service import check_appointment_conflict

router = APIRouter(prefix="/api/appointments", tags=["appointments"])


@router.get("", response_model=List[schemas.AppointmentOut])
def list_appointments(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Appointment).filter(models.Appointment.user_id == user.id).order_by(models.Appointment.date).all()


@router.post("", response_model=schemas.AppointmentOut, status_code=201)
def create_appointment(payload: schemas.AppointmentCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if payload.start_time >= payload.end_time:
        raise HTTPException(400, "O horário final deve ser depois do horário inicial.")
    conflicts = check_appointment_conflict(db, user.id, payload.date, payload.start_time, payload.end_time)
    if conflicts:
        raise HTTPException(409, {"message": "Conflito de horário detectado.", "conflicts": conflicts})
    appt = models.Appointment(user_id=user.id, **payload.model_dump())
    db.add(appt)
    db.commit()
    db.refresh(appt)
    db.add(models.History(user_id=user.id, action="compromisso_criado", description=f"Você criou o compromisso '{appt.title}'."))
    db.commit()
    return appt


@router.put("/{appt_id}", response_model=schemas.AppointmentOut)
def update_appointment(appt_id: int, payload: schemas.AppointmentUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    appt = db.query(models.Appointment).filter(models.Appointment.id == appt_id, models.Appointment.user_id == user.id).first()
    if not appt:
        raise HTTPException(404, "Compromisso não encontrado.")
    data = payload.model_dump(exclude_unset=True)
    new_date = data.get("date", appt.date)
    new_start = data.get("start_time", appt.start_time)
    new_end = data.get("end_time", appt.end_time)
    if new_start >= new_end:
        raise HTTPException(400, "O horário final deve ser depois do horário inicial.")
    conflicts = check_appointment_conflict(db, user.id, new_date, new_start, new_end, ignore_id=appt.id)
    if conflicts:
        raise HTTPException(409, {"message": "Conflito de horário detectado.", "conflicts": conflicts})
    for field, value in data.items():
        setattr(appt, field, value)
    db.commit()
    db.refresh(appt)
    db.add(models.History(user_id=user.id, action="compromisso_alterado", description=f"Você alterou o compromisso '{appt.title}'."))
    db.commit()
    return appt


@router.delete("/{appt_id}", status_code=204)
def delete_appointment(appt_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    appt = db.query(models.Appointment).filter(models.Appointment.id == appt_id, models.Appointment.user_id == user.id).first()
    if not appt:
        raise HTTPException(404, "Compromisso não encontrado.")
    title = appt.title
    db.delete(appt)
    db.add(models.History(user_id=user.id, action="compromisso_excluido", description=f"Você excluiu o compromisso '{title}'."))
    db.commit()
    return None
