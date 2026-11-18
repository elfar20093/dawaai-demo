/* =========================================================================
   مكونات الواجهة المشتركة
   ========================================================================= */
'use strict';

const UI = {
  _charts: [],
  $(sel, root = document) { return root.querySelector(sel); },
  $$(sel, root = document) { return [...root.querySelectorAll(sel)]; },

  toast(msg, type = '') {
    const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
    UI.$('#toasts').appendChild(el); setTimeout(() => el.remove(), type === 'err' ? 6500 : 4000);
  },
  badge(text, kind = '') { return `<span class="badge ${kind}">${U.esc(text)}</span>`; },

  /* ------------------------- نوافذ حوار ------------------------- */
  modal({ title, body, actions = [], wide = false, onMount }) {
    return new Promise(resolve => {
      const root = UI.$('#modal-root');
      const bg = document.createElement('div'); bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
        <header><h3>${U.esc(title)}</h3><button class="btn ghost sm" data-x aria-label="إغلاق">✕</button></header>
        <div class="body">${body}</div>
        ${actions.length ? `<footer>${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-a="${i}">${U.esc(a.label)}</button>`).join('')}</footer>` : ''}
      </div>`;
      const close = v => { bg.remove(); document.removeEventListener('keydown', esc); resolve(v); };
      const esc = e => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', esc);
      bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-x]')) close(null); });
      actions.forEach((a, i) => bg.querySelector(`[data-a="${i}"]`).addEventListener('click', async () => {
        if (a.onClick) { try { const r = await a.onClick(bg.querySelector('.modal')); if (r === false) return; close(r === undefined ? a.value ?? true : r); } catch (e) { UI.toast(e.message, 'err'); } }
        else close(a.value ?? null);
      }));
      root.appendChild(bg);
      onMount?.(bg.querySelector('.modal'), close);
      setTimeout(() => (bg.querySelector('input,select,textarea') || bg.querySelector('button'))?.focus(), 30);
    });
  },
  confirm(msg, { danger = false, ok = 'تأكيد' } = {}) {
    return UI.modal({ title: 'تأكيد', body: `<p>${msg}</p>`, actions: [{ label: 'إلغاء', value: false }, { label: ok, kind: danger ? 'danger' : 'pri', value: true }] });
  },
  ask(title, label, { multiline = false, value = '' } = {}) {
    return UI.modal({
      title, body: `<label class="f"><span>${U.esc(label)}</span>${multiline ? `<textarea class="i" id="ask-v">${U.esc(value)}</textarea>` : `<input class="i" id="ask-v" value="${U.esc(value)}">`}</label>`,
      actions: [{ label: 'إلغاء', value: null }, { label: 'حفظ', kind: 'pri', onClick: m => m.querySelector('#ask-v').value.trim() || null }]
    });
  },
  /** نموذج من تعريف حقول */
  fields(defs, values = {}) {
    return `<div class="form">${defs.map(d => {
      const v = values[d.name] ?? d.value ?? '';
      const req = d.required ? ' <b>*</b>' : '';
      let inp;
      if (d.type === 'select') inp = `<select class="i" name="${d.name}" ${d.required ? 'required' : ''}>${d.empty !== false ? '<option value="">— اختر —</option>' : ''}${d.options.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${U.esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${U.esc(ol)}</option>`; }).join('')}</select>`;
      else if (d.type === 'textarea') inp = `<textarea class="i" name="${d.name}" ${d.required ? 'required' : ''} placeholder="${U.esc(d.placeholder || '')}">${U.esc(v)}</textarea>`;
      else if (d.type === 'checkbox') return `<label class="check ${d.full ? 'full' : ''}"><input type="checkbox" name="${d.name}" ${v ? 'checked' : ''}> ${U.esc(d.label)}</label>`;
      else inp = `<input class="i" name="${d.name}" type="${d.type || 'text'}" value="${U.esc(v)}" ${d.required ? 'required' : ''} ${d.min !== undefined ? `min="${d.min}"` : ''} ${d.max !== undefined ? `max="${d.max}"` : ''} ${d.pattern ? `pattern="${d.pattern}"` : ''} ${d.inputmode ? `inputmode="${d.inputmode}"` : ''} placeholder="${U.esc(d.placeholder || '')}" ${d.list ? `list="${d.list}"` : ''}>`;
      return `<label class="f ${d.full ? 'full' : ''}"><span>${U.esc(d.label)}${req}</span>${inp}${d.hint ? `<small class="muted">${U.esc(d.hint)}</small>` : ''}</label>`;
    }).join('')}</div>`;
  },
  read(root) {
    const o = {};
    for (const el of root.querySelectorAll('[name]')) o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    for (const el of root.querySelectorAll('[required]')) if (!el.value.trim()) { el.focus(); throw new Error('أكمل الحقول المطلوبة'); }
    return o;
  },
  async form(title, defs, values, onSave, opts = {}) {
    return UI.modal({ title, wide: opts.wide, body: (opts.intro || '') + UI.fields(defs, values), actions: [{ label: 'إلغاء', value: null }, { label: opts.saveLabel || 'حفظ', kind: 'pri', onClick: async m => { const v = UI.read(m); const r = await onSave(v); return r === undefined ? true : r; } }] });
  },

  /* ------------------------- جدول مع بحث وترقيم ------------------------- */
  table(el, { rows, cols, search = true, pageSize = 15, onRow, empty = 'لا توجد بيانات', tools = '', exportName }) {
    let q = '', page = 0;
    const text = r => cols.map(c => c.text ? c.text(r) : (c.csv ? c.csv(r) : '')).join(' ').toLowerCase();
    const draw = () => {
      const f = q ? rows.filter(r => text(r).includes(q)) : rows;
      const pages = Math.max(1, Math.ceil(f.length / pageSize)); page = Math.min(page, pages - 1);
      const slice = f.slice(page * pageSize, page * pageSize + pageSize);
      el.querySelector('.tbl-body').innerHTML = slice.length ? `<div class="tbl-wrap"><table class="t"><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${U.esc(c.label)}</th>`).join('')}</tr></thead><tbody>${slice.map((r, i) => `<tr class="${onRow ? 'click' : ''}" data-i="${page * pageSize + i}">${cols.map(c => `<td class="${c.cls || ''}">${c.get(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="pager"><span>${U.fmtNum(f.length)} سجل</span>${pages > 1 ? `<button class="btn sm" data-p="-1" ${page === 0 ? 'disabled' : ''}>السابق</button><span>${page + 1} / ${pages}</span><button class="btn sm" data-p="1" ${page >= pages - 1 ? 'disabled' : ''}>التالي</button>` : ''}</div>` : `<div class="empty">${empty}</div>`;
      if (onRow) el.querySelectorAll('tr[data-i]').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('button,a,input')) return; onRow(f[Number(tr.dataset.i)]); }));
      el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { page += Number(b.dataset.p); draw(); }));
      el._filtered = f;
    };
    el.innerHTML = `${search || tools || exportName ? `<div class="tbl-tools">${search ? `<input class="i" type="search" placeholder="بحث…" aria-label="بحث">` : ''}<span class="grow"></span>${tools}${exportName ? `<button class="btn sm" data-exp>⬇ تصدير CSV</button>` : ''}</div>` : ''}<div class="tbl-body"></div>`;
    el.querySelector('input[type=search]')?.addEventListener('input', U.debounce(e => { q = e.target.value.trim().toLowerCase(); page = 0; draw(); }, 150));
    el.querySelector('[data-exp]')?.addEventListener('click', () => UI.download(exportName + '.csv', U.csv(el._filtered || rows, cols.filter(c => c.csv || c.text).map(c => ({ label: c.label, get: c.csv || c.text })))));
    draw();
  },

  /* ------------------------- ماسح QR ------------------------- */
  scanner(el, { label = 'امسح رمز QR', placeholder = 'الصق الرمز أو امسحه بقارئ الباركود ثم Enter', onCode, button = 'تحقق' }) {
    el.innerHTML = `<div class="scanner"><div class="small muted" style="margin-bottom:6px">${U.esc(label)}</div>
      <div class="row"><input class="i mono" placeholder="${U.esc(placeholder)}" aria-label="${U.esc(label)}" autocomplete="off">
      <button class="btn pri" data-go>${U.esc(button)}</button>
      <label class="btn" title="تصوير الرمز بكاميرا الموبايل أو اختيار صورة">📷 صورة / كاميرا<input type="file" accept="image/*" capture="environment" hidden></label></div>
      <div class="small muted" data-msg style="margin-top:6px"></div></div>`;
    const inp = el.querySelector('input.i'), msg = el.querySelector('[data-msg]');
    const go = async () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; await onCode(v); inp.focus(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    el.querySelector('[data-go]').addEventListener('click', go);
    el.querySelector('input[type=file]').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return; msg.textContent = 'جاري قراءة الصورة…';
      try { const code = await UI.decodeImage(f); if (!code) { msg.textContent = 'لم يتم العثور على رمز QR واضح في الصورة'; return; } msg.textContent = ''; await onCode(code); }
      catch (err) { msg.textContent = 'تعذر قراءة الصورة'; }
      e.target.value = '';
    });
    return { focus: () => inp.focus() };
  },
  decodeImage(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height); URL.revokeObjectURL(url);
        const r = jsQR(d.data, c.width, c.height, { inversionAttempts: 'attemptBoth' }); res(r ? r.data : null);
      };
      img.onerror = rej; img.src = url;
    });
  },

  /* ------------------------- رسوم بيانية ------------------------- */
  css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); },
  chart(canvas, cfg) {
    if (!canvas || typeof Chart === 'undefined') return null;
    const ink2 = UI.css('--ink-2'), line = UI.css('--line');
    Chart.defaults.font.family = '"IBM Plex Sans Arabic", system-ui, sans-serif';
    Chart.defaults.color = ink2;
    const base = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: cfg.type === 'line' ? 'index' : 'nearest', intersect: cfg.type !== 'line' },
      plugins: { legend: { display: false }, tooltip: { rtl: true, textDirection: 'rtl', padding: 10, cornerRadius: 8 } },
      scales: cfg.type === 'doughnut' ? undefined : {
        x: { grid: { display: false }, border: { color: line }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: line }, border: { display: false }, ticks: { precision: 0 } }
      }
    };
    const merged = { ...cfg, options: UI._merge(base, cfg.options || {}) };
    for (const ds of merged.data.datasets) {
      if (cfg.type === 'bar') Object.assign(ds, { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 34, ...ds });
      if (cfg.type === 'line') Object.assign(ds, { borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: .25, ...ds });
    }
    const ch = new Chart(canvas, merged); UI._charts.push(ch); return ch;
  },
  _merge(a, b) { const o = Array.isArray(a) ? [...a] : { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' ? UI._merge(a[k], v) : v; return o; },
  destroyCharts() { UI._charts.forEach(c => c.destroy()); UI._charts = []; },
  series(i) { return UI.css('--series-' + (i + 1)) || '#2a78d6'; },

  /* ------------------------- تنزيل الملفات ------------------------- */
  async download(filename, data) {
    try {
      if (window.claude?.use) {
        const dl = await Promise.race([window.claude.use('downloads'), U.sleep(3000).then(() => null)]);
        if (dl) { await dl.save({ filename, data }); UI.toast('تم حفظ الملف', 'ok'); return; }
      }
    } catch (e) { if (e && e.code === 'declined') return; }
    try {
      const blob = new Blob([data], { type: filename.endsWith('.json') ? 'application/json' : filename.endsWith('.html') ? 'text/html' : 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { }
    UI.modal({ title: 'نسخ المحتوى', body: `<p class="small muted">إذا لم يبدأ التنزيل، انسخ المحتوى التالي واحفظه في ملف <b class="mono">${U.esc(filename)}</b>:</p><textarea class="i mono" style="min-height:240px" readonly>${U.esc(typeof data === 'string' ? data.slice(0, 400000) : '')}</textarea>`, actions: [{ label: 'نسخ', kind: 'pri', onClick: async m => { try { await navigator.clipboard.writeText(m.querySelector('textarea').value); UI.toast('تم النسخ', 'ok'); } catch { m.querySelector('textarea').select(); } return false; } }, { label: 'إغلاق' }] });
  },

  /* ------------------------- عرض الحالة ------------------------- */
  statusBadge(map, val, kinds = {}) { return UI.badge(map[val] || val || '—', kinds[val] || ''); },
  rxBadge(s) { return UI.statusBadge(RX_STATUS, s, { issued: 'info', dispensed: 'ok', partially_dispensed: 'warn', superseded: '', cancelled: 'bad' }); },
  unitBadge(s) { return UI.statusBadge(UNIT_STATUS, s, { produced: 'brand', in_transit: 'info', received: 'ok', dispensed: '', recalled: 'bad' }); },
  alertBadge(s) { return UI.statusBadge(ALERT_STATUS, s, { open: 'bad', investigating: 'warn', closed: 'ok' }); },
  sevBadge(s) { return s === 'high' ? UI.badge('خطورة عالية', 'bad') : UI.badge('متوسطة', 'warn'); },
  meter(pct, target) { const k = pct >= target ? '' : pct >= target * .6 ? 'warn' : 'bad'; return `<div class="meter" role="meter" aria-valuenow="${pct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><i class="${k}" style="width:${Math.min(100, pct)}%"></i></div>`; },
  kpi(lbl, val, sub = '', extra = '') { return `<div class="card kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div>${extra}</div>`; },

  /** مسار تتبع العبوة كاملاً (الأثر) */
  traceView(info) {
    const types = new Set(info.trail.map(e => e.event_type));
    const alerts = Store.where('counterfeit_alerts', a => a.package_unit_id === info.unit.id);
    const steps = [['produced', '🏭', 'إنتاج'], ['shipped', '🚚', 'شحن'], ['received', '📦', 'استلام'], ['dispensed', '💊', 'صرف للمريض']];
    return `<div class="trace">${steps.map(([k, ic, l]) => `<div class="st ${types.has(k) ? 'done' : ''}"><div class="c">${ic}</div>${l}</div>`).join('')}${alerts.length ? `<div class="st alert"><div class="c">🚨</div>${alerts.length} إنذار</div>` : ''}</div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="t"><thead><tr><th>التوقيت</th><th>الحدث</th><th>من</th><th>إلى</th><th>الموقع</th><th>بواسطة</th></tr></thead><tbody>
    ${info.trail.map(e => `<tr><td class="small">${U.fmtDT(e.event_timestamp)}</td><td>${UI.badge(EVENT_TYPES[e.event_type] || e.event_type, e.event_type === 'dispensed' ? 'ok' : e.event_type === 'scan_verify' ? 'info' : e.event_type === 'recalled' ? 'bad' : '')}</td><td class="small">${e.from_org_id ? U.esc(Domain.orgName(e.from_org_id)) : '—'}</td><td class="small">${e.to_org_id ? U.esc(Domain.orgName(e.to_org_id)) : e.event_type === 'dispensed' ? 'المريض' : '—'}</td><td class="small">${U.esc(e.geo_location || '—')}</td><td class="small">${e.scanned_by_user_id ? U.esc(Domain.userName(e.scanned_by_user_id)) : 'مستخدم عام'}</td></tr>`).join('')}
    </tbody></table></div>`;
  },
  verifyCard(res) {
    const i = res.info;
    return `<div class="verify ${res.level || (res.ok ? 'ok' : 'danger')}">
      <h3>${res.ok ? '✅' : res.level === 'warn' ? '⚠️' : '⛔'} ${U.esc(res.title)}</h3>
      ${res.detail ? `<p style="margin:0 0 6px">${U.esc(res.detail)}</p>` : ''}
      ${(res.warnings || []).map(w => `<div class="callout bad" style="margin:6px 0">${U.esc(w)}</div>`).join('')}
      ${i ? `<div class="facts" style="margin-top:8px"><div><span>الصنف</span><b>${U.esc(i.drug?.name)}</b></div><div><span>المادة الفعالة</span>${U.esc(i.drug?.active_ingredient)}</div><div><span>المصنع</span>${U.esc(i.manufacturer?.name)}</div><div><span>رقم الدفعة</span><span class="mono">${U.esc(i.batch?.batch_number)}</span></div><div><span>تاريخ الانتهاء</span>${U.fmtDate(i.batch?.expiry_date)}</div><div><span>الرقم التسلسلي</span><span class="mono">${U.esc(i.unit.serial_number)}</span></div><div><span>الحالة</span>${UI.unitBadge(i.unit.status)}</div></div>` : ''}
      ${res.ms !== undefined ? `<div class="small muted" style="margin-top:8px">زمن الاستجابة: ${res.ms.toFixed(0)} مللي ثانية ${res.ms < 2000 ? '(ضمن هدف أقل من ثانيتين ✔)' : '(تجاوز الهدف)'}</div>` : ''}
    </div>`;
  },
  rxPaper(rx) {
    const items = Domain.rxItems(rx.id); const pu = Domain.patientUser(rx.patient_id);
    return `<div class="rx-paper"><div class="row"><div class="grow"><h3>روشتة إلكترونية — منصة دوائي</h3>
      <div class="small">${U.esc(Domain.userName(rx.doctor_id))} — ${U.esc(Domain.orgName(rx.organization_id))}</div>
      <div class="small">المريض: <b>${U.esc(pu?.full_name)}</b> — رقم قومي ${U.esc(U.maskNid(pu?.national_id))}</div>
      <div class="small">التاريخ: ${U.fmtDT(rx.issued_at)} — نسخة رقم ${rx.version_no}</div>
      <div style="margin-top:4px">${UI.rxBadge(rx.status)}</div></div>
      <div style="width:150px">${QR.svg(rx.qr_code_signed, 150)}</div></div>
      <table><thead><tr><th>الدواء</th><th>الجرعة</th><th>الكمية</th><th>تعليمات</th></tr></thead><tbody>
      ${items.map(i => `<tr><td>${U.esc(Domain.drugName(i.drug_id))}</td><td>${U.esc(i.dosage)}</td><td>${i.quantity}</td><td>${U.esc(i.instructions)}</td></tr>`).join('')}</tbody></table>
      <div class="mono" style="margin-top:10px;font-size:10px;color:#666;word-break:break-all">${U.esc(rx.qr_code_signed)}</div>
      <div style="font-size:11px;color:#666;margin-top:4px">رمز موقع رقمياً — يُستخدم مرة واحدة فقط للصرف (BR-01)</div></div>`;
  }
};
