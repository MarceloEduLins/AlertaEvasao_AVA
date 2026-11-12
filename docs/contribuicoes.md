# Contribuições

Divisão definida pelo professor nas Aulas 08–11 (equipe 08). Cada integrante apresenta a própria parte.

| Integrante | Responsabilidade | Onde está no código | Evidência |
|---|---|---|---|
| Miguel Rezende | Agregados do AVA: eventos únicos por aluno, disciplina e semana; rastreio aos eventos de origem; completude da coleta | `src/services/ava-rules.js` (`validateEvent`, `aggregateWeekly`, `collectionQuality`), `src/services/ava.service.js` (`listSourceEvents`, `importEvents`, `getClassOverview`) | T01–T05, T12–T15, T19 |
| Marcelo Lins | Sugestão de apoio revisável: pendências por prazo, motivos, ausência de histórico; registro da revisão humana sem contato automático | `src/services/ava-rules.js` (`pendingFromDeadlines`, `suggest`), `src/services/ava.service.js` (`getStudentWeekly`), `src/services/notification.service.js`, rota `POST /api/notifications/:id/review` | T06–T11, T16–T18, T20 |

Integração entre as partes: o agregado de Miguel (`{ eventos, diasAtivos, entregas }` ou `null` quando desconhecido) é a entrada de `suggest()` de Marcelo. O contrato está em `docs/contrato_dados.md`, seções 2 a 5.

> Ajuste esta tabela se a divisão real do trabalho tiver sido diferente.
