import json
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date, Time,
    ForeignKey, Boolean, BigInteger, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    """Entidade de Usuário (equivalente corrigido de tb_usuario)."""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(160), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    interface_mode = Column(String(20), nullable=False, default="complete")
    routine_text = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")
    available_slots = relationship("AvailableSlot", back_populates="user", cascade="all, delete-orphan")
    routine_blocks = relationship("RoutineBlock", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="user", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    files = relationship("UserFile", back_populates="user", cascade="all, delete-orphan")
    ai_analyses = relationship("AIAnalysis", back_populates="user", cascade="all, delete-orphan")
    suggestions = relationship("Suggestion", back_populates="user", cascade="all, delete-orphan")
    suggestion_decisions = relationship("SuggestionDecision", back_populates="user", cascade="all, delete-orphan")
    history = relationship("History", back_populates="user", cascade="all, delete-orphan")
    study_plans = relationship("StudyPlan", back_populates="user", cascade="all, delete-orphan")


class Category(Base):
    """Entidade de Categoria (equivalente corrigido de tb_categoria com PK id_categoria)."""
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    slug = Column(String(50), nullable=False, default="geral")
    description = Column(String(500), default="")
    tipo_categoria = Column(String(30), nullable=False, default="Outros")  # Estudo, Trabalho, Pessoal, Saude, Lazer, Outros
    color = Column(String(20), default="#2be6a0")
    start_date = Column(Date, server_default=func.current_date())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="categories")


class AvailableSlot(Base):
    """Entidade de Horários Disponíveis (equivalente corrigido de tb_horarios_disponiveis)."""
    __tablename__ = "available_slots"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week = Column(String(20), nullable=False)  # Domingo, Segunda, Terca, Quarta, Quinta, Sexta, Sabado
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    status = Column(String(20), nullable=False, default="Ativo")  # Ativo, Inativo
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="available_slots")


class Goal(Base):
    """Entidade de Objetivos (equivalente corrigido de tb_objetivos)."""
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_goals_progress_range"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    start_date = Column(Date, nullable=True)
    deadline = Column(Date, nullable=True)
    progress = Column(Integer, default=0)  # 0-100
    status = Column(String(20), default="ativo")  # ativo, concluido, pausado
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="goals")
    tasks = relationship("Task", back_populates="goal")


class Task(Base):
    """Entidade de Tarefas (equivalente corrigido de tb_tarefas)."""
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_user_sched", "user_id", "scheduled_date"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    goal_id = Column(Integer, ForeignKey("goals.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    priority = Column(String(20), default="media")  # baixa, media, alta, urgente
    category = Column(String(50), default="geral")
    deadline = Column(Date, nullable=True)
    duration = Column(Integer, default=30)  # minutos
    status = Column(String(20), default="pendente")  # pendente, em_andamento, concluida, cancelada
    scheduled_date = Column(Date, nullable=True)
    scheduled_time = Column(Time, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    subtasks_json = Column(Text, nullable=False, default="[]")
    time_spent_seconds = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="tasks")
    goal = relationship("Goal", back_populates="tasks")

    @property
    def subtasks(self):
        try:
            data = json.loads(self.subtasks_json or "[]")
            return data if isinstance(data, list) else []
        except (TypeError, ValueError):
            return []

    @subtasks.setter
    def subtasks(self, value):
        cleaned = value if isinstance(value, list) else []
        self.subtasks_json = json.dumps(cleaned, ensure_ascii=False)

    @property
    def precisa_destrinchar(self) -> bool:
        from services.ai_service import is_task_complex
        return is_task_complex(self.title or "", self.description or "", self.category or "geral")

    @property
    def tempo_gasto_segundos(self) -> int:
        return int(self.time_spent_seconds or 0)


class Appointment(Base):
    """Entidade de Compromissos (equivalente corrigido de tb_compromissos)."""
    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appointments_user_date", "user_id", "date"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    category = Column(String(50), default="geral")
    status = Column(String(30), default="Agendada")  # Agendada, Inicializada, Finalizada, Desmarcada, Perdida
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="appointments")


class UserFile(Base):
    """Entidade de Metadados de Arquivos (equivalente corrigido de tb_arquivos, sem persistir blobs binários)."""
    __tablename__ = "user_files"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    url = Column(String(2048), nullable=False, default="")
    size_bytes = Column(BigInteger, nullable=False, default=0)
    file_hash = Column(String(64), nullable=False, default="")
    processing_status = Column(String(30), nullable=False, default="Finalizado")  # Pendente, Processamento, Finalizado, Erro
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="files")
    analysis_links = relationship("AnalysisFileLink", back_populates="file", cascade="all, delete-orphan")


