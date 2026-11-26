'use strict';

const areas = {
  msc: '전공기초', required: '전공필수', elective: '전공선택',
  common: '공통교양', core: '핵심교양', free: '일반선택'
};
const targetKeys = ['total', 'msc', 'required', 'elective', 'common', 'core', 'limit'];
const targetLabels = { ...areas, total: '총 졸업학점', limit: '학기 수강 한도' };
const colleges = {
  '공과대학': ['컴퓨터공학과', '정보통신공학과', '전자공학과', '전기공학과', '기계공학과', '화학공학과', '신소재공학과', '환경에너지공학과', '토목환경공학과', '산업경영공학과'],
  'ICT융합대학': ['정보통신공학과', '컴퓨터공학과'],
  '자연과학대학': ['수학과', '물리학과', '화학과', '식품영양학과', '생명과학정보학과'],
  '건축대학': ['건축학전공', '전통건축전공', '공간디자인전공'],
  '예술체육대학': ['디자인학부', '스포츠학부', '바둑학과'],
  '기타': []
};
const example = {
  sample: true, year: '2022', college: '공과대학', department: '컴퓨터공학과',
  targets: { total: 134, msc: 24, required: 24, elective: 36, common: 15, core: 12, limit: 24 },
  rules: [
    { name: '미적분학1', area: 'msc', credits: 30, next: ['공학수학1', '공업수학1'] },
    { name: '자료구조', area: 'required', credits: 30, next: ['알고리즘'] },
    { name: '캡스톤디자인', area: 'required', credits: 30, next: [] }
  ]
};
const examplesByArea = {
  msc: '미적분학2,선형대수학개론,통계학개론,이산수학개론,일반물리학,일반화학',
  required: '프로그래밍기초,객체지향프로그래밍,컴퓨터구조,운영체제',
  elective: '웹프로그래밍,데이터베이스,컴퓨터네트워크,소프트웨어공학,인공지능개론',
  common: '영어1,영어2,영어회화1,영어회화2,글쓰기,발표와토론',
  core: '철학의이해,현대사회와윤리,과학기술의이해',
  free: '경제학개론,생활체육'
};
const key = (name) => name.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
const number = (units) => String(units / 10);
const format = (units) => number(units) + '학점';
const sum = (rows) => rows.reduce((total, row) => total + row.credits, 0);
const toUnits = (value, min, max) => {
  if (!/^\d+(?:\.\d)?$/.test(value)) return null;
  const parsed = Math.round(Number(value) * 10);
  return parsed >= min && parsed <= max ? parsed : null;
};
const percent = (earned, target) => target ? Math.round(earned / target * 1000) / 10 : 100;
const hasName = (rows, name) => rows.some((row) => key(row.name) === key(name));

function audit(profile, completed, planned) {
  const missing = profile.rules.filter((rule) => !hasName(completed, rule.name));
  const blockers = (course) => missing.filter((rule) => rule.next.some((name) => key(name) === key(course.name)));
  const simulated = planned.filter((course) => course.enabled && blockers(course).length === 0);
  const counted = completed.concat(simulated);
  const raw = Object.fromEntries(Object.keys(areas).map((area) => [area, 0]));
  for (const course of counted) raw[course.area] += course.credits;
  const metrics = Object.keys(areas).filter((area) => area !== 'free').map((area) => {
    const target = profile.targets[area] * 10;
    const earned = raw[area];
    return { area, target, earned, excess: Math.max(0, earned - target), left: Math.max(0, target - earned) };
  });
  const excess = metrics.reduce((total, item) => total + item.excess, 0);
  const total = sum(counted);
  const goal = profile.targets.total * 10;
  const remaining = Math.max(0, goal - total);
  const pending = missing.filter((rule) => !hasName(simulated, rule.name));
  return {
    metrics, excess, free: raw.free + excess, total, goal, remaining, missing, pending, blockers,
    selected: sum(planned.filter((course) => course.enabled)), projected: sum(simulated),
    isComplete: remaining === 0 && metrics.every((item) => item.left === 0) && pending.length === 0
  };
}

