# Decisões técnicas — v6

Formato da Aula 11: contexto, alternativas, escolha, consequência.

## D1. Sugestões aguardam revisão humana; o sistema não envia mensagens

- **Contexto.** A v5 marcava e-mails como "enviados automaticamente". Nas Aulas 07–11 o professor pediu sugestão revisável, revisão humana antes de qualquer contato e "não envie mensagens neste ensaio".
- **Alternativas.** (a) manter envio automático com opção de cancelar; (b) gerar rascunho e exigir decisão.
- **Escolha.** (b). Toda sugestão nasce `pending_review`; o responsável aceita, ajusta ou descarta; a decisão é registrada.
- **Consequência.** Nenhum aluno recebe contato sem uma pessoa decidir. Em contrapartida, a fila precisa de alguém que a revise; avançando o semestre inteiro semana a semana, ela chega a cerca de 340 sugestões para 30 alunos.

## D2. Dado ausente gera estado "incompleto", nunca zero

- **Contexto.** "Histórico desconhecido não equivale a zero"; "turma sem logs exige conferir a coleta".
- **Alternativas.** (a) tratar ausência como 0; (b) imputar média; (c) marcar desconhecido e não sugerir.
- **Escolha.** (c). Semanas fora do semestre, antes do histórico do aluno, com coleta incompleta, ou em que a turma inteira não tem eventos na disciplina ficam `null`.
- **Consequência.** Sem falso alarme de "queda" por falha técnica. Perde-se a análise dessas semanas, o que é exibido explicitamente (hachura violeta na interface). Exceção documentada: o K-Means precisa de número; para o aluno sem histórico, "dias sem AVA" é imputado pela média da turma (só no modelo).

## D3. Base mínima de 5 eventos para avaliar queda

- **Contexto.** Com o corte de 50% puro, variações pequenas (3 → 1 evento) marcavam quase toda a turma toda semana.
- **Alternativas.** (a) só o corte de 50%; (b) exigir base mínima na semana anterior; (c) usar dias ativos.
- **Escolha.** (b), com `minBaseline = 5`, parametrizável. O cenário do professor (20 → 10) continua gerando sugestão (T07, T08).
- **Consequência.** Menos ruído. Alunos com atividade muito baixa e constante não geram "queda"; para eles, o sinal vem das pendências. Valor didático, a calibrar com dados reais.

## D4. Pendências calculadas por prazo e entrega

- **Contexto.** "Pendências vêm de atividades previstas e prazos, não da soma dos logs." A v5 incrementava um contador aleatório.
- **Escolha.** 72 atividades previstas no seed; entregas são eventos `entrega` com `atividade`; pendente = prazo vencido sem entrega, dentro de 21 dias.
- **Consequência.** A pendência é explicável ("Atividade 6, prazo 15/05"). A janela de 21 dias é uma escolha nossa para que atividades muito antigas não acumulem indefinidamente.

## D5. Eventos em arquivo próprio e estado de execução fora do Git

- **Contexto.** ~19 mil eventos por semestre; a v5 versionava `academic.json`, que mudava a cada execução.
- **Escolha.** `ava-events.json` separado; `academic.json` e `ava-events.json` são gerados a partir de `*.seed.json` e ficam no `.gitignore`. Leitura com cache por data de modificação, objeto somente leitura; gravação atômica.
- **Consequência.** O repositório não fica "sujo" após uma demonstração e a segunda execução reproduz a primeira. Com o cache de leitura, avançar o semestre inteiro semana a semana levou ~2 s nesta máquina (sem o cache, com o volume de eventos da v6, eram ~40 s). Persistência continua sendo JSON local (ver D6).

## D6. JSON local em vez de banco de dados

- **Contexto.** A oficina precisa de reprodução simples por outra equipe.
- **Escolha.** Manter JSON com gravação atômica.
- **Consequência.** Instalação sem banco. Sem garantia entre múltiplos processos (ver `arquitetura.md`, Concorrência); migração para PostgreSQL está planejada.

## D7. Pseudônimo nos eventos

- **Contexto.** "Use dados fictícios ou exportação autorizada e pseudonimizada"; "sem gravar nome ou dado pessoal".
- **Escolha.** Eventos usam `ps-xxxxxx` (hash do ID interno). A ligação com o nome existe só na base acadêmica, usada pela interface do responsável.
- **Consequência.** O arquivo de eventos e a rota de rastreabilidade não expõem nome nem e-mail.

## D8. Testes isolados da demonstração

- **Contexto.** Na v5, `npm test` e `check:ai` reiniciavam a base que estava sendo apresentada.
- **Escolha.** Variável `ALERTA_DATA_DIR`; testes e `check:ai` usam pasta temporária.
- **Consequência.** Rodar a regressão durante a apresentação não apaga o estado da demonstração.
