from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from dependencies import get_db, get_current_user

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=List[schemas.HistoryOut])
def list_history(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.History).filter(models.History.user_id == user.id).order_by(models.History.created_at.desc()).limit(200).all()
