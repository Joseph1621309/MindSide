# Guia de Banco de Dados, Persistência e Execução Local (Windows) — MINDSIDE

Este documento detalha a arquitetura de persistência do **MindSide**, a revisão técnica do esquema proposto em `Banco de dados.docx`, o modelo relacional final integrado via SQLAlchemy e os comandos exatos para configuração, inicialização, migração e verificação no Windows (PowerShell).

---

## 1. Qual banco foi escolhido e por quê

- **Banco padrão local:** **SQLite 3** (`backend/mindside.db`), gerenciado pelo ORM **SQLAlchemy 2.0**.
- **Suporte opcional para produção/containers:** **PostgreSQL 16** via driver `psycopg` v3 (`docker-compose.yml`).
- **Justificativa técnica:**
  1. **Zero dependências externas para a banca do SIC:** O SQLite faz parte da biblioteca padrão do Python, grava em arquivo único (`mindside.db`), sobrevive a reinicializações do servidor e dispensa instalação de serviços pesados (MySQL/PostgreSQL/Docker) na máquina da apresentação.
  2. **Integridade referencial ativada:** O arquivo `backend/database.py` ativa explicitamente `PRAGMA foreign_keys=ON` em cada conexão SQLite, garantindo que todas as chaves estrangeiras (`ON DELETE CASCADE` e `ON DELETE SET NULL`) e constraints `CHECK` funcionem com o mesmo rigor de um SGBD cliente-servidor.
  3. **Evolução automática (`ensure_schema_migrations`):** Ao iniciar a aplicação, o sistema cria novas tabelas via `Base.metadata.create_all(bind=engine)` e inspeciona as tabelas preexistentes adicionando colunas novas sem apagar dados já salvos.

---

## 2. Revisão Técnica do `Banco de dados.docx` e Como Foi Integrado

O documento `Banco de dados.docx` elaborado pela equipe propôs 13 tabelas cobrindo todo o domínio do MindSide. A análise técnica identificou erros sintáticos e de integridade no SQL bruto original que impediriam sua execução direta:

| Problema no SQL original (`Banco de dados.docx`) | Correção aplicada em `backend/models.py` e `backend/schema_mindside.sql` |
|---|---|
| `tb_categoria` não possuía `id_categoria PRIMARY KEY`, mas era referenciada por `tb_compromissos`, `tb_tarefas` e `tb_sugestoes_itens`. | Criada tabela `categories` com `id INTEGER PRIMARY KEY` e vínculo `category_id` nas tabelas dependentes. |
| Colunas `NOT NULL` combinadas com `ON DELETE SET NULL` em todas as FKs (incompatível: o SGBD falha ao tentar atribuir `NULL` a uma coluna `NOT NULL`). | `user_id` (obrigatório) usa `ON DELETE CASCADE`; vínculos opcionais (`category_id`, `goal_id`, `analysis_id`) são `NULLABLE` e usam `ON DELETE SET NULL`. |
| Erros de digitação SQL: `craete table tb_sugestao_ia`, `create tb_validacoes_ia` (sem `TABLE`), `not_null` (com underscore), `ot null`, vírgulas após `CONSTRAINT fk_usuario_id,`, aspas simples não abertas em `'finalizado'` e `'agenda'`, parêntese final ausente em `tb_analise_ia`. | Todos os comandos DDL foram corrigidos, testados automaticamente no `pytest` (`test_sql_schema_file_executes_cleanly_in_sqlite`) e integrados ao ORM. |

### Entidades Finais do Banco (13 Tabelas)

1. `users` (`tb_usuario`): Usuários e sessões de visitante isoladas (`password_hash` sempre com bcrypt).
2. `categories` (`tb_categoria`): Categorias padrão e personalizadas por usuário (`Estudo`, `Trabalho`, `Saude`, `Lazer`, `Pessoal`, `Outros`).
3. `available_slots` (`tb_horarios_disponiveis`): Janelas de horários livres por dia da semana.
4. `goals` (`tb_objetivos`): Objetivos pessoais com `CheckConstraint` de progresso (`0 <= progress <= 100`).
5. `tasks` (`tb_tarefas`): Tarefas com prioridade, prazo, agendamento opcional, `category_id` e vínculo `goal_id` (atualiza automaticamente o progresso do objetivo ao concluir tarefas).
6. `appointments` (`tb_compromissos`): Compromissos com data, início, fim, status e verificação de conflito.
7. `user_files` (`tb_arquivos`): Metadados de arquivos (sem armazenar binários pesados no banco).
8. `ai_analyses` (`tb_analise_ia`): Registro de cada solicitação enviada à camada de IA/interpretador.
9. `analysis_file_links` (`tb_arquivos_analise`): Relacionamento N:N entre análises e arquivos.
10. `suggestions` (`tb_sugestao_ia` + `tb_sugestoes_itens`): Propostas geradas pela IA aguardando decisão humana.
11. `suggestion_validations` (`tb_validacoes_ia`): Auditoria técnica do Python (`formato_valido`, `campos_validos`, `possui_conflito`, `dentro_disponibilidade`).
12. `suggestion_decisions` (`tb_descricao_sugestao`): Histórico de decisões do usuário (`Aprovar`, `Editar`, `Rejeitar`, `Nova_sugestao`).
13. `history`: Log cronológico de ações do usuário.

