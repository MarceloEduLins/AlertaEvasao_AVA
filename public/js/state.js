function storedReviewer() {
  try { return localStorage.getItem('alerta.reviewer') || ''; } catch { return ''; }
}

export const state = {
  view: 'overview',
  classId: null,
  classes: [],
  simulation: null,
  dashboard: null,
  avaOverview: null,
  pending: [],
  selectedStudentId: null,
  reviewFilter: 'pending',
  classFilter: 'all',
  classSearch: '',
  reviewer: storedReviewer(),
  editing: new Set()
};

export function rememberReviewer(name) {
  state.reviewer = name;
  try { localStorage.setItem('alerta.reviewer', name); } catch { /* armazenamento indisponível: segue só na memória */ }
}
