# Roadmap

## v6 — implementado

- eventos do AVA com ID e pseudônimo; agregação semanal com deduplicação;
- completude da coleta, turma sem logs e histórico desconhecido tratados como dados incompletos;
- pendências por prazo (72 atividades previstas);
- sugestão revisável com período, motivos e qualidade da coleta;
- revisão humana aceitar/ajustar/descartar com registro, sem envio de mensagens;
- importação CSV com validação e rastreabilidade até o evento de origem;
- nova interface (Início, Revisão, Turma, Aluno, Coleta do AVA, Semestre, Perfis, Sobre);
- matriz de cenários T01–T21 automatizada.

## v5 — base mantida

Simulação temporal do semestre, 30 alunos, 6 disciplinas, RAs com componentes, frequência acumulada, score de atenção, K-Means + PCA.

## Próximos passos

| Item | Responsável | Impacto | Próximo passo |
|---|---|---|---|
| Sessões de validação com tutores (Aula 10) | Equipe | Saber se o revisor distingue baixa atividade de dado ausente | Aplicar o protocolo de `docs/relatorio.md` |
| Calibrar corte de 50% e base mínima | Equipe + docente | Menos falsos sinais | Comparar sugestões aceitas e descartadas |
| Registrar se o contato ajudou | Marcelo | Medir utilidade, não só o alerta | Campo de acompanhamento após a decisão |
| Banco de dados com transação | Equipe | Concorrência entre processos | PostgreSQL |
| Integração autorizada com o AVA | Instituição | Dados reais | Confirmar campos e significado dos eventos; LGPD |
| Autenticação e perfis | Equipe | Saber quem decide | Login institucional |
