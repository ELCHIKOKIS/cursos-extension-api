const state = {
  courses: [],
  teachers: [],
  filter: 'Todos',
  search: '',
  token: '',
  user: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const courseGrid = $('#courseGrid');
const enrollmentCourse = $('#enrollmentCourse');
const adminCourse = $('#adminCourse');
const toast = $('#toast');
const roleLabels = {
  admin: 'Administrador',
  docente: 'Docente',
  estudiante: 'Estudiante'
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function clearSession() {
  localStorage.removeItem('aulaAbiertaToken');
  state.token = '';
  state.user = null;
  renderWorkspace();
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 401 && state.token) clearSession();
    throw new Error(body?.error || `No se pudo completar la solicitud (${response.status}).`);
  }
  return body;
}

function setView(name) {
  const viewId = { courses: 'coursesView', enroll: 'enrollView', account: 'accountView' }[name];
  if (!viewId) return;
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
  $$('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  $('.main-nav').classList.remove('open');
  $('#menuToggle').setAttribute('aria-expanded', 'false');
  if (name === 'enroll') populateCourseSelect(enrollmentCourse, activeCourses());
  if (name === 'account' && state.user) {
    renderWorkspace();
    activatePanel(defaultPanel());
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function activeCourses() {
  if (state.user?.role === 'docente') {
    return state.courses.filter((course) => String(course.docente_id || '') === state.user.id);
  }
  return state.courses;
}

function courseCard(course, index) {
  const card = document.createElement('article');
  card.className = 'course-card';
  const art = document.createElement('div');
  art.className = 'course-art';
  art.dataset.tone = String(index % 6);
  const type = document.createElement('span');
  type.className = 'course-type';
  type.textContent = course.tipo || 'Curso';
  const symbol = document.createElement('span');
  symbol.className = 'course-art-symbol';
  symbol.textContent = ['✳', '◉', '⌘', '↗', '✦', '◒'][index % 6];
  art.append(type, symbol);

  const body = document.createElement('div');
  body.className = 'course-card-body';
  const title = document.createElement('h3');
  title.textContent = course.nombre || 'Curso de extensión';
  const teacher = document.createElement('p');
  teacher.className = 'course-teacher';
  teacher.textContent = `Con ${course.responsable || 'docente por asignar'}`;
  const meta = document.createElement('div');
  meta.className = 'course-meta';
  const hours = document.createElement('span');
  hours.textContent = `${course.duracion_horas || '—'} horas`;
  const mode = document.createElement('span');
  mode.textContent = course.modalidad || 'Modalidad por definir';
  meta.append(hours, mode);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'course-card-action';
  action.innerHTML = '<span>Quiero inscribirme</span><span aria-hidden="true">↗</span>';
  action.addEventListener('click', () => {
    setView('enroll');
    populateCourseSelect(enrollmentCourse, state.courses.filter((item) => item.estado !== 'Inactivo'));
    enrollmentCourse.value = String(course._id);
    $('#enrollmentForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  body.append(title, teacher, meta, action);
  card.append(art, body);
  return card;
}

function renderCourses() {
  const visible = state.courses.filter((course) => {
    if (course.estado === 'Inactivo') return false;
    const matchesType = state.filter === 'Todos' || course.tipo === state.filter;
    const searchable = `${course.nombre || ''} ${course.responsable || ''} ${course.tipo || ''}`.toLocaleLowerCase('es');
    return matchesType && searchable.includes(state.search);
  });
  courseGrid.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No encontramos cursos con esos criterios. Prueba otra búsqueda.';
    courseGrid.append(empty);
  } else {
    visible.forEach((course, index) => courseGrid.append(courseCard(course, index)));
  }
  $('#courseCount').textContent = `${visible.length} ${visible.length === 1 ? 'curso disponible' : 'cursos disponibles'}`;
}

function populateCourseSelect(select, courses, placeholder = 'Selecciona un curso', keepSelection = false) {
  if (!select) return;
  const selected = keepSelection ? select.value : '';
  select.replaceChildren(new Option(placeholder, ''));
  courses.forEach((course) => select.add(new Option(`${course.nombre} · ${course.tipo}`, course._id)));
  if (selected && courses.some((course) => String(course._id) === selected)) select.value = selected;
}

async function loadCourses() {
  try {
    state.courses = await api('/api/cursos');
    renderCourses();
    populateCourseSelect(enrollmentCourse, state.courses.filter((course) => course.estado !== 'Inactivo'));
    if (state.user) refreshWorkspaceCourses();
  } catch (error) {
    courseGrid.replaceChildren();
    const message = document.createElement('div');
    message.className = 'empty-state';
    message.textContent = `${error.message} Comprueba que la API está conectada a MongoDB.`;
    courseGrid.append(message);
    $('#courseCount').textContent = 'No disponible';
  }
}

async function loadTeachers() {
  const select = $('#teacherSelect');
  if (!select || state.user?.role !== 'admin') return;
  try {
    state.teachers = await api('/api/participantes?tipo_participante=Docente');
    select.replaceChildren(new Option('Selecciona un docente', ''));
    state.teachers.filter((teacher) => teacher.estado === 'Activo').forEach((teacher) => {
      select.add(new Option(teacher.nombre, teacher._id));
    });
    const course = activeCourses().find((item) => String(item._id) === $('#manageCourse').value);
    if (course) select.value = course.docente_id?._id || course.docente_id || '';
    if (!state.teachers.some((teacher) => teacher.estado === 'Activo')) {
      select.replaceChildren(new Option('No hay docentes registrados', ''));
    }
  } catch (error) {
    select.replaceChildren(new Option(error.message, ''));
  }
}

function setSession(result) {
  try {
    localStorage.setItem('aulaAbiertaToken', result.token);
  } catch (error) {
    throw new Error('No se pudo guardar la sesión en este navegador. Revisa la configuración de almacenamiento.');
  }
  state.token = result.token;
  state.user = result.user;
  $('#loginForm').reset();
  $('#studentRegisterForm').reset();
  renderWorkspace();
  activatePanel(defaultPanel());
  showToast(`Sesión iniciada como ${roleLabels[state.user.role]}.`);
}

function defaultPanel() {
  if (state.user?.role === 'estudiante') return 'studentPanel';
  if (state.user?.role === 'docente') return 'createPanel';
  return 'requestsPanel';
}

function renderWorkspace() {
  const authenticated = Boolean(state.user && state.token);
  $('#authPanel').classList.toggle('hidden', authenticated);
  $('#adminWorkspace').classList.toggle('hidden', !authenticated);
  if (!authenticated) return;

  $('#userName').textContent = state.user.nombre;
  $('#userRole').textContent = roleLabels[state.user.role];
  $('#userAvatar').textContent = state.user.nombre.trim().slice(0, 1).toLocaleUpperCase('es');
  const visibleTabs = [];
  $$('.admin-tab').forEach((tab) => {
    const allowed = tab.dataset.role === 'staff'
      ? ['admin', 'docente'].includes(state.user.role)
      : tab.dataset.role === state.user.role;
    tab.classList.toggle('hidden', !allowed);
    if (allowed) visibleTabs.push(tab);
  });
  $$('.admin-panel').forEach((panel) => {
    const role = panel.dataset.role;
    const allowed = role === 'staff'
      ? ['admin', 'docente'].includes(state.user.role)
      : role === state.user.role;
    panel.classList.toggle('hidden', !allowed);
    panel.classList.remove('active');
  });
  visibleTabs.forEach((tab, index) => tab.classList.toggle('active', index === 0));
  const firstPanel = visibleTabs[0]?.dataset.adminPanel;
  if (firstPanel) $(`#${firstPanel}`).classList.add('active');
  $('#teacherSelect').closest('label').classList.toggle('hidden', state.user.role !== 'admin');
  $('#teacherSelect').required = state.user.role === 'admin';
  refreshWorkspaceCourses();
}

function activatePanel(panelId) {
  const panel = $(`#${panelId}`);
  const tab = $(`.admin-tab[data-admin-panel="${panelId}"]`);
  if (!panel || !tab || tab.classList.contains('hidden')) return;
  $$('.admin-tab').forEach((item) => item.classList.toggle('active', item === tab));
  $$('.admin-panel').forEach((item) => item.classList.toggle('active', item === panel));
  if (panelId === 'requestsPanel') populateAdminCourses();
  if (panelId === 'createPanel') {
    populateManageCourses();
    if (state.user.role === 'admin') loadTeachers();
  }
  if (panelId === 'rosterPanel') populateRosterCourses();
  if (panelId === 'studentPanel') loadStudentEnrollments();
}

function refreshWorkspaceCourses() {
  populateManageCourses();
  populateRosterCourses();
  populateAdminCourses();
}

function populateManageCourses() {
  const select = $('#manageCourse');
  if (!select || !state.user || !['admin', 'docente'].includes(state.user.role)) return;
  const previous = select.value;
  populateCourseSelect(select, activeCourses(), 'Crear un curso nuevo');
  if (previous && activeCourses().some((course) => String(course._id) === previous)) {
    select.value = previous;
  }
}

function populateRosterCourses() {
  const select = $('#rosterCourse');
  if (!select || !state.user || !['admin', 'docente'].includes(state.user.role)) return;
  const previous = select.value;
  populateCourseSelect(select, activeCourses());
  if (previous && activeCourses().some((course) => String(course._id) === previous)) {
    select.value = previous;
  }
}

function populateAdminCourses() {
  if (!state.user || state.user.role !== 'admin') return;
  const previous = adminCourse.value;
  populateCourseSelect(adminCourse, state.courses, 'Selecciona un curso');
  if (previous && state.courses.some((course) => String(course._id) === previous)) {
    adminCourse.value = previous;
  }
  if (adminCourse.value) loadRequests();
  else {
    $('#pendingBadge').textContent = '0';
    $('#requestList').innerHTML = '<div class="empty-state">Selecciona un curso para consultar sus solicitudes.</div>';
  }
}

function setCourseForm(course = null) {
  const form = $('#courseForm');
  form.reset();
  $('#courseMessage').textContent = '';
  $('.course-status-label').classList.toggle('hidden', !course);
  $('#courseFormTitle').textContent = course ? 'Editar curso' : 'Crear un curso';
  $('#courseFormDescription').textContent = course
    ? 'Actualiza los datos de este curso.'
    : 'Publica un curso y asígnalo a un docente registrado.';
  $('#saveCourseButton').innerHTML = course
    ? 'Guardar cambios <span aria-hidden="true">✓</span>'
    : 'Publicar curso <span aria-hidden="true">↗</span>';
  $('#deleteCourseButton').classList.toggle('hidden', !course);
  if (!course) return;

  for (const field of ['nombre', 'tipo', 'duracion_horas', 'cupo_maximo', 'modalidad']) {
    form.elements[field].value = course[field] ?? '';
  }
  form.elements.estado.value = course.estado || 'Activo';
  if (state.user.role === 'admin') {
    form.elements.docente_id.value = course.docente_id?._id || course.docente_id || '';
  }
}

function renderRosterEnrollment(enrollment) {
  const card = document.createElement('article');
  card.className = 'request-card';
  const student = document.createElement('div');
  student.className = 'request-student';
  const name = document.createElement('strong');
  name.textContent = enrollment.participante_id?.nombre || 'Estudiante';
  const email = document.createElement('small');
  email.textContent = enrollment.participante_id?.email || 'Sin correo';
  student.append(name, email);
  const actions = document.createElement('div');
  actions.className = 'request-actions';
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.textContent = enrollment.estado;
  actions.append(status);
  if (enrollment.estado === 'Inscrito' || enrollment.estado === 'Confirmada') {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button button-outline button-small';
    edit.textContent = 'Editar nombre';
    edit.addEventListener('click', () => editParticipantName(enrollment.participante_id, edit));
    actions.append(edit);
  }
  card.append(student, actions);
  return card;
}

async function editParticipantName(participant, button) {
  if (!participant?._id) return;
  const name = window.prompt('Nombre del estudiante', participant.nombre || '');
  if (name === null) return;
  if (!name.trim() || name.trim().length > 100) {
    showToast('El nombre debe tener entre 1 y 100 caracteres.');
    return;
  }
  button.disabled = true;
  try {
    await api(`/api/participantes/${encodeURIComponent(participant._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: name.trim() })
    });
    showToast('Nombre del participante actualizado.');
    await loadRoster();
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

async function loadRoster() {
  const courseId = $('#rosterCourse').value;
  const list = $('#rosterList');
  if (!courseId) {
    list.innerHTML = '<div class="empty-state">Selecciona un curso para consultar sus participantes.</div>';
    return;
  }
  list.innerHTML = '<div class="empty-state">Buscando participantes…</div>';
  try {
    const enrollments = await api(`/api/cursos/${encodeURIComponent(courseId)}/estudiantes`);
    list.replaceChildren();
    if (!enrollments.length) {
      list.innerHTML = '<div class="empty-state">Este curso todavía no tiene solicitudes de inscripción.</div>';
      return;
    }
    enrollments.forEach((enrollment) => list.append(renderRosterEnrollment(enrollment)));
  } catch (error) {
    list.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'empty-state';
    message.textContent = error.message;
    list.append(message);
  }
}

async function loadStudentEnrollments() {
  const list = $('#studentEnrollmentList');
  list.innerHTML = '<div class="empty-state">Cargando tus inscripciones…</div>';
  try {
    const enrollments = await api('/api/inscripciones');
    list.replaceChildren();
    if (!enrollments.length) {
      list.innerHTML = '<div class="empty-state">Todavía no tienes inscripciones. Explora el catálogo para encontrar tu próximo curso.</div>';
      return;
    }
    enrollments.forEach((enrollment) => {
      const card = document.createElement('article');
      card.className = 'request-card';
      const course = document.createElement('div');
      course.className = 'request-student';
      const title = document.createElement('strong');
      title.textContent = enrollment.curso_id?.nombre || 'Curso';
      const date = document.createElement('small');
      date.textContent = enrollment.fecha_inscripcion
        ? `Solicitud: ${new Date(enrollment.fecha_inscripcion).toLocaleDateString('es')}`
        : 'Solicitud registrada';
      course.append(title, date);
      const actions = document.createElement('div');
      actions.className = 'request-actions';
      const status = document.createElement('span');
      status.className = 'status-pill';
      status.textContent = enrollment.estado;
      actions.append(status);
      if (['Pendiente', 'Inscrito', 'Confirmada'].includes(enrollment.estado)) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button button-outline button-small';
        cancel.textContent = 'Cancelar';
        cancel.addEventListener('click', () => cancelEnrollment(enrollment._id, cancel));
        actions.append(cancel);
      }
      card.append(course, actions);
      list.append(card);
    });
  } catch (error) {
    list.replaceChildren();
    const message = document.createElement('div');
    message.className = 'empty-state';
    message.textContent = error.message;
    list.append(message);
  }
}

async function cancelEnrollment(enrollmentId, button) {
  if (!window.confirm('¿Quieres cancelar esta inscripción?')) return;
  button.disabled = true;
  try {
    await api(`/api/inscripciones/${encodeURIComponent(enrollmentId)}/cancelar`, { method: 'PATCH' });
    showToast('Inscripción cancelada.');
    await loadStudentEnrollments();
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

async function registerTeacher(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#teacherMessage');
  const submit = $('button[type="submit"]', form);
  if (!form.reportValidity()) return;
  submit.disabled = true;
  showMessage(message, '');
  try {
    const values = Object.fromEntries(new FormData(form));
    values.tipo_participante = 'Docente';
    await api('/api/participantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    form.reset();
    showMessage(message, 'Docente registrado. Ya puede iniciar sesión y gestionar sus cursos.');
    showToast('Docente agregado al equipo.');
    await loadTeachers();
  } catch (error) {
    showMessage(message, error.message, true);
  } finally {
    submit.disabled = false;
  }
}

$('#courseSearch').addEventListener('input', (event) => {
  state.search = event.target.value.trim().toLocaleLowerCase('es');
  renderCourses();
});

$('#courseFilters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  $$('.filter-chip').forEach((chip) => chip.classList.toggle('selected', chip === button));
  renderCourses();
});

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) setView(viewButton.dataset.view);
});

$('#menuToggle').addEventListener('click', () => {
  const open = $('.main-nav').classList.toggle('open');
  $('#menuToggle').setAttribute('aria-expanded', String(open));
});

$('#receiptFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  $('#receiptLabel').textContent = file ? file.name : 'Selecciona tu comprobante';
  if (file && file.size > 5 * 1024 * 1024) {
    event.target.value = '';
    $('#receiptLabel').textContent = 'Selecciona tu comprobante';
    showMessage($('#enrollmentMessage'), 'El archivo supera el límite de 5 MB.', true);
  } else {
    showMessage($('#enrollmentMessage'), '');
  }
});

$('#enrollmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#enrollmentMessage');
  const submit = $('button[type="submit"]', form);
  const file = $('#receiptFile').files[0];
  if (!state.user || state.user.role !== 'estudiante') {
    showMessage(message, 'Inicia sesión con una cuenta de estudiante para inscribirte.', true);
    setView('account');
    return;
  }
  if (!file) return showMessage(message, 'Adjunta tu comprobante para continuar.', true);
  if (file.size > 5 * 1024 * 1024) return showMessage(message, 'El archivo supera el límite de 5 MB.', true);
  if (!form.reportValidity()) return;

  submit.disabled = true;
  submit.textContent = 'Enviando solicitud…';
  showMessage(message, '');
  try {
    const registration = await api('/api/inscripciones', {
      method: 'POST',
      body: new FormData(form)
    });
    form.reset();
    $('#receiptLabel').textContent = 'Selecciona tu comprobante';
    showMessage(message, `¡Listo! Tu solicitud quedó ${registration.estado.toLowerCase()}. Administración revisará tu comprobante.`);
    showToast('Solicitud enviada. ¡Gracias por dar el primer paso!');
  } catch (error) {
    showMessage(message, error.message, true);
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Enviar solicitud <span aria-hidden="true">↗</span>';
  }
});

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#loginMessage');
  const submit = $('button[type="submit"]', form);
  submit.disabled = true;
  showMessage(message, '');
  try {
    const credentials = Object.fromEntries(new FormData(form));
    setSession(await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    }));
  } catch (error) {
    showMessage(message, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

$('#studentRegisterForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#registerMessage');
  const submit = $('button[type="submit"]', form);
  if (!form.reportValidity()) return;
  submit.disabled = true;
  showMessage(message, '');
  try {
    const values = Object.fromEntries(new FormData(form));
    setSession(await api('/api/auth/student/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    }));
  } catch (error) {
    showMessage(message, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

async function loadRequests() {
  const courseId = adminCourse.value;
  const list = $('#requestList');
  if (!courseId) return;
  list.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Buscando solicitudes…';
  list.append(loading);
  try {
    const requests = await api(`/api/cursos/${encodeURIComponent(courseId)}/inscripciones-pendientes`);
    $('#pendingBadge').textContent = String(requests.length);
    list.replaceChildren();
    if (!requests.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '¡Todo al día! No hay solicitudes pendientes para este curso.';
      list.append(empty);
      return;
    }
    requests.forEach((request) => list.append(requestCard(request)));
  } catch (error) {
    list.replaceChildren();
    const message = document.createElement('div');
    message.className = 'empty-state';
    message.textContent = error.message;
    list.append(message);
  }
}

function requestCard(request) {
  const card = document.createElement('article');
  card.className = 'request-card';
  const student = document.createElement('div');
  student.className = 'request-student';
  const name = document.createElement('strong');
  name.textContent = request.participante_id?.nombre || 'Estudiante';
  const email = document.createElement('small');
  email.textContent = request.participante_id?.email || 'Sin correo';
  student.append(name, email);
  const actions = document.createElement('div');
  actions.className = 'request-actions';
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.textContent = 'Pendiente';
  const receipt = document.createElement('button');
  receipt.type = 'button';
  receipt.className = 'button button-outline button-small';
  receipt.textContent = 'Descargar comprobante ↗';
  receipt.addEventListener('click', () => downloadReceipt(request._id, receipt));
  const approve = document.createElement('button');
  approve.type = 'button';
  approve.className = 'button button-dark button-small';
  approve.textContent = 'Aprobar ✓';
  approve.addEventListener('click', () => approveRequest(request._id, approve));
  actions.append(status, receipt, approve);
  card.append(student, actions);
  return card;
}

async function downloadReceipt(registrationId, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/inscripciones/${encodeURIComponent(registrationId)}/comprobante`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json() : null;
      if (response.status === 401) clearSession();
      throw new Error(body?.error || 'No se pudo abrir el comprobante.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprobante-${registrationId}`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function approveRequest(registrationId, button) {
  button.disabled = true;
  try {
    await api(`/api/inscripciones/${encodeURIComponent(registrationId)}/aprobar`, { method: 'PATCH' });
    showToast('Inscripción aprobada. El estado ahora es Inscrito.');
    await loadRequests();
    await loadRoster();
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

$('#adminCourse').addEventListener('change', loadRequests);
$('#refreshRequests').addEventListener('click', loadRequests);
$('#rosterCourse').addEventListener('change', loadRoster);
$('#refreshStudentEnrollments').addEventListener('click', loadStudentEnrollments);

$$('.admin-tab').forEach((tab) => tab.addEventListener('click', () => activatePanel(tab.dataset.adminPanel)));

$('#teacherForm').addEventListener('submit', registerTeacher);

$('#manageCourse').addEventListener('change', () => {
  const course = activeCourses().find((item) => String(item._id) === $('#manageCourse').value);
  setCourseForm(course || null);
});

$('#courseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#courseMessage');
  const submit = $('button[type="submit"]', form);
  if (!form.reportValidity()) return;
  submit.disabled = true;
  showMessage(message, '');
  try {
    const values = Object.fromEntries(new FormData(form));
    values.duracion_horas = Number(values.duracion_horas);
    values.cupo_maximo = Number(values.cupo_maximo);
    values.estado = values.estado || 'Activo';
    if (state.user.role === 'docente') delete values.docente_id;
    const courseId = $('#manageCourse').value;
    await api(courseId ? `/api/cursos/${encodeURIComponent(courseId)}` : '/api/cursos', {
      method: courseId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    showMessage(message, courseId ? 'Curso actualizado correctamente.' : 'Curso publicado y docente asignado correctamente.');
    showToast(courseId ? 'Cambios guardados.' : 'El nuevo curso ya está disponible en el catálogo.');
    if (!courseId) {
      form.reset();
      $('#manageCourse').value = '';
    }
    await loadCourses();
  } catch (error) {
    showMessage(message, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

$('#deleteCourseButton').addEventListener('click', async () => {
  const courseId = $('#manageCourse').value;
  if (!courseId || !window.confirm('¿Eliminar este curso? No se podrá borrar si ya tiene inscripciones o asignaciones.')) return;
  const button = $('#deleteCourseButton');
  button.disabled = true;
  try {
    await api(`/api/cursos/${encodeURIComponent(courseId)}`, { method: 'DELETE' });
    showToast('Curso eliminado.');
    await loadCourses();
    $('#manageCourse').value = '';
    setCourseForm();
  } catch (error) {
    showMessage($('#courseMessage'), error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('#logoutButton').addEventListener('click', () => {
  clearSession();
  $('#pendingBadge').textContent = '0';
  showToast('Sesión cerrada.');
});

$('#year').textContent = String(new Date().getFullYear());

async function restoreSession() {
  const token = localStorage.getItem('aulaAbiertaToken');
  if (!token) return;
  state.token = token;
  try {
    const result = await api('/api/auth/me');
    state.user = result.user;
    renderWorkspace();
  } catch (error) {
    if (!state.token) {
      showToast('Tu sesión expiró. Inicia sesión nuevamente.');
    } else {
      showToast(error.message);
    }
  }
}

loadCourses();
restoreSession();
