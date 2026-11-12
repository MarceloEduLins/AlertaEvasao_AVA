# Arquitetura — v6

Tudo roda **localmente**: um processo Node.js (API + arquivos da interface) e, só para a tela de perfis, um processo Python chamado sob demanda. Não há serviço externo; o AVA real e o e-mail **não** estão integrados (ver "Simulado e planejado").

## Componentes e quem chama quem

```text
 Navegador (public/)                         interface: Início, Revisão, Turma, Aluno, Coleta do AVA...
      │  HTTP/JSON
      ▼
 API REST — server.js + routes/ + controllers/   valida entrada, devolve 400/404/409 com mensagem
      │
      ├── ava.service.js ──────► ava-rules.js     (funções puras, sem arquivo)
      │     janela de 2 semanas,       agregar + deduplicar por ID
      │     histórico do aluno,        completude da coleta
      │     rastreabilidade, CSV       pendências por prazo, sugerir()
      │
      ├── simulation.service.js   calendário, aulas/faltas, eventos do AVA, notas,
      │                           incidentes de coleta, fila de sugestões (pending_review)
      ├── notification.service.js textos das sugestões + evidência (período, coleta, motivos)
      ├── academic.service.js     frequência, RA, score de atenção
      └── clustering.service.js ──► scripts/cluster_students.py (K-Means + PCA, stdin/stdout JSON)
      │
      ▼
 academic.repository.js   leitura com cache somente leitura; gravação atômica (arquivo .tmp + rename)
      │
      ├── src/data/academic.json     turma, matrículas, atividades previstas, log da coleta, sugestões e decisões
      └── src/data/ava-events.json   eventos brutos do AVA (inclui duplicados recebidos)
          (ambos recriados a partir de *.seed.json)
```

## Fluxo principal: do evento à decisão

```text
evento AVA ──► validação ──► dedup por ID ──► agregado semanal ─┐
 (id, aluno pseudônimo,                      (eventos, dias      │
  disciplina, data, tipo)                     ativos, entregas)  │
                                                                  ▼
log diário da coleta ──► semana completa? ──► turma tem eventos? ──► histórico do aluno conhecido?
                                                                  │ não → estado "incompleto" (conferir dados)
atividades previstas + entregas ──► pendências por prazo ─────────┤
                                                                  ▼
                                               sugerir(atual, anterior, pendências)
                                                 → "sem_sinal" | "revisar" (+ motivos)
                                                                  │
               sinais de frequência/RA/inatividade ───────────────┤ anti-spam: impressão digital por sinal,
                                                                  ▼ resumo único, intervalo de 5 dias
                                         sugestão status=pending_review (com evidência)
                                                                  │
                                                  POST /notifications/:id/review
                                                                  ▼
                                   approved | adjusted | discarded  (nome, data, observação, texto final)
```

## Onde cada coisa acontece

| Responsabilidade | Local |
|---|---|
| Validação de evento (campos, data real, tipo, aluno/disciplina/atividade conhecidos) | `ava-rules.validateEvent` |
| Deduplicação e agregação semanal | `ava-rules.aggregateWeekly` |
| Completude da coleta | `ava-rules.collectionQuality` + `simulation.collectionLog` |
| Pendências por prazo | `ava-rules.pendingFromDeadlines` |
| Regra da sugestão (50%, base mínima 5) | `ava-rules.suggest` |
| Janela de 2 semanas completas, histórico, "turma sem logs" | `ava.service.weekIndicators` |
| Validação de entradas HTTP | `controllers/academic.controller.js` |
| Persistência | `repositories/academic.repository.js` |

## Simulado e planejado

| Item | Estado |
|---|---|
| Exportação diária do AVA | **Simulada** (eventos sintéticos determinísticos; 3% reexportados em duplicidade) |
| Falhas de coleta | **Simuladas**: exportação parada em 25–26/03; disciplina "Descoberta" sem eventos em 04–10/05 |
| Envio de mensagem | **Não existe**. A decisão humana é registrada; o contato é feito pelo responsável fora do sistema |
| Integração com AVA real, autenticação, banco de dados | **Planejado** |

## Concorrência

A verificação "esta sugestão já foi decidida?" e a gravação acontecem na mesma função **síncrona** (`saveReview`). Como o Node executa um callback por vez, duas requisições ao **mesmo processo** não se intercalam: a segunda recebe 409. Essa garantia **não vale** com mais de um processo ou servidor usando os mesmos arquivos JSON; nesse caso seria preciso um banco com transação. Os testes cobrem a repetição sequencial (T20); tentativas simultâneas **não foram testadas**. Ver `docs/decisoes.md`.