class AIAnalysis(Base):
    """Entidade de Solicitação de Análise à IA (equivalente corrigido de tb_analise_ia)."""
    __tablename__ = "ai_analyses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    analysis_type = Column(String(30), nullable=False, default="Organizacao")  # Organizacao, Conflito, Priorizacao, Planejamento
    request_text = Column(String(500), nullable=False)
    provider_used = Column(String(40), nullable=False, default="local_fallback")
    reasoning_summary = Column(String(1000), default="")
    processing_status = Column(String(30), nullable=False, default="Finalizado")  # Pendente, Processamento, Finalizado, Erro
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="ai_analyses")
    suggestions = relationship("Suggestion", back_populates="analysis", cascade="all, delete-orphan")
    file_links = relationship("AnalysisFileLink", back_populates="analysis", cascade="all, delete-orphan")


class AnalysisFileLink(Base):
    """Tabela associativa entre Análises de IA e Arquivos (equivalente corrigido de tb_arquivos_analise)."""
    __tablename__ = "analysis_file_links"
    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(Integer, ForeignKey("ai_analyses.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id = Column(Integer, ForeignKey("user_files.id", ondelete="CASCADE"), nullable=False, index=True)

    analysis = relationship("AIAnalysis", back_populates="file_links")
    file = relationship("UserFile", back_populates="analysis_links")


class Suggestion(Base):
    """Entidade de Sugestões de IA e seus itens estruturados (unifica tb_sugestao_ia e tb_sugestoes_itens)."""
    __tablename__ = "suggestions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    analysis_id = Column(Integer, ForeignKey("ai_analyses.id", ondelete="SET NULL"), nullable=True, index=True)
    type = Column(String(30), default="tarefa")  # tarefa, compromisso
    action_type = Column(String(20), default="Criar")  # Criar, Editar, Excluir
    content = Column(Text, default="")  # texto amigável
    structured_data = Column(Text, default="{}")  # JSON serializado validado pelo Python
    status = Column(String(20), default="pending")  # pending, approved, rejected, edited
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="suggestions")
    analysis = relationship("AIAnalysis", back_populates="suggestions")
    validations = relationship("SuggestionValidation", back_populates="suggestion", cascade="all, delete-orphan")
    decisions = relationship("SuggestionDecision", back_populates="suggestion", cascade="all, delete-orphan")


class SuggestionValidation(Base):
    """Entidade de Auditoria de Validação Técnica do Python sobre respostas da IA (tb_validacoes_ia corrigida)."""
    __tablename__ = "suggestion_validations"
    id = Column(Integer, primary_key=True, index=True)
    suggestion_id = Column(Integer, ForeignKey("suggestions.id", ondelete="CASCADE"), nullable=False, index=True)
    is_valid = Column(Boolean, nullable=False, default=True)
    formato_valido = Column(Boolean, nullable=False, default=True)
    campos_validos = Column(Boolean, nullable=False, default=True)
    possui_conflito = Column(Boolean, nullable=False, default=False)
    dentro_disponibilidade = Column(Boolean, nullable=False, default=True)
    message = Column(Text, default="Validação técnica concluída com sucesso pelo Python.")
    validated_at = Column(DateTime(timezone=True), server_default=func.now())

    suggestion = relationship("Suggestion", back_populates="validations")


class SuggestionDecision(Base):
    """Entidade de Registro de Aprovação, Edição, Rejeição ou Nova Sugestão pelo Usuário (tb_descricao_sugestao)."""
    __tablename__ = "suggestion_decisions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    suggestion_id = Column(Integer, ForeignKey("suggestions.id", ondelete="CASCADE"), nullable=False, index=True)
    decision_type = Column(String(30), nullable=False)  # Aprovar, Editar, Rejeitar, Nova_sugestao
    note = Column(String(255), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="suggestion_decisions")
    suggestion = relationship("Suggestion", back_populates="decisions")


class History(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(60), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="history")


class StudyPlan(Base):
    """Plano de Estudos progressivo gerado pelo módulo Arquiteto de Estudos."""
    __tablename__ = "study_plans"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    goal_summary = Column(Text, default="")
    total_days = Column(Integer, default=5)
    daily_minutes = Column(Integer, default=60)
    stages_json = Column(Text, nullable=False, default="[]")
    provider_used = Column(String(40), nullable=False, default="local_fallback")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    user = relationship("User", back_populates="study_plans")

    @property
    def stages(self):
        try:
            data = json.loads(self.stages_json or "[]")
            return data if isinstance(data, list) else []
        except (TypeError, ValueError):
            return []

    @stages.setter
    def stages(self, value):
        cleaned = value if isinstance(value, list) else []
        self.stages_json = json.dumps(cleaned, ensure_ascii=False)


class RoutineBlock(Base):
    """Blocos fixos ocupados da rotina do usuário extraídos por IA a partir de texto livre."""
    __tablename__ = "routine_blocks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(120), nullable=False)
    day_of_week = Column(String(20), nullable=False)  # Segunda, Terca, Quarta, Quinta, Sexta, Sabado, Domingo
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    category = Column(String(30), nullable=False, default="rotina")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="routine_blocks")

