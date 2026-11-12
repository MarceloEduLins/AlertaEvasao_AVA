# Alerta Evasão v6 — sugestões de apoio revisáveis a partir do AVA

Projeto Transformador I (PUCPR, 2026/2) · Equipe 08 · Miguel Rezende e Marcelo Lins

## 1. Objetivo, público e escopo desta versão

**Problema.** Sinais de afastamento de um estudante (queda de atividade no AVA, entregas vencidas, faltas, notas baixas) costumam ser percebidos tarde.

**Público.** Tutores, docentes e coordenação pedagógica que acompanham uma turma.

**O que esta versão faz (fluxo principal).**

1. Recebe eventos do AVA (exportação diária simulada ou CSV) com aluno **pseudonimizado**.
2. Agrega por **aluno × disciplina × semana (seg–dom)**, contando **cada ID uma única vez**.
3. Confere a **completude da coleta** e o **histórico do aluno**: dado ausente vira "dados incompletos", nunca zero.
4. Calcula **pendências por prazo** (atividades previstas × entregas), não pela soma dos logs.
5. Gera uma **sugestão de apoio** com período, motivos (queda ≥ 50% e/ou atividade pendente) e qualidade da coleta, junto com sinais de frequência e notas.
6. Um responsável **aceita, ajusta ou descarta** a sugestão. A decisão fica registrada e consultável. **O sistema não envia mensagens.**

**Fora do escopo:** integração real com AVA/sistema acadêmico, envio de e-mail, autenticação, predição de evasão.

> Um sinal de atividade **não comprova evasão**. Todos os alunos, notas, faltas e eventos são **fictícios**. O ensaio não mede capacidade de prever evasão real.

## 2. Pré-requisitos (versões usadas no desenvolvimento)

| Ferramenta | Versão testada | Para quê |
|---|---|---|
| Node.js | 22.x (mínimo 18) | servidor e testes |
| npm | 10.x | dependências (`express`) |
| Python | 3.10+ com NumPy e scikit-learn 1.x | somente a tela "Perfis (K-Means)" e `npm run check:ai` |

Sem Python o sistema funciona; apenas a tela de perfis mostra "IA indisponível".

## 3. Instalação (na raiz do repositório)

```bash
npm install
python -m pip install -r requirements.txt     # Windows: py -3 -m pip install -r requirements.txt
```

Não há valores secretos. `.env.example` mostra a única variável opcional (`PORT`, padrão 3000).

## 4. Preparar os dados, iniciar e acessar

```bash
npm run reset-data    # restaura o 1º dia do semestre (base + eventos do AVA)
npm start             # ou: npm run dev (recarrega ao salvar)
```

Abra **http://localhost:3000**. No Windows também dá para usar `INICIAR_WINDOWS.bat`.

A base de execução (`src/data/academic.json` e `src/data/ava-events.json`) não é versionada: ela é criada a partir dos arquivos `*.seed.json` na primeira execução e restaurada por `npm run reset-data`. Assim a segunda execução parte do mesmo estado da primeira.

## 5. Tarefa de exemplo e resultado esperado

1. Com a base restaurada, clique em **Avançar 1 semana** até a data **18/05/2026** (12 cliques) ou use a API: `POST /api/simulation/advance` com `{"days": 84}`.
2. Abra **Turma → Ana Ribeiro**. Esperado na **Atividade semanal no AVA**: semana de 04/05 com eventos em todas as disciplinas, semana de 11/05 com **0** (borda tracejada), semana de 23/03 com **hachura** (coleta incompleta) e "Descoberta da Computação" em 04/05 com hachura (turma inteira sem eventos).
3. Em **Sinal da semana**: "queda de atividade" em 5 disciplinas e "Dados incompletos" em Descoberta da Computação.
4. Clique numa semana da faixa: abre a lista de **eventos de origem** com IDs (duplicados aparecem riscados).
5. Abra **Revisão**, informe seu nome e clique em **Aceitar**, **Ajustar texto** ou **Descartar** (descartar exige motivo). Esperado: a sugestão vai para "Decididas" com nome, data e observação; uma segunda decisão na mesma sugestão é recusada.
6. Caso de erro: em **Coleta do AVA**, clique em **Usar arquivo de exemplo → Validar sem importar**. Esperado: 5 aceitos, 1 duplicado e 4 rejeitados com o motivo de cada linha (data 31/02, tipo "login", aluno e disciplina desconhecidos).

