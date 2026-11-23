# MINDSIDE — Secretário Digital Inteligente para Gerenciamento Pessoal sob Contexto (SIC 2026)

Secretário digital inteligente desenvolvido para apoiar jovens e estudantes (15 a 30 anos) na redução da sobrecarga cognitiva associada à organização de tarefas, compromissos, horários disponíveis e objetivos.

O usuário descreve uma ou mais demandas em linguagem natural; a camada de IA interpreta o texto, o **Python** valida tecnicamente a estrutura, verifica conflitos de horário e cruza com as janelas de disponibilidade, e **somente uma aprovação explícita do usuário** cria ou altera tarefas e compromissos na rotina.

Esta versão opera com sessões de visitante isoladas (e também suporta cadastro/login opcionais), mantendo a pasta original intacta.

---

## Documentação do Projeto e Preparação SIC 2026

- `documentação/Documento_de_Requisitos_MindSide.docx` — Requisitos funcionais (`B1`–`B8`), não funcionais (`C1`–`C5`) e critérios de aceitação do MVP.
- `documentação/Modelo_Pre-Projeto_MindSide.docx` — Fundamentação teórica (Hartmut Rosa, John Sweller), problemática e metodologia.
- `documentação/GUIA_BANCO_DE_DADOS_E_EXECUCAO.md` — Modelo relacional de 13 tabelas (revisão e integração do `Banco de dados.docx`), migrações e guia passo a passo no Windows.
- `documentação/APRESENTACAO_SIC_2026.md` — Matriz dos 10 critérios do Samsung Innovation Campus, roteiro de demonstração ao vivo de 4 minutos e perguntas/respostas técnicas da banca.
- `backend/schema_mindside.sql` — Script DDL SQL consolidado e validado com todas as 13 entidades e constraints.

---

## Tecnologias e Arquitetura

- **Interface (Frontend):** HTML5 semântico, CSS3 customizado (sistema de temas por área + modo claro/escuro), JavaScript ES6+ puro, mascote interativo em pixel art CSS e coleção de 6 stickers SVG originais locais (`frontend/assets/stickers/`).
- **Servidor e Controle (Backend):** Python 3.12/3.13, FastAPI, Pydantic V2 e Uvicorn.
- **Persistência (Banco de Dados):** SQLite 3 local (`backend/mindside.db`) com `PRAGMA foreign_keys=ON` e migração não-destrutiva automática; suporte opcional a PostgreSQL 16 via SQLAlchemy 2.0 (`docker-compose.yml`).
- **Inteligência Artificial:** SDK oficial `google-genai` (Gemini) com saída JSON estruturada, provedor Anthropic opcional e interpretador contextual local baseado em regras (capaz de extrair múltiplas demandas mesmo offline).
- **Testes Automatizados:** `pytest` + `FastAPI TestClient` (30 testes automatizados cobrindo fluxos ponta a ponta, banco, auditoria, conflitos, isolamento e resiliência da IA).

---

## Estrutura do Projeto

```text
backend/
  main.py                 inicialização da API, migrações automáticas e CORS
  config.py               configuração por ambiente e .env local
  database.py             conexão SQLAlchemy, PRAGMA foreign_keys=ON e migrações
  models.py, schemas.py   13 entidades relacionais e validação Pydantic V2
  schema_mindside.sql     DDL SQL consolidado e corrigido
  routes/                 auth, tasks, appointments, goals, categories, availability, ai, suggestions, demo, history
  services/               ai_service (Gemini + fallback multi-item), validation_service, conflict_service
  tests/                  30 testes automatizados (test_ai_service.py e test_core_flow.py)
frontend/
  *.html                  páginas da aplicação
  css/global.css          design system HUD, temas por área e responsividade
  assets/stickers/        6 SVGs originais locais do MindSide
  js/                     cliente HTTP central (api.js) e lógica das telas
documentação/
  Documento_de_Requisitos_MindSide.docx
  Modelo_Pre-Projeto_MindSide.docx
  GUIA_BANCO_DE_DADOS_E_EXECUCAO.md
  APRESENTACAO_SIC_2026.md
```

---

## Instalação e Execução Local no Windows (PowerShell)

### 1. Preparar o ambiente do Backend

Se o ambiente virtual `.venv313` (ou `.venv`) já existir em `backend`, basta ativá-lo. Caso queira configurar do zero:

```powershell
Set-Location .\backend
if (-not (Test-Path .env)) { Copy-Item ..\.env.example .env }
```

> Nunca exponha chaves reais de API em arquivos versionados ou relatórios. Com `AI_PROVIDER=none` ou sem chave externa, o sistema utiliza automaticamente o interpretador contextual local.

### 2. Iniciar o Backend (Terminal 1)

```powershell
Set-Location .\backend
.\.venv313\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

- API: `http://localhost:8000`
- Documentação Swagger: `http://localhost:8000/docs`

### 3. Iniciar o Frontend (Terminal 2)

```powershell
Set-Location .\frontend
py -3.13 -m http.server 5500 --bind 127.0.0.1
```

- Aplicação: **`http://localhost:5500/dashboard.html`** (ou `http://localhost:5500/`)

---

## Executar Testes e Verificações

### Suíte de Testes Automatizados (Backend)

```powershell
Set-Location .\backend
.\.venv313\Scripts\python.exe -m pytest -v
```

### Verificação de Sintaxe JavaScript (Frontend)

```powershell
Set-Location .\frontend
Get-ChildItem .\js\*.js | ForEach-Object { node --check $_.FullName }
```

---

## Principais Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/auth/guest` | Inicia sessão de visitante isolada |
| `GET / PUT` | `/api/auth/me` | Consulta ou atualiza o nome do perfil da sessão |
| `GET / POST / PUT / DELETE` | `/api/tasks` | CRUD de tarefas com verificação de conflitos e vínculo com objetivos |
| `GET / POST / PUT / DELETE` | `/api/appointments` | CRUD de compromissos com detecção de conflitos |
| `GET / POST / PUT / DELETE` | `/api/goals` | CRUD de objetivos com cálculo automático de progresso |
| `GET / POST / DELETE` | `/api/categories` | Categorias contextuais do usuário |
| `GET / POST / DELETE` | `/api/availability` | Janelas de horários disponíveis por dia da semana |
| `POST` | `/api/ai/analyze` | Analisa texto livre (1 a 5 itens), valida via Python e cria sugestões pendentes |
| `GET / PUT` | `/api/suggestions` | Lista ou edita sugestões pendentes |
| `POST` | `/api/suggestions/{id}/regenerate` | Solicita novo encaixe de horário livre calculado pelo Python |
| `POST` | `/api/suggestions/{id}/approve` | Revalida conflitos e incorpora a sugestão como tarefa ou compromisso |
| `POST` | `/api/suggestions/{id}/reject` | Rejeita a sugestão e registra auditoria |
| `GET` | `/api/suggestions/{id}/decisions` | Histórico de decisões humanas sobre a sugestão |
| `GET` | `/api/suggestions/{id}/validations` | Laudos de validação técnica do Python sobre a sugestão |
| `POST` | `/api/demo/seed` | Popula cenário completo para demonstração no SIC 2026 |
| `POST` | `/api/demo/reset` | Limpa os dados da sessão atual |
| `GET` | `/api/history` | Histórico cronológico de ações do usuário |
| `GET` | `/api/health` | Verificação de saúde do servidor |