---

## 3. O que precisa ser instalado

- **Sistema Operacional:** Windows 10 ou Windows 11.
- **Python:** 3.12 ou 3.13 (ambiente virtual `.venv313` já preparado em `backend\.venv313`).
- **Node.js (opcional):** apenas para verificação de sintaxe JavaScript (`node --check`).
- **Docker Desktop (opcional):** apenas se desejar testar com PostgreSQL via `docker compose`.

---

## 4. Como configurar as variáveis de ambiente

No PowerShell, a partir da pasta raiz `mindside_sem_login`:

```powershell
if (-not (Test-Path .\backend\.env)) { Copy-Item .\.env.example .\backend\.env }
```

Edite `backend\.env` conforme necessário (nunca exponha chaves reais em commits ou relatórios):

```dotenv
DATABASE_URL=sqlite:///./mindside.db
SECRET_KEY=troque-por-uma-chave-secreta-local-longa
AI_PROVIDER=gemini
AI_API_KEY=
GEMINI_API_KEY=SUA_CHAVE_AQUI_OU_VAZIO_PARA_FALLBACK
GEMINI_MODEL=gemini-3.5-flash-lite
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

> **Nota:** Se `AI_PROVIDER=none` ou se `GEMINI_API_KEY` estiver ausente/indisponível, o MindSide utiliza automaticamente o interpretador contextual local em Python (que também extrai múltiplas tarefas e compromissos).

---

## 5. Como criar, inicializar e migrar o banco

A criação das 13 tabelas e a migração de colunas novas ocorrem automaticamente na inicialização do `main.py`. Para executar manualmente a inicialização e verificar todas as tabelas no PowerShell:

```powershell
Set-Location .\backend
.\.venv313\Scripts\python.exe -c "import main, sqlite3; conn=sqlite3.connect('mindside.db'); print([r[0] for r in conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()])"
```

---

## 6. Como iniciar o Backend e o Frontend

Abra **dois terminais PowerShell** na raiz `mindside_sem_login`:

**Terminal 1 — Backend (FastAPI na porta 8000):**
```powershell
Set-Location .\backend
.\.venv313\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend (Servidor HTTP na porta 5500):**
```powershell
Set-Location .\frontend
py -3.13 -m http.server 5500 --bind 127.0.0.1
```

Acesse no navegador: **`http://localhost:5500/dashboard.html`** (ou `http://localhost:5500/`).

---

## 7. Como verificar se os dados estão sendo salvos

1. No Dashboard, clique em **⚡ Carregar Cenário SIC** ou crie uma tarefa em `Tarefas`.
2. Pare o servidor Uvicorn (`Ctrl + C`) e inicie novamente.
3. Recarregue a página (`F5`): os dados permanecem salvos no arquivo `backend\mindside.db` e vinculados ao token da sua sessão no navegador.

---

## 8. Como resolver os erros mais comuns

- **Erro de conexão com o servidor no Frontend:** Verifique se o Terminal 1 (`uvicorn`) está rodando em `http://127.0.0.1:8000` e se você abriu o frontend via `http://localhost:5500` (não abra o arquivo `.html` diretamente com `file://`, pois o navegador bloqueia CORS).
- **Porta 8000 ou 5500 ocupada:** Feche instâncias anteriores ou verifique processos com `Get-NetTCPConnection -LocalPort 8000`.
- **Chave Gemini sem cota ou sem internet:** O sistema registra um aviso seguro no log e aciona o fallback local sem interromper a demonstração.

---

## 9. Como reiniciar o ambiente sem perder dados vs. criar banco de teste isolado

- **Reiniciar mantendo dados:** Basta parar (`Ctrl+C`) e iniciar novamente o Uvicorn; o arquivo `backend\mindside.db` preserva todos os registros.
- **Executar testes em banco 100% isolado:** O arquivo `backend\tests\conftest.py` cria automaticamente um arquivo SQLite temporário exclusivo em `%TEMP%\mindside-test-<uuid>.db` a cada execução do `pytest`, nunca alterando `backend\mindside.db`:
  ```powershell
  Set-Location .\backend
  .\.venv313\Scripts\python.exe -m pytest -v
  ```

