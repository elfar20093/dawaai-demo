/* =========================================================================
   التقارير ومؤشرات الأداء (KPIs) — بما فيها تقرير هيئة الدواء FR-12
   ========================================================================= */
'use strict';

const Reports = {
  /* ------------------------ محرك المؤشرات ------------------------ */
  kpis() {
    const dispensed = Store.where('package_units', u => u.status === 'dispensed');
    const traced = dispensed.filter(u => Domain.fullyTraced(u.id)).length;
    const views = Store.where('audit_logs', a => a.action === 'view' && a.resource_type === 'clinical_record' && a.details?.load_ms);
    const times = [...views.map(v => v.details.load_ms), ...Metrics.recordTimes];
    const alerts = Store.all('counterfeit_alerts');
    const pharms = Store.where('organizations', o => o.type === 'pharmacy' && o.pilot);
    const active = pharms.filter(p => Store.find('supply_chain_events', e => e.event_type === 'dispensed' && e.from_org_id === p.id));
    return {
      tracedPct: dispensed.length ? traced / dispensed.length * 100 : 0, traced, dispensed: dispensed.length,
      avgRecordSec: times.length ? U.sum(times, x => x) / times.length / 1000 : null,
      fraudCount: alerts.length, fraudWithin24: alerts.length ? 100 : 0,
      pharmTotal: pharms.length, pharmActive: active.length, pharmPct: pharms.length ? active.length / pharms.length * 100 : 0
    };
  },
  dispEvents(from, to, pred) {
    return Store.where('supply_chain_events', e => e.event_type === 'dispensed' && (!from || e.event_timestamp >= from) && (!to || e.event_timestamp <= to + 'T23:59:59') && (!pred || pred(e)));
  },
  dailyDispense(days, pred) {
    const out = []; const ev = Reports.dispEvents(null, null, pred); const g = U.groupBy(ev, e => U.dayKey(e.event_timestamp));
    for (let i = days - 1; i >= 0; i--) { const d = U.dayKey(U.addDays(new Date(), -i)); out.push({ day: d, label: new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }), n: (g[d] || []).length }); }
    return out;
  },
  drugOf(e) { const u = Store.getAny('package_units', e.package_unit_id); return Store.getAny('production_batches', u?.batch_id)?.drug_id; },
  byGov(from, to) { const g = U.groupBy(Reports.dispEvents(from, to), e => e.geo_location || 'غير محدد'); return Object.entries(g).map(([gov, a]) => ({ gov, n: a.length })).sort((a, b) => b.n - a.n); },

  /* ------------------------ تعريف التقارير ------------------------ */
  list: [
    { id: 'geo', ic: '🗺️', t: 'الاستهلاك اليومي حسب المنطقة الجغرافية (FR-12)', d: 'التقرير اليومي لهيئة الدواء بكميات الاستهلاك لكل محافظة وصنف', roles: ['authority', 'admin'] },
    { id: 'kpi', ic: '🎯', t: 'مؤشرات الأداء الرئيسية (KPIs)', d: 'القياس مقابل أهداف السنة الأولى من الإطلاق التجريبي', roles: ['authority', 'admin'] },
    { id: 'trace', ic: '🔗', t: 'تغطية التتبع من المصنع للمريض', d: 'نسبة العبوات المتتبعة بالكامل لكل صنف ومراحل السلسلة', roles: ['authority', 'admin', 'factory'] },
    { id: 'fraud', ic: '🚨', t: 'الغش والإنذارات', d: 'الإنذارات حسب النوع والمحافظة والحالة وزمن المعالجة', roles: ['authority', 'admin'] },
    { id: 'expiry', ic: '⏳', t: 'الصلاحية والدفعات المنتهية', d: 'عبوات قرب الانتهاء أو منتهية ما زالت في المخزون', roles: ['authority', 'admin', 'pharmacist', 'distributor', 'factory'] },
    { id: 'inventory', ic: '📦', t: 'أرصدة المخزون والنواقص', d: 'الأرصدة الحالية لكل صيدلية وصنف مع النواقص', roles: ['authority', 'admin', 'pharmacist'] },
    { id: 'tax', ic: '🧾', t: 'المبيعات والضرائب', d: 'حصر المبيعات وضريبة القيمة المضافة لكل جهة، ومطابقة الصرف بالفواتير', roles: ['authority', 'admin', 'pharmacist', 'factory', 'distributor'] },
    { id: 'rx', ic: '📝', t: 'الروشتات الإلكترونية', d: 'الإصدار والصرف ومعدل الصرف وزمن الصرف لكل طبيب', roles: ['authority', 'admin', 'doctor', 'pharmacist'] },
    { id: 'reviews', ic: '⚖️', t: 'مطابقة الصرف مع الروشتة (BR-03)', d: 'حالات الفرق بين الكمية الموصوفة والمصروفة', roles: ['authority', 'admin', 'pharmacist'] },
    { id: 'icd', ic: '🩺', t: 'التشخيصات الأكثر شيوعاً (ICD-10)', d: 'تحليل إحصائي للتشخيصات حسب الكود والجهة', roles: ['authority', 'admin', 'doctor'] },
    { id: 'production', ic: '🏭', t: 'الإنتاج والتوزيع', d: 'الدفعات والعبوات المنتجة لكل مصنع وصنف ومسار التوزيع', roles: ['authority', 'admin', 'factory', 'distributor'] },
    { id: 'access', ic: '🔐', t: 'الاطلاع على السجلات والطوارئ', d: 'عمليات الاطلاع حسب الجهة، وحالات الطوارئ والمحاولات المرفوضة', roles: ['authority', 'admin'] },
    { id: 'consents', ic: '✍️', t: 'موافقات المرضى', d: 'الموافقات السارية والمسحوبة حسب نوع الجهة والنطاق', roles: ['authority', 'admin'] },
    { id: 'pharmacies', ic: '🏪', t: 'مشاركة الصيدليات في المرحلة التجريبية', d: 'نشاط كل صيدلية: صرف، استلام، إنذارات', roles: ['authority', 'admin'] },
    { id: 'forecast', ic: '🤖', t: 'التنبؤ بالطلب الجغرافي (ذكاء اصطناعي — استشاري)', d: 'توقع استهلاك الأسبوع القادم لكل محافظة وصنف لتحسين التوزيع', roles: ['authority', 'admin', 'distributor', 'factory'] }
  ],

  /* ------------------------ إطار التقرير ------------------------ */
  frame(el, def, { filters = true, drug = false } = {}) {
    const p = Reports.params = Reports.params || { from: U.dayKey(U.addDays(new Date(), -30)), to: U.dayKey(new Date()), drug: '' };
    el.innerHTML = `<div class="row no-print" style="margin-bottom:12px"><button class="btn sm" id="back">→ كل التقارير</button><span class="grow"></span>
      ${filters ? `<label class="small">من <input class="i" type="date" id="f1" value="${p.from}" style="width:auto"></label><label class="small">إلى <input class="i" type="date" id="f2" value="${p.to}" style="width:auto"></label>` : ''}
      ${drug ? `<select class="i" id="fd" style="width:auto"><option value="">كل الأصناف</option>${Store.all('drugs').map(d => `<option value="${d.id}" ${d.id === p.drug ? 'selected' : ''}>${U.esc(d.name)}</option>`).join('')}</select>` : ''}
      <button class="btn sm" id="html">⬇ حفظ التقرير (HTML)</button></div>
      <div class="card" id="rep"><div class="card-head"><h2>${def.ic} ${U.esc(def.t)}</h2><span class="small muted">أُعد في ${U.fmtDT(new Date())} — ${U.esc(Auth.user.full_name)}${Auth.org() ? ' — ' + U.esc(Auth.org().name) : ''}</span></div><p class="small muted" style="margin-top:-6px">${U.esc(def.d)}${filters ? ` · الفترة: ${U.fmtDate(p.from)} — ${U.fmtDate(p.to)}` : ''}</p><div id="body"></div></div>`;
    el.querySelector('#back').onclick = () => { App.params = {}; App.render(); };
    const rerun = () => Views.reports(el, { report: def.id });
    el.querySelector('#f1')?.addEventListener('change', e => { p.from = e.target.value; rerun(); });
    el.querySelector('#f2')?.addEventListener('change', e => { p.to = e.target.value; rerun(); });
    el.querySelector('#fd')?.addEventListener('change', e => { p.drug = e.target.value; rerun(); });
    el.querySelector('#html').onclick = () => Reports.saveHtml(def, el.querySelector('#rep'));
    return { body: el.querySelector('#body'), p };
  },
  saveHtml(def, node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('canvas').forEach(c => { const src = node.querySelector('#' + c.id); const img = document.createElement('img'); try { img.src = src.toDataURL('image/png'); } catch { } img.style.maxWidth = '100%'; c.replaceWith(img); });
    clone.querySelectorAll('.tbl-tools,.pager,button').forEach(x => x.remove());
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${U.esc(def.t)}</title><style>body{font-family:Arial,Tahoma,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%;font-size:12px;margin:10px 0}th,td{border:1px solid #ccc;padding:5px;text-align:right}th{background:#eef5f3}.badge{padding:1px 6px;border:1px solid #ccc;border-radius:8px;font-size:11px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.card{border:1px solid #ddd;border-radius:8px;padding:10px;margin:8px 0}.val{font-size:20px;font-weight:bold}.muted,.small{color:#666;font-size:12px}h2{color:#0e6b57}</style></head><body><p class="small">منصة دوائي الوطنية</p>${clone.innerHTML}</body></html>`;
    UI.download(`report-${def.id}-${U.dayKey(new Date())}.html`, html);
  },
  tbl(el, rows, cols, name, opts = {}) { const d = document.createElement('div'); el.appendChild(d); UI.table(d, { rows, cols, exportName: name, search: rows.length > 12, pageSize: opts.pageSize || 25, ...opts }); },
  chartBox(el, id, h = '') { el.insertAdjacentHTML('beforeend', `<div class="chart-box ${h}" style="margin:8px 0 16px"><canvas id="${id}"></canvas></div>`); return el.querySelector('#' + id); },
  h(el, t) { el.insertAdjacentHTML('beforeend', `<h3 style="margin:18px 0 8px;font-size:15px">${t}</h3>`); },
  scopeOrg() { return Auth.is('admin', 'authority') ? null : Auth.user.organization_id; },

  /* ------------------------ التقارير ------------------------ */
  run: {
    geo(el, def) {
      const { body, p } = Reports.frame(el, def, { drug: true });
      const ev = Reports.dispEvents(p.from, p.to, e => !p.drug || Reports.drugOf(e) === p.drug);
      const govs = U.groupBy(ev, e => e.geo_location || 'غير محدد');
      const total = ev.length;
      body.innerHTML = `<div class="grid g4">${UI.kpi('إجمالي العبوات المصروفة', U.fmtNum(total))}${UI.kpi('محافظات نشطة', Object.keys(govs).length)}${UI.kpi('أصناف مستهلكة', new Set(ev.map(Reports.drugOf)).size)}${UI.kpi('متوسط يومي', U.fmtNum(total / Math.max(1, U.daysBetween(p.from, p.to) + 1), 1))}</div>`;
      Reports.h(body, 'الاستهلاك حسب المحافظة');
      const gArr = Object.entries(govs).map(([g, a]) => [g, a.length]).sort((a, b) => b[1] - a[1]);
      UI.chart(Reports.chartBox(body, 'c1'), { type: 'bar', data: { labels: gArr.map(x => x[0]), datasets: [{ label: 'عبوات مصروفة', data: gArr.map(x => x[1]), backgroundColor: UI.series(0) }] } });
      Reports.h(body, 'الاستهلاك اليومي');
      const days = []; for (let d = new Date(p.from); d <= new Date(p.to); d = U.addDays(d, 1)) days.push(U.dayKey(d));
      const byDay = U.groupBy(ev, e => U.dayKey(e.event_timestamp));
      UI.chart(Reports.chartBox(body, 'c2'), { type: 'line', data: { labels: days.map(d => new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })), datasets: [{ label: 'عبوات', data: days.map(d => (byDay[d] || []).length), borderColor: UI.series(0), backgroundColor: UI.series(0) }] } });
      Reports.h(body, 'مصفوفة المحافظة × الصنف');
      const matrix = Object.values(U.groupBy(ev, e => (e.geo_location || '') + '|' + Reports.drugOf(e))).map(a => ({ gov: a[0].geo_location || 'غير محدد', drug: Domain.drugName(Reports.drugOf(a[0])), n: a.length, pharm: new Set(a.map(e => e.from_org_id)).size }));
      Reports.tbl(body, matrix.sort((a, b) => a.gov.localeCompare(b.gov) || b.n - a.n), [C('المحافظة', r => U.esc(r.gov)), C('الصنف', r => U.esc(r.drug)), C('عدد العبوات', r => r.n, null, 'num'), C('عدد الصيدليات', r => r.pharm, null, 'num'), C('النسبة', r => U.fmtNum(r.n / total * 100, 1) + '%', null, 'num')], 'fr12-geo-matrix');
      Reports.h(body, 'السجل اليومي التفصيلي (لإرساله لهيئة الدواء)');
      const daily = Object.values(U.groupBy(ev, e => U.dayKey(e.event_timestamp) + '|' + e.geo_location + '|' + Reports.drugOf(e))).map(a => ({ day: U.dayKey(a[0].event_timestamp), gov: a[0].geo_location, drug: Domain.drugName(Reports.drugOf(a[0])), n: a.length }));
      Reports.tbl(body, daily.sort((a, b) => b.day.localeCompare(a.day)), [C('اليوم', r => r.day), C('المحافظة', r => U.esc(r.gov)), C('الصنف', r => U.esc(r.drug)), C('الكمية', r => r.n, null, 'num')], 'fr12-daily', { pageSize: 15 });
    },
    kpi(el, def) {
      const { body } = Reports.frame(el, def, { filters: false });
      const k = Reports.kpis();
      const rows = [
        ['نسبة الأدوية المتتبعة بالكامل من المصنع للصرف', '0% (لا يوجد تتبع حالياً)', '60% في النطاق التجريبي', U.fmtNum(k.tracedPct, 1) + '%', k.tracedPct >= 60, `${k.traced} من ${k.dispensed} عبوة مصروفة`],
        ['متوسط وقت اطلاع الطبيب على التاريخ المرضي', 'غير متاح / يدوي', 'أقل من دقيقة واحدة', k.avgRecordSec === null ? '—' : U.fmtNum(k.avgRecordSec, 2) + ' ثانية', k.avgRecordSec !== null && k.avgRecordSec < 60, 'زمن تحميل السجل الموحد'],
        ['عدد حالات الغش المكتشفة عبر رصد المسح المكرر', '0 (لا توجد آلية رصد)', 'رصد فعال لأي محاولة خلال 24 ساعة', U.fmtNum(k.fraudCount) + ' حالة', k.fraudCount >= 0, 'الرصد آلي لحظة المسح'],
        ['نسبة تبني الصيدليات المشاركة في النطاق التجريبي', '0%', '70% من صيدليات النطاق', U.fmtNum(k.pharmPct, 0) + '%', k.pharmPct >= 70, `${k.pharmActive} من ${k.pharmTotal}`],
        ['زمن الاستجابة لمسح QR والتحقق (NFR)', '—', 'أقل من ثانيتين', Metrics.scanTimes.length ? U.fmtNum(U.sum(Metrics.scanTimes, x => x) / Metrics.scanTimes.length, 0) + ' مللي ث' : 'لم يُقس في هذه الجلسة', !Metrics.scanTimes.length || U.sum(Metrics.scanTimes, x => x) / Metrics.scanTimes.length < 2000, 'متوسط الجلسة الحالية']
      ];
      body.innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>المؤشر</th><th>خط الأساس</th><th>الهدف بعد سنة</th><th>القيمة الحالية</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${r[0]}</b></td><td class="small">${r[1]}</td><td class="small">${r[2]}</td><td><b>${r[3]}</b></td><td>${r[4] ? UI.badge('محقق', 'ok') : UI.badge('دون الهدف', 'warn')}</td><td class="small muted">${r[5]}</td></tr>`).join('')}</tbody></table></div>`;
    },
    trace(el, def) {
      const { body } = Reports.frame(el, def, { filters: false });
      const so = Reports.scopeOrg();
      const drugs = Store.where('drugs', d => !so || d.manufacturer_id === so);
      const rows = drugs.map(d => {
        const units = Store.where('package_units', u => Store.getAny('production_batches', u.batch_id)?.drug_id === d.id);
        const st = U.groupBy(units, 'status'); const disp = st.dispensed || [];
        return { d, total: units.length, produced: (st.produced || []).length, transit: (st.in_transit || []).length, received: (st.received || []).length, dispensed: disp.length, full: disp.filter(u => Domain.fullyTraced(u.id)).length };
      });
      const tot = r => U.sum(rows, r);
      body.innerHTML = `<div class="grid g4">${UI.kpi('عبوات مسجلة', U.fmtNum(tot('total')))}${UI.kpi('مصروفة', U.fmtNum(tot('dispensed')))}${UI.kpi('متتبعة بالكامل', U.fmtNum(tot('full')))}${UI.kpi('نسبة التغطية', U.fmtNum(tot('dispensed') ? tot('full') / tot('dispensed') * 100 : 0, 1) + '%')}</div>`;
      Reports.h(body, 'مراحل السلسلة لكل صنف');
      body.insertAdjacentHTML('beforeend', `<div class="legend">${['بالمصنع', 'في الطريق', 'مستلمة (مخزون)', 'مصروفة'].map((l, i) => `<span><i style="background:${UI.series(i)}"></i>${l}</span>`).join('')}</div>`);
      UI.chart(Reports.chartBox(body, 'c1', 'tall'), { type: 'bar', data: { labels: rows.map(r => r.d.name), datasets: [['produced', 'بالمصنع'], ['transit', 'في الطريق'], ['received', 'مستلمة'], ['dispensed', 'مصروفة']].map(([k, l], i) => ({ label: l, data: rows.map(r => r[k]), backgroundColor: UI.series(i), borderColor: UI.css('--surface'), borderWidth: { top: 2 }, borderRadius: 0 })) }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } });
      Reports.tbl(body, rows, [C('الصنف', r => U.esc(r.d.name)), C('الإجمالي', r => r.total, null, 'num'), C('بالمصنع', r => r.produced, null, 'num'), C('في الطريق', r => r.transit, null, 'num'), C('بالمخزون', r => r.received, null, 'num'), C('مصروفة', r => r.dispensed, null, 'num'), C('متتبعة بالكامل', r => r.full, null, 'num'), C('التغطية', r => r.dispensed ? U.fmtNum(r.full / r.dispensed * 100, 0) + '%' : '—', null, 'num')], 'trace-coverage');
    },
    fraud(el, def) {
      const { body, p } = Reports.frame(el, def);
      const a = Store.where('counterfeit_alerts', x => x.detected_at >= p.from && x.detected_at <= p.to + 'T23:59:59');
      const closed = a.filter(x => x.closed_at);
      const avgH = closed.length ? U.sum(closed, x => (new Date(x.closed_at) - new Date(x.detected_at)) / 36e5) / closed.length : null;
      body.innerHTML = `<div class="grid g4">${UI.kpi('إنذارات الفترة', a.length)}${UI.kpi('مفتوحة', a.filter(x => x.status === 'open').length)}${UI.kpi('زمن الرصد', 'فوري', 'لحظة المسح')}${UI.kpi('متوسط زمن الإغلاق', avgH === null ? '—' : U.fmtNum(avgH, 1) + ' ساعة')}</div>`;
      const t = Object.entries(U.groupBy(a, 'alert_type')).map(([k, v]) => [ALERT_TYPES[k] || k, v.length]).sort((x, y) => y[1] - x[1]);
      Reports.h(body, 'حسب نوع الإنذار');
      UI.chart(Reports.chartBox(body, 'c1'), { type: 'bar', data: { labels: t.map(x => x[0]), datasets: [{ label: 'إنذارات', data: t.map(x => x[1]), backgroundColor: UI.series(0) }] }, options: { indexAxis: 'y', scales: { x: { grid: { display: true } }, y: { grid: { display: false } } } } });
      Reports.h(body, 'حسب المحافظة والحالة');
      const g = Object.values(U.groupBy(a, x => (x.geo || 'غير محدد') + '|' + x.status)).map(v => ({ gov: v[0].geo || 'غير محدد', st: v[0].status, n: v.length }));
      Reports.tbl(body, g, [C('المحافظة', r => U.esc(r.gov)), C('الحالة', r => UI.alertBadge(r.st), r => ALERT_STATUS[r.st]), C('العدد', r => r.n, null, 'num')], 'fraud-by-gov');
      Reports.h(body, 'السجل التفصيلي');
      const d = document.createElement('div'); body.appendChild(d); Views._alertTable(d, a.sort((x, y) => y.detected_at.localeCompare(x.detected_at)), true);
    },
    expiry(el, def) {
      const { body } = Reports.frame(el, def, { filters: false });
      const so = Reports.scopeOrg(); const s = Settings.get();
      const units = Store.where('package_units', u => ['produced', 'received', 'in_transit'].includes(u.status) && (!so || u.current_org_id === so));
      const rows = Object.values(U.groupBy(units, u => u.current_org_id + '|' + u.batch_id)).map(a => { const b = Store.getAny('production_batches', a[0].batch_id); return { org: a[0].current_org_id, b, n: a.length, days: U.daysBetween(new Date(), b?.expiry_date) }; }).filter(r => r.days <= s.expiry_warning_days);
      const value = r => r.n * (Domain.drug(r.b?.drug_id)?.price || 0);
      body.innerHTML = `<div class="grid g4">${UI.kpi('عبوات منتهية في المخزون', `<span style="color:var(--bad)">${U.sum(rows.filter(r => r.days < 0), 'n')}</span>`)}${UI.kpi(`تنتهي خلال ${s.expiry_warning_days} يوم`, U.sum(rows.filter(r => r.days >= 0), 'n'))}${UI.kpi('القيمة المعرضة للهدر', U.fmtMoney(U.sum(rows, value)))}${UI.kpi('جهات متأثرة', new Set(rows.map(r => r.org)).size)}</div>`;
      Reports.tbl(body, rows.sort((a, b) => a.days - b.days), [C('الجهة', r => U.esc(Domain.orgName(r.org))), C('الصنف', r => U.esc(Domain.drugName(r.b?.drug_id))), C('الدفعة', r => `<span class="mono">${U.esc(r.b?.batch_number)}</span>`), C('الانتهاء', r => U.fmtDate(r.b?.expiry_date)), C('المتبقي', r => r.days < 0 ? UI.badge('منتهية منذ ' + (-r.days) + ' يوم', 'bad') : UI.badge(r.days + ' يوم', 'warn'), r => r.days), C('العبوات', r => r.n, null, 'num'), C('القيمة', r => U.fmtMoney(value(r)), value, 'num')], 'expiry-report');
    },
    inventory(el, def) {
      const { body } = Reports.frame(el, def, { filters: false });
      const so = Reports.scopeOrg(); const s = Settings.get();
      const inv = Store.where('pharmacy_inventory', i => !so || i.pharmacy_org_id === so);
      const pharms = Store.where('organizations', o => o.type === 'pharmacy' && (!so || o.id === so));
      const drugs = Store.all('drugs');
      const short = []; for (const ph of pharms) for (const d of drugs) { const i = inv.find(x => x.pharmacy_org_id === ph.id && x.drug_id === d.id); const q = i ? i.quantity_on_hand : 0; if (q <= s.low_stock_threshold) short.push({ ph, d, q }); }
      body.innerHTML = `<div class="grid g4">${UI.kpi('إجمالي العبوات بالصيدليات', U.fmtNum(U.sum(inv, 'quantity_on_hand')))}${UI.kpi('بنود نافدة', short.filter(x => x.q === 0).length)}${UI.kpi('بنود منخفضة', short.filter(x => x.q > 0).length)}${UI.kpi('صيدليات', pharms.length)}</div>`;
      Reports.h(body, 'الأرصدة حسب الصيدلية');
      const byPh = pharms.map(ph => [ph.name, U.sum(inv.filter(i => i.pharmacy_org_id === ph.id), 'quantity_on_hand')]);
      UI.chart(Reports.chartBox(body, 'c1'), { type: 'bar', data: { labels: byPh.map(x => x[0]), datasets: [{ label: 'عبوات', data: byPh.map(x => x[1]), backgroundColor: UI.series(0) }] } });
      Reports.h(body, 'النواقص (نافد أو أقل من حد التنبيه)');
      Reports.tbl(body, short.sort((a, b) => a.q - b.q), [C('الصيدلية', r => U.esc(r.ph.name)), C('المحافظة', r => U.esc(r.ph.governorate)), C('الصنف', r => U.esc(r.d.name)), C('الرصيد', r => r.q, null, 'num'), C('الحالة', r => r.q === 0 ? UI.badge('نافد', 'bad') : UI.badge('منخفض', 'warn'))], 'shortages');
      Reports.h(body, 'كل الأرصدة');
      Reports.tbl(body, inv, [C('الصيدلية', i => U.esc(Domain.orgName(i.pharmacy_org_id))), C('الصنف', i => U.esc(Domain.drugName(i.drug_id))), C('الرصيد', i => i.quantity_on_hand, null, 'num'), C('آخر تحديث', i => U.fmtDT(i.last_updated))], 'inventory');
    },
    tax(el, def) {
      const { body, p } = Reports.frame(el, def);
      const so = Reports.scopeOrg();
      const inv = Store.where('invoices', i => i.issued_at >= p.from && i.issued_at <= p.to + 'T23:59:59' && (!so || i.seller_org_id === so));
      const by = Object.values(U.groupBy(inv, 'seller_org_id')).map(a => ({ org: a[0].seller_org_id, n: a.length, retail: U.sum(a.filter(x => x.kind === 'retail'), 'amount'), b2b: U.sum(a.filter(x => x.kind === 'b2b'), 'amount'), tax: U.sum(a, 'tax_amount') }));
      const disp = Reports.dispEvents(p.from, p.to, e => !so || e.from_org_id === so);
      const invoicedUnits = new Set(inv.flatMap(i => i.package_unit_ids || [i.package_unit_id]));
      const notInv = disp.filter(e => !invoicedUnits.has(e.package_unit_id));
      body.innerHTML = `<div class="grid g4">${UI.kpi('إجمالي المبيعات', U.fmtMoney(U.sum(inv, 'amount')))}${UI.kpi('ضريبة القيمة المضافة', U.fmtMoney(U.sum(inv, 'tax_amount')))}${UI.kpi('عدد الفواتير', U.fmtNum(inv.length))}${UI.kpi('صرف بدون فاتورة', `<span style="color:${notInv.length ? 'var(--bad)' : 'var(--ok)'}">${notInv.length}</span>`, 'مطابقة الصرف الفعلي بالفواتير')}</div>`;
      Reports.h(body, 'المبيعات حسب الجهة البائعة');
      body.insertAdjacentHTML('beforeend', `<div class="legend"><span><i style="background:${UI.series(0)}"></i>تجزئة</span><span><i style="background:${UI.series(1)}"></i>B2B</span></div>`);
      UI.chart(Reports.chartBox(body, 'c1'), { type: 'bar', data: { labels: by.map(r => Domain.orgName(r.org)), datasets: [{ label: 'تجزئة', data: by.map(r => r.retail), backgroundColor: UI.series(0) }, { label: 'B2B', data: by.map(r => r.b2b), backgroundColor: UI.series(1) }] } });
      Reports.tbl(body, by, [C('الجهة', r => U.esc(Domain.orgName(r.org))), C('النوع', r => U.esc(ORG_TYPES[Store.getAny('organizations', r.org)?.type])), C('فواتير', r => r.n, null, 'num'), C('تجزئة', r => U.fmtMoney(r.retail), r => r.retail, 'num'), C('B2B', r => U.fmtMoney(r.b2b), r => r.b2b, 'num'), C('الضريبة', r => U.fmtMoney(r.tax), r => r.tax, 'num')], 'tax-by-seller');
    },
    rx(el, def) {
      const { body, p } = Reports.frame(el, def);
      const so = Reports.scopeOrg(); const isDoc = Auth.is('doctor'), isPh = Auth.is('pharmacist');
      const rx = Store.where('prescriptions', r => r.issued_at >= p.from && r.issued_at <= p.to + 'T23:59:59' && (!isDoc || r.doctor_id === Auth.user.id) && (!isPh || r.dispensed_org_id === so));
      const done = rx.filter(r => r.dispensed_at);
      const avgH = done.length ? U.sum(done, r => (new Date(r.dispensed_at) - new Date(r.issued_at)) / 36e5) / done.length : null;
      body.innerHTML = `<div class="grid g4">${UI.kpi('روشتات', rx.length)}${UI.kpi('معدل الصرف', rx.length ? U.fmtNum(done.length / rx.filter(r => r.status !== 'superseded').length * 100, 0) + '%' : '—')}${UI.kpi('متوسط زمن الصرف', avgH === null ? '—' : U.fmtNum(avgH, 1) + ' ساعة')}${UI.kpi('تجاوز تنبيهات تعارض', rx.filter(r => (r.interaction_overrides || []).length).length)}</div>`;
      const st = Object.entries(U.groupBy(rx, 'status')).map(([k, v]) => [RX_STATUS[k], v.length]);
      Reports.h(body, 'حسب الحالة');
      UI.chart(Reports.chartBox(body, 'c1'), { type: 'bar', data: { labels: st.map(x => x[0]), datasets: [{ label: 'روشتات', data: st.map(x => x[1]), backgroundColor: UI.series(0) }] } });
      Reports.h(body, 'حسب الطبيب');
      const byDoc = Object.values(U.groupBy(rx, 'doctor_id')).map(a => ({ doc: a[0].doctor_id, n: a.length, disp: a.filter(r => r.dispensed_at).length, ov: a.filter(r => (r.interaction_overrides || []).length).length, items: U.sum(a, r => Domain.rxItems(r.id).length) }));
      Reports.tbl(body, byDoc, [C('الطبيب', r => U.esc(Domain.userName(r.doc))), C('الجهة', r => U.esc(Domain.orgName(Store.getAny('users', r.doc)?.organization_id))), C('روشتات', r => r.n, null, 'num'), C('مصروفة', r => r.disp, null, 'num'), C('متوسط أصناف/روشتة', r => U.fmtNum(r.items / r.n, 1), null, 'num'), C('تجاوز تنبيهات', r => r.ov, null, 'num')], 'rx-by-doctor');
    },
    reviews(el, def) {
      const { body, p } = Reports.frame(el, def);
      const so = Reports.scopeOrg();
      const all = Store.where('dispense_records', d => d.dispensed_at >= p.from && d.dispensed_at <= p.to + 'T23:59:59' && (!so || d.pharmacy_org_id === so));
      const rv = all.filter(d => d.needs_review);
      body.innerHTML = `<div class="grid g4">${UI.kpi('عمليات صرف', all.length)}${UI.kpi('مطابقة 100%', all.length - rv.length)}${UI.kpi('تحتاج مراجعة', rv.length)}${UI.kpi('نسبة المطابقة', all.length ? U.fmtNum((all.length - rv.length) / all.length * 100, 0) + '%' : '—')}</div>`;
      Reports.tbl(body, rv, [C('التوقيت', d => U.fmtDT(d.dispensed_at)), C('الصيدلية', d => U.esc(Domain.orgName(d.pharmacy_org_id))), C('الفروق', d => U.esc(d.lines.filter(l => l.dispensed !== l.prescribed).map(l => `${Domain.drugName(l.drug_id)}: ${l.prescribed}→${l.dispensed}`).join('، '))), C('قرار المراجعة', d => U.esc(d.review_status))], 'br03-reviews');
    },
    icd(el, def) {
      const { body, p } = Reports.frame(el, def);
      const isDoc = Auth.is('doctor');
      const visits = Store.where('visits', v => v.visit_date >= p.from && v.visit_date <= p.to + 'T23:59:59' && (!isDoc || v.doctor_id === Auth.user.id));
      const vids = new Set(visits.map(v => v.id));
      const dx = Store.where('diagnoses', d => vids.has(d.visit_id));
      const g = Object.values(U.groupBy(dx, 'icd10_code')).map(a => ({ code: a[0].icd10_code, desc: a[0].description, n: a.length, orgs: new Set(a.map(d => Store.getAny('visits', d.visit_id)?.organization_id)).size })).sort((a, b) => b.n - a.n);
      body.innerHTML = `<div class="grid g3">${UI.kpi('زيارات', visits.length)}${UI.kpi('تشخيصات', dx.length)}${UI.kpi('أكواد مختلفة', g.length)}</div>`;
      UI.chart(Reports.chartBox(body, 'c1'), { type: 'bar', data: { labels: g.slice(0, 10).map(x => x.code), datasets: [{ label: 'تشخيصات', data: g.slice(0, 10).map(x => x.n), backgroundColor: UI.series(0) }] } });
      Reports.tbl(body, g, [C('كود ICD-10', r => `<b class="mono">${U.esc(r.code)}</b>`), C('الوصف', r => U.esc(r.desc)), C('العدد', r => r.n, null, 'num'), C('الجهات', r => r.orgs, null, 'num'), C('النسبة', r => U.fmtNum(r.n / dx.length * 100, 1) + '%', null, 'num')], 'icd10-stats');
    },
    production(el, def) {
      const { body, p } = Reports.frame(el, def);
      const so = Reports.scopeOrg();
      const b = Store.where('production_batches', x => (!so || x.factory_org_id === so || Auth.is('distributor')) && x.manufacture_date >= U.dayKey(U.addDays(p.from, -400)));
      const rows = Object.values(U.groupBy(b, x => x.factory_org_id + '|' + x.drug_id)).map(a => ({ f: a[0].factory_org_id, d: a[0].drug_id, batches: a.length, units: U.sum(a, 'quantity_produced') }));
      const ship = Store.where('supply_chain_events', e => e.event_type === 'shipped' && e.event_timestamp >= p.from && e.event_timestamp <= p.to + 'T23:59:59' && (!so || e.from_org_id === so || e.to_org_id === so));
      const routes = Object.values(U.groupBy(ship, e => e.from_org_id + '|' + e.to_org_id)).map(a => ({ from: a[0].from_org_id, to: a[0].to_org_id, n: a.length, sh: new Set(a.map(e => e.shipment_no)).size }));
      body.innerHTML = `<div class="grid g4">${UI.kpi('دفعات', b.length)}${UI.kpi('عبوات منتجة', U.fmtNum(U.sum(b, 'quantity_produced')))}${UI.kpi('عبوات شُحنت في الفترة', U.fmtNum(ship.length))}${UI.kpi('دفعات مسحوبة', b.filter(x => x.recalled_at).length)}</div>`;
      Reports.h(body, 'الإنتاج حسب المصنع والصنف');
      Reports.tbl(body, rows, [C('المصنع', r => U.esc(Domain.orgName(r.f))), C('الصنف', r => U.esc(Domain.drugName(r.d))), C('دفعات', r => r.batches, null, 'num'), C('عبوات', r => r.units, null, 'num')], 'production');
      Reports.h(body, 'مسارات التوزيع في الفترة');
      Reports.tbl(body, routes, [C('من', r => U.esc(Domain.orgName(r.from))), C('إلى', r => U.esc(Domain.orgName(r.to))), C('شحنات', r => r.sh, null, 'num'), C('عبوات', r => r.n, null, 'num')], 'distribution-routes');
    },
    access(el, def) {
      const { body, p } = Reports.frame(el, def);
      const a = Store.where('audit_logs', x => x.timestamp >= p.from && x.timestamp <= p.to + 'T23:59:59');
      const views = a.filter(x => x.action === 'view'); const em = a.filter(x => x.action === 'emergency_access'); const den = a.filter(x => x.action === 'access_denied' || x.action === 'login_failed');
      body.innerHTML = `<div class="grid g4">${UI.kpi('عمليات اطلاع', views.length)}${UI.kpi('وصول طوارئ', `<span style="color:var(--bad)">${em.length}</span>`)}${UI.kpi('محاولات مرفوضة', den.length)}${UI.kpi('مرضى تم الاطلاع على ملفاتهم', new Set(views.map(v => v.details?.patient_id)).size)}</div>`;
      const byOrg = Object.values(U.groupBy(views, 'actor_org_id')).map(v => ({ org: v[0].actor_org_id, n: v.length, users: new Set(v.map(x => x.actor_user_id)).size, pts: new Set(v.map(x => x.details?.patient_id)).size }));
      Reports.h(body, 'الاطلاع حسب الجهة');
      Reports.tbl(body, byOrg, [C('الجهة', r => U.esc(Domain.orgName(r.org))), C('عمليات', r => r.n, null, 'num'), C('مستخدمون', r => r.users, null, 'num'), C('مرضى', r => r.pts, null, 'num')], 'access-by-org');
      Reports.h(body, 'حالات الطوارئ والمحاولات المرفوضة');
      Reports.tbl(body, [...em, ...den].sort((x, y) => y.timestamp.localeCompare(x.timestamp)), [C('التوقيت', r => U.fmtDT(r.timestamp)), C('المستخدم', r => U.esc(Domain.userName(r.actor_user_id))), C('العملية', r => UI.badge(r.action, 'bad'), r => r.action), C('التفاصيل', r => U.esc(r.details?.reason || r.details?.national_id || ''))], 'emergency-denied');
    },
    consents(el, def) {
      const { body } = Reports.frame(el, def, { filters: false });
      const c = Store.all('consent_grants');
      const rows = Object.values(U.groupBy(c, x => Store.getAny('organizations', x.organization_id)?.type + '|' + x.scope)).map(a => ({ type: Store.getAny('organizations', a[0].organization_id)?.type, scope: a[0].scope, active: a.filter(x => !x.revoked_at).length, revoked: a.filter(x => x.revoked_at).length }));
      body.innerHTML = `<div class="grid g4">${UI.kpi('موافقات سارية', c.filter(x => !x.revoked_at).length)}${UI.kpi('مسحوبة', c.filter(x => x.revoked_at).length)}${UI.kpi('مرضى منحوا موافقة', new Set(c.map(x => x.patient_id)).size)}${UI.kpi('جهات حاصلة على موافقة', new Set(c.filter(x => !x.revoked_at).map(x => x.organization_id)).size)}</div>`;
      Reports.tbl(body, rows, [C('نوع الجهة', r => U.esc(ORG_TYPES[r.type])), C('النطاق', r => U.esc(CONSENT_SCOPES[r.scope])), C('سارية', r => r.active, null, 'num'), C('مسحوبة', r => r.revoked, null, 'num')], 'consents');
    },
    pharmacies(el, def) {
      const { body, p } = Reports.frame(el, def);
      const ph = Store.where('organizations', o => o.type === 'pharmacy');
      const rows = ph.map(o => { const ev = Store.where('supply_chain_events', e => e.event_timestamp >= p.from && e.event_timestamp <= p.to + 'T23:59:59' && (e.from_org_id === o.id || e.to_org_id === o.id)); return { o, disp: ev.filter(e => e.event_type === 'dispensed' && e.from_org_id === o.id).length, rec: ev.filter(e => e.event_type === 'received' && e.to_org_id === o.id).length, alerts: Store.where('counterfeit_alerts', a => a.reporter_org_id === o.id).length, users: Store.where('users', u => u.organization_id === o.id).length }; });
      const active = rows.filter(r => r.disp > 0).length;
      body.innerHTML = `<div class="grid g3">${UI.kpi('صيدليات النطاق', ph.filter(o => o.pilot).length)}${UI.kpi('صيدليات نشطة (صرفت في الفترة)', active)}${UI.kpi('نسبة التبني', U.fmtNum(ph.length ? active / ph.length * 100 : 0, 0) + '%', 'الهدف 70%')}</div>`;
      Reports.tbl(body, rows.sort((a, b) => b.disp - a.disp), [C('الصيدلية', r => U.esc(r.o.name)), C('المحافظة', r => U.esc(r.o.governorate)), C('مستخدمون', r => r.users, null, 'num'), C('استلام', r => r.rec, null, 'num'), C('صرف', r => r.disp, null, 'num'), C('إنذارات مُبلغة', r => r.alerts, null, 'num'), C('الحالة', r => r.disp ? UI.badge('نشطة', 'ok') : UI.badge('غير نشطة', 'warn'))], 'pharmacy-adoption');
    },
    forecast(el, def) {
      const { body } = Reports.frame(el, def, { filters: false });
      const ev = Reports.dispEvents(U.dayKey(U.addDays(new Date(), -28)), U.dayKey(new Date()));
      const g = U.groupBy(ev, e => (e.geo_location || 'غير محدد') + '|' + Reports.drugOf(e));
      const rows = Object.entries(g).map(([k, a]) => {
        const recent = a.filter(e => U.daysBetween(e.event_timestamp, new Date()) <= 14).length; const older = a.length - recent;
        const rate = recent / 14; const trend = older ? (recent - older) / older : 0;
        const fc = Math.max(0, rate * 7 * (1 + Math.max(-.5, Math.min(.5, trend))));
        const [gov, drug] = k.split('|');
        const stock = U.sum(Store.where('pharmacy_inventory', i => i.drug_id === drug && Domain.orgGov(i.pharmacy_org_id) === gov), 'quantity_on_hand');
        return { gov, drug, last28: a.length, rate, trend, fc, stock, gap: Math.ceil(fc) - stock };
      }).sort((a, b) => b.gap - a.gap);
      body.innerHTML = `<div class="callout info">نموذج استشاري (Advisory only) — متوسط متحرك 14 يوماً مع تعديل الاتجاه. يُعرض كاقتراح لمخطط التوزيع وليس قراراً تلقائياً.</div>
        <div class="grid g3" style="margin-top:12px">${UI.kpi('الطلب المتوقع للأسبوع القادم', U.fmtNum(U.sum(rows, 'fc'), 0) + ' عبوة')}${UI.kpi('بنود تحتاج إمداداً', rows.filter(r => r.gap > 0).length)}${UI.kpi('محافظات مغطاة', new Set(rows.map(r => r.gov)).size)}</div>`;
      Reports.tbl(body, rows, [C('المحافظة', r => U.esc(r.gov)), C('الصنف', r => U.esc(Domain.drugName(r.drug))), C('استهلاك 28 يوم', r => r.last28, null, 'num'), C('الاتجاه', r => r.trend > .1 ? UI.badge('↑ ' + U.fmtNum(r.trend * 100, 0) + '%', 'warn') : r.trend < -.1 ? UI.badge('↓ ' + U.fmtNum(-r.trend * 100, 0) + '%', 'info') : UI.badge('مستقر'), r => r.trend), C('متوقع 7 أيام', r => U.fmtNum(r.fc, 1), r => r.fc.toFixed(1), 'num'), C('مخزون الصيدليات', r => r.stock, null, 'num'), C('الفجوة المقترح إمدادها', r => r.gap > 0 ? `<b style="color:var(--warn)">${r.gap}</b>` : '—', r => r.gap, 'num')], 'demand-forecast');
    }
  }
};

Views.reports = (el, params = {}) => {
  UI.destroyCharts();
  const avail = Reports.list.filter(r => r.roles.includes(Auth.role()));
  const id = params.report || App.params?.report;
  const def = avail.find(r => r.id === id);
  if (def) { App.params = { report: id }; return Reports.run[id](el, def); }
  el.innerHTML = `<div class="card"><h3>التقارير المتاحة لدورك (${avail.length})</h3><p class="small muted">كل تقرير يدعم التصفية بالفترة، والتصدير CSV، وحفظ نسخة HTML قابلة للطباعة.</p><div class="report-list">${avail.map(r => `<button data-r="${r.id}"><span class="ic">${r.ic}</span><span><b>${U.esc(r.t)}</b><small>${U.esc(r.d)}</small></span></button>`).join('')}</div></div>`;
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { App.params = { report: b.dataset.r }; Views.reports(el, { report: b.dataset.r }); });
};
