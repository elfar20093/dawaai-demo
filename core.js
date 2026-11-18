/* =========================================================================
   منصة "دوائي" الوطنية — الطبقة الأساسية (Core)
   - أدوات عامة، تشفير على مستوى الحقل، توقيع QR رقمياً
   - مخزن بيانات Offline-first: نسخة محلية + مزامنة مع قاعدة بيانات مشتركة
   - سجل التدقيق Append-only، الحذف المنطقي Soft delete
   ========================================================================= */
'use strict';

/* ---------------------------- أدوات عامة ---------------------------- */
const U = {
  uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const x = [...b].map(v => v.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
  },
  now() { return new Date().toISOString(); },
  esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  fmtDate(d) { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); },
  fmtDT(d) { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); },
  fmtNum(n, dig = 0) { return (Number(n) || 0).toLocaleString('ar-EG', { maximumFractionDigits: dig, minimumFractionDigits: dig }); },
  fmtMoney(n) { return U.fmtNum(n, 2) + ' ج.م'; },
  dayKey(d) { return new Date(d).toISOString().slice(0, 10); },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 864e5); },
  age(dob) { if (!dob) return '—'; const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  groupBy(arr, f) { const m = {}; for (const x of arr) { const k = typeof f === 'function' ? f(x) : x[f]; (m[k] = m[k] || []).push(x); } return m; },
  sum(arr, f) { return arr.reduce((s, x) => s + (Number(typeof f === 'function' ? f(x) : x[f]) || 0), 0); },
  b64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); },
  unb64(s) { const r = atob(s); const b = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b; },
  hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); },
  maskNid(n) { if (!n) return '—'; const s = String(n); return s.length < 6 ? s : s.slice(0, 3) + '•'.repeat(s.length - 6) + s.slice(-3); },
  rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  csv(rows, cols) {
    const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [cols.map(c => q(c.label)).join(','), ...rows.map(r => cols.map(c => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\n');
  }
};

/* ------------------------------ ثوابت المجال ------------------------------ */
const ROLES = {
  admin: { label: 'مدير المنصة', icon: '🛡️' },
  authority: { label: 'هيئة الدواء (رقابة)', icon: '🏛️' },
  doctor: { label: 'طبيب', icon: '🩺' },
  pharmacist: { label: 'صيدلي', icon: '💊' },
  factory: { label: 'موظف مصنع', icon: '🏭' },
  distributor: { label: 'موزع', icon: '🚚' },
  lab: { label: 'أخصائي معمل', icon: '🧪' },
  radiology: { label: 'أخصائي أشعة', icon: '🩻' },
  patient: { label: 'مريض', icon: '🧑' }
};
const ORG_TYPES = {
  hospital: 'مستشفى', clinic: 'عيادة', lab: 'معمل تحاليل', radiology: 'مركز أشعة', pharmacy: 'صيدلية',
  factory: 'مصنع أدوية', distributor: 'موزع / مخزن', authority: 'جهة حكومية / رقابية'
};
const ROLE_ORG = { doctor: ['hospital', 'clinic'], pharmacist: ['pharmacy'], factory: ['factory'], distributor: ['distributor'], lab: ['lab', 'hospital'], radiology: ['radiology', 'hospital'], authority: ['authority'], admin: ['authority'], patient: [] };
const GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الدقهلية', 'الشرقية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'مطروح', 'شمال سيناء', 'جنوب سيناء', 'الوادي الجديد'];
const RESOURCES = {
  clinical_record: 'السجل الطبي', prescription: 'الروشتات', lab_result: 'نتائج التحاليل', radiology: 'تقارير الأشعة',
  dispense: 'صرف الأدوية', inventory: 'المخزون', production: 'الإنتاج والدفعات', shipment: 'الشحن والاستلام',
  surveillance: 'الرقابة والتقارير', admin: 'إدارة النظام'
};
const ACCESS_LEVELS = { read: 'قراءة', write: 'قراءة وكتابة', full: 'كامل' };
const EVENT_TYPES = { produced: 'إنتاج', shipped: 'شحن', received: 'استلام', dispensed: 'صرف للمريض', scan_verify: 'مسح تحقق', correction: 'حدث تصحيحي', recalled: 'سحب من السوق' };
const UNIT_STATUS = { produced: 'منتجة بالمصنع', in_transit: 'في الطريق', received: 'مستلمة', dispensed: 'مصروفة', recalled: 'مسحوبة' };
const ALERT_TYPES = { duplicate_scan: 'مسح مكرر لعبوة مصروفة', geo_mismatch: 'مسح من موقعين مختلفين', rx_reuse: 'إعادة استخدام روشتة', invalid_signature: 'توقيع QR غير صالح', unknown_code: 'كود غير مسجل', wrong_location: 'عبوة خارج مسارها', expired: 'عبوة منتهية الصلاحية' };
const ALERT_STATUS = { open: 'مفتوح', investigating: 'قيد التحقيق', closed: 'مغلق' };
const RX_STATUS = { issued: 'صادرة', dispensed: 'مصروفة', partially_dispensed: 'مصروفة جزئياً', superseded: 'مستبدلة بنسخة أحدث', cancelled: 'ملغاة' };
const DOSAGE_FORMS = ['أقراص', 'كبسولات', 'شراب', 'حقن', 'بخاخ', 'كريم', 'نقط', 'لبوس', 'فوار'];
const TAX_RATE = 0.14;

const ICD10 = [
  ['I10', 'ارتفاع ضغط الدم الأساسي'], ['E11', 'داء السكري من النوع الثاني'], ['E10', 'داء السكري من النوع الأول'], ['J45', 'الربو الشعبي'],
  ['J06.9', 'عدوى حادة بالجهاز التنفسي العلوي'], ['J18.9', 'التهاب رئوي'], ['J02.9', 'التهاب البلعوم الحاد'], ['J01.9', 'التهاب الجيوب الأنفية الحاد'],
  ['K21.0', 'ارتجاع المريء'], ['K25', 'قرحة المعدة'], ['K29.7', 'التهاب المعدة'], ['K59.0', 'إمساك'], ['A09', 'نزلة معوية'],
  ['N39.0', 'عدوى المسالك البولية'], ['N18', 'مرض الكلى المزمن'], ['I48', 'رجفان أذيني'], ['I25', 'مرض القلب الإقفاري المزمن'], ['I50', 'قصور القلب'],
  ['E78.5', 'ارتفاع دهون الدم'], ['E03.9', 'قصور الغدة الدرقية'], ['E66', 'السمنة'], ['D50', 'أنيميا نقص الحديد'],
  ['M54.5', 'آلام أسفل الظهر'], ['M17', 'خشونة الركبة'], ['M79.1', 'ألم عضلي'], ['G43', 'الصداع النصفي'], ['R51', 'صداع'], ['R50.9', 'حمى غير محددة'],
  ['F41.1', 'اضطراب القلق العام'], ['F32', 'نوبة اكتئابية'], ['L20', 'التهاب الجلد التأتبي'], ['H10', 'التهاب الملتحمة'],
  ['B34.9', 'عدوى فيروسية غير محددة'], ['U07.1', 'كوفيد-19'], ['K80', 'حصوات المرارة'], ['O80', 'ولادة طبيعية'], ['Z00.0', 'فحص طبي عام']
];
const LAB_TESTS = ['صورة دم كاملة CBC', 'سكر صائم', 'سكر تراكمي HbA1c', 'وظائف كلى (كرياتينين)', 'وظائف كبد (ALT)', 'دهون ثلاثية', 'كوليسترول LDL', 'هرمون الغدة TSH', 'تحليل بول كامل', 'فيتامين د', 'PCR كوفيد-19', 'سيولة INR'];
const SCAN_TYPES = ['أشعة سينية - صدر', 'أشعة مقطعية - مخ', 'رنين مغناطيسي - ركبة', 'سونار - بطن', 'أشعة مقطعية - صدر', 'إيكو قلب', 'ماموجرام', 'رنين مغناطيسي - فقرات قطنية'];

/* --------------------------- التشفير والتوقيع --------------------------- */
/* ملاحظة أمنية: في النسخة التجريبية المفاتيح مشتقة داخل التطبيق.
   في الإنتاج تُحفظ المفاتيح في HSM/KMS على الخادم ولا تصل للمتصفح أبداً. */
const Crypto = {
  _aes: null, _hmac: null, cache: new Map(),
  async init() {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode('dawaai-national-platform::pilot-key::v1'), 'PBKDF2', false, ['deriveKey']);
    this._aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('field-level-encryption'), iterations: 50000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    this._hmac = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('gs1-qr-signing'), iterations: 50000, hash: 'SHA-256' }, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
  },
  isEnc(v) { return typeof v === 'string' && v.startsWith('enc:v1:'); },
  async encrypt(plain) {
    if (plain === null || plain === undefined || plain === '') return plain;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this._aes, new TextEncoder().encode(String(plain)));
    const out = `enc:v1:${U.b64(iv)}:${U.b64(ct)}`;
    this.cache.set(out, String(plain));
    return out;
  },
  async decrypt(v) {
    if (!this.isEnc(v)) return v;
    if (this.cache.has(v)) return this.cache.get(v);
    try {
      const [, , iv, ct] = v.split(':');
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: U.unb64(iv) }, this._aes, U.unb64(ct));
      const s = new TextDecoder().decode(pt); this.cache.set(v, s); return s;
    } catch { this.cache.set(v, '⚠ تعذر فك التشفير'); return '⚠ تعذر فك التشفير'; }
  },
  /** قراءة متزامنة من ذاكرة فك التشفير (تُملأ مسبقاً) */
  dv(v) { if (!this.isEnc(v)) return v ?? ''; return this.cache.has(v) ? this.cache.get(v) : '•••'; },
  async warm(rows, fields) { const jobs = []; for (const r of rows) for (const f of fields) if (this.isEnc(r[f]) && !this.cache.has(r[f])) jobs.push(this.decrypt(r[f])); await Promise.all(jobs); },
  async sign(payload) { const s = await crypto.subtle.sign('HMAC', this._hmac, new TextEncoder().encode(payload)); return U.hex(s).slice(0, 20).toUpperCase(); },
  async hashPassword(pw, salt) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '::' + pw)); return U.hex(d); }
};

