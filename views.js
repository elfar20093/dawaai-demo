/* =========================================================================
   الشاشات — بوابات المستخدمين حسب الدور
   ========================================================================= */
'use strict';

const C = (label, get, text, cls) => ({ label, get, text: text || (r => String(get(r)).replace(/<[^>]+>/g, '')), cls });
const go = (r, p) => App.go(r, p);
const myOrg = () => Auth.user?.organization_id;
const orgOptions = (types) => Store.where('organizations', o => !types || types.includes(o.type)).map(o => [o.id, `${o.name} — ${o.governorate || ''}`]);
const drugOptions = (filter) => Store.where('drugs', d => !filter || filter(d)).map(d => [d.id, d.name]);

const Views = {
  /* ============================== لوحة التحكم ============================== */
  dashboard(el) {
    const r = Auth.role();
    if (r === 'admin' || r === 'authority') return Views._dashGov(el);
    if (r === 'doctor') return Views._dashDoctor(el);
    if (r === 'pharmacist') return Views._dashPharm(el);
    if (r === 'factory' || r === 'distributor') return Views._dashSupply(el);
    if (r === 'lab' || r === 'radiology') return Views._dashLab(el);
    return Views._dashPatient(el);
  },
  _dashGov(el) {
    const k = Reports.kpis();
    const alerts = Store.all('counterfeit_alerts').sort((a, b) => b.detected_at.localeCompare(a.detected_at));
    const s = Settings.get();
    const expSoon = Store.where('production_batches', b => U.daysBetween(new Date(), b.expiry_date) <= s.expiry_warning_days && U.daysBetween(new Date(), b.expiry_date) >= 0).length;
    el.innerHTML = `
    <div class="grid g4">
      ${UI.kpi('نسبة الأدوية المتتبعة بالكامل (مصنع ← صرف)', U.fmtNum(k.tracedPct, 1) + '%', `الهدف بعد سنة: 60% — خط الأساس 0%`, UI.meter(k.tracedPct, 60))}
      ${UI.kpi('متوسط زمن فتح التاريخ المرضي', k.avgRecordSec === null ? '—' : U.fmtNum(k.avgRecordSec, 2) + ' ث', 'الهدف: أقل من دقيقة واحدة', UI.meter(k.avgRecordSec === null ? 0 : 100, 100))}
      ${UI.kpi('حالات غش مكتشفة', U.fmtNum(k.fraudCount), `${U.fmtNum(k.fraudWithin24, 0)}% رُصدت آلياً خلال 24 ساعة`, UI.meter(k.fraudWithin24, 100))}
      ${UI.kpi('نسبة الصيدليات المشاركة في التجريبي', U.fmtNum(k.pharmPct, 0) + '%', `${k.pharmActive} من ${k.pharmTotal} صيدلية — الهدف 70%`, UI.meter(k.pharmPct, 70))}
    </div>
    <div class="grid g4" style="margin-top:16px">
      ${UI.kpi('عبوات مسجلة', U.fmtNum(Store.count('package_units')), `${U.fmtNum(Store.count('production_batches'))} دفعة إنتاج`)}
      ${UI.kpi('عبوات مصروفة للمرضى', U.fmtNum(Store.where('package_units', u => u.status === 'dispensed').length), 'عبر روشتات إلكترونية')}
      ${UI.kpi('إنذارات مفتوحة', `<span style="color:var(--bad)">${U.fmtNum(alerts.filter(a => a.status !== 'closed').length)}</span>`, `<a href="#alerts">عرض الإنذارات ←</a>`)}
      ${UI.kpi('دفعات قرب انتهاء الصلاحية', U.fmtNum(expSoon), `خلال ${s.expiry_warning_days} يوم`)}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="card-head"><h3>الاستهلاك اليومي — آخر 14 يوماً</h3><span class="badge">عبوات مصروفة</span></div><div class="chart-box"><canvas id="ch1" aria-label="رسم الاستهلاك اليومي"></canvas></div></div>
      <div class="card"><div class="card-head"><h3>الاستهلاك حسب المحافظة (FR-12)</h3><a class="btn sm" href="#reports" data-rep="geo">التقرير الكامل</a></div><div class="chart-box"><canvas id="ch2" aria-label="رسم الاستهلاك حسب المحافظة"></canvas></div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>أحدث الإنذارات</h3><a class="btn sm" href="#alerts">الكل</a></div><div id="al"></div></div>
    <div class="card" style="margin-top:16px"><h3>مؤشرات الأداء غير الوظيفية</h3><div class="grid g3">
      ${UI.kpi('زمن الاستجابة لمسح QR (الجلسة الحالية)', Metrics.scanTimes.length ? U.fmtNum(U.sum(Metrics.scanTimes, x => x) / Metrics.scanTimes.length, 0) + ' مللي ث' : '—', 'الهدف: أقل من 2000 مللي ثانية')}
      ${UI.kpi('حالة المزامنة', Store.mode === 'cloud' ? 'قاعدة بيانات مشتركة' : 'وضع محلي', Store.pending.length ? `${Store.pending.length} عملية في انتظار المزامنة` : 'لا توجد عمليات معلقة')}
      ${UI.kpi('سجلات التدقيق', U.fmtNum(Store.count('audit_logs')), 'Append-only — لا تعديل ولا حذف')}
    </div></div>`;
    const days = Reports.dailyDispense(14);
    UI.chart(el.querySelector('#ch1'), { type: 'bar', data: { labels: days.map(d => d.label), datasets: [{ label: 'عبوات مصروفة', data: days.map(d => d.n), backgroundColor: UI.series(0) }] } });
    const geo = Reports.byGov();
    UI.chart(el.querySelector('#ch2'), { type: 'bar', data: { labels: geo.map(g => g.gov), datasets: [{ label: 'عبوات', data: geo.map(g => g.n), backgroundColor: UI.series(0) }] }, options: { indexAxis: 'y', scales: { x: { grid: { display: true } }, y: { grid: { display: false } } } } });
    el.querySelector('[data-rep]')?.addEventListener('click', () => { App.params = { report: 'geo' }; });
    Views._alertTable(el.querySelector('#al'), alerts.slice(0, 6), false);
  },
  _dashDoctor(el) {
    const mine = Store.where('prescriptions', r => r.doctor_id === Auth.user.id);
    const visits = Store.where('visits', v => v.doctor_id === Auth.user.id);
    const consents = Store.where('consent_grants', c => c.organization_id === myOrg() && !c.revoked_at);
    el.innerHTML = `<div class="grid g4">
      ${UI.kpi('مرضى بموافقة سارية لجهتك', U.fmtNum(new Set(consents.map(c => c.patient_id)).size))}
      ${UI.kpi('زياراتي', U.fmtNum(visits.length), `${visits.filter(v => U.dayKey(v.visit_date) === U.dayKey(new Date())).length} اليوم`)}
      ${UI.kpi('روشتات صادرة', U.fmtNum(mine.length), `${mine.filter(r => r.status === 'issued').length} لم تُصرف بعد`)}
      ${UI.kpi('تنبيهات تعارض تم تجاوزها', U.fmtNum(mine.filter(r => (r.interaction_overrides || []).length).length), 'القرار النهائي للطبيب (BR-04)')}
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>فتح ملف مريض</h3></div>
      <div class="row"><input class="i" id="nid" inputmode="numeric" placeholder="الرقم القومي للمريض (14 رقم)" style="max-width:320px"><button class="btn pri" id="open">فتح السجل الموحد</button><a class="btn" href="#patients">قائمة المرضى</a></div>
      <p class="small muted">يتم التحقق من الهوية عبر الرقم القومي (FR-01) ومن وجود موافقة سارية للمريض لجهتك (BR-02).</p></div>
    <div class="card" style="margin-top:16px"><h3>أحدث روشتاتي</h3><div id="t"></div></div>`;
    el.querySelector('#open').onclick = () => Views._openByNid(el.querySelector('#nid').value);
    el.querySelector('#nid').onkeydown = e => { if (e.key === 'Enter') Views._openByNid(e.target.value); };
    Views._rxTable(el.querySelector('#t'), mine.sort((a, b) => b.issued_at.localeCompare(a.issued_at)).slice(0, 8));
  },
  _dashPharm(el) {
    const me = myOrg(); const s = Settings.get();
    const inv = Store.where('pharmacy_inventory', i => i.pharmacy_org_id === me);
    const units = Domain.unitsAt(me, { status: ['received'] });
    const exp = units.filter(u => { const b = Store.getAny('production_batches', u.batch_id); return b && U.daysBetween(new Date(), b.expiry_date) <= s.expiry_warning_days; });
    const recs = Store.where('dispense_records', d => d.pharmacy_org_id === me);
    const today = recs.filter(d => U.dayKey(d.dispensed_at) === U.dayKey(new Date()));
    el.innerHTML = `<div class="grid g4">
      ${UI.kpi('عبوات بالمخزون', U.fmtNum(units.length), `${inv.filter(i => i.quantity_on_hand > 0).length} صنف`)}
      ${UI.kpi('أصناف منخفضة المخزون', U.fmtNum(inv.filter(i => i.quantity_on_hand <= s.low_stock_threshold).length), `حد التنبيه ${s.low_stock_threshold} عبوات`)}
      ${UI.kpi('عبوات قرب/بعد انتهاء الصلاحية', `<span style="color:var(--warn)">${U.fmtNum(exp.length)}</span>`, `خلال ${s.expiry_warning_days} يوم`)}
      ${UI.kpi('روشتات مصروفة اليوم', U.fmtNum(today.length), `${U.fmtMoney(U.sum(today, 'total'))}`)}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>إجراءات سريعة</h3><div class="row"><a class="btn pri" href="#dispense">💊 صرف روشتة</a><a class="btn" href="#receive">📦 استلام شحنة (${Domain.incomingFor(me).length})</a><a class="btn" href="#verify">🔍 تحقق من عبوة</a><a class="btn" href="#stock">المخزون</a></div></div>
      <div class="card"><h3>الصرف آخر 14 يوماً</h3><div class="chart-box" style="height:200px"><canvas id="ch"></canvas></div></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>آخر عمليات الصرف</h3><div id="t"></div></div>`;
    const d = Reports.dailyDispense(14, e => e.from_org_id === me);
    UI.chart(el.querySelector('#ch'), { type: 'bar', data: { labels: d.map(x => x.label), datasets: [{ label: 'عبوات', data: d.map(x => x.n), backgroundColor: UI.series(0) }] } });
    Views._dispenseTable(el.querySelector('#t'), recs.sort((a, b) => b.dispensed_at.localeCompare(a.dispensed_at)).slice(0, 8));
  },
  _dashSupply(el) {
    const me = myOrg();
    const at = Store.where('package_units', u => u.current_org_id === me && ['produced', 'received'].includes(u.status));
    const shipped = Store.where('supply_chain_events', e => e.event_type === 'shipped' && e.from_org_id === me);
    const isF = Auth.is('factory');
    el.innerHTML = `<div class="grid g4">
      ${UI.kpi('عبوات في مخزنك', U.fmtNum(at.length))}
      ${UI.kpi(isF ? 'دفعات منتجة' : 'شحنات واردة معلقة', U.fmtNum(isF ? Store.where('production_batches', b => b.factory_org_id === me).length : Domain.incomingFor(me).length))}
      ${UI.kpi('عبوات تم شحنها', U.fmtNum(shipped.length), `${new Set(shipped.map(s => s.shipment_no)).size} شحنة`)}
      ${UI.kpi('في الطريق', U.fmtNum(Store.where('package_units', u => u.status === 'in_transit' && u.current_org_id === me).length))}
    </div>
    <div class="card" style="margin-top:16px"><h3>إجراءات سريعة</h3><div class="row">
      ${isF ? '<a class="btn pri" href="#batches">🏭 دفعة إنتاج جديدة + QR</a><a class="btn" href="#drugs">الأصناف</a>' : '<a class="btn pri" href="#receive">📦 استلام شحنة</a>'}
      <a class="btn" href="#ship">🚚 شحن عبوات</a><a class="btn" href="#stock">المخزون</a><a class="btn" href="#trace">تتبع عبوة</a></div></div>
    <div class="card" style="margin-top:16px"><h3>المخزون حسب الصنف</h3><div class="chart-box"><canvas id="ch"></canvas></div></div>`;
    const g = U.groupBy(at, u => Domain.drugName(Store.getAny('production_batches', u.batch_id)?.drug_id));
    const arr = Object.entries(g).map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]);
    UI.chart(el.querySelector('#ch'), { type: 'bar', data: { labels: arr.map(x => x[0]), datasets: [{ label: 'عبوات', data: arr.map(x => x[1]), backgroundColor: UI.series(0) }] } });
  },
  _dashLab(el) {
    const isLab = Auth.is('lab'); const t = isLab ? 'lab_results' : 'radiology_reports';
    const mine = Store.where(t, r => r.entered_by === Auth.user.id || r[isLab ? 'lab_org_id' : 'radiology_org_id'] === myOrg());
    el.innerHTML = `<div class="grid g3">${UI.kpi(isLab ? 'نتائج مسجلة' : 'تقارير مسجلة', U.fmtNum(mine.length))}
      ${UI.kpi('مرضى بموافقة لجهتك', U.fmtNum(new Set(Store.where('consent_grants', c => c.organization_id === myOrg() && !c.revoked_at).map(c => c.patient_id)).size))}
      ${UI.kpi('هذا الشهر', U.fmtNum(mine.filter(r => (r.result_date || r.report_date).slice(0, 7) === U.now().slice(0, 7)).length))}</div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>${isLab ? 'تسجيل نتيجة تحليل' : 'تسجيل تقرير أشعة'}</h3></div>
      <div class="row"><input class="i" id="nid" inputmode="numeric" placeholder="الرقم القومي للمريض" style="max-width:320px"><button class="btn pri" id="open">فتح ملف المريض</button><a class="btn" href="#patients">المرضى</a></div></div>
      <div class="card" style="margin-top:16px"><h3>أحدث المدخلات</h3><div id="t"></div></div>`;
    el.querySelector('#open').onclick = () => Views._openByNid(el.querySelector('#nid').value);
    UI.table(el.querySelector('#t'), {
      rows: mine.sort((a, b) => (b.result_date || b.report_date).localeCompare(a.result_date || a.report_date)), cols: [
        C('المريض', r => U.esc(Domain.patientUser(r.patient_id)?.full_name)), C(isLab ? 'التحليل' : 'نوع الفحص', r => U.esc(r.test_type || r.scan_type)), C('التاريخ', r => U.fmtDT(r.result_date || r.report_date))]
    });
  },
  _dashPatient(el) {
    const p = Domain.patientByUser(Auth.user.id);
    const rx = p ? Store.where('prescriptions', r => r.patient_id === p.id && r.status === 'issued') : [];
    const notes = Store.where('notifications', n => n.user_id === Auth.user.id).sort((a, b) => b.sent_at.localeCompare(a.sent_at)).slice(0, 5);
    const views = p ? Store.where('audit_logs', a => a.details?.patient_id === p.id || a.details?.patient_id === Auth.user.id).length : 0;
    el.innerHTML = `<div class="callout info"><b>أهلاً ${U.esc(Auth.user.full_name.split(' ')[0])}</b> — ملفك الطبي موحد عبر كل الجهات، ولا تطّلع عليه أي جهة إلا بموافقتك.</div>
    <div class="grid g4" style="margin-top:16px">
      ${UI.kpi('روشتات سارية', U.fmtNum(rx.length), '<a href="#myrx">عرض رموز QR ←</a>')}
      ${UI.kpi('جهات لديها موافقة', U.fmtNum(Store.where('consent_grants', c => c.patient_id === Auth.user.id && !c.revoked_at).length), '<a href="#consents">إدارة الموافقات ←</a>')}
      ${UI.kpi('عمليات اطلاع على ملفك', U.fmtNum(views), '<a href="#access">من اطلع على ملفي ←</a>')}
      ${UI.kpi('إشعارات غير مقروءة', U.fmtNum(Notify.unread().length), '<a href="#notifications">عرض ←</a>')}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>تحقق من دواء قبل استخدامه</h3><p class="small muted">امسح رمز QR الموجود على العبوة للتأكد أنها أصلية وغير منتهية الصلاحية.</p><a class="btn pri" href="#verify">🔍 تحقق الآن</a></div>
      <div class="card"><h3>آخر الإشعارات</h3>${notes.length ? notes.map(n => `<div class="notif ${n.read_at ? '' : 'unread'}">${U.esc(n.message)}<small>${U.fmtDT(n.sent_at)}</small></div>`).join('') : '<div class="empty">لا توجد إشعارات</div>'}</div>
    </div>`;
  },

  /* ============================== التحقق من دواء ============================== */
  verify(el) {
    const isPatient = Auth.is('patient');
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>التحقق من أصالة عبوة دواء</h3>
      ${isPatient || !myOrg() ? `<label class="f" style="margin-bottom:10px"><span>موقعك الحالي (المحافظة) — يُستخدم لكشف المسح من موقعين</span><select class="i" id="gov">${GOVS.map(g => `<option>${g}</option>`).join('')}</select></label>` : ''}
      <div id="sc"></div>
      <details style="margin-top:12px"><summary class="small muted">رموز تجريبية للاختبار</summary><div class="small" id="demo" style="margin-top:6px"></div></details>
      </div><div id="res"><div class="card empty">امسح رمزاً لعرض النتيجة</div></div></div>`;
    const gov = el.querySelector('#gov'); if (gov) { try { gov.value = localStorage.getItem('dawaai_gov') || 'القاهرة'; } catch { } gov.onchange = () => { try { localStorage.setItem('dawaai_gov', gov.value); } catch { } }; }
    UI.scanner(el.querySelector('#sc'), {
      label: 'امسح رمز QR على العبوة أو أدخل الرقم التسلسلي (14 رقم)', onCode: async code => {
        const res = await Domain.verifyPackage(code, { mode: 'verify', geo: gov ? gov.value : undefined });
        el.querySelector('#res').innerHTML = `<div class="card">${UI.verifyCard(res)}${res.info ? `<h3 style="margin-top:16px">مسار العبوة الكامل</h3>${UI.traceView(Domain.unitInfo(Store.get('package_units', res.info.unit.id)))}` : ''}</div>`;
      }
    });
    const sample = Store.where('package_units', u => u.status === 'received').slice(0, 2);
    const disp = Store.where('package_units', u => u.status === 'dispensed').slice(-1);
    const demo = [...sample.map(u => ['عبوة أصلية بالصيدلية', u.qr_code_signed]), ...disp.map(u => ['عبوة مصروفة (امسحها من محافظة أخرى لمحاكاة الغش)', u.qr_code_signed]), ['رمز مزور (توقيع خاطئ)', 'DWY1|P|12345678901234|FAKE-77|281231|6221234567890|ABCDEF0123456789ABCD']];
    el.querySelector('#demo').innerHTML = demo.map(([l, c]) => `<div style="margin:6px 0"><b>${U.esc(l)}</b><br><button class="btn sm" data-c="${U.esc(c)}">استخدم</button> <span class="mono">${U.esc(c.slice(0, 60))}…</span></div>`).join('');
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const i = el.querySelector('#sc input.i'); i.value = b.dataset.c; el.querySelector('#sc [data-go]').click(); });
  },

  /* ============================== الإشعارات ============================== */
  async notifications(el) {
    const list = Store.where('notifications', n => n.user_id === Auth.user.id).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    el.innerHTML = `<div class="card"><div class="card-head"><h3>الإشعارات (${list.length})</h3><button class="btn sm" id="all">تعليم الكل كمقروء</button></div>
      ${list.length ? list.map(n => `<div class="notif ${n.read_at ? '' : 'unread'}">${U.esc(n.message)}<small>${U.fmtDT(n.sent_at)} · ${U.esc(n.type)}</small></div>`).join('') : '<div class="empty">لا توجد إشعارات</div>'}</div>`;
    el.querySelector('#all').onclick = async () => { for (const n of list.filter(n => !n.read_at)) await Store.update('notifications', n.id, { read_at: U.now() }); App.render(); };
  },

  /* ============================== المرضى ============================== */
  async _openByNid(nid) {
    nid = String(nid || '').trim();
    if (!/^\d{14}$/.test(nid)) return UI.toast('أدخل رقماً قومياً صحيحاً من 14 رقماً', 'err');
    const u = Store.find('users', x => x.national_id === nid && x.role === 'patient');
    if (!u) {
      if (Auth.is('doctor')) { if (await UI.confirm('لا يوجد مريض مسجل بهذا الرقم القومي. هل تريد تسجيل مريض جديد؟')) Views._newPatient(nid); }
      else UI.toast('لا يوجد مريض مسجل بهذا الرقم', 'err');
      return;
    }
    const p = Domain.patientByUser(u.id); go('record', { pid: p.id });
  },
  _newPatient(nid = '') {
    UI.form('تسجيل مريض جديد', [
      { name: 'national_id', label: 'الرقم القومي', required: true, value: nid, inputmode: 'numeric', pattern: '\\d{14}' },
      { name: 'full_name', label: 'الاسم الرباعي', required: true },
      { name: 'dob', label: 'تاريخ الميلاد', type: 'date', required: true }, { name: 'gender', label: 'النوع', type: 'select', options: ['ذكر', 'أنثى'], required: true },
      { name: 'phone', label: 'رقم الموبايل', inputmode: 'tel' }, { name: 'blood_type', label: 'فصيلة الدم', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { name: 'chronic_conditions', label: 'الأمراض المزمنة والحساسية (مشفرة)', type: 'textarea', full: true },
      { name: 'consent', label: 'المريض حاضر ويوافق على اطلاع جهتنا على ملفه (موافقة صريحة)', type: 'checkbox', full: true, value: true }
    ], {}, async v => {
      const u = await Domain.createUser({ ...v, role: 'patient', organization_id: null }, '123456');
      if (v.consent) await Domain.grantConsent(u.id, myOrg(), 'full_record');
      UI.toast('تم تسجيل المريض — كلمة المرور المؤقتة 123456', 'ok');
      const p = Domain.patientByUser(u.id); setTimeout(() => go('record', { pid: p.id }), 50);
    }, { intro: '<p class="small muted">ينشئ حساباً للمريض في نطاق الهوية + سجلاً طبياً. البيانات الحرجة (فصيلة الدم والأمراض المزمنة) تُشفّر على مستوى الحقل.</p>' });
  },
  patients(el) {
    const me = myOrg();
    const consents = Store.where('consent_grants', c => c.organization_id === me && !c.revoked_at);
    const byP = U.groupBy(consents, 'patient_id');
    const rows = Object.keys(byP).map(uid => ({ u: Store.get('users', uid), c: byP[uid] })).filter(x => x.u);
    el.innerHTML = `<div class="card"><div class="card-head"><h3>فتح ملف بالرقم القومي</h3></div>
      <div class="row"><input class="i" id="nid" inputmode="numeric" placeholder="الرقم القومي (14 رقم)" style="max-width:320px"><button class="btn pri" id="open">فتح</button>${Auth.is('doctor') ? '<button class="btn" id="new">+ تسجيل مريض جديد</button>' : ''}</div></div>
      <div class="card" style="margin-top:16px"><h3>مرضى لديهم موافقة سارية لجهتك (${rows.length})</h3><div id="t"></div></div>`;
    el.querySelector('#open').onclick = () => Views._openByNid(el.querySelector('#nid').value);
    el.querySelector('#nid').onkeydown = e => { if (e.key === 'Enter') Views._openByNid(e.target.value); };
    el.querySelector('#new')?.addEventListener('click', () => Views._newPatient());
    UI.table(el.querySelector('#t'), {
      rows, onRow: x => go('record', { pid: Domain.patientByUser(x.u.id)?.id }), cols: [
        C('المريض', x => `<b>${U.esc(x.u.full_name)}</b>`), C('الرقم القومي', x => `<span class="mono">${U.esc(U.maskNid(x.u.national_id))}</span>`, x => x.u.national_id),
        C('نطاق الموافقة', x => x.c.map(c => UI.badge(CONSENT_SCOPES[c.scope], 'brand')).join(' ')), C('منذ', x => U.fmtDate(x.c[0].granted_at))]
    });
  },

  /* ---------------------- السجل الطبي الموحد (FR-04) ---------------------- */
  async record(el, params) {
    const pid = params.pid || (Auth.is('patient') ? Domain.patientByUser(Auth.user.id)?.id : null);
    const p = Store.get('patients', pid); if (!p) { el.innerHTML = '<div class="card empty">المريض غير موجود</div>'; return; }
    const access = Auth.canViewPatient(p.user_id, 'full_record');
    const scoped = !access.ok ? Auth.consentFor(p.user_id, myOrg()) : null;
    if (!access.ok && !scoped) return Views._noConsent(el, p);
    const scope = access.ok ? (access.why === 'consent' ? access.consent.scope : 'full_record') : scoped.scope;
    const t0 = performance.now();
    const R = await Domain.patientRecord(pid);
    const loadMs = performance.now() - t0; Metrics.recordTimes.push(loadMs);
    if (!Auth.is('patient')) Audit.view(pid, 'clinical_record', { load_ms: Math.round(loadMs), scope, via: access.why });
    const allow = { visit: ['full_record'].includes(scope), rx: ['full_record', 'prescription'].includes(scope), lab: ['full_record', 'lab_result'].includes(scope), rad: ['full_record', 'radiology'].includes(scope) };
    const tl = R.timeline.filter(x => allow[x.kind]);
    const chronic = Crypto.dv(R.p.chronic_conditions);
    el.innerHTML = `
    ${access.why === 'emergency' ? '<div class="callout bad" style="margin-bottom:12px"><b>وصول طوارئ نشط</b> — كل عمليات الاطلاع مسجلة وتم إخطار المريض والإدارة.</div>' : ''}
    <div class="card"><div class="ph"><div class="avatar">${R.p.gender === 'أنثى' ? '👩' : '👨'}</div>
      <div class="grow"><h2 style="margin:0">${U.esc(R.user.full_name)}</h2><div class="facts" style="margin-top:6px">
        <div><span>الرقم القومي</span><span class="mono">${U.esc(Auth.is('patient') ? R.user.national_id : U.maskNid(R.user.national_id))}</span></div>
        <div><span>العمر</span>${U.age(R.p.dob)} سنة</div><div><span>النوع</span>${U.esc(R.p.gender || '—')}</div>
        <div><span>فصيلة الدم 🔒</span><b>${U.esc(Crypto.dv(R.p.blood_type) || '—')}</b></div>
        <div><span>الأمراض المزمنة والحساسية 🔒</span>${chronic ? `<span class="crit">${U.esc(chronic)}</span>` : '—'}</div></div></div>
      <div class="row">${Auth.is('doctor') ? '<button class="btn pri" id="visit">+ زيارة وروشتة</button>' : ''}${Auth.is('lab') ? '<button class="btn pri" id="lab">+ نتيجة تحليل</button>' : ''}${Auth.is('radiology') ? '<button class="btn pri" id="rad">+ تقرير أشعة</button>' : ''}${Auth.is('doctor', 'patient') ? '<button class="btn" id="edit">تحديث البيانات الطبية</button>' : ''}</div></div>
      <div class="small muted" style="margin-top:8px">تم تحميل السجل في ${loadMs.toFixed(0)} مللي ثانية · نطاق الاطلاع: ${CONSENT_SCOPES[scope]} · ${Auth.is('patient') ? '' : 'تم تسجيل هذا الاطلاع في سجل التدقيق (FR-03)'}</div></div>
    <div class="card" style="margin-top:16px"><div class="tabs" role="tablist">${[['all', 'الكل (زمني)'], ['visit', 'الزيارات والتشخيصات'], ['rx', 'الروشتات'], ['lab', 'التحاليل'], ['rad', 'الأشعة']].filter(([k]) => k === 'all' || allow[k]).map(([k, l], i) => `<button role="tab" data-tab="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div><div id="tl"></div></div>`;
    const draw = kind => {
      const items = kind === 'all' ? tl : tl.filter(x => x.kind === kind);
      el.querySelector('#tl').innerHTML = items.length ? `<div class="tl">${items.map(x => Views._tlItem(x)).join('')}</div>` : '<div class="empty">لا توجد سجلات</div>';
      el.querySelectorAll('[data-rx]').forEach(b => b.onclick = () => Views._rxModal(Store.get('prescriptions', b.dataset.rx)));
    };
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.tab); });
    draw('all');
    el.querySelector('#visit')?.addEventListener('click', () => Views._visitModal(p));
    el.querySelector('#lab')?.addEventListener('click', () => UI.form('نتيجة تحليل جديدة', [
      { name: 'test_type', label: 'نوع التحليل', type: 'select', options: LAB_TESTS, required: true }, { name: 'result_value', label: 'النتيجة (مشفرة)', required: true },
      { name: 'unit', label: 'الوحدة' }, { name: 'ref_range', label: 'المعدل الطبيعي' }, { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true }
    ], {}, async v => { await Domain.addLabResult({ ...v, patient_id: p.id }); UI.toast('تم حفظ النتيجة وإشعار المريض', 'ok'); App.render(); }));
    el.querySelector('#rad')?.addEventListener('click', () => UI.form('تقرير أشعة جديد', [
      { name: 'scan_type', label: 'نوع الفحص', type: 'select', options: SCAN_TYPES, required: true }, { name: 'image_ref', label: 'مرجع الصورة (DICOM / PACS)', placeholder: 'dicom://pacs/studies/…', hint: 'الصور تُخزن في نظام ملفات منفصل وليس في قاعدة البيانات' },
      { name: 'report_text', label: 'نص التقرير', type: 'textarea', required: true, full: true }
    ], { image_ref: `dicom://pacs.${myOrg()?.slice(0, 4)}/studies/${U.uuid().slice(0, 8)}` }, async v => { await Domain.addRadiology({ ...v, patient_id: p.id }); UI.toast('تم حفظ التقرير وإشعار المريض', 'ok'); App.render(); }));
    el.querySelector('#edit')?.addEventListener('click', () => UI.form('البيانات الطبية الثابتة', [
      { name: 'blood_type', label: 'فصيلة الدم', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { name: 'chronic_conditions', label: 'الأمراض المزمنة والحساسية', type: 'textarea', full: true }
    ], { blood_type: Crypto.dv(R.p.blood_type), chronic_conditions: chronic }, async v => { await Store.update('patients', p.id, v); UI.toast('تم التحديث وتسجيل التغيير في سجل التدقيق', 'ok'); App.render(); }, { intro: '<p class="small muted">أي تعديل يُسجل في AuditLog بالقيمة القديمة والجديدة والمستخدم المسؤول.</p>' }));
  },
  _tlItem(x) {
    const r = x.row;
    if (x.kind === 'visit') return `<div class="tl-item"><div class="tl-card"><div class="h"><b>🩺 زيارة — ${U.esc(r.chief_complaint || '')}</b><span class="small muted">${U.fmtDT(r.visit_date)}</span></div>
      <div class="small">${U.esc(Domain.userName(r.doctor_id))} · ${U.esc(Domain.orgName(r.organization_id))}${r.emergency ? ' · ' + UI.badge('طوارئ', 'bad') : ''}</div>
      ${x.dx.length ? `<div class="row" style="margin-top:6px">${x.dx.map(d => UI.badge(`${d.icd10_code} — ${d.description}`, 'brand')).join('')}</div>` : ''}${r.notes ? `<div class="small" style="margin-top:4px">${U.esc(r.notes)}</div>` : ''}</div></div>`;
    if (x.kind === 'rx') { const items = Domain.rxItems(r.id); return `<div class="tl-item rx"><div class="tl-card"><div class="h"><b>📝 روشتة إلكترونية (نسخة ${r.version_no})</b>${UI.rxBadge(r.status)}<span class="small muted">${U.fmtDT(r.issued_at)}</span><button class="btn sm" data-rx="${r.id}">عرض</button></div>
      <div class="small">${items.map(i => `${U.esc(Domain.drugName(i.drug_id))} × ${i.quantity} (${U.esc(i.dosage)})`).join(' · ')}</div>${r.dispensed_org_id ? `<div class="small muted">صُرفت من ${U.esc(Domain.orgName(r.dispensed_org_id))} — ${U.fmtDT(r.dispensed_at)}</div>` : ''}</div></div>`; }
    if (x.kind === 'lab') return `<div class="tl-item lab"><div class="tl-card"><div class="h"><b>🧪 ${U.esc(r.test_type)}</b><span class="small muted">${U.fmtDT(r.result_date)}</span></div>
      <div>النتيجة: <b class="mono">${U.esc(Crypto.dv(r.result_value))}</b> ${U.esc(r.unit || '')} <span class="small muted">(الطبيعي: ${U.esc(r.ref_range || '—')})</span></div><div class="small muted">${U.esc(Domain.orgName(r.lab_org_id))}</div></div></div>`;
    return `<div class="tl-item rad"><div class="tl-card"><div class="h"><b>🩻 ${U.esc(r.scan_type)}</b><span class="small muted">${U.fmtDT(r.report_date)}</span></div><div class="small">${U.esc(r.report_text)}</div>
      <div class="small muted">${U.esc(Domain.orgName(r.radiology_org_id))} · <span class="mono">${U.esc(r.image_ref || '')}</span></div></div></div>`;
  },
  _noConsent(el, p) {
    const u = Store.get('users', p.user_id);
    Audit.log('access_denied', 'clinical_record', p.id, null, null, { patient_id: p.id, reason: 'no_consent' });
    el.innerHTML = `<div class="card"><div class="callout warn"><b>لا توجد موافقة سارية</b> من المريض <b class="ink">${U.esc(u?.full_name)}</b> لجهتك (${U.esc(Domain.orgName(myOrg()))}) للاطلاع على ملفه الطبي (BR-02).</div>
      <ul class="small"><li>اطلب من المريض منح الموافقة من تطبيقه (قائمة "موافقات الاطلاع").</li><li>أو سجّل موافقته الحضورية إن كان حاضراً.</li><li>في حالات الطوارئ المصنفة فقط: يمكنك فتح الملف مع تسجيل المبرر وإخطار المريض.</li></ul>
      <div class="row"><button class="btn pri" id="c">تسجيل موافقة حضورية من المريض</button><button class="btn danger" id="e">🚨 وصول طوارئ</button></div></div>`;
    el.querySelector('#c').onclick = async () => {
      const r = await UI.modal({ title: 'موافقة حضورية', body: `<p>يتم إرسال رمز تحقق لموبايل المريض المسجل (${U.esc(u?.phone?.slice(0, 3))}•••${U.esc(u?.phone?.slice(-2))}). <span class="muted small">(محاكاة: الرمز هو <b class="mono">${(u?.national_id || '').slice(-4)}</b>)</span></p>${UI.fields([{ name: 'otp', label: 'رمز التحقق من المريض', required: true }, { name: 'scope', label: 'نطاق الموافقة', type: 'select', options: Object.entries(CONSENT_SCOPES), value: 'full_record', empty: false }])}`, actions: [{ label: 'إلغاء', value: null }, { label: 'تأكيد', kind: 'pri', onClick: m => { const v = UI.read(m); if (v.otp !== (u.national_id || '').slice(-4)) throw new Error('رمز التحقق غير صحيح'); return v; } }] });
      if (r) { await Domain.grantConsent(u.id, myOrg(), r.scope); UI.toast('تم تسجيل الموافقة', 'ok'); App.render(); }
    };
    el.querySelector('#e').onclick = async () => { const reason = await UI.ask('وصول طوارئ', 'مبرر الطوارئ (سيُسجل ويُرسل للمريض والإدارة)', { multiline: true }); if (!reason) return; try { await Domain.emergencyAccess(u.id, reason); App.render(); } catch (e) { UI.toast(e.message, 'err'); } };
  },

  /* ---------------------- زيارة + تشخيص + روشتة (UC-01/UC-02, FR-05/06) ---------------------- */
  _visitModal(p, amendRx) {
    const drugs = Store.all('drugs');
    const pre = amendRx ? Domain.rxItems(amendRx.id) : [];
    const body = `${amendRx ? `<div class="callout info">تعديل الروشتة سيُنشئ <b>نسخة جديدة</b> برمز QR جديد، وتبقى النسخة القديمة للمراجعة القانونية ويُبطل رمزها.</div>` : `
      ${UI.fields([{ name: 'chief_complaint', label: 'الشكوى الرئيسية', required: true, full: true }, { name: 'notes', label: 'ملاحظات الفحص', type: 'textarea', full: true }, { name: 'emergency', label: 'زيارة طوارئ', type: 'checkbox' }])}
      <h4 style="margin:14px 0 6px">التشخيص (ICD-10)</h4><div class="row"><input class="i" id="icd" list="icdl" placeholder="ابحث بالكود أو الوصف" style="flex:1"><datalist id="icdl">${ICD10.map(([c, d]) => `<option value="${c} — ${d}">`).join('')}</datalist><button class="btn" id="addDx">إضافة</button></div><div class="row" id="dx" style="margin-top:6px"></div>`}
      <h4 style="margin:14px 0 6px">الروشتة الإلكترونية</h4>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>الدواء</th><th>الجرعة</th><th>الكمية</th><th>تعليمات</th><th></th></tr></thead><tbody id="items"></tbody></table></div>
      <button class="btn sm" id="addIt" style="margin-top:8px">+ دواء</button>
      ${amendRx ? UI.fields([{ name: 'reason', label: 'سبب التعديل', required: true, full: true }]) : ''}
      <div id="ix" style="margin-top:12px"></div>`;
    return UI.modal({
      title: amendRx ? `تعديل الروشتة (نسخة ${amendRx.version_no + 1})` : 'زيارة جديدة', wide: true, body,
      onMount: m => {
        const dx = []; const tb = m.querySelector('#items');
        const addRow = (it = {}) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td><select class="i" data-k="drug_id"><option value="">— اختر —</option>${drugs.map(d => `<option value="${d.id}" ${d.id === it.drug_id ? 'selected' : ''}>${U.esc(d.name)}</option>`).join('')}</select></td>
            <td><input class="i" data-k="dosage" value="${U.esc(it.dosage || '1 × 2 يومياً')}"></td><td><input class="i" data-k="quantity" type="number" min="1" max="20" value="${it.quantity || 1}" style="width:70px"></td>
            <td><input class="i" data-k="instructions" value="${U.esc(it.instructions || 'بعد الأكل')}"></td><td><button class="btn sm ghost" data-del>✕</button></td>`;
          tr.querySelector('[data-del]').onclick = () => { tr.remove(); check(); };
          tr.querySelector('select').onchange = check; tb.appendChild(tr);
        };
        const check = () => {
          const ids = [...tb.querySelectorAll('select')].map(s => s.value).filter(Boolean);
          const w = Domain.checkInteractions(p.id, ids); m._warn = w;
          m.querySelector('#ix').innerHTML = w.length ? `<div class="callout ${w.some(x => x.severity === 'high') ? 'bad' : 'warn'}"><b>⚠ تنبيهات تعارض دوائي (FR-06) — استشارية فقط، والقرار النهائي للطبيب (BR-04)</b>
            <ul style="margin:6px 0">${w.map(x => `<li class="ink">${UI.sevBadge(x.severity)} <b>${U.esc(x.drug)}</b> مع ${U.esc(x.with)}: ${U.esc(x.message)}</li>`).join('')}</ul>
            <label class="check ink"><input type="checkbox" id="ack"> اطلعت على التنبيهات وأتحمل القرار السريري</label></div>` : (ids.length ? '<div class="callout ok">✔ لا توجد تعارضات معروفة مع الحالة المرضية أو الأدوية السارية</div>' : '');
        };
        m._dx = dx;
        m.querySelector('#addDx')?.addEventListener('click', () => {
          const v = m.querySelector('#icd').value; const code = v.split(' — ')[0].trim(); if (!code) return;
          const f = ICD10.find(x => x[0] === code); dx.push({ code, desc: f ? f[1] : v }); m.querySelector('#icd').value = '';
          m.querySelector('#dx').innerHTML = dx.map((d, i) => `<span class="badge brand">${U.esc(d.code)} — ${U.esc(d.desc)} <a href="javascript:void 0" data-rm="${i}">✕</a></span>`).join('');
          m.querySelectorAll('[data-rm]').forEach(a => a.onclick = () => { dx.splice(Number(a.dataset.rm), 1); a.parentElement.remove(); });
        });
        m.querySelector('#addIt').onclick = () => addRow();
        if (pre.length) pre.forEach(addRow); else addRow();
        check();
      },
      actions: [{ label: 'إلغاء', value: null }, {
        label: amendRx ? 'إصدار النسخة الجديدة' : 'حفظ الزيارة وإصدار الروشتة', kind: 'pri', onClick: async m => {
          const items = [...m.querySelectorAll('#items tr')].map(tr => Object.fromEntries([...tr.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value.trim()]))).filter(i => i.drug_id);
          const w = m._warn || [];
          if (w.length && !m.querySelector('#ack')?.checked) throw new Error('يجب تأكيد الاطلاع على تنبيهات التعارض قبل الإصدار');
          if (amendRx) {
            const v = UI.read(m); const rx = await Domain.amendPrescription(amendRx.id, items, v.reason);
            UI.toast('تم إصدار نسخة جديدة من الروشتة', 'ok'); App.render(); setTimeout(() => Views._rxModal(rx), 100); return;
          }
          const v = UI.read(m);
          const visit = await Domain.createVisit({ patient_id: p.id, chief_complaint: v.chief_complaint, notes: v.notes, emergency: v.emergency });
          for (const d of m._dx) await Domain.addDiagnosis(visit.id, d.code, d.desc);
          let rx = null;
          if (items.length) rx = await Domain.issuePrescription({ visit_id: visit.id, patient_id: p.id, items, overrides: w.map(x => `${x.drug} / ${x.with}: ${x.message}`) });
          UI.toast(rx ? 'تم حفظ الزيارة وإصدار الروشتة الموقعة' : 'تم حفظ الزيارة', 'ok'); App.render();
          if (rx) setTimeout(() => Views._rxModal(rx), 100);
        }
      }]
    });
  },
  _rxModal(rx) {
    if (!rx) return;
    const versions = Store.where('prescriptions', r => (r.root_id || r.id) === (rx.root_id || rx.id)).sort((a, b) => a.version_no - b.version_no);
    const canEdit = Auth.is('doctor') && rx.doctor_id === Auth.user.id && rx.status === 'issued';
    const rec = Store.find('dispense_records', d => d.prescription_id === rx.id);
    UI.modal({
      title: 'الروشتة الإلكترونية', wide: true, body: `${UI.rxPaper(rx)}
      ${rx.interaction_overrides?.length ? `<div class="callout warn" style="margin-top:12px"><b>تنبيهات تعارض تم تجاوزها بقرار الطبيب:</b><ul>${rx.interaction_overrides.map(o => `<li class="ink small">${U.esc(o)}</li>`).join('')}</ul></div>` : ''}
      ${rec ? `<div class="callout ${rec.needs_review ? 'warn' : 'ok'}" style="margin-top:12px">صُرفت من <b>${U.esc(Domain.orgName(rec.pharmacy_org_id))}</b> بواسطة ${U.esc(Domain.userName(rec.pharmacist_id))} — ${U.fmtDT(rec.dispensed_at)}${rec.needs_review ? ' — <b>الكمية المصروفة تختلف عن الموصوفة (BR-03): ' + (rec.review_status === 'pending' ? 'قيد المراجعة' : rec.review_status) + '</b>' : ''}</div>` : ''}
      ${versions.length > 1 ? `<h4>سجل النسخ (Versioning)</h4><div class="tbl-wrap"><table class="t"><tr><th>النسخة</th><th>الحالة</th><th>التاريخ</th><th>السبب</th></tr>${versions.map(v => `<tr><td>${v.version_no}</td><td>${UI.rxBadge(v.status)}</td><td>${U.fmtDT(v.issued_at)}</td><td class="small">${U.esc(v.amend_reason || '—')}</td></tr>`).join('')}</table></div>` : ''}`,
      actions: [
        ...(canEdit ? [{ label: 'تعديل (نسخة جديدة)', onClick: () => { const p = Store.get('patients', rx.patient_id); setTimeout(() => Views._visitModal(p, rx), 50); return true; } },
        { label: 'إلغاء الروشتة', kind: 'danger', onClick: async () => { const r = await UI.ask('إلغاء الروشتة', 'سبب الإلغاء'); if (!r) return false; await Domain.cancelPrescription(rx.id, r); UI.toast('تم الإلغاء', 'ok'); App.render(); return true; } }] : []),
        { label: 'نسخ رمز الروشتة', onClick: async () => { try { await navigator.clipboard.writeText(rx.qr_code_signed); UI.toast('تم النسخ', 'ok'); } catch { UI.toast(rx.qr_code_signed); } return false; } },
        { label: 'إغلاق' }]
    });
  },
  _rxTable(el, rows) {
    UI.table(el, {
      rows, onRow: r => Views._rxModal(r), exportName: 'prescriptions', cols: [
        C('التاريخ', r => U.fmtDT(r.issued_at)), C('المريض', r => U.esc(Domain.patientUser(r.patient_id)?.full_name)), C('الطبيب', r => U.esc(Domain.userName(r.doctor_id))),
        C('الأدوية', r => U.esc(Domain.rxItems(r.id).map(i => Domain.drugName(i.drug_id)).join('، '))), C('النسخة', r => r.version_no, null, 'num'), C('الحالة', r => UI.rxBadge(r.status), r => RX_STATUS[r.status])]
    });
  },
  prescriptions(el) {
    const rows = (Auth.is('doctor') ? Store.where('prescriptions', r => r.doctor_id === Auth.user.id) : Store.all('prescriptions')).sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    el.innerHTML = `<div class="grid g4">${Object.entries(RX_STATUS).slice(0, 4).map(([k, l]) => UI.kpi(l, U.fmtNum(rows.filter(r => r.status === k).length))).join('')}</div><div class="card" style="margin-top:16px"><div id="t"></div></div>`;
    Views._rxTable(el.querySelector('#t'), rows);
  },
  labs(el) { Views._dashLab(el); },
  rads(el) { Views._dashLab(el); },

  /* ============================== بوابة المريض ============================== */
  myrecord(el) { return Views.record(el, { pid: Domain.patientByUser(Auth.user.id)?.id }); },
  myrx(el) {
    const p = Domain.patientByUser(Auth.user.id);
    const rows = Store.where('prescriptions', r => r.patient_id === p?.id && r.status !== 'superseded').sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    const active = rows.filter(r => r.status === 'issued');
    el.innerHTML = `${active.length ? `<div class="callout info">اعرض رمز QR على الصيدلي لصرف الروشتة. كل رمز يُستخدم مرة واحدة فقط.</div><div class="grid g2" style="margin-top:12px">${active.map(r => `<div>${UI.rxPaper(r)}</div>`).join('')}</div>` : '<div class="card empty">لا توجد روشتات سارية حالياً</div>'}
      <div class="card" style="margin-top:16px"><h3>كل الروشتات</h3><div id="t"></div></div>`;
    Views._rxTable(el.querySelector('#t'), rows);
  },
  consents(el) {
    const rows = Store.where('consent_grants', c => c.patient_id === Auth.user.id).sort((a, b) => b.granted_at.localeCompare(a.granted_at));
    el.innerHTML = `<div class="card"><div class="card-head"><h3>موافقات الاطلاع على ملفي (UC-07)</h3><button class="btn pri" id="add">+ منح موافقة لجهة</button></div>
      <p class="small muted">لا يمكن لأي جهة الاطلاع على سجلك الطبي دون موافقة صريحة منك (BR-02). يمكنك سحب الموافقة في أي وقت ويُطبق السحب فوراً.</p><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, cols: [C('الجهة', c => `<b>${U.esc(Domain.orgName(c.organization_id))}</b>`), C('النوع', c => U.esc(ORG_TYPES[Store.getAny('organizations', c.organization_id)?.type])),
      C('النطاق', c => UI.badge(CONSENT_SCOPES[c.scope], 'brand'), c => CONSENT_SCOPES[c.scope]), C('تاريخ المنح', c => U.fmtDate(c.granted_at)),
      C('الحالة', c => c.revoked_at ? UI.badge('مسحوبة ' + U.fmtDate(c.revoked_at), 'bad') : UI.badge('سارية', 'ok')),
      C('', c => c.revoked_at ? '' : `<button class="btn sm danger" data-rv="${c.id}">سحب</button>`, () => '')]
    });
    el.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => { if (await UI.confirm('سحب الموافقة؟ لن تتمكن الجهة من الاطلاع على ملفك بعد الآن.', { danger: true, ok: 'سحب' })) { await Domain.revokeConsent(b.dataset.rv); UI.toast('تم سحب الموافقة', 'ok'); App.render(); } });
    el.querySelector('#add').onclick = () => UI.form('منح موافقة', [
      { name: 'organization_id', label: 'الجهة', type: 'select', options: orgOptions(['hospital', 'clinic', 'lab', 'radiology', 'pharmacy']), required: true, full: true },
      { name: 'scope', label: 'نطاق الاطلاع', type: 'select', options: Object.entries(CONSENT_SCOPES), required: true, value: 'full_record', empty: false }
    ], {}, async v => { await Domain.grantConsent(Auth.user.id, v.organization_id, v.scope); UI.toast('تم منح الموافقة', 'ok'); App.render(); });
  },
  access(el) {
    const p = Domain.patientByUser(Auth.user.id);
    const rows = Store.where('audit_logs', a => a.actor_user_id !== Auth.user.id && (a.details?.patient_id === p?.id || a.details?.patient_id === Auth.user.id || (a.resource_type === 'patients' && a.resource_id === p?.id))).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const act = { view: 'اطلاع', emergency_access: 'وصول طوارئ', access_denied: 'محاولة مرفوضة (بدون موافقة)', update: 'تعديل', create: 'إنشاء' };
    el.innerHTML = `<div class="card"><h3>من اطلع على ملفي ومتى (FR-03)</h3><p class="small muted">سجل غير قابل للتعديل أو الحذف لكل عملية اطلاع أو تعديل على بياناتك.</p><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, exportName: 'my-access-log', cols: [C('التوقيت', a => U.fmtDT(a.timestamp)), C('الشخص', a => U.esc(Domain.userName(a.actor_user_id))), C('الصفة', a => U.esc(ROLES[Store.getAny('users', a.actor_user_id)?.role]?.label || '')),
      C('الجهة', a => U.esc(Domain.orgName(a.actor_org_id))), C('العملية', a => UI.badge(act[a.action] || a.action, a.action === 'emergency_access' ? 'bad' : a.action === 'access_denied' ? 'warn' : ''), a => act[a.action] || a.action),
      C('التفاصيل', a => U.esc(a.details?.reason || CONSENT_SCOPES[a.details?.scope] || a.resource_type || ''))]
    });
  },
  insurance(el) {
    const rows = Auth.is('patient') ? Store.where('insurance_policies', i => i.patient_id === Domain.patientByUser(Auth.user.id)?.id) : Store.all('insurance_policies');
    Crypto.warm(rows, ['policy_number']).then(() => {
      el.innerHTML = `<div class="callout warn"><b>نطاق مستقبلي (Won't have في المرحلة التجريبية)</b> — البنية جاهزة في قاعدة البيانات لكنها غير مفعّلة. سيتم الربط المباشر مع شركات التأمين الصحي لاحقاً.</div>
        <div class="card" style="margin-top:16px"><h3>وثائق التأمين</h3><div id="t"></div></div>`;
      UI.table(el.querySelector('#t'), { rows, search: false, cols: [C('المريض', r => U.esc(Domain.patientUser(r.patient_id)?.full_name)), C('الجهة', r => U.esc(r.provider_name)), C('رقم الوثيقة 🔒', r => `<span class="mono">${U.esc(Crypto.dv(r.policy_number))}</span>`), C('التغطية', r => U.esc(r.coverage_details))] });
    });
  },

  /* ============================== الصرف (UC-03/04) ============================== */
  dispense(el) {
    const S = { rx: null, items: [], picks: {} };
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>1) مسح رمز QR الروشتة</h3><div id="sc"></div>
      <details style="margin-top:10px"><summary class="small muted">🧪 روشتات تجريبية سارية (للعرض والاختبار فقط)</summary><div id="demo" class="small"></div></details></div>
      <div class="card" id="rxv"><div class="empty">بانتظار مسح الروشتة…</div></div></div>
      <div class="card" style="margin-top:16px" id="pick" hidden></div>`;
    const demo = Store.where('prescriptions', r => r.status === 'issued').slice(0, 6);
    el.querySelector('#demo').innerHTML = demo.length ? demo.map(r => `<div style="margin:6px 0">${U.esc(Domain.patientUser(r.patient_id)?.full_name)} — ${U.esc(Domain.rxItems(r.id).map(i => Domain.drugName(i.drug_id)).join('، '))} <button class="btn sm" data-c="${U.esc(r.qr_code_signed)}">استخدم</button></div>`).join('') : 'لا توجد';
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { el.querySelector('#sc input.i').value = b.dataset.c; el.querySelector('#sc [data-go]').click(); });
    UI.scanner(el.querySelector('#sc'), {
      label: 'امسح رمز الروشتة من موبايل المريض أو المطبوعة', onCode: async code => {
        const r = await Domain.verifyRx(code);
        if (!r.ok) { el.querySelector('#rxv').innerHTML = `<div class="verify ${r.danger ? 'danger' : 'warn'}"><h3>⛔ ${U.esc(r.title)}</h3>${r.detail ? `<p>${U.esc(r.detail)}</p>` : ''}<div class="small muted">زمن التحقق: ${r.ms.toFixed(0)} مللي ثانية</div></div>`; el.querySelector('#pick').hidden = true; return; }
        S.rx = r.rx; S.items = r.items; S.picks = {};
        const pu = Domain.patientUser(r.rx.patient_id);
        await Crypto.warm([r.patient], ENC_FIELDS.patients);
        el.querySelector('#rxv').innerHTML = `<div class="verify ok"><h3>✅ روشتة صالحة وموقعة رقمياً</h3>
          <div class="facts"><div><span>المريض</span><b>${U.esc(pu?.full_name)}</b></div><div><span>الطبيب</span>${U.esc(Domain.userName(r.rx.doctor_id))}</div><div><span>الجهة</span>${U.esc(Domain.orgName(r.rx.organization_id))}</div><div><span>التاريخ</span>${U.fmtDT(r.rx.issued_at)}</div><div><span>حساسية/أمراض مزمنة</span>${U.esc(Crypto.dv(r.patient?.chronic_conditions) || '—')}</div></div>
          <div class="small muted" style="margin-top:6px">زمن التحقق: ${r.ms.toFixed(0)} مللي ثانية — يظهر اسم الدواء والجرعة خلال أقل من ثانيتين ✔</div></div>`;
        drawPick();
      }
    });
    const drawPick = () => {
      const box = el.querySelector('#pick'); box.hidden = false;
      box.innerHTML = `<div class="card-head"><h3>2) مسح عبوات الأدوية وخصمها من المخزون</h3><button class="btn" id="auto">اختيار تلقائي (الأقرب انتهاءً أولاً)</button></div>
        <div id="sc2"></div>
        <div class="tbl-wrap" style="margin-top:12px"><table class="t"><thead><tr><th>الدواء</th><th>الجرعة</th><th class="num">الموصوف</th><th class="num">المتاح</th><th>العبوات الممسوحة</th></tr></thead><tbody>
        ${S.items.map(it => { const sel = S.picks[it.id] || []; const avail = Domain.suggestUnits(it.drug_id, 999).length; return `<tr><td><b>${U.esc(Domain.drugName(it.drug_id))}</b></td><td>${U.esc(it.dosage)}<div class="small muted">${U.esc(it.instructions)}</div></td><td class="num">${it.quantity}</td><td class="num">${avail}${avail < it.quantity ? ' ' + UI.badge('غير كافٍ', 'warn') : ''}</td>
          <td>${sel.map(id => { const u = Store.get('package_units', id); return `<span class="badge ok mono">${U.esc(u.serial_number)} <a href="javascript:void 0" data-un="${it.id}|${id}">✕</a></span>`; }).join(' ') || '<span class="muted small">لا شيء</span>'} ${sel.length !== Number(it.quantity) ? UI.badge(`${sel.length}/${it.quantity}`, 'warn') : UI.badge('مكتمل', 'ok')}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div id="msg" style="margin-top:10px"></div>
        <div class="row end" style="margin-top:12px"><button class="btn pri" id="go">3) تأكيد الصرف وإصدار الفاتورة</button></div>`;
      UI.scanner(box.querySelector('#sc2'), {
        label: 'امسح QR كل عبوة (أو الرقم التسلسلي)', button: 'إضافة', onCode: async code => {
          const res = await Domain.verifyPackage(code, { mode: 'dispense' });
          const msg = box.querySelector('#msg');
          if (!res.ok) { msg.innerHTML = UI.verifyCard(res); return; }
          const did = res.info.batch.drug_id; const it = S.items.find(i => i.drug_id === did && (S.picks[i.id] || []).length < Number(i.quantity)) || S.items.find(i => i.drug_id === did);
          if (!it) { msg.innerHTML = `<div class="callout bad">العبوة (${U.esc(res.info.drug.name)}) غير موجودة في هذه الروشتة</div>`; return; }
          const all = Object.values(S.picks).flat(); if (all.includes(res.info.unit.id)) { msg.innerHTML = '<div class="callout warn">العبوة ممسوحة بالفعل</div>'; return; }
          (S.picks[it.id] = S.picks[it.id] || []).push(res.info.unit.id); drawPick();
          box.querySelector('#msg').innerHTML = `<div class="callout ok">✔ ${U.esc(res.info.drug.name)} — ${res.ms.toFixed(0)} مللي ث</div>`;
        }
      });
      box.querySelectorAll('[data-un]').forEach(a => a.onclick = () => { const [iid, uid] = a.dataset.un.split('|'); S.picks[iid] = (S.picks[iid] || []).filter(x => x !== uid); drawPick(); });
      box.querySelector('#auto').onclick = () => { const used = new Set(); for (const it of S.items) { const units = Domain.suggestUnits(it.drug_id, 999).filter(u => !used.has(u.id)).slice(0, it.quantity); units.forEach(u => used.add(u.id)); S.picks[it.id] = units.map(u => u.id); } drawPick(); };
      box.querySelector('#go').onclick = async () => {
        const mism = S.items.filter(it => (S.picks[it.id] || []).length !== Number(it.quantity));
        if (mism.length && !(await UI.confirm(`الكمية المصروفة تختلف عن الموصوفة في ${mism.length} صنف. سيُصنف الصرف تلقائياً كحالة تستوجب المراجعة (BR-03) ولن يمكن استخدام الروشتة مرة أخرى (BR-01). متابعة؟`))) return;
        try {
          const rec = await Domain.dispense(S.rx.id, S.picks);
          box.innerHTML = `<div class="verify ok"><h3>✅ تم الصرف بنجاح</h3><p>تم خصم ${rec.lines.reduce((s, l) => s + l.dispensed, 0)} عبوة من المخزون، وإصدار ${rec.lines.reduce((s, l) => s + l.dispensed, 0)} فاتورة إلكترونية بإجمالي <b>${U.fmtMoney(rec.total)}</b> + ضريبة ${U.fmtMoney(rec.tax)}، وإرسال إشعار للمريض (FR-11).</p>${rec.needs_review ? '<div class="callout warn">صُنف هذا الصرف كحالة تحتاج مراجعة (BR-03)</div>' : ''}<div class="row"><button class="btn pri" id="again">صرف روشتة أخرى</button></div></div>`;
          box.querySelector('#again').onclick = () => App.render();
          el.querySelector('#rxv').innerHTML = '<div class="empty">تم استخدام الروشتة</div>';
        } catch (e) { UI.toast(e.message, 'err'); }
      };
    };
  },
  dispensed(el) {
    const rows = Store.where('dispense_records', d => Auth.is('pharmacist') ? d.pharmacy_org_id === myOrg() : true).sort((a, b) => b.dispensed_at.localeCompare(a.dispensed_at));
    el.innerHTML = `<div class="card"><h3>سجل عمليات الصرف</h3><div id="t"></div></div>`;
    Views._dispenseTable(el.querySelector('#t'), rows);
  },
  _dispenseTable(el, rows) {
    UI.table(el, {
      rows, exportName: 'dispense-records', onRow: d => Views._rxModal(Store.getAny('prescriptions', d.prescription_id)), cols: [
        C('التوقيت', d => U.fmtDT(d.dispensed_at)), C('المريض', d => U.esc(Domain.patientUser(d.patient_id)?.full_name)), C('الصيدلية', d => U.esc(Domain.orgName(d.pharmacy_org_id))),
        C('الأصناف', d => U.esc(d.lines.map(l => `${Domain.drugName(l.drug_id)} ${l.dispensed}/${l.prescribed}`).join('، '))),
        C('الإجمالي', d => U.fmtMoney(d.total), d => d.total, 'num'), C('المراجعة', d => d.needs_review ? UI.badge(d.review_status === 'pending' ? 'تحتاج مراجعة' : d.review_status === 'approved' ? 'معتمد' : 'مرفوض', d.review_status === 'pending' ? 'warn' : d.review_status === 'approved' ? 'ok' : 'bad') : UI.badge('مطابق', 'ok'), d => d.review_status)]
    });
  },
  reviews(el) {
    const rows = Store.where('dispense_records', d => d.needs_review).sort((a, b) => b.dispensed_at.localeCompare(a.dispensed_at));
    el.innerHTML = `<div class="card"><h3>حالات صرف تستوجب المراجعة (BR-03)</h3><p class="small muted">أي فرق بين الكمية المسجلة في الروشتة والكمية الفعلية المصروفة يُصنف تلقائياً كحالة تستوجب المراجعة.</p><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, cols: [C('التوقيت', d => U.fmtDT(d.dispensed_at)), C('الصيدلية', d => U.esc(Domain.orgName(d.pharmacy_org_id))), C('الصيدلي', d => U.esc(Domain.userName(d.pharmacist_id))),
      C('الفروق', d => U.esc(d.lines.filter(l => l.dispensed !== l.prescribed).map(l => `${Domain.drugName(l.drug_id)}: موصوف ${l.prescribed} / مصروف ${l.dispensed}`).join('، '))),
      C('الحالة', d => UI.badge(d.review_status === 'pending' ? 'قيد المراجعة' : d.review_status === 'approved' ? 'معتمد' : 'مرفوض', d.review_status === 'pending' ? 'warn' : d.review_status === 'approved' ? 'ok' : 'bad'), d => d.review_status),
      C('', d => d.review_status === 'pending' ? `<button class="btn sm" data-ok="${d.id}">اعتماد</button> <button class="btn sm danger" data-no="${d.id}">رفض</button>` : U.esc(d.review_note || ''), () => '')]
    });
    const act = async (id, st) => { const n = await UI.ask('قرار المراجعة', 'ملاحظة القرار'); if (n === null) return; await Store.update('dispense_records', id, { review_status: st, review_note: n, reviewed_by: Auth.user.id, reviewed_at: U.now() }); Audit.log('review_' + st, 'dispense_records', id); App.render(); };
    el.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => act(b.dataset.ok, 'approved'));
    el.querySelectorAll('[data-no]').forEach(b => b.onclick = () => act(b.dataset.no, 'rejected'));
  },

  /* ============================== الاستلام والشحن (UC-06) ============================== */
  receive(el) {
    const me = myOrg(); const inc = Domain.incomingFor(me);
    const byShip = U.groupBy(inc, u => u.shipment_no || '—');
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>استلام عبوة بالمسح</h3><div id="sc"></div><div id="msg" style="margin-top:8px"></div></div>
      <div class="card"><h3>الشحنات الواردة (${Object.keys(byShip).length})</h3>${Object.keys(byShip).length ? Object.entries(byShip).map(([s, arr]) => {
        const from = Store.where('supply_chain_events', e => e.shipment_no === s && e.event_type === 'shipped')[0];
        const g = U.groupBy(arr, u => Domain.drugName(Store.getAny('production_batches', u.batch_id)?.drug_id));
        return `<div class="tl-card" style="margin-bottom:8px"><div class="h"><b class="mono">${U.esc(s)}</b><span class="small muted">من ${U.esc(Domain.orgName(from?.from_org_id))} · ${U.fmtDT(from?.event_timestamp)}</span><button class="btn sm pri" data-s="${U.esc(s)}">تأكيد استلام الكل (${arr.length})</button></div><div class="small">${Object.entries(g).map(([k, v]) => `${U.esc(k)} × ${v.length}`).join(' · ')}</div></div>`;
      }).join('') : '<div class="empty">لا توجد شحنات واردة</div>'}</div></div>`;
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const n = await Domain.receive(byShip[b.dataset.s].map(u => u.id)); UI.toast(`تم استلام ${n} عبوة وتحديث المخزون`, 'ok'); App.render(); });
    UI.scanner(el.querySelector('#sc'), {
      label: 'امسح QR العبوة الواردة', button: 'استلام', onCode: async code => {
        const res = await Domain.verifyPackage(code, { mode: 'receive', record: false });
        const msg = el.querySelector('#msg');
        if (!res.info) { msg.innerHTML = UI.verifyCard(res); return; }
        const u = res.info.unit;
        if (u.status !== 'in_transit' || u.pending_to_org_id !== me) { await Domain.alert('wrong_location', u.id, { serial: u.serial_number, where: Domain.orgName(me), expected: Domain.orgName(u.pending_to_org_id || u.current_org_id) }); msg.innerHTML = `<div class="callout bad">العبوة ليست ضمن شحنة موجهة لجهتك — تم إبلاغ الرقابة</div>`; return; }
        await Domain.receive([u.id]); msg.innerHTML = `<div class="callout ok">✔ تم استلام ${U.esc(res.info.drug.name)} (${U.esc(u.serial_number)})</div>`;
      }
    });
  },
  ship(el) {
    const me = myOrg(); const myType = Store.get('organizations', me)?.type;
    const dests = myType === 'factory' ? ['distributor'] : ['pharmacy', 'distributor'];
    const avail = Store.where('package_units', u => u.current_org_id === me && ['produced', 'received'].includes(u.status));
    const byBatch = U.groupBy(avail, 'batch_id');
    const scanned = [];
    el.innerHTML = `<div class="card"><h3>شحن عبوات (UC-06 / FR-08)</h3>
      ${UI.fields([{ name: 'to', label: 'الجهة المستلمة', type: 'select', options: orgOptions(dests).filter(o => o[0] !== me), required: true, full: true }])}
      <h4>اختيار حسب الدفعة</h4><div class="tbl-wrap"><table class="t"><thead><tr><th>الصنف</th><th>الدفعة</th><th>الانتهاء</th><th class="num">المتاح</th><th>الكمية للشحن</th></tr></thead><tbody>
      ${Object.entries(byBatch).map(([bid, arr]) => { const b = Store.getAny('production_batches', bid); return `<tr><td>${U.esc(Domain.drugName(b?.drug_id))}</td><td class="mono">${U.esc(b?.batch_number)}</td><td>${U.fmtDate(b?.expiry_date)}</td><td class="num">${arr.length}</td><td><input class="i" type="number" min="0" max="${arr.length}" value="0" data-b="${bid}" style="width:90px"></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">لا يوجد مخزون للشحن</td></tr>'}
      </tbody></table></div>
      <h4>أو مسح عبوات بعينها</h4><div id="sc"></div><div class="small" id="sl" style="margin-top:6px"></div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="inv" checked> إصدار فاتورة بيع إلكترونية مرتبطة بالعبوات (حصر الضرائب)</label>
      <div class="row end"><button class="btn pri" id="go">🚚 تسجيل الشحنة</button></div></div>`;
    UI.scanner(el.querySelector('#sc'), {
      label: 'امسح QR العبوة', button: 'إضافة', onCode: async code => {
        const pz = QR.parse(code); const u = Store.find('package_units', x => x.serial_number === pz.serial);
        if (!u || u.current_org_id !== me || !['produced', 'received'].includes(u.status)) return UI.toast('العبوة غير موجودة في مخزنك', 'err');
        if (!scanned.includes(u.id)) scanned.push(u.id); el.querySelector('#sl').innerHTML = `عبوات ممسوحة: <b>${scanned.length}</b>`;
      }
    });
    el.querySelector('#go').onclick = async () => {
      const to = el.querySelector('[name=to]').value; if (!to) return UI.toast('اختر الجهة المستلمة', 'err');
      const ids = [...scanned];
      el.querySelectorAll('[data-b]').forEach(i => { const n = Number(i.value) || 0; if (n > 0) byBatch[i.dataset.b].filter(u => !ids.includes(u.id)).slice(0, n).forEach(u => ids.push(u.id)); });
      if (!ids.length) return UI.toast('حدد عبوات للشحن', 'err');
      try { const r = await Domain.ship(ids, to, el.querySelector('#inv').checked); UI.toast(`تم تسجيل الشحنة ${r.shipment} (${r.count} عبوة)`, 'ok'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    };
  },

  /* ============================== المخزون ============================== */
  stock(el) {
    const me = myOrg(); const s = Settings.get(); const gov = Auth.is('admin', 'authority');
    const orgs = gov ? Store.where('organizations', o => ['pharmacy', 'distributor', 'factory'].includes(o.type)) : [Store.get('organizations', me)];
    const units = Store.where('package_units', u => orgs.some(o => o && o.id === u.current_org_id) && ['produced', 'received'].includes(u.status));
    const rows = Object.values(U.groupBy(units, u => u.current_org_id + '|' + u.batch_id)).map(arr => { const b = Store.getAny('production_batches', arr[0].batch_id); return { org: arr[0].current_org_id, b, n: arr.length, days: U.daysBetween(new Date(), b?.expiry_date) }; });
    const inv = Store.where('pharmacy_inventory', i => orgs.some(o => o && o.id === i.pharmacy_org_id));
    el.innerHTML = `${Store.get('organizations', me)?.type === 'pharmacy' || gov ? `<div class="card"><h3>أرصدة الصيدليات (PharmacyInventory)</h3><p class="small muted">تُحدّث تلقائياً مع كل حدث استلام أو صرف (Event Handler).</p><div id="t1"></div></div>` : ''}
      <div class="card" style="margin-top:16px"><h3>المخزون حسب الدفعة وتاريخ الانتهاء</h3><div id="t2"></div></div>`;
    if (el.querySelector('#t1')) UI.table(el.querySelector('#t1'), {
      rows: inv.sort((a, b) => a.quantity_on_hand - b.quantity_on_hand), exportName: 'pharmacy-inventory', cols: [
        ...(gov ? [C('الصيدلية', i => U.esc(Domain.orgName(i.pharmacy_org_id)))] : []), C('الصنف', i => `<b>${U.esc(Domain.drugName(i.drug_id))}</b>`),
        C('الرصيد', i => U.fmtNum(i.quantity_on_hand), i => i.quantity_on_hand, 'num'), C('الحالة', i => i.quantity_on_hand === 0 ? UI.badge('نفد', 'bad') : i.quantity_on_hand <= s.low_stock_threshold ? UI.badge('منخفض', 'warn') : UI.badge('متوفر', 'ok')), C('آخر تحديث', i => U.fmtDT(i.last_updated))]
    });
    UI.table(el.querySelector('#t2'), {
      rows: rows.sort((a, b) => a.days - b.days), exportName: 'stock-by-batch', cols: [
        ...(gov ? [C('الجهة', r => U.esc(Domain.orgName(r.org)))] : []), C('الصنف', r => U.esc(Domain.drugName(r.b?.drug_id))), C('الدفعة', r => `<span class="mono">${U.esc(r.b?.batch_number)}</span>`),
        C('تاريخ الانتهاء', r => U.fmtDate(r.b?.expiry_date)), C('المتبقي', r => r.days < 0 ? UI.badge('منتهي', 'bad') : r.days <= s.expiry_warning_days ? UI.badge(r.days + ' يوم', 'warn') : r.days + ' يوم', r => r.days), C('العبوات', r => r.n, null, 'num')]
    });
  },

  /* ============================== الأصناف ============================== */
  drugs(el) {
    const me = myOrg(); const isF = Auth.is('factory');
    const rows = Store.where('drugs', d => !isF || d.manufacturer_id === me);
    el.innerHTML = `<div class="card"><div class="card-head"><h3>سجل الأصناف الدوائية</h3>${Auth.is('factory', 'admin', 'authority') ? '<button class="btn pri" id="add">+ صنف جديد</button>' : ''}</div><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, exportName: 'drugs', cols: [C('الاسم', d => `<b>${U.esc(d.name)}</b>`), C('المادة الفعالة', d => U.esc(d.active_ingredient)), C('الشكل', d => U.esc(d.dosage_form)),
      C('المصنع', d => U.esc(Domain.orgName(d.manufacturer_id))), C('GTIN', d => `<span class="mono">${U.esc(d.gtin)}</span>`), C('السعر', d => U.fmtMoney(d.price), d => d.price, 'num'),
      C('عبوات', d => U.fmtNum(Store.where('package_units', u => Store.getAny('production_batches', u.batch_id)?.drug_id === d.id).length), null, 'num')]
    });
    el.querySelector('#add')?.addEventListener('click', () => UI.form('صنف دوائي جديد', [
      { name: 'name', label: 'الاسم التجاري والتركيز', required: true }, { name: 'active_ingredient', label: 'المادة الفعالة (بالإنجليزية)', required: true, hint: 'تُستخدم لفحص التعارضات' },
      { name: 'dosage_form', label: 'الشكل الصيدلي', type: 'select', options: DOSAGE_FORMS, required: true }, { name: 'price', label: 'سعر الجمهور (ج.م)', type: 'number', required: true, min: 0 },
      ...(isF ? [] : [{ name: 'manufacturer_id', label: 'المصنع', type: 'select', options: orgOptions(['factory']), required: true }]), { name: 'registration_no', label: 'رقم التسجيل بهيئة الدواء' }
    ], {}, async v => { await Store.insert('drugs', { ...v, price: Number(v.price), active_ingredient: v.active_ingredient.toLowerCase(), manufacturer_id: isF ? me : v.manufacturer_id, gtin: Domain.gtin() }); UI.toast('تم تسجيل الصنف برقم GTIN جديد', 'ok'); App.render(); }));
  },

  /* ============================== الدفعات و QR (UC-05 / FR-07) ============================== */
  batches(el) {
    const me = myOrg(); const isF = Auth.is('factory');
    const rows = Store.where('production_batches', b => !isF || b.factory_org_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at));
    el.innerHTML = `<div class="card"><div class="card-head"><h3>دفعات الإنتاج</h3>${isF ? '<button class="btn pri" id="add">+ دفعة جديدة وتوليد QR</button>' : ''}</div><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, exportName: 'batches', onRow: b => Views._batchModal(b), cols: [C('رقم الدفعة', b => `<b class="mono">${U.esc(b.batch_number)}</b>`), C('الصنف', b => U.esc(Domain.drugName(b.drug_id))), C('المصنع', b => U.esc(Domain.orgName(b.factory_org_id))),
      C('الإنتاج', b => U.fmtDate(b.manufacture_date)), C('الانتهاء', b => { const d = U.daysBetween(new Date(), b.expiry_date); return `${U.fmtDate(b.expiry_date)} ${d < 0 ? UI.badge('منتهية', 'bad') : d < 90 ? UI.badge(d + ' يوم', 'warn') : ''}`; }),
      C('الكمية', b => U.fmtNum(b.quantity_produced), null, 'num'), C('الحالة', b => b.recalled_at ? UI.badge('مسحوبة', 'bad') : UI.badge('متداولة', 'ok'))]
    });
    el.querySelector('#add')?.addEventListener('click', () => {
      const drugs = drugOptions(d => d.manufacturer_id === me);
      if (!drugs.length) return UI.toast('سجّل صنفاً أولاً من شاشة الأصناف', 'err');
      UI.form('دفعة إنتاج جديدة', [
        { name: 'drug_id', label: 'الصنف', type: 'select', options: drugs, required: true, full: true, value: drugs[0][0] }, { name: 'batch_number', label: 'رقم الدفعة (فريد)', required: true, value: 'NIL-' + new Date().getFullYear() + '-' + U.rand(200, 999) },
        { name: 'quantity_produced', label: 'عدد العبوات', type: 'number', required: true, min: 1, max: 500, value: 20 },
        { name: 'manufacture_date', label: 'تاريخ الإنتاج', type: 'date', required: true, value: U.dayKey(new Date()) }, { name: 'expiry_date', label: 'تاريخ الانتهاء', type: 'date', required: true, value: U.dayKey(U.addDays(new Date(), 730)) }
      ], {}, async v => {
        const t = UI.$('#modal-root .modal footer'); const old = t.innerHTML; const kids = [...t.children]; t.innerHTML = '<div class="progress grow"><i style="width:0"></i></div>';
        let b; try { b = await Domain.createBatch(v, (i, n) => { const bar = UI.$('#modal-root .progress i'); if (bar) bar.style.width = (i / n * 100) + '%'; }); } catch (e) { t.innerHTML = ''; kids.forEach(k => t.appendChild(k)); throw e; }
        UI.toast(`تم إنتاج الدفعة وتوليد ${b.quantity_produced} رمز QR موقع رقمياً`, 'ok'); App.render(); setTimeout(() => Views._batchModal(b), 80);
      }, { intro: '<p class="small muted">يتم توليد رقم تسلسلي فريد من 14 رقماً ورمز QR موقع رقمياً (HMAC) لكل عبوة وفق عناصر GS1: GTIN، الرقم التسلسلي، رقم الدفعة، تاريخ الانتهاء.</p>' });
    });
  },
  _batchModal(b) {
    const units = Store.where('package_units', u => u.batch_id === b.id);
    const st = U.groupBy(units, 'status');
    UI.modal({
      title: `الدفعة ${b.batch_number}`, wide: true, body: `<div class="facts"><div><span>الصنف</span><b>${U.esc(Domain.drugName(b.drug_id))}</b></div><div><span>المصنع</span>${U.esc(Domain.orgName(b.factory_org_id))}</div><div><span>الإنتاج</span>${U.fmtDate(b.manufacture_date)}</div><div><span>الانتهاء</span>${U.fmtDate(b.expiry_date)}</div><div><span>GTIN</span><span class="mono">${U.esc(Domain.drug(b.drug_id)?.gtin)}</span></div></div>
      <div class="row" style="margin:12px 0">${Object.entries(st).map(([k, v]) => UI.unitBadge(k).replace('</span>', ` ${v.length}</span>`)).join(' ')}</div>
      ${b.recalled_at ? `<div class="callout bad">مسحوبة بتاريخ ${U.fmtDate(b.recalled_at)}: ${U.esc(b.recall_reason)}</div>` : ''}
      <div class="tabs"><button class="on" data-t="qr">ملصقات QR</button><button data-t="list">العبوات</button></div><div id="bt"></div>`,
      onMount: m => {
        const draw = t => {
          m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === t));
          if (t === 'qr') m.querySelector('#bt').innerHTML = `<div class="qr-grid">${units.slice(0, 60).map(u => `<div class="qr-cell">${QR.svg(u.qr_code_signed, 140)}<div class="mono">${u.serial_number}</div><div style="font-size:10px">${U.esc(Domain.drugName(b.drug_id))}<br>Lot ${U.esc(b.batch_number)} · EXP ${b.expiry_date}</div></div>`).join('')}</div>${units.length > 60 ? `<p class="small muted">يُعرض أول 60 — صدّر الملف لكل الملصقات</p>` : ''}`;
          else { m.querySelector('#bt').innerHTML = '<div id="ut"></div>'; UI.table(m.querySelector('#ut'), { rows: units, pageSize: 10, onRow: u => Views._unitModal(u), cols: [C('الرقم التسلسلي', u => `<span class="mono">${u.serial_number}</span>`), C('الحالة', u => UI.unitBadge(u.status), u => UNIT_STATUS[u.status]), C('الموقع الحالي', u => U.esc(Domain.orgName(u.current_org_id))), C('مُتتبعة بالكامل', u => Domain.fullyTraced(u.id) ? '✔' : '')] }); }
        };
        m.querySelectorAll('[data-t]').forEach(x => x.onclick = () => draw(x.dataset.t)); draw('qr');
      },
      actions: [
        { label: '⬇ ملف ملصقات للطباعة (HTML)', onClick: () => { Views._labelsFile(b, units); return false; } },
        { label: '⬇ تصدير الأكواد CSV', onClick: () => { UI.download(`qr-${b.batch_number}.csv`, U.csv(units, [{ label: 'serial', key: 'serial_number' }, { label: 'qr_payload', key: 'qr_code_signed' }, { label: 'status', key: 'status' }])); return false; } },
        ...(Auth.is('authority', 'admin') && !b.recalled_at ? [{ label: 'سحب الدفعة من السوق', kind: 'danger', onClick: async () => { const r = await UI.ask('سحب دفعة', 'سبب قرار السحب', { multiline: true }); if (!r) return false; const n = await Domain.recallBatch(b.id, r); UI.toast(`تم سحب ${n} عبوة وإخطار الجهات`, 'ok'); App.render(); return true; } }] : []),
        { label: 'إغلاق' }]
    });
  },
  _labelsFile(b, units) {
    const d = Domain.drug(b.drug_id);
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملصقات ${U.esc(b.batch_number)}</title><style>body{font-family:Arial,sans-serif;margin:10mm}.g{display:grid;grid-template-columns:repeat(5,1fr);gap:4mm}.c{border:1px dashed #999;padding:2mm;text-align:center;font-size:8pt;page-break-inside:avoid}.c svg{width:30mm;height:30mm}.m{font-family:monospace;direction:ltr}</style></head><body><h3>${U.esc(d?.name)} — Lot ${U.esc(b.batch_number)} — EXP ${b.expiry_date} — ${units.length} عبوة</h3><div class="g">${units.map(u => `<div class="c">${QR.svg(u.qr_code_signed, 120)}<div class="m">${u.serial_number}</div><div>(01)${d?.gtin} (10)${U.esc(b.batch_number)}</div></div>`).join('')}</div></body></html>`;
    UI.download(`labels-${b.batch_number}.html`, html);
  },
  _unitModal(u) {
    const info = Domain.unitInfo(u);
    UI.modal({ title: `العبوة ${u.serial_number}`, wide: true, body: `<div class="row" style="align-items:flex-start"><div style="width:150px">${QR.svg(u.qr_code_signed, 150)}</div><div class="grow"><div class="facts"><div><span>الصنف</span><b>${U.esc(info.drug?.name)}</b></div><div><span>الدفعة</span>${U.esc(info.batch?.batch_number)}</div><div><span>الحالة</span>${UI.unitBadge(u.status)}</div><div><span>الموقع</span>${U.esc(Domain.orgName(u.current_org_id))}</div></div><div class="mono small" style="margin-top:8px;word-break:break-all">${U.esc(u.qr_code_signed)}</div></div></div><h4>الأثر الكامل</h4>${UI.traceView(info)}`, actions: [{ label: 'إغلاق' }] });
  },

  /* ============================== تتبع عبوة ============================== */
  trace(el) {
    el.innerHTML = `<div class="card"><h3>تتبع عبوة — الأثر الكامل (Batch ← Package ← سلسلة الأحداث)</h3><div id="sc"></div>
      <div class="row" style="margin-top:10px"><input class="i" id="bn" placeholder="أو ابحث برقم الدفعة" style="max-width:300px"><button class="btn" id="bs">بحث</button></div></div><div id="res" style="margin-top:16px"></div>`;
    UI.scanner(el.querySelector('#sc'), {
      label: 'امسح QR أو أدخل الرقم التسلسلي', button: 'تتبع', onCode: async code => {
        const res = await Domain.verifyPackage(code, { mode: 'verify', record: false });
        el.querySelector('#res').innerHTML = `<div class="card">${UI.verifyCard(res)}${res.info ? `<h3 style="margin-top:14px">مسار العبوة</h3>${UI.traceView(res.info)}` : ''}</div>`;
      }
    });
    el.querySelector('#bs').onclick = () => { const b = Store.find('production_batches', x => x.batch_number.toLowerCase() === el.querySelector('#bn').value.trim().toLowerCase()); if (!b) return UI.toast('رقم دفعة غير موجود', 'err'); Views._batchModal(b); };
  },

  /* ============================== إنذارات الغش (FR-10 / UC-09) ============================== */
  alerts(el) {
    const rows = Store.where('counterfeit_alerts', a => Auth.is('pharmacist') ? a.reporter_org_id === myOrg() : true).sort((a, b) => b.detected_at.localeCompare(a.detected_at));
    el.innerHTML = `<div class="grid g4">${UI.kpi('إجمالي الإنذارات', U.fmtNum(rows.length))}${UI.kpi('مفتوحة', `<span style="color:var(--bad)">${rows.filter(a => a.status === 'open').length}</span>`)}${UI.kpi('قيد التحقيق', rows.filter(a => a.status === 'investigating').length)}${UI.kpi('مغلقة', rows.filter(a => a.status === 'closed').length)}</div>
      <div class="card" style="margin-top:16px"><div id="t"></div></div>`;
    Views._alertTable(el.querySelector('#t'), rows, true);
  },
  _alertTable(el, rows, full) {
    UI.table(el, {
      rows, search: full, exportName: full ? 'counterfeit-alerts' : null, onRow: a => Views._alertModal(a), empty: 'لا توجد إنذارات', cols: [
        C('التوقيت', a => U.fmtDT(a.detected_at)), C('النوع', a => UI.badge(ALERT_TYPES[a.alert_type] || a.alert_type, 'bad'), a => ALERT_TYPES[a.alert_type]),
        C('العبوة', a => { const u = a.package_unit_id && Store.getAny('package_units', a.package_unit_id); return u ? `<span class="mono">${u.serial_number}</span>` : `<span class="muted small">${U.esc(a.details?.serial || 'غير مسجلة')}</span>`; }),
        C('الصنف', a => { const u = a.package_unit_id && Store.getAny('package_units', a.package_unit_id); return U.esc(u ? Domain.drugName(Store.getAny('production_batches', u.batch_id)?.drug_id) : '—'); }),
        C('الموقع', a => U.esc(a.details?.where || a.geo || '—')), C('الحالة', a => UI.alertBadge(a.status), a => ALERT_STATUS[a.status])]
    });
  },
  _alertModal(a) {
    const u = a.package_unit_id && Store.getAny('package_units', a.package_unit_id);
    const canAct = Auth.is('authority', 'admin');
    UI.modal({
      title: 'تفاصيل الإنذار', wide: true, body: `<div class="callout bad"><b>${U.esc(ALERT_TYPES[a.alert_type])}</b> — ${U.fmtDT(a.detected_at)}</div>
      <div class="facts" style="margin-top:12px"><div><span>الحالة</span>${UI.alertBadge(a.status)}</div><div><span>الموقع</span>${U.esc(a.details?.where || a.geo || '—')}</div><div><span>الجهة المبلِّغة</span>${U.esc(a.reporter_org_id ? Domain.orgName(a.reporter_org_id) : 'آلي / مستخدم عام')}</div>${a.details?.previous ? `<div><span>صرف سابق من</span>${U.esc(a.details.previous)}</div>` : ''}${a.details?.expected ? `<div><span>الموقع المتوقع</span>${U.esc(a.details.expected)}</div>` : ''}</div>
      ${a.details?.raw ? `<div class="mono small" style="margin-top:8px;word-break:break-all">الرمز الممسوح: ${U.esc(a.details.raw)}</div>` : ''}
      ${a.resolution ? `<div class="callout ok" style="margin-top:10px">القرار: ${U.esc(a.resolution)}</div>` : ''}
      ${u ? `<h4>مسار العبوة</h4>${UI.traceView(Domain.unitInfo(u))}` : ''}`,
      actions: [...(canAct && a.status === 'open' ? [{ label: 'بدء التحقيق', onClick: async () => { await Store.update('counterfeit_alerts', a.id, { status: 'investigating', assignee: Auth.user.id }); Audit.log('alert_investigate', 'counterfeit_alerts', a.id); App.render(); return true; } }] : []),
      ...(canAct && a.status !== 'closed' ? [{ label: 'إغلاق الإنذار', kind: 'pri', onClick: async () => { const r = await UI.ask('إغلاق الإنذار', 'نتيجة التحقيق والإجراء المتخذ', { multiline: true }); if (!r) return false; await Store.update('counterfeit_alerts', a.id, { status: 'closed', resolution: r, closed_at: U.now(), closed_by: Auth.user.id }); Audit.log('alert_close', 'counterfeit_alerts', a.id, null, null, { resolution: r }); App.render(); return true; } }] : []), { label: 'إغلاق' }]
    });
  },

  /* ============================== الفواتير ============================== */
  invoices(el) {
    const me = myOrg(); const gov = Auth.is('admin', 'authority');
    const rows = Store.where('invoices', i => gov || i.seller_org_id === me || i.buyer_org_id === me).sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    const sales = rows.filter(i => gov || i.seller_org_id === me);
    el.innerHTML = `<div class="grid g4">${UI.kpi('عدد الفواتير', U.fmtNum(rows.length))}${UI.kpi(gov ? 'إجمالي المبيعات المسجلة' : 'مبيعاتي', U.fmtMoney(U.sum(sales, 'amount')))}${UI.kpi('ضريبة القيمة المضافة المستحقة', U.fmtMoney(U.sum(sales, 'tax_amount')), `بنسبة ${Settings.get().tax_rate * 100}%`)}${UI.kpi('فواتير التجزئة / B2B', `${sales.filter(i => i.kind === 'retail').length} / ${sales.filter(i => i.kind === 'b2b').length}`)}</div>
      <div class="card" style="margin-top:16px"><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, exportName: 'invoices', cols: [C('رقم الفاتورة', i => `<span class="mono">${U.esc(i.invoice_no)}</span>`), C('التاريخ', i => U.fmtDT(i.issued_at)), C('البائع', i => U.esc(Domain.orgName(i.seller_org_id))),
      C('المشتري', i => U.esc(i.buyer_org_id ? Domain.orgName(i.buyer_org_id) : 'مريض: ' + (Domain.patientUser(i.buyer_patient_id)?.full_name || ''))), C('النوع', i => i.kind === 'b2b' ? UI.badge('B2B', 'info') : UI.badge('تجزئة', 'brand')),
      C('العبوات', i => (i.package_unit_ids || []).length || 1, null, 'num'), C('المبلغ', i => U.fmtMoney(i.amount), i => i.amount, 'num'), C('الضريبة', i => U.fmtMoney(i.tax_amount), i => i.tax_amount, 'num')]
    });
  },

  /* ============================== الإدارة ============================== */
  orgs(el) {
    const rows = Store.all('organizations');
    el.innerHTML = `<div class="card"><div class="card-head"><h3>الجهات المؤسسية</h3><button class="btn pri" id="add">+ جهة</button></div><div id="t"></div></div>`;
    const f = o => UI.form(o ? 'تعديل جهة' : 'جهة جديدة', [
      { name: 'name', label: 'الاسم', required: true, full: true }, { name: 'type', label: 'النوع', type: 'select', options: Object.entries(ORG_TYPES), required: true },
      { name: 'governorate', label: 'المحافظة', type: 'select', options: GOVS, required: true }, { name: 'license_no', label: 'رقم الترخيص', required: true }, { name: 'pilot', label: 'ضمن نطاق المرحلة التجريبية', type: 'checkbox' }
    ], o || {}, async v => { v.geo_location = v.governorate; if (o) await Store.update('organizations', o.id, v); else await Store.insert('organizations', v); App.render(); });
    UI.table(el.querySelector('#t'), {
      rows, exportName: 'organizations', onRow: f, cols: [C('الاسم', o => `<b>${U.esc(o.name)}</b>`), C('النوع', o => U.esc(ORG_TYPES[o.type])), C('المحافظة', o => U.esc(o.governorate)), C('الترخيص', o => `<span class="mono">${U.esc(o.license_no)}</span>`),
      C('مستخدمون', o => Store.where('users', u => u.organization_id === o.id).length, null, 'num'), C('تجريبي', o => o.pilot ? UI.badge('نعم', 'brand') : '')]
    });
    el.querySelector('#add').onclick = () => f(null);
  },
  users(el) {
    const rows = Store.all('users');
    el.innerHTML = `<div class="card"><div class="card-head"><h3>المستخدمون</h3><button class="btn pri" id="add">+ مستخدم</button></div><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, exportName: 'users', onRow: u => Views._userModal(u), cols: [C('الاسم', u => `<b>${U.esc(u.full_name)}</b>`), C('الرقم القومي', u => `<span class="mono">${U.esc(u.national_id)}</span>`), C('الدور', u => `${ROLES[u.role]?.icon || ''} ${U.esc(ROLES[u.role]?.label)}`),
      C('الجهة', u => U.esc(u.organization_id ? Domain.orgName(u.organization_id) : '—')), C('الحالة', u => u.active === false ? UI.badge('موقوف', 'bad') : UI.badge('نشط', 'ok'))]
    });
    el.querySelector('#add').onclick = () => UI.form('مستخدم جديد', [
      { name: 'national_id', label: 'الرقم القومي (14 رقم)', required: true, inputmode: 'numeric' }, { name: 'full_name', label: 'الاسم', required: true },
      { name: 'role', label: 'الدور', type: 'select', options: Object.entries(ROLES).map(([k, v]) => [k, v.label]), required: true }, { name: 'organization_id', label: 'الجهة (للموظفين)', type: 'select', options: orgOptions() },
      { name: 'phone', label: 'الموبايل' }, { name: 'email', label: 'البريد', type: 'email' }, { name: 'password', label: 'كلمة مرور مؤقتة', required: true, value: '123456' }
    ], {}, async v => {
      if (v.role !== 'patient' && !v.organization_id) throw new Error('اختر الجهة');
      const org = Store.get('organizations', v.organization_id);
      if (org && ROLE_ORG[v.role]?.length && !ROLE_ORG[v.role].includes(org.type)) throw new Error(`الدور "${ROLES[v.role].label}" لا يتوافق مع نوع الجهة "${ORG_TYPES[org.type]}"`);
      const pw = v.password; delete v.password; await Domain.createUser({ ...v, organization_id: v.role === 'patient' ? null : v.organization_id }, pw); UI.toast('تم إنشاء المستخدم وصلاحياته الافتراضية', 'ok'); App.render();
    });
  },
  _userModal(u) {
    UI.modal({
      title: u.full_name, body: `<div class="facts"><div><span>الدور</span>${U.esc(ROLES[u.role]?.label)}</div><div><span>الجهة</span>${U.esc(Domain.orgName(u.organization_id))}</div><div><span>الإنشاء</span>${U.fmtDate(u.created_at)}</div></div>`,
      actions: [{ label: u.active === false ? 'تفعيل' : 'إيقاف الحساب', kind: u.active === false ? '' : 'danger', onClick: async () => { await Store.update('users', u.id, { active: u.active === false }); App.render(); } },
      { label: 'إعادة تعيين كلمة المرور', onClick: async () => { const pw = await UI.ask('كلمة مرور جديدة', 'كلمة المرور'); if (!pw) return false; await Store.update('users', u.id, { password_hash: await Crypto.hashPassword(pw, u.salt) }, { action: 'password_reset' }); UI.toast('تم', 'ok'); } },
      { label: 'الصلاحيات', onClick: () => { App.params = { user: u.id }; setTimeout(() => go('permissions', { user: u.id }), 10); } }, { label: 'إغلاق' }]
    });
  },
  permissions(el, params) {
    const rows = Store.all('permissions').filter(p => !params.user || p.user_id === params.user);
    el.innerHTML = `<div class="card"><div class="card-head"><h3>الصلاحيات (RBAC / ABAC)</h3>${params.user ? `<span class="badge brand">${U.esc(Domain.userName(params.user))} <a href="#permissions">✕</a></span>` : ''}<button class="btn pri" id="add">+ منح صلاحية</button></div>
      <p class="small muted">كل صلاحية مقيّدة بالمستخدم + الجهة + نوع البيانات (فهرس مركب: user_id, organization_id, resource_type). لا وصول كامل افتراضي لأي جهة (FR-02).</p><div id="t"></div></div>
      <div class="card" style="margin-top:16px"><h3>مصفوفة الصلاحيات الافتراضية حسب الدور</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>الدور</th>${Object.values(RESOURCES).map(r => `<th>${r}</th>`).join('')}</tr></thead><tbody>${Object.entries(Auth.defaults).map(([role, d]) => `<tr><td><b>${ROLES[role].label}</b></td>${Object.keys(RESOURCES).map(r => `<td class="small">${d['*'] ? 'كامل' : d[r] ? ACCESS_LEVELS[d[r]] : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted">الاطلاع على السجل الطبي يتطلب أيضاً موافقة المريض (ConsentGrant) — حتى مدير المنصة لا يطّلع على البيانات السريرية.</p></div>`;
    UI.table(el.querySelector('#t'), {
      rows, exportName: 'permissions', cols: [C('المستخدم', p => U.esc(Domain.userName(p.user_id))), C('الجهة', p => U.esc(Domain.orgName(p.organization_id))), C('نوع البيانات', p => U.esc(RESOURCES[p.resource_type] || p.resource_type)),
      C('المستوى', p => U.esc(ACCESS_LEVELS[p.access_level])), C('المنح', p => U.fmtDate(p.granted_at)), C('الحالة', p => p.revoked_at ? UI.badge('مسحوبة', 'bad') : UI.badge('سارية', 'ok')),
      C('', p => p.revoked_at ? '' : `<button class="btn sm danger" data-rv="${p.id}">سحب</button>`, () => '')]
    });
    el.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => { await Store.update('permissions', b.dataset.rv, { revoked_at: U.now() }, { action: 'revoke' }); App.render(); });
    el.querySelector('#add').onclick = () => UI.form('منح صلاحية', [
      { name: 'user_id', label: 'المستخدم', type: 'select', options: Store.where('users', u => u.role !== 'patient').map(u => [u.id, u.full_name]), required: true, value: params.user },
      { name: 'resource_type', label: 'نوع البيانات', type: 'select', options: Object.entries(RESOURCES), required: true }, { name: 'access_level', label: 'المستوى', type: 'select', options: Object.entries(ACCESS_LEVELS), required: true }
    ], {}, async v => { const u = Store.get('users', v.user_id); await Store.insert('permissions', { ...v, organization_id: u.organization_id, granted_at: U.now(), revoked_at: null }); App.render(); });
  },
  audit(el) {
    const rows = Store.all('audit_logs').sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    el.innerHTML = `<div class="card"><h3>سجل التدقيق (AuditLog — Append-only)</h3><p class="small muted">كل عملية اطلاع أو تعديل على بيانات حساسة. لا يمكن تعديله أو حذفه، ويُؤرشف دورياً.</p><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, pageSize: 20, exportName: 'audit-log', onRow: a => UI.modal({ title: 'سجل تدقيق', wide: true, body: `<pre class="mono" style="white-space:pre-wrap;direction:ltr;text-align:left">${U.esc(JSON.stringify(a, null, 2))}</pre>`, actions: [{ label: 'إغلاق' }] }),
      cols: [C('التوقيت', a => U.fmtDT(a.timestamp)), C('المستخدم', a => U.esc(a.actor_user_id ? Domain.userName(a.actor_user_id) : 'النظام')), C('الجهة', a => U.esc(a.actor_org_id ? Domain.orgName(a.actor_org_id) : '')),
      C('العملية', a => UI.badge(a.action, a.action.includes('emergency') || a.action.includes('denied') || a.action.includes('failed') ? 'bad' : a.action === 'view' ? 'info' : ''), a => a.action), C('المورد', a => U.esc(a.resource_type)),
      C('التغييرات', a => a.changes ? `<span class="small">${U.esc(Object.keys(a.changes).join('، '))}</span>` : '', a => a.changes ? Object.keys(a.changes).join(' ') : '')]
    });
  },
  interactions(el) {
    const rows = Store.all('drug_interactions');
    el.innerHTML = `<div class="card"><div class="card-head"><h3>قواعد التعارض الدوائي (دعم القرار السريري)</h3><button class="btn pri" id="add">+ قاعدة</button></div><p class="small muted">تُطبق عند إصدار الروشتة (FR-06). مخرجاتها استشارية فقط ولا تحل محل القرار السريري (BR-04).</p><div id="t"></div></div>`;
    UI.table(el.querySelector('#t'), {
      rows, cols: [C('المادة الفعالة', r => `<span class="mono">${U.esc(r.ingredient_a)}</span>`), C('مع دواء', r => r.ingredient_b ? `<span class="mono">${U.esc(r.ingredient_b)}</span>` : '—'), C('مع حالة مرضية', r => U.esc(r.condition_keyword || '—')),
      C('الخطورة', r => UI.sevBadge(r.severity), r => r.severity), C('الرسالة', r => U.esc(r.message)), C('', r => `<button class="btn sm danger" data-d="${r.id}">حذف</button>`, () => '')]
    });
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { await Store.softDelete('drug_interactions', b.dataset.d); App.render(); });
    el.querySelector('#add').onclick = () => UI.form('قاعدة تعارض', [
      { name: 'ingredient_a', label: 'المادة الفعالة', required: true }, { name: 'ingredient_b', label: 'تتعارض مع مادة (اختياري)' }, { name: 'condition_keyword', label: 'أو مع حالة مرضية (كلمة مفتاحية)' },
      { name: 'severity', label: 'الخطورة', type: 'select', options: [['high', 'عالية'], ['moderate', 'متوسطة']], required: true }, { name: 'message', label: 'رسالة التنبيه', full: true, required: true }
    ], {}, async v => { if (!v.ingredient_b && !v.condition_keyword) throw new Error('حدد دواءً أو حالة مرضية'); await Store.insert('drug_interactions', { ...v, ingredient_a: v.ingredient_a.toLowerCase(), ingredient_b: v.ingredient_b.toLowerCase() || null, condition_keyword: v.condition_keyword || null }); App.render(); });
  },
  settings(el) {
    const s = Settings.get();
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>الإعدادات العامة</h3>${UI.fields([
      { name: 'mfa_enabled', label: 'تفعيل المصادقة متعددة العوامل (MFA) لأدوار الإدارة والرقابة', type: 'checkbox', full: true },
      { name: 'expiry_warning_days', label: 'تنبيه انتهاء الصلاحية قبل (يوم)', type: 'number', min: 1 }, { name: 'low_stock_threshold', label: 'حد المخزون المنخفض (عبوة)', type: 'number', min: 0 },
      { name: 'geo_window_hours', label: 'نافذة كشف المسح من موقعين (ساعة)', type: 'number', min: 1 }, { name: 'tax_rate', label: 'نسبة ضريبة القيمة المضافة', type: 'number', min: 0, max: 1 }
    ], s)}<div class="row end" style="margin-top:10px"><button class="btn pri" id="save">حفظ</button></div></div>
      <div class="card"><h3>قاعدة البيانات والمزامنة</h3><div class="facts"><div><span>الوضع</span>${Store.mode === 'cloud' ? UI.badge('قاعدة بيانات مشتركة (متعددة المستخدمين)', 'ok') : Store.mode === 'demo' ? UI.badge('وضع العرض التجريبي (نسخة خاصة)', 'info') : UI.badge('محلي على هذا المتصفح', '')}</div><div><span>آخر مزامنة</span>${U.fmtDT(Store.lastSync)}</div><div><span>عمليات معلقة</span>${Store.pending.length}</div><div><span>إجمالي السجلات</span>${U.fmtNum(TABLES.reduce((s, t) => s + Store.all(t, true).length, 0))}</div></div>
      <div class="hr"></div><h4>نسخ احتياطي واسترجاع</h4><div class="row"><button class="btn" id="exp">⬇ تصدير نسخة احتياطية (JSON)</button><label class="btn">⬆ استرجاع من ملف<input type="file" accept=".json" hidden id="imp"></label></div>
      <p class="small muted">النسخة الاحتياطية تحتوي الحقول الحرجة مشفرة كما هي (Encrypted at rest).</p>
      ${Store.mode !== 'cloud' ? '<div class="hr"></div><button class="btn danger" id="reset">إعادة تحميل البيانات التجريبية</button>' : ''}</div></div>
      <div class="card" style="margin-top:16px"><h3>تصنيف حساسية البيانات</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>المستوى</th><th>أمثلة الحقول</th><th>الحماية المطبقة في النظام</th></tr></thead><tbody>
      <tr><td>${UI.badge('حرج Critical', 'bad')}</td><td>national_id، chronic_conditions، blood_type، نتائج التحاليل، رقم وثيقة التأمين</td><td>تشفير AES-256-GCM على مستوى الحقل + موافقة صريحة (ConsentGrant) + إخفاء جزئي للرقم القومي</td></tr>
      <tr><td>${UI.badge('حساس Sensitive', 'warn')}</td><td>بيانات الزيارة والتشخيص والروشتة</td><td>صلاحيات RBAC حسب الدور والجهة + تسجيل كل اطلاع في AuditLog</td></tr>
      <tr><td>${UI.badge('تشغيلي Operational', 'info')}</td><td>دفعات الإنتاج، أحداث سلسلة التوريد</td><td>توقيع رقمي HMAC-SHA256 لكل رمز QR + جداول Append-only لمنع التلاعب</td></tr></tbody></table></div></div>`;
    el.querySelector('#save').onclick = async () => { const v = UI.read(el.querySelector('.card')); await Settings.save({ mfa_enabled: v.mfa_enabled, expiry_warning_days: Number(v.expiry_warning_days), low_stock_threshold: Number(v.low_stock_threshold), geo_window_hours: Number(v.geo_window_hours), tax_rate: Number(v.tax_rate) }); UI.toast('تم الحفظ', 'ok'); };
    el.querySelector('#exp').onclick = () => { Audit.log('backup_export', 'system', 'all'); UI.download(`dawaai-backup-${U.dayKey(new Date())}.json`, Store.exportJSON()); };
    el.querySelector('#imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!(await UI.confirm('سيتم دمج/استبدال السجلات بنفس المعرفات من الملف. متابعة؟'))) return; try { const n = await Store.importJSON(await f.text()); Audit.log('backup_import', 'system', 'all', null, null, { rows: n }); UI.toast(`تم استرجاع ${n} سجل`, 'ok'); App.render(); } catch (err) { UI.toast(err.message, 'err'); } };
    el.querySelector('#reset')?.addEventListener('click', async () => { if (!(await UI.confirm('سيتم مسح كل البيانات المحلية وإعادة تحميل البيانات التجريبية.', { danger: true }))) return; for (const t of TABLES) { try { localStorage.removeItem(Store.key(t)); } catch { } } Store.init(); Auth.logout(); location.hash = ''; location.reload(); });
  },
  profile(el) {
    const u = Auth.user;
    el.innerHTML = `<div class="card" style="max-width:640px"><h3>حسابي</h3><div class="facts"><div><span>الاسم</span><b>${U.esc(u.full_name)}</b></div><div><span>الرقم القومي</span><span class="mono">${U.esc(u.national_id)}</span></div><div><span>الدور</span>${U.esc(ROLES[u.role].label)}</div><div><span>الجهة</span>${U.esc(Domain.orgName(u.organization_id))}</div></div>
      <div class="hr"></div><h4>تغيير كلمة المرور</h4>${UI.fields([{ name: 'old', label: 'الحالية', type: 'password', required: true }, { name: 'n1', label: 'الجديدة (8 أحرف على الأقل)', type: 'password', required: true }])}<div class="row end" style="margin-top:10px"><button class="btn pri" id="pw">تغيير</button></div></div>`;
    el.querySelector('#pw').onclick = async () => {
      try { const v = UI.read(el); if (v.n1.length < 8) throw new Error('كلمة المرور قصيرة'); await Auth.login(u.national_id, v.old); await Store.update('users', u.id, { password_hash: await Crypto.hashPassword(v.n1, u.salt) }, { action: 'password_change' }); UI.toast('تم تغيير كلمة المرور', 'ok'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    };
  },

  /* ============================== عن النظام ============================== */
  about(el) {
    const fr = [
      ['FR-01', 'التحقق من الهوية بالرقم القومي قبل الوصول', 'تسجيل الدخول + فتح ملف المريض بالرقم القومي (فهرس فريد)'],
      ['FR-02', 'صلاحيات مقيدة حسب نوع الجهة، لا وصول كامل افتراضي', 'الصلاحيات + الموافقات + RBAC/ABAC'],
      ['FR-03', 'المريض يراجع سجل من اطلع على ملفه ومتى', 'بوابة المريض ← من اطلع على ملفي'],
      ['FR-04', 'التاريخ المرضي الكامل في شاشة واحدة موحدة', 'السجل الطبي الموحد (زمني، الأحدث أولاً)'],
      ['FR-05', 'روشتة إلكترونية برمز QR بالأدوية وجرعاتها', 'زيارة وروشتة + نسخ Versioning'],
      ['FR-06', 'تنبيه تلقائي عند تعارض دواء مع حالة مرضية', 'محرك قواعد التعارض (استشاري)'],
      ['FR-07', 'QR فريد لكل عبوة مرتبط بالدفعة وفق GS1 وموقع رقمياً', 'دفعات الإنتاج و QR + ملصقات'],
      ['FR-08', 'تسجيل كل انتقال للعبوة بالتاريخ والموقع', 'الشحن والاستلام والصرف (SupplyChainEvent)'],
      ['FR-09', 'خصم المخزون تلقائياً فور مسح QR بنجاح', 'صرف روشتة ← PharmacyInventory'],
      ['FR-10', 'رصد محاولة مسح مكرر من مكانين وإطلاق إنذار', 'إنذارات الغش + كشف الموقع والتكرار'],
      ['FR-11', 'إشعار المريض عند صرف أي دواء باسمه', 'الإشعارات'],
      ['FR-12', 'تقرير يومي لهيئة الدواء بالاستهلاك لكل منطقة جغرافية', 'التقارير ← الاستهلاك الجغرافي']
    ];
    el.innerHTML = `<div class="card"><h3>منصة "دوائي" الوطنية — النظام الموحد لتتبع الأدوية والسجل الطبي الرقمي</h3>
      <p>نسخة تجريبية (Pilot) مبنية من وثائق: الورقة المفاهيمية، Enterprise Architecture، BRD، Database ERD. تغطي النطاقات الأربعة: الهوية والصلاحيات، السجلات السريرية، تتبع الأدوية، والخدمات المشتركة.</p></div>
      <div class="card" style="margin-top:16px"><h3>تغطية المتطلبات الوظيفية</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>المعرف</th><th>المتطلب</th><th>مكان التنفيذ</th><th>الأولوية</th></tr></thead><tbody>${fr.map(([id, r, w]) => `<tr><td><b>${id}</b></td><td>${r}</td><td class="small">${w}</td><td>${['FR-01', 'FR-07', 'FR-08', 'FR-09', 'FR-10'].includes(id) ? UI.badge('Must', 'bad') : ['FR-04', 'FR-06'].includes(id) ? UI.badge('Should', 'warn') : ['FR-11', 'FR-12'].includes(id) ? UI.badge('Could', 'info') : UI.badge('Must', 'bad')}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h3>قواعد العمل المطبقة</h3><ul class="small"><li><b>BR-01:</b> رمز الروشتة يُستخدم مرة واحدة؛ أي محاولة ثانية تُرفض وتُسجل كإنذار.</li><li><b>BR-02:</b> لا اطلاع على السجل الطبي دون موافقة سارية، إلا وصول طوارئ مُبرر ومُسجل.</li><li><b>BR-03:</b> أي فرق بين الكمية الموصوفة والمصروفة يُصنف تلقائياً للمراجعة.</li><li><b>BR-04:</b> تنبيهات التعارض استشارية؛ الطبيب يؤكد الاطلاع ويُسجل قراره.</li></ul></div>
      <div class="card"><h3>المتطلبات غير الوظيفية</h3><ul class="small"><li>زمن مسح QR والتحقق: يُقاس ويُعرض مع كل عملية (الهدف &lt; 2 ثانية).</li><li>Offline-first: نسخة محلية + طابور مزامنة تلقائي عند عودة الاتصال.</li><li>تشفير الحقول الحرجة AES-256-GCM وتوقيع QR بـ HMAC-SHA256.</li><li>واجهة عربية RTL كاملة، تكبير الخط، وضع داكن، ودعم قارئات الشاشة.</li><li>معرفات UUID، حذف منطقي فقط، جداول أحداث وتدقيق Append-only.</li></ul></div></div>
      <div class="card" style="margin-top:16px"><h3>ملاحظة للنشر الإنتاجي</h3><p class="small">هذه النسخة تعمل بالكامل داخل المتصفح مع قاعدة بيانات مشتركة. للإطلاق الرسمي على مستوى الدولة يُنقل منطق التحقق والتوقيع والتشفير إلى خوادم Microservices خلف API Gateway (مفاتيح في HSM)، مع PostgreSQL لكل نطاق، وFHIR Store للسجلات السريرية، وEvent Bus بين النطاقات — مخطط قاعدة البيانات SQL الكامل مرفق مع البرنامج.</p></div>`;
  }
};
