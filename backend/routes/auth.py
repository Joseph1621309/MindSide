from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import models, schemas
from dependencies import get_db, get_current_user
from utils.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    if payload.password != payload.password_confirm:
        raise HTTPException(400, "As senhas não coincidem.")
    if len(payload.password) < 6:
        raise HTTPException(400, "A senha deve ter ao menos 6 caracteres.")
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "Este e-mail já está cadastrado.")

    user = models.User(name=payload.name, email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(models.History(user_id=user.id, action="conta_criada", description="Conta criada no MINDSIDE."))
    db.commit()

    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha inválidos.")
    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.post("/guest", response_model=schemas.Token)
def guest(db: Session = Depends(get_db)):
    """Cria uma sessão de visitante sem exigir cadastro/login.
    Cada chamada cria um usuário isolado; o frontend guarda o token no navegador.
    """
    import uuid

    guest_id = uuid.uuid4().hex[:12]
    user = models.User(
        name="Visitante",
        email=f"guest_{guest_id}@example.com",
        password_hash=hash_password(uuid.uuid4().hex),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=schemas.UserOut)
def update_me(payload: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    updated = False
    if payload.name and payload.name.strip():
        new_name = payload.name.strip()
        if new_name != current_user.name:
            current_user.name = new_name
            db.add(models.History(
                user_id=current_user.id,
                action="perfil_atualizado",
                description=f"Nome do perfil atualizado para '{current_user.name}'."
            ))
            updated = True

    if payload.interface_mode is not None:
        previous_mode = getattr(current_user, "interface_mode", "complete") or "complete"
        if payload.interface_mode != previous_mode:
            current_user.interface_mode = payload.interface_mode
            mode_label = "Modo Simplificado" if payload.interface_mode == "simplified" else "Modo Completo"
            db.add(models.History(
                user_id=current_user.id,
                action="modo_interface_alterado",
                description=f"Modo de interface alterado para {mode_label}."
            ))
            updated = True

    if updated:
        db.commit()
        db.refresh(current_user)
    return current_user
