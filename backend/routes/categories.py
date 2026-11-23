from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import re

import models, schemas
from dependencies import get_db, get_current_user

router = APIRouter(prefix="/api/categories", tags=["categories"])

DEFAULT_CATEGORIES = [
    {"name": "Estudo", "slug": "estudo", "tipo_categoria": "Estudo", "color": "#4fb2ff", "description": "Provas, aulas, leituras e trabalhos acadêmicos"},
    {"name": "Trabalho", "slug": "trabalho", "tipo_categoria": "Trabalho", "color": "#f0c93a", "description": "Reuniões, projetos e entregas profissionais"},
    {"name": "Saúde & Treino", "slug": "saude", "tipo_categoria": "Saude", "color": "#2be6a0", "description": "Academia, corrida, consultas e bem-estar"},
    {"name": "Lazer", "slug": "lazer", "tipo_categoria": "Lazer", "color": "#ff9a4c", "description": "Descanso, cultura, amigos e hobbies"},
    {"name": "Pessoal", "slug": "pessoal", "tipo_categoria": "Pessoal", "color": "#b07bff", "description": "Organização doméstica e compromissos pessoais"},
    {"name": "Geral", "slug": "geral", "tipo_categoria": "Outros", "color": "#7c8ea0", "description": "Atividades gerais da rotina"},
]


def ensure_default_categories(db: Session, user_id: int) -> List[models.Category]:
    existing = db.query(models.Category).filter(models.Category.user_id == user_id).all()
    if existing:
        return existing
    created = []
    for item in DEFAULT_CATEGORIES:
        cat = models.Category(user_id=user_id, **item)
        db.add(cat)
        created.append(cat)
    db.commit()
    for c in created:
        db.refresh(c)
    return created


@router.get("", response_model=List[schemas.CategoryOut])
def list_categories(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return ensure_default_categories(db, user.id)


@router.post("", response_model=schemas.CategoryOut, status_code=201)
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    ensure_default_categories(db, user.id)
    slug = payload.slug or re.sub(r"[^a-z0-9_]+", "_", payload.name.strip().lower()).strip("_") or "personalizada"
    cat = models.Category(
        user_id=user.id,
        name=payload.name.strip(),
        slug=slug[:50],
        description=payload.description or "",
        tipo_categoria=payload.tipo_categoria or "Outros",
        color=payload.color or "#2be6a0",
    )
    db.add(cat)
    db.add(models.History(user_id=user.id, action="categoria_criada", description=f"Categoria '{cat.name}' criada."))
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}", status_code=204)
def delete_category(cat_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    cat = db.query(models.Category).filter(models.Category.id == cat_id, models.Category.user_id == user.id).first()
    if not cat:
        raise HTTPException(404, "Categoria não encontrada.")
    db.delete(cat)
    db.commit()
    return None

