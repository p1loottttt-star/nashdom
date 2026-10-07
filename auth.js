// Вход и первые шаги в облачном режиме: аккаунт → имя → свой дом или вход по приглашению → перенос старых данных.
const gate = document.getElementById('gate');
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(Boolean)); return e; };
const field = (name, props) => h('input', { name, required: true, ...props });
const RU = [
  [/Invalid login credentials/i, 'Неверная почта или пароль'],
  [/already registered/i, 'Такой аккаунт уже есть — войди'],
  [/at least 6/i, 'Пароль — минимум 6 символов'],
  [/rate limit/i, 'Слишком много попыток, подожди минуту'],
  [/bad invite/i, 'Такого приглашения нет — проверь код'],
  [/couple is full/i, 'В этом доме уже двое'],
  [/valid email|invalid format/i, 'Проверь почту — похоже, опечатка'],
];
const ru = (e) => RU.find(([re]) => re.test(e?.message || ''))?.[1] || e?.message || 'Что-то пошло не так';

// показать форму и ждать, пока onSubmit не вернёт результат (ошибка → текст под формой)
function screen(title, text, kids, onSubmit, extra = [], label = 'дальше') {
  return new Promise((done) => {
    const err = h('p', { className: 'err', hidden: true });
    const btn = h('button', { textContent: label });
    const form = h('form', {}, h('h3', { textContent: title }), text && h('p', { textContent: text }), ...kids, err, btn, ...extra);
    form.onsubmit = async (e) => {
      e.preventDefault();
      btn.disabled = true; err.hidden = true;
      try { const r = await onSubmit(new FormData(form), e.submitter); if (r !== undefined) { gate.hidden = true; done(r); } }
      catch (x) { err.textContent = ru(x); err.hidden = false; }
      btn.disabled = false;
    };
    gate.replaceChildren(form);
    gate.hidden = false;
    form.querySelector('input')?.focus();
  });
}

export function signIn(sb) {
  const signup = h('button', { className: 'ghost', textContent: 'создать аккаунт', name: 'signup', value: '1' });
  const note = h('p', { className: 'hint', textContent: 'Свой 3D-дом для двоих: записки, фото, планы и кино вместе.' });
  return screen('Наш дом ♥', null, [note,
    field('email', { type: 'email', placeholder: 'почта', autocomplete: 'email' }),
    field('password', { type: 'password', placeholder: 'пароль (от 6 символов)', minLength: 6, autocomplete: 'current-password' }),
  ], async (f, by) => {
    const cred = { email: f.get('email').trim(), password: f.get('password') };
    if (by?.name === 'signup') {
      const { data, error } = await sb.auth.signUp({ ...cred, options: { emailRedirectTo: location.href } }); // ссылка из письма вернёт сюда же, с ?invite=
      if (error) throw error;
      if (!data.session) throw new Error('Мы отправили письмо — подтверди почту и войди');
      return data.session;
    }
    const { data, error } = await sb.auth.signInWithPassword(cred);
    if (error) throw error;
    return data.session;
  }, [signup], 'войти');
}

// имя + свой дом / приглашение. nameOnly — когда дом уже есть, а имени ещё нет
export async function onboard(sb, uid, { nameOnly = false } = {}) {
  const name = field('name', { placeholder: 'как тебя зовут', maxLength: 40, autocomplete: 'given-name' });
  if (nameOnly) {
    return screen('Познакомимся', 'Так тебя увидит партнёр в записках и чате.', [name], async (f) => {
      const { error } = await sb.from('profiles').upsert({ id: uid, name: f.get('name').trim() });
      if (error) throw error;
      return true;
    });
  }
  const invite = new URLSearchParams(location.search).get('invite') || '';
  const mode = h('div', { className: 'seg' });
  const code = field('code', { placeholder: 'код приглашения', value: invite, maxLength: 20, required: false });
  const title = field('title', { placeholder: 'название дома', value: 'Наш дом', maxLength: 60, required: false });
  const started = h('label', { className: 'lbl' }, 'вместе с', field('started', { type: 'date', required: false }));
  let joining = !!invite;
  const set = (j) => {
    joining = j;
    code.hidden = !j; title.hidden = started.hidden = j;
    code.required = j;
    for (const b of mode.children) b.classList.toggle('on', (b.dataset.j === '1') === j);
  };
  mode.append(
    h('button', { type: 'button', textContent: 'создать дом', onclick: () => set(false) }),
    h('button', { type: 'button', textContent: 'меня пригласили', onclick: () => set(true) }));
  mode.children[1].dataset.j = '1';
  set(joining);
  const id = await screen('Ваш дом', 'Один создаёт дом, второй входит по приглашению из «Профиля».', [name, mode, title, started, code], async (f) => {
    const { error: e1 } = await sb.from('profiles').upsert({ id: uid, name: f.get('name').trim() });
    if (e1) throw e1;
    const { data, error } = joining
      ? await sb.rpc('join_couple', { p_invite: f.get('code').trim() })
      : await sb.rpc('create_couple', { p_title: f.get('title').trim(), p_started: f.get('started') || null });
    if (error) throw error;
    return data;
  });
  if (invite) history.replaceState(null, '', location.pathname);
  return id;
}

// старая версия хранила всё в браузере: предлагаем перенести в общий дом (картинки data: догружаем в хранилище)
export async function offerMigration(sb, { put, upload }) {
  let old = {};
  try { if (localStorage.getItem('lr:migrated')) return false; old = JSON.parse(localStorage.getItem('lr:store')) || {}; } catch { return false; }
  const list = Object.entries(old).flatMap(([kind, ids]) => Object.entries(ids || {}).filter(([id]) => /^[A-Za-z0-9_-]{1,80}$/.test(id) && id !== 'undefined').map(([id, v]) => [kind, id, v]));
  if (!list.length) return false;
  const skip = h('button', { type: 'button', className: 'ghost', textContent: 'не надо' });
  const status = h('p', { className: 'hint' });
  const go = new Promise((done) => {
    skip.onclick = () => { localStorage.setItem('lr:migrated', 'skip'); gate.hidden = true; done(false); };
    screen('Перенести старое?', `На этом устройстве есть записки, фото и планы из прошлой версии (${list.length}). Перенести их в ваш общий дом?`, [status], async () => {
      const swap = async (v) => {
        if (typeof v === 'string' && v.startsWith('data:image/')) return upload(await (await fetch(v)).blob(), v.slice(5, v.indexOf(';')));
        if (Array.isArray(v)) return Promise.all(v.map(swap));
        if (v && typeof v === 'object') return Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await swap(x)])));
        return v;
      };
      let n = 0;
      for (const [kind, id, v] of list) { status.textContent = `переношу ${++n} из ${list.length}…`; await put(kind, id, await swap(v)); }
      localStorage.setItem('lr:migrated', '1');
      return true;
    }, [skip], 'перенести').then(done);
  });
  return go;
}
