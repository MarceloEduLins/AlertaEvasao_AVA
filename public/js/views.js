import {
  esc, icon, empty, tag, levelTag, weeklyTag, statusTag, weekStrip,
  dayMonth, shortDate, longDate, weekRange, dateTime, addDays, shortSubject,
  ALERT, TYPE, DECISION, LEVEL
} from './ui.js';

const pageHead = (title, text, actions = '') => `<div class="page-head"><div><h1>${esc(title)}</h1>${text ? `<p>${esc(text)}</p>` : ''}</div>${actions}</div>`;
const panelTitle = (title, text = '', side = '') => `<div class="panel-title"><div><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div>${side}</div>`;

/* ——— Relógio do semestre ——— */
export function clock(sim) {
  const s = sim.simulation;
  const start = new Date(`${s.startDate}T12:00:00Z`), end = new Date(`${s.endDate}T12:00:00Z`), now = new Date(`${s.currentDate}T12:00:00Z`);
  const progress = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  const totalWeeks = Math.ceil((end - start) / (7 * 86400000));
  const next = sim.upcoming?.[0];
  const finished = s.currentDate >= s.endDate;
  return `
    <div class="clock-date">
      <strong>${esc(longDate(s.currentDate))}</strong>
      <span>Semana ${s.week} de ${totalWeeks} · ${esc(sim.class.term)}${next ? ` · próximo marco em ${esc(shortDate(next.date))}: ${esc(next.title)}` : ''}</span>
    </div>
    <div class="clock-track" role="progressbar" aria-label="Progresso do semestre" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress}%"></i></div>
    <div class="clock-actions">
      <button class="btn" data-action="advance" data-days="1" ${finished ? 'disabled' : ''}>${icon('step')}Avançar 1 dia</button>
      <button class="btn btn-primary" data-action="advance" data-days="7" ${finished ? 'disabled' : ''}>${icon('step')}Avançar 1 semana</button>
      <button class="btn btn-quiet" data-action="next-event" ${finished ? 'disabled' : ''} title="Avança até a próxima avaliação, liberação de notas ou marco da história">${icon('skip')}Próximo marco</button>
      <button class="btn btn-quiet" data-action="reset" title="Volta ao primeiro dia e apaga eventos e decisões da simulação">${icon('reset')}<span class="visually-hidden">Reiniciar semestre</span></button>
    </div>`;
}

/* ——— Navegação ——— */
export function nav(current, pendingCount) {
  const item = (view, label, ic, count = '') => `<button class="nav-item" data-view="${view}" ${current === view ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span><span class="nav-count">${count}</span></button>`;
  return `
    ${item('overview', 'Início', 'home')}
    ${item('review', 'Revisão', 'review', pendingCount || '')}
    <div class="nav-group-label">Acompanhamento</div>
    ${item('class', 'Turma', 'users')}
    ${item('student', 'Aluno', 'user')}
    <div class="nav-group-label">Dados e modelo</div>
    ${item('collection', 'Coleta do AVA', 'data')}
    ${item('semester', 'Semestre', 'calendar')}
    ${item('clusters', 'Perfis (K-Means)', 'clusters')}
    ${item('about', 'Sobre o MVP', 'info')}`;
}

/* ——— Início ——— */
export function overview({ sim, dashboard, ava, pending }) {
  const counts = dashboard.counts;
  const lastWeek = ava.weeks.filter((w) => !w.parcial).at(-1);
  const queue = pending.slice(0, 6);
  const last = sim.simulation.lastAdvance;
  const studentName = (id) => dashboard.students.find((p) => p.student.id === id)?.student.name || id;
  return `
    ${pageHead('Início', 'O que precisa da sua decisão hoje e o que mudou desde o último avanço do calendário.')}
    <div class="facts">
      <div class="fact is-review"><b>${pending.length}</b><span>sugestões aguardando revisão</span><small>nada é enviado sem decisão</small></div>
      <div class="fact"><b>${ava.counts.revisar}</b><span>alunos com sinal no AVA</span><small>semana de ${esc(dayMonth(ava.periodo.atual))}</small></div>
      <div class="fact is-unknown"><b>${ava.counts.incompleto}</b><span>alunos com dados incompletos</span><small>conferir coleta ou histórico</small></div>
      <div class="fact"><b>${counts.high}</b><span>em atenção alta</span><small>frequência, notas e AVA somados</small></div>
    </div>
    ${last ? `<div class="notice">${icon('step')}<div><b>${esc(dayMonth(last.from))} → ${esc(dayMonth(last.to))}.</b> ${esc(last.message)} ${last.notificationCount ? `${last.notificationCount} nova(s) sugestão(ões) entrou(aram) na fila de revisão.` : ''}</div></div>` : ''}
    <div class="grid-main">
      <section class="panel">
        ${panelTitle('Para revisar', 'As mais recentes primeiro. Cada sugestão mostra período, motivos e qualidade da coleta.', pending.length ? `<button class="btn btn-sm" data-view="review">Abrir fila completa</button>` : '')}
        ${queue.length ? `<div class="queue">${queue.map((n) => `
          <div class="queue-row">
            <div><strong>${esc(studentName(n.studentId))}</strong><p>${esc(n.subject)}</p></div>
            <div class="chips">${tag(n.level, ALERT[n.level] || n.level)}<button class="btn btn-sm" data-action="review-one" data-id="${esc(n.id)}">Revisar</button></div>
          </div>`).join('')}</div>`
          : empty('Nenhuma sugestão aguardando você', sim.simulation.currentDate === sim.simulation.startDate ? 'O semestre acabou de começar. Avance o calendário para o sistema acumular atividade no AVA.' : 'Todas as sugestões já foram revisadas.', sim.simulation.currentDate === sim.simulation.startDate ? '<br><button class="btn btn-primary" data-action="advance" data-days="21">Avançar 3 semanas</button>' : '')}
      </section>
      <section class="panel">
        ${panelTitle('Coleta da última semana completa', lastWeek ? `Semana de ${weekRange(lastWeek.semana, addDays(lastWeek.semana, 6))}` : 'Ainda não há semana completa.')}
        ${lastWeek ? collectionSummary(lastWeek, sim.subjects) : empty('Sem semana completa', 'A primeira análise acontece depois de duas semanas completas.')}
        <div style="margin-top:16px">${panelTitle('Distribuição da turma', 'Nível de atenção geral')}
        ${stackbar([['low', counts.low], ['mid', counts.mid], ['high', counts.high]], { low: LEVEL.low, mid: LEVEL.mid, high: LEVEL.high })}</div>
      </section>
    </div>
    <section class="panel">
      ${panelTitle('O que aconteceu', 'Linha do tempo do semestre simulado.')}
      ${timeline(sim.recentActivity.filter((i) => i.kind !== 'time').slice(0, 10))}
    </section>`;
}

