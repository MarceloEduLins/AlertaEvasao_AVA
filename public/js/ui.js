// Utilidades de interface: escape, datas, rótulos, ícones e a faixa semanal.

export function esc(value = '') {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function parts(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return { y, m, d, date: new Date(Date.UTC(y, m - 1, d)) };
}
export function dayMonth(iso) { if (!iso) return '—'; const { m, d } = parts(iso); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`; }
export function shortDate(iso) { if (!iso) return '—'; const { m, d } = parts(iso); return `${d} ${MONTHS[m - 1]}`; }
export function longDate(iso) {
  if (!iso) return '—';
  const { y, m, d, date } = parts(iso);
  const weekday = WEEKDAYS[date.getUTCDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m - 1]} de ${y}`;
}
export function weekRange(start, end) { return `${dayMonth(start)} a ${dayMonth(end)}`; }
export function addDays(iso, days) { const { date } = parts(iso); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function dateTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

export const LEVEL = { high: 'Atenção alta', mid: 'Atenção moderada', low: 'Atenção baixa' };
export const ALERT = { normal: 'Normal', reminder: 'Lembrete', observe: 'Observar', attention: 'Atenção', critical: 'Crítico', unknown: 'Sem histórico' };
export const WEEKLY = { revisar: 'Revisar apoio', sem_sinal: 'Sem sinal', incompleto: 'Dados incompletos' };
export const STATUS = { pending_review: 'Aguardando revisão', approved: 'Aceita', adjusted: 'Ajustada', discarded: 'Descartada' };
export const DECISION = { aceitar: 'Aceita', ajustar: 'Ajustada', descartar: 'Descartada' };
export const TYPE = { attendance: 'Frequência', grade: 'Resultado de RA', ava: 'Tempo sem acesso ao AVA', ava_semana: 'Atividade semanal no AVA', digest: 'Resumo de sinais', manual: 'Gerada manualmente' };

export function tag(kind, text) { return `<span class="tag ${esc(kind)}">${esc(text)}</span>`; }
export function levelTag(level) { return tag(level, LEVEL[level] || level); }
export function weeklyTag(state) { return tag(state, WEEKLY[state] || state); }
export function statusTag(status) { return tag(status, STATUS[status] || status); }

export function shortSubject(name = '') {
  return name
    .replace('Experiência Criativa: Navegando na Computação', 'Experiência Criativa')
    .replace('Descoberta e Evolução da Computação', 'Descoberta da Computação')
    .replace('Modelagem de Fenômenos Físicos', 'Modelagem Física')
    .replace('Leitura e Escrita Acadêmica', 'Leitura e Escrita');
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  review: '<path d="M4 4h16v12H8l-4 4z"/><path d="m9 10 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 4.6a3.2 3.2 0 0 1 0 6.3M21 20c0-2.6-1.6-4.6-4-5.3"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
  data: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6"/><path d="M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clusters: '<circle cx="7" cy="8" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="17" cy="16" r="2"/><circle cx="8" cy="17" r="2"/><circle cx="12" cy="12" r="1.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  step: '<path d="M5 12h12M13 7l5 5-5 5"/>',
  skip: '<path d="M5 6l7 6-7 6zM13 6l7 6-7 6z"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function empty(title, text, action = '') {
  return `<div class="empty"><b>${esc(title)}</b>${esc(text)}${action}</div>`;
}

/**
 * Faixa semanal: uma linha por disciplina, uma célula por semana.
 * Barra = eventos únicos; célula tracejada = zero registrado; hachura violeta = dado ausente.
 */
export function weekStrip(history, { periodo, studentId } = {}) {
  if (!history?.weeks?.length) return empty('Ainda sem semanas registradas', 'Avance o semestre para acumular atividade no AVA.');
  const weeks = history.weeks;
  const max = Math.max(4, ...history.subjects.flatMap((s) => s.values.map((v) => v.eventos || 0)));
  const head = weeks.map((w) => {
    const incomplete = w.coleta.status !== 'completa' && !w.parcial;
    const title = w.parcial ? 'Semana em andamento' : incomplete ? `Coleta incompleta: ${w.coleta.collectedDays} de ${w.coleta.expectedDays} dias` : 'Coleta completa';
    return `<span class="${incomplete ? 'is-incomplete' : ''}" title="${esc(title)}">${dayMonth(w.semana)}${w.parcial ? '<br>(atual)' : incomplete ? '<br>coleta!' : ''}</span>`;
  }).join('');
  const rows = history.subjects.map((subject) => {
    const cells = subject.values.map((value, index) => {
      const week = weeks[index];
      const marks = [week.parcial ? 'partial' : '', periodo && value.semana === periodo.atual.inicio ? 'is-current' : '', periodo && value.semana === periodo.anterior.inicio ? 'is-previous' : ''].join(' ');
      if (value.naoIniciada) {
        return `<div class="wcell notstarted ${marks}" title="Semana começando: ainda sem dias coletados"><b>—</b></div>`;
      }
      if (value.desconhecido) {
        return `<div class="wcell unknown ${marks}" title="${esc(`${shortSubject(subject.subjectName)}, semana de ${dayMonth(value.semana)}: dado ausente (${value.motivo})`)}"><b>?</b></div>`;
      }
      const label = `${shortSubject(subject.subjectName)}, semana de ${dayMonth(value.semana)}${value.parcial ? ' (em andamento)' : ''}: ${value.eventos} evento(s) em ${value.diasAtivos} dia(s) ativo(s), ${value.entregas} entrega(s). Abrir eventos de origem.`;
      const height = value.eventos ? Math.max(6, Math.round((value.eventos / max) * 66)) : 0;
      return `<button type="button" class="wcell ${value.eventos ? '' : 'zero'} ${marks}" style="--sub:${esc(subject.color)}" data-action="open-events" data-student="${esc(studentId)}" data-subject="${esc(subject.subjectId)}" data-week="${esc(value.semana)}" aria-label="${esc(label)}" title="${esc(label)}"><b>${value.eventos}</b>${height ? `<i style="height:${height}%"></i>` : ''}</button>`;
    }).join('');
    return `<div class="weekstrip-row"><span><i style="background:${esc(subject.color)}"></i><em>${esc(shortSubject(subject.subjectName))}</em></span>${cells}</div>`;
  }).join('');
  return `<div class="weekstrip" style="--weeks:${weeks.length}">
      <div class="weekstrip-head"><span></span>${head}</div>
      ${rows}
    </div>
    <div class="legend">
      <span><i class="bar"></i>Eventos únicos na semana</span>
      <span><i class="zero"></i>Zero registrado (coleta ok)</span>
      <span><i class="unknown"></i>Dado ausente: não é zero</span>
      ${periodo ? '<span><i class="window"></i>Semanas comparadas na sugestão</span>' : ''}
    </div>`;
}
