/* =========================================================================
   التطبيق: الإقلاع، تسجيل الدخول (MFA)، التوجيه، القائمة الجانبية
   ========================================================================= */
'use strict';

const ROUTES = {
  dashboard: { t: 'لوحة التحكم', ic: '📊', roles: '*', g: 'عام' },
  verify: { t: 'التحقق من دواء', ic: '🔍', roles: '*', g: 'عام' },
  notifications: { t: 'الإشعارات', ic: '🔔', roles: '*', g: 'عام', count: () => Notify.unread().length },
  myrecord: { t: 'ملفي الطبي الموحد', ic: '🗂️', roles: ['patient'], g: 'ملفي' },
  myrx: { t: 'روشتاتي (QR)', ic: '📝', roles: ['patient'], g: 'ملفي' },
  consents: { t: 'موافقات الاطلاع', ic: '✍️', roles: ['patient'], g: 'ملفي' },
  access: { t: 'من اطلع على ملفي', ic: '👁️', roles: ['patient'], g: 'ملفي' },
  patients: { t: 'المرضى', ic: '🗂️', roles: ['doctor', 'lab', 'radiology'], g: 'السجلات السريرية' },
  record: { t: 'السجل الطبي الموحد', ic: '🗂️', roles: ['doctor', 'lab', 'radiology', 'patient'], hidden: true },
  prescriptions: { t: 'الروشتات الإلكترونية', ic: '📝', roles: ['doctor', 'admin', 'authority'], g: 'السجلات السريرية' },
  labs: { t: 'نتائج التحاليل', ic: '🧪', roles: ['lab'], g: 'السجلات السريرية' },
  rads: { t: 'تقارير الأشعة', ic: '🩻', roles: ['radiology'], g: 'السجلات السريرية' },
  dispense: { t: 'صرف روشتة', ic: '💊', roles: ['pharmacist'], g: 'تتبع الأدوية' },
  dispensed: { t: 'سجل الصرف', ic: '📋', roles: ['pharmacist'], g: 'تتبع الأدوية' },
  receive: { t: 'استلام الشحنات', ic: '📦', roles: ['pharmacist', 'distributor'], g: 'تتبع الأدوية', count: () => Domain.incomingFor(myOrg()).length },
  ship: { t: 'شحن عبوات', ic: '🚚', roles: ['factory', 'distributor'], g: 'تتبع الأدوية' },
  batches: { t: 'دفعات الإنتاج و QR', ic: '🏭', roles: ['factory', 'authority', 'admin'], g: 'تتبع الأدوية' },
  drugs: { t: 'الأصناف الدوائية', ic: '💠', roles: ['factory', 'authority', 'admin'], g: 'تتبع الأدوية' },
  stock: { t: 'المخزون', ic: '🏬', roles: ['pharmacist', 'distributor', 'factory', 'authority', 'admin'], g: 'تتبع الأدوية' },
  trace: { t: 'تتبع عبوة (الأثر)', ic: '🔗', roles: ['authority', 'admin', 'factory', 'distributor', 'pharmacist'], g: 'تتبع الأدوية' },
  alerts: { t: 'إنذارات الغش', ic: '🚨', roles: ['authority', 'admin', 'pharmacist'], g: 'الرقابة', count: () => Auth.is('authority', 'admin') ? Store.where('counterfeit_alerts', a => a.status === 'open').length : 0 },
  reviews: { t: 'مراجعة الصرف (BR-03)', ic: '⚖️', roles: ['authority', 'admin'], g: 'الرقابة', count: () => Store.where('dispense_records', d => d.needs_review && d.review_status === 'pending').length },
  invoices: { t: 'الفواتير والضرائب', ic: '🧾', roles: ['pharmacist', 'factory', 'distributor', 'authority', 'admin'], g: 'الخدمات المشتركة' },
  reports: { t: 'التقارير', ic: '📈', roles: ['authority', 'admin', 'pharmacist', 'factory', 'distributor', 'doctor'], g: 'الخدمات المشتركة' },
  insurance: { t: 'التأمين الصحي (مستقبلي)', ic: '🛡️', roles: ['patient', 'admin'], g: 'الخدمات المشتركة' },
  orgs: { t: 'الجهات', ic: '🏢', roles: ['admin'], g: 'الإدارة' },
  users: { t: 'المستخدمون', ic: '👥', roles: ['admin'], g: 'الإدارة' },
  permissions: { t: 'الصلاحيات', ic: '🔑', roles: ['admin'], g: 'الإدارة' },
  audit: { t: 'سجل التدقيق', ic: '📜', roles: ['admin', 'authority'], g: 'الإدارة' },
  interactions: { t: 'قواعد التعارض الدوائي', ic: '⚕️', roles: ['admin', 'authority'], g: 'الإدارة' },
  settings: { t: 'الإعدادات والنسخ الاحتياطي', ic: '⚙️', roles: ['admin'], g: 'الإدارة' },
  profile: { t: 'حسابي', ic: '👤', roles: '*', hidden: true },
  about: { t: 'عن النظام', ic: 'ℹ️', roles: '*', g: 'عام' }
};
const LIVE = new Set(['dashboard', 'notifications', 'alerts', 'reviews', 'receive', 'stock', 'invoices', 'audit', 'myrx', 'consents', 'access', 'prescriptions', 'dispensed', 'batches', 'users', 'orgs', 'permissions']);