function collectionSummary(week, subjects) {
  const c = week.coleta;
  const noLogs = week.disciplinas.filter((d) => d.semLogs);
  const parts = [];
  parts.push(c.status === 'completa'
    ? `<p>${tag('completa', 'Coleta completa')} 7 de 7 dias exportados.</p>`
    : `<p>${tag('incompleta', 'Coleta incompleta')} ${c.collectedDays} de ${c.expectedDays} dias exportados. Sugestões dessa semana ficam como "dados incompletos".</p>`);
  if (noLogs.length) {
    const names = noLogs.map((d) => shortSubject(subjects.find((s) => s.id === d.subjectId)?.name || d.subjectId)).join(', ');
    parts.push(`<p>${tag('incompleto', 'Turma sem eventos')} ${esc(names)}: nenhum aluno registrou atividade. Isso indica falha de coleta, não inatividade.</p>`);
  }
  return parts.join('');
}

function stackbar(entries, labels) {
  const total = Math.max(1, entries.reduce((s, [, v]) => s + v, 0));
  return `<div class="stackbar" role="img" aria-label="${esc(entries.map(([k, v]) => `${labels[k]}: ${v}`).join(', '))}">${entries.map(([k, v]) => `<i class="${k}" style="width:${(v / total) * 100}%"></i>`).join('')}</div>
    <div class="chips">${entries.map(([k, v]) => tag(k, `${labels[k]}: ${v}`)).join('')}</div>`;
}

function timeline(items) {
  if (!items.length) return empty('Nada aconteceu ainda', 'Avance o calendário para ver avaliações, faltas, sinais no AVA e sugestões.');
  return `<ol class="timeline">${items.map((i) => `<li class="${esc(i.tone || '')}"><time>${esc(dayMonth(i.date))}</time><div><b>${esc(i.title)}</b><p>${esc(i.detail)}</p></div></li>`).join('')}</ol>`;
}

/* ——— Revisão ——— */
export function review({ items, filter, reviewer, studentName, subjectName, editing, counts }) {
  const seg = (value, label, n) => `<button data-action="review-filter" data-filter="${value}" aria-pressed="${filter === value}">${label} (${n})</button>`;
  return `
    ${pageHead('Revisão de sugestões', 'Confira os motivos e a origem dos dados antes de decidir. Queda de atividade é um sinal para conversar, não prova de evasão.')}
    <div class="notice">${icon('shield')}<div>O sistema <b>não envia mensagens</b>. Ao aceitar ou ajustar, a sugestão fica registrada como aprovada para contato feito por você; ao descartar, o motivo fica registrado. Toda decisão guarda nome, data e observação.</div></div>
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Filtrar sugestões">${seg('pending', 'Aguardando', counts.pending)}${seg('decided', 'Decididas', counts.decided)}${seg('all', 'Todas', counts.all)}</div>
    </div>
    ${items.length ? `<div class="review-list">${items.map((n) => reviewCard(n, { reviewer, studentName, subjectName, editing: editing.has(n.id) })).join('')}</div>`
      : empty(filter === 'pending' ? 'Fila vazia' : 'Nenhuma decisão registrada', filter === 'pending' ? 'Não há sugestões aguardando revisão. Novas sugestões aparecem quando o calendário avança e surgem sinais novos.' : 'Decisões aparecem aqui depois que você aceitar, ajustar ou descartar uma sugestão.')}`;
}

