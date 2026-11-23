# Preparação Completa para a Banca — Samsung Innovation Campus (SIC 2026)
**Projeto:** MindSide — Secretário Digital Inteligente para Gerenciamento Pessoal sob Contexto  
**Equipe:** Luiz Victor Almeida · Miguel Davi Graciano de Souza · José Martins Campos de Oliveira · Roberto Gusmão Suares Nascimento  
**Orientador:** Prof. Tércio Borges Ribeiro — Escola SENAI "Anchieta" (Vila Mariana, SP)

---

## 1. Matriz de Avaliação Oficial do SIC (10 Critérios)

> **Nota de transparência:** A matriz abaixo utiliza exclusivamente fatos verificáveis no código, nos testes automatizados e na documentação do projeto. Pesquisas de campo com usuários externos e métricas de impacto longitudinal estão claramente sinalizadas como **pendentes de coleta até 28/11/2026**.

| # | Critério SIC | O que a banca precisa enxergar | O que o projeto já comprova | O que ainda falta (evidência externa) | Melhoria de maior impacto implementada | Como verificar ao vivo | Evidência apresentável na banca |
|---|---|---|---|---|---|---|---|
| **1** | **Criatividade e originalidade** | Uma abordagem autoral para organização pessoal, não apenas um CRUD ou chat genérico. | Arquitetura *Human-in-the-Loop* com identidade visual HUD por área temática, mascote interativo em pixel art CSS e coleção de 6 stickers SVG originais. | — | Extração multi-demanda em linguagem natural + painel visual de validação técnica do Python em cada sugestão. | Abrir `assistente.html`, clicar no chip de exemplo SIC e observar as 3 propostas geradas com selo de validação. | Demonstração ao vivo da interface temática + cards de validação técnica. |
| **2** | **Diferenciação em relação a soluções conhecidas** | Por que não usar apenas Google Calendar, Notion ou ChatGPT puro? | Agendas comuns exigem preenchimento manual; chats de IA comuns não validam conflitos reais no banco nem garantem controle transacional. O MindSide une interpretação em linguagem natural + validação determinística em Python + aprovação explícita. | — | Botão **"↻ Sugerir outro horário"** que recalcula em Python o próximo slot livre quando há conflito na agenda. | Provocar ou carregar conflito no Assistente e clicar em "Sugerir outro horário". | Comparativo direto no pitch + fluxo de bloqueio de conflito (HTTP 409). |
| **3** | **Impacto de interesse público** | Como o projeto ataca a sobrecarga cognitiva e aceleração social (Hartmut Rosa / John Sweller) em jovens. | Fundamentação teórica sólida no Pré-Projeto + sistema que transforma um desabafo desestruturado ("tenho prova, trabalho e treino") em rotina organizada sem exigir preenchimento de múltiplos formulários. | Aplicação de teste de usabilidade com 10–15 estudantes reais para medir percepção de redução de esforço mental (pendente). | Fluxo de captura rápida multi-item no Assistente e vínculo direto entre Tarefas e Objetivos. | Digitar uma frase com 3 atividades e aprová-las em segundos. | Fundamentação teórica + protocolo de teste com usuários (Seção 4 deste documento). |
| **4** | **Relevância para demandas reais do mercado** | Aderência à tendência de *AI Agents* seguros (*Guardrails* e *Human-in-the-Loop*). | O mercado corporativo e pessoal rejeita IAs que alteram bancos de dados às cegas. O MindSide implementa uma camada de validação (`validation_service.py` + `SuggestionValidation`) antes de qualquer escrita. | — | Persistência de auditoria completa (`ai_analyses`, `suggestion_validations`, `suggestion_decisions`). | Mostrar no Assistente e no Histórico que nenhuma sugestão vira tarefa sem clique humano em "Aprovar". | Tabelas de auditoria e testes de segurança/validação (`30 passed`). |
| **5** | **Desempenho da solução desenvolvida** | Resposta rápida, ausência de travamentos na demonstração e resiliência a falhas de rede/API. | API FastAPI assíncrona, banco local SQLite com índices compostos, tempo de execução de 30 testes em ~7,3s e fallback local instantâneo caso a API Gemini oscile. | Medição formal de tempo médio de tarefa com usuários (pendente). | Botão **"⚡ Carregar Cenário SIC"** e fallback multi-cláusula que garante funcionamento mesmo sem internet no auditório. | Executar `pytest -v` e navegar entre Dashboard, Assistente e Agenda sem latência perceptível. | Terminal mostrando `30 passed` + resposta imediata da aplicação. |
| **6** | **Adequação das ferramentas e soluções utilizadas** | Escolha coerente da stack (Python, FastAPI, SQLAlchemy, Pydantic, Google GenAI SDK, HTML/CSS/JS puro). | Python atua exatamente como especificado nos requisitos: controla dados, validação, conflitos e persistência; SDK oficial `google-genai` com JSON estruturado; frontend leve sem dependências desnecessárias. | — | Esquema relacional de 13 tabelas com `PRAGMA foreign_keys=ON`, `CheckConstraint` e migração automática. | Mostrar `backend/models.py`, `backend/services/ai_service.py` e `/docs` (Swagger UI). | Arquitetura em camadas + documentação Swagger em `http://localhost:8000/docs`. |
| **7** | **Valor social e econômico para a comunidade** | Potencial de ajudar jovens estudantes/trabalhadores (15–30 anos) a evitar perda de prazos e abandono de metas. | Acesso imediato sem barreira de login (modo visitante isolado), gratuito localmente e capaz de funcionar até mesmo offline via interpretador de regras. | Coleta de depoimentos de colegas da Escola SENAI Anchieta após uso piloto (pendente). | Vínculo automático entre Tarefas e Objetivos (concluir tarefas atualiza a barra de progresso da meta). | Concluir uma tarefa vinculada ao objetivo SIC e mostrar a barra subindo automaticamente. | Demonstração do vínculo Tarefa → Objetivo. |
| **8** | **Aderência ao tema principal e critérios dos organizadores** | Uso ético, responsável e técnico de Inteligência Artificial e programação em Python (C&P + IA). | Separação rigorosa entre IA (interpretação) e Python (regras de negócio, validação e persistência), privacidade por minimização de dados e logs higienizados. | — | Registro explícito de cada etapa do fluxo exigido no Documento de Requisitos (`B8`). | Mostrar o fluxo completo da seção B8 do Documento de Requisitos funcionando na tela. | Rastreabilidade 1:1 entre `Documento_de_Requisitos_MindSide.docx` e código. |
| **9** | **Clareza da apresentação escrita e oral** | Documentação técnica clara, instruções reproduzíveis e demonstração objetiva sem improviso. | `README.md` atualizado, `GUIA_BANCO_DE_DADOS_E_EXECUCAO.md`, `schema_mindside.sql` e este roteiro de demonstração de 4 minutos. | Ensaio cronometrado da equipe com slides finais (pendente). | Roteiro passo a passo de 4 minutos + chips de prompt prontos na tela do Assistente para evitar erros de digitação ao vivo. | Seguir a Seção 2 deste documento. | Documentação completa na pasta `documentação/`. |
| **10** | **Distribuição de funções, colaboração e comunicação** | Integração real entre a modelagem de banco, o backend Python, a IA e o frontend. | A proposta de banco do grupo (`Banco de dados.docx`) foi revisada, corrigida e integrada diretamente aos modelos SQLAlchemy e às telas da aplicação. | Confirmação final da fala de cada integrante no dia da banca. | Unificação entre o modelo de banco de dados do grupo, as regras do pré-projeto e a aplicação executável. | Mostrar `backend/schema_mindside.sql` e `backend/models.py` operando juntos. | Divisão sugerida de apresentação para os 4 integrantes (Seção 5). |