/* ------------------------ أكواد QR الموقعة (GS1) ------------------------
   صيغة العبوة:   DWY1|P|<serial 14>|<batch>|<expiry YYMMDD>|<GTIN>|<SIG>
   صيغة الروشتة:  DWY1|R|<rx id>|<version>|<patient id short>|<SIG>
   الحقول مستوحاة من عناصر GS1: (01) GTIN (21) Serial (10) Batch (17) Expiry  */
const QR = {
  async packageCode(serial, batchNo, expiry, gtin) {
    const exp = String(expiry).slice(2, 10).replace(/-/g, '');
    const body = `DWY1|P|${serial}|${batchNo}|${exp}|${gtin}`;
    return `${body}|${await Crypto.sign(body)}`;
  },
  async rxCode(rxId, version, patientId) {
    const body = `DWY1|R|${rxId}|${version}|${String(patientId).slice(0, 8)}`;
    return `${body}|${await Crypto.sign(body)}`;
  },
  parse(code) {
    const s = String(code || '').trim();
    const p = s.split('|');
    if (p[0] !== 'DWY1') {
      // دعم إدخال الرقم التسلسلي فقط (14 رقم) يدوياً
      if (/^\d{14}$/.test(s)) return { kind: 'serial', serial: s, raw: s };
      return { kind: 'unknown', raw: s };
    }
    if (p[1] === 'P' && p.length === 7) return { kind: 'package', serial: p[2], batch: p[3], expiry: p[4], gtin: p[5], sig: p[6], body: p.slice(0, 6).join('|'), raw: s };
    if (p[1] === 'R' && p.length === 6) return { kind: 'rx', rxId: p[2], version: Number(p[3]), patient: p[4], sig: p[5], body: p.slice(0, 5).join('|'), raw: s };
    return { kind: 'unknown', raw: s };
  },
  async verify(parsed) { if (!parsed.body) return false; return (await Crypto.sign(parsed.body)) === parsed.sig; },
  /** رسم QR كـ SVG (مكتبة qrcode-generator محلية) */
  svg(text, size = 160) {
    try {
      const q = qrcode(0, 'M'); q.addData(text); q.make();
      const n = q.getModuleCount(), cell = size / (n + 8); let path = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${((c + 4) * cell).toFixed(2)},${((r + 4) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
      return `<svg class="qr" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="رمز QR"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    } catch (e) { return `<div class="muted">تعذر رسم QR</div>`; }
  }
};

/* ------------------------------- المخزن ------------------------------- */
const TABLES = ['settings', 'organizations', 'users', 'permissions', 'consent_grants', 'audit_logs', 'patients', 'visits', 'diagnoses',
  'prescriptions', 'prescription_items', 'lab_results', 'radiology_reports', 'drugs', 'production_batches', 'package_units',
  'supply_chain_events', 'pharmacy_inventory', 'counterfeit_alerts', 'notifications', 'invoices', 'insurance_policies',
  'dispense_records', 'drug_interactions'];
/* جداول لا تُعدل أبداً بعد الإدخال */
const APPEND_ONLY = new Set(['audit_logs', 'supply_chain_events']);
/* جداول حساسة: أي تعديل يُسجل بالقيمة القديمة والجديدة في AuditLog */
const SENSITIVE = new Set(['patients', 'prescriptions', 'package_units', 'permissions', 'consent_grants', 'users', 'lab_results', 'radiology_reports', 'visits', 'diagnoses', 'insurance_policies']);
/* حقول مشفرة على مستوى الحقل (Critical) */
const ENC_FIELDS = { patients: ['blood_type', 'chronic_conditions'], lab_results: ['result_value'], insurance_policies: ['policy_number'] };

const Store = {
  mode: 'local',        // local | cloud
  db: null,
  t: {},                // table -> Map(id -> row)
  ready: {},            // table -> loaded from server
  pending: [],          // طابور الكتابة غير المتزامنة (Offline queue)
  listeners: new Set(),
  _chains: new Map(),
  online: navigator.onLine,
  lastSync: null,
  status: 'local',
  key(table) { return `dawaai_${this.mode}_${table}`; },
  init() { for (const t of TABLES) this.t[t] = new Map(); },
  loadLocal() {
    for (const t of TABLES) {
      this.t[t] = new Map();
      try { const raw = localStorage.getItem(this.key(t)); if (raw) for (const r of JSON.parse(raw)) this.t[t].set(r.id, r); } catch { }
    }
    try { this.pending = JSON.parse(localStorage.getItem(`dawaai_${this.mode}__pending`) || '[]'); } catch { this.pending = []; }
  },
  _saveLocal: {},
  saveLocal(table) {
    if (!this._saveLocal[table]) this._saveLocal[table] = U.debounce(() => {
      try { localStorage.setItem(this.key(table), JSON.stringify([...this.t[table].values()])); } catch { }
    }, 250);
    this._saveLocal[table]();
  },
  savePending() { try { localStorage.setItem(`dawaai_${this.mode}__pending`, JSON.stringify(this.pending)); } catch { } },
  onChange(fn) { this.listeners.add(fn); },
  _emit: null,
  emit(table) { if (!this._emit) this._emit = U.debounce(() => this.listeners.forEach(f => f()), 120); this._emit(table); },

  /* ------------------------ قراءة ------------------------ */
  all(table, withDeleted = false) { const m = this.t[table]; if (!m) return []; const a = [...m.values()]; return withDeleted ? a : a.filter(r => !r.deleted_at); },
  get(table, id) { const r = this.t[table]?.get(id); return r && !r.deleted_at ? r : null; },
  getAny(table, id) { return this.t[table]?.get(id) || null; },
  where(table, pred) { return this.all(table).filter(pred); },
  find(table, pred) { return this.all(table).find(pred) || null; },
  count(table) { return this.all(table).length; },
  isEmpty() { return this.all('users', true).length === 0; },

  /* ------------------------ كتابة ------------------------ */
  async insert(table, row, opts = {}) {
    row = { id: row.id || U.uuid(), created_at: row.created_at || U.now(), ...row };
    row = await this._encrypt(table, row);
    await this._write(table, row);
    if (!opts.noAudit && SENSITIVE.has(table)) Audit.log('create', table, row.id, null, row);
    return row;
  },
  async update(table, id, patch, opts = {}) {
    if (APPEND_ONLY.has(table)) throw new Error('هذا الجدول Append-only ولا يقبل التعديل');
    const old = this.getAny(table, id); if (!old) throw new Error('السجل غير موجود');
    let row = { ...old, ...patch, updated_at: U.now() };
    row = await this._encrypt(table, row);
    await this._write(table, row);
    if (!opts.noAudit && SENSITIVE.has(table)) Audit.log(opts.action || 'update', table, id, old, row);
    return row;
  },
  /** حذف منطقي فقط — لا يوجد حذف فعلي للسجلات الطبية أو سجلات التتبع */
  async softDelete(table, id) {
    if (APPEND_ONLY.has(table)) throw new Error('لا يمكن حذف سجلات Append-only');
    return this.update(table, id, { deleted_at: U.now() }, { action: 'soft_delete' });
  },
  async _encrypt(table, row) {
    const f = ENC_FIELDS[table]; if (!f) return row;
    const r = { ...row };
    for (const k of f) if (r[k] !== undefined && r[k] !== null && r[k] !== '' && !Crypto.isEnc(r[k])) r[k] = await Crypto.encrypt(r[k]);
    return r;
  },
  async _write(table, row) {
    this.t[table].set(row.id, row);
    this.saveLocal(table);
    this.emit(table);
    if (this.mode === 'cloud' && this.db) this._push(table, row);
  },
  /** كتابة واحدة في كل مرة لكل مستند (تسلسل لكل وثيقة) */
  _push(table, row) {
    const k = table + '/' + row.id;
    const prev = this._chains.get(k) || Promise.resolve();
    const p = prev.then(() => this._send(table, row)).catch(() => { });
    this._chains.set(k, p);
    p.finally(() => { if (this._chains.get(k) === p) this._chains.delete(k); });
    return p;
  },
  async _send(table, row, attempt = 0) {
    try {
      await this.db.collection('dw_' + table).doc(row.id).set(JSON.parse(JSON.stringify(row)));
      this.lastSync = U.now(); this._setStatus('cloud');
    } catch (e) {
      const code = e && e.code;
      if ((code === 'unavailable' || code === 'resource_exhausted') && attempt < 3) { await U.sleep((500 + Math.random() * 500) * Math.pow(2, attempt)); return this._send(table, row, attempt + 1); }
      if (code === 'quota_exceeded') { UI.toast('تم بلوغ الحد الأقصى لحجم قاعدة البيانات المشتركة — صدّر نسخة احتياطية وأرشف السجلات القديمة', 'err'); }
      if (code === 'invalid_argument' && !this._roWarned) { this._roWarned = true; UI.toast('حسابك على المنصة لا يملك صلاحية الكتابة في قاعدة البيانات المشتركة (اطلب صلاحية Contributor)', 'err'); return; }
      // اتصال غير متاح: أضف للطابور للمزامنة لاحقاً (Offline-first)
      this.pending = this.pending.filter(p => !(p.table === table && p.id === row.id));
      this.pending.push({ table, id: row.id });
      this.savePending(); this._setStatus('offline');
    }
  },
  async flushPending() {
    if (this.mode !== 'cloud' || !this.db || !this.pending.length) return;
    const q = [...this.pending]; this.pending = []; this.savePending();
    for (const p of q) { const row = this.getAny(p.table, p.id); if (row) { await this._push(p.table, row); await U.sleep(60); } }
  },
  _setStatus(s) { if (this.status !== s) { this.status = s; UI.syncBadge?.(); } },

  /* ------------------------ الاتصال بقاعدة البيانات المشتركة ------------------------ */
  async connectCloud() {
    if (!window.claude || typeof window.claude.use !== 'function') return false;
    let db = null;
    try { db = await Promise.race([window.claude.use('db'), U.sleep(10000).then(() => null)]); } catch { db = null; }
    if (!db) return false;
    this.db = db; this.mode = 'cloud';
    this.loadLocal(); // نسخة الكاش المحلية للوضع المشترك (للعمل دون اتصال)
    this.status = 'syncing';
    const total = TABLES.length; let loaded = 0;
    await new Promise(resolve => {
      const timer = setTimeout(() => { this._setStatus(this.pending.length ? 'offline' : 'stale'); resolve(); }, 10000);
      for (const t of TABLES) {
        this.db.collection('dw_' + t).onSnapshot(snap => {
          if (this.mode !== 'cloud') return; // وضع العرض: لا نخلط البيانات المشتركة بالنسخة الخاصة
          const m = new Map();
          for (const d of snap.docs) { const v = d.data(); if (v) m.set(d.id, { ...v }); }
          // لا نفقد كتابات محلية معلقة لم تصل بعد
          for (const p of this.pending) if (p.table === t && this.t[t].has(p.id)) m.set(p.id, this.t[t].get(p.id));
          this.t[t] = m; this.saveLocal(t);
          if (!snap.metadata.fromCache && !this.ready[t]) { this.ready[t] = true; loaded++; if (loaded === total) { clearTimeout(timer); this.lastSync = U.now(); this._setStatus('cloud'); resolve(); } }
          this.emit(t);
        }, err => { this._setStatus('offline'); console.warn('db', t, err && err.code); });
      }
    });
    this.flushPending();
    setInterval(() => this.flushPending(), 20000);
    return true;
  },

  /* ------------------------ نسخ احتياطي ------------------------ */
  exportJSON() { const o = { platform: 'dawaai', version: 1, exported_at: U.now(), tables: {} }; for (const t of TABLES) o.tables[t] = this.all(t, true); return JSON.stringify(o); },
  async importJSON(txt, onProgress) {
    const o = JSON.parse(txt); if (o.platform !== 'dawaai') throw new Error('الملف ليس نسخة احتياطية لمنصة دوائي');
    const rows = []; for (const t of TABLES) for (const r of (o.tables[t] || [])) rows.push([t, r]);
    let i = 0;
    for (const [t, r] of rows) { await this._write(t, r); if (this.mode === 'cloud') await U.sleep(15); if (++i % 25 === 0) onProgress?.(i, rows.length); }
    return rows.length;
  },
  async bulk(rows, onProgress) {
    // rows: [table,row][] — للتحميل المبدئي
    let i = 0;
    const batch = 8;
    for (let k = 0; k < rows.length; k += batch) {
      const part = rows.slice(k, k + batch);
      const ps = [];
      for (const [t, r] of part) {
        const row = await this._encrypt(t, r);
        this.t[t].set(row.id, row);
        if (this.mode === 'cloud' && this.db) ps.push(this._push(t, row));
      }
      await Promise.all(ps);
      if (this.mode === 'cloud') await U.sleep(40);
      i += part.length; onProgress?.(i, rows.length);
    }
    for (const t of TABLES) this.saveLocal(t);
    this.emit();
  }
};

/* ------------------------------ التدقيق ------------------------------ */
const Audit = {
  _strip(r) { if (!r) return null; const o = {}; for (const [k, v] of Object.entries(r)) { if (k === 'password_hash' || k === 'salt') continue; o[k] = typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : v; } return o; },
  log(action, resource_type, resource_id, oldV, newV, details) {
    const u = Auth.user;
    const diff = {};
    if (oldV && newV) { for (const k of Object.keys(newV)) if (k !== 'updated_at' && JSON.stringify(oldV[k]) !== JSON.stringify(newV[k])) diff[k] = { from: Audit._strip(oldV)[k] ?? null, to: Audit._strip(newV)[k] ?? null }; }
    const row = {
      id: U.uuid(), actor_user_id: u ? u.id : null, actor_org_id: u ? u.organization_id || null : null, action, resource_type, resource_id,
      timestamp: U.now(), ip_address: Auth.clientIp, details: details || null,
      changes: oldV ? diff : null, snapshot: !oldV && newV ? Audit._strip(newV) : null
    };
    Store._write('audit_logs', row);
    return row;
  },
  /** تسجيل اطلاع على بيانات مريض (FR-03) */
  view(patientId, resource, extra) { return this.log('view', resource, patientId, null, null, { patient_id: patientId, ...extra }); }
};

/* --------------------------- الهوية والصلاحيات --------------------------- */
const Auth = {
  user: null,
  clientIp: 'web-' + Math.random().toString(16).slice(2, 8),
  org() { return this.user && this.user.organization_id ? Store.get('organizations', this.user.organization_id) : null; },
  role() { return this.user ? this.user.role : null; },
  is(...roles) { return this.user && roles.includes(this.user.role); },
  async login(nid, pw) {
    const u = Store.find('users', x => x.national_id === String(nid).trim());
    if (!u) throw new Error('رقم قومي غير مسجل');
    if (u.active === false) throw new Error('الحساب موقوف');
    const h = await Crypto.hashPassword(pw, u.salt);
    if (h !== u.password_hash) { Audit.log('login_failed', 'users', u.id, null, null, { national_id: U.maskNid(nid) }); throw new Error('كلمة المرور غير صحيحة'); }
    return u;
  },
  start(u) {
    this.user = u;
    try { sessionStorage.setItem('dawaai_session', u.id); } catch { }
    Audit.log('login', 'users', u.id);
  },
  logout() { if (this.user) Audit.log('logout', 'users', this.user.id); this.user = null; try { sessionStorage.removeItem('dawaai_session'); } catch { } },
  restore() { try { const id = sessionStorage.getItem('dawaai_session'); if (id) { const u = Store.get('users', id); if (u) this.user = u; } } catch { } },
  mfaRequired(u) { const s = Settings.get(); return s.mfa_enabled && (s.mfa_roles || []).includes(u.role); },

  /** صلاحيات RBAC الافتراضية حسب الدور */
  defaults: {
    admin: { '*': 'full' },
    authority: { surveillance: 'full', production: 'read', shipment: 'read', inventory: 'read', dispense: 'read' },
    doctor: { clinical_record: 'write', prescription: 'write', lab_result: 'read', radiology: 'read' },
    pharmacist: { dispense: 'write', inventory: 'write', shipment: 'write', prescription: 'read' },
    factory: { production: 'write', shipment: 'write', inventory: 'read' },
    distributor: { shipment: 'write', inventory: 'write' },
    lab: { lab_result: 'write' },
    radiology: { radiology: 'write' },
    patient: {}
  },
  /** ABAC: الدور + جدول Permission (منح/سحب صريح داخل الجهة) */
  can(resource, level = 'read') {
    const u = this.user; if (!u) return false;
    const rank = { read: 1, write: 2, full: 3 };
    const explicit = Store.where('permissions', p => p.user_id === u.id && p.resource_type === resource && (!u.organization_id || p.organization_id === u.organization_id));
    const active = explicit.filter(p => !p.revoked_at);
    if (explicit.length && !active.length) return false; // صلاحية مسحوبة صراحة
    const best = Math.max(0, ...active.map(p => rank[p.access_level] || 0));
    const d = this.defaults[u.role] || {};
    const def = rank[d['*'] || d[resource]] || 0;
    return Math.max(best, def) >= rank[level];
  },
  /** BR-02: لا اطلاع على السجل الطبي دون موافقة صريحة سارية، إلا في الطوارئ المصنفة */
  consentFor(patientUserId, orgId) {
    return Store.find('consent_grants', c => c.patient_id === patientUserId && c.organization_id === orgId && !c.revoked_at);
  },
  emergency: new Map(), // patientUserId -> {reason, at}
  canViewPatient(patientUserId, scope = 'full_record') {
    const u = this.user; if (!u) return { ok: false };
    if (u.role === 'patient') return { ok: u.id === patientUserId, why: 'self' };
    if (u.role === 'admin') return { ok: false, why: 'admin_no_clinical' };
    if (!['doctor', 'lab', 'radiology', 'pharmacist'].includes(u.role)) return { ok: false, why: 'role' };
    const c = this.consentFor(patientUserId, u.organization_id);
    if (c && (c.scope === 'full_record' || c.scope === scope || scope === 'basic')) return { ok: true, why: 'consent', consent: c };
    const e = this.emergency.get(patientUserId);
    if (e && Date.now() - e.at < 4 * 3600e3) return { ok: true, why: 'emergency' };
    return { ok: false, why: 'no_consent' };
  }
};

/* ------------------------------- الإعدادات ------------------------------- */
const Settings = {
  defaults: { id: 'main', platform_name: 'منصة دوائي الوطنية', mfa_enabled: true, mfa_roles: ['admin', 'authority'], expiry_warning_days: 90, low_stock_threshold: 10, geo_window_hours: 24, tax_rate: TAX_RATE, pilot_region: 'القاهرة الكبرى والدلتا' },
  get() { return { ...this.defaults, ...(Store.get('settings', 'main') || {}) }; },
  async save(patch) { const cur = Store.get('settings', 'main'); if (cur) await Store.update('settings', 'main', patch); else await Store.insert('settings', { ...this.defaults, ...patch, id: 'main' }); }
};

/* ------------------------------ الإشعارات ------------------------------ */
const Notify = {
  async send(userId, type, message, ref) {
    if (!userId) return;
    await Store.insert('notifications', { user_id: userId, type, message, ref: ref || null, sent_at: U.now(), read_at: null, channel: 'in_app' });
  },
  async toRole(role, type, message, ref) { for (const u of Store.where('users', x => x.role === role && x.active !== false)) await this.send(u.id, type, message, ref); },
  async toOrg(orgId, type, message, ref) { for (const u of Store.where('users', x => x.organization_id === orgId && x.active !== false)) await this.send(u.id, type, message, ref); },
  unread() { return Auth.user ? Store.where('notifications', n => n.user_id === Auth.user.id && !n.read_at) : []; }
};

/* ------------------------- قياسات الأداء (NFR/KPIs) ------------------------- */
const Metrics = {
  scanTimes: [], recordTimes: [],
  async timeIt(kind, fn) { const t0 = performance.now(); const r = await fn(); const ms = performance.now() - t0; (kind === 'scan' ? this.scanTimes : this.recordTimes).push(ms); return { r, ms }; }
};
