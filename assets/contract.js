(function () {
  'use strict';

  const SUPA_URL = 'https://ulaumiqgrazbpdpykgsw.supabase.co';
  const SUPA_KEY = 'sb_publishable_hqupVgCRCxuMKb6UJXLglg_cEB-rifP';
  const FEATURE_KEY = 'contractor_contract';

  const EMPTY_FORM = Object.freeze({
    contractorName: '',
    responsibleName: '',
    idNumber: '',
    phone: '',
    address: '',
    workType: '',
    projectName: '',
    projectAddress: '',
    totalAmount: '',
    startDate: '',
    endDate: '',
    paymentMethod: '',
    warrantyPeriod: '',
    specialTerms: '',
    partyARepresentative: '',
    partyATaxId: '',
    partyAPhone: '',
    partyAAddress: '',
    partyASignature: '',
    partyASignDate: '',
    partyBSignature: '',
    partyBSignDate: '',
    confirmationSignature: '',
  });

  let client = null;
  let form = { ...EMPTY_FORM };
  let storageKey = '';
  let saveTimer = 0;
  let fieldSerial = 0;
  let pdfBusy = false;

  const splash = document.getElementById('auth-splash');
  const authMessage = document.getElementById('auth-message');
  const app = document.getElementById('contract-app');
  const paper = document.getElementById('contract-paper');
  const statusNode = document.getElementById('save-status');

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function display(value, fallback = '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿') {
    return String(value || '').trim() || fallback;
  }

  function formatRocDate(value) {
    if (!value) return '中華民國＿＿年＿＿月＿＿日';
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return String(value);
    return `中華民國${year - 1911}年${month}月${day}日`;
  }

  function setStatus(message) {
    statusNode.textContent = message;
  }

  function field(key, label, options = {}) {
    const id = `contract-field-${key}-${++fieldSerial}`;
    const type = options.type || 'text';
    const className = options.className ? ` ${options.className}` : '';
    const inputMode = options.inputMode ? ` inputmode="${escapeHtml(options.inputMode)}"` : '';
    const placeholder = escapeHtml(options.placeholder || '請填寫');
    const control = options.textarea
      ? `<textarea id="${id}" data-field="${key}" rows="5" placeholder="${placeholder}" autocomplete="off"></textarea>`
      : `<input id="${id}" data-field="${key}" type="${type}"${inputMode} placeholder="${placeholder}" autocomplete="off">`;
    const printDate = type === 'date' ? '<span class="print-date" data-print-date></span>' : '';
    return `<label class="form-field${className}" for="${id}"><span class="field-label">${escapeHtml(label)}</span>${control}${printDate}</label>`;
  }

  function renderContract() {
    fieldSerial = 0;
    const articles = (window.CONTRACT_ARTICLES || []).map((article) => `
      <section class="contract-article">
        <h2><span>${escapeHtml(article.number)}</span>${escapeHtml(article.title)}</h2>
        <div class="article-body">
          ${article.clauses.map((clause) => `<p class="clause-item">${escapeHtml(clause)}</p>`).join('')}
        </div>
      </section>`).join('');

    paper.innerHTML = `
      <div class="document-kicker">CONTRACTOR AGREEMENT · FUYU INTERIOR DESIGN</div>
      <header class="document-header">
        <p class="company-name">富寓室內裝潢有限公司</p>
        <h1>承包商合作契約暨工班管理辦法</h1>
        <div class="title-rule"><span></span></div>
        <div class="party-lines">
          <p><strong>甲方</strong><span>富寓室內裝潢有限公司</span></p>
          <p><strong>乙方</strong><span data-bind="contractorName"></span></p>
        </div>
      </header>

      <aside class="local-note screen-only">
        <strong>隱私說明</strong>
        <span>登入只用於確認系統權限；以下契約資料僅暫存在此瀏覽器，不會上傳。</span>
      </aside>

      <section class="intake-section screen-only" aria-labelledby="intake-title">
        <div class="section-heading compact"><span>填寫區</span><h2 id="intake-title">乙方與個別工程資料</h2></div>
        <div class="form-grid">
          ${field('contractorName', '承包商／工班名稱')}
          ${field('responsibleName', '負責人姓名')}
          ${field('idNumber', '統一編號或身分證字號')}
          ${field('phone', '聯絡電話', { type: 'tel', inputMode: 'tel' })}
          ${field('address', '通訊地址', { className: 'span-2' })}
          ${field('workType', '承攬工種')}
          ${field('projectName', '工程名稱')}
          ${field('projectAddress', '工程地址', { className: 'span-2' })}
          ${field('totalAmount', '承攬總工程款（新臺幣）', { inputMode: 'numeric', placeholder: '請填寫金額' })}
          ${field('startDate', '預定進場日期', { type: 'date' })}
          ${field('endDate', '預定完工日期', { type: 'date' })}
        </div>
      </section>

      <div class="articles">${articles}</div>

      <section class="data-section page-break-before" aria-labelledby="project-data-title">
        <div class="section-heading"><span>附件一</span><h2 id="project-data-title">個別工程資料</h2></div>
        <div class="form-grid print-form">
          ${field('projectName', '工程名稱')}
          ${field('projectAddress', '工程地址')}
          ${field('workType', '乙方承攬工種')}
          ${field('totalAmount', '承攬總工程款（新臺幣／元整）', { inputMode: 'numeric' })}
          ${field('startDate', '預定進場日期', { type: 'date' })}
          ${field('endDate', '預定完工日期', { type: 'date' })}
          ${field('paymentMethod', '付款方式')}
          ${field('warrantyPeriod', '保固期限')}
          ${field('specialTerms', '其他特別約定', { className: 'span-2', textarea: true, placeholder: '如無特別約定可留白' })}
        </div>
      </section>

      <section class="signing-section" aria-labelledby="signing-title">
        <div class="section-heading"><span>簽署</span><h2 id="signing-title">甲乙雙方資料及簽署</h2></div>
        <div class="signature-grid">
          <article class="signature-card">
            <div class="signature-card-title"><span>甲方</span><strong>富寓室內裝潢有限公司</strong></div>
            ${field('partyARepresentative', '代表人')}
            ${field('partyATaxId', '統一編號')}
            ${field('partyAPhone', '聯絡電話', { type: 'tel', inputMode: 'tel' })}
            ${field('partyAAddress', '公司地址')}
            ${field('partyASignature', '甲方簽名')}
            ${field('partyASignDate', '簽署日期', { type: 'date' })}
            <div class="seal-box" aria-label="甲方公司章預留處"><span>甲方公司章</span><small>請於此處用印</small></div>
          </article>

          <article class="signature-card">
            <div class="signature-card-title"><span>乙方</span><strong data-bind="contractorName"></strong></div>
            ${field('contractorName', '承包商或工班名稱')}
            ${field('responsibleName', '負責人姓名')}
            ${field('idNumber', '統一編號或身分證字號')}
            ${field('phone', '聯絡電話', { type: 'tel', inputMode: 'tel' })}
            ${field('address', '通訊地址')}
            ${field('partyBSignature', '乙方簽名')}
            ${field('partyBSignDate', '簽署日期', { type: 'date' })}
            <div class="seal-box" aria-label="乙方公司章預留處"><span>乙方公司章</span><small>請於此處用印</small></div>
          </article>
        </div>
      </section>

      <section class="confirmation-block">
        <span class="confirmation-label">確認聲明</span>
        <p>乙方確認已詳閱本契約全部內容，了解各項施工、工期、驗收、扣款、違約、保密及損害賠償規定，並同意遵守。</p>
        ${field('confirmationSignature', '乙方簽名')}
      </section>

      <footer class="document-footer">
        <span>富寓室內裝潢有限公司</span>
        <span>本契約一式兩份，甲乙雙方各執一份</span>
      </footer>`;
  }

  function syncFormToDom() {
    paper.querySelectorAll('[data-field]').forEach((control) => {
      const key = control.dataset.field;
      control.value = form[key] || '';
      const dateNode = control.parentElement.querySelector('[data-print-date]');
      if (dateNode) dateNode.textContent = formatRocDate(form[key]);
    });
    paper.querySelectorAll('[data-bind="contractorName"]').forEach((node) => {
      node.textContent = display(form.contractorName);
    });
  }

  function saveLocalSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(form));
        setStatus('已自動儲存於此帳號的本機瀏覽器');
      } catch (error) {
        console.error(error);
        setStatus('本機儲存失敗，請勿關閉此頁');
      }
    }, 250);
  }

  function bindFormEvents() {
    paper.addEventListener('input', (event) => {
      const control = event.target.closest('[data-field]');
      if (!control) return;
      const key = control.dataset.field;
      form[key] = control.value;
      paper.querySelectorAll(`[data-field="${key}"]`).forEach((peer) => {
        if (peer !== control) peer.value = control.value;
        const dateNode = peer.parentElement.querySelector('[data-print-date]');
        if (dateNode) dateNode.textContent = formatRocDate(control.value);
      });
      if (key === 'contractorName') {
        paper.querySelectorAll('[data-bind="contractorName"]').forEach((node) => {
          node.textContent = display(control.value);
        });
      }
      saveLocalSoon();
    });
  }

  function buildCopyText() {
    const lines = [
      '富寓室內裝潢有限公司',
      '承包商合作契約暨工班管理辦法',
      '',
      '甲方：富寓室內裝潢有限公司',
      `乙方：${display(form.contractorName)}`,
      '',
    ];
    (window.CONTRACT_ARTICLES || []).forEach((article) => {
      lines.push(`${article.number}　${article.title}`, '', ...article.clauses, '');
    });
    lines.push(
      '【個別工程資料】', '',
      `工程名稱：${display(form.projectName)}`,
      `工程地址：${display(form.projectAddress)}`,
      `乙方承攬工種：${display(form.workType)}`,
      `承攬總工程款：新臺幣${display(form.totalAmount, '＿＿＿＿＿＿＿＿')}元整`,
      `預定進場日期：${formatRocDate(form.startDate)}`,
      `預定完工日期：${formatRocDate(form.endDate)}`,
      `付款方式：${display(form.paymentMethod)}`,
      `保固期限：${display(form.warrantyPeriod)}`,
      `其他特別約定：\n${display(form.specialTerms)}`, '',
      '【甲方資料】', '',
      '公司名稱：富寓室內裝潢有限公司',
      `代表人：${display(form.partyARepresentative)}`,
      `統一編號：${display(form.partyATaxId)}`,
      `聯絡電話：${display(form.partyAPhone)}`,
      `公司地址：${display(form.partyAAddress)}`,
      `甲方簽名：${display(form.partyASignature)}`,
      `簽署日期：${formatRocDate(form.partyASignDate)}`,
      '公司章：＿＿＿＿＿＿＿＿＿＿＿＿', '',
      '【乙方資料】', '',
      `承包商或工班名稱：${display(form.contractorName)}`,
      `負責人姓名：${display(form.responsibleName)}`,
      `統一編號或身分證字號：${display(form.idNumber)}`,
      `聯絡電話：${display(form.phone)}`,
      `通訊地址：${display(form.address)}`,
      `乙方簽名：${display(form.partyBSignature)}`,
      `簽署日期：${formatRocDate(form.partyBSignDate)}`,
      '公司章：＿＿＿＿＿＿＿＿＿＿＿＿', '',
      '【確認聲明】', '',
      '乙方確認已詳閱本契約全部內容，了解各項施工、工期、驗收、扣款、違約、保密及損害賠償規定，並同意遵守。', '',
      `乙方簽名：${display(form.confirmationSignature)}`,
    );
    return lines.join('\n');
  }

  async function copyContract() {
    const text = buildCopyText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setStatus('已複製全部契約文字');
  }

  async function downloadPdf() {
    if (pdfBusy || typeof window.html2pdf !== 'function') return;
    const button = document.getElementById('download-pdf');
    const label = button.querySelector('b');
    pdfBusy = true;
    button.disabled = true;
    label.textContent = '製作中…';
    setStatus('正在製作 PDF，請稍候');
    paper.classList.add('pdf-export');
    try {
      const safeName = (form.contractorName.trim() || '未命名').replace(/[\\/:*?"<>|]/g, '-');
      await window.html2pdf().set({
        margin: [9, 10, 11, 10],
        filename: `富寓承包商合作契約_${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 1.1, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.clause-item', '.form-field', '.signature-card', '.confirmation-block'] },
      }).from(paper).save();
      setStatus('PDF 已下載');
    } catch (error) {
      console.error(error);
      setStatus('PDF 製作失敗，請改用「列印合約」並選擇另存為 PDF');
    } finally {
      paper.classList.remove('pdf-export');
      pdfBusy = false;
      button.disabled = false;
      label.textContent = '下載 PDF';
    }
  }

  function clearContract() {
    const confirmed = window.confirm('確定清除所有已填寫的乙方、工程與簽署資料嗎？此動作無法復原。');
    if (!confirmed) return;
    localStorage.removeItem(storageKey);
    form = { ...EMPTY_FORM };
    syncFormToDom();
    setStatus('已清除所有簽署資料');
  }

  function bindActions() {
    document.getElementById('print-contract').addEventListener('click', () => {
      setStatus('正在開啟列印設定');
      window.print();
    });
    document.getElementById('download-pdf').addEventListener('click', downloadPdf);
    document.getElementById('copy-contract').addEventListener('click', copyContract);
    document.getElementById('clear-contract').addEventListener('click', clearContract);
  }

  function showDenied(message) {
    app.hidden = true;
    splash.hidden = false;
    authMessage.classList.add('auth-error');
    authMessage.textContent = message;
    const back = document.createElement('a');
    back.href = './';
    back.textContent = '返回報價系統';
    back.style.cssText = 'display:inline-block;margin-top:18px;color:#fff;font-weight:700;';
    authMessage.parentElement.appendChild(back);
  }

  function redirectToLogin() {
    window.location.replace('./?next=contract.html');
  }

  async function initialize() {
    if (!window.supabase || !Array.isArray(window.CONTRACT_ARTICLES)) {
      showDenied('必要元件載入失敗，請重新整理後再試。');
      return;
    }

    client = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData?.user || null;
    if (userError || !user) {
      redirectToLogin();
      return;
    }

    const { data: orgId, error: orgError } = await client.rpc('fuyu_ensure_org');
    if (orgError || !orgId) {
      showDenied('找不到你的公司成員資料，請返回系統重新登入。');
      return;
    }

    const { data: feature, error: featureError } = await client
      .from('organization_features')
      .select('enabled')
      .eq('organization_id', orgId)
      .eq('feature_key', FEATURE_KEY)
      .maybeSingle();

    if (featureError) {
      console.error(featureError);
      showDenied('目前無法確認契約權限，請稍後再試。');
      return;
    }
    const { data: adminRow } = await client.rpc('fuyu_is_platform_admin');
    if (!feature?.enabled && !adminRow) {
      showDenied('這個帳號所屬公司尚未開通承包商契約權限。');
      return;
    }

    storageKey = `fuyu-contractor-contract-v1:${orgId}:${user.id}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        form = { ...EMPTY_FORM, ...JSON.parse(saved) };
        setStatus('已載入此帳號的本機暫存資料');
      }
    } catch (error) {
      console.error(error);
      form = { ...EMPTY_FORM };
      setStatus('無法讀取先前資料，已開啟空白契約');
    }

    renderContract();
    syncFormToDom();
    bindFormEvents();
    bindActions();
    document.getElementById('auth-user-label').textContent = user.email || '已登入';
    splash.hidden = true;
    app.hidden = false;

    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) redirectToLogin();
    });
  }

  initialize().catch((error) => {
    console.error(error);
    showDenied('權限驗證失敗，請返回系統重新登入。');
  });
})();