const App = {
  route: 'dashboard', params: {},
  allowed(r) { const d = ROUTES[r]; return d && (d.roles === '*' || d.roles.includes(Auth.role())); },
  go(r, p = {}) { App.params = p; if (location.hash.slice(1) === r) App.render(); else location.hash = r; },

  async boot() {
    try { const t = localStorage.getItem('dawaai_theme'); if (t) document.documentElement.dataset.theme = t; const f = localStorage.getItem('dawaai_fs'); if (f) document.documentElement.style.setProperty('--fs', f + 'px'); } catch { }
    await Crypto.init(); Store.init();
    const app = UI.$('#app');
    let cloud = false, demo = false;
    try { demo = sessionStorage.getItem('dawaai_demo') === '1'; } catch { }
    if (demo) { Store.mode = 'demo'; Store.loadLocal(); Store.status = 'demo'; }
    else if (window.claude && typeof window.claude.use === 'function') {
      app.innerHTML = `<div class="boot"><div class="logo-mark big">د</div><p>جاري الاتصال بقاعدة البيانات المشتركة…</p></div>`;
      cloud = await Store.connectCloud();
    }
    if (!cloud && !demo) { Store.mode = 'local'; Store.loadLocal(); Store.status = 'local'; }
    window.addEventListener('online', () => { Store.online = true; Store.flushPending(); App.syncBadge(); });
    window.addEventListener('offline', () => { Store.online = false; Store._setStatus('offline'); });
    window.addEventListener('hashchange', () => App.render());
    Store.onChange(() => App.onData());
    if (Store.isEmpty()) return cloud ? App.setup() : App.seedLocal();
    App.start();
  },
  start() {
    Auth.restore();
    if (!Auth.user) return App.login();
    App.shell();
  },
  /* وضع العرض التجريبي: نسخة خاصة على متصفح الزائر — لا تُكتب في قاعدة البيانات المشتركة */
  enterDemo() {
    try { sessionStorage.setItem('dawaai_demo', '1'); } catch { }
    if (Auth.user) Auth.logout();
    Store.mode = 'demo'; Store.status = 'demo'; Store.loadLocal();
    if (Store.isEmpty()) return App.seedLocal();
    App.start();
  },
  exitDemo() {
    try { sessionStorage.removeItem('dawaai_demo'); sessionStorage.removeItem('dawaai_session'); } catch { }
    Auth.user = null; location.hash = ''; location.reload();
  },
  async seedLocal() {
    UI.$('#app').innerHTML = `<div class="boot"><div class="logo-mark big">د</div><p>تجهيز بيانات المرحلة التجريبية…</p><div class="progress" style="width:260px"><i style="width:0"></i></div></div>`;
    await Seed.build((i, n) => { const b = UI.$('#app .progress i'); if (b) b.style.width = (i / n * 100) + '%'; });
    App.start();
  },
  /* أول تشغيل على قاعدة بيانات مشتركة فارغة */
  setup() {
    UI.$('#app').innerHTML = `<div class="login"><div class="hero"><div class="logo-mark big">د</div><h1>تهيئة منصة دوائي</h1><p>قاعدة البيانات المشتركة فارغة. اختر طريقة البدء — البيانات ستكون مشتركة بين كل من يفتح البرنامج بصلاحية Contributor أو أعلى.</p></div>
      <div class="panel"><div class="box card stack">
        <h3>1) بيانات تجريبية جاهزة</h3><p class="small muted">15 جهة، 22 مستخدماً بكل الأدوار، 10 أصناف، 11 دفعة إنتاج بعبوات وروشتات وإنذارات — مناسبة للعرض والتدريب.</p>
        <button class="btn pri" id="demo">تحميل البيانات التجريبية</button><div class="progress" hidden><i style="width:0"></i></div>
        <div class="hr"></div><h3>2) نظام فارغ للتشغيل الفعلي</h3>
        ${UI.fields([{ name: 'nid', label: 'الرقم القومي لمدير المنصة', required: true, inputmode: 'numeric' }, { name: 'name', label: 'الاسم', required: true }, { name: 'pw', label: 'كلمة المرور (8 أحرف على الأقل)', type: 'password', required: true }])}
        <button class="btn" id="blank">إنشاء النظام</button>
        <div class="hr"></div><h3>3) مجرد تجربة؟</h3><p class="small muted">نسخة خاصة على متصفحك فقط، ولا تُحفظ في قاعدة البيانات المشتركة.</p>
        <button class="btn" id="demoMode">🧪 وضع العرض التجريبي</button></div></div></div>`;
    UI.$('#demoMode').onclick = () => App.enterDemo();
    UI.$('#demo').onclick = async () => {
      UI.$('#demo').disabled = true; UI.$('#blank').disabled = true; const pr = UI.$('.progress'); pr.hidden = false;
      try { await Seed.build((i, n) => { pr.firstElementChild.style.width = (i / n * 100) + '%'; }); App.start(); } catch (e) { UI.toast('تعذر التحميل: ' + e.message, 'err'); UI.$('#demo').disabled = false; }
    };
    UI.$('#blank').onclick = async () => {
      try { const v = UI.read(UI.$('.box')); if (!/^\d{14}$/.test(v.nid)) throw new Error('الرقم القومي 14 رقماً'); if (v.pw.length < 8) throw new Error('كلمة المرور قصيرة'); const u = await Seed.blank(v.nid, v.name, v.pw); Auth.start(u); App.shell(); } catch (e) { UI.toast(e.message, 'err'); }
    };
  },
  login() {
    UI.destroyCharts();
    const demo = Seed.DEMO_USERS.filter(([nid]) => Store.find('users', u => u.national_id === nid));
    UI.$('#app').innerHTML = `<div class="login"><div class="hero"><div class="row"><div class="logo-mark big">د</div><div><h1>منصة "دوائي" الوطنية</h1><div>النظام الموحد لتتبع الأدوية والسجل الطبي الرقمي</div></div></div>
      <ul><li>تتبع كل عبوة دواء برمز QR موقع رقمياً من المصنع حتى المريض</li><li>سجل طبي موحد يربط الأطباء والمعامل ومراكز الأشعة والصيدليات</li><li>روشتة إلكترونية تُستخدم مرة واحدة، ورصد فوري لمحاولات الغش</li><li>المريض يملك بياناته: لا اطلاع دون موافقته</li></ul>
      <p class="small" style="opacity:.75">نسخة المرحلة التجريبية (Pilot) — ${Store.mode === 'cloud' ? 'متصلة بقاعدة بيانات مشتركة' : Store.mode === 'demo' ? 'وضع العرض التجريبي: نسخة خاصة على متصفحك' : 'تعمل محلياً على هذا الجهاز'}</p></div>
      <div class="panel"><div class="box"><div class="card"><h3>تسجيل الدخول</h3><form id="lf" class="stack">
        <label class="f"><span>الرقم القومي</span><input class="i mono" name="nid" inputmode="numeric" autocomplete="username" required maxlength="14"></label>
        <label class="f"><span>كلمة المرور</span><input class="i" name="pw" type="password" autocomplete="current-password" required></label>
        <button class="btn pri" style="width:100%">دخول</button><div id="err" class="small" style="color:var(--bad)"></div></form></div>
        ${Store.mode === 'cloud' ? `<div class="card demo-card" style="margin-top:12px"><b>🧪 عايز تجرب بس؟</b><p class="small muted" style="margin:4px 0 8px">افتح نسخة خاصة بيك فيها بيانات تجريبية كاملة. أي حاجة تعملها فيها مش هتأثر على البيانات الأصلية.</p><button class="btn" id="demoMode" style="width:100%">دخول وضع العرض التجريبي</button></div>` : ''}
        ${Store.mode === 'demo' ? `<div class="callout info" style="margin-top:12px">أنت في <b>وضع العرض التجريبي</b> — <a href="javascript:void 0" id="exitDemo">رجوع للبيانات الأصلية</a></div>` : ''}
        ${demo.length ? `<div class="card" style="margin-top:12px"><h3 style="font-size:14px">حسابات تجريبية (كلمة المرور: 123456)</h3><div class="demo-grid">${demo.map(([nid, role, l]) => `<button data-nid="${nid}">${ROLES[role].icon} ${U.esc(l)}<small class="mono">${nid}</small></button>`).join('')}</div></div>` : ''}
      </div></div></div>`;
    const f = UI.$('#lf');
    f.onsubmit = async e => {
      e.preventDefault(); UI.$('#err').textContent = '';
      try { const u = await Auth.login(f.nid.value, f.pw.value); if (Auth.mfaRequired(u)) return App.mfa(u); Auth.start(u); App.go('dashboard'); App.shell(); }
      catch (err) { UI.$('#err').textContent = err.message; }
    };
    UI.$('#demoMode')?.addEventListener('click', () => App.enterDemo());
    UI.$('#exitDemo')?.addEventListener('click', () => App.exitDemo());
    UI.$$('[data-nid]').forEach(b => b.onclick = () => { f.nid.value = b.dataset.nid; f.pw.value = '123456'; f.requestSubmit(); });
  },
  async mfa(u) {
    const code = String(U.rand(100000, 999999));
    const ok = await UI.modal({
      title: 'المصادقة متعددة العوامل (MFA)', body: `<p>أُرسل رمز تحقق من 6 أرقام إلى الموبايل المسجل ${U.esc((u.phone || '').slice(0, 3))}•••${U.esc((u.phone || '').slice(-2))}.</p>
        <div class="callout info small">محاكاة رسالة SMS: رمزك هو <b class="mono">${code}</b></div><input class="i otp mono" id="otp" inputmode="numeric" maxlength="6" style="margin-top:10px" aria-label="رمز التحقق">`,
      actions: [{ label: 'إلغاء', value: false }, { label: 'تحقق', kind: 'pri', onClick: m => { if (m.querySelector('#otp').value.trim() !== code) throw new Error('رمز غير صحيح'); return true; } }]
    });
    if (!ok) return;
    Auth.start(u); Audit.log('mfa_success', 'users', u.id); App.go('dashboard'); App.shell();
  },
  shell() {
    UI.$('#app').innerHTML = `<div class="shell"><aside class="side" id="side" aria-label="القائمة الرئيسية"><div class="brand"><div class="logo-mark">د</div><div><b>منصة دوائي</b><small>${U.esc(Auth.org()?.name || ROLES[Auth.role()].label)}</small></div></div><nav class="nav" id="nav"></nav>
      <div class="side-foot">${U.esc(Settings.get().platform_name)} · المرحلة التجريبية</div></aside>
      <div class="main"><header class="top"><button class="icon-btn menu-btn" id="mb" aria-label="القائمة">☰</button><h1 id="title"></h1>
        <span id="sync"></span>
        <button class="icon-btn" id="fs" title="حجم الخط" aria-label="تكبير الخط">A+</button>
        <button class="icon-btn" id="th" title="الوضع الداكن" aria-label="تبديل الوضع الداكن">🌙</button>
        <a class="icon-btn" href="#notifications" id="bell" aria-label="الإشعارات">🔔</a>
        <div class="who"><span class="avatar">${ROLES[Auth.role()].icon}</span><span class="nm"><b>${U.esc(Auth.user.full_name)}</b><br>${U.esc(ROLES[Auth.role()].label)}</span></div>
        <button class="btn sm" id="me">حسابي</button><button class="btn sm" id="lo">خروج</button></header>
        ${Store.mode === 'demo' ? '<div class="demo-bar" role="status">🧪 <span class="grow">وضع العرض التجريبي — نسخة خاصة على متصفحك، وأي تعديل هنا لا يؤثر على البيانات الأصلية</span><button class="btn sm" id="exitDemo">خروج من وضع العرض</button></div>' : ''}
        <main class="content" id="main" tabindex="-1"></main></div></div>`;
    UI.$('#exitDemo')?.addEventListener('click', () => App.exitDemo());
    UI.$('#lo').onclick = () => { Auth.logout(); location.hash = ''; App.login(); };
    UI.$('#me').onclick = () => App.go('profile');
    UI.$('#mb').onclick = () => UI.$('#side').classList.toggle('open');
    UI.$('#th').onclick = () => { const d = document.documentElement; d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('dawaai_theme', d.dataset.theme); } catch { } App.render(); };
    UI.$('#fs').onclick = () => { const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 15; const n = cur >= 19 ? 14 : cur + 1.5; document.documentElement.style.setProperty('--fs', n + 'px'); try { localStorage.setItem('dawaai_fs', n); } catch { } };
    App.render();
  },
  nav() {
    const nav = UI.$('#nav'); if (!nav) return;
    const groups = {};
    for (const [k, r] of Object.entries(ROUTES)) if (!r.hidden && App.allowed(k)) (groups[r.g] = groups[r.g] || []).push([k, r]);
    nav.innerHTML = Object.entries(groups).map(([g, items]) => `<h6>${U.esc(g)}</h6>${items.map(([k, r]) => { const c = r.count ? r.count() : 0; return `<a href="#${k}" class="${App.route === k ? 'on' : ''}" ${App.route === k ? 'aria-current="page"' : ''}><span class="ic">${r.ic}</span>${U.esc(r.t)}${c ? `<span class="cnt">${c}</span>` : ''}</a>`; }).join('')}`).join('');
    nav.querySelectorAll('a').forEach(a => a.onclick = () => UI.$('#side').classList.remove('open'));
    const n = Notify.unread().length; const bell = UI.$('#bell'); if (bell) bell.innerHTML = `🔔${n ? `<span class="dot">${n}</span>` : ''}`;
    App.syncBadge();
  },
  syncBadge() {
    const el = UI.$('#sync'); if (!el) return;
    const s = Store.status; const m = { cloud: 'متزامن', offline: `غير متصل${Store.pending.length ? ' · ' + Store.pending.length + ' معلق' : ''}`, syncing: 'جاري المزامنة', local: 'وضع محلي', demo: 'وضع العرض', stale: 'قد تكون البيانات قديمة' };
    el.innerHTML = `<span class="sync ${s === 'stale' ? 'offline' : s}" title="${Store.mode === 'cloud' ? 'قاعدة بيانات مشتركة' : 'البيانات محفوظة على هذا المتصفح فقط'}"><i></i>${m[s] || s}</span>`;
  },
  async render() {
    if (!Auth.user) return;
    if (!UI.$('#main')) return App.shell();
    let r = location.hash.slice(1) || 'dashboard';
    if (!App.allowed(r)) r = 'dashboard';
    if (r !== App.route) { if (r !== 'reports') App.params = r === 'record' || r === 'permissions' ? App.params : {}; }
    App.route = r;
    UI.destroyCharts();
    UI.$('#title').textContent = ROUTES[r].t;
    document.title = ROUTES[r].t + ' — منصة دوائي';
    App.nav();
    const main = UI.$('#main');
    try { await Views[r](main, App.params || {}); }
    catch (e) { console.error(e); main.innerHTML = `<div class="callout bad">حدث خطأ أثناء عرض الشاشة: ${U.esc(e.message)}</div>`; }
  },
  onData() {
    if (!Auth.user) return;
    if (Auth.user && !Store.get('users', Auth.user.id)) return;
    Auth.user = Store.get('users', Auth.user.id) || Auth.user;
    App.nav();
    const busy = UI.$('#modal-root').children.length || (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName));
    if (LIVE.has(App.route) && !busy && App.route !== 'reports') { const y = window.scrollY; App.render().then(() => window.scrollTo(0, y)); }
  }
};

App.boot().catch(e => { console.error(e); UI.$('#app').innerHTML = `<div class="boot"><p>تعذر تشغيل البرنامج: ${U.esc(e.message)}</p></div>`; });