---

## 2. Roteiro de Demonstração ao Vivo (3 a 5 minutos)

### Preparação antes de entrar na banca (1 minuto antes)
1. Garanta que o backend (`uvicorn` na porta `8000`) e o frontend (`http.server` na porta `5500`) estejam abertos.
2. Abra `http://localhost:5500/dashboard.html` no navegador.

### Passo 1 — Proposta de Valor e Carga Contextual (0:00 – 0:50)
- **O que dizer:** *"Jovens entre 15 e 30 anos lidam com estudos, trabalho e saúde ao mesmo tempo. Agendas tradicionais exigem trabalho manual para organizar cada item, enquanto IAs comuns não conhecem seus conflitos reais ou alteram coisas sem permissão. O MindSide resolve isso colocando o Python como guardião entre a IA e a sua rotina."*
- **Ação na tela:** No **Dashboard**, clique no botão **⚡ Carregar Cenário SIC**.
- **O que mostrar:** Os contadores de Tarefas, Compromissos, Objetivos e Janelas de Disponibilidade são preenchidos instantaneamente no banco SQLite.

### Passo 2 — Interpretação de Linguagem Natural Multi-Demanda (0:50 – 2:00)
- **Ação na tela:** Clique em **🤖 Abrir Assistente** (`assistente.html`).
- **O que mostrar:** Aponte para as 2 sugestões que já estavam pendentes (inclusive uma com **⚠️ Alerta de Conflito** com a *Aula de Cálculo e Álgebra* das 18:00 às 19:30).
- **Ação na tela:** Clique no primeiro chip de exemplo rápido (**"📚 Cenário 3 demandas (Prova + Trabalho + Treino)"**) e clique em **Analisar rotina**.
- **O que dizer:** *"Vejam que escrevemos uma única frase com três demandas diferentes — exatamente o caso de uso do nosso Documento de Requisitos. A camada de IA interpreta o texto, mas o Python valida cada campo, verifica nossa disponibilidade e cria três propostas separadas como `pending`. Nada foi alterado na agenda ainda."*

