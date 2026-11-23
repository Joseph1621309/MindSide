from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from database import Base, engine, ensure_schema_migrations
import models  # garante que os modelos sejam registrados antes do create_all
from routes import auth, tasks, appointments, goals, ai, suggestions, history, categories, availability, demo

Base.metadata.create_all(bind=engine)
ensure_schema_migrations()

app = FastAPI(
    title="MINDSIDE API",
    description="Secretário Digital Inteligente para Gerenciamento Pessoal sob Contexto",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(appointments.router)
app.include_router(goals.router)
app.include_router(ai.router)
app.include_router(suggestions.router)
app.include_router(history.router)
app.include_router(categories.router)
app.include_router(availability.router)
app.include_router(demo.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "MINDSIDE"}


_BASE_DIR = Path(__file__).resolve().parent
_FRONTEND_CANDIDATES = [
    _BASE_DIR / "frontend",
    _BASE_DIR.parent / "frontend",
]
for _frontend_dir in _FRONTEND_CANDIDATES:
    if _frontend_dir.is_dir() and (_frontend_dir / "index.html").is_file():
        app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
        break