function reviewCard(n, { reviewer, studentName, subjectName, editing }) {
  const ev = n.evidence || {};
  const periodo = ev.periodo;
  const reasons = ev.motivos?.length ? ev.motivos : [{ type: n.type, level: n.level, summary: n.summary || n.subject }];
  const decided = Boolean(n.review);
  const flagged = (ev.disciplinas || []).filter((d) => d.estado === 'revisar');
  const incompleteReasons = [...new Set((ev.disciplinas || []).filter((d) => d.estado === 'incompleto').flatMap((d) => d.dadosIncompletos || []))];
  const incompleteCount = (ev.disciplinas || []).filter((d) => d.estado === 'incompleto').length;
  const cell = (w) => (w ? `${w.eventos} ev. · ${w.diasAtivos} d` : '<span class="unknown-cell">ausente</span>');
  const table = flagged.length ? `
    <h4 style="margin-top:14px">Indicadores semanais que geraram o sinal</h4>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Disciplina</th><th class="num">${periodo ? esc(weekRange(periodo.anterior.inicio, periodo.anterior.fim)) : 'Anterior'}</th><th class="num">${periodo ? esc(weekRange(periodo.atual.inicio, periodo.atual.fim)) : 'Atual'}</th><th class="num">Pendências</th><th>Motivo</th></tr></thead>
      <tbody>${flagged.map((d) => `<tr>
        <td>${esc(shortSubject(d.subjectName || subjectName(d.subjectId)))}</td>
        <td class="num">${cell(d.anterior)}</td><td class="num">${cell(d.atual)}</td>
        <td class="num">${d.pendencias == null ? '<span class="unknown-cell">?</span>' : d.pendencias}</td>
        <td>${esc(d.motivos.join(' e '))}</td>
      </tr>`).join('')}</tbody></table></div>` : '';
  const incompleteNote = incompleteCount ? `<div class="notice unknown" style="margin:12px 0 0">${icon('info')}<div><b>Dados incompletos em ${incompleteCount} disciplina(s)</b>, sem sinal automático do AVA: ${esc(incompleteReasons.slice(0, 2).join('; '))}.</div></div>` : '';
  return `
  <article class="review-card" data-level="${esc(n.level)}" id="card-${esc(n.id)}">
    <div class="review-head">
      <div>
        <h3><button class="link-btn" data-action="open-student" data-id="${esc(n.studentId)}">${esc(studentName(n.studentId))}</button></h3>
        <p>${esc(n.subject)}</p>
      </div>
      <div class="chips">${tag(n.level, ALERT[n.level] || n.level)}${statusTag(n.status)}</div>
    </div>
    <div class="review-body">
      <div>
        <h4>Por que foi sugerida</h4>
        <ul class="reasons">${reasons.map((r) => `<li>${tag("plain", TYPE[r.type] || r.type)}<span>${esc(shortSubject(r.summary))}</span></li>`).join("")}</ul>
        ${periodo ? `<h4 style="margin-top:14px">Período e qualidade da coleta</h4>
          <div class="chips"><span class="chip">Comparação: ${esc(weekRange(periodo.anterior.inicio, periodo.anterior.fim))} → ${esc(weekRange(periodo.atual.inicio, periodo.atual.fim))}</span>
          ${tag(ev.coleta?.anterior === 'completa' ? 'completa' : 'incompleta', `Semana anterior: coleta ${ev.coleta?.anterior}`)}
          ${tag(ev.coleta?.atual === 'completa' ? 'completa' : 'incompleta', `Semana atual: coleta ${ev.coleta?.atual}`)}</div>` : ''}
        ${table}${incompleteNote}
      </div>
      <div>
        <h4>${decided && n.finalBody ? 'Mensagem aprovada (contato feito pelo responsável)' : 'Mensagem sugerida, ainda não enviada'}</h4>
        <p class="message">${esc(decided && n.finalBody ? n.finalBody : n.body)}</p>
        <p class="small muted" style="margin:8px 0 0">Gerada em ${esc(dayMonth(n.simulatedDate))} (data simulada) · Para: ${esc(n.to || '—')}</p>
      </div>
    </div>
    ${decided ? decisionBlock(n) : `
    <div class="review-editor" ${editing ? '' : 'hidden'}>
      <div class="field"><label for="edit-${esc(n.id)}">Texto ajustado</label><textarea class="textarea" id="edit-${esc(n.id)}">${esc(n.body)}</textarea></div>
    </div>
    <div class="review-actions">
      <div class="field"><label for="reviewer-${esc(n.id)}">Responsável</label><input class="input" id="reviewer-${esc(n.id)}" data-reviewer value="${esc(reviewer)}" placeholder="Seu nome" autocomplete="name" maxlength="80"></div>
      <div class="field"><label for="note-${esc(n.id)}">Observação <span class="muted">(obrigatória para descartar)</span></label><input class="input" id="note-${esc(n.id)}" placeholder="Ex.: aluno já procurou a tutoria" maxlength="500"></div>
      <div class="btn-row">
        ${editing
          ? `<button class="btn btn-primary" data-action="decide" data-decision="ajustar" data-id="${esc(n.id)}">Salvar ajuste</button><button class="btn btn-quiet" data-action="toggle-edit" data-id="${esc(n.id)}">Cancelar ajuste</button>`
          : `<button class="btn btn-primary" data-action="decide" data-decision="aceitar" data-id="${esc(n.id)}">Aceitar</button><button class="btn" data-action="toggle-edit" data-id="${esc(n.id)}">Ajustar texto</button>`}
        <button class="btn btn-danger" data-action="decide" data-decision="descartar" data-id="${esc(n.id)}">Descartar</button>
      </div>
    </div>`}
  </article>`;
}

function decisionBlock(n) {
  const r = n.review;
  return `<div class="decision">
    <div>${statusTag(n.status)} <strong>${esc(DECISION[r.decision])} por ${esc(r.reviewer)}</strong> <span class="muted">em ${esc(dateTime(r.decidedAt))} · data simulada ${esc(dayMonth(r.simulatedDate))}</span></div>
    ${r.note ? `<div>Observação: ${esc(r.note)}</div>` : ''}
    ${r.decision !== 'descartar' ? '<div class="muted small">Aprovada para contato. O envio é feito pelo responsável, fora do sistema.</div>' : ''}
  </div>`;
}