### Passo 3 — Resolução de Conflitos, Edição e Aprovação Humana (2:00 – 3:15)
- **Ação na tela:** No card que apresenta conflito de horário (`⚠️ Conflita com: Aula de Cálculo e Álgebra`), tente clicar em **✓ Aprovar** (o backend bloqueia com HTTP 409) ou clique diretamente em **↻ Sugerir outro horário**.
- **O que mostrar:** O Python calcula automaticamente o próximo horário livre na agenda do usuário, remove o conflito e atualiza o selo para **🛡️ Novo encaixe livre calculado pelo Python**.
- **Ação na tela:** Clique em **✓ Aprovar** nessa sugestão e em **✕ Rejeitar** em outra.
- **O que dizer:** *"O controle humano é absoluto: o usuário aprova, edita, pede um novo encaixe ou rejeita."*

### Passo 4 — Integração Tarefas ↔ Objetivos, Agenda e Auditoria (3:15 – 4:15)
- **Ação na tela:** Vá em **Agenda** (`agenda.html`) e mostre os compromissos em azul, as tarefas agendadas em amarelo e as janelas de disponibilidade em verde tracejado.
- **Ação na tela:** Vá em **Tarefas** (`tarefas.html`), clique no botão **✓** para concluir a tarefa *"Ensaiar demonstração de 4 minutos para a banca SIC"* e depois clique em **Objetivos** (`objetivos.html`).
- **O que mostrar:** O objetivo *"Apresentação Final — Samsung Innovation Campus 2026"* subiu automaticamente para **100% concluído**!
- **Fechamento:** Vá em **Histórico** (`historico.html`) para mostrar que todas as decisões e aprovações ficaram auditadas no banco de dados.

---

## 3. Perguntas Técnicas Prováveis da Banca e Respostas Fundamentadas

1. **"Se a API da Gemini cair ou a internet do auditório falhar durante a apresentação, o sistema para?"**
   - **Resposta:** Não. Em `backend/services/ai_service.py`, implementamos tratamento específico para timeouts, falta de chave, erro de rede e limites de cota (HTTP 429/503/504). Se o provedor externo falhar, o sistema faz *fallback* transparente para nosso interpretador local baseado em regras e expressões regulares (`_rule_based_interpret`), que também divide frases compostas e extrai datas, horários, prioridades e categorias.

