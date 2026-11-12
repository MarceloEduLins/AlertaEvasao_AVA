# Regras de negócio — v6

## Referências do protótipo

- Média acadêmica de referência: **7,0**.
- Presença mínima configurada na turma demonstrativa: **75%**.
- Os valores são configuráveis/evolutivos e os dados da turma são sintéticos.

## Frequência

A margem usa a carga total prevista da disciplina:

`faltas permitidas - faltas registradas = faltas restantes`

- mais de 5 faltas restantes: normal;
- 3 a 5: lembrete;
- 1 a 2: atenção;
- 0 ou margem negativa: crítico.

Uma mesma faixa só gera sugestão uma vez por disciplina.

## Desempenho

Cada RA pode ter componentes e pesos diferentes.

- nota >= 7,0: sem sugestão de desempenho;
- 6,0–6,9: lembrete preventivo;
- 5,0–5,9: atenção;
- abaixo de 5,0: crítico.

O sistema também mostra o componente mais fraco da RA (por exemplo, prova ou projeto).

## AVA

- 0–3 dias sem acesso: normal;
- 4–7 dias: observar no painel;
- 8–14 dias: atenção;
- 15+ dias: crítico.

O sinal de inatividade no AVA é geral por aluno e usa como contexto a disciplina com mais pendências.

## Atividade semanal no AVA (v6)

Detalhes completos em `docs/contrato_dados.md`.

- semana = segunda a domingo; comparação das **duas últimas semanas completas**;
- eventos contados uma vez por ID; dois eventos no mesmo dia = 2 eventos e 1 dia ativo;
- **queda de atividade**: semana anterior com ao menos 5 eventos e semana atual com no máximo 50% deles;
- **atividade pendente**: prazo vencido (até 21 dias) sem entrega;
- semana fora do semestre, antes do histórico do aluno, com coleta incompleta ou com a turma sem eventos na disciplina → **dados incompletos**, sem sugestão automática.

## Revisão humana (v6)

Nenhuma mensagem é enviada pelo sistema. Toda sugestão fica "aguardando revisão" até um responsável **aceitar**, **ajustar** (texto final registrado) ou **descartar** (motivo obrigatório). A decisão não pode ser sobrescrita.

## Anti-spam

- a mesma faixa de frequência não é repetida;
- a mesma faixa de AVA não é repetida;
- cada resultado de RA pode gerar um novo aviso porque é um evento acadêmico novo;
- se vários sinais novos aparecem no mesmo avanço do calendário, eles são reunidos em **uma única sugestão-resumo**;
- lembretes e avisos de atenção respeitam **intervalo mínimo de 5 dias** desde a última sugestão do aluno; situações críticas entram na fila imediatamente;
- uma nova sugestão só surge quando existe um novo resultado, mudança de faixa ou novo sinal semanal.

## Score de atenção

O score combina frequência, desempenho, AVA e pendências. A presença de múltiplos fatores simultâneos adiciona peso ao score, tornando o sistema mais rigoroso quando a dificuldade aparece em mais de uma dimensão.
