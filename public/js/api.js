const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.message || `Erro ${response.status} ao acessar ${url}.`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

const post = (url, payload) => request(url, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload ?? {}) });

export const api = {
  health: () => request('/api/health'),
  systemStatus: () => request('/api/system/status'),

  simulation: () => request('/api/simulation'),
  advance: (days) => post('/api/simulation/advance', { days }),
  nextEvent: () => post('/api/simulation/next-event'),
  reset: () => post('/api/simulation/reset'),

  classes: () => request('/api/classes'),
  dashboard: (classId) => request(`/api/classes/${classId}/dashboard`),
  avaOverview: (classId) => request(`/api/classes/${classId}/ava-overview`),
  clusters: (classId) => request(`/api/classes/${classId}/clusters`),

  profile: (studentId) => request(`/api/students/${studentId}/profile`),
  avaWeekly: (studentId) => request(`/api/students/${studentId}/ava-weekly`),
  addAbsence: (studentId, subjectId, absences) => request(`/api/students/${studentId}/subjects/${subjectId}`, {
    method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ absences })
  }),
  preview: (studentId) => request(`/api/students/${studentId}/notifications/preview`),

  notifications: (params = {}) => request(`/api/notifications?${new URLSearchParams(params)}`),
  createSuggestion: (payload) => post('/api/notifications', payload),
  review: (id, payload) => post(`/api/notifications/${id}/review`, payload),

  sourceEvents: (studentId, subjectId, week) => request(`/api/ava/events?${new URLSearchParams({ studentId, subjectId, week })}`),
  importEvents: (csv, dryRun) => post(`/api/ava/events/import${dryRun ? '?dryRun=1' : ''}`, { csv }),
  demoCsv: () => fetch('/api/ava/events/demo-csv').then((r) => {
    if (!r.ok) throw new Error('Arquivo de exemplo indisponível.');
    return r.text();
  })
};
