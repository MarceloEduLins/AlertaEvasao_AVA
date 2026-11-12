# Roteiro da demonstração — v6 (até 5 minutos)

Abertura em uma frase: *"O sistema percebe mudanças de participação no AVA e prepara uma sugestão de apoio, mas quem decide o contato é uma pessoa."*

## Preparação (antes de apresentar)

```bash
npm run reset-data
npm start
```

Abra http://localhost:3000. Não rode a demonstração sobre uma base já avançada.

## Caso normal: histórico completo → sugestão → decisão

1. **Início**: mostre que a data é 23/02 e que não há nada para revisar. Clique em **Avançar 3 semanas** e depois em **Avançar 1 semana** até **18/05/2026** (ou chame a API com 84 dias).
2. **Turma**: filtro **Sinal no AVA**. Abra **Ana Ribeiro**.
3. **Atividade semanal no AVA**: semanas de 04/05 (atividade normal) e 11/05 (zero, borda tracejada), destacadas como "semanas comparadas".
4. Clique na célula de 04/05 de Raciocínio Algorítmico: lista de **eventos de origem** com IDs; duplicados aparecem riscados (contados uma vez).
5. **Sinal da semana**: "queda de atividade" com os números das duas semanas.
6. **Revisão**: localize a sugestão da Ana, mostre período, motivos, qualidade da coleta e a mensagem sugerida. Informe o responsável e clique em **Ajustar texto** → altere → **Salvar ajuste**.
7. Filtro **Decididas**: decisão com nome, data e texto final. Diga: *"nada foi enviado; o contato é feito pela tutoria."*

## Caso limite: dado ausente não é zero

8. Na mesma faixa da Ana, aponte:
   - **23/03**: hachura violeta. Exportação parou em 25 e 26/03 → "coleta incompleta", sem sugestão automática.
   - **Descoberta da Computação, 04/05**: a turma inteira ficou sem eventos → "conferir a coleta", não inatividade.
9. **Coleta do AVA**: a mesma informação para a turma (hachura e célula vermelha tracejada).
10. Opcional, em outra execução (reset e avanço até 23/03): **Turma → Nicolas Ferreira** mostra "dados incompletos" porque o histórico do AVA dele só existe a partir de 13/04; Gabriel Martins, na mesma data, tem semanas conhecidas.

## Caso de erro: entrada inválida

11. **Coleta do AVA → Usar arquivo de exemplo → Validar sem importar**: 5 aceitos, 1 duplicado, 4 rejeitados com o motivo de cada linha.

## O que está pronto, simulado e testado

- **Pronto**: agregação com deduplicação, coleta, pendências por prazo, sugestão, revisão, importação.
- **Simulado**: eventos, notas, faltas e falhas de coleta (dados fictícios); não existe envio de e-mail.
- **Testado**: `npm test` (33 testes, cenários T01–T21 em `docs/evidencias.csv`).
- **Limitação**: queda de atividade é sinal para investigação; o corte de 50% é didático.
