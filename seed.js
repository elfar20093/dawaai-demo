/* =========================================================================
   بيانات تجريبية واقعية للمرحلة التجريبية (Pilot) — كل كلمات المرور: 123456
   ========================================================================= */
'use strict';

const Seed = {
  DEMO_USERS: [
    ['10000000000001', 'admin', 'مدير المنصة'], ['10000000000002', 'authority', 'مفتش هيئة الدواء'],
    ['10000000000003', 'doctor', 'طبيب — مستشفى'], ['10000000000004', 'doctor', 'طبيب — عيادة'],
    ['10000000000005', 'pharmacist', 'صيدلي — القاهرة'], ['10000000000006', 'pharmacist', 'صيدلي — الجيزة'],
    ['10000000000008', 'factory', 'موظف مصنع'], ['10000000000009', 'distributor', 'موزع'],
    ['10000000000010', 'lab', 'معمل تحاليل'], ['10000000000011', 'radiology', 'مركز أشعة'],
    ['20000000000001', 'patient', 'مريضة — سارة'], ['20000000000002', 'patient', 'مريض — محمد']
  ],
  async build(onProgress) {
    const rows = []; const put = (t, r) => { r.id = r.id || U.uuid(); r.created_at = r.created_at || U.now(); rows.push([t, r]); return r; };
    const D = n => U.addDays(new Date(), n);
    const iso = (n, h = 10) => { const d = D(n); d.setHours(h, U.rand(0, 59), 0, 0); return d.toISOString(); };

    put('settings', { ...Settings.defaults, id: 'main' });

    /* ---------------- الجهات ---------------- */
    const O = {};
    const org = (k, name, type, gov, extra = {}) => (O[k] = put('organizations', { name, type, governorate: gov, geo_location: gov, license_no: 'LIC-' + U.rand(100000, 999999), ...extra }));
    org('mohp', 'وزارة الصحة والسكان — إدارة المنصة', 'authority', 'القاهرة');
    org('eda', 'هيئة الدواء المصرية — إدارة الرقابة', 'authority', 'القاهرة');
    org('f1', 'مصنع النيل للصناعات الدوائية', 'factory', 'القليوبية');
    org('f2', 'شركة الدلتا فارما', 'factory', 'الشرقية');
    org('d1', 'الشركة المتحدة لتوزيع الأدوية', 'distributor', 'القاهرة');
    org('d2', 'مخازن الثغر للأدوية', 'distributor', 'الإسكندرية');
    org('p1', 'صيدلية الشفاء', 'pharmacy', 'القاهرة', { pilot: true });
    org('p2', 'صيدلية النور', 'pharmacy', 'الجيزة', { pilot: true });
    org('p3', 'صيدلية الرحمة', 'pharmacy', 'الإسكندرية', { pilot: true });
    org('p4', 'صيدلية الحياة', 'pharmacy', 'الدقهلية', { pilot: true });
    org('p5', 'صيدلية الأمل', 'pharmacy', 'القاهرة', { pilot: true });
    org('h1', 'مستشفى السلام العام', 'hospital', 'القاهرة');
    org('c1', 'عيادة الباطنة التخصصية', 'clinic', 'الجيزة');
    org('l1', 'معمل المختبر الحديث', 'lab', 'القاهرة');
    org('r1', 'مركز الأشعة الدولي', 'radiology', 'الجيزة');

    /* ---------------- المستخدمون ---------------- */
    const Us = {};
    const salt = 'demo';
    const pwh = await Crypto.hashPassword('123456', salt);
    const user = (k, nid, name, role, orgKey, extra = {}) => (Us[k] = put('users', { national_id: nid, full_name: name, role, organization_id: orgKey ? O[orgKey].id : null, phone: '010' + U.rand(10000000, 99999999), email: '', salt, password_hash: pwh, active: true, ...extra }));
    user('admin', '10000000000001', 'م. خالد عبد الرحمن', 'admin', 'mohp');
    user('insp', '10000000000002', 'د. منى فاروق', 'authority', 'eda');
    user('doc1', '10000000000003', 'د. أحمد سالم', 'doctor', 'h1');
    user('doc2', '10000000000004', 'د. هالة مصطفى', 'doctor', 'c1');
    user('ph1', '10000000000005', 'د. كريم يوسف', 'pharmacist', 'p1');
    user('ph2', '10000000000006', 'د. ريم عادل', 'pharmacist', 'p2');
    user('ph3', '10000000000007', 'د. عمرو نبيل', 'pharmacist', 'p3');
    user('ph5', '10000000000012', 'د. ياسمين طارق', 'pharmacist', 'p5');
    user('fac', '10000000000008', 'م. منى حسن (مسؤولة الجودة)', 'factory', 'f1');
    user('fac2', '10000000000013', 'م. سامح إبراهيم', 'factory', 'f2');
    user('dist', '10000000000009', 'أ. وليد شوقي', 'distributor', 'd1');
    user('dist2', '10000000000014', 'أ. نهى سعيد', 'distributor', 'd2');
    user('lab', '10000000000010', 'د. سلمى ماهر', 'lab', 'l1');
    user('rad', '10000000000011', 'د. طارق فهمي', 'radiology', 'r1');
    for (const k of Object.keys(Us)) { const u = Us[k]; const d = Auth.defaults[u.role] || {}; for (const [res, lvl] of Object.entries(d)) if (res !== '*') put('permissions', { user_id: u.id, organization_id: u.organization_id, resource_type: res, access_level: lvl, granted_at: iso(-60), revoked_at: null }); }

    const P = {};
    const patient = (k, nid, name, gender, dob, blood, chronic) => {
      Us[k] = put('users', { national_id: nid, full_name: name, role: 'patient', organization_id: null, phone: '011' + U.rand(10000000, 99999999), email: '', salt, password_hash: pwh, active: true });
      P[k] = put('patients', { user_id: Us[k].id, dob, gender, blood_type: blood, chronic_conditions: chronic });
    };
    patient('sara', '20000000000001', 'سارة محمود علي', 'أنثى', '1992-04-11', 'A+', 'ربو شعبي، حساسية البنسلين');
    patient('mohamed', '20000000000002', 'محمد عبد الله حسن', 'ذكر', '1961-09-02', 'O+', 'سكري نوع 2، ارتفاع ضغط الدم، مرض الكلى المزمن مرحلة 2');
    patient('fatma', '20000000000003', 'فاطمة السيد إبراهيم', 'أنثى', '1955-01-20', 'B+', 'رجفان أذيني (على وارفارين)');
    patient('youssef', '20000000000004', 'يوسف أحمد كمال', 'ذكر', '1988-12-05', 'AB+', 'قرحة المعدة');
    patient('nour', '20000000000005', 'نور الهدى سمير', 'أنثى', '2001-06-30', 'O-', '');
    patient('ali', '20000000000006', 'علي حسين مرسي', 'ذكر', '1975-03-14', 'A-', 'ارتفاع دهون الدم');
    patient('mona', '20000000000007', 'منى عبد العزيز', 'أنثى', '1983-08-08', 'B-', 'قصور الغدة الدرقية');
    patient('hassan', '20000000000008', 'حسن محمد الشافعي', 'ذكر', '1969-11-25', 'O+', 'سكري نوع 2');

    /* موافقات المرضى (ConsentGrant) — بعض المرضى بدون موافقة لعرض BR-02 */
    const consent = (pk, ok, scope, n) => put('consent_grants', { patient_id: Us[pk].id, organization_id: O[ok].id, scope, granted_at: iso(n), revoked_at: null });
    consent('sara', 'h1', 'full_record', -50); consent('sara', 'l1', 'lab_result', -40); consent('sara', 'r1', 'radiology', -30);
    consent('mohamed', 'h1', 'full_record', -55); consent('mohamed', 'c1', 'full_record', -45); consent('mohamed', 'l1', 'lab_result', -44);
    consent('fatma', 'c1', 'full_record', -35); consent('youssef', 'h1', 'full_record', -25); consent('ali', 'c1', 'full_record', -20);
    consent('hassan', 'h1', 'full_record', -18); consent('hassan', 'l1', 'lab_result', -18); consent('mona', 'r1', 'radiology', -15);
    put('consent_grants', { patient_id: Us.nour.id, organization_id: O.h1.id, scope: 'full_record', granted_at: iso(-40), revoked_at: iso(-10) });

    /* ---------------- الأدوية وقواعد التعارض ---------------- */
    const Dr = {};
    const drug = (k, name, ing, form, mf, price) => (Dr[k] = put('drugs', { name, active_ingredient: ing, dosage_form: form, manufacturer_id: O[mf].id, gtin: Domain.gtin(), price, registration_no: 'EDA-' + U.rand(10000, 99999) }));
    drug('para', 'باراسيتامول 500 مجم', 'paracetamol', 'أقراص', 'f1', 25);
    drug('amox', 'أموكسيسيلين/كلافولانيك 1 جم', 'amoxicillin clavulanate', 'أقراص', 'f1', 85);
    drug('biso', 'بيسوبرولول 5 مجم', 'bisoprolol', 'أقراص', 'f2', 60);
    drug('metf', 'ميتفورمين 850 مجم', 'metformin', 'أقراص', 'f2', 40);
    drug('ibu', 'إيبوبروفين 400 مجم', 'ibuprofen', 'أقراص', 'f1', 30);
    drug('warf', 'وارفارين 5 مجم', 'warfarin', 'أقراص', 'f2', 45);
    drug('asp', 'أسبرين 75 مجم', 'aspirin', 'أقراص', 'f1', 18);
    drug('salb', 'سالبيوتامول 100 مكجم بخاخ', 'salbutamol', 'بخاخ', 'f2', 55);
    drug('ator', 'أتورفاستاتين 20 مجم', 'atorvastatin', 'أقراص', 'f1', 120);
    drug('eso', 'إيزوميبرازول 40 مجم', 'esomeprazole', 'كبسولات', 'f2', 95);
    const rule = (a, b, cond, sev, msg) => put('drug_interactions', { ingredient_a: a, ingredient_b: b, condition_keyword: cond, severity: sev, message: msg });
    rule('ibuprofen', 'warfarin', null, 'high', 'زيادة خطر النزيف بشكل كبير عند الجمع مع مضادات التجلط');
    rule('aspirin', 'warfarin', null, 'high', 'زيادة خطر النزيف — يحتاج متابعة INR');
    rule('ibuprofen', 'aspirin', null, 'moderate', 'قد يقلل الأثر الوقائي للأسبرين على القلب ويزيد تهيج المعدة');
    rule('ibuprofen', null, 'قرحة', 'high', 'مضادات الالتهاب غير الستيرويدية قد تسبب نزيف قرحة المعدة');
    rule('ibuprofen', null, 'الكلى', 'moderate', 'قد يدهور وظائف الكلى لدى مرضى الكلى المزمن');
    rule('ibuprofen', null, 'ربو', 'moderate', 'قد يحفز نوبات الربو لدى بعض المرضى');
    rule('aspirin', null, 'قرحة', 'moderate', 'خطر تهيج أو نزيف المعدة');
    rule('metformin', null, 'الكلى', 'high', 'يُراجع الجرعة حسب معدل الترشيح — خطر الحماض اللبني');
    rule('bisoprolol', null, 'ربو', 'high', 'حاصرات بيتا قد تسبب تشنج الشعب الهوائية لمرضى الربو');
    rule('bisoprolol', 'salbutamol', null, 'moderate', 'تعارض في التأثير على مستقبلات بيتا');
    rule('amoxicillin', null, 'البنسلين', 'high', 'المريض لديه حساسية مسجلة من البنسلين');
    rule('atorvastatin', null, 'الكبد', 'moderate', 'يُراقب إنزيمات الكبد');

    /* ---------------- الإنتاج وسلسلة التوريد ---------------- */
    const B = []; const units = [];
    const ev = (u, type, from, to, n, h, extra = {}) => put('supply_chain_events', { package_unit_id: u.id, event_type: type, from_org_id: from ? O[from].id : null, to_org_id: to ? O[to].id : null, event_timestamp: iso(n, h), geo_location: O[from || to]?.governorate, scanned_by_user_id: Us.fac.id, ...extra });
    const batchDefs = [
      ['para', 'f1', 18, -60, 700], ['amox', 'f1', 12, -55, 500], ['biso', 'f2', 10, -58, 650], ['metf', 'f2', 14, -52, 720],
      ['ibu', 'f1', 12, -50, 45], ['warf', 'f2', 8, -48, 600], ['asp', 'f1', 10, -46, 680], ['salb', 'f2', 8, -44, 500],
      ['ator', 'f1', 8, -42, 70], ['eso', 'f2', 10, -40, 540], ['para', 'f1', 8, -400, -5]
    ];
    const pharmacies = ['p1', 'p2', 'p3', 'p5'];
    for (const [dk, fk, qty, made, expIn] of batchDefs) {
      const bn = (fk === 'f1' ? 'NIL' : 'DLT') + '-' + new Date().getFullYear() + '-' + String(B.length + 101);
      const b = put('production_batches', { drug_id: Dr[dk].id, batch_number: bn, manufacture_date: U.dayKey(D(made)), expiry_date: U.dayKey(D(expIn)), quantity_produced: qty, factory_org_id: O[fk].id });
      B.push(b);
      const distKey = units.length % 3 === 2 ? 'd2' : 'd1';
      for (let i = 0; i < qty; i++) {
        const serial = Domain.newSerial();
        const u = put('package_units', { batch_id: b.id, serial_number: serial, qr_code_signed: await QR.packageCode(serial, bn, b.expiry_date, Dr[dk].gtin), status: 'produced', current_org_id: O[fk].id });
        u._drug = dk; units.push(u);
        ev(u, 'produced', null, fk, made, 9);
        if (i >= qty - 2 && expIn > 0) continue; // تبقى في المصنع
        ev(u, 'shipped', fk, distKey, made + 3, 11); ev(u, 'received', fk, distKey, made + 4, 9);
        if (i >= qty - 4 && expIn > 0) { u.status = 'received'; u.current_org_id = O[distKey].id; continue; } // تبقى عند الموزع
        const ph = distKey === 'd2' ? 'p3' : pharmacies[i % pharmacies.length] === 'p3' ? 'p1' : pharmacies[i % pharmacies.length];
        ev(u, 'shipped', distKey, ph, made + 8, 13); ev(u, 'received', distKey, ph, made + 9, 10);
        u.status = 'received'; u.current_org_id = O[ph].id;
      }
    }
    onProgress?.(0, 1);

    /* ---------------- الزيارات والروشتات والصرف ---------------- */
    const pairs = [['sara', 'doc1', 'h1'], ['mohamed', 'doc1', 'h1'], ['mohamed', 'doc2', 'c1'], ['fatma', 'doc2', 'c1'], ['youssef', 'doc1', 'h1'], ['ali', 'doc2', 'c1'], ['hassan', 'doc1', 'h1'], ['sara', 'doc1', 'h1']];
    const plan = {
      sara: [['J45', 'ربو شعبي — نوبة خفيفة', ['salb', 1], ['para', 1]], ['J02.9', 'التهاب البلعوم', ['para', 2]]],
      mohamed: [['E11', 'متابعة سكري', ['metf', 2]], ['I10', 'ارتفاع ضغط', ['biso', 1], ['asp', 1]]],
      fatma: [['I48', 'متابعة رجفان أذيني', ['warf', 2]]],
      youssef: [['K25', 'قرحة المعدة', ['eso', 2]], ['R51', 'صداع', ['para', 1]]],
      ali: [['E78.5', 'ارتفاع دهون', ['ator', 1]]],
      hassan: [['E11', 'سكري', ['metf', 1]], ['N39.0', 'عدوى بولية', ['amox', 1]]]
    };
    const used = new Set(); let rxCount = 0;
    const takeUnit = (dk, phId) => { const u = units.find(x => x._drug === dk && x.current_org_id === phId && x.status === 'received' && !used.has(x.id) && new Date(B.find(b => b.id === x.batch_id).expiry_date) > new Date()); if (u) used.add(u.id); return u; };
    for (let round = 0; round < 3; round++) for (const [pk, dk, ok] of pairs) {
      const pl = plan[pk]; if (!pl) continue;
      const day = -(2 + round * 7 + U.rand(0, 5));
      const [code, desc, ...meds] = pl[(round + rxCount) % pl.length];
      const v = put('visits', { patient_id: P[pk].id, doctor_id: Us[dk].id, organization_id: O[ok].id, visit_date: iso(day, 10), chief_complaint: desc });
      put('diagnoses', { visit_id: v.id, icd10_code: code, description: (ICD10.find(x => x[0] === code) || [])[1] || desc, diagnosed_at: iso(day, 10) });
      const rxId = U.uuid(); rxCount++;
      const rx = put('prescriptions', { id: rxId, visit_id: v.id, patient_id: P[pk].id, doctor_id: Us[dk].id, organization_id: O[ok].id, qr_code_signed: await QR.rxCode(rxId, 1, P[pk].id), issued_at: iso(day, 11), status: 'issued', version_no: 1, root_id: rxId, parent_id: null });
      const items = meds.map(([m, q]) => put('prescription_items', { prescription_id: rxId, drug_id: Dr[m].id, dosage: '1 × 2 يومياً', quantity: q, instructions: 'بعد الأكل' }));
      if (round === 0 && rxCount % 4 === 0) continue; // روشتات سارية لم تُصرف بعد
      const phKey = pk === 'mohamed' || pk === 'hassan' ? 'p1' : pk === 'fatma' || pk === 'ali' ? 'p2' : rxCount % 3 === 0 ? 'p5' : 'p1';
      const phUser = { p1: 'ph1', p2: 'ph2', p3: 'ph3', p5: 'ph5' }[phKey];
      const lines = []; let total = 0, tax = 0, mismatch = false;
      for (const it of items) {
        const ids = [];
        for (let q = 0; q < it.quantity; q++) { const u = takeUnit(Object.keys(Dr).find(k => Dr[k].id === it.drug_id), O[phKey].id); if (u) ids.push(u); }
        if (ids.length !== it.quantity) mismatch = true;
        for (const u of ids) {
          u.status = 'dispensed'; u.dispensed_to_patient_id = P[pk].id; u.dispensed_at = iso(day + 1, 17);
          put('supply_chain_events', { package_unit_id: u.id, event_type: 'dispensed', from_org_id: O[phKey].id, to_org_id: null, patient_id: P[pk].id, prescription_id: rxId, event_timestamp: iso(day + 1, 17), geo_location: O[phKey].governorate, scanned_by_user_id: Us[phUser].id });
          const price = Dr[Object.keys(Dr).find(k => Dr[k].id === it.drug_id)].price;
          put('invoices', { invoice_no: 'INV-' + new Date().getFullYear() + '-' + String(rows.length).padStart(6, '0'), seller_org_id: O[phKey].id, buyer_org_id: null, buyer_patient_id: P[pk].id, package_unit_id: u.id, package_unit_ids: [u.id], amount: price, tax_amount: +(price * TAX_RATE).toFixed(2), issued_at: iso(day + 1, 17), kind: 'retail', ref: rxId });
          total += price; tax += price * TAX_RATE;
        }
        lines.push({ item_id: it.id, drug_id: it.drug_id, prescribed: it.quantity, dispensed: ids.length, unit_ids: ids.map(u => u.id) });
      }
      if (!lines.some(l => l.dispensed)) continue;
      rx.status = mismatch ? 'partially_dispensed' : 'dispensed'; rx.dispensed_at = iso(day + 1, 17); rx.dispensed_org_id = O[phKey].id; rx.dispensed_by = Us[phUser].id;
      put('dispense_records', { prescription_id: rxId, patient_id: P[pk].id, pharmacy_org_id: O[phKey].id, pharmacist_id: Us[phUser].id, lines, total, tax: +tax.toFixed(2), needs_review: mismatch, review_status: mismatch ? 'pending' : 'not_required', dispensed_at: iso(day + 1, 17), geo: O[phKey].governorate });
      put('notifications', { user_id: Us[pk].id, type: 'dispense', message: `تم صرف أدوية باسمك من ${O[phKey].name}`, sent_at: iso(day + 1, 17), read_at: round > 0 ? iso(day + 1, 20) : null });
    }
    /* فواتير B2B للشحنات */
    for (const b of B) {
      const d = Object.values(Dr).find(x => x.id === b.drug_id);
      const shipped = units.filter(u => u.batch_id === b.id).length;
      put('invoices', { invoice_no: 'INV-B2B-' + b.batch_number, seller_org_id: b.factory_org_id, buyer_org_id: O.d1.id, package_unit_id: null, package_unit_ids: [], amount: +(d.price * 0.75 * shipped).toFixed(2), tax_amount: +(d.price * 0.75 * shipped * TAX_RATE).toFixed(2), issued_at: iso(-30), kind: 'b2b', ref: b.batch_number });
    }

    /* ---------------- حالات غش للعرض (FR-10) ---------------- */
    const dispensedU = units.filter(u => u.status === 'dispensed');
    if (dispensedU[0]) {
      const u = dispensedU[0];
      put('supply_chain_events', { package_unit_id: u.id, event_type: 'scan_verify', from_org_id: null, to_org_id: O.p3.id, event_timestamp: iso(-1, 15), geo_location: 'الإسكندرية', scanned_by_user_id: Us.ph3.id });
      put('counterfeit_alerts', { package_unit_id: u.id, alert_type: 'duplicate_scan', detected_at: iso(-1, 15), status: 'investigating', details: { serial: u.serial_number, where: 'صيدلية الرحمة — الإسكندرية', previous: 'صرف سابق' }, reporter_org_id: O.p3.id, geo: 'الإسكندرية' });
    }
    if (dispensedU[3]) {
      const u = dispensedU[3];
      put('supply_chain_events', { package_unit_id: u.id, event_type: 'scan_verify', from_org_id: null, to_org_id: null, event_timestamp: iso(-3, 12), geo_location: 'أسيوط', scanned_by_user_id: null });
      put('counterfeit_alerts', { package_unit_id: u.id, alert_type: 'geo_mismatch', detected_at: iso(-3, 12), status: 'open', details: { serial: u.serial_number, where: 'القاهرة ↔ أسيوط', locations: ['القاهرة', 'أسيوط'] }, geo: 'أسيوط' });
    }
    put('counterfeit_alerts', { package_unit_id: null, alert_type: 'invalid_signature', detected_at: iso(-6, 13), status: 'closed', details: { raw: 'DWY1|P|99999999999999|FAKE-001|271231|6220000000000|0000000000', where: 'الجيزة' }, geo: 'الجيزة', resolution: 'تم ضبط العبوات المقلدة بالتنسيق مع مباحث التموين' });

    /* ---------------- التحاليل والأشعة ---------------- */
    const lab = (pk, test, val, unit, ref, n) => put('lab_results', { patient_id: P[pk].id, lab_org_id: O.l1.id, test_type: test, result_value: val, unit, ref_range: ref, result_date: iso(n, 14), entered_by: Us.lab.id });
    lab('mohamed', 'سكر تراكمي HbA1c', '7.9', '%', '< 5.7', -20); lab('mohamed', 'وظائف كلى (كرياتينين)', '1.5', 'mg/dL', '0.7 - 1.3', -20);
    lab('sara', 'صورة دم كاملة CBC', 'Hb 11.8', 'g/dL', '12 - 15.5', -12); lab('hassan', 'سكر صائم', '142', 'mg/dL', '70 - 100', -8);
    lab('fatma', 'سيولة INR', '2.6', '', '2 - 3', -6); lab('sara', 'فيتامين د', '18', 'ng/mL', '30 - 100', -4);
    const rad = (pk, type, text, n) => put('radiology_reports', { patient_id: P[pk].id, radiology_org_id: O.r1.id, scan_type: type, report_text: text, image_ref: `dicom://pacs.r1/studies/${U.uuid().slice(0, 8)}`, report_date: iso(n, 12), entered_by: Us.rad.id });
    rad('sara', 'أشعة سينية - صدر', 'لا توجد ارتشاحات رئوية. زيادة طفيفة في العلامات الشعبية تتماشى مع الربو.', -28);
    rad('mona', 'سونار - بطن', 'الكبد والمرارة والكليتان بحجم وطبيعة طبيعية.', -14);
    rad('mohamed', 'إيكو قلب', 'كفاءة البطين الأيسر 55%. تضخم بسيط بجدار البطين الأيسر.', -22);

    /* ---------------- تأمين (نطاق مستقبلي) + إشعارات + تدقيق ---------------- */
    put('insurance_policies', { patient_id: P.mohamed.id, provider_name: 'الهيئة العامة للتأمين الصحي', policy_number: 'HIO-' + U.rand(1000000, 9999999), coverage_details: 'نطاق مستقبلي — غير مفعّل' });
    put('notifications', { user_id: Us.insp.id, type: 'alert', message: '🚨 إنذار: مسح مكرر لعبوة مصروفة — صيدلية الرحمة', sent_at: iso(-1, 15), read_at: null });
    put('notifications', { user_id: Us.insp.id, type: 'alert', message: '🚨 إنذار: مسح من موقعين مختلفين — القاهرة ↔ أسيوط', sent_at: iso(-3, 12), read_at: null });
    for (let i = 0; i < 12; i++) { const pk = U.pick(['sara', 'mohamed', 'hassan', 'youssef']); const dk = U.pick(['doc1', 'doc2']); put('audit_logs', { actor_user_id: Us[dk].id, actor_org_id: Us[dk].organization_id, action: 'view', resource_type: 'clinical_record', resource_id: P[pk].id, timestamp: iso(-U.rand(1, 25), U.rand(9, 16)), ip_address: 'web-seed', details: { patient_id: P[pk].id, load_ms: U.rand(80, 400) } }); }

    for (const u of units) delete u._drug;
    /* مخزون الصيدليات */
    for (const ph of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      const here = units.filter(u => u.current_org_id === O[ph].id && u.status === 'received');
      const g = U.groupBy(here, u => B.find(b => b.id === u.batch_id).drug_id);
      for (const [did, arr] of Object.entries(g)) put('pharmacy_inventory', { pharmacy_org_id: O[ph].id, drug_id: did, quantity_on_hand: arr.length, last_updated: U.now() });
    }
    await Store.bulk(rows, onProgress);
    return rows.length;
  },
  /** نظام فارغ: جهة إدارية + حساب مدير فقط */
  async blank(nid, name, pw) {
    const org = await Store.insert('organizations', { name: 'وزارة الصحة والسكان — إدارة المنصة', type: 'authority', governorate: 'القاهرة', geo_location: 'القاهرة', license_no: 'GOV-001' });
    await Settings.save({});
    return Domain.createUser({ national_id: nid, full_name: name, role: 'admin', organization_id: org.id }, pw);
  }
};
