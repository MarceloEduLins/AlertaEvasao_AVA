# Relatório técnico — Alerta Evasão v6

## 1. Problema e recorte

Sinais de afastamento de estudantes no AVA costumam ser percebidos tarde. O recorte desta versão é uma **tarefa central**: para uma turma e duas semanas completas, transformar eventos do AVA em uma **sugestão de apoio explicável** que um responsável revisa antes de qualquer contato.

- **Entrada:** eventos do AVA (id, aluno pseudonimizado, disciplina, data, tipo, atividade), log diário da coleta, atividades previstas.
- **Saída:** estado por aluno e disciplina (`sem_sinal`, `revisar`, `incompleto`) com período, motivos, qualidade da coleta e pendências; sugestão na fila de revisão; decisão registrada.
- **Critério de conclusão (Dado / Quando / Então):**
  - *Dado* um aluno com histórico conhecido e coleta completa nas duas semanas,
  - *quando* a atividade cai para 50% ou menos (base ≥ 5) ou existe atividade vencida sem entrega,
  - *então* surge uma sugestão com período e motivos, que só muda de estado quando um responsável aceita, ajusta ou descarta;
  - *e quando* o histórico ou a coleta são desconhecidos, *então* o estado é "dados incompletos" e nenhuma sugestão de AVA é criada.

## 2. Método

- **Dados:** turma sintética (30 alunos, 6 disciplinas, 72 atividades), eventos gerados de forma determinística a partir de hábitos de estudo por perfil, com duas falhas de coleta configuradas e 3% de reexportação duplicada.
- **Testes automatizados:** `node --test` em pasta temporária. Matriz de cenários da Aula 09 (normal, fronteira, inválido, sequência) mapeada em `docs/evidencias.csv` (T01–T21).
- **Regressão:** `npm run check:all` (testes, consistência da base e integração Python).

## 3. Resultados (execução registrada no commit indicado em `evidencias.csv`)

| Verificação | Resultado |
|---|---|
| `npm test` | 33 de 33 testes aprovados |
| `npm run check:data` | base válida: 30 alunos, 6 disciplinas, 180 matrículas, 15 RAs, 72 atividades |
| `npm run check:ai` | K-Means com 5 grupos para 30 alunos e projeção PCA válida (silhouette ≈ 0,48 neste ambiente) |
| Semestre avançado semana a semana | ~19,4 mil eventos recebidos, ~600 duplicados ignorados; ~340 sugestões geradas, todas aguardando revisão e nenhuma enviada |

Comportamentos observados na demonstração (base restaurada, data 18/05/2026):

- Ana Ribeiro: de 7–9 eventos por disciplina (04/05–10/05) para 0 (11/05–17/05) → "queda de atividade" em 5 disciplinas; "Descoberta da Computação" fica "dados incompletos" porque a turma inteira não teve eventos na semana anterior.
- Semanas 23/03–29/03: coleta com 5 de 7 dias → todas as análises que dependem dela ficam "dados incompletos".

Esses números descrevem **dados fictícios** e não medem a capacidade de prever evasão real.

## 4. Validação com usuários (Aula 10) — pendente

As sessões de observação **ainda não foram realizadas**; nada nesta seção é resultado. Protocolo sugerido:

| Item | Definição |
|---|---|
| Tarefa | Examinar uma sugestão de apoio, conferir seus motivos e registrar uma decisão |
| Cenários | Duas semanas com histórico completo (Ana, 18/05) e um com coleta incompleta (qualquer aluno, 30/03) |
| Resultado esperado | Decisão registrada; o participante diz de onde vêm os números e distingue baixa atividade de dado ausente |
| Limite de tempo | 5 minutos por cenário |
| Evidência | Decisão consultável em "Decididas"; anotação do caminho percorrido, dúvidas e ajudas |
| Participante | Colega de outra equipe (oficina); depois, se possível, um tutor |

Registro por sessão: participante (sem nome), cenário, tempo, ajudas dadas, dúvidas, estado final, achado. Com uma única sessão, apresentar a contagem e evitar generalizações.

## 5. Limitações conhecidas

| Limitação | Impacto | Responsável | Próximo passo |
|---|---|---|---|
| Dados sintéticos | Não indica desempenho real | Equipe | Exportação autorizada e pseudonimizada |
| Corte de 50% e base mínima 5 são didáticos | Falsos sinais ou sinais perdidos | Equipe + docente | Calibrar com decisões aceitas/descartadas |
| Sem envio nem registro de resultado do contato | Não mede se o apoio ajudou | Marcelo | Registrar desfecho após a decisão |
| JSON local, um processo | Sem garantia entre processos | Equipe | Banco com transação |
| Falhas de coleta configuradas manualmente | Não cobre todos os tipos de falha | Miguel | Conferir com a equipe do AVA |
| Fila grande se o semestre inteiro for simulado | Revisão cansativa | Equipe | Priorização e agrupamento por aluno |

## 6. Backlog

Ver `docs/roadmap.md`.
