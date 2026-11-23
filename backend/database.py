from sqlalchemy import create_engine, event, text, inspect
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings


def normalize_database_url(raw_url: str) -> str:
    """Normaliza URLs PostgreSQL (ex.: AWS RDS) para usar o driver psycopg (v3)."""
    url = (raw_url or "").strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = normalize_database_url(settings.DATABASE_URL)
is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_migrations():
    """Garante colunas adicionadas na evolução SIC 2026 em bancos SQLite/PostgreSQL existentes."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    alterations = {
        "users": [
            ("updated_at", "TIMESTAMP"),
            ("interface_mode", "VARCHAR(20) DEFAULT 'complete'"),
            ("routine_text", "TEXT DEFAULT ''"),
        ],
        "tasks": [
            ("category_id", "INTEGER"),
            ("goal_id", "INTEGER"),
            ("completed_at", "TIMESTAMP"),
            ("subtasks_json", "TEXT DEFAULT '[]'"),
            ("time_spent_seconds", "INTEGER DEFAULT 0"),
        ],
        "appointments": [
            ("category_id", "INTEGER"),
            ("status", "VARCHAR(30) DEFAULT 'Agendada'"),
        ],
        "goals": [
            ("start_date", "DATE"),
        ],
        "suggestions": [
            ("analysis_id", "INTEGER"),
            ("action_type", "VARCHAR(20) DEFAULT 'Criar'"),
        ],
    }
    with engine.begin() as conn:
        for table_name, cols in alterations.items():
            if table_name not in existing_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            for col_name, col_type in cols:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))