/* ——— Turma ——— */
export function classView({ dashboard, ava, filter, search }) {
  const weeklyById = Object.fromEntries(ava.students.map((s) => [s.studentId, s]));
  const all = dashboard.students.slice().sort((a, b) => b.overallScore - a.overallScore);
  const term = search.trim().toLowerCase();
  const rows = all.filter((p) => {
    const w = weeklyById[p.student.id];
    if (term && !`${p.student.name} ${p.student.registration}`.toLowerCase().includes(term)) return false;
    if (filter === 'high') return p.overallLevel === 'high';
    if (filter === 'revisar') return w?.estado === 'revisar';
    if (filter === 'incompleto') return w?.estado === 'incompleto';
    return true;
  });
  const seg = (value, label, n) => `<button data-action="class-filter" data-filter="${value}" aria-pressed="${filter === value}">${label} (${n})</button>`;
  const subjectRows = dashboard.subjectStats.map((s) => {
    const g = Number(s.avgGrade);
    return `<div class="bar-row"><span>${esc(shortSubject(s.subject.name))}</span><div class="bar-track" title="Referência 7,0"><i class="${g < 7 ? 'below' : ''}" style="width:${Number.isFinite(g) ? g * 10 : 0}%"></i><em></em></div><b>${Number.isFinite(g) ? g.toFixed(1) : '—'}</b></div>`;
  }).join('');
  return `
    ${pageHead('Turma', `${dashboard.class.name}. Clique em um aluno para ver a atividade semanal, as disciplinas e as decisões registradas.`)}
    <div class="grid-main">
      <section class="panel">
        <div class="toolbar">
          <label class="visually-hidden" for="class-search">Buscar aluno</label>
          <input class="input" id="class-search" type="search" placeholder="Buscar por nome ou matrícula" value="${esc(search)}">
          <div class="segmented" role="group" aria-label="Filtrar alunos">
            ${seg('all', 'Todos', all.length)}${seg('high', 'Atenção alta', dashboard.counts.high)}${seg('revisar', 'Sinal no AVA', ava.counts.revisar)}${seg('incompleto', 'Dados incompletos', ava.counts.incompleto)}
          </div>
        </div>
        ${rows.length ? `<div class="table-wrap"><table class="table students-table">
          <thead><tr><th>Aluno</th><th>Atenção geral</th><th>AVA, semana de ${esc(dayMonth(ava.periodo.atual))}</th><th>Principal motivo</th></tr></thead>
          <tbody>${rows.map((p) => {
            const w = weeklyById[p.student.id];
            return `<tr data-action="open-student" data-id="${esc(p.student.id)}" tabindex="0">
              <td><span class="student-name">${esc(p.student.name)}</span><span class="student-sub">${esc(p.student.registration)} · ${esc(p.student.pseudoId)}</span></td>
              <td><span class="score">${levelTag(p.overallLevel)}<span class="score-bar" aria-hidden="true"><i class="${p.overallLevel}" style="width:${p.overallScore}%"></i></span>${p.overallScore}</span></td>
              <td>${w ? weeklyTag(w.estado) : '—'}${w?.estado === 'revisar' ? `<span class="student-sub">${esc(weeklySummary(w.revisar))}</span>` : w?.estado === 'incompleto' ? `<span class="student-sub">${esc(w.incompletos[0] || '')}</span>` : ''}</td>
              <td class="small">${esc(shortSubject(p.mainReasons[0] || 'Sem fator predominante'))}</td>
            </tr>`;
          }).join('')}</tbody></table></div>` : empty('Nenhum aluno com esse filtro', 'Troque o filtro ou limpe a busca.')}
      </section>
      <div>
        <section class="panel">
          ${panelTitle('Sinal semanal no AVA', `Comparação ${dayMonth(ava.periodo.anterior)} → ${dayMonth(ava.periodo.atual)}`)}
          ${stackbar([['sem_sinal', ava.counts.sem_sinal], ['revisar', ava.counts.revisar], ['incompleto', ava.counts.incompleto]], { sem_sinal: 'Sem sinal', revisar: 'Revisar apoio', incompleto: 'Dados incompletos' })}
        </section>
        <section class="panel">
          ${panelTitle('Média da RA atual por disciplina', 'A linha vertical marca a referência 7,0.')}
          <div class="bars">${subjectRows}</div>
        </section>
      </div>
    </div>`;
}

function weeklySummary(list) {
  const drop = list.filter((r) => r.motivos.includes('queda de atividade')).length;
  const pending = list.filter((r) => r.motivos.includes('atividade pendente')).length;
  const parts = [];
  if (drop) parts.push(`queda em ${drop} disciplina${drop > 1 ? 's' : ''}`);
  if (pending) parts.push(`pendência em ${pending} disciplina${pending > 1 ? 's' : ''}`);
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase());
}