2. **"Como vocês garantem que a IA não vai alucinar um dado inválido ou apagar compromissos do usuário?"**
   - **Resposta:** A camada de IA (`ai_service.py`) não tem acesso à sessão do banco de dados (`db`). Ela apenas retorna um dicionário Python. Esse retorno passa por `validation_service.py` (que valida tipos, formatos `AAAA-MM-DD`, `HH:MM`, durações e categorias) e por `conflict_service.py` (que checa sobreposições reais no SQLite/PostgreSQL). Além disso, a rota `/api/ai/analyze` grava apenas na tabela `suggestions` com `status="pending"` e registra o laudo em `suggestion_validations`. A criação real em `tasks` ou `appointments` só ocorre quando o usuário chama `POST /api/suggestions/{id}/approve`.

3. **"Como funciona o banco de dados de vocês? Vocês usaram o modelo relacional projetado pelo grupo?"**
   - **Resposta:** Sim. Revisamos o esquema de 13 tabelas projetado pela equipe (`Banco de dados.docx`), corrigimos as restrições de chaves estrangeiras (`ON DELETE CASCADE` para vínculo de usuário e `ON DELETE SET NULL` para vínculos opcionais), ativamos `PRAGMA foreign_keys=ON` no SQLite e integramos todas as entidades (`users`, `categories`, `available_slots`, `goals`, `tasks`, `appointments`, `user_files`, `ai_analyses`, `analysis_file_links`, `suggestions`, `suggestion_validations`, `suggestion_decisions` e `history`) no SQLAlchemy (`backend/models.py`) e em `backend/schema_mindside.sql`.

4. **"Como vocês protegem a privacidade do usuário ao usar uma IA em nuvem?"**
   - **Resposta:** Aplicamos o princípio de minimização de dados (Requisito Não Funcional C2): enviamos à Gemini exclusivamente a frase digitada no Assistente, sem enviar histórico completo, e-mail, nome ou lista de tarefas do banco. A verificação de conflitos de agenda é feita 100% localmente pelo Python. Além disso, os logs de erro higienizam qualquer mensagem bruta do provedor (comprovado por testes automatizados em `test_ai_service.py`).

---

## 4. Evidências que a Equipe Ainda Precisa Coletar até 28/11/2026

Para fortalecer ainda mais os critérios **3 (Impacto de interesse público)** e **7 (Valor social e econômico)** sem inventar dados:

1. **Teste piloto com 10 a 15 colegas/estudantes (15–30 anos):**
   - Peça para cada participante usar o botão **⚡ Carregar Cenário SIC** e organizar uma semana de estudos usando o Assistente.
   - Aplique um formulário curto (Google Forms de 4 perguntas, escala de 1 a 5):
     1. *Quão fácil foi transformar um texto livre em tarefas e compromissos?*
     2. *O alerta de conflitos de horário ajudou a evitar sobreposições?*
     3. *Você sentiu que manteve o controle final sobre sua agenda?*
     4. *Comparado a anotar manualmente, o sistema reduziu seu esforço mental de organização?*
2. **Screenshots e gravação de backup (1 minuto):**
   - Grave um vídeo curto da tela executando o Roteiro da Seção 2 como contingência para o slide da banca.

---

## 5. Sugestão de Divisão de Apresentação entre os 4 Integrantes

*(Ajustem conforme a preferência real de cada integrante do grupo)*

1. **Integrante 1 — Problema, Fundamentação Teórica e Proposta de Valor ( ~1 min ):**
   - Apresenta o contexto de aceleração social (Hartmut Rosa) e sobrecarga cognitiva (John Sweller) em jovens de 15 a 30 anos e por que o MindSide propõe uma IA sob controle humano.
2. **Integrante 2 — Arquitetura, Banco de Dados e Papel do Python ( ~1 min ):**
   - Explica o fluxo `Usuário → Python → IA → Validação Python → Banco Relacional (13 tabelas) → Decisão Humana` e como a validação técnica impede alucinações e conflitos.
3. **Integrante 3 — Demonstração Ao Vivo do Produto ( ~2 min ):**
   - Executa o roteiro ao vivo: Dashboard (Cenário SIC) → Assistente (análise de 3 demandas + resolução de conflito + aprovação) → Tarefas/Objetivos (progresso subindo para 100%).
4. **Integrante 4 — Testes, Segurança, Diferenciais SIC e Conclusão ( ~1 min ):**
   - Destaca os 30 testes automatizados aprovados, privacidade por minimização de dados, resiliência com fallback local e visão de evolução futura (como protocolos experimentais de IoT sob autorização).