if (typeof module !== 'undefined') module.exports = { audit, toUnits, key, example };

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const options = (items) => Object.entries(items).map(([value, label]) =>
    '<option value="' + escape(value) + '">' + escape(label) + '</option>').join('');
  const exampleRows = () => Object.entries(examplesByArea).flatMap(([area, names]) =>
    names.split(',').map((name) => ({ name, area, credits: 30 })));
  let profile = example;
  let completed = exampleRows();
  let planned = [];
  let view = 'dashboard';
  let filter = 'all';
  let settingsHaveExample = false;
  let editingPlan = null;
  let toastTimer;

  function showError(element, message, inputs = []) {
    element.textContent = message;
    element.hidden = !message;
    for (const input of inputs) input.setAttribute('aria-invalid', 'true');
    inputs[0]?.focus();
  }

  function courseFields(mode) {
    const isPlan = mode === 'plan';
    $(mode + '-form').innerHTML =
      '<label>과목명<input name="courseName" maxlength="30" placeholder="예: ' + (isPlan ? '미적분학1' : '자료구조') + '"></label>' +
      '<label>이수구분<select name="area">' + options(areas) + '</select></label>' +
      '<label>학점<input name="credits" type="text" inputmode="decimal" placeholder="3" maxlength="3"></label>' +
      '<button class="button primary" type="submit">' + (isPlan ? '추가' : '＋ 과목 추가') + '</button>' +
      (isPlan ? '<button id="cancel-edit" type="button" class="button small" hidden>수정 취소</button>' : '') +
      '<p class="error" role="alert" hidden></p>';
  }

  function changeView(next, focus = true) {
    view = next;
    for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== next;
    for (const button of document.querySelectorAll('.steps button')) {
      if (button.dataset.view === next) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    if (next === 'settings') populateSettings();
    if (next === 'courses') renderCourses();
    if (next === 'dashboard') renderDashboard();
    if (focus) {
      $(next + '-title').focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function renderCourses() {
    $('courses-context').textContent = profileText() + (profile.sample ? ' · 예시 과목이 입력되어 있습니다.' : '');
    $('course-total').textContent = '현재 총 ' + format(sum(completed)) + ' 입력됨';
    $('course-list').innerHTML = ledger(completed, 'course');
    if (completed.length) showError($('diagnose-error'), '');
  }

  function profileText() {
    return profile.year.slice(2) + '학번 ' + profile.department;
  }

  function ledger(rows, mode, results) {
    const isPlan = mode === 'plan';
    if (rows.length === 0) return '<p class="empty">' + (isPlan ? '등록된 예정 과목이 없습니다.' : '등록된 이수 과목이 없습니다.') + '</p>';
    const lines = rows.map((row, i) => {
      const name = escape(row.name);
      const blockedBy = isPlan ? results.blockers(row) : [];
      return '<tr><td><strong>' + name + '</strong>' +
        (blockedBy.length ? '<span class="course-note">선이수 필요 · ' + escape(blockedBy.map((rule) => rule.name).join(', ')) + '</span>' : '') +
        '</td><td><span class="pill info">' + areas[row.area] + '</span></td><td class="credit">' + format(row.credits) + '</td>' +
        (isPlan ? '<td><input type="checkbox" data-action="toggle" data-index="' + i + '" aria-label="' + name + ' 시뮬레이션에 반영" ' + (row.enabled ? 'checked' : '') + '></td>' : '') +
        '<td><div class="line-actions">' +
        (isPlan ? '<button type="button" class="button" data-action="edit" data-index="' + i + '" aria-label="' + name + ' 수정">수정</button>' : '') +
        '<button type="button" class="button" data-action="delete" data-index="' + i + '" aria-label="' + name + ' 삭제">삭제</button></div></td></tr>';
    }).join('');
    return '<table class="ledger"><thead><tr><th scope="col">과목명</th><th scope="col">이수구분</th><th scope="col">학점</th>' +
      (isPlan ? '<th scope="col">반영</th>' : '') + '<th scope="col">관리</th></tr></thead><tbody>' + lines + '</tbody></table>';
  }

  function warnings(results, onlyPrerequisites) {
    const displayed = onlyPrerequisites ? results.missing.filter((rule) => rule.next.length) : results.missing;
    if (!displayed.length) return '<p class="empty">' + (profile.rules.length ? '등록한 기준에서 미이수 ' + (onlyPrerequisites ? '선이수' : '필수') + ' 과목이 없습니다.' : '등록된 필수·선이수 과목이 없습니다.') + '</p>';
    return '<div class="alert-list">' + displayed.map((rule) => {
      const inPlan = hasName(planned, rule.name);
      const title = escape(rule.name);
      return '<article class="warning"><div><span class="pill">' + (rule.next.length ? '최우선 수강' : '미이수 필수') +
        '</span> <strong>' + title + '</strong></div><p>' + (rule.next.length ?
          title + ' 미이수로 다음 학기 ' + escape(rule.next.join('·')) + ' 수강이 제한됩니다.' : '졸업 기준에 등록된 필수과목입니다.') +
        '</p><button class="text-button" type="button" data-recommend="' + profile.rules.indexOf(rule) + '" ' +
        (inPlan ? 'disabled' : '') + '>' + (inPlan ? '계획에 등록됨' : '＋ 다음 학기 계획에 담기') + '</button></article>';
    }).join('') + '</div>';
  }

  function metric(item) {
    const ratio = percent(item.earned, item.target);
    const status = item.left ? format(item.left) + ' 미달' : '이수 완료';
    const color = item.left ? '' : ' done';
    return '<div class="metric"><span class="metric-name">' + areas[item.area] + (item.area === 'msc' ? ' <small>MSC</small>' : '') +
      '</span><div class="bar' + color + '" role="progressbar" aria-label="' + areas[item.area] + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(100, ratio) +
      '" aria-valuetext="' + ratio + '%" title="' + ratio + '%"><i style="width:' + Math.min(100, ratio) + '%"></i></div>' +
      '<span class="value"><strong>' + number(item.earned) + '</strong> / ' + number(item.target) + '<small class="ratio">' + ratio + '%</small></span><span class="pill' + color + '">' + status + '</span>' +
      (item.excess ? '<span class="transfer">초과 ' + format(item.excess) + ' → 일반선택 반영</span>' : '') + '</div>';
  }

  function renderDashboard() {
    const results = audit(profile, completed, planned);
    const rate = percent(results.total, results.goal);
    $('profile-kind').textContent = profile.sample ? '예시 기준' : '직접 입력';
    $('active-profile').textContent = profileText() + ' 졸업 기준 적용됨';
    $('own-profile').textContent = profile.sample ? '내 기준으로 시작' : '기준 변경';
    $('ring').style.setProperty('--angle', Math.min(100, rate) * 3.6 + 'deg');
    $('ring').setAttribute('aria-label', '총학점 달성률 ' + rate + '%');
    $('total-percent').textContent = rate + '%';
    $('summary-mode').textContent = results.projected ? '시뮬레이션' : '이수 기준';
    $('earned-label').textContent = results.projected ? '예상 취득' : '취득 학점';
    for (const [id, units] of [['sum-earned', results.total], ['sum-goal', results.goal], ['sum-left', results.remaining]]) {
      $(id).innerHTML = number(units) + '<small>학점</small>';
    }
    $('overall').textContent = results.isComplete ? (results.projected ? '계획 반영 시 등록한 교과 요건 충족' : '등록한 교과 요건 충족') : '등록한 교과 요건 미충족';
    $('warning-count').textContent = results.missing.filter((rule) => rule.next.length).length;
    for (const button of document.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    const rows = results.metrics.filter((item, index) => filter === 'all' || (filter === 'major' && index < 3) || (filter === 'liberal' && index >= 3));
    $('requirements-list').innerHTML = filter === 'warnings' ? warnings(results, true) : rows.map(metric).join('') +
      (filter === 'all' ? '<div class="metric"><span class="metric-name">일반선택</span><span></span><span class="value"><strong>' + format(results.free) +
      '</strong></span><span class="pill info">' + (results.excess ? '초과분 포함' : '취득 학점') + '</span></div>' : '');
    $('alerts').innerHTML = warnings(results, false);
    $('plan-total').textContent = '계획 ' + format(results.selected) + ' / 한도 ' + profile.targets.limit + '학점' +
      (results.selected !== results.projected ? ' · 반영 ' + format(results.projected) : '');
    $('limit-note').hidden = results.selected <= profile.targets.limit * 10;
    $('limit-note').textContent = '학기당 최대 수강 가능 학점(' + profile.targets.limit + '학점)을 초과했습니다.';
    $('reset-plan').disabled = planned.length === 0;
    $('plan-list').innerHTML = ledger(planned, 'plan', results);
  }

  function changePlan() {
    renderDashboard();
    if (!$('limit-note').hidden) {
      $('toast').textContent = $('limit-note').textContent;
      $('toast').hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4300);
    } else {
      $('toast').hidden = true;
    }
  }

  function resetForm(mode) {
    const form = $(mode + '-form');
    form.reset();
    for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
    showError(form.querySelector('.error'), '');
    if (mode === 'plan') {
      editingPlan = null;
      form.querySelector('[type=submit]').textContent = '추가';
      $('cancel-edit').hidden = true;
    }
  }

  function submitCourse(event, mode) {
    event.preventDefault();
    const form = event.target;
    const nameInput = form.elements.courseName;
    const creditInput = form.elements.credits;
    const name = nameInput.value.trim();
    const credits = toUnits(creditInput.value.trim(), 5, 60);
    const error = form.querySelector('.error');
    for (const input of [nameInput, creditInput]) input.removeAttribute('aria-invalid');
    if (!name || name.length > 30) return showError(error, '과목명은 1~30자 이내로 입력해주세요.', [nameInput]);
    if (credits === null) return showError(error, '학점은 0.5~6.0 사이의 숫자로 입력해주세요.', [creditInput]);
    const peers = mode === 'plan' ? completed.concat(planned.filter((row) => row !== editingPlan)) : completed;
    if (hasName(peers, name)) return showError(error, '이미 등록된 과목명입니다.', [nameInput]);
    const course = { name, area: form.elements.area.value, credits };
    if (mode === 'plan') {
      if (editingPlan) Object.assign(editingPlan, course);
      else planned.push({ ...course, enabled: true });
      changePlan();
    } else {
      completed.push(course);
      if (editingPlan && key(editingPlan.name) === key(name)) resetForm('plan');
      planned = planned.filter((row) => key(row.name) !== key(name));
      renderCourses();
    }
    resetForm(mode);
    nameInput.focus();
  }

  function departments(selected = '') {
    const names = colleges[$('college').value] || [];
    $('department').innerHTML = '<option value="">학과 선택</option>' +
      options(Object.fromEntries(names.map((name) => [name, name]))) + '<option value="custom">학과 직접 입력</option>';
    $('department').value = names.includes(selected) || !selected ? selected : 'custom';
    $('custom-row').hidden = $('department').value !== 'custom';
    $('custom-department').value = $('custom-row').hidden || selected === 'custom' ? '' : selected;
  }

  function addRule(rule) {
    const row = document.createElement('div');
    row.className = 'rule-row';
    row.innerHTML = '<label>필수과목명<input data-rule="name" maxlength="30" placeholder="필수과목명"></label>' +
      '<label>이수구분<select data-rule="area">' + options({ msc: areas.msc, required: areas.required }) + '</select></label>' +
      '<label>학점<input data-rule="credits" inputmode="decimal" placeholder="3" maxlength="3"></label>' +
      '<label>후수 과목<input data-rule="next" placeholder="없으면 비워두기 · 쉼표로 구분"></label>' +
      '<button type="button" class="button small" data-rule-remove>삭제</button>';
    if (rule) {
      row.querySelector('[data-rule=name]').value = rule.name;
      row.querySelector('[data-rule=area]').value = rule.area;
      row.querySelector('[data-rule=credits]').value = number(rule.credits);
      row.querySelector('[data-rule=next]').value = rule.next.join(', ');
    }
    $('rule-fields').append(row);
    if (!rule) row.querySelector('input').focus();
  }

  function populateSettings() {
    settingsHaveExample = false;
    const initial = profile.sample ? null : profile;
    $('year').value = initial?.year || '';
    $('college').value = initial?.college || '';
    departments(initial?.department);
    for (const field of targetKeys) $('target-' + field).value = initial?.targets[field] ?? (field === 'limit' ? 24 : '');
    $('rule-fields').replaceChildren();
    for (const rule of initial?.rules || []) addRule(rule);
    $('profile-notice').textContent = '공식 학번·학과별 기준표가 제공되지 않아 직접 입력한 기준으로 계산합니다. 기본 수강 한도 24학점은 예시이므로 본인 한도에 맞게 수정하세요.';
    showError($('profile-error'), '');
    for (const field of $('profile-form').querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
  }

  function applyExample() {
    $('year').value = example.year;
    $('college').value = example.college;
    departments(example.department);
    for (const field of targetKeys) $('target-' + field).value = example.targets[field];
    $('rule-fields').replaceChildren();
    for (const rule of example.rules) addRule(rule);
    settingsHaveExample = true;
    $('profile-notice').textContent = 'PRD의 예시 시나리오를 불러왔습니다. 학점과 필수·선이수 관계는 계산 체험용입니다.';
    showError($('profile-error'), '');
    for (const field of $('profile-form').querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
  }

  function submitProfile(event) {
    event.preventDefault();
    const error = $('profile-error');
    for (const field of event.target.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
    const year = $('year').value;
    const college = $('college').value;
    const department = $('department').value === 'custom' ? $('custom-department').value.trim() : $('department').value;
    if (!year || !college || !department) {
      const missing = [!year && $('year'), !college && $('college'), !department && ($('department').value === 'custom' ? $('custom-department') : $('department'))];
      return showError(error, '입학년도와 소속 학과를 모두 선택해주세요.', missing.filter(Boolean));
    }
    const targets = {};
    for (const field of targetKeys) {
      const input = $('target-' + field);
      const min = field === 'total' || field === 'limit' ? 5 : 0;
      const units = toUnits(input.value.trim(), min, 5000);
      if (units === null) return showError(error, targetLabels[field] + '에 ' + (min ? '0.5' : '0') + '~500 사이의 학점을 입력해주세요.', [input]);
      targets[field] = units / 10;
    }
    const rules = [];
    for (const row of $('rule-fields').children) {
      const nameInput = row.querySelector('[data-rule=name]');
      const creditInput = row.querySelector('[data-rule=credits]');
      const nextInput = row.querySelector('[data-rule=next]');
      const name = nameInput.value.trim();
      const credits = toUnits(creditInput.value.trim(), 5, 60);
      const next = nextInput.value.split(',').map((part) => part.trim()).filter(Boolean);
      if (!name || name.length > 30 || hasName(rules, name)) return showError(error, '필수과목명은 1~30자로 중복 없이 입력해주세요.', [nameInput]);
      if (credits === null) return showError(error, '학점은 0.5~6.0 사이의 숫자로 입력해주세요.', [creditInput]);
      if (next.some((part) => part.length > 30 || key(part) === key(name))) return showError(error, '후수 과목은 필수과목과 다른 이름으로 30자 이내로 입력해주세요.', [nextInput]);
      rules.push({ name, area: row.querySelector('[data-rule=area]').value, credits, next });
    }
    const sample = settingsHaveExample;
    if (sample !== profile.sample) {
      completed = sample ? exampleRows() : [];
      planned = [];
      resetForm('plan');
    }
    profile = { sample, year, college, department, targets, rules };
    changeView('courses');
  }

  $('year').insertAdjacentHTML('beforeend', options(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(2020 + i), (20 + i) + '학번 (' + (2020 + i) + ')']))));
  $('college').insertAdjacentHTML('beforeend', options(Object.fromEntries(Object.keys(colleges).map((name) => [name, name]))));
  $('targets').innerHTML = targetKeys.map((field) => '<label>' + targetLabels[field] +
    '<input id="target-' + field + '" inputmode="decimal" placeholder="학점"></label>').join('');
  courseFields('course');
  courseFields('plan');

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view) changeView(button.dataset.view);
    if (button.dataset.filter) {
      filter = button.dataset.filter;
      renderDashboard();
    }
    if (button.hasAttribute('data-rule-remove')) button.closest('.rule-row').remove();
    if (button.dataset.recommend !== undefined) {
      const rule = profile.rules[Number(button.dataset.recommend)];
      if (!hasName(planned, rule.name)) planned.push({ ...rule, enabled: true });
      changePlan();
      $('plan-title').scrollIntoView({ block: 'nearest' });
      $('plan-form').elements.courseName.focus({ preventScroll: true });
    }
    if (!button.dataset.action) return;
    const isPlan = Boolean(button.closest('#plan-list'));
    const rows = isPlan ? planned : completed;
    const index = Number(button.dataset.index);
    if (button.dataset.action === 'delete') {
      if (rows[index] === editingPlan) resetForm('plan');
      rows.splice(index, 1);
      if (isPlan) changePlan();
      else renderCourses();
      $(isPlan ? 'plan-form' : 'course-form').elements.courseName.focus({ preventScroll: true });
    }
    if (button.dataset.action === 'edit') {
      resetForm('plan');
      editingPlan = rows[index];
      const form = $('plan-form');
      form.elements.courseName.value = editingPlan.name;
      form.elements.area.value = editingPlan.area;
      form.elements.credits.value = number(editingPlan.credits);
      form.querySelector('[type=submit]').textContent = '수정 저장';
      $('cancel-edit').hidden = false;
      form.elements.courseName.focus();
    }
  });
  $('plan-list').addEventListener('change', (event) => {
    if (event.target.dataset.action !== 'toggle') return;
    const index = Number(event.target.dataset.index);
    planned[index].enabled = event.target.checked;
    changePlan();
    $('plan-list').querySelector('[data-action=toggle][data-index="' + index + '"]').focus({ preventScroll: true });
  });
  $('course-form').addEventListener('submit', (event) => submitCourse(event, 'course'));
  $('plan-form').addEventListener('submit', (event) => submitCourse(event, 'plan'));
  $('profile-form').addEventListener('submit', submitProfile);
  $('college').addEventListener('change', () => departments());
  $('department').addEventListener('change', () => { $('custom-row').hidden = $('department').value !== 'custom'; });
  $('load-example').addEventListener('click', applyExample);
  $('add-rule').addEventListener('click', () => addRule());
  $('own-profile').addEventListener('click', () => changeView('settings'));
  $('reset-plan').addEventListener('click', () => {
    planned = [];
    resetForm('plan');
    changePlan();
    $('plan-form').elements.courseName.focus();
  });
  $('cancel-edit').addEventListener('click', () => {
    resetForm('plan');
    $('plan-form').elements.courseName.focus();
  });
  $('diagnose').addEventListener('click', () => {
    if (!completed.length) return showError($('diagnose-error'), '최소 1개 이상의 이수 과목을 추가해주세요.');
    changeView('dashboard');
  });
  changeView(view, false);
}
