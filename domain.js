/* =========================================================================
   منطق العمل (Business Logic) — يطبق FR-01..FR-12 وقواعد العمل BR-01..BR-04
   ========================================================================= */
'use strict';

const Domain = {
  /* ----------------------------- مساعدات ----------------------------- */
  orgName(id) { const o = Store.getAny('organizations', id); return o ? o.name : '—'; },
  orgGov(id) { const o = Store.getAny('organizations', id); return o ? o.governorate : null; },
  userName(id) { const u = Store.getAny('users', id); return u ? u.full_name : '—'; },
  drug(id) { return Store.getAny('drugs', id); },
  drugName(id) { const d = Store.getAny('drugs', id); return d ? d.name : '—'; },
  patientByUser(userId) { return Store.find('patients', p => p.user_id === userId); },
  patientUser(patientId) { const p = Store.getAny('patients', patientId); return p ? Store.getAny('users', p.user_id) : null; },

  gtin(prefix = '622') {
    let body = prefix + String(U.rand(0, 999999999)).padStart(10, '0');
    body = body.slice(0, 13);
    let sum = 0; for (let i = 0; i < 13; i++) sum += Number(body[12 - i]) * (i % 2 === 0 ? 3 : 1);
    return body + ((10 - (sum % 10)) % 10);
  },
  _serials: null,
  newSerial() {
    if (!this._serials) this._serials = new Set(Store.all('package_units', true).map(u => u.serial_number));
    let s; do { s = String(U.rand(1, 9)) + String(U.rand(0, 9999999)).padStart(7, '0') + String(U.rand(0, 999999)).padStart(6, '0'); } while (this._serials.has(s));
    this._serials.add(s); return s;
  },

  /* ======================= نطاق الهوية والصلاحيات ======================= */
  async createUser(data, password) {
    if (!/^\d{14}$/.test(String(data.national_id))) throw new Error('الرقم القومي يجب أن يكون 14 رقماً');
    if (Store.find('users', u => u.national_id === String(data.national_id))) throw new Error('الرقم القومي مسجل مسبقاً (فهرس فريد)');
    const salt = U.uuid().slice(0, 8);
    const u = await Store.insert('users', { ...data, national_id: String(data.national_id), salt, password_hash: await Crypto.hashPassword(password || '123456', salt), active: true });
    // صلاحيات افتراضية داخل الجهة (Permission) حسب نوع الجهة
    if (u.organization_id) {
      const d = Auth.defaults[u.role] || {};
      for (const [res, lvl] of Object.entries(d)) if (res !== '*') await Store.insert('permissions', { user_id: u.id, organization_id: u.organization_id, resource_type: res, access_level: lvl, granted_at: U.now(), revoked_at: null }, { noAudit: true });
    }
    if (u.role === 'patient') await Store.insert('patients', { user_id: u.id, dob: data.dob || null, gender: data.gender || null, blood_type: data.blood_type || '', chronic_conditions: data.chronic_conditions || '' });
    return u;
  },
  async grantConsent(patientUserId, orgId, scope) {
    const ex = Auth.consentFor(patientUserId, orgId);
    if (ex) await Store.update('consent_grants', ex.id, { revoked_at: U.now() });
    const c = await Store.insert('consent_grants', { patient_id: patientUserId, organization_id: orgId, scope, granted_at: U.now(), revoked_at: null });
    await Notify.toOrg(orgId, 'consent', `منح مريض موافقة اطلاع (${CONSENT_SCOPES[scope]}) لجهتكم`, c.id);
    return c;
  },
  async revokeConsent(id) { const c = await Store.update('consent_grants', id, { revoked_at: U.now() }, { action: 'revoke' }); return c; },
  async emergencyAccess(patientUserId, reason) {
    if (!reason || reason.trim().length < 10) throw new Error('يجب كتابة مبرر الطوارئ بوضوح (10 أحرف على الأقل)');
    Auth.emergency.set(patientUserId, { reason, at: Date.now() });
    Audit.log('emergency_access', 'clinical_record', patientUserId, null, null, { patient_id: patientUserId, reason });
    await Notify.send(patientUserId, 'emergency', `تم فتح ملفك الطبي في حالة طوارئ بواسطة ${Auth.user.full_name} — ${this.orgName(Auth.user.organization_id)}. المبرر: ${reason}`);
    await Notify.toRole('admin', 'emergency', `وصول طوارئ لملف مريض بواسطة ${Auth.user.full_name}`);
  },

  /* ======================= نطاق السجلات السريرية ======================= */
  /** FR-04: التاريخ المرضي الكامل مرتباً من الأحدث */
  async patientRecord(patientId) {
    const p = Store.get('patients', patientId); if (!p) return null;
    const visits = Store.where('visits', v => v.patient_id === patientId).sort((a, b) => b.visit_date.localeCompare(a.visit_date));
    const vIds = new Set(visits.map(v => v.id));
    const diagnoses = Store.where('diagnoses', d => vIds.has(d.visit_id));
    const rx = Store.where('prescriptions', r => r.patient_id === patientId).sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    const labs = Store.where('lab_results', l => l.patient_id === patientId).sort((a, b) => b.result_date.localeCompare(a.result_date));
    const rads = Store.where('radiology_reports', r => r.patient_id === patientId).sort((a, b) => b.report_date.localeCompare(a.report_date));
    await Crypto.warm([p], ENC_FIELDS.patients); await Crypto.warm(labs, ENC_FIELDS.lab_results);
    const timeline = [
      ...visits.map(v => ({ kind: 'visit', date: v.visit_date, row: v, dx: diagnoses.filter(d => d.visit_id === v.id) })),
      ...rx.map(r => ({ kind: 'rx', date: r.issued_at, row: r })),
      ...labs.map(l => ({ kind: 'lab', date: l.result_date, row: l })),
      ...rads.map(r => ({ kind: 'rad', date: r.report_date, row: r }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { p, user: Store.getAny('users', p.user_id), visits, diagnoses, rx, labs, rads, timeline };
  },
  async createVisit(data) { return Store.insert('visits', { ...data, doctor_id: Auth.user.id, organization_id: Auth.user.organization_id, visit_date: data.visit_date || U.now() }); },
  async addDiagnosis(visitId, code, description) { return Store.insert('diagnoses', { visit_id: visitId, icd10_code: code, description, diagnosed_at: U.now() }); },

  /** FR-06: تنبيه تعارض دواء مع الحالة المرضية أو مع أدوية أخرى — استشاري فقط (BR-04) */
  checkInteractions(patientId, drugIds) {
    const p = Store.get('patients', patientId);
    const cond = p ? String(Crypto.dv(p.chronic_conditions) || '') : '';
    const since = U.addDays(new Date(), -30).toISOString();
    const activeRx = Store.where('prescriptions', r => r.patient_id === patientId && r.issued_at >= since && ['issued', 'dispensed', 'partially_dispensed'].includes(r.status));
    const activeDrugIds = new Set(Store.where('prescription_items', i => activeRx.some(r => r.id === i.prescription_id)).map(i => i.drug_id));
    const ingr = id => String(this.drug(id)?.active_ingredient || '').toLowerCase();
    const newIngr = drugIds.map(id => ({ id, ing: ingr(id) }));
    const oldIngr = [...activeDrugIds].filter(id => !drugIds.includes(id)).map(id => ({ id, ing: ingr(id) }));
    const rules = Store.all('drug_interactions');
    const out = [];
    const has = (ing, key) => key && ing.includes(String(key).toLowerCase());
    for (const n of newIngr) for (const r of rules) {
      const matchA = has(n.ing, r.ingredient_a);
      if (!matchA) continue;
      if (r.condition_keyword && cond.includes(r.condition_keyword)) out.push({ severity: r.severity, drug: this.drugName(n.id), with: `الحالة: ${r.condition_keyword}`, message: r.message });
      if (r.ingredient_b) {
        for (const o of [...newIngr.filter(x => x.id !== n.id), ...oldIngr]) if (has(o.ing, r.ingredient_b)) out.push({ severity: r.severity, drug: this.drugName(n.id), with: `دواء: ${this.drugName(o.id)}${oldIngr.includes(o) ? ' (روشتة سارية)' : ''}`, message: r.message });
      }
    }
    // تكرار نفس المادة الفعالة
    for (const n of newIngr) for (const o of oldIngr) if (n.ing && n.ing === o.ing) out.push({ severity: 'moderate', drug: this.drugName(n.id), with: `دواء: ${this.drugName(o.id)}`, message: 'تكرار نفس المادة الفعالة مع روشتة سارية' });
    const seen = new Set(); return out.filter(x => { const k = x.drug + x.with + x.message; if (seen.has(k)) return false; seen.add(k); return true; });
  },

  /** FR-05 / UC-02: إصدار روشتة إلكترونية موقعة برمز QR */
  async issuePrescription({ visit_id, patient_id, items, overrides }) {
    if (!items.length) throw new Error('أضف دواءً واحداً على الأقل');
    const id = U.uuid();
    const qr = await QR.rxCode(id, 1, patient_id);
    const rx = await Store.insert('prescriptions', { id, visit_id, patient_id, doctor_id: Auth.user.id, organization_id: Auth.user.organization_id, qr_code_signed: qr, issued_at: U.now(), status: 'issued', version_no: 1, root_id: id, parent_id: null, interaction_overrides: overrides || [] });
    for (const it of items) await Store.insert('prescription_items', { prescription_id: id, drug_id: it.drug_id, dosage: it.dosage, quantity: Number(it.quantity) || 1, instructions: it.instructions || '' }, { noAudit: true });
    if (overrides && overrides.length) Audit.log('interaction_override', 'prescriptions', id, null, null, { warnings: overrides });
    const pu = this.patientUser(patient_id);
    if (pu) await Notify.send(pu.id, 'prescription', `صدرت لك روشتة إلكترونية جديدة من ${Auth.user.full_name}`, id);
    return rx;
  },
  /** Versioning: أي تعديل بعد الإصدار ينشئ نسخة جديدة ويُبقي القديمة للمراجعة القانونية */
  async amendPrescription(oldId, items, reason) {
    const old = Store.get('prescriptions', oldId);
    if (!old) throw new Error('الروشتة غير موجودة');
    if (old.status !== 'issued') throw new Error('لا يمكن تعديل روشتة تم صرفها أو استبدالها');
    const id = U.uuid(), ver = (old.version_no || 1) + 1;
    const qr = await QR.rxCode(id, ver, old.patient_id);
    await Store.update('prescriptions', oldId, { status: 'superseded', superseded_by: id }, { action: 'supersede' });
    const rx = await Store.insert('prescriptions', { ...old, id, qr_code_signed: qr, issued_at: U.now(), status: 'issued', version_no: ver, parent_id: oldId, root_id: old.root_id || oldId, amend_reason: reason, created_at: U.now(), updated_at: null, superseded_by: null });
    for (const it of items) await Store.insert('prescription_items', { prescription_id: id, drug_id: it.drug_id, dosage: it.dosage, quantity: Number(it.quantity) || 1, instructions: it.instructions || '' }, { noAudit: true });
    return rx;
  },
  async cancelPrescription(id, reason) { return Store.update('prescriptions', id, { status: 'cancelled', cancel_reason: reason }, { action: 'cancel' }); },
  rxItems(rxId) { return Store.where('prescription_items', i => i.prescription_id === rxId); },

  async addLabResult(data) {
    const r = await Store.insert('lab_results', { ...data, lab_org_id: Auth.user.organization_id, entered_by: Auth.user.id, result_date: data.result_date || U.now() });
    const pu = this.patientUser(data.patient_id);
    if (pu) await Notify.send(pu.id, 'lab', `نتيجة تحليل "${data.test_type}" أصبحت جاهزة في ملفك الطبي`, r.id);
    return r;
  },
  async addRadiology(data) {
    const r = await Store.insert('radiology_reports', { ...data, radiology_org_id: Auth.user.organization_id, entered_by: Auth.user.id, report_date: data.report_date || U.now() });
    const pu = this.patientUser(data.patient_id);
    if (pu) await Notify.send(pu.id, 'radiology', `تقرير "${data.scan_type}" أصبح متاحاً في ملفك الطبي`, r.id);
    return r;
  },

  /* ========================= نطاق تتبع الأدوية ========================= */
  /** FR-07 / UC-05: توليد QR فريد لكل عبوة مرتبط بدفعة الإنتاج */
  async createBatch({ drug_id, batch_number, manufacture_date, expiry_date, quantity_produced }, onProgress) {
    const drug = this.drug(drug_id); if (!drug) throw new Error('اختر الصنف');
    if (Store.find('production_batches', b => b.batch_number === batch_number)) throw new Error('رقم الدفعة مسجل مسبقاً (فريد)');
    const qty = Number(quantity_produced);
    if (!(qty > 0 && qty <= 500)) throw new Error('الكمية في النسخة التجريبية من 1 إلى 500 عبوة للدفعة');
    if (new Date(expiry_date) <= new Date(manufacture_date)) throw new Error('تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج');
    const factory = Auth.user.organization_id || drug.manufacturer_id;
    const batch = await Store.insert('production_batches', { drug_id, batch_number, manufacture_date, expiry_date, quantity_produced: qty, factory_org_id: factory, created_by: Auth.user.id });
    const geo = this.orgGov(factory);
    const rows = [];
    for (let i = 0; i < qty; i++) {
      const serial = this.newSerial();
      const qr = await QR.packageCode(serial, batch_number, expiry_date, drug.gtin);
      const uid = U.uuid();
      rows.push(['package_units', { id: uid, batch_id: batch.id, qr_code_signed: qr, serial_number: serial, status: 'produced', current_org_id: factory, created_at: U.now() }]);
      rows.push(['supply_chain_events', { id: U.uuid(), package_unit_id: uid, event_type: 'produced', from_org_id: null, to_org_id: factory, event_timestamp: U.now(), geo_location: geo, scanned_by_user_id: Auth.user.id, created_at: U.now() }]);
    }
    await Store.bulk(rows, onProgress);
    Audit.log('batch_produced', 'production_batches', batch.id, null, null, { units: qty, batch_number });
    return batch;
  },
  unitsAt(orgId, filter = {}) {
    return Store.where('package_units', u => u.current_org_id === orgId && (!filter.status || filter.status.includes(u.status)) && (!filter.drug_id || Store.getAny('production_batches', u.batch_id)?.drug_id === filter.drug_id) && (!filter.batch_id || u.batch_id === filter.batch_id));
  },
  incomingFor(orgId) { return Store.where('package_units', u => u.status === 'in_transit' && u.pending_to_org_id === orgId); },
  /** UC-06 / FR-08: شحن عبوات وتسجيل حدث الشحن */
  async ship(unitIds, toOrgId, withInvoice = true) {
    const me = Auth.user.organization_id; const geo = this.orgGov(me);
    const shipment = 'SHP-' + Date.now().toString(36).toUpperCase();
    let amount = 0; const ids = [];
    for (const id of unitIds) {
      const u = Store.get('package_units', id);
      if (!u || u.current_org_id !== me || !['produced', 'received'].includes(u.status)) continue;
      await Store._write('supply_chain_events', { id: U.uuid(), package_unit_id: id, event_type: 'shipped', from_org_id: me, to_org_id: toOrgId, event_timestamp: U.now(), geo_location: geo, scanned_by_user_id: Auth.user.id, shipment_no: shipment, created_at: U.now() });
      await Store.update('package_units', id, { status: 'in_transit', pending_to_org_id: toOrgId, shipment_no: shipment }, { noAudit: true });
      const b = Store.getAny('production_batches', u.batch_id); const d = b && this.drug(b.drug_id);
      amount += (d?.price || 0) * (Store.getAny('organizations', me)?.type === 'factory' ? 0.75 : 0.88);
      ids.push(id);
    }
    if (!ids.length) throw new Error('لا توجد عبوات صالحة للشحن');
    Audit.log('shipment', 'package_units', shipment, null, null, { units: ids.length, to: toOrgId });
    if (withInvoice) await this.invoice({ seller_org_id: me, buyer_org_id: toOrgId, package_unit_ids: ids, amount, kind: 'b2b', ref: shipment });
    await Notify.toOrg(toOrgId, 'shipment', `شحنة واردة ${shipment} (${ids.length} عبوة) من ${this.orgName(me)}`, shipment);
    return { shipment, count: ids.length };
  },
  /** تأكيد الاستلام + تحديث مخزون الصيدلية (Event Handler) */
  async receive(unitIds) {
    const me = Auth.user.organization_id; const geo = this.orgGov(me); let n = 0;
    for (const id of unitIds) {
      const u = Store.get('package_units', id);
      if (!u || u.status !== 'in_transit' || u.pending_to_org_id !== me) continue;
      await Store._write('supply_chain_events', { id: U.uuid(), package_unit_id: id, event_type: 'received', from_org_id: u.current_org_id, to_org_id: me, event_timestamp: U.now(), geo_location: geo, scanned_by_user_id: Auth.user.id, shipment_no: u.shipment_no, created_at: U.now() });
      await Store.update('package_units', id, { status: 'received', current_org_id: me, pending_to_org_id: null }, { noAudit: true });
      n++;
    }
    await this.recomputeInventory(me);
    Audit.log('receive', 'package_units', me, null, null, { units: n });
    return n;
  },
  /** PharmacyInventory يُحدَّث تلقائياً مع كل حدث استلام/صرف */
  async recomputeInventory(orgId) {
    const org = Store.get('organizations', orgId); if (!org || org.type !== 'pharmacy') return;
    const units = Store.where('package_units', u => u.current_org_id === orgId && u.status === 'received');
    const byDrug = U.groupBy(units, u => Store.getAny('production_batches', u.batch_id)?.drug_id);
    const existing = Store.where('pharmacy_inventory', i => i.pharmacy_org_id === orgId);
    const drugIds = new Set([...Object.keys(byDrug), ...existing.map(e => e.drug_id)]);
    for (const did of drugIds) {
      if (did === 'undefined') continue;
      const q = (byDrug[did] || []).length; const ex = existing.find(e => e.drug_id === did);
      if (ex) { if (ex.quantity_on_hand !== q) await Store.update('pharmacy_inventory', ex.id, { quantity_on_hand: q, last_updated: U.now() }); }
      else await Store.insert('pharmacy_inventory', { pharmacy_org_id: orgId, drug_id: did, quantity_on_hand: q, last_updated: U.now() });
    }
    const s = Settings.get();
    for (const did of drugIds) { const q = (byDrug[did] || []).length; if (q > 0 && q <= s.low_stock_threshold && !this._lowWarned?.[orgId + did]) { (this._lowWarned = this._lowWarned || {})[orgId + did] = 1; } }
  },
  trail(unitId) { return Store.where('supply_chain_events', e => e.package_unit_id === unitId).sort((a, b) => a.event_timestamp.localeCompare(b.event_timestamp)); },
  unitInfo(unit) {
    const batch = Store.getAny('production_batches', unit.batch_id); const drug = batch && this.drug(batch.drug_id);
    return { unit, batch, drug, manufacturer: drug && Store.getAny('organizations', drug.manufacturer_id), trail: this.trail(unit.id) };
  },
  /** FR-10 / UC-09 / BR-01: إنشاء إنذار غش وإرسال فوري لفريق الرقابة */
  async alert(type, unitId, details) {
    const dup = Store.find('counterfeit_alerts', a => a.package_unit_id === unitId && a.alert_type === type && a.status !== 'closed' && (Date.now() - new Date(a.detected_at)) < 864e5 && JSON.stringify(a.details?.raw || '') === JSON.stringify(details?.raw || ''));
    if (dup && unitId) return dup;
    const a = await Store.insert('counterfeit_alerts', { package_unit_id: unitId || null, alert_type: type, detected_at: U.now(), status: 'open', details: details || {}, reporter_user_id: Auth.user?.id || null, reporter_org_id: Auth.user?.organization_id || null, geo: details?.geo || this.orgGov(Auth.user?.organization_id) || null });
    const msg = `🚨 إنذار: ${ALERT_TYPES[type]}${details?.serial ? ' — عبوة ' + details.serial : ''}${details?.where ? ' — ' + details.where : ''}`;
    await Notify.toRole('authority', 'alert', msg, a.id);
    await Notify.toRole('admin', 'alert', msg, a.id);
    return a;
  },
  /**
   * التحقق من عبوة بمسح QR — يُستخدم من المريض/الصيدلي/الموزع/الرقابة
   * ctx: { mode: 'verify'|'dispense'|'receive', geo, record: true }
   */
  async verifyPackage(code, ctx = {}) {
    const t0 = performance.now();
    const res = await this._verify(code, ctx);
    res.ms = performance.now() - t0; Metrics.scanTimes.push(res.ms);
    return res;
  },
  async _verify(code, ctx) {
    const pz = QR.parse(code);
    const me = Auth.user?.organization_id; const geo = ctx.geo || this.orgGov(me) || 'غير محدد';
    if (pz.kind === 'rx') return { ok: false, level: 'warn', title: 'هذا رمز روشتة وليس رمز عبوة', parsed: pz };
    if (pz.kind === 'unknown') {
      if (ctx.record !== false) await this.alert('unknown_code', null, { raw: pz.raw.slice(0, 80), where: geo, geo });
      return { ok: false, level: 'danger', title: 'رمز غير معروف — العبوة غير مسجلة في المنصة', detail: 'تم إبلاغ فريق الرقابة تلقائياً. لا تستخدم هذا الدواء.' };
    }
    let unit;
    if (pz.kind === 'serial') unit = Store.find('package_units', u => u.serial_number === pz.serial);
    else {
      if (!(await QR.verify(pz))) {
        const u2 = Store.find('package_units', u => u.serial_number === pz.serial);
        if (ctx.record !== false) await this.alert('invalid_signature', u2?.id || null, { raw: pz.raw.slice(0, 80), serial: pz.serial, where: geo, geo });
        return { ok: false, level: 'danger', title: 'توقيع رقمي غير صالح — رمز مزور', detail: 'الرمز لا يحمل توقيع المنصة. تم إطلاق إنذار غش فوري.' };
      }
      unit = Store.find('package_units', u => u.serial_number === pz.serial);
      if (unit && unit.qr_code_signed !== pz.raw) {
        if (ctx.record !== false) await this.alert('invalid_signature', unit.id, { serial: pz.serial, where: geo, geo, raw: pz.raw.slice(0, 80) });
        return { ok: false, level: 'danger', title: 'بيانات الرمز لا تطابق السجل', detail: 'الرقم التسلسلي مسجل لكن ببيانات مختلفة — اشتباه استنساخ.' };
      }
    }
    if (!unit) {
      if (ctx.record !== false) await this.alert('unknown_code', null, { serial: pz.serial, raw: pz.raw.slice(0, 80), where: geo, geo });
      return { ok: false, level: 'danger', title: 'رقم تسلسلي غير مسجل', detail: 'تم إبلاغ فريق الرقابة تلقائياً.' };
    }
    const info = this.unitInfo(unit);
    const warnings = [];
    let level = 'ok';
    if (info.batch && new Date(info.batch.expiry_date) < new Date()) { warnings.push('العبوة منتهية الصلاحية'); level = 'danger'; }
    if (unit.status === 'recalled') { warnings.push('هذه الدفعة مسحوبة من السوق بقرار رقابي'); level = 'danger'; }
    if (ctx.mode !== 'dispense' && ctx.record !== false) {
      // سجل مسح تحقق (Append-only) لبناء "الأثر" وكشف المسح من موقعين
      await Store._write('supply_chain_events', { id: U.uuid(), package_unit_id: unit.id, event_type: 'scan_verify', from_org_id: null, to_org_id: me || null, event_timestamp: U.now(), geo_location: geo, scanned_by_user_id: Auth.user?.id || null, created_at: U.now() });
      if (unit.status === 'dispensed') {
        const win = Settings.get().geo_window_hours * 3600e3;
        const recent = this.trail(unit.id).filter(e => ['dispensed', 'scan_verify'].includes(e.event_type) && Date.now() - new Date(e.event_timestamp) < win);
        const geos = new Set(recent.map(e => e.geo_location).filter(Boolean));
        if (geos.size > 1) {
          const a = await this.alert('geo_mismatch', unit.id, { serial: unit.serial_number, where: [...geos].join(' ↔ '), geo, locations: [...geos] });
          warnings.push('تم رصد مسح لنفس العبوة من موقعين مختلفين خلال 24 ساعة — إنذار رقم ' + a.id.slice(0, 8)); level = 'danger';
        }
      }
    }
    if (ctx.mode === 'dispense') {
      if (unit.status === 'dispensed') {
        await this.alert('duplicate_scan', unit.id, { serial: unit.serial_number, where: geo, geo, previous: this.orgName(this.trail(unit.id).filter(e => e.event_type === 'dispensed').pop()?.from_org_id) });
        return { ok: false, level: 'danger', title: 'العبوة مصروفة من قبل — مسح مكرر', detail: 'تم إطلاق إنذار غش فوري لفريق الرقابة (FR-10).', info };
      }
      if (unit.current_org_id !== me || unit.status !== 'received') {
        await this.alert('wrong_location', unit.id, { serial: unit.serial_number, where: geo, geo, expected: this.orgName(unit.current_org_id) });
        return { ok: false, level: 'danger', title: 'العبوة غير مسجلة في مخزون صيدليتك', detail: `آخر موقع مسجل: ${this.orgName(unit.current_org_id)} — حالة: ${UNIT_STATUS[unit.status]}`, info };
      }
      if (level === 'danger') return { ok: false, level, title: warnings[0], info, warnings };
    }
    return { ok: level !== 'danger', level, title: level === 'ok' ? 'عبوة أصلية مسجلة ✔' : 'تحذير', info, warnings };
  },

  /** UC-03: مسح روشتة والتحقق منها (BR-01: تُستخدم مرة واحدة) */
  async verifyRx(code) {
    const t0 = performance.now();
    const pz = QR.parse(code);
    const done = r => { r.ms = performance.now() - t0; Metrics.scanTimes.push(r.ms); return r; };
    if (pz.kind !== 'rx') return done({ ok: false, title: 'الرمز ليس رمز روشتة إلكترونية' });
    if (!(await QR.verify(pz))) { await this.alert('invalid_signature', null, { raw: pz.raw.slice(0, 80), where: this.orgGov(Auth.user.organization_id), kind: 'rx' }); return done({ ok: false, title: 'توقيع الروشتة غير صالح — روشتة مزورة', danger: true }); }
    const rx = Store.get('prescriptions', pz.rxId);
    if (!rx || rx.qr_code_signed !== pz.raw) return done({ ok: false, title: 'الروشتة غير مسجلة في المنصة', danger: true });
    if (rx.status === 'superseded') return done({ ok: false, title: 'هذه نسخة قديمة من الروشتة — تم إصدار نسخة أحدث', rx });
    if (rx.status === 'cancelled') return done({ ok: false, title: 'الروشتة ملغاة من الطبيب', rx });
    if (rx.status === 'dispensed' || rx.status === 'partially_dispensed') {
      await this.alert('rx_reuse', null, { rx_id: rx.id, where: this.orgName(Auth.user.organization_id), geo: this.orgGov(Auth.user.organization_id), raw: rx.id });
      Audit.log('rx_reuse_attempt', 'prescriptions', rx.id);
      return done({ ok: false, title: 'تم صرف هذه الروشتة من قبل — مرفوض (BR-01)', detail: 'تم تسجيل المحاولة كإنذار.', rx, danger: true });
    }
    Audit.view(rx.patient_id, 'prescription', { rx_id: rx.id, via: 'rx_qr' });
    return done({ ok: true, rx, items: this.rxItems(rx.id), patient: Store.getAny('patients', rx.patient_id) });
  },
  /** FEFO: اقتراح عبوات من المخزون الأقرب انتهاءً أولاً */
  suggestUnits(drugId, qty) {
    const me = Auth.user.organization_id;
    return this.unitsAt(me, { status: ['received'], drug_id: drugId })
      .filter(u => new Date(Store.getAny('production_batches', u.batch_id)?.expiry_date) > new Date())
      .sort((a, b) => String(Store.getAny('production_batches', a.batch_id)?.expiry_date).localeCompare(String(Store.getAny('production_batches', b.batch_id)?.expiry_date)))
      .slice(0, qty);
  },
  /** UC-03/UC-04 + FR-08/09/11 + BR-01/BR-03: الصرف وخصم المخزون وإشعار المريض */
  async dispense(rxId, picks) {
    const rx = Store.get('prescriptions', rxId);
    if (!rx || rx.status !== 'issued') throw new Error('الروشتة غير صالحة للصرف (BR-01)');
    const me = Auth.user.organization_id; const geo = this.orgGov(me);
    const items = this.rxItems(rxId); const lines = []; let total = 0, totalTax = 0; let mismatch = false;
    const patientUser = this.patientUser(rx.patient_id);
    for (const it of items) {
      const units = (picks[it.id] || []).map(id => Store.get('package_units', id)).filter(Boolean);
      for (const u of units) {
        const b = Store.getAny('production_batches', u.batch_id);
        if (u.current_org_id !== me || u.status !== 'received') throw new Error(`العبوة ${u.serial_number} غير متاحة في مخزونك`);
        if (b.drug_id !== it.drug_id) throw new Error(`العبوة ${u.serial_number} لا تخص الصنف ${this.drugName(it.drug_id)}`);
        if (new Date(b.expiry_date) < new Date()) throw new Error(`العبوة ${u.serial_number} منتهية الصلاحية`);
      }
      if (units.length !== Number(it.quantity)) mismatch = true;
      lines.push({ item_id: it.id, drug_id: it.drug_id, prescribed: Number(it.quantity), dispensed: units.length, unit_ids: units.map(u => u.id) });
    }
    if (!lines.some(l => l.dispensed > 0)) throw new Error('لم يتم اختيار أي عبوة للصرف');
    for (const l of lines) for (const uid of l.unit_ids) {
      const d = this.drug(l.drug_id);
      await Store._write('supply_chain_events', { id: U.uuid(), package_unit_id: uid, event_type: 'dispensed', from_org_id: me, to_org_id: null, patient_id: rx.patient_id, prescription_id: rx.id, event_timestamp: U.now(), geo_location: geo, scanned_by_user_id: Auth.user.id, created_at: U.now() });
      await Store.update('package_units', uid, { status: 'dispensed', current_org_id: me, dispensed_to_patient_id: rx.patient_id, dispensed_at: U.now() }, { noAudit: true });
      const inv = await this.invoice({ seller_org_id: me, buyer_org_id: null, buyer_patient_id: rx.patient_id, package_unit_ids: [uid], amount: d?.price || 0, kind: 'retail', ref: rx.id });
      total += inv.amount; totalTax += inv.tax_amount;
    }
    const allZeroOrPartial = lines.some(l => l.dispensed < l.prescribed);
    const status = allZeroOrPartial ? 'partially_dispensed' : 'dispensed';
    await Store.update('prescriptions', rxId, { status, dispensed_at: U.now(), dispensed_by: Auth.user.id, dispensed_org_id: me }, { action: 'dispense' });
    const rec = await Store.insert('dispense_records', { prescription_id: rxId, patient_id: rx.patient_id, pharmacy_org_id: me, pharmacist_id: Auth.user.id, lines, total, tax: totalTax, needs_review: mismatch, review_status: mismatch ? 'pending' : 'not_required', dispensed_at: U.now(), geo });
    await this.recomputeInventory(me);
    if (patientUser) {
      const names = lines.filter(l => l.dispensed).map(l => `${this.drugName(l.drug_id)} × ${l.dispensed}`).join('، ');
      await Notify.send(patientUser.id, 'dispense', `تم صرف أدوية باسمك من ${this.orgName(me)}: ${names}. إن لم تكن أنت، أبلغ فوراً.`, rec.id);
    }
    if (mismatch) await Notify.toRole('authority', 'review', `صرف بكمية مختلفة عن الروشتة يحتاج مراجعة (BR-03) — ${this.orgName(me)}`, rec.id);
    return rec;
  },
  async invoice({ seller_org_id, buyer_org_id, buyer_patient_id, package_unit_ids, amount, kind, ref }) {
    const rate = Settings.get().tax_rate;
    const net = Math.round(amount * 100) / 100;
    const no = 'INV-' + new Date().getFullYear() + '-' + String(Store.all('invoices', true).length + 1).padStart(6, '0') + '-' + U.rand(10, 99);
    return Store.insert('invoices', { invoice_no: no, seller_org_id, buyer_org_id: buyer_org_id || null, buyer_patient_id: buyer_patient_id || null, package_unit_id: package_unit_ids[0] || null, package_unit_ids, amount: net, tax_amount: Math.round(net * rate * 100) / 100, issued_at: U.now(), kind, ref });
  },
  /** سحب دفعة من السوق (قرار رقابي) */
  async recallBatch(batchId, reason) {
    const units = Store.where('package_units', u => u.batch_id === batchId && u.status !== 'dispensed');
    for (const u of units) {
      await Store._write('supply_chain_events', { id: U.uuid(), package_unit_id: u.id, event_type: 'recalled', from_org_id: u.current_org_id, to_org_id: null, event_timestamp: U.now(), geo_location: this.orgGov(u.current_org_id), scanned_by_user_id: Auth.user.id, note: reason, created_at: U.now() });
      await Store.update('package_units', u.id, { status: 'recalled' }, { noAudit: true });
    }
    await Store.update('production_batches', batchId, { recalled_at: U.now(), recall_reason: reason });
    const orgs = new Set(units.map(u => u.current_org_id));
    for (const o of orgs) await Notify.toOrg(o, 'recall', `قرار سحب الدفعة ${Store.getAny('production_batches', batchId).batch_number}: ${reason}`);
    for (const o of new Set(Store.where('organizations', x => x.type === 'pharmacy').map(x => x.id))) { await this.recomputeInventory(o); }
    return units.length;
  },
  /** هل العبوة مُتتبعة بالكامل من المصنع للصرف؟ (KPI) */
  fullyTraced(unitId) { const t = new Set(this.trail(unitId).map(e => e.event_type)); return t.has('produced') && t.has('shipped') && t.has('received') && t.has('dispensed'); }
};

const CONSENT_SCOPES = { full_record: 'الملف الطبي الكامل', prescription: 'الروشتات فقط', lab_result: 'التحاليل فقط', radiology: 'الأشعة فقط', basic: 'البيانات الأساسية' };
