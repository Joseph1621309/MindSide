from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, List, Any, Dict, Literal
from datetime import date, time, datetime


# ---------- Auth / User ----------
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    password_confirm: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    interface_mode: Optional[Literal["complete", "simplified"]] = None

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    interface_mode: str = "complete"
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Category ----------
class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    slug: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default="", max_length=500)
    tipo_categoria: Optional[str] = "Outros"
    color: Optional[str] = "#2be6a0"

class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str
    description: Optional[str] = ""
    tipo_categoria: str
    color: Optional[str] = "#2be6a0"


# ---------- AvailableSlot ----------
class AvailableSlotCreate(BaseModel):
    day_of_week: str
    start_time: time
    end_time: time
    status: Optional[str] = "Ativo"

class AvailableSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    day_of_week: str
    start_time: time
    end_time: time
    status: str


# ---------- Task ----------
class SubtaskItem(BaseModel):
    id: str
    title: str
    duration_min: int = Field(default=20, ge=5, le=120)
    done: bool = False


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ""
    priority: Optional[str] = "media"
    category: Optional[str] = "geral"
    category_id: Optional[int] = None
    goal_id: Optional[int] = None
    deadline: Optional[date] = None
    duration: Optional[int] = 30
    status: Optional[str] = "pendente"
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[time] = None
    subtasks: Optional[List[Dict[str, Any]]] = []
    time_spent_seconds: Optional[int] = Field(default=0, ge=0)

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[int] = None
    goal_id: Optional[int] = None
    deadline: Optional[date] = None
    duration: Optional[int] = None
    status: Optional[str] = None
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[time] = None
    subtasks: Optional[List[Dict[str, Any]]] = None
    time_spent_seconds: Optional[int] = Field(default=None, ge=0)
    tempo_gasto_segundos: Optional[int] = Field(default=None, ge=0)

