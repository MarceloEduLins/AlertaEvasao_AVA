# Contrato de dados — v6

Regra geral: **ausência de dado nunca é convertida em zero**. Campo obrigatório ausente é erro de contrato e a linha é rejeitada com motivo.

## 1. Evento do AVA (entrada)

Origem: exportação diária (simulada) ou importação CSV (`POST /api/ava/events/import`, exemplo em `dados_demo/eventos_ava_demo.csv`).

| Campo | Significado | Tipo e domínio | Ausente ou inválido |
|---|---|---|---|
| `id` | Identificador único do evento no AVA | texto não vazio | linha rejeitada: "id ausente" |
| `aluno` | **Pseudônimo** do estudante (nunca nome, e-mail ou matrícula) | texto `ps-xxxxxx` existente na base | rejeitada: "aluno desconhecido" |
| `disciplina` | Código da disciplina | `alg`, `exp`, `fil`, `dec`, `mod`, `lea` | rejeitada: "disciplina desconhecida" |
| `data` | Dia do evento | `AAAA-MM-DD` (aceita data-hora ISO; usa os 10 primeiros caracteres). Datas impossíveis (31/02) são rejeitadas | rejeitada: "data inválida" |
| `tipo` | Natureza do evento | `acesso`, `material`, `forum`, `entrega` | rejeitada: "tipo inválido" |
| `atividade` | Atividade prevista entregue | obrigatório só quando `tipo = entrega`; deve existir em `activities` | rejeitada: "entrega sem atividade" / "atividade desconhecida" |

**Duplicidade.** O mesmo `id` recebido mais de uma vez é guardado como chegou (para auditoria) e **contado uma vez** na agregação. Na importação, um `id` já existente é ignorado e listado como duplicado.

**Limites.** Até 5000 linhas e 2 MB por importação. CSV com `,` ou `;`; cabeçalho obrigatório com `id, aluno, disciplina, data, tipo`.

## 2. Agregado semanal (saída de `aggregateWeekly`)

Uma linha por **aluno × disciplina × semana**. Semana = segunda a domingo, identificada pela data da segunda-feira.

| Campo | Significado | Unidade |
|---|---|---|
| `eventos` | Eventos válidos e únicos na semana | contagem |
| `diasAtivos` | Dias distintos com ao menos um evento | dias (0–7) |
| `entregas` | Eventos do tipo `entrega` | contagem |
| `eventIds` | IDs que formam o agregado (rastreabilidade) | lista |

Dois eventos no mesmo dia = 2 eventos e 1 dia ativo.

## 3. Quando uma semana é "conhecida"

Os indicadores de uma semana são `null` (desconhecidos) quando qualquer item abaixo falha. Nesse caso a sugestão fica em estado **`incompleto`** com ação "conferir dados", e o motivo é exibido.

| Verificação | Fonte | Motivo exibido |
|---|---|---|
| Semana dentro do semestre | `simulation.startDate` | semana anterior ao início do semestre |
| Aluno já tinha histórico no AVA | `students[].avaHistoryFrom` | histórico do AVA disponível somente a partir de dd/mm/aaaa |
| Coleta da semana completa (7 de 7 dias com status `ok`) | `simulation.collectionLog` | coleta incompleta na semana de dd/mm/aaaa (n de 7 dias) |
| A turma tem eventos naquela disciplina | soma dos agregados | nenhum evento da turma nesta disciplina na semana de dd/mm/aaaa: conferir a coleta |

Com a semana conhecida e o aluno sem eventos, o valor é **zero registrado** (`eventos: 0`).

## 4. Pendências por prazo

`activities[]`: `{ id, subjectId, title, dueDate }` (72 atividades na base).

Pendente na data de referência (fim da semana analisada) = prazo já passou, nenhuma entrega até essa data, e o prazo venceu há **no máximo 21 dias** (depois disso a atividade é considerada encerrada). Entrega após o prazo encerra a pendência e conta como "atrasada". Sem histórico do aluno, as pendências também são desconhecidas (`null`).

## 5. Sugestão (saída de `suggest`)

| Entrada | Saída |
|---|---|
| `atual`, `anterior` ou `pendentes` desconhecido | `{ estado: "incompleto", motivos: [], acao: "conferir dados" }` |
| `anterior.eventos ≥ 5` **e** `atual.eventos ≤ 50% de anterior` | motivo "queda de atividade" |
| `pendentes > 0` | motivo "atividade pendente" |
| algum motivo | `estado: "revisar"`, `acao: "oferecer apoio"` |
| nenhum motivo | `estado: "sem_sinal"` |

Sempre `revisarAntesDeEnviar: true`. O corte de 50% e a base mínima de 5 eventos são **didáticos** e precisam de calibração com a equipe pedagógica.

## 6. Sugestão na fila e decisão humana

Sugestão (`notifications[]`): `id`, `studentId`, `simulatedDate`, `type`, `level` (`reminder` | `attention` | `critical`), `subject`, `body`, `evidence` (`periodo`, `coleta`, `motivos`, `disciplinas`), `status`.

`POST /api/notifications/:id/review`

| Campo | Regra | Erro |
|---|---|---|
| `decision` | `aceitar`, `ajustar` ou `descartar` | 400 "Decisão inválida" |
| `reviewer` | obrigatório, até 80 caracteres | 400 |
| `note` | até 500 caracteres; **obrigatório para descartar** | 400 "Informe o motivo do descarte" |
| `body` | obrigatório para ajustar e diferente do original | 400 |
| (sugestão já decidida) | decisão não é sobrescrita | 409 |

Estados: `pending_review` → `approved` (aceitar) | `adjusted` (ajustar, guarda `finalBody`) | `discarded`. A decisão registra `reviewer`, `note`, `decidedAt` (relógio real) e `simulatedDate`. **Nenhum estado envia mensagem.**

## 7. Outras entradas validadas

| Rota | Regra |
|---|---|
| `POST /api/simulation/advance` | `days` inteiro de 1 a 200 |
| `PATCH /api/students/:id/subjects/:subjectId` | `absences`, `classesHeld` inteiros ≥ 0; `lastAvaAccess` data válida e não posterior à data simulada; notas não podem ser alteradas |
| `GET /api/ava/events` | `studentId` e `week` (AAAA-MM-DD) obrigatórios |
| Corpo JSON malformado | 400 "Corpo da requisição não é um JSON válido" |
