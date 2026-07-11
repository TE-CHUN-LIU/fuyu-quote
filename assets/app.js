// 富寓室內裝潢公司報價單 ── Alpine.js 邏輯
// 全部資料用 localStorage 自動暫存，瀏覽器關掉也不掉

const STORAGE_KEY = 'fuyu-quote-v1';

// === 雲端（MMT 共用的 Supabase；Supabase Auth 登入 + RLS 依公司隔離） ===
const SUPA_URL = 'https://ulaumiqgrazbpdpykgsw.supabase.co';
const SUPA_KEY = 'sb_publishable_hqupVgCRCxuMKb6UJXLglg_cEB-rifP';
let supaClient = null; // 模組層持有，不放進 Alpine 反應式 state
let supaAuthUnsubscribe = null;

function quoteApp() {
  return {
    // === State ===
    project: {
      name: '',
      quoteNo: '',
      location: '',
      contact: '',
      material: '',
      date: new Date().toISOString().slice(0, 10),
    },
    customer: {
      name: '',
      contact: '',
      phone: '',
      fax: '',
      taxId: '',
      invoiceTitle: '',
      address: '',
    },
    items: [],
    bankChoice: 'cathay', // 'cathay' 或 'yuanta'
    needInvoice: false,
    contractorMarkup: {
      enabled: false,
      mode: 'percent', // percent 或 fixed
      value: 0,
    },
    // 請款分期（可自由增減；金額依總價與百分比自動算，最後一期補足尾差）
    payments: [
      { label: '進場', percent: 30 },
      { label: '工程進度', percent: 40 },
      { label: '完工', percent: 30 },
    ],
    // 追加項目（加項）：名稱＋金額，直接加進總價
    extras: [],
    // 違約金條款（可選）：填完工期限＋每日罰款%，自動生條款並算每日金額
    penalty: { enabled: false, date: '', percentPerDay: 1 },
    importState: {
      busy: false,
      lastSource: '',
    },
    isLocked: false,
    // 雲端狀態（Supabase Auth 登入制）
    cloud: {
      ready: false,
      authChecked: false, // 是否已確認登入狀態（避免一進來閃登入頁）
      user: null,      // 已登入的 Supabase 使用者；null = 未登入
      email: '',       // 顯示用 email
      orgId: null,     // 所屬公司 id（登入後由 fuyu_ensure_org 取得）
      role: '',        // 在該公司的角色
      isAdmin: false,  // 是否平台超級管理員（跨公司）
      list: [],
      showPanel: false,
      currentId: null, // 目前畫面對應的雲端筆 id；null = 尚未存雲端／新報價單
      busy: false,
      search: '', // 雲端清單搜尋（案場／客戶）
      // 登入頁 / 帳號管理
      showLogin: false,
      showAccount: false,
      loginEmail: '',
      loginPass: '',
      loginErr: '',
      loginBusy: false,
    },
    // 平台訂閱管理中控台（只有平台超管用）
    admin: {
      show: false, loading: false, msg: '', search: '',
      list: [], editingId: null,
      nc: { email: '', pass: '77889456', name: '' }, // 新增公司表單
    },
    groupMode: 'category', // 'category' 依工程分類 / 'floor' 依樓層分類
    floorFilter: '全部',    // '全部' 或某一樓層（只篩選檢視，不影響總計）
    addForm: {
      category: '木工',
      itemName: '',
      floor: '1F',
    },
    // 欄位定義（顯示/隱藏 + 寬度，順序固定）
    colDefs: [
      { key: 'idx', label: '項次' },
      { key: 'floor', label: '樓層' },
      { key: 'name', label: '項目及說明' },
      { key: 'spec', label: '規格/尺寸' },
      { key: 'unit', label: '單位' },
      { key: 'qty', label: '數量' },
      { key: 'price', label: '單價' },
      { key: 'subtotal', label: '總價' },
      { key: 'note', label: '備註' },
    ],
    cols: {
      idx: { show: true, w: 42 },
      floor: { show: true, w: 58 },
      name: { show: true, w: 150 },
      spec: { show: true, w: 120 },
      unit: { show: true, w: 52 },
      qty: { show: true, w: 56 },
      price: { show: true, w: 78 },
      subtotal: { show: true, w: 92 },
      note: { show: true, w: 200 },
    },

    // === Data Sources ===
    library: ITEM_LIBRARY,
    floorOptions: FLOOR_OPTIONS,
    unitOptions: UNIT_OPTIONS,
    company: COMPANY_INFO,
    terms: [...DEFAULT_TERMS],
    warranty: { included: [...DEFAULT_WARRANTY.included], excluded: [...DEFAULT_WARRANTY.excluded] },
    platform: PLATFORM_INFO,

    get categories() {
      return [...new Set(this.library.map(i => i.category))];
    },
    get filteredItems() {
      return this.library.filter(i => i.category === this.addForm.category);
    },
    get itemsByCategory() {
      const grouped = {};
      for (const item of this.items) {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
      }
      return grouped;
    },
    // 樓層篩選後的項目（只影響表格檢視，總計仍以全部項目計算）
    get visibleItems() {
      if (this.floorFilter === '全部') return this.items;
      return this.items.filter(i => i.floor === this.floorFilter);
    },
    // 依目前選擇的分組方式（工程 / 樓層）整理出區塊，並照固定順序排序
    get groups() {
      const map = {};
      for (const item of this.visibleItems) {
        const key = this.groupMode === 'floor' ? item.floor : item.category;
        if (!map[key]) map[key] = [];
        map[key].push(item);
      }
      const orderRef = this.groupMode === 'floor' ? this.floorOptions : this.categories;
      const keys = Object.keys(map).sort((a, b) => {
        const ia = orderRef.indexOf(a), ib = orderRef.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      return keys.map(key => {
        const list = map[key];
        const subtotal = list.reduce((s, it) => s + this.quoteSubtotal(it), 0);
        const label = this.groupMode === 'floor' ? `${key} 樓層` : `${key} 工程`;
        return { key, label, items: list, subtotal };
      });
    },
    // 連續項次編號（依目前分組顯示順序，1, 2, 3…）：id -> 序號
    get seqMap() {
      const map = {};
      let n = 0;
      for (const g of this.groups) for (const it of g.items) map[it.id] = ++n;
      return map;
    },
    get grandTotal() {
      return this.items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
    },
    get categorySubtotals() {
      const totals = {};
      for (const item of this.items) {
        const sub = this.quoteSubtotal(item);
        totals[item.category] = (totals[item.category] || 0) + sub;
      }
      return totals;
    },
    get quoteGrandTotal() {
      return this.items.reduce((sum, item) => sum + this.quoteSubtotal(item), 0);
    },
    get markupAmount() {
      if (!this.contractorMarkup.enabled) return 0;
      const value = Math.max(0, Number(this.contractorMarkup.value) || 0);
      if (this.contractorMarkup.mode === 'fixed') return value;
      return Math.round(this.grandTotal * value / 100);
    },
    get extrasTotal() {
      return (this.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    },
    get tax() {
      return this.needInvoice ? Math.round((this.quoteGrandTotal + this.extrasTotal) * 0.05) : 0;
    },
    get finalTotal() {
      return this.quoteGrandTotal + this.extrasTotal + this.tax;
    },
    // 依請款分期設定計算各期金額；最後一期補足尾差，確保加總＝總價
    get paymentRows() {
      const t = this.finalTotal;
      const rows = (this.payments && this.payments.length) ? this.payments : [{ label: '全額', percent: 100 }];
      let acc = 0;
      return rows.map((p, i) => {
        let amt;
        if (i === rows.length - 1) { amt = t - acc; }
        else { amt = Math.round(t * (Number(p.percent) || 0) / 100); acc += amt; }
        return { label: p.label || `請款${i + 1}`, percent: Number(p.percent) || 0, amount: amt };
      });
    },
    // 違約金：每日罰款金額（總價 × 每日%）
    get penaltyPerDay() {
      if (!this.penalty || !this.penalty.enabled) return 0;
      return Math.round(this.finalTotal * (Number(this.penalty.percentPerDay) || 0) / 100);
    },
    // 違約金自動條款文字
    get penaltyText() {
      if (!this.penalty || !this.penalty.enabled) return '';
      const d = this.penalty.date ? this.penalty.date.replace(/-/g, '/') : '約定完工日';
      const pct = Number(this.penalty.percentPerDay) || 0;
      return `如未於 ${d} 前如期完工，自逾期之日起，每延遲一日按總款項 ${pct}%（約 $${this.formatMoney(this.penaltyPerDay)}／日）計罰，並自尾款中扣抵。`;
    },
    // 顯示用條款＝自訂條款（＋啟用時的違約金條款）
    get displayTerms() {
      const t = [...(this.terms || [])];
      if (this.penalty && this.penalty.enabled) t.push(this.penaltyText);
      return t;
    },
    get currentBank() {
      return this.company.banks[this.bankChoice];
    },

    // === Methods ===
    init() {
      this.load();
      // 自動暫存（每次 state 變動）
      this.$watch('project', () => this.save(), { deep: true });
      this.$watch('customer', () => this.save(), { deep: true });
      this.$watch('items', () => this.save(), { deep: true });
      this.$watch('bankChoice', () => this.save());
      this.$watch('needInvoice', () => this.save());
      this.$watch('contractorMarkup', () => this.save(), { deep: true });
      this.$watch('payments', () => this.save(), { deep: true });
      this.$watch('extras', () => this.save(), { deep: true });
      this.$watch('penalty', () => this.save(), { deep: true });
      this.$watch('terms', () => this.save(), { deep: true });
      this.$watch('warranty', () => this.save(), { deep: true });
      this.$watch('groupMode', () => this.save());
      this.$watch('floorFilter', () => this.save());
      this.$watch('cols', () => this.save(), { deep: true });
      this.cloudInit();
    },

    // === 雲端報價單 ===
    // 依搜尋字串篩選雲端清單（比對案場/工程名稱與客戶名稱）
    get cloudFiltered() {
      const q = (this.cloud.search || '').trim().toLowerCase();
      if (!q) return this.cloud.list;
      return this.cloud.list.filter(r =>
        ((r.project_name || '') + ' ' + (r.customer_name || '')).toLowerCase().includes(q)
      );
    },

    cloudInit() {
      try {
        if (!window.supabase || !SUPA_URL) { this.cloud.authChecked = true; return; }
        if (!supaClient) {
          supaClient = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
          });
        }
        this.cloud.ready = true;
        // 還原既有登入 + 監聽登入狀態變化（magic link 點回來時觸發）
        supaClient.auth.getSession().then(({ data }) => {
          this._applySession(data.session);
          this.cloud.authChecked = true;
        });
        supaAuthUnsubscribe?.unsubscribe?.();
        const { data: authListener } = supaClient.auth.onAuthStateChange((_e, session) => {
          this._applySession(session);
          this.cloud.authChecked = true;
        });
        supaAuthUnsubscribe = authListener?.subscription || null;
      } catch (e) {
        console.error('雲端初始化失敗', e);
        this.cloud.authChecked = true;
      }
    },

    _applySession(session) {
      const user = session?.user || null;
      this.cloud.user = user;
      this.cloud.email = user?.email || '';
      if (user) {
        this._loadOrg();
      } else {
        this.cloud.orgId = null;
        this.cloud.role = '';
        this.cloud.isAdmin = false;
        this.cloud.list = [];
      }
    },

    // 開啟家群品牌登入頁
    cloudLogin() {
      if (!this.cloud.ready) { alert('雲端尚未啟用'); return; }
      this.cloud.loginErr = '';
      this.cloud.loginPass = '';
      this.cloud.showLogin = true;
    },

    closeLogin() {
      this.cloud.showLogin = false;
      this.cloud.loginErr = '';
      this.cloud.loginPass = '';
    },

    // 帳密登入（管理員 / 一般使用者）
    async doLogin() {
      const email = (this.cloud.loginEmail || '').trim();
      if (!email) { this.cloud.loginErr = '請輸入 Email'; return; }
      if (!this.cloud.loginPass) { this.cloud.loginErr = '請輸入密碼，或改用下方「寄登入連結」'; return; }
      this.cloud.loginBusy = true;
      this.cloud.loginErr = '';
      try {
        const { error } = await supaClient.auth.signInWithPassword({ email, password: this.cloud.loginPass });
        if (error) throw error;
        this.closeLogin();
      } catch (e) {
        this.cloud.loginErr = this._loginErrMsg(e);
      } finally {
        this.cloud.loginBusy = false;
      }
    },

    // 改用 Email 寄登入連結（免密碼）
    async sendMagicLink() {
      const email = (this.cloud.loginEmail || '').trim();
      if (!email) { this.cloud.loginErr = '請先輸入 Email'; return; }
      this.cloud.loginBusy = true;
      this.cloud.loginErr = '';
      try {
        const { error } = await supaClient.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.href.split('#')[0] },
        });
        if (error) throw error;
        alert('登入連結已寄到 ' + email + '，點信裡的連結就會自動登入回到這頁。');
        this.closeLogin();
      } catch (e) {
        this.cloud.loginErr = this._loginErrMsg(e);
      } finally {
        this.cloud.loginBusy = false;
      }
    },

    _loginErrMsg(e) {
      const msg = (e && e.message) || '';
      if (/Invalid login|invalid_credentials/i.test(msg)) return '帳號或密碼錯誤';
      if (/Email not confirmed/i.test(msg)) return '這個帳號的 Email 還沒驗證';
      if (/rate limit|too many/i.test(msg)) return '嘗試太頻繁，請稍後再試';
      return msg || '登入失敗';
    },

    openAccount() { this.cloud.showAccount = true; },
    closeAccount() { this.cloud.showAccount = false; },

    roleLabel() {
      if (this.cloud.isAdmin) return '超級管理員（跨公司）';
      if (this.cloud.role === 'owner') return '管理員（公司負責人）';
      if (this.cloud.role === 'editor') return '編輯者';
      if (this.cloud.role === 'viewer') return '檢視者';
      return '使用者';
    },

    async cloudLogout() {
      if (!supaClient) return;
      await supaClient.auth.signOut();
      this.cloud.showPanel = false;
      this.cloud.showAccount = false;
      this.cloud.currentId = null;
    },

    // 取得（必要時建立）所屬公司，並判斷是否平台超級管理員
    async _loadOrg() {
      try {
        const { data: orgId, error } = await supaClient.rpc('fuyu_ensure_org');
        if (error) throw error;
        this.cloud.orgId = orgId || null;
        const { data: adminRow } = await supaClient.rpc('fuyu_is_platform_admin');
        this.cloud.isAdmin = !!adminRow;
        this.cloud.role = this.cloud.isAdmin ? 'admin' : 'owner';
        // 多租戶：載入本公司抬頭＋訂閱狀態；沒設定就沿用富寓預設
        const { data: org } = await supaClient.rpc('fuyu_my_org');
        if (org) {
          this.cloud.orgName = org.name || '';
          this.cloud.subStatus = org.sub_status || 'active';
          this.cloud.subEnd = org.sub_end || null;
          this.cloud.orgActive = org.active !== false;
          if (org.company_info && org.company_info.name) {
            this.company = {
              ...COMPANY_INFO, ...org.company_info,
              banks: { ...COMPANY_INFO.banks, ...(org.company_info.banks || {}) },
            };
          }
        }
      } catch (e) {
        console.error('讀取公司資料失敗', e);
      }
    },

    // === 平台訂閱管理中控台（僅平台超管）===
    get adminFiltered() {
      const q = (this.admin.search || '').trim().toLowerCase();
      if (!q) return this.admin.list;
      return this.admin.list.filter(o =>
        (o.name || '').toLowerCase().includes(q) ||
        (o.company_name || '').toLowerCase().includes(q) ||
        (o.email || '').toLowerCase().includes(q) ||
        String(o.tax_id || '').includes(q));
    },
    subLabel(s) {
      return { active: '使用中', trialing: '試用中', past_due: '逾期', canceled: '已停用', incomplete: '未完成' }[s] || (s || '—');
    },
    async openAdmin() {
      if (!this.cloud.isAdmin) { alert('僅平台超管可用'); return; }
      this.admin.show = true;
      await this.adminLoad();
    },
    async adminLoad() {
      this.admin.loading = true; this.admin.msg = '';
      try {
        const { data, error } = await supaClient.rpc('fuyu_admin_list_orgs');
        if (error) throw error;
        this.admin.list = data || [];
      } catch (e) { this.admin.msg = '載入失敗：' + (e.message || e); }
      finally { this.admin.loading = false; }
    },
    async adminCreate() {
      const nc = this.admin.nc;
      if (!nc.email || !nc.pass || !nc.name) { alert('請填 email、密碼、公司名稱'); return; }
      this.admin.loading = true; this.admin.msg = '';
      try {
        const { error } = await supaClient.rpc('fuyu_admin_create_company', {
          p_email: nc.email.trim(), p_password: nc.pass, p_name: nc.name.trim(),
          p_company_info: { name: nc.name.trim() },
        });
        if (error) throw error;
        this.admin.msg = '✅ 已建立「' + nc.name + '」，帳號：' + nc.email + '（密碼 ' + nc.pass + '）';
        this.admin.nc = { email: '', pass: '77889456', name: '' };
        await this.adminLoad();
      } catch (e) {
        this.admin.msg = String(e.message || e).includes('email_exists') ? '❌ 這個 email 已被使用' : ('❌ 建立失敗：' + (e.message || e));
      } finally { this.admin.loading = false; }
    },
    async adminSetSub(o, status) {
      try {
        const { error } = await supaClient.rpc('fuyu_admin_set_subscription', {
          p_org: o.org_id, p_status: status, p_plan: o.plan || 'free',
          p_end: o._end ? o._end : (o.period_end || null),
        });
        if (error) throw error;
        await this.adminLoad();
      } catch (e) { alert('更新訂閱失敗：' + (e.message || e)); }
    },
    async adminSaveSub(o) { await this.adminSetSub(o, o.sub_status || 'active'); this.admin.msg = '✅ 已更新訂閱'; },
    adminEdit(o) {
      if (this.admin.editingId === o.org_id) { this.admin.editingId = null; return; }
      if (!o.company_info) o.company_info = {};
      const c = o.company_info;
      if (!c.banks) c.banks = {};
      if (!c.banks.cathay) c.banks.cathay = {};
      if (!c.banks.yuanta) c.banks.yuanta = {};
      o._end = o.period_end ? String(o.period_end).slice(0, 10) : '';
      this.admin.editingId = o.org_id;
    },
    async adminSaveOrg(o) {
      try {
        const { error } = await supaClient.rpc('fuyu_admin_update_org', {
          p_org: o.org_id, p_name: (o.company_info && o.company_info.name) || o.name || '',
          p_company_info: o.company_info || {},
        });
        if (error) throw error;
        this.admin.editingId = null;
        this.admin.msg = '✅ 已儲存抬頭';
        await this.adminLoad();
      } catch (e) { alert('儲存抬頭失敗：' + (e.message || e)); }
    },

    _collectData() {
      return {
        project: this.project,
        customer: this.customer,
        items: this.items,
        bankChoice: this.bankChoice,
        needInvoice: this.needInvoice,
        contractorMarkup: this.contractorMarkup,
        payments: this.payments,
        extras: this.extras,
        penalty: this.penalty,
        terms: this.terms,
        warranty: this.warranty,
        groupMode: this.groupMode,
        floorFilter: this.floorFilter,
        cols: this.cols,
      };
    },

    _applyData(data) {
      Object.assign(this.project, data.project || {});
      Object.assign(this.customer, data.customer || {});
      this.items = data.items || [];
      this.bankChoice = data.bankChoice || 'cathay';
      this.needInvoice = !!data.needInvoice;
      Object.assign(this.contractorMarkup, data.contractorMarkup || {});
      this.contractorMarkup.enabled = !!this.contractorMarkup.enabled;
      if (!['percent', 'fixed'].includes(this.contractorMarkup.mode)) this.contractorMarkup.mode = 'percent';
      if (Array.isArray(data.payments) && data.payments.length) this.payments = data.payments;
      if (Array.isArray(data.extras)) this.extras = data.extras;
      if (data.penalty) Object.assign(this.penalty, data.penalty);
      if (Array.isArray(data.terms)) this.terms = data.terms;
      if (data.warranty) {
        if (Array.isArray(data.warranty.included)) this.warranty.included = data.warranty.included;
        if (Array.isArray(data.warranty.excluded)) this.warranty.excluded = data.warranty.excluded;
      }
      this.groupMode = data.groupMode || 'category';
      this.floorFilter = data.floorFilter || '全部';
      if (data.cols) {
        for (const k of Object.keys(this.cols)) {
          if (data.cols[k]) Object.assign(this.cols[k], data.cols[k]);
        }
      }
    },

    async cloudSave() {
      if (!this.cloud.ready) { alert('雲端尚未啟用'); return; }
      if (!this.cloud.user) { await this.cloudLogin(); return; }
      if (!this.cloud.orgId) { alert('找不到你的公司資料，請重新登入'); return; }
      this.cloud.busy = true;
      try {
        const payload = {
          customer_name: this.customer.name || '未命名',
          project_name: this.project.name || '',
          data: this._collectData(),
          updated_at: new Date().toISOString(),
        };
        let res;
        if (this.cloud.currentId) {
          res = await supaClient.from('quotes').update(payload)
            .eq('id', this.cloud.currentId).select('id').single();
        } else {
          payload.organization_id = this.cloud.orgId;
          payload.created_by = this.cloud.user.id;
          res = await supaClient.from('quotes').insert(payload).select('id').single();
        }
        if (res.error) throw res.error;
        this.cloud.currentId = res.data.id;
        alert('已存到雲端 ☁️');
      } catch (e) {
        this._cloudErr(e);
      } finally {
        this.cloud.busy = false;
      }
    },

    async openCloud() {
      if (!this.cloud.ready) { alert('雲端尚未啟用'); return; }
      if (!this.cloud.user) { await this.cloudLogin(); return; }
      await this.refreshCloud();
      this.cloud.showPanel = true;
    },

    async refreshCloud() {
      this.cloud.busy = true;
      try {
        const { data, error } = await supaClient.from('quotes')
          .select('id, customer_name, project_name, data, updated_at')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        this.cloud.list = data || [];
      } catch (e) {
        this._cloudErr(e);
      } finally {
        this.cloud.busy = false;
      }
    },

    cloudLoad(row, asCopy = false) {
      if (!confirm(asCopy ? '複製這筆到目前畫面（會覆蓋目前內容）？' : '載入這筆（會覆蓋目前內容）？')) return;
      this._applyData(row.data || {});
      this.cloud.currentId = asCopy ? null : row.id;
      this.cloud.showPanel = false;
      alert(asCopy ? '已複製為新報價單，存雲端會建立新一筆' : '已載入');
    },

    async cloudDelete(row) {
      if (!confirm(`刪除雲端的「${row.customer_name || '未命名'}」？此動作無法復原。`)) return;
      this.cloud.busy = true;
      try {
        const { error } = await supaClient.from('quotes').delete().eq('id', row.id);
        if (error) throw error;
        if (this.cloud.currentId === row.id) this.cloud.currentId = null;
        await this.refreshCloud();
      } catch (e) {
        this._cloudErr(e);
      } finally {
        this.cloud.busy = false;
      }
    },

    cloudNew() {
      this.cloud.currentId = null;
      this.cloud.showPanel = false;
      alert('已切換為「新報價單」，下次存雲端會建立新一筆（不會蓋掉剛才那筆）');
    },

    _cloudErr(e) {
      console.error(e);
      const msg = (e && e.message) || '';
      const code = (e && e.code) || '';
      if (/Invalid login|invalid_credentials/i.test(msg)) {
        alert('帳號或密碼錯誤');
      } else if (code === '42501' || /row-level security|violates row-level/i.test(msg)) {
        alert('沒有權限或訂閱已到期，無法存到雲端。');
      } else if (/Email not confirmed/i.test(msg)) {
        alert('這個帳號的 Email 還沒驗證，請先收信點驗證連結。');
      } else {
        alert('雲端操作失敗：' + msg);
      }
    },

    addItem() {
      if (!this.addForm.itemName) {
        alert('請選擇項目');
        return;
      }
      const libItem = this.library.find(
        i => i.category === this.addForm.category && i.name === this.addForm.itemName
      );
      if (!libItem) return;
      this.items.push({
        id: crypto.randomUUID(),
        floor: this.addForm.floor,
        category: libItem.category,
        name: libItem.name,
        spec: '',
        unit: libItem.unit,
        qty: 1,
        price: libItem.defaultPrice,
        note: libItem.note || '',
      });
      this.addForm.itemName = '';
    },

    addCustomItem() {
      const name = prompt('項目名稱：');
      if (!name) return;
      const unit = prompt('單位（尺/坪/式/個...）：', '式') || '式';
      const price = Number(prompt('單價：', '0')) || 0;
      const category = prompt('分類（木工/泥作/油漆/水電/地板/拆除/衛浴/廚具/系統櫃/其他）：', '其他') || '其他';
      this.items.push({
        id: crypto.randomUUID(),
        floor: this.addForm.floor,
        category,
        name,
        spec: '',
        unit,
        qty: 1,
        price,
        note: '',
      });
    },

    // 自動產生估價編號：FY-YYMMDD-NN
    genQuoteNo() {
      const d = (this.project.date || '').replace(/-/g, '').slice(2);
      const nn = String(Math.floor(Math.random() * 90) + 10);
      this.project.quoteNo = `FY-${d}-${nn}`;
    },

    removeItem(id) {
      this.items = this.items.filter(i => i.id !== id);
    },

    duplicateItem(id) {
      const idx = this.items.findIndex(i => i.id === id);
      if (idx < 0) return;
      const copy = { ...this.items[idx], id: crypto.randomUUID() };
      this.items.splice(idx + 1, 0, copy);
    },

    moveUp(id) {
      const idx = this.items.findIndex(i => i.id === id);
      if (idx <= 0) return;
      [this.items[idx - 1], this.items[idx]] = [this.items[idx], this.items[idx - 1]];
    },

    moveDown(id) {
      const idx = this.items.findIndex(i => i.id === id);
      if (idx < 0 || idx >= this.items.length - 1) return;
      [this.items[idx + 1], this.items[idx]] = [this.items[idx], this.items[idx + 1]];
    },

    subtotal(item) {
      return (Number(item.qty) || 0) * (Number(item.price) || 0);
    },

    quoteSubtotal(item) {
      const base = this.subtotal(item);
      if (!this.contractorMarkup.enabled || base <= 0) return base;
      const value = Math.max(0, Number(this.contractorMarkup.value) || 0);
      if (this.contractorMarkup.mode === 'fixed') {
        if (this.grandTotal <= 0) return base;
        return Math.round(base + (base / this.grandTotal) * value);
      }
      return Math.round(base * (1 + value / 100));
    },

    quoteUnitPrice(item) {
      const qty = Number(item.qty) || 0;
      if (qty <= 0) return Number(item.price) || 0;
      return Math.round(this.quoteSubtotal(item) / qty);
    },

    formatMoney(n) {
      return new Intl.NumberFormat('zh-TW').format(Math.round(n || 0));
    },

    // 拖拉欄位標題右緣調整寬度
    startResize(key, ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const startX = ev.clientX;
      const startW = this.cols[key].w;
      const onMove = (e) => {
        const dw = e.clientX - startX;
        this.cols[key].w = Math.max(36, Math.round(startW + dw));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        this.save();
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },

    // 欄位寬度與顯示還原預設
    resetCols() {
      const def = {
        idx: { show: true, w: 42 }, floor: { show: true, w: 58 },
        name: { show: true, w: 150 }, spec: { show: true, w: 120 },
        unit: { show: true, w: 52 }, qty: { show: true, w: 56 },
        price: { show: true, w: 78 }, subtotal: { show: true, w: 92 },
        note: { show: true, w: 200 },
      };
      Object.keys(def).forEach(k => { this.cols[k].show = def[k].show; this.cols[k].w = def[k].w; });
      this.save();
    },

    // 請款分期 / 加項 / 條款 的增刪
    addPayment() { this.payments.push({ label: '', percent: 0 }); this.save(); },
    removePayment(i) { this.payments.splice(i, 1); this.save(); },
    addExtra() { this.extras.push({ label: '', amount: 0 }); this.save(); },
    removeExtra(i) { this.extras.splice(i, 1); this.save(); },
    addTerm() { this.terms.push(''); this.save(); },
    removeTerm(i) { this.terms.splice(i, 1); this.save(); },
    addWarrantyInc() { this.warranty.included.push(''); this.save(); },
    removeWarrantyInc(i) { this.warranty.included.splice(i, 1); this.save(); },
    addWarrantyExc() { this.warranty.excluded.push(''); this.save(); },
    removeWarrantyExc(i) { this.warranty.excluded.splice(i, 1); this.save(); },

    save() {
      const data = {
        project: this.project,
        customer: this.customer,
        items: this.items,
        bankChoice: this.bankChoice,
        needInvoice: this.needInvoice,
        contractorMarkup: this.contractorMarkup,
        payments: this.payments,
        extras: this.extras,
        penalty: this.penalty,
        terms: this.terms,
        warranty: this.warranty,
        groupMode: this.groupMode,
        floorFilter: this.floorFilter,
        cols: this.cols,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        Object.assign(this.project, data.project || {});
        Object.assign(this.customer, data.customer || {});
        this.items = data.items || [];
        this.bankChoice = data.bankChoice || 'cathay';
        this.needInvoice = !!data.needInvoice;
        Object.assign(this.contractorMarkup, data.contractorMarkup || {});
        this.contractorMarkup.enabled = !!this.contractorMarkup.enabled;
        if (!['percent', 'fixed'].includes(this.contractorMarkup.mode)) this.contractorMarkup.mode = 'percent';
        if (Array.isArray(data.payments) && data.payments.length) this.payments = data.payments;
        if (Array.isArray(data.extras)) this.extras = data.extras;
        if (data.penalty) Object.assign(this.penalty, data.penalty);
        if (Array.isArray(data.terms)) this.terms = data.terms;
        if (data.warranty) {
          if (Array.isArray(data.warranty.included)) this.warranty.included = data.warranty.included;
          if (Array.isArray(data.warranty.excluded)) this.warranty.excluded = data.warranty.excluded;
        }
        this.groupMode = data.groupMode || 'category';
        this.floorFilter = data.floorFilter || '全部';
        if (data.cols) {
          for (const k of Object.keys(this.cols)) {
            if (data.cols[k]) Object.assign(this.cols[k], data.cols[k]);
          }
        }
      } catch (e) {
        console.error('Load failed', e);
      }
    },

    clearAll() {
      if (!confirm('確定清空所有資料？此動作無法復原。')) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    },

    exportJson() {
      const data = {
        project: this.project,
        customer: this.customer,
        items: this.items,
        bankChoice: this.bankChoice,
        needInvoice: this.needInvoice,
        contractorMarkup: this.contractorMarkup,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}.json`;
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },

    importJson(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!confirm('將覆蓋目前所有資料，確定匯入？')) return;
          this._applyData(data);
          alert('匯入成功');
        } catch (err) {
          alert('匯入失敗：' + err.message);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    },

    async importAny(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.importState.busy = true;
      this.importState.lastSource = file.name;
      try {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext === 'json') {
          const data = JSON.parse(await file.text());
          if (!confirm('將覆蓋目前所有資料，確定匯入？')) return;
          this._applyData(data);
          alert('匯入成功');
          return;
        }

        if (['csv', 'xlsx', 'xls'].includes(ext)) {
          const payload = await this._parseWorkbookFile(file);
          this._applyImportedPayload(payload, file.name);
          return;
        }

        if (ext === 'pdf') {
          const payload = await this._parsePdfFile(file);
          if (payload.items.length) {
            this._applyImportedPayload(payload, file.name);
            return;
          }
          const aiPayload = await this._aiImportFile(file);
          this._applyImportedPayload(aiPayload, file.name);
          return;
        }

        if (ext === 'numbers' || (file.type || '').startsWith('image/')) {
          const payload = await this._aiImportFile(file);
          this._applyImportedPayload(payload, file.name);
          return;
        }

        alert('此檔案格式尚未支援匯入');
      } catch (err) {
        alert('匯入失敗：' + (err?.message || err));
      } finally {
        this.importState.busy = false;
        event.target.value = '';
      }
    },

    async _parseWorkbookFile(file) {
      if (typeof XLSX === 'undefined') {
        throw new Error('試算表元件尚未載入完成，請重新整理後再試');
      }
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const payload = { project: {}, customer: {}, items: [] };
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
        const parsed = this._parseImportRows(rows, sheetName);
        if (!payload.project.name && parsed.project?.name) payload.project.name = parsed.project.name;
        payload.items.push(...parsed.items);
      }
      return payload;
    },

    async _parsePdfFile(file) {
      const pdfLib = window.pdfjsLib;
      if (!pdfLib) {
        throw new Error('PDF 解析元件尚未載入完成，請重新整理後再試');
      }
      pdfLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const buffer = await file.arrayBuffer();
      const pdf = await pdfLib.getDocument({ data: buffer }).promise;
      const payload = { project: {}, customer: {}, items: [] };

      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const textContent = await page.getTextContent();
        const textLines = this._pdfTextItemsToLines(textContent.items || []);
        const rows = textLines.map(line => line.cells);
        const parsed = this._parseImportRows(rows, file.name.replace(/\.pdf$/i, ''));
        const fallback = this._parseImportTextLines(textLines.map(line => line.text), file.name.replace(/\.pdf$/i, ''));
        if (!payload.project.name && parsed.project?.name) payload.project.name = parsed.project.name;
        if (!payload.project.name && fallback.project?.name) payload.project.name = fallback.project.name;
        payload.items.push(...this._mergeImportItems(parsed.items, fallback.items));
      }

      return payload;
    },

    _pdfTextItemsToLines(items) {
      const positioned = items
        .map(item => ({
          text: this._cleanCell(item.str),
          x: item.transform?.[4] || 0,
          y: item.transform?.[5] || 0,
          width: item.width || 0,
        }))
        .filter(item => item.text);

      const lines = [];
      const yTolerance = 3;
      for (const item of positioned.sort((a, b) => b.y - a.y || a.x - b.x)) {
        let line = lines.find(row => Math.abs(row.y - item.y) <= yTolerance);
        if (!line) {
          line = { y: item.y, items: [] };
          lines.push(line);
        }
        line.items.push(item);
      }

      return lines
        .sort((a, b) => b.y - a.y)
        .map(line => {
          const cells = this._pdfLineToCells(line.items);
          return {
            cells,
            text: cells.join(' ').replace(/\s+/g, ' ').trim(),
          };
        })
        .filter(line => line.text);
    },

    _pdfLineToCells(items) {
      const sorted = [...items].sort((a, b) => a.x - b.x);
      const cells = [];
      let current = null;
      const gapThreshold = 9;

      for (const item of sorted) {
        if (!current) {
          current = { text: item.text, right: item.x + item.width };
          continue;
        }
        const gap = item.x - current.right;
        if (gap > gapThreshold) {
          cells.push(current.text.trim());
          current = { text: item.text, right: item.x + item.width };
        } else {
          current.text += item.text.match(/^[,，.)）]/) ? item.text : ` ${item.text}`;
          current.right = Math.max(current.right, item.x + item.width);
        }
      }
      if (current) cells.push(current.text.trim());
      return cells;
    },

    _parseImportTextLines(lines, sheetName = '') {
      const payload = { project: { name: '' }, items: [] };
      let currentCategory = '木工';
      let currentFloor = '';

      for (const line of lines) {
        const text = this._cleanCell(line);
        if (!text) continue;

        const projectMatch = text.match(/(?:案名|案場|工程名稱)[:：\s]*([^\s]+(?:\s*[^\s]+){0,4})/);
        if (projectMatch && !payload.project.name) payload.project.name = projectMatch[1].trim();

        if (!this._lineHasUnit(text)) {
          if (/^(B\d|[1-9]\d?F|全區|全棟|頂樓|室外|其他)$/.test(text)) currentFloor = text;
          if (/(木作|木工|泥作|油漆|水電|地板|拆除|衛浴|廚具|系統櫃).*工程/.test(text)) currentCategory = this._inferCategory(text);
          continue;
        }

        const item = this._lineToImportItem(text, currentFloor, currentCategory);
        if (item) payload.items.push(item);
      }

      if (!payload.project.name && sheetName && sheetName !== 'Sheet1' && sheetName !== '工作表1') {
        payload.project.name = sheetName;
      }
      return payload;
    },

    _lineHasUnit(text) {
      const unitPattern = this._unitRegexSource();
      return new RegExp(`\\s(${unitPattern})\\s`).test(` ${text} `);
    },

    _lineToImportItem(text, currentFloor = '', currentCategory = '木工') {
      const clean = this._cleanCell(text)
        .replace(/^\d+\s+/, '')
        .replace(/\s+-$/, '')
        .trim();
      if (/^(合計|總計|營業稅|備註|付款方式|\*)/.test(clean)) return null;

      const unitPattern = this._unitRegexSource();
      const match = clean.match(new RegExp(`^(.+?)\\s+(${unitPattern})\\s+([\\d,]+(?:\\.\\d+)?)(?:\\s+([\\d,]+(?:\\.\\d+)?))?(?:\\s+([\\d,]+(?:\\.\\d+)?))?(?:\\s+(.+))?$`));
      if (!match) return null;

      let name = this._cleanCell(match[1]);
      const unit = match[2];
      const numbers = [match[3], match[4], match[5]].filter(Boolean).map(v => this._num(v));
      const note = this._cleanCell(match[6]);
      if (!name || !numbers.length) return null;

      const parts = name.split(/\s+/).filter(Boolean);
      let area = '';
      if (parts.length > 1 && /^(B\d|[1-9]\d?F|全區|全棟|頂樓|室外|其他)$/.test(parts[parts.length - 1])) {
        area = parts.pop();
        name = parts.join(' ');
      }

      let qty = 1;
      let price = 0;
      if (numbers.length >= 3) {
        if (numbers[0] > 0 && numbers[0] <= 100 && numbers[1] >= 100) {
          qty = numbers[0];
          price = numbers[1];
        } else {
          price = numbers[0];
          qty = numbers[1] || 1;
        }
      } else if (numbers.length === 2) {
        if (numbers[0] > 0 && numbers[0] <= 100 && numbers[1] >= 100) {
          qty = numbers[0];
          price = numbers[1];
        } else {
          price = numbers[0];
          qty = numbers[1] || 1;
        }
      } else {
        price = numbers[0];
      }

      return this._normalizeImportItem({
        floor: this._inferFloor(name) || this._inferFloor(area) || currentFloor || area || '全棟',
        category: this._inferCategory(`${currentCategory} ${name}`),
        name,
        unit,
        qty,
        price,
        note,
      });
    },

    _mergeImportItems(...groups) {
      const seen = new Set();
      const merged = [];
      for (const item of groups.flat()) {
        const key = [item.name, item.unit, item.qty, item.price].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      return merged;
    },

    _unitRegexSource() {
      return [...new Set([...this.unitOptions, '扇', '口', '台', '批', '米', '才'])]
        .map(unit => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    },

    _parseImportRows(rows, sheetName = '') {
      const payload = { project: { name: '' }, items: [] };
      let currentFloor = '';
      let currentCategory = '木工';
      let headerMap = null;

      for (const row of rows) {
        const cells = row.map(v => (v == null ? '' : String(v).trim()));
        const nonEmpty = cells.filter(Boolean);
        if (!nonEmpty.length) continue;

        const joined = nonEmpty.join(' ');
        const projectMatch = joined.match(/(?:案名|案場|工程名稱)[:：\s]*([^\s]+(?:\s*[^\s]+){0,4})/);
        if (projectMatch && !payload.project.name) payload.project.name = projectMatch[1].trim();

        const maybeHeader = this._makeImportHeaderMap(cells);
        if (maybeHeader) {
          headerMap = maybeHeader;
          continue;
        }

        if (!nonEmpty.some(cell => this._looksLikeUnit(cell)) && /(木作|木工|泥作|油漆|水電|地板|拆除|衛浴|廚具|系統櫃).*工程/.test(joined)) {
          currentCategory = this._inferCategory(joined);
          continue;
        }

        if (nonEmpty.length === 1) {
          const only = nonEmpty[0];
          if (/^(B\d|[1-9]\d?F|全區|全棟|頂樓|室外|其他)$/.test(only)) {
            currentFloor = only;
            continue;
          }
          if (/工程$/.test(only) || /工程/.test(only)) {
            currentCategory = this._inferCategory(only);
            continue;
          }
        }

        const item = this._rowToImportItem(cells, headerMap, currentFloor, currentCategory);
        if (item) payload.items.push(item);
      }

      if (!payload.project.name && sheetName && sheetName !== 'Sheet1' && sheetName !== '工作表1') {
        payload.project.name = sheetName;
      }
      return payload;
    },

    _makeImportHeaderMap(cells) {
      const map = {};
      cells.forEach((cell, idx) => {
        const text = cell.replace(/\s/g, '');
        if (/^(項次|序號|編號)$/.test(text)) map.seq = idx;
        if (/工程項目|項目及說明|項目名稱|品名/.test(text)) map.name = idx;
        if (/施做區域|施工區域|區域|位置/.test(text)) map.area = idx;
        if (/單位/.test(text)) map.unit = idx;
        if (/數量/.test(text)) map.qty = idx;
        if (/單價/.test(text)) map.price = idx;
        if (/小計|總價|金額/.test(text)) map.subtotal = idx;
        if (/備註|材質|說明/.test(text)) map.note = idx;
      });
      return map.name != null && map.unit != null ? map : null;
    },

    _rowToImportItem(cells, headerMap, currentFloor, currentCategory) {
      if (headerMap) {
        const name = this._cleanCell(cells[headerMap.name]);
        const unit = this._cleanCell(cells[headerMap.unit]);
        if (name && this._looksLikeUnit(unit)) {
          const area = this._cleanCell(cells[headerMap.area]);
          const qty = this._num(cells[headerMap.qty]);
          let price = this._num(cells[headerMap.price]);
          const subtotal = this._num(cells[headerMap.subtotal]);
          if (!price && subtotal && qty) price = Math.round(subtotal / qty);
          if (!qty && !price && !subtotal) return null;
          return this._normalizeImportItem({
            floor: this._inferFloor(name) || this._inferFloor(area) || currentFloor || area || '全棟',
            category: this._inferCategory(name || currentCategory),
            name,
            unit,
            qty: qty || (subtotal && price ? subtotal / price : 1),
            price,
            note: this._cleanCell(cells[headerMap.note]),
          });
        }
      }

      const unitIndex = cells.findIndex(c => this._looksLikeUnit(c));
      if (unitIndex < 0) return null;

      let raw = null;
      if (unitIndex === 1) {
        const n2 = this._num(cells[2]);
        const n3 = this._num(cells[3]);
        let price = n2;
        let qty = n3;
        if (n2 > 0 && n2 <= 100 && n3 >= 100) {
          qty = n2;
          price = n3;
        }
        raw = {
          floor: this._inferFloor(cells[0]) || currentFloor || '',
          category: currentCategory,
          name: this._cleanCell(cells[0]),
          qty,
          unit: this._cleanCell(cells[1]),
          price,
          note: this._cleanCell(cells[5]),
        };
      } else if (unitIndex === 3) {
        raw = {
          floor: currentFloor || this._inferFloor(cells[0]) || '',
          category: this._cleanCell(cells[0]) || currentCategory,
          name: this._cleanCell(cells[1]),
          qty: this._num(cells[2]),
          unit: this._cleanCell(cells[3]),
          price: this._num(cells[4]),
          note: this._cleanCell(cells[6]),
        };
      } else if (unitIndex === 2) {
        const n3 = this._num(cells[3]);
        const n4 = this._num(cells[4]);
        let qty = n4;
        let price = n3;
        if (n3 > 0 && n3 <= 100 && n4 >= 100) {
          qty = n3;
          price = n4;
        }
        const first = this._cleanCell(cells[0]);
        const second = this._cleanCell(cells[1]);
        raw = {
          floor: this._inferFloor(first) || this._inferFloor(second) || currentFloor || second || '全棟',
          category: currentCategory,
          name: /^\d+$/.test(first) ? second : first,
          qty,
          unit: this._cleanCell(cells[2]),
          price,
          note: this._cleanCell(cells[6]),
        };
      }

      if (!raw || !raw.name) return null;
      return this._normalizeImportItem(raw);
    },

    _normalizeImportItem(raw) {
      const name = this._cleanCell(raw.name);
      const unit = this._cleanCell(raw.unit) || '式';
      const qty = this._num(raw.qty) || 1;
      const price = this._num(raw.price) || 0;
      const category = this._normalizeCategory(raw.category, name);
      if (!name || /^(合計|總計|營業稅|備註|付款方式)$/.test(name)) return null;
      return {
        id: crypto.randomUUID(),
        floor: raw.floor || this._inferFloor(name) || '全棟',
        category,
        name,
        spec: this._cleanCell(raw.spec),
        unit,
        qty,
        price,
        note: this._cleanCell(raw.note),
      };
    },

    _normalizeCategory(category, name = '') {
      const allowed = ['木工', '泥作', '油漆', '水電', '地板', '拆除', '衛浴', '廚具', '系統櫃', '其他'];
      const clean = this._cleanCell(category);
      if (allowed.includes(clean)) return clean;
      return this._inferCategory(`${clean} ${name}`);
    },

    _applyImportedPayload(payload, sourceName) {
      const items = (payload.items || []).map(item => this._normalizeImportItem(item)).filter(Boolean);
      if (!items.length) throw new Error('沒有抓到可匯入的報價項目');

      let replace = this.items.length === 0;
      if (this.items.length) {
        const action = prompt(`已解析 ${items.length} 個項目。輸入 A 加到目前報價，輸入 R 覆蓋目前項目，留空取消。`, 'A');
        if (!action) return;
        replace = action.trim().toUpperCase() === 'R';
      }

      if (replace) {
        this.items = items;
        if (payload.project) Object.assign(this.project, payload.project);
        if (payload.customer) Object.assign(this.customer, payload.customer);
      } else {
        this.items.push(...items);
      }
      this.save();
      alert(`已從「${sourceName}」匯入 ${items.length} 個項目`);
    },

    async _aiImportFile(file) {
      const dataUrl = await this._fileToDataUrl(file);
      // [SECURITY 2026-07] 帶上登入 token，後端需驗證才呼叫 OpenAI
      let _tok = '';
      try { const { data } = await supaClient.auth.getSession(); _tok = data?.session?.access_token || ''; } catch { /* noop */ }
      if (!_tok) throw new Error('請先登入再使用 AI 匯入');
      const res = await fetch('/api/ai-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_tok}` },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || this._guessMimeType(file.name),
          dataUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          throw new Error('這份檔案需要 AI 匯入後端解析；請用 Vercel 部署版並設定 OPENAI_API_KEY');
        }
        throw new Error(data.message || 'AI 解析失敗');
      }
      return data;
    },

    _fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('讀取檔案失敗'));
        reader.readAsDataURL(file);
      });
    },

    _guessMimeType(name) {
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (ext === 'pdf') return 'application/pdf';
      if (ext === 'numbers') return 'application/vnd.apple.numbers';
      return 'application/octet-stream';
    },

    _cleanCell(value) {
      return (value == null ? '' : String(value)).replace(/^=+/, '').replace(/\s+/g, ' ').trim();
    },

    _num(value) {
      if (typeof value === 'number') return value;
      const raw = this._cleanCell(value).replace(/[,$，NT\s]/g, '');
      if (!raw || /^[-–—]+$/.test(raw)) return 0;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    },

    _looksLikeUnit(value) {
      const text = this._cleanCell(value);
      return this.unitOptions.includes(text) || ['扇', '口', '台', '批', '米', '才'].includes(text);
    },

    _inferFloor(text) {
      const s = this._cleanCell(text);
      const match = s.match(/(?:^|[^A-Z0-9])((?:B\d|[1-9]\d?F|頂樓|全棟|全區|室外|其他))(?:[^A-Z0-9]|$)/i);
      return match ? match[1].toUpperCase() : '';
    },

    _inferCategory(text) {
      const s = this._cleanCell(text);
      if (/木作|木工|櫃|桌|平釘|天花|窗簾|窗冷|圓弧|包樑|隔間|門|層板|燈溝|軌道|維修孔|展示/.test(s)) return '木工';
      if (/泥作|磚|防水|粉光|水泥/.test(s)) return '泥作';
      if (/油漆|乳膠漆|批土/.test(s)) return '油漆';
      if (/水電|插座|開關|配線|燈具|冷氣/.test(s)) return '水電';
      if (/地板|SPC|塑膠地磚/.test(s)) return '地板';
      if (/拆除|清運/.test(s)) return '拆除';
      if (/衛浴|馬桶|洗手台|浴缸|淋浴/.test(s)) return '衛浴';
      if (/廚|水槽|檯面|排油煙/.test(s)) return '廚具';
      if (/系統櫃|衣櫃|書櫃|鞋櫃|電視櫃/.test(s)) return '系統櫃';
      return '其他';
    },

    toggleLock() {
      this.isLocked = !this.isLocked;
      document.body.classList.toggle('locked', this.isLocked);
    },

    printQuote() {
      const oldTitle = document.title;
      const name = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}`;
      document.title = name;
      window.print();
      setTimeout(() => { document.title = oldTitle; }, 1000);
    },

    // === Excel 匯出 ===
    saveExcel() {
      const wb = XLSX.utils.book_new();
      const rows = this._buildSpreadsheetRows();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      // 欄寬設定
      ws['!cols'] = [
        { wch: 5 },   // 項次
        { wch: 6 },   // 樓層
        { wch: 28 },  // 項目及說明
        { wch: 18 },  // 規格/尺寸
        { wch: 6 },   // 單位
        { wch: 8 },   // 數量
        { wch: 10 },  // 單價
        { wch: 12 },  // 總價
        { wch: 20 },  // 備註
      ];
      // 合併儲存格（標題、付款區）會在後面用 merges 追加
      XLSX.utils.book_append_sheet(wb, ws, '報價單');
      const filename = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}.xlsx`;
      XLSX.writeFile(wb, filename);
    },

    saveCsv() {
      const rows = this._buildSpreadsheetRows();
      const csv = rows.map(r => r.map(cell => {
        if (cell == null) return '';
        const s = String(cell);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      }).join(',')).join('\n');
      // 加 BOM 讓 Excel 開 csv 不亂碼
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },

    // === PDF / PNG 匯出 ===
    _exportName() {
      return `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}`;
    },

    _esc(s) {
      return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // 生成一份乾淨唯讀版面（inline 樣式，避免可編輯表格的截圖問題）
    _buildExportNode() {
      const co = this.company, cu = this.customer, pr = this.project, c = this.cols;
      const m = n => this.formatMoney(n);
      const e = s => this._esc(s);
      const cols = [
        ['idx', '項次', '40px', 'center'],
        ['floor', '樓層', '54px', 'center'],
        ['name', '項目及說明', '', 'left'],
        ['spec', '規格/尺寸', '120px', 'left'],
        ['unit', '單位', '50px', 'center'],
        ['qty', '數量', '52px', 'right'],
        ['price', '單價', '76px', 'right'],
        ['subtotal', '總價', '88px', 'right'],
        ['note', '備註', '160px', 'left'],
      ].filter(x => c[x[0]].show);
      const n = cols.length;

      const th = cols.map(x =>
        `<th style="border:1px solid #2e4a6b;padding:7px 8px;background:#2e4a6b;color:#fff;font-size:12px;font-weight:600;${x[2] ? 'width:' + x[2] + ';' : ''}text-align:${x[3]}">${x[1]}</th>`
      ).join('');

      let rows = '';
      let seq = 0;
      for (const g of this.groups) {
        rows += `<tr class="sec-row"><td colspan="${n}" style="border:1px solid #ccc;border-left:3px solid #2e4a6b;padding:6px 10px;background:#eef3f8;font-weight:700;font-size:13px;color:#2e4a6b;">${e(g.label)}<span style="float:right">小計 $ ${m(g.subtotal)}</span></td></tr>`;
        for (const it of g.items) {
          seq++;
          const v = { idx: seq, floor: it.floor, name: it.name, spec: it.spec, unit: it.unit, qty: (Number(it.qty) || 0), price: m(this.quoteUnitPrice(it)), subtotal: m(this.quoteSubtotal(it)), note: it.note };
          rows += '<tr>' + cols.map(x =>
            `<td style="border:1px solid #ccc;padding:5px 8px;font-size:12px;text-align:${x[3]};white-space:pre-wrap;word-break:break-word;vertical-align:top;">${e(v[x[0]])}</td>`
          ).join('') + '</tr>';
        }
      }

      const infoRow = (l1, v1, l2, v2) =>
        `<tr><td style="padding:5px 8px;color:#555;width:80px;">${l1}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;">${e(v1)}</td><td style="padding:5px 8px;color:#555;width:80px;">${l2 || ''}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;">${e(v2 || '')}</td></tr>`;
      const taxRow = this.needInvoice ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-top:1px solid #eee;"><span>營業稅 5%</span><span>$ ${m(this.tax)}</span></div>` : '';
      const termsHtml = this.displayTerms.map(t => `<li style="margin:3px 0;font-size:11px;color:#444;">${e(t)}</li>`).join('');
      const wInc = (this.warranty.included || []).filter(x => (x || '').trim());
      const wExc = (this.warranty.excluded || []).filter(x => (x || '').trim());
      const wList = (arr, color) => arr.map(x => `<li style="margin:2px 0;font-size:11px;color:${color};">${e(x)}</li>`).join('');
      const warrantyHtml = (wInc.length || wExc.length) ? `
        <div data-block style="margin-top:14px;border:1px solid #d6dde6;border-radius:2px;overflow:hidden;">
          <div style="background:#eef3f8;color:#2e4a6b;font-weight:700;font-size:12px;padding:6px 12px;border-bottom:1px solid #d6dde6;">保固說明</div>
          <div style="display:flex;">
            <div style="flex:1;padding:8px 12px;">
              <div style="font-size:11px;font-weight:700;color:#2e7d4a;margin-bottom:3px;">保固內容</div>
              <ul style="margin:0;padding-left:16px;">${wList(wInc, '#2e7d4a')}</ul>
            </div>
            <div style="flex:1;padding:8px 12px;border-left:1px solid #eee;">
              <div style="font-size:11px;font-weight:700;color:#b23a3a;margin-bottom:3px;">不保固內容</div>
              <ul style="margin:0;padding-left:16px;">${wList(wExc, '#b23a3a')}</ul>
            </div>
          </div>
        </div>` : '';
      const extrasHtml = (this.extras || []).filter(x => x.label || Number(x.amount)).map(x => `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-top:1px solid #eee;"><span>＋ ${e(x.label || '追加項目')}</span><span>$ ${m(Number(x.amount) || 0)}</span></div>`).join('');
      const payCells = this.paymentRows.map(p => `<div style="flex:1;border:1px solid #d6dde6;border-top:3px solid #2e4a6b;padding:9px 8px;font-size:12px;"><div style="color:#2e4a6b;font-weight:600;">${e(p.label)}${p.percent ? '　' + p.percent + '%' : ''}</div><div style="font-weight:700;font-size:15px;margin-top:5px;">$ ${m(p.amount)}</div></div>`).join('');
      const bank = this.currentBank;

      const node = document.createElement('div');
      node.style.cssText = "width:820px;background:#fff;padding:28px 32px;font-family:'PingFang TC','Heiti TC',sans-serif;color:#1a1a1a;box-sizing:border-box;";
      node.innerHTML = `
        <div data-block style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #2e4a6b;padding-bottom:12px;">
          <img src="assets/logo.png" style="width:60px;height:60px;object-fit:contain;">
          <div style="flex:1;text-align:center;">
            <div style="font-size:20px;font-weight:700;">${e(co.name)}</div>
            <div style="font-size:12px;color:#888;">${e(co.englishName)}</div>
            <div style="font-size:12px;color:#666;margin-top:2px;">${e(co.services)}　｜　${e(co.slogan)}</div>
            <div style="font-size:18px;letter-spacing:8px;font-weight:700;margin-top:6px;">報　價　單</div>
          </div>
          <div style="width:60px;"></div>
        </div>
        <table data-block style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">
          ${infoRow('工程名稱', pr.name, '估價編號', pr.quoteNo)}
          ${infoRow('報價日期', pr.date, '材　　質', pr.material)}
          ${infoRow('工程地點', pr.location, '現場聯絡', pr.contact)}
          ${infoRow('客戶名稱', cu.name, '聯絡電話', cu.phone)}
          ${infoRow('公司統編', cu.taxId, '發票抬頭', cu.invoiceTitle)}
          ${infoRow('客戶地址', cu.address, '', '')}
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>
        <div data-block style="margin-top:12px;margin-left:auto;width:344px;font-size:13px;border:1px solid #d6dde6;border-radius:2px;overflow:hidden;">
          <div style="display:flex;justify-content:space-between;padding:7px 12px;"><span>工程總額（未稅）</span><span>$ ${m(this.quoteGrandTotal)}</span></div>
          ${extrasHtml}
          ${taxRow}
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#2e4a6b;color:#fff;"><span style="font-size:14px;font-weight:700;">${this.needInvoice ? '總計（含稅）' : '總計（未含稅）'}</span><span style="font-size:19px;font-weight:700;color:#ffd24d;">NT$ ${m(this.finalTotal)} 元整</span></div>
        </div>
        <div data-block style="display:flex;gap:10px;margin-top:12px;text-align:center;">
          ${payCells}
        </div>
        <div data-block style="margin-top:16px;"><strong style="font-size:12px;">備註說明：</strong><ol style="margin:6px 0;padding-left:20px;">${termsHtml}</ol></div>
        ${warrantyHtml}
        <div data-block data-sig style="display:flex;gap:16px;margin-top:14px;">
          <div style="flex:1;border:1px solid #d6dde6;font-size:12px;line-height:1.9;">
            <div style="font-weight:700;background:#eef3f8;color:#2e4a6b;padding:7px 12px;border-bottom:1px solid #d6dde6;">客戶確認章戳</div>
            <div style="padding:10px 12px;">
            <div>客戶名稱：${e(cu.name)}</div><div>聯絡電話：${e(cu.phone)}</div>
            <div>統一編號：${e(cu.taxId)}</div><div>發票抬頭：${e(cu.invoiceTitle)}</div>
            <div>地　　址：${e(cu.address)}</div>
            <div style="margin-top:18px;color:#999;">（請於此處簽名或蓋章）</div>
            </div>
          </div>
          <div style="flex:1;border:1px solid #d6dde6;font-size:12px;line-height:1.9;">
            <div style="font-weight:700;background:#eef3f8;color:#2e4a6b;padding:7px 12px;border-bottom:1px solid #d6dde6;">${e(co.name)}<span style="float:right;font-weight:400;color:#888;">統編 ${e(co.taxId)}</span></div>
            <div style="padding:10px 12px;">
            <div>現場聯絡：${e(co.contact)}　${e(co.phone)}</div>
            <div>公司地址：${e(co.address)}</div>
            <div>LINE　　：${e(co.line)}</div>
            <div>付款方式：匯款／轉帳</div>
            <div>銀行名稱：${e(bank.bankName)}（${e(bank.bankCode)}）</div>
            <div>戶　　名：${e(bank.accountName)}</div>
            <div>匯款帳號：${e(bank.accountNo)}</div>
            <div style="margin-top:14px;">承辦人：${e(co.contact)}　＿＿＿＿＿＿＿＿</div>
            <div style="margin-top:6px;color:#999;">（公司用印）</div>
            </div>
          </div>
        </div>
      `;
      return node;
    },

    async _capturePaper() {
      if (typeof html2canvas === 'undefined') {
        alert('截圖元件尚未載入完成，請稍候幾秒或重新整理再試。');
        return null;
      }
      const node = this._buildExportNode();
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed; left:-10000px; top:0; z-index:-1;';
      wrap.appendChild(node);
      document.body.appendChild(wrap);

      // 等 logo 圖片載入，避免截到一半
      const img = node.querySelector('img');
      if (img && !img.complete) {
        await new Promise(res => { img.onload = res; img.onerror = res; });
      }
      await new Promise(r => setTimeout(r, 50));

      const scale = 2;
      let canvas = null;
      let breaks = [];
      let sigTop = 0;
      try {
        canvas = await html2canvas(node, {
          scale,
          backgroundColor: '#ffffff',
          useCORS: true,
          windowWidth: node.offsetWidth,
          windowHeight: node.offsetHeight,
        });
        // 收集「安全分頁點」：每個內容列、條款項、大區塊的底緣。
        // 用「佔整張的比例 × 實際 canvas 高度」換算，避免 html2canvas 縮放誤差
        // 累積到後面幾頁把座標偏掉（這正是條款被切到的主因）。
        // 排除 thead 與 .sec-row（分類標題列）→ 標題不會單獨落在頁尾。
        const nodeRect = node.getBoundingClientRect();
        const nodeTop = nodeRect.top;
        const nodeH = nodeRect.height || 1;
        const ch = canvas.height;
        const toCanvasY = clientY => Math.round((clientY - nodeTop) / nodeH * ch);
        const set = new Set();
        node.querySelectorAll('tbody tr:not(.sec-row), ol > li, [data-block]').forEach(el => {
          const b = toCanvasY(el.getBoundingClientRect().bottom);
          if (b > 0) set.add(b);
        });
        breaks = [...set].sort((a, b) => a - b);
        // 簽章區頂緣 → 用來把簽章區推到獨立的最後一頁
        const sig = node.querySelector('[data-sig]');
        sigTop = sig ? toCanvasY(sig.getBoundingClientRect().top) : 0;
      } catch (e) {
        alert('產生影像失敗：' + e.message);
      } finally {
        wrap.remove();
      }
      return canvas ? { canvas, breaks, sigTop } : null;
    },

    async savePng() {
      const r = await this._capturePaper();
      if (!r) return;
      const a = document.createElement('a');
      a.href = r.canvas.toDataURL('image/png');
      a.download = this._exportName() + '.png';
      a.click();
    },

    async savePdf() {
      const r = await this._capturePaper();
      if (!r) return;
      const { canvas, breaks, sigTop } = r;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWmm = 210, pageHmm = 297;
      const cw = canvas.width;
      const pxPerMm = cw / pageWmm;
      const fullPageH = Math.round(pageHmm * pxPerMm);
      const FOOT = Math.round(10 * pxPerMm); // 頁尾頁碼留白
      const HEAD = Math.round(9 * pxPerMm);  // 第 2 頁起頁首留白
      const totalH = canvas.height;

      // 整份是否一頁就裝得下（含簽章）：是的話就不強制把簽章推到第二頁
      const onePage = totalH <= fullPageH - FOOT;

      // 1) 先算出每頁要切的 [起, 迄, 該頁頂部留白]
      const slices = [];
      let y = 0, guard = 0;
      while (y < totalH - 1 && guard++ < 200) {
        const isFirst = slices.length === 0;
        const topM = isFirst ? 0 : HEAD;
        const avail = fullPageH - topM - FOOT;
        let target = y + avail;
        let cut;
        if (target >= totalH) {
          cut = totalH;
        } else {
          // ③ 簽章區獨立一頁：若這頁範圍會碰到簽章區頂緣，就在頂緣斷頁，讓簽章另起新頁
          if (!onePage && sigTop > y && sigTop <= target) {
            cut = sigTop;
          } else {
            // 找 <= target 且 > y 的最大安全分頁點
            cut = 0;
            for (const b of breaks) {
              if (b > y && b <= target) cut = b;
              else if (b > target) break;
            }
            if (cut <= y) cut = target; // 找不到安全點（極長單列）才硬切
          }
        }
        slices.push([y, cut, topM]);
        y = cut;
      }

      // 2) 逐頁畫成整張 A4（內容 + 中文頁首/頁碼用 canvas 直接畫，避免 jsPDF 中文亂碼）
      const total = slices.length;
      const headText = `${this.company.name}　報價單` + (this.project.quoteNo ? `　${this.project.quoteNo}` : '');
      const fontPx = Math.round(2.9 * pxPerMm);
      slices.forEach(([a, b, topM], i) => {
        const sliceH = b - a;
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = cw;
        pageCanvas.height = fullPageH;
        const ctx = pageCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, fullPageH);
        ctx.drawImage(canvas, 0, a, cw, sliceH, 0, topM, cw, sliceH);
        ctx.fillStyle = '#999999';
        ctx.font = `${fontPx}px "PingFang TC","Heiti TC","Microsoft JhengHei",sans-serif`;
        if (i > 0) { // ② 第 2 頁起加頁首
          ctx.textAlign = 'left';
          ctx.fillText(headText, Math.round(12 * pxPerMm), Math.round(6.2 * pxPerMm));
        }
        if (total > 1) { // ② 頁碼（多頁時才標）
          ctx.textAlign = 'center';
          ctx.fillText(`第 ${i + 1} 頁／共 ${total} 頁`, cw / 2, fullPageH - Math.round(3.4 * pxPerMm));
        }
        if (i > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWmm, pageHmm);
      });
      pdf.save(this._exportName() + '.pdf');
    },

    _buildSpreadsheetRows() {
      const r = [];
      // 金額列：標籤放「項目」欄(idx 2)，金額放「總價」欄(idx 7)
      const amtRow = (label, amount) => ['', '', label, '', '', '', '', amount];
      // 標題
      r.push([this.company.name]);
      r.push(['報價單']);
      r.push([]);
      // 工程資訊
      r.push(['工程名稱', this.project.name, '', '', '估價編號', this.project.quoteNo]);
      r.push(['報價日期', this.project.date, '', '', '材質', this.project.material]);
      r.push(['工程地點', this.project.location, '', '', '現場聯絡', this.project.contact]);
      r.push([]);
      // 客戶資訊
      r.push(['客戶名稱', this.customer.name, '', '', '聯絡電話', this.customer.phone]);
      r.push(['公司統編', this.customer.taxId, '', '', '發票抬頭', this.customer.invoiceTitle]);
      r.push(['客戶地址', this.customer.address]);
      r.push([]);
      // 項目表標頭
      r.push(['項次', '樓層', '項目及說明', '規格/尺寸', '單位', '數量', '單價', '總價', '備註']);
      // 依分類列出
      let seq = 0;
      for (const [cat, list] of Object.entries(this.itemsByCategory)) {
        r.push([`── ${cat} ──`]);
        for (const it of list) {
          seq++;
          r.push([
            seq,
            it.floor,
            it.name,
            it.spec || '',
            it.unit,
            Number(it.qty) || 0,
            this.quoteUnitPrice(it),
            this.quoteSubtotal(it),
            it.note || '',
          ]);
        }
        r.push(amtRow(`${cat}小計`, this.categorySubtotals[cat]));
      }
      r.push([]);
      // 合計
      r.push(amtRow('工程總額（未稅）', this.quoteGrandTotal));
      (this.extras || []).filter(x => x.label || Number(x.amount)).forEach(x => r.push(amtRow(`追加：${x.label || '追加項目'}`, Number(x.amount) || 0)));
      if (this.needInvoice) {
        r.push(amtRow('營業稅 5%', this.tax));
      }
      r.push(amtRow(this.needInvoice ? '總計（含稅）' : '總計（未含稅）', this.finalTotal));
      r.push([]);
      // 請款分期
      this.paymentRows.forEach(p => r.push(amtRow(`${p.label}${p.percent ? '　' + p.percent + '%' : ''}`, p.amount)));
      r.push([]);
      // 備註條款
      r.push(['備註說明：']);
      this.displayTerms.forEach((t, i) => r.push([`${i + 1}.`, t]));
      r.push([]);
      // 保固說明
      const wInc = (this.warranty.included || []).filter(x => (x || '').trim());
      const wExc = (this.warranty.excluded || []).filter(x => (x || '').trim());
      if (wInc.length || wExc.length) {
        r.push(['保固說明：']);
        r.push(['保固內容']);
        wInc.forEach(x => r.push(['', x]));
        r.push(['不保固內容']);
        wExc.forEach(x => r.push(['', x]));
        r.push([]);
      }
      // 公司資訊
      r.push([`${this.company.name}　統編 ${this.company.taxId}`]);
      r.push([`現場聯絡：${this.company.contact}　${this.company.phone}`]);
      r.push([`付款方式：匯款／轉帳`]);
      r.push([`銀行名稱：${this.currentBank.bankName}（${this.currentBank.bankCode}）`]);
      r.push([`戶　　名：${this.currentBank.accountName}`]);
      r.push([`匯款帳號：${this.currentBank.accountNo}`]);
      return r;
    },

  };
}
