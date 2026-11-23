-- ============================================================================
-- MINDSIDE — Esquema Relacional Consolidado e Corrigido (SIC 2026)
-- ============================================================================
-- Baseado na proposta original de Banco de Dados da equipe (Banco de dados.docx),
-- com todas as correções sintáticas, chaves primárias/estrangeiras íntegras,
-- regras de exclusão coerentes (ON DELETE CASCADE / SET NULL) e compatibilidade
-- total com o ORM SQLAlchemy da aplicação.
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    interface_mode VARCHAR(20) NOT NULL DEFAULT 'complete' CHECK (interface_mode IN ('complete', 'simplified')),
    routine_text TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL DEFAULT 'geral',
    description VARCHAR(500) DEFAULT '',
    tipo_categoria VARCHAR(30) NOT NULL DEFAULT 'Outros' CHECK (tipo_categoria IN ('Estudo', 'Trabalho', 'Pessoal', 'Saude', 'Lazer', 'Outros')),
    color VARCHAR(20) DEFAULT '#2be6a0',
    start_date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS available_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_available_slots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    start_date DATE,
    deadline DATE,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'pausado')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER,
    goal_id INTEGER,
    title VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    priority VARCHAR(20) DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta', 'urgente')),
    category VARCHAR(50) DEFAULT 'geral',
    deadline DATE,
    duration INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
    scheduled_date DATE,
    scheduled_time TIME,
    completed_at DATETIME,
    subtasks_json TEXT NOT NULL DEFAULT '[]',
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_tasks_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_tasks_goal FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER,
    title VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    category VARCHAR(50) DEFAULT 'geral',
    status VARCHAR(30) DEFAULT 'Agendada' CHECK (status IN ('Agendada', 'Inicializada', 'Finalizada', 'Desmarcada', 'Perdida')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS user_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    url VARCHAR(2048) NOT NULL DEFAULT '',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    file_hash VARCHAR(64) NOT NULL DEFAULT '',
    processing_status VARCHAR(30) NOT NULL DEFAULT 'Finalizado' CHECK (processing_status IN ('Pendente', 'Processamento', 'Finalizado', 'Erro')),
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    analysis_type VARCHAR(30) NOT NULL DEFAULT 'Organizacao' CHECK (analysis_type IN ('Organizacao', 'Conflito', 'Priorizacao', 'Planejamento')),
    request_text VARCHAR(500) NOT NULL,
    provider_used VARCHAR(40) NOT NULL DEFAULT 'local_fallback',
    reasoning_summary VARCHAR(1000) DEFAULT '',
    processing_status VARCHAR(30) NOT NULL DEFAULT 'Finalizado' CHECK (processing_status IN ('Pendente', 'Processamento', 'Finalizado', 'Erro')),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    CONSTRAINT fk_ai_analyses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS analysis_file_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id INTEGER NOT NULL,
    file_id INTEGER NOT NULL,
    CONSTRAINT fk_analysis_file_analysis FOREIGN KEY (analysis_id) REFERENCES ai_analyses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_analysis_file_file FOREIGN KEY (file_id) REFERENCES user_files(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    analysis_id INTEGER,
    type VARCHAR(30) DEFAULT 'tarefa',
    action_type VARCHAR(20) DEFAULT 'Criar' CHECK (action_type IN ('Criar', 'Editar', 'Excluir')),
    content TEXT DEFAULT '',
    structured_data TEXT DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME,
    CONSTRAINT fk_suggestions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_suggestions_analysis FOREIGN KEY (analysis_id) REFERENCES ai_analyses(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS suggestion_validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suggestion_id INTEGER NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT 1,
    formato_valido BOOLEAN NOT NULL DEFAULT 1,
    campos_validos BOOLEAN NOT NULL DEFAULT 1,
    possui_conflito BOOLEAN NOT NULL DEFAULT 0,
    dentro_disponibilidade BOOLEAN NOT NULL DEFAULT 1,
    message TEXT DEFAULT '',
    validated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_validations_suggestion FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS suggestion_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    suggestion_id INTEGER NOT NULL,
    decision_type VARCHAR(30) NOT NULL CHECK (decision_type IN ('Aprovar', 'Editar', 'Rejeitar', 'Nova_sugestao')),
    note VARCHAR(255) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_decisions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_decisions_suggestion FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action VARCHAR(60) NOT NULL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    goal_summary TEXT DEFAULT '',
    total_days INTEGER DEFAULT 5,
    daily_minutes INTEGER DEFAULT 60,
    stages_json TEXT NOT NULL DEFAULT '[]',
    provider_used VARCHAR(40) NOT NULL DEFAULT 'local_fallback',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    CONSTRAINT fk_study_plans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS ix_tasks_user_sched ON tasks(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS ix_appointments_user_date ON appointments(user_id, date);
CREATE INDEX IF NOT EXISTS ix_study_plans_user ON study_plans(user_id);

CREATE TABLE IF NOT EXISTS routine_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title VARCHAR(120) NOT NULL,
    day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'rotina',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_routine_blocks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_routine_blocks_user ON routine_blocks(user_id);