/* ——— Aluno ——— */
export function studentView({ profile, weekly, suggestions, sim }) {
  const s = profile.student;
  const periodo = weekly.periodo;
  return `
    <button class="btn btn-quiet btn-sm back" data-view="class">← Voltar para a turma</button>
    <div class="profile-head">
      <div>
        <h1>${esc(s.name)}</h1>
        <p>${esc(s.registration)} · pseudônimo nos eventos do AVA: <code>${esc(s.pseudoId)}</code>${s.avaHistoryFrom ? ` · histórico do AVA a partir de ${esc(shortDate(s.avaHistoryFrom))}` : ''}</p>
        <div class="chips" style="margin-top:10px">${(profile.mainReasons.length ? profile.mainReasons : ["Sem fator predominante"]).map((r) => `<span class="chip">${esc(shortSubject(r))}</span>`).join('')}</div>
      </div>
      <div class="profile-score">${levelTag(profile.overallLevel)}<b style="margin-top:8px">${profile.overallScore}</b><span>score de atenção (0–100)</span><br><button class="btn btn-sm" style="margin-top:10px" data-action="generate-suggestion" data-id="${esc(s.id)}">Gerar sugestão agora</button></div>
    </div>

    <section class="panel">
      ${panelTitle('Atividade semanal no AVA', 'Eventos únicos por disciplina e semana (segunda a domingo). Clique numa semana para ver os eventos de origem.', weeklyTag(weekly.estado))}
      ${weekStrip(weekly.history, { periodo, studentId: s.id })}
    </section>

    <section class="panel">
      ${panelTitle('Sinal da semana', periodo ? `Semana de ${weekRange(periodo.atual.inicio, periodo.atual.fim)} comparada com ${weekRange(periodo.anterior.inicio, periodo.anterior.fim)}. Pendências contam prazos vencidos sem entrega.` : '')}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Disciplina</th><th class="num">Semana anterior</th><th class="num">Semana atual</th><th>Pendências por prazo</th><th>Leitura</th></tr></thead>
        <tbody>${weekly.subjects.map((d) => `<tr>
          <td>${esc(shortSubject(d.subjectName))}</td>
          <td class="num">${d.anterior ? `${d.anterior.eventos} eventos<br><span class="small muted">${d.anterior.diasAtivos} dia(s) ativo(s)</span>` : '<span class="unknown-cell">ausente</span>'}</td>
          <td class="num">${d.atual ? `${d.atual.eventos} eventos<br><span class="small muted">${d.atual.diasAtivos} dia(s) ativo(s)</span>` : '<span class="unknown-cell">ausente</span>'}</td>
          <td>${d.pendencias == null ? '<span class="unknown-cell">desconhecidas</span>' : d.pendencias.count ? d.pendencias.items.map((p) => `<div class="small">${esc(p.title)}, prazo ${esc(dayMonth(p.dueDate))}</div>`).join('') : '<span class="small muted">nenhuma</span>'}</td>
          <td>${weeklyTag(d.resultado.estado)}<div class="small" style="margin-top:4px">${d.resultado.estado === 'incompleto' ? esc(d.dadosIncompletos.join('; ')) : esc(d.resultado.motivos.join(' e ') || 'Atividade estável e sem pendências')}</div></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>

    <section class="panel">
      ${panelTitle('Disciplinas', 'Frequência acumulada, tempo sem acesso e resultados de RA.')}
      <div class="subject-list">${profile.subjects.map((item) => subjectLine(item)).join('')}</div>
    </section>

    <section class="panel">
      ${panelTitle('Sugestões e decisões', 'Histórico deste aluno na fila de revisão.')}
      ${suggestions.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Data</th><th>Sugestão</th><th>Situação</th><th>Responsável</th></tr></thead>
        <tbody>${suggestions.map((n) => `<tr><td>${esc(dayMonth(n.simulatedDate))}</td><td>${esc(n.subject)}</td><td>${statusTag(n.status)}</td><td>${n.review ? `${esc(n.review.reviewer)}${n.review.note ? `<div class="small muted">${esc(n.review.note)}</div>` : ''}` : `<button class="btn btn-sm" data-action="review-one" data-id="${esc(n.id)}">Revisar</button>`}</td></tr>`).join('')}</tbody>
      </table></div>` : empty('Nenhuma sugestão para este aluno', sim.simulation.currentDate === sim.simulation.startDate ? 'Avance o calendário para gerar dados.' : 'Ainda não surgiram sinais que justifiquem apoio.')}
    </section>`;
}

function subjectLine(item) {
  const a = item.attendance, ava = item.ava, current = item.assessments[0];
  const remaining = a.remainingAbsences > 1 ? `${a.remainingAbsences} faltas restantes` : a.remainingAbsences === 1 ? '1 falta restante' : 'sem margem';
  const done = Object.fromEntries(item.assessments.map((x) => [x.name, x]));
  return `<div class="subject-line">
    <div><h3>${esc(shortSubject(item.subject.name))}</h3><p>${esc(item.mainReason)}</p>
      <div class="ra-row">${(item.subject.ras || []).map((ra) => { const r = done[ra.id]; return r ? `<span class="ra ${r.grade < 7 ? 'below' : ''}" title="${esc(r.weakest ? `Componente mais fraco: ${r.weakest.type} (${r.weakest.grade.toFixed(1)})` : '')}">${esc(ra.id)} ${r.grade.toFixed(1)}</span>` : `<span class="ra future">${esc(ra.id)} em ${esc(dayMonth(ra.date))}</span>`; }).join('')}</div>
    </div>
    <div class="kv"><b>${a.currentAttendance}%</b><span>frequência · ${esc(remaining)}</span></div>
    <div class="kv"><b>${ava.inactiveDays == null ? '<span class="unknown-cell">?</span>' : `${ava.inactiveDays} d`}</b><span>sem acesso ao AVA</span></div>
    <div class="kv"><b>${current ? current.grade.toFixed(1) : '—'}</b><span>${current ? `${esc(current.name)}${current.weakest ? ` · menor: ${esc(current.weakest.type)}` : ''}` : 'sem RA liberada'}</span></div>
    <div class="chips">${levelTag(item.level)}<button class="btn btn-sm btn-quiet" data-action="add-absence" data-subject="${esc(item.subject.id)}" data-absences="${a.absences}">Registrar falta</button></div>
  </div>`;
}

/* ——— Coleta do AVA ——— */
export function collection({ ava, subjects, importResult }) {
  const st = ava.stats;
  const weeks = ava.weeks;
  return `
    ${pageHead('Coleta do AVA', 'De onde vêm os indicadores: eventos exportados do AVA, deduplicados pelo ID e agregados por aluno, disciplina e semana.')}
    <div class="facts">
      <div class="fact"><b>${st.rawEvents.toLocaleString('pt-BR')}</b><span>eventos recebidos</span><small>exportação diária + importações</small></div>
      <div class="fact"><b>${st.uniqueEvents.toLocaleString('pt-BR')}</b><span>eventos únicos</span><small>usados nos agregados</small></div>
      <div class="fact is-review"><b>${st.duplicatesIgnored}</b><span>duplicados ignorados</span><small>mesmo ID recebido de novo</small></div>
      <div class="fact is-unknown"><b>${ava.weeks.filter((w) => !w.parcial && w.coleta.status !== 'completa').length}</b><span>semanas com coleta incompleta</span><small>análise fica "dados incompletos"</small></div>
    </div>
    <section class="panel">
      ${panelTitle('Eventos da turma por semana', 'Total de eventos únicos de todos os alunos. Hachura: coleta incompleta. Vermelho tracejado: turma inteira sem eventos (conferir integração).')}
      ${weeks.length ? `<div class="table-wrap"><table class="table heat">
        <thead><tr><th>Disciplina</th>${weeks.map((w) => `<th class="week">${esc(dayMonth(w.semana))}<br><span class="coverage ${w.coleta.status !== 'completa' && !w.parcial ? 'bad' : ''}">${w.parcial ? 'em curso' : `${w.coleta.collectedDays}/7 dias`}</span></th>`).join('')}</tr></thead>
        <tbody>${subjects.map((s) => `<tr><td style="white-space:nowrap">${esc(shortSubject(s.name))}</td>${weeks.map((w) => {
          const d = w.disciplinas.find((x) => x.subjectId === s.id);
          const incomplete = w.coleta.status !== 'completa' && !w.parcial;
          const intensity = Math.min(1, d.eventos / 220);
          const cls = d.semLogs && !w.parcial ? 'nolog' : incomplete ? 'unknown' : '';
          const style = cls ? '' : `style="background:rgba(31,107,90,${(0.08 + intensity * 0.55).toFixed(2)})"`;
          return `<td class="hcell ${cls}" ${style} title="${esc(`${shortSubject(s.name)}, semana de ${dayMonth(w.semana)}: ${d.eventos} eventos${incomplete ? ' (coleta incompleta)' : ''}${d.semLogs ? ' — nenhum evento da turma' : ''}`)}">${d.eventos}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>` : empty('Sem semanas', 'Avance o calendário para receber eventos.')}
    </section>
    <div class="grid-2">
      <section class="panel">
        ${panelTitle('Ocorrências de coleta conhecidas', 'Configuradas na base de demonstração para testar como o sistema reage.')}
        <ul class="state-list">${ava.incidents.map((i) => `<li><span>${esc(dayMonth(i.from))}${i.to !== i.from ? ` a ${esc(dayMonth(i.to))}` : ''}</span><span>${esc(i.note)}${i.subjectId ? ` <span class="chip">${esc(shortSubject(subjects.find((s) => s.id === i.subjectId)?.name || i.subjectId))}</span>` : ''}</span></li>`).join('')}</ul>
      </section>
      <section class="panel">
        ${panelTitle('Importar eventos (CSV)', 'Colunas: id, aluno (pseudônimo), disciplina, data, tipo, atividade. Valide antes de importar.')}
        <div class="dropzone">
          <div class="field"><label for="csv-file">Arquivo CSV</label><input id="csv-file" class="input" type="file" accept=".csv,text/csv"></div>
          <div class="field"><label for="csv-text">Ou cole o conteúdo</label><textarea id="csv-text" class="textarea" style="min-height:90px" placeholder="id,aluno,disciplina,data,tipo,atividade"></textarea></div>
          <div class="chips">
            <button class="btn btn-sm btn-quiet" data-action="load-demo-csv">Usar arquivo de exemplo</button>
            <button class="btn btn-sm" data-action="import" data-dry="1">Validar sem importar</button>
            <button class="btn btn-sm btn-primary" data-action="import">${icon('upload')}Importar</button>
          </div>
        </div>
        <div class="import-result">${importResult ? importView(importResult) : ''}</div>
      </section>
    </div>`;
}

function importView(r) {
  if (r.error) return `<div class="notice warn">${icon('alert')}<div>${esc(r.error)}</div></div>`;
  return `<div class="notice ${r.rejeitados.length ? 'warn' : ''}">${icon(r.dryRun ? 'shield' : 'upload')}<div><b>${r.dryRun ? 'Validação concluída, nada foi gravado.' : 'Importação concluída.'}</b> ${esc(r.mensagem)}</div></div>
    ${r.rejeitados.length || r.duplicados.length ? `<table class="table"><thead><tr><th>Linha</th><th>ID</th><th>Resultado</th></tr></thead><tbody>
      ${r.duplicados.map((d) => `<tr><td>${d.linha}</td><td><code>${esc(d.id)}</code></td><td>Duplicado: já recebido, contado uma vez</td></tr>`).join('')}
      ${r.rejeitados.map((d) => `<tr><td>${d.linha}</td><td><code>${esc(d.id || '—')}</code></td><td>Rejeitado: ${esc(d.motivo)}</td></tr>`).join('')}
    </tbody></table>` : ''}`;
}

/* ——— Semestre ——— */
export function semester({ sim }) {
  const subjects = Object.fromEntries(sim.subjects.map((s) => [s.id, s]));
  const days = sim.timetable;
  return `
    ${pageHead('Semestre', 'Grade semanal, calendário de avaliações e próximos marcos da simulação.')}
    <div class="grid-main">
      <section class="panel">
        ${panelTitle('Grade semanal', `${sim.class.lessonsPerDay} aulas por dia, de segunda a sexta.`)}
        <div class="table-wrap"><table class="timetable"><thead><tr><th></th>${days.map((d) => `<th>${esc(d.label)}</th>`).join('')}</tr></thead>
        <tbody>${(days[0]?.times || []).map((time, i) => `<tr><td class="time">${esc(time)}</td>${days.map((d) => { const s = subjects[d.periods[i]]; return `<td style="--sub:${esc(s?.color)}">${esc(shortSubject(s?.name || d.periods[i]))}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      </section>
      <section class="panel">
        ${panelTitle('Próximos marcos', '')}
        ${sim.upcoming.length ? `<ol class="timeline">${sim.upcoming.slice(0, 8).map((e) => `<li><time>${esc(dayMonth(e.date))}</time><div><b>${esc(e.title)}</b><p>${esc(e.detail || '')}</p></div></li>`).join('')}</ol>` : empty('Semestre encerrado', 'Reinicie a simulação para recomeçar.')}
      </section>
    </div>
    <section class="panel">
      ${panelTitle('Avaliações por disciplina', 'Cada RA tem componentes e pesos próprios; a média de referência é 7,0.')}
      <div class="plan">${sim.subjects.map((s) => `<div class="plan-item"><h3><i style="background:${esc(s.color)}"></i>${esc(s.name)}</h3>
        ${s.ras.map((ra) => `<div class="small"><b>${esc(ra.id)}</b> em ${esc(dayMonth(ra.date))}, notas em ${esc(dayMonth(ra.releaseDate))}: ${esc(ra.components.map((c) => `${c.type} ${Math.round(c.weight * 100)}%`).join(', '))}</div>`).join('')}</div>`).join('')}</div>
    </section>`;
}

/* ——— Perfis (K-Means) ——— */
const palette = (id) => ['#1f6b5a', '#c4862d', '#6a5ea6', '#b0392f', '#3a7ca5'][Number(id) % 5];
export function clusters({ result, status }) {
  const points = result.projection || [];
  const w = 760, h = 340, pad = 30;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (w - pad * 2);
  const sy = (y) => h - pad - ((y - minY) / (maxY - minY || 1)) * (h - pad * 2);
  const metrics = [['avgAttendance', 'Presença média', '%'], ['avgGrade', 'Média acadêmica', ''], ['avgInactiveDays', 'Dias sem AVA', ''], ['pendingActivities', 'Pendências', ''], ['avgExamGrade', 'Provas', ''], ['avgProjectGrade', 'Projetos', '']];
  return `
    ${pageHead('Perfis (K-Means)', 'Agrupamento exploratório sem rótulos. Serve para enxergar padrões na turma; não classifica ninguém como evadido.')}
    <div class="facts">
      <div class="fact"><b>${result.model.k}</b><span>grupos</span><small>K-Means (scikit-learn)</small></div>
      <div class="fact"><b>${result.model.sampleSize}</b><span>alunos processados</span><small>6 variáveis por aluno</small></div>
      <div class="fact"><b>${result.model.silhouetteScore == null ? '—' : Number(result.model.silhouetteScore).toFixed(2)}</b><span>silhouette</span><small>separação dos grupos (−1 a 1)</small></div>
      <div class="fact"><b>${status?.ai?.ok ? 'Pronta' : 'Indisponível'}</b><span>IA local</span><small>${esc(result.pythonCommand || '')}</small></div>
    </div>
    <section class="panel">
      ${panelTitle('Mapa dos alunos (PCA 2D)', 'Cada ponto é um aluno; pontos próximos têm indicadores parecidos. Clique para abrir o perfil.')}
      <svg class="scatter" viewBox="0 0 ${w} ${h}" role="img" aria-label="Projeção PCA dos alunos por grupo"><line x1="${pad}" y1="${h / 2}" x2="${w - pad}" y2="${h / 2}"/><line x1="${w / 2}" y1="${pad}" x2="${w / 2}" y2="${h - pad}"/>
        ${points.map((p) => `<circle data-action="open-student" data-id="${esc(p.studentId)}" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="7" fill="${palette(p.clusterId)}"><title>${esc(p.name)}</title></circle>`).join('')}
      </svg>
      <div class="chips" style="margin-top:10px">${result.clusters.map((c) => `<span class="chip" style="border-color:${palette(c.id)}">${esc(c.name)}: ${c.size}</span>`).join('')}</div>
    </section>
    <section class="panel">
      ${panelTitle('Grupos e seus centróides', 'Os nomes são interpretações dos centróides, não rótulos aprendidos.')}
      <div class="cluster-cards">${result.clusters.map((c) => `<article class="cluster" style="--c:${palette(c.id)}">
        <h3>${esc(c.name)}<span class="muted small">${c.size} aluno(s)</span></h3>
        <p>${esc((c.signals || []).join('; '))}</p>
        <table class="table"><tbody>${metrics.map(([k, label, unit]) => `<tr><td>${label}</td><td class="num">${Number(c.center[k] || 0).toFixed(k === 'avgAttendance' ? 0 : 1)}${unit}</td></tr>`).join('')}</tbody></table>
        <div class="chips" style="margin-top:10px">${c.members.map((m) => `<button data-action="open-student" data-id="${esc(m.studentId)}">${esc(m.name)}</button>`).join('')}</div>
      </article>`).join('')}</div>
    </section>`;
}

/* ——— Sobre ——— */
export function about({ status }) {
  const s = status?.data?.summary;
  const states = [
    ['Implementado', 'Agregação semanal com deduplicação por ID; pendências por prazo; completude da coleta; sugestão com motivos; revisão aceitar/ajustar/descartar; importação CSV validada.'],
    ['Verificado', 'Matriz de cenários T01–T21 em testes automatizados (npm test), além de validação da base e da integração com Python.'],
    ['Simulado', 'Eventos do AVA, notas, faltas e falhas de coleta são sintéticos. O e-mail não existe: decisões só são registradas.'],
    ['Validado', 'Pendente: sessões de observação com tutores (protocolo em docs/relatorio.md).'],
    ['Planejado', 'Integração autorizada com o AVA real, calibração do corte de 50% com a equipe pedagógica, autenticação e banco de dados.']
  ];
  return `
    ${pageHead('Sobre o MVP', 'Como os componentes conversam e em que estado cada parte está.')}
    <section class="panel">
      ${panelTitle('Fluxo principal', 'Do evento bruto à decisão registrada.')}
      <div class="flow">
        <div class="flow-node"><b>Eventos do AVA</b><span>exportação diária ou CSV, com pseudônimo</span></div>
        <div class="flow-node"><b>Agregados semanais</b><span>dedup por ID, eventos e dias ativos</span></div>
        <div class="flow-node"><b>Qualidade e prazos</b><span>coleta completa? histórico? pendências</span></div>
        <div class="flow-node"><b>Sugestão revisável</b><span>período, motivos, mensagem</span></div>
        <div class="flow-node"><b>Revisão humana</b><span>aceitar, ajustar ou descartar</span></div>
      </div>
    </section>
    <div class="grid-2">
      <section class="panel">
        ${panelTitle('Estado de cada parte', 'Classificação da Aula 11.')}
        <ul class="state-list">${states.map(([k, v]) => `<li><b>${k}</b><span>${esc(v)}</span></li>`).join('')}</ul>
      </section>
      <section class="panel">
        ${panelTitle('Verificação ao vivo', '')}
        <ul class="state-list">
          <li><b>Base</b><span>${status?.data?.ok ? tag('completa', 'válida') : tag('critical', 'com erro')} ${s ? `${s.students} alunos, ${s.subjects} disciplinas, ${s.enrollments} matrículas, ${s.activities} atividades previstas` : ''}</span></li>
          <li><b>IA</b><span>${status?.ai?.ok ? `${tag('completa', 'pronta')} ${esc(status.ai.command)}, scikit-learn ${esc(status.ai.scikitLearn)}` : `${tag('incompleto', 'indisponível')} ${esc(status?.ai?.message || '')}`}</span></li>
          <li><b>Mensagens</b><span>${esc(status?.notifications?.description || '')}</span></li>
          <li><b>Limitação</b><span>Um sinal de atividade não comprova evasão. O ensaio usa alunos fictícios e não mede capacidade de prever evasão real.</span></li>
        </ul>
      </section>
    </div>`;
}

/* ——— Painel de eventos de origem ——— */
export function eventsDrawer(result, subjectName) {
  return `<div class="drawer-backdrop" data-action="close-drawer"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <header><div><h2 id="drawer-title">Eventos de origem</h2><p>${esc(subjectName)}, semana de ${esc(weekRange(result.semana, addDays(result.semana, 6)))}. Aluno <code>${esc(result.aluno)}</code>. ${result.unicos} único(s) de ${result.total} recebido(s).</p></div>
      <button class="btn btn-quiet btn-sm" data-action="close-drawer" aria-label="Fechar">${icon('close')}</button></header>
    <div class="drawer-body">
      ${result.eventos.length ? `<table class="table"><thead><tr><th>Data</th><th>Tipo</th><th>ID</th></tr></thead><tbody>
        ${result.eventos.map((e) => `<tr class="${e.duplicado ? 'dup' : ''}"><td>${esc(dayMonth(e.data))}</td><td>${esc(e.tipo)}${e.atividade ? ` <span class="small muted">${esc(e.atividade)}</span>` : ''}</td><td><code>${esc(e.id)}</code>${e.duplicado ? ' <span class="small">duplicado, ignorado</span>' : ''}</td></tr>`).join('')}
      </tbody></table>` : empty('Nenhum evento nesta semana', 'Com a coleta completa, isso é um zero registrado, não um dado ausente.')}
    </div>
  </aside>`;
}