## 6. Verificações

```bash
npm test             # 33 testes: regras, matriz de cenários T01–T21, simulação e base
npm run check:data   # consistência da base (30 alunos, 6 disciplinas, 180 matrículas, 72 atividades)
npm run check:ai     # Node → Python → scikit-learn → K-Means + PCA
npm run check:all    # tudo acima
```

Os testes e o `check:ai` usam uma **pasta temporária** (`ALERTA_DATA_DIR`) e não alteram a demonstração em andamento.

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Cannot find module 'express'` | dependências não instaladas | `npm install` na raiz |
| "IA indisponível" em Perfis | Python sem scikit-learn | `python -m pip install -r requirements.txt` e `npm run check:ai`; ou defina `PYTHON_BIN` |
| Porta 3000 ocupada | outro processo | `PORT=3001 npm start` (PowerShell: `$env:PORT=3001; npm start`) |
| Resultados diferentes do roteiro | base já avançada | `npm run reset-data` |

## Estrutura

```text
public/                 interface (HTML, CSS, JS em módulos)
src/
  controllers/          validação de entrada e respostas HTTP
  routes/               rotas da API
  services/
    ava-rules.js        regras puras: agregação, deduplicação, coleta, pendências, sugestão
    ava.service.js      janela de análise, rastreabilidade e importação CSV
    simulation.service.js  calendário, eventos do AVA, notas, faltas e fila de sugestões
    notification.service.js  textos das sugestões e evidência anexada
    academic.service.js  frequência, RA, score de atenção
    clustering.service.js  ponte Node → Python
  repositories/         leitura/gravação atômica dos JSON
  data/                 *.seed.json (versionados) e estado de execução (gerado)
scripts/                reset, verificações e K-Means em Python
tests/                  testes automatizados (node --test)
dados_demo/             CSV de exemplo para importação
docs/                   arquitetura, contrato de dados, decisões, evidências, relatório, roteiro
```

## Endpoints principais

```text
GET  /api/simulation                         estado do calendário
POST /api/simulation/advance  {"days": 7}    avança (1 a 200 dias)
POST /api/simulation/next-event              avança até o próximo marco
POST /api/simulation/reset                   volta ao 1º dia

GET  /api/classes/:id/dashboard              alunos, score e médias
GET  /api/classes/:id/ava-overview           coleta por semana, dedup, estado semanal de cada aluno
GET  /api/students/:id/profile               disciplinas, frequência, RAs
GET  /api/students/:id/ava-weekly            agregados, pendências, sugestão e histórico semanal
GET  /api/ava/events?studentId&subjectId&week  eventos de origem (pseudonimizados)
POST /api/ava/events/import[?dryRun=1]       importação CSV com validação

GET  /api/notifications[?status=pending|decided&studentId=]
POST /api/notifications/:id/review           {decision, reviewer, note, body}
GET  /api/reviews                            decisões registradas
GET  /api/classes/:id/clusters               K-Means + PCA
```

Exemplos prontos em `api.http`. Documentação completa em [`docs/`](docs/): [arquitetura](docs/arquitetura.md), [contrato de dados](docs/contrato_dados.md), [decisões](docs/decisoes.md), [evidências](docs/evidencias.csv), [relatório](docs/relatorio.md), [roteiro da demonstração](docs/roteiro_demo.md), [contribuições](docs/contribuicoes.md).

A apresentação da AP1 continua em [`docs/apresentacao/AP1_Alerta_Evasao.pdf`](docs/apresentacao/AP1_Alerta_Evasao.pdf).