class TaskOut(TaskBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subtasks: List[Dict[str, Any]] = []
    precisa_destrinchar: bool = True
    time_spent_seconds: int = 0
    tempo_gasto_segundos: int = 0

    @field_validator("time_spent_seconds", "tempo_gasto_segundos", mode="before")
    @classmethod
    def _coerce_none_int(cls, v):
        return 0 if v is None else int(v)


# ---------- Appointment ----------
class AppointmentBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ""
    date: date
    start_time: time
    end_time: time
    category: Optional[str] = "geral"
    category_id: Optional[int] = None
    status: Optional[str] = "Agendada"

class AppointmentCreate(AppointmentBase):
    pass

class AppointmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    category: Optional[str] = None
    category_id: Optional[int] = None
    status: Optional[str] = None

class AppointmentOut(AppointmentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Goal ----------
class GoalBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ""
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    progress: Optional[int] = Field(default=0, ge=0, le=100)
    status: Optional[str] = "ativo"

class GoalCreate(GoalBase):
    pass

class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    status: Optional[str] = None

class GoalOut(GoalBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- AI / Suggestion / Audit ----------
class AIAnalyzeRequest(BaseModel):
    text: str = Field(max_length=5000)

class SuggestionValidationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    suggestion_id: int
    is_valid: bool
    formato_valido: bool
    campos_validos: bool
    possui_conflito: bool
    dentro_disponibilidade: bool
    message: str
    validated_at: datetime

class SuggestionDecisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    suggestion_id: int
    decision_type: str
    note: str
    created_at: datetime

class SuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    analysis_id: Optional[int] = None
    type: str
    action_type: Optional[str] = "Criar"
    content: str
    structured_data: str
    status: str
    created_at: datetime
    decided_at: Optional[datetime] = None

class SuggestionEdit(BaseModel):
    structured_data: Dict[str, Any]
    note: Optional[str] = ""


# ---------- History ----------
class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    description: str
    created_at: datetime


# ---------- Gemini Structured Outputs & Inteligência Executiva ----------
class BrainDumpRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    auto_create: bool = True


class BrainDumpCardSchema(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    prioridade: Literal["Alta", "Média", "Baixa"] = "Média"
    prazo_sugerido: Optional[str] = None
    categoria: str = "geral"
    duracao_min: int = Field(default=30, ge=5, le=240)
    resumo: Optional[str] = ""
    precisa_destrinchar: bool = True


class BrainDumpGeminiSchema(BaseModel):
    itens: List[BrainDumpCardSchema]
    comentario_secretario: str = ""


class SubtaskStepSchema(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    tempo_estimado_min: int = Field(default=20, ge=5, le=60)


class TaskBreakdownGeminiSchema(BaseModel):
    passos: List[SubtaskStepSchema]
    dica_foco: str = ""


class AISuggestionItemSchema(BaseModel):
    type: Literal["tarefa", "compromisso"] = "tarefa"
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: Literal["baixa", "media", "alta", "urgente"] = "media"
    date: Optional[str] = None
    time: Optional[str] = None
    duration_minutes: int = Field(default=30, ge=5, le=720)
    category: Literal["estudo", "trabalho", "saude", "lazer", "pessoal", "geral"] = "geral"
    goal_id: Optional[int] = None
    precisa_destrinchar: Optional[bool] = None
    subtasks: Optional[List[SubtaskStepSchema]] = None


class AIAnalyzeGeminiSchema(BaseModel):
    suggestions: List[AISuggestionItemSchema] = Field(min_length=1, max_length=5)
    reasoning_summary: str = ""


class DailyBriefingGeminiSchema(BaseModel):
    recomendacao_principal: str
    tarefa_foco_titulo: Optional[str] = None
    motivo_estrategico: str
    alerta_sobrecarga: Optional[str] = None


class NoteExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=15000)
    auto_create: bool = True


class NoteActionItemSchema(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    prioridade: Literal["Alta", "Média", "Baixa"] = "Média"
    prazo_sugerido: Optional[str] = None
    categoria: str = "estudo"
    contexto_origem: str = ""
    precisa_destrinchar: bool = True


class NoteExtractGeminiSchema(BaseModel):
    resumo_filtrado: str
    acoes: List[NoteActionItemSchema]


class StudyPlanRequest(BaseModel):
    text: str = Field(min_length=1, max_length=3000)


class StudyPlanStageGeminiSchema(BaseModel):
    dia_ou_etapa: str
    topico_principal: str
    tempo_estimado_min: int = Field(default=60, ge=15, le=300)
    como_estudar: str
    subtopicos: List[str]


class StudyPlanGeminiSchema(BaseModel):
    titulo_plano: str = Field(min_length=1, max_length=200)
    objetivo_geral: str = ""
    total_dias_ou_etapas: int = Field(default=5, ge=1, le=30)
    tempo_diario_min: int = Field(default=60, ge=15, le=360)
    etapas: List[StudyPlanStageGeminiSchema]


class StudyPlanUpdate(BaseModel):
    stages: List[Dict[str, Any]]


class StudyPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    goal_summary: str
    total_days: int
    daily_minutes: int
    stages: List[Dict[str, Any]]
    provider_used: str
    created_at: datetime


class RoutineFreeformRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class RoutineBlockItemSchema(BaseModel):
    titulo: str = Field(min_length=1, max_length=120)
    dias_semana: List[str]
    hora_inicio: str
    hora_fim: str
    categoria: str = "rotina"


class RoutineParseGeminiSchema(BaseModel):
    blocos: List[RoutineBlockItemSchema]
    resumo_rotina: str = ""


class RoutineBlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    day_of_week: str
    start_time: time
    end_time: time
    category: str


class GoalBreakdownRequest(BaseModel):
    auto_create: bool = False
    selected_tasks: Optional[List[Dict[str, Any]]] = None


class GoalBreakdownGeminiSchema(BaseModel):
    tarefas: List[BrainDumpCardSchema]
    estrategia_objetivo: str = ""

