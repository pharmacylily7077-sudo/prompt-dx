/**
 * 調剤薬局 売上・入金・返戻管理システム メインスクリプト (js/app.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ユーティリティ
  const formatYen = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '¥0';
    return '¥' + amount.toLocaleString('ja-JP');
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : '⚠️'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // ----------------------------------------------------
  // タブ切り替え制御（完全委任＆ハッシュ連動＆直接ジャンプ対応）
  // ----------------------------------------------------
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const switchTab = (targetId) => {
    if (!targetId) return;
    const targetContent = document.getElementById(targetId);
    if (!targetContent) return;

    tabButtons.forEach(b => {
      if (b.getAttribute('data-tab') === targetId) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    tabContents.forEach(c => {
      if (c.id === targetId) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    // 小口現金タブを開いた際に最新一覧・残高を即座に再描画
    if (targetId === 'tab-petty' && typeof renderPettyCash === 'function') {
      renderPettyCash();
    }

    // 月次レポートタブを開いた際に最新データを集計再描画
    if (targetId === 'tab-monthly' && typeof window.__renderMonthlyReport === 'function') {
      window.__renderMonthlyReport();
    }
  };
  window.switchTab = switchTab;

  // 全体クリック委任（タブボタンや各種小口現金へのジャンプリンク対応）
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-tab], .tab-btn, a[href^="#tab-"]');
    if (trigger) {
      let targetId = trigger.getAttribute('data-tab');
      if (!targetId && trigger.getAttribute('href')) {
        targetId = trigger.getAttribute('href').replace('#', '');
      }
      if (targetId && document.getElementById(targetId)) {
        e.preventDefault();
        switchTab(targetId);
        try { history.replaceState(null, '', '#' + targetId); } catch (_) {}
      }
    }
  });

  // URLハッシュ直接アクセス対応（例: index.html#tab-petty）
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && document.getElementById(initialHash)) {
    setTimeout(() => switchTab(initialHash), 10);
  }
  window.addEventListener('hashchange', () => {
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash && document.getElementById(currentHash)) {
      switchTab(currentHash);
    }
  });

  // ----------------------------------------------------
  // 小口現金管理 (フェーズ1)
  // ----------------------------------------------------
  const pettyCashManager = new PettyCashManager();

  // DOM要素
  const pettyForm = document.getElementById('petty-cash-form');
  const pettyDateInput = document.getElementById('petty-date');
  const pettyAmountInput = document.getElementById('petty-amount');
  const pettyCategorySelect = document.getElementById('petty-category');
  const pettyMemoInput = document.getElementById('petty-memo');
  const pettyTypeInputs = document.querySelectorAll('input[name="petty-type"]');
  const testDataBtn = document.getElementById('btn-load-test-data');
  const clearDataBtn = document.getElementById('btn-clear-petty-data');

  // サマリー表示要素
  const summaryBalanceEl = document.getElementById('petty-summary-balance');
  const summaryIncomeEl = document.getElementById('petty-summary-income');
  const summaryExpenseEl = document.getElementById('petty-summary-expense');
  const summaryCountEl = document.getElementById('petty-summary-count');
  const balanceWarningEl = document.getElementById('petty-balance-warning');

  // テーブル要素
  const transactionTableBody = document.getElementById('petty-table-body');
  const emptyStateEl = document.getElementById('petty-empty-state');

  // 初期日付（本日）をセット
  if (pettyDateInput) {
    const today = new Date().toISOString().substring(0, 10);
    pettyDateInput.value = today;
  }

  // カテゴリ選択肢の動的調整（出金時と入金時で適切な科目を選ぶ）
  const updateCategoryOptions = (type) => {
    if (!pettyCategorySelect) return;
    pettyCategorySelect.innerHTML = '';

    const expenseCategories = [
      '消耗品費（事務用品・文房具等）',
      '旅費交通費（電車・バス・タクシー等）',
      '通信運搬費（切手・郵送・宅配便等）',
      '水道光熱費・燃料費',
      '清掃・衛生費',
      '会議費・福利厚生（茶菓子等）',
      '雑費',
      'その他'
    ];

    const incomeCategories = [
      '小口現金補充（銀行出金・金庫振替）',
      '戻入（立替金返金等）',
      'その他入金'
    ];

    const categories = type === 'income' ? incomeCategories : expenseCategories;
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.split('（')[0]; // （）の前を値とする
      opt.textContent = cat;
      pettyCategorySelect.appendChild(opt);
    });
  };

  // 出金/入金トグル変更時のイベント
  pettyTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      updateCategoryOptions(input.value);
    });
  });
  updateCategoryOptions('expense'); // 初期値: 出金

  // 画面レンダリング
  const renderPettyCash = () => {
    const summary = pettyCashManager.getSummary();
    const displayList = pettyCashManager.getDisplayList();

    // サマリー更新
    if (summaryBalanceEl) {
      summaryBalanceEl.textContent = formatYen(summary.currentBalance);
      // 残高マイナス警告
      if (summary.currentBalance < 0) {
        summaryBalanceEl.style.color = 'var(--danger)';
        if (balanceWarningEl) balanceWarningEl.style.display = 'block';
      } else {
        summaryBalanceEl.style.color = '';
        if (balanceWarningEl) balanceWarningEl.style.display = 'none';
      }
    }
    if (summaryIncomeEl) summaryIncomeEl.textContent = formatYen(summary.monthlyIncome);
    if (summaryExpenseEl) summaryExpenseEl.textContent = formatYen(summary.monthlyExpense);
    if (summaryCountEl) summaryCountEl.textContent = `${summary.monthlyCount} 件`;

    // テーブル描画
    if (transactionTableBody) {
      transactionTableBody.innerHTML = '';

      if (displayList.length === 0) {
        if (emptyStateEl) emptyStateEl.style.display = 'block';
        return;
      }

      if (emptyStateEl) emptyStateEl.style.display = 'none';

      displayList.forEach(tx => {
        const row = document.createElement('tr');
        const isExpense = tx.type === 'expense';

        row.innerHTML = `
          <td class="numeric">${tx.date}</td>
          <td>
            <span class="badge ${isExpense ? 'badge-expense' : 'badge-income'}">
              ${isExpense ? '出金' : '補充'}
            </span>
          </td>
          <td><strong>${tx.category}</strong></td>
          <td>${tx.memo || '<span style="color:#94a3b8;">-</span>'}</td>
          <td class="numeric" style="color: ${isExpense ? '#94a3b8' : 'var(--info)'}; text-align: right;">
            ${!isExpense ? formatYen(tx.amount) : '-'}
          </td>
          <td class="numeric" style="color: ${isExpense ? 'var(--danger)' : '#94a3b8'}; text-align: right; font-weight: ${isExpense ? '700' : 'normal'};">
            ${isExpense ? formatYen(tx.amount) : '-'}
          </td>
          <td class="numeric" style="text-align: right; font-weight: 700; color: ${tx.balanceAfter < 0 ? 'var(--danger)' : 'var(--navy)'};">
            ${formatYen(tx.balanceAfter)}
          </td>
          <td style="text-align: center;">
            <button class="btn btn-danger-outline btn-delete" data-id="${tx.id}" title="削除">削除</button>
          </td>
        `;

        // 削除ボタンイベント
        const deleteBtn = row.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', () => {
          if (confirm(`【確認】\n${tx.date} の ${tx.category}（${formatYen(tx.amount)}）を削除しますか？\n残高が再計算されます。`)) {
            pettyCashManager.deleteTransaction(tx.id);
            showToast('取引を削除し、残高を再計算しました');
          }
        });

        transactionTableBody.appendChild(row);
      });
    }
  };

  // フォーム送信
  if (pettyForm) {
    pettyForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const selectedType = document.querySelector('input[name="petty-type"]:checked')?.value || 'expense';
      const date = pettyDateInput.value;
      const category = pettyCategorySelect.value;
      const amount = parseInt(pettyAmountInput.value, 10);
      const memo = pettyMemoInput.value;

      try {
        pettyCashManager.addTransaction({
          date,
          type: selectedType,
          category,
          amount,
          memo
        });

        // フォームリセット（日付は維持）
        pettyAmountInput.value = '';
        pettyMemoInput.value = '';
        pettyAmountInput.focus();

        showToast(`${selectedType === 'income' ? '小口補充' : '出金'}を登録しました（残高: ${formatYen(pettyCashManager.getCurrentBalance())}）`);

        // 本部クラウド自動同期
        if (typeof cloudSyncManager !== 'undefined' && cloudSyncManager.isConfigured() && cloudSyncManager.settings.autoSync) {
          cloudSyncManager.syncPettyCash({
            date,
            type: selectedType,
            category,
            amount,
            currentBalance: pettyCashManager.getCurrentBalance(),
            memo
          }).catch(() => {});
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 動作確認用サンプルデータボタン（10,000円補充 → 1,000円出金 → 残高9,000円）
  if (testDataBtn) {
    testDataBtn.addEventListener('click', () => {
      if (confirm('【動作確認サンプル】\n「小口補充 10,000円」および「消耗品費 1,000円」のサンプルデータをセットしますか？\n（現在のデータはサンプルデータに置き換わります）')) {
        pettyCashManager.loadConstitutionalTestData();
        showToast('サンプルデータをセットしました（残高9,000円）');
      }
    });
  }

  // 全データクリア
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', () => {
      if (confirm('【注意】小口現金の全データをリセットしますか？\nこの操作は取り消せません。')) {
        pettyCashManager.clearAll();
        showToast('小口現金のデータをリセットしました');
      }
    });
  }

  // データ購読登録＆初回描画
  pettyCashManager.subscribe(() => {
    renderPettyCash();
  });
  renderPettyCash();

  // ----------------------------------------------------
  // レジ現金＆クレジット決済・日計締め統合管理 (★フェーズ3 実装)
  // ----------------------------------------------------
  const cashRegisterManager = new CashRegisterManager();

  // DOM要素
  const dailyForm = document.getElementById('daily-closing-form');
  const dailyDateInput = document.getElementById('daily-date');
  const dailyChangeFundInput = document.getElementById('daily-change-fund');
  const dailyPresaleInput = document.getElementById('daily-presale-amount');
  const dailyActualCashInput = document.getElementById('daily-actual-cash');
  const dailyCreditSalesInput = document.getElementById('daily-credit-sales');
  const dailyFeeRateInput = document.getElementById('daily-fee-rate');
  const dailyMemoInput = document.getElementById('daily-memo');
  const dailyLockStatusEl = document.getElementById('daily-lock-status');

  // リアルタイムプレビュー要素
  const discrepancyPreviewBox = document.getElementById('daily-discrepancy-preview');
  const previewExpectedCashEl = document.getElementById('preview-expected-cash');
  const previewDiscrepancyAmountEl = document.getElementById('preview-discrepancy-amount');
  const previewDiscrepancyNoteEl = document.getElementById('preview-discrepancy-note');
  const previewFeeAmountEl = document.getElementById('preview-fee-amount');
  const previewNetCreditEl = document.getElementById('preview-net-credit');

  // 小口＆総合プレビュー要素
  const previewDailyPettyExpEl = document.getElementById('preview-daily-petty-exp');
  const previewDailyPettyIncEl = document.getElementById('preview-daily-petty-inc');
  const previewDailyPettyBalEl = document.getElementById('preview-daily-petty-bal');
  const previewCompSalesEl = document.getElementById('preview-comp-sales');
  const previewCompNetEl = document.getElementById('preview-comp-net');
  const previewCompCashEl = document.getElementById('preview-comp-cash');

  // サマリーカード要素
  const dailySummaryDiscrepancyEl = document.getElementById('daily-summary-discrepancy');
  const dailyStatusTagEl = document.getElementById('daily-status-tag');
  const dailySummaryTotalSalesEl = document.getElementById('daily-summary-total-sales');
  const dailySummaryTotalNetEl = document.getElementById('daily-summary-total-net');
  const dailySummaryPettyExpenseEl = document.getElementById('daily-summary-petty-expense');
  const dailySummaryPettyBalanceSubEl = document.getElementById('daily-summary-petty-balance-sub');
  const dailySummaryTotalPhysicalEl = document.getElementById('daily-summary-total-physical');
  const dailyCardDiscrepancyEl = document.getElementById('daily-card-discrepancy');

  // テーブル要素
  const dailyTableBody = document.getElementById('daily-table-body');
  const dailyEmptyStateEl = document.getElementById('daily-empty-state');
  const closingTestBtn = document.getElementById('btn-load-closing-test-data');
  const phase3TestBtn = document.getElementById('btn-load-phase3-test-data');
  const clearClosingDataBtn = document.getElementById('btn-clear-closing-data');

  // モーダル要素
  const detailDialog = document.getElementById('daily-detail-dialog');
  const modalReportBody = document.getElementById('modal-report-body');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCloseReport = document.getElementById('btn-close-report');
  const btnPrintReport = document.getElementById('btn-print-report');

  // 初期日付
  if (dailyDateInput) {
    dailyDateInput.value = new Date().toISOString().substring(0, 10);
  }

  // リアルタイム計算プレビュー更新
  const updateDailyPreviews = () => {
    const selectedDate = dailyDateInput?.value || new Date().toISOString().substring(0, 10);
    const fund = parseInt(dailyChangeFundInput?.value, 10) || 0;
    const presale = parseInt(dailyPresaleInput?.value, 10) || 0;
    const actual = parseInt(dailyActualCashInput?.value, 10) || 0;
    const creditSales = parseInt(dailyCreditSalesInput?.value, 10) || 0;
    const feeRate = parseFloat(dailyFeeRateInput?.value) || 3.24;

    // ① レジ現金照合計算
    const cashCalc = CashRegisterManager.calculateCashDiscrepancy(fund, presale, actual);
    if (previewExpectedCashEl) {
      previewExpectedCashEl.textContent = `あるべき現金: ${formatYen(cashCalc.expectedCash)}`;
    }

    if (discrepancyPreviewBox && previewDiscrepancyAmountEl && previewDiscrepancyNoteEl) {
      discrepancyPreviewBox.classList.remove('match', 'shortage', 'excess');
      discrepancyPreviewBox.classList.add(cashCalc.status);

      if (cashCalc.status === 'match') {
        previewDiscrepancyAmountEl.textContent = '一致（±¥0）';
        previewDiscrepancyNoteEl.textContent = '※ レジ内の実査現金と、あるべき現金が一致しています。';
      } else if (cashCalc.status === 'shortage') {
        previewDiscrepancyAmountEl.textContent = `不足（-${formatYen(Math.abs(cashCalc.discrepancy)).replace('¥', '¥')}）`;
        previewDiscrepancyNoteEl.textContent = '⚠️ 現金が不足しています！レジ内の実査カウントや打ち間違いを再確認してください。';
      } else {
        previewDiscrepancyAmountEl.textContent = `過剰（+${formatYen(cashCalc.discrepancy).replace('¥', '¥')}）`;
        previewDiscrepancyNoteEl.textContent = '⚠️ 現金が過剰です！過剰金の理由（預かり過多・釣り銭渡し漏れ等）を確認してください。';
      }
    }

    // 心理的安全性安心ガイドの開閉制御（過不足発生時に温かいメッセージを自動表示）
    const kindnessBox = document.getElementById('kindness-guidance-box');
    if (kindnessBox) {
      if (cashCalc.status !== 'match' && actual > 0) {
        kindnessBox.style.display = 'block';
      } else {
        kindnessBox.style.display = 'none';
      }
    }

    // ② クレジット計算
    const creditCalc = CashRegisterManager.calculateCredit(creditSales, feeRate);
    if (previewFeeAmountEl) {
      previewFeeAmountEl.textContent = formatYen(creditCalc.feeAmount);
    }
    if (previewNetCreditEl) {
      previewNetCreditEl.textContent = formatYen(creditCalc.netCreditAmount);
    }

    // ③ 小口現金出納状況（選択日の動き）
    const dayTxs = pettyCashManager.transactions.filter(t => t.date === selectedDate);
    let dayExpense = 0;
    let dayIncome = 0;
    for (const tx of dayTxs) {
      if (tx.type === 'expense') dayExpense += tx.amount;
      else if (tx.type === 'income') dayIncome += tx.amount;
    }
    const currentPettyBalance = pettyCashManager.getCurrentBalance();

    if (previewDailyPettyExpEl) previewDailyPettyExpEl.textContent = formatYen(dayExpense);
    if (previewDailyPettyIncEl) previewDailyPettyIncEl.textContent = formatYen(dayIncome);
    if (previewDailyPettyBalEl) previewDailyPettyBalEl.textContent = formatYen(currentPettyBalance);

    // ④ 店舗総合サマリー
    const totalSales = presale + creditSales;
    const totalNet = presale + creditCalc.netCreditAmount;
    const totalPhysicalCash = actual + currentPettyBalance;

    if (previewCompSalesEl) previewCompSalesEl.textContent = formatYen(totalSales);
    if (previewCompNetEl) previewCompNetEl.textContent = formatYen(totalNet);
    if (previewCompCashEl) previewCompCashEl.textContent = formatYen(totalPhysicalCash);
  };

  // 特定日付のデータをフォームにロードする
  const loadDateData = (date) => {
    const existing = cashRegisterManager.getRecordByDate(date);

    if (existing) {
      if (dailyChangeFundInput) dailyChangeFundInput.value = existing.changeFund;
      if (dailyPresaleInput) dailyPresaleInput.value = existing.presaleAmount;
      if (dailyActualCashInput) dailyActualCashInput.value = existing.actualCash;
      if (dailyCreditSalesInput) dailyCreditSalesInput.value = existing.creditSales;
      if (dailyFeeRateInput) dailyFeeRateInput.value = existing.feeRate;
      if (dailyMemoInput) dailyMemoInput.value = existing.memo || '';

      if (dailyLockStatusEl) {
        dailyLockStatusEl.className = 'badge badge-confirmed';
        dailyLockStatusEl.textContent = '確定済 ✓';
      }
    } else {
      if (dailyChangeFundInput) dailyChangeFundInput.value = '50000';
      if (dailyPresaleInput) dailyPresaleInput.value = '';
      if (dailyActualCashInput) dailyActualCashInput.value = '';
      if (dailyCreditSalesInput) dailyCreditSalesInput.value = '0';
      if (dailyFeeRateInput) dailyFeeRateInput.value = '3.24';
      if (dailyMemoInput) dailyMemoInput.value = '';

      if (dailyLockStatusEl) {
        dailyLockStatusEl.className = 'badge badge-unconfirmed';
        dailyLockStatusEl.textContent = '未確定';
      }
    }
    updateDailyPreviews();
  };

  // 日付変更イベント
  if (dailyDateInput) {
    dailyDateInput.addEventListener('change', () => {
      loadDateData(dailyDateInput.value);
      renderDailyClosing();
    });
  }

  // 入力イベントリスナー登録（リアルタイム計算）
  [dailyChangeFundInput, dailyPresaleInput, dailyActualCashInput, dailyCreditSalesInput, dailyFeeRateInput].forEach(input => {
    if (input) {
      input.addEventListener('input', updateDailyPreviews);
    }
  });

  // 日計締め画面レンダリング
  const renderDailyClosing = () => {
    const records = cashRegisterManager.getDisplayRecords();

    // 選択日付または最新レコードの総合サマリーを取得
    const selectedDate = dailyDateInput?.value || new Date().toISOString().substring(0, 10);
    const summary = cashRegisterManager.getComprehensiveSummary(selectedDate, pettyCashManager);

    // サマリーカードの更新
    if (dailySummaryDiscrepancyEl) {
      if (summary.status === 'match') {
        dailySummaryDiscrepancyEl.textContent = '±¥0';
      } else if (summary.status === 'shortage') {
        dailySummaryDiscrepancyEl.textContent = `-¥${Math.abs(summary.discrepancy).toLocaleString('ja-JP')}`;
      } else {
        dailySummaryDiscrepancyEl.textContent = `+¥${summary.discrepancy.toLocaleString('ja-JP')}`;
      }
    }

    if (dailyCardDiscrepancyEl) {
      dailyCardDiscrepancyEl.classList.remove('primary', 'danger', 'info');
      if (summary.status === 'shortage') {
        dailyCardDiscrepancyEl.classList.add('danger');
      } else {
        dailyCardDiscrepancyEl.classList.add('primary');
      }
    }

    if (dailyStatusTagEl) {
      dailyStatusTagEl.className = 'badge';
      if (summary.hasRecord) {
        if (summary.status === 'match') {
          dailyStatusTagEl.classList.add('badge-match');
          dailyStatusTagEl.textContent = '一致（正常）';
        } else if (summary.status === 'shortage') {
          dailyStatusTagEl.classList.add('badge-shortage');
          dailyStatusTagEl.textContent = `不足（-${Math.abs(summary.discrepancy).toLocaleString('ja-JP')}円）⚠️`;
        } else {
          dailyStatusTagEl.classList.add('badge-excess');
          dailyStatusTagEl.textContent = `過剰（+${summary.discrepancy.toLocaleString('ja-JP')}円）⚠️`;
        }
      } else {
        dailyStatusTagEl.classList.add('badge-unconfirmed');
        dailyStatusTagEl.textContent = '未確定';
      }
    }

    if (dailySummaryTotalSalesEl) dailySummaryTotalSalesEl.textContent = formatYen(summary.totalSales);
    if (dailySummaryTotalNetEl) dailySummaryTotalNetEl.textContent = formatYen(summary.totalNetExpected);
    if (dailySummaryPettyExpenseEl) dailySummaryPettyExpenseEl.textContent = formatYen(summary.pettyExpense);
    if (dailySummaryPettyBalanceSubEl) dailySummaryPettyBalanceSubEl.textContent = `小口現金残高: ${formatYen(summary.pettyBalance)}`;
    if (dailySummaryTotalPhysicalEl) dailySummaryTotalPhysicalEl.textContent = formatYen(summary.totalPhysicalCash);

    // テーブル描画
    if (dailyTableBody) {
      dailyTableBody.innerHTML = '';

      if (records.length === 0) {
        if (dailyEmptyStateEl) dailyEmptyStateEl.style.display = 'block';
        return;
      }

      if (dailyEmptyStateEl) dailyEmptyStateEl.style.display = 'none';

      records.forEach(r => {
        const row = document.createElement('tr');

        let statusBadge = '';
        if (r.status === 'match') {
          statusBadge = '<span class="badge badge-match">±¥0 一致</span>';
        } else if (r.status === 'shortage') {
          statusBadge = `<span class="badge badge-shortage">不足 -¥${Math.abs(r.discrepancy).toLocaleString('ja-JP')}</span>`;
        } else {
          statusBadge = `<span class="badge badge-excess">過剰 +¥${r.discrepancy.toLocaleString('ja-JP')}</span>`;
        }

        const totalSales = r.totalSales || (r.presaleAmount + r.creditSales);
        const totalNet = r.totalNetExpected || (r.presaleAmount + r.netCreditAmount);

        row.innerHTML = `
          <td class="numeric"><strong>${r.date}</strong></td>
          <td class="numeric" style="text-align: right; color: var(--info);">${formatYen(r.presaleAmount)}</td>
          <td class="numeric" style="text-align: right; font-weight: 700;">${formatYen(r.actualCash)}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td class="numeric" style="text-align: right;">${formatYen(r.creditSales)}</td>
          <td class="numeric" style="text-align: right; font-weight: 700;">${formatYen(totalSales)}</td>
          <td class="numeric" style="text-align: right; font-weight: 700; color: var(--primary-dark);">${formatYen(totalNet)}</td>
          <td>${r.memo || '<span style="color:#94a3b8;">-</span>'}</td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn btn-secondary btn-view-detail" data-date="${r.date}" style="padding: 0.25rem 0.55rem; font-size: 0.8rem; margin-right: 0.25rem;" title="詳細日報閲覧">詳細</button>
            <button class="btn btn-danger-outline btn-delete-daily" data-id="${r.id}" style="padding: 0.25rem 0.55rem; font-size: 0.8rem;" title="削除">削除</button>
          </td>
        `;

        // 詳細ボタン
        const viewBtn = row.querySelector('.btn-view-detail');
        viewBtn.addEventListener('click', () => {
          openDetailModal(r.date);
        });

        // 削除ボタン
        const deleteBtn = row.querySelector('.btn-delete-daily');
        deleteBtn.addEventListener('click', () => {
          if (confirm(`【確認】\n締め日: ${r.date} の締めデータを削除しますか？`)) {
            cashRegisterManager.deleteRecord(r.id);
            if (dailyDateInput?.value === r.date) {
              loadDateData(r.date);
            }
            showToast('締めデータを削除しました');
          }
        });

        dailyTableBody.appendChild(row);
      });
    }
  };

  // 詳細閲覧モーダルを開く
  const openDetailModal = (date) => {
    if (!detailDialog || !modalReportBody) return;

    const summary = cashRegisterManager.getComprehensiveSummary(date, pettyCashManager);
    if (!summary.hasRecord) {
      showToast('対象日の締めデータが見つかりません', 'error');
      return;
    }

    // 小口現金明細行の生成
    let pettyRows = '';
    if (summary.pettyTransactions.length === 0) {
      pettyRows = '<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding: 0.5rem;">この日の小口取引はありません</td></tr>';
    } else {
      summary.pettyTransactions.forEach(t => {
        const isExp = t.type === 'expense';
        pettyRows += `
          <tr>
            <td><span class="badge ${isExp ? 'badge-expense' : 'badge-income'}">${isExp ? '出金' : '補充'}</span></td>
            <td><strong>${t.category}</strong></td>
            <td>${t.memo || '-'}</td>
            <td class="numeric" style="text-align: right; font-weight: bold; color: ${isExp ? 'var(--danger)' : 'var(--info)'};">
              ${isExp ? '-' : '+'}${formatYen(t.amount)}
            </td>
          </tr>
        `;
      });
    }

    modalReportBody.innerHTML = `
      <!-- ヘッダー情報 -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--navy);">
        <div>
          <span style="font-size: 1.25rem; font-weight: 800;">締め日: ${summary.date}</span>
          <span class="badge badge-confirmed" style="margin-left: 0.5rem;">確定済</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          最終更新: ${summary.updatedAt ? new Date(summary.updatedAt).toLocaleString('ja-JP') : '-'}
        </div>
      </div>

      <!-- 店舗総合サマリー -->
      <div class="report-section">
        <div class="report-section-title">🏛️ 店舗総合サマリー（本日の総合計）</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.5rem;">
          <div class="report-item">
            <div class="report-item-label">本日総売上（窓口現金＋クレジット）</div>
            <div class="report-item-val numeric" style="color: var(--navy);">${formatYen(summary.totalSales)}</div>
          </div>
          <div class="report-item">
            <div class="report-item-label">純入金見込計（現金＋クレジット手取り）</div>
            <div class="report-item-val numeric" style="color: var(--primary-dark);">${formatYen(summary.totalNetExpected)}</div>
          </div>
          <div class="report-item">
            <div class="report-item-label">手元実査現金計（レジ現物＋小口金庫）</div>
            <div class="report-item-val numeric" style="color: #0284c7;">${formatYen(summary.totalPhysicalCash)}</div>
          </div>
        </div>
      </div>

      <!-- ① レジ現金照合 -->
      <div class="report-section">
        <div class="report-section-title">💵 ① レジ現金照合</div>
        <div class="report-grid-2">
          <div class="report-item">
            <div class="report-item-label">つり銭準備金</div>
            <div class="report-item-val numeric">${formatYen(summary.changeFund)}</div>
          </div>
          <div class="report-item">
            <div class="report-item-label">レセコン窓口現金売上</div>
            <div class="report-item-val numeric">${formatYen(summary.presaleAmount)}</div>
          </div>
          <div class="report-item">
            <div class="report-item-label">本来あるべき現金合計</div>
            <div class="report-item-val numeric">${formatYen(summary.expectedCash)}</div>
          </div>
          <div class="report-item">
            <div class="report-item-label">実査現金合計（レジ内実数）</div>
            <div class="report-item-val numeric" style="font-weight: 800;">${formatYen(summary.actualCash)}</div>
          </div>
        </div>
        <div style="margin-top: 0.5rem; padding: 0.6rem; border-radius: 6px; background: ${summary.status === 'shortage' ? 'var(--danger-light)' : (summary.status === 'match' ? 'var(--primary-light)' : '#fffbeb')};">
          <strong style="color: ${summary.status === 'shortage' ? 'var(--danger)' : (summary.status === 'match' ? 'var(--primary)' : 'var(--warning)')};">
            過不足判定: ${summary.statusLabel}
          </strong>
        </div>
      </div>

      <!-- ② クレジット決済 -->
      <div class="report-section">
        <div class="report-section-title">💳 ② クレジット決済</div>
        <div class="report-grid-2">
          <div class="report-item">
            <div class="report-item-label">クレジット日計売上額</div>
            <div class="report-item-val numeric">${formatYen(summary.creditSales)}</div>
          </div>
          <div class="report-item">
            <div class="report-item-label">決済手数料（${summary.feeRate}%・四捨五入）</div>
            <div class="report-item-val numeric" style="color: #64748b;">${formatYen(summary.feeAmount)}</div>
          </div>
        </div>
        <div style="margin-top: 0.5rem; padding: 0.5rem 0.8rem; background: #eff6ff; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: #1e40af; font-weight: 600;">差引入金見込額:</span>
          <strong class="numeric" style="font-size: 1.15rem; color: var(--primary-dark);">${formatYen(summary.netCreditAmount)}</strong>
        </div>
      </div>

      <!-- ③ 当日の小口出納明細 -->
      <div class="report-section">
        <div class="report-section-title">👛 ③ 本日の小口現金出納明細（領収書等）</div>
        <table class="data-table" style="font-size: 0.8rem;">
          <thead>
            <tr>
              <th>区分</th>
              <th>科目</th>
              <th>摘要</th>
              <th style="text-align: right;">金額</th>
            </tr>
          </thead>
          <tbody>
            ${pettyRows}
          </tbody>
        </table>
        <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; font-size: 0.85rem;">
          <span>本日小口出金計: <strong class="numeric" style="color: var(--danger);">${formatYen(summary.pettyExpense)}</strong></span>
          <span>小口現金残高: <strong class="numeric">${formatYen(summary.pettyBalance)}</strong></span>
        </div>
      </div>

      <!-- 引継ぎメモ -->
      <div class="report-section">
        <div class="report-section-title">📝 理由・引継ぎメモ</div>
        <div style="background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #e2e8f0; min-height: 40px; white-space: pre-wrap;">
          ${summary.memo || '（記載なし）'}
        </div>
      </div>
    `;

    if (typeof detailDialog.showModal === 'function') {
      detailDialog.showModal();
    } else {
      detailDialog.setAttribute('open', '');
    }
  };

  // モーダル閉じる
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      if (typeof detailDialog.close === 'function') detailDialog.close();
      else detailDialog.removeAttribute('open');
    });
  }
  if (btnCloseReport) {
    btnCloseReport.addEventListener('click', () => {
      if (typeof detailDialog.close === 'function') detailDialog.close();
      else detailDialog.removeAttribute('open');
    });
  }
  if (btnPrintReport) {
    btnPrintReport.addEventListener('click', () => {
      window.print();
    });
  }

  // フォーム送信（確定・保存）
  if (dailyForm) {
    dailyForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const date = dailyDateInput.value;
      const changeFund = parseInt(dailyChangeFundInput.value, 10) || 0;
      const presaleAmount = parseInt(dailyPresaleInput.value, 10) || 0;
      const actualCash = parseInt(dailyActualCashInput.value, 10) || 0;
      const creditSales = parseInt(dailyCreditSalesInput.value, 10) || 0;
      const feeRate = parseFloat(dailyFeeRateInput.value) || 3.24;
      const memo = dailyMemoInput.value;

      try {
        const saved = cashRegisterManager.saveRecord({
          date,
          changeFund,
          presaleAmount,
          actualCash,
          creditSales,
          feeRate,
          memo
        });

        if (dailyLockStatusEl) {
          dailyLockStatusEl.className = 'badge badge-confirmed';
          dailyLockStatusEl.textContent = '確定済 ✓';
        }

        if (saved.status === 'shortage') {
          showToast(`【注意】${date} の日計締めを確定・保存しました。現金のズレ: 不足 -¥${Math.abs(saved.discrepancy).toLocaleString('ja-JP')}`, 'error');
        } else if (saved.status === 'excess') {
          showToast(`${date} の日計締めを確定・保存しました。現金のズレ: 過剰 +¥${saved.discrepancy.toLocaleString('ja-JP')}`, 'error');
        } else {
          showToast(`${date} の日計締めを確定・保存しました（レジ現金一致✓）`, 'success');
        }

        // 温かい労いモーダルの表示（今日もお疲れ様でした）
        const warmDialog = document.getElementById('warm-closing-dialog');
        const warmSummaryCard = document.getElementById('warm-closing-summary-card');
        if (warmDialog && warmSummaryCard) {
          let statusText = '✅ レジ現金ピッタリ一致（過不足なし）';
          if (saved.status === 'shortage') {
            statusText = `⚠️ レジ現金不足: -¥${Math.abs(saved.discrepancy).toLocaleString('ja-JP')}（理由メモ記録済）`;
          } else if (saved.status === 'excess') {
            statusText = `⚠️ レジ現金過剰: +¥${saved.discrepancy.toLocaleString('ja-JP')}（理由メモ記録済）`;
          }
          warmSummaryCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; font-size:0.88rem;">
              <span style="color:var(--text-muted);">📅 締め日:</span>
              <strong class="numeric">${date}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; font-size:0.88rem;">
              <span style="color:var(--text-muted);">⚖️ 照合結果:</span>
              <strong>${statusText}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; font-size:0.88rem;">
              <span style="color:var(--text-muted);">🧾 本日総売上:</span>
              <strong class="numeric">${formatYen(saved.totalSales)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.88rem;">
              <span style="color:var(--text-muted);">💳 純入金見込計:</span>
              <strong class="numeric" style="color:var(--primary-dark);">${formatYen(saved.totalNetExpected)}</strong>
            </div>
          // 実務UI: 保存時の不要なポップアップ割り込みを停止（確認は静かなトーストで完了）
          // if (typeof warmDialog.showModal === 'function') { warmDialog.showModal(); }
        }

        // 本部クラウド自動同期（設定済みかつ有効時）
        if (typeof cloudSyncManager !== 'undefined' && cloudSyncManager.isConfigured() && cloudSyncManager.settings.autoSync) {
          cloudSyncManager.syncDailyClosing(saved).then(res => {
            if (res && res.success) {
              showToast('☁️ 本部Googleスプレッドシートへリアルタイム同期しました！', 'success');
            } else if (res && res.status === 'queued') {
              showToast('☁️ オフラインのため未送信キューに保存しました（復帰時に自動再送）', 'info');
            }
          }).catch(e => {
            console.warn('クラウド同期エラー:', e);
          });
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 動作確認用サンプルデータボタン（レジ現金＆クレジット）
  if (closingTestBtn) {
    closingTestBtn.addEventListener('click', () => {
      if (confirm('【動作確認サンプル】\n「つり銭準備金 50,000円」「レセコン売上 10,000円」「実査現金 59,800円（200円不足）」「クレジット 10,000円（手数料324円）」のサンプルデータをセットしますか？')) {
        cashRegisterManager.loadConstitutionalTestData();

        const today = new Date().toISOString().substring(0, 10);
        if (dailyDateInput) dailyDateInput.value = today;
        loadDateData(today);
        showToast('サンプルデータをセットしました（実査200円不足、クレジット手数料324円）', 'info');
      }
    });
  }

  // 複数日サンプルデータボタン（複数日：Day 1 & Day 2）
  if (phase3TestBtn) {
    phase3TestBtn.addEventListener('click', () => {
      if (confirm('【動作確認サンプル】\n「Day1（2026-09-17: 200円不足・小口1千円出金）」および「Day2（2026-09-18: 一致・クレジット5千円）」の複数日サンプルデータをセットしますか？')) {
        cashRegisterManager.loadPhase3ConstitutionalTestData(pettyCashManager);

        // まずDay 1を表示
        if (dailyDateInput) dailyDateInput.value = '2026-09-17';
        loadDateData('2026-09-17');
        showToast('複数日サンプルデータ（Day 1 & Day 2）をセットしました。日付を切り替えて履歴を確認できます。', 'success');
      }
    });
  }

  // レジ締め全データクリア
  // レジ締め全データクリア
  if (clearClosingDataBtn) {
    clearClosingDataBtn.addEventListener('click', () => {
      if (confirm('【注意】日計締めの全データをリセットしますか？\nこの操作は取り消せません。')) {
        cashRegisterManager.clearAll();
        loadDateData(dailyDateInput?.value || new Date().toISOString().substring(0, 10));
        showToast('日計締めのデータをリセットしました');
      }
    });
  }

  // 小口現金マネージャーが変更された時も締め画面のプレビューとサマリーを即時再計算
  pettyCashManager.subscribe(() => {
    updateDailyPreviews();
    renderDailyClosing();
  });

  // データ購読登録＆初回描画
  cashRegisterManager.subscribe(() => {
    renderDailyClosing();
  });

  // 初回ロード
  loadDateData(dailyDateInput?.value || new Date().toISOString().substring(0, 10));
  renderDailyClosing();

  // ====================================================
  // 【フェーズ4: 調剤報酬消込・返戻追跡 管理】
  // ====================================================
  const reconciliationManager = new ReconciliationManager();

  // DOM要素取得
  const reconcileMonthSelect = document.getElementById('reconcile-month-select');
  const btnLoadReconcileTest = document.getElementById('btn-load-reconcile-test');
  const btnClearReconcileData = document.getElementById('btn-clear-reconcile-data');

  // サマリーカード要素
  const reconcileSumBilled = document.getElementById('reconcile-sum-billed');
  const reconcileSumBilledSub = document.getElementById('reconcile-sum-billed-sub');
  const reconcileSumPaid = document.getElementById('reconcile-sum-paid');
  const reconcileSumPaidSub = document.getElementById('reconcile-sum-paid-sub');
  const reconcileCardDiscrepancy = document.getElementById('reconcile-card-discrepancy');
  const reconcileStatusTag = document.getElementById('reconcile-status-tag');
  const reconcileSumDiscrepancy = document.getElementById('reconcile-sum-discrepancy');
  const reconcileSumDiscrepancySub = document.getElementById('reconcile-sum-discrepancy-sub');
  const reconcileSumRemandTotal = document.getElementById('reconcile-sum-remand-total');
  const reconcileSumRemandSub = document.getElementById('reconcile-sum-remand-sub');
  const reconcileCardUnaccounted = document.getElementById('reconcile-card-unaccounted');
  const reconcileUnaccountedTag = document.getElementById('reconcile-unaccounted-tag');
  const reconcileSumUnaccounted = document.getElementById('reconcile-sum-unaccounted');
  const reconcileSumUnaccountedSub = document.getElementById('reconcile-sum-unaccounted-sub');

  // アラートバナー
  const reconcileAlertBanner = document.getElementById('reconcile-alert-banner');
  const reconcileAlertIcon = document.getElementById('reconcile-alert-icon');
  const reconcileAlertTitle = document.getElementById('reconcile-alert-title');
  const reconcileAlertDesc = document.getElementById('reconcile-alert-desc');

  // 請求・入金実績登録フォーム
  const reconcileBillingForm = document.getElementById('reconcile-billing-form');
  const reconcileRecordStatus = document.getElementById('reconcile-record-status');
  const reconcileFormBillingMonth = document.getElementById('reconcile-form-billing-month');
  const reconcileFormBilledAmount = document.getElementById('reconcile-form-billed-amount');
  const reconcileFormDepositMonth = document.getElementById('reconcile-form-deposit-month');
  const reconcileFormPaidAmount = document.getElementById('reconcile-form-paid-amount');
  const reconcileFormDiscrepancyPreview = document.getElementById('reconcile-form-discrepancy-preview');
  const reconcileFormMemo = document.getElementById('reconcile-form-memo');

  // 返戻・保留登録フォーム
  const reconcileRemandForm = document.getElementById('reconcile-remand-form');
  const remandFormBillingMonth = document.getElementById('remand-form-billing-month');
  const remandFormChartId = document.getElementById('remand-form-chart-id');
  const remandFormAmount = document.getElementById('remand-form-amount');
  const remandFormReason = document.getElementById('remand-form-reason');
  const remandFormStatus = document.getElementById('remand-form-status');
  const remandFormNote = document.getElementById('remand-form-note');

  // 返戻追跡一覧
  const remandTableBody = document.getElementById('remand-table-body');
  const remandEmptyState = document.getElementById('remand-empty-state');
  const remandCountBadge = document.getElementById('remand-count-badge');
  const remandFilterStatus = document.getElementById('remand-filter-status');

  // 請求月履歴サマリー一覧
  const reconcileHistoryTableBody = document.getElementById('reconcile-history-table-body');
  const reconcileHistoryEmpty = document.getElementById('reconcile-history-empty');

  // 事由選択肢の初期化
  if (remandFormReason) {
    remandFormReason.innerHTML = '';
    ReconciliationManager.REASON_CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      remandFormReason.appendChild(opt);
    });
  }

  // 請求・入金フォームの差額プレビュー計算
  const updateBillingFormDiscrepancyPreview = () => {
    if (!reconcileFormDiscrepancyPreview) return;
    const billed = parseInt(reconcileFormBilledAmount?.value, 10) || 0;
    const paid = parseInt(reconcileFormPaidAmount?.value, 10) || 0;
    const diff = paid - billed;

    if (diff === 0) {
      reconcileFormDiscrepancyPreview.textContent = '¥0（一致）';
      reconcileFormDiscrepancyPreview.style.color = 'var(--primary)';
    } else if (diff < 0) {
      reconcileFormDiscrepancyPreview.textContent = `-¥${Math.abs(diff).toLocaleString('ja-JP')}（入金不足）`;
      reconcileFormDiscrepancyPreview.style.color = 'var(--danger)';
    } else {
      reconcileFormDiscrepancyPreview.textContent = `+¥${diff.toLocaleString('ja-JP')}（入金過剰）`;
      reconcileFormDiscrepancyPreview.style.color = 'var(--info)';
    }
  };

  if (reconcileFormBilledAmount) {
    reconcileFormBilledAmount.addEventListener('input', updateBillingFormDiscrepancyPreview);
  }
  if (reconcileFormPaidAmount) {
    reconcileFormPaidAmount.addEventListener('input', updateBillingFormDiscrepancyPreview);
  }

  // 請求年月変更時に入金年月（2ヶ月後）を自動設定
  if (reconcileFormBillingMonth) {
    reconcileFormBillingMonth.addEventListener('change', () => {
      const m = reconcileFormBillingMonth.value;
      if (m && reconcileFormDepositMonth && !reconcileFormDepositMonth.value) {
        reconcileFormDepositMonth.value = ReconciliationManager.calculateExpectedDepositMonth(m);
      }
      if (remandFormBillingMonth) {
        remandFormBillingMonth.value = m;
      }
    });
  }

  // 指定請求月の全データ読み込み＆画面描画
  const loadReconcileMonth = (billingMonth) => {
    if (!billingMonth) return;

    // セレクターとフォームの月を同期
    if (reconcileMonthSelect) reconcileMonthSelect.value = billingMonth;
    if (reconcileFormBillingMonth) reconcileFormBillingMonth.value = billingMonth;
    if (remandFormBillingMonth) remandFormBillingMonth.value = billingMonth;

    const summary = reconciliationManager.getMonthlySummaryWithRemands(billingMonth);
    const existing = reconciliationManager.getMonthlyRecord(billingMonth);

    // フォームへの反映
    if (existing) {
      if (reconcileRecordStatus) {
        reconcileRecordStatus.className = 'badge badge-confirmed';
        reconcileRecordStatus.textContent = '登録済 ✓';
      }
      if (reconcileFormBilledAmount) reconcileFormBilledAmount.value = existing.billedAmount;
      if (reconcileFormDepositMonth) reconcileFormDepositMonth.value = existing.depositMonth;
      if (reconcileFormPaidAmount) reconcileFormPaidAmount.value = existing.paidAmount;
      if (reconcileFormMemo) reconcileFormMemo.value = existing.memo || '';
    } else {
      if (reconcileRecordStatus) {
        reconcileRecordStatus.className = 'badge badge-unconfirmed';
        reconcileRecordStatus.textContent = '未登録';
      }
      if (reconcileFormBilledAmount) reconcileFormBilledAmount.value = '';
      if (reconcileFormDepositMonth) {
        reconcileFormDepositMonth.value = ReconciliationManager.calculateExpectedDepositMonth(billingMonth);
      }
      if (reconcileFormPaidAmount) reconcileFormPaidAmount.value = '';
      if (reconcileFormMemo) reconcileFormMemo.value = '';
    }
    updateBillingFormDiscrepancyPreview();

    // サマリーカード描画
    if (reconcileSumBilled) reconcileSumBilled.textContent = formatYen(summary.billedAmount);
    if (reconcileSumBilledSub) reconcileSumBilledSub.textContent = `請求対象: ${billingMonth}`;

    if (reconcileSumPaid) reconcileSumPaid.textContent = formatYen(summary.paidAmount);
    if (reconcileSumPaidSub) reconcileSumPaidSub.textContent = `入金月: ${summary.depositMonth || '--'}`;

    // 入金差額カード
    if (reconcileSumDiscrepancy) {
      if (summary.discrepancy === 0) {
        reconcileSumDiscrepancy.textContent = '¥0';
      } else if (summary.discrepancy < 0) {
        reconcileSumDiscrepancy.textContent = `-¥${Math.abs(summary.discrepancy).toLocaleString('ja-JP')}`;
      } else {
        reconcileSumDiscrepancy.textContent = `+¥${summary.discrepancy.toLocaleString('ja-JP')}`;
      }
    }

    if (reconcileCardDiscrepancy && reconcileStatusTag) {
      reconcileCardDiscrepancy.classList.remove('primary', 'danger', 'info');
      reconcileStatusTag.className = 'badge';

      if (summary.discrepancy === 0) {
        reconcileCardDiscrepancy.classList.add('primary');
        reconcileStatusTag.classList.add('badge-match');
        reconcileStatusTag.textContent = '一致（正常）';
      } else if (summary.discrepancy < 0) {
        reconcileCardDiscrepancy.classList.add('danger');
        reconcileStatusTag.classList.add('badge-shortage');
        reconcileStatusTag.textContent = `不足 -¥${Math.abs(summary.discrepancy).toLocaleString('ja-JP')}`;
      } else {
        reconcileCardDiscrepancy.classList.add('info');
        reconcileStatusTag.classList.add('badge-excess');
        reconcileStatusTag.textContent = `過剰 +¥${summary.discrepancy.toLocaleString('ja-JP')}`;
      }
    }

    // 返戻・保留総額カード
    if (reconcileSumRemandTotal) {
      reconcileSumRemandTotal.textContent = formatYen(summary.totalRemandAmount);
    }
    if (reconcileSumRemandSub) {
      reconcileSumRemandSub.textContent = `未対応: ${summary.unhandledCount}件 (¥${summary.unhandledAmount.toLocaleString('ja-JP')}) / 再請求中: ${summary.rebillingCount}件`;
    }

    // 原因未特定差額カード
    if (reconcileSumUnaccounted && reconcileCardUnaccounted && reconcileUnaccountedTag && reconcileSumUnaccountedSub) {
      reconcileCardUnaccounted.classList.remove('primary', 'danger', 'warning');
      reconcileUnaccountedTag.className = 'badge';

      if (summary.shortageAmount === 0) {
        reconcileSumUnaccounted.textContent = '¥0';
        reconcileCardUnaccounted.classList.add('primary');
        reconcileUnaccountedTag.classList.add('badge-match');
        reconcileUnaccountedTag.textContent = '差額なし';
        reconcileSumUnaccountedSub.textContent = '請求と入金が一致しています';
      } else if (summary.unaccountedAmount === 0) {
        reconcileSumUnaccounted.textContent = '¥0';
        reconcileCardUnaccounted.classList.add('primary');
        reconcileUnaccountedTag.classList.add('badge-match');
        reconcileUnaccountedTag.textContent = '特定済（100%）';
        reconcileSumUnaccountedSub.textContent = '差額の全額が返戻明細と合致';
      } else if (summary.unaccountedAmount > 0) {
        reconcileSumUnaccounted.textContent = `¥${summary.unaccountedAmount.toLocaleString('ja-JP')}`;
        reconcileCardUnaccounted.classList.add('danger');
        reconcileUnaccountedTag.classList.add('badge-shortage');
        reconcileUnaccountedTag.textContent = '未特定 ⚠️';
        reconcileSumUnaccountedSub.textContent = '差額の原因明細が未登録です';
      } else {
        reconcileSumUnaccounted.textContent = `¥${Math.abs(summary.unaccountedAmount).toLocaleString('ja-JP')}`;
        reconcileCardUnaccounted.classList.add('warning');
        reconcileUnaccountedTag.textContent = '返戻超過';
        reconcileSumUnaccountedSub.textContent = '返戻額が差額を超過しています';
      }
    }

    // 突合アラートバナー
    if (reconcileAlertBanner && reconcileAlertIcon && reconcileAlertTitle && reconcileAlertDesc) {
      reconcileAlertBanner.style.display = 'flex';
      reconcileAlertBanner.className = 'alert-banner';

      if (summary.shortageAmount === 0) {
        reconcileAlertBanner.classList.add('success');
        reconcileAlertIcon.textContent = '✅';
        reconcileAlertTitle.textContent = `${billingMonth} 請求・入金消込完了`;
        reconcileAlertDesc.textContent = `請求総額（¥${summary.billedAmount.toLocaleString('ja-JP')}）と入金総額（¥${summary.paidAmount.toLocaleString('ja-JP')}）が完全一致しています。`;
      } else if (summary.reconciliationStatus === 'fully_explained') {
        reconcileAlertBanner.classList.add('success');
        reconcileAlertIcon.textContent = '🛡️';
        reconcileAlertTitle.textContent = `差額原因の完全特定済（説明率 100%）`;
        reconcileAlertDesc.textContent = `請求不足額 ¥${summary.shortageAmount.toLocaleString('ja-JP')} に対し、返戻・保留明細（${summary.totalRemandCount}件、計¥${summary.totalRemandAmount.toLocaleString('ja-JP')}）が完全に特定されています。放置せず再請求手続きを進めてください。`;
      } else if (summary.reconciliationStatus === 'partially_explained') {
        reconcileAlertBanner.classList.add('danger');
        reconcileAlertIcon.textContent = '⚠️';
        reconcileAlertTitle.textContent = `【警告】原因不明の未収差額が残存しています`;
        reconcileAlertDesc.textContent = `入金不足 ¥${summary.shortageAmount.toLocaleString('ja-JP')} のうち、¥${summary.unaccountedAmount.toLocaleString('ja-JP')} が原因未特定です。支払基金・国保連の通知書を確認し、返戻案件の追加登録を行ってください。`;
      } else {
        reconcileAlertBanner.classList.add('warning');
        reconcileAlertIcon.textContent = 'ℹ️';
        reconcileAlertTitle.textContent = `返戻登録額の超過`;
        reconcileAlertDesc.textContent = summary.reconciliationMessage;
      }
    }

    // 返戻追跡テーブルの描画
    renderRemandTable(summary.items);

    // 請求月履歴サマリーテーブルの描画
    renderReconcileHistory();
  };

  // 返戻テーブルのレンダリング
  const renderRemandTable = (items) => {
    if (!remandTableBody) return;
    remandTableBody.innerHTML = '';

    const filter = remandFilterStatus?.value || 'all';
    const filtered = items.filter(item => {
      if (filter === 'all') return true;
      return item.status === filter;
    });

    if (remandCountBadge) {
      remandCountBadge.textContent = `${items.length} 件の案件（表示: ${filtered.length}件）`;
    }

    if (filtered.length === 0) {
      if (remandEmptyState) remandEmptyState.style.display = 'block';
      return;
    }

    if (remandEmptyState) remandEmptyState.style.display = 'none';

    filtered.forEach(item => {
      const tr = document.createElement('tr');

      const statusInfo = ReconciliationManager.STATUS_MAP[item.status] || {
        label: item.status,
        badgeClass: '',
        icon: ''
      };

      tr.innerHTML = `
        <td style="font-weight: 700;" class="numeric">
          <span>🆔 ${item.patientChartId}</span>
        </td>
        <td style="text-align: right; font-weight: 700; color: var(--danger);" class="numeric">
          ¥${item.amount.toLocaleString('ja-JP')}
        </td>
        <td style="font-size: 0.85rem;">
          ${item.reason}
        </td>
        <td>
          <select class="status-select-inline status-${item.status}" data-item-id="${item.id}">
            <option value="unhandled" ${item.status === 'unhandled' ? 'selected' : ''}>⚠️ 未対応</option>
            <option value="rebilling" ${item.status === 'rebilling' ? 'selected' : ''}>🔄 再請求中</option>
            <option value="resolved" ${item.status === 'resolved' ? 'selected' : ''}>✅ 入金済/解決</option>
          </select>
          ${item.resolvedDate ? `<div style="font-size: 0.72rem; color: #059669; margin-top: 0.2rem;">解決日: ${item.resolvedDate}</div>` : ''}
        </td>
        <td style="font-size: 0.82rem; max-width: 200px;">
          <span class="remand-note-text">${item.handlingNote || '<span style="color: var(--text-muted); font-style: italic;">なし</span>'}</span>
        </td>
        <td style="text-align: center;">
          <button class="btn-action-delete btn-delete-remand" data-item-id="${item.id}" title="削除">
            🗑️
          </button>
        </td>
      `;

      remandTableBody.appendChild(tr);
    });
  };

  // 請求月履歴サマリーテーブルのレンダリング
  const renderReconcileHistory = () => {
    if (!reconcileHistoryTableBody) return;
    reconcileHistoryTableBody.innerHTML = '';

    const records = reconciliationManager.monthlyRecords;
    if (records.length === 0) {
      if (reconcileHistoryEmpty) reconcileHistoryEmpty.style.display = 'block';
      return;
    }

    if (reconcileHistoryEmpty) reconcileHistoryEmpty.style.display = 'none';

    records.forEach(rec => {
      const summary = reconciliationManager.getMonthlySummaryWithRemands(rec.billingMonth);
      const tr = document.createElement('tr');

      const isCurrent = rec.billingMonth === reconcileMonthSelect?.value;
      if (isCurrent) tr.style.backgroundColor = '#f0fdf4';

      let statusBadge = '';
      if (summary.shortageAmount === 0) {
        statusBadge = '<span class="badge badge-match">一致</span>';
      } else if (summary.reconciliationStatus === 'fully_explained') {
        statusBadge = '<span class="badge badge-match">完全特定済</span>';
      } else if (summary.reconciliationStatus === 'partially_explained') {
        statusBadge = `<span class="badge badge-shortage">未特定 ¥${summary.unaccountedAmount.toLocaleString('ja-JP')}</span>`;
      } else {
        statusBadge = '<span class="badge badge-excess">超過</span>';
      }

      tr.innerHTML = `
        <td style="font-weight: 700;">
          ${rec.billingMonth} ${isCurrent ? '<span style="font-size: 0.72rem; color: var(--primary);">（選択中）</span>' : ''}
        </td>
        <td style="font-size: 0.85rem;">
          ${rec.depositMonth || '--'}
        </td>
        <td style="text-align: right;" class="numeric">
          ¥${rec.billedAmount.toLocaleString('ja-JP')}
        </td>
        <td style="text-align: right;" class="numeric">
          ¥${rec.paidAmount.toLocaleString('ja-JP')}
        </td>
        <td style="text-align: right; font-weight: 700; color: ${rec.discrepancy < 0 ? 'var(--danger)' : (rec.discrepancy > 0 ? 'var(--info)' : 'var(--text-main)')};" class="numeric">
          ${rec.discrepancy < 0 ? '-¥' + Math.abs(rec.discrepancy).toLocaleString('ja-JP') : '¥' + rec.discrepancy.toLocaleString('ja-JP')}
        </td>
        <td style="text-align: right; font-weight: 700;" class="numeric">
          ¥${summary.totalRemandAmount.toLocaleString('ja-JP')}
        </td>
        <td style="text-align: center; font-size: 0.82rem;">
          ${summary.unhandledCount + summary.rebillingCount > 0 ? `<span style="color: var(--danger); font-weight: 700;">${summary.unhandledCount + summary.rebillingCount}件 (¥${(summary.unhandledAmount + summary.rebillingAmount).toLocaleString('ja-JP')})</span>` : '<span style="color: var(--primary);">残高なし</span>'}
        </td>
        <td style="text-align: center;">
          ${statusBadge}
        </td>
        <td style="text-align: center;">
          <button class="btn btn-secondary btn-switch-month" data-month="${rec.billingMonth}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
            表示
          </button>
        </td>
      `;

      reconcileHistoryTableBody.appendChild(tr);
    });
  };

  // 請求月セレクター切り替え
  if (reconcileMonthSelect) {
    reconcileMonthSelect.addEventListener('change', () => {
      loadReconcileMonth(reconcileMonthSelect.value);
    });
  }

  // ステータスフィルター切り替え
  if (remandFilterStatus) {
    remandFilterStatus.addEventListener('change', () => {
      const summary = reconciliationManager.getMonthlySummaryWithRemands(reconcileMonthSelect?.value || '2026-07');
      renderRemandTable(summary.items);
    });
  }

  // 請求・入金実績フォーム送信
  if (reconcileBillingForm) {
    reconcileBillingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const billingMonth = reconcileFormBillingMonth.value;
      const billedAmount = parseInt(reconcileFormBilledAmount.value, 10) || 0;
      const depositMonth = reconcileFormDepositMonth.value;
      const paidAmount = parseInt(reconcileFormPaidAmount.value, 10) || 0;
      const memo = reconcileFormMemo.value;

      try {
        reconciliationManager.saveMonthlyRecord({
          billingMonth,
          billedAmount,
          depositMonth,
          paidAmount,
          memo
        });
        showToast(`${billingMonth} の請求・入金実績を保存しました`);
        loadReconcileMonth(billingMonth);

        // 本部クラウド自動同期
        if (typeof cloudSyncManager !== 'undefined' && cloudSyncManager.isConfigured() && cloudSyncManager.settings.autoSync) {
          cloudSyncManager.syncReconciliation({
            billingMonth,
            billedAmount,
            paidAmount,
            discrepancy: paidAmount - billedAmount,
            unresolvedRemandTotal: reconciliationManager.getUnresolvedRemandTotal(billingMonth),
            memo
          }).catch(() => {});
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 返戻・保留案件登録フォーム送信
  if (reconcileRemandForm) {
    reconcileRemandForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const billingMonth = remandFormBillingMonth.value;
      const patientChartId = remandFormChartId.value;
      const amount = parseInt(remandFormAmount.value, 10) || 0;
      const reason = remandFormReason.value;
      const status = remandFormStatus.value;
      const handlingNote = remandFormNote.value;

      try {
        reconciliationManager.addRemandItem({
          billingMonth,
          patientChartId,
          amount,
          reason,
          status,
          handlingNote
        });

        // 入力クリア
        remandFormChartId.value = '';
        remandFormAmount.value = '';
        remandFormNote.value = '';

        showToast(`カルテ番号 ${patientChartId} の返戻案件を登録しました`);
        loadReconcileMonth(billingMonth);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 返戻テーブル内イベント委任（ステータス変更 & 削除）
  if (remandTableBody) {
    // ステータス変更
    remandTableBody.addEventListener('change', (e) => {
      const select = e.target.closest('.status-select-inline');
      if (select) {
        const itemId = select.getAttribute('data-item-id');
        const newStatus = select.value;
        try {
          const updated = reconciliationManager.updateRemandStatus(itemId, newStatus);
          const statusText = ReconciliationManager.STATUS_MAP[newStatus]?.label || newStatus;
          showToast(`カルテ番号 ${updated.patientChartId} の状態を「${statusText}」に更新しました`);
          loadReconcileMonth(reconcileMonthSelect.value);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });

    // 削除
    remandTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete-remand');
      if (btn) {
        const itemId = btn.getAttribute('data-item-id');
        const item = reconciliationManager.getRemandItem(itemId);
        if (item && confirm(`カルテ番号「${item.patientChartId}」の返戻案件（¥${item.amount.toLocaleString('ja-JP')}）を削除しますか？`)) {
          reconciliationManager.deleteRemandItem(itemId);
          showToast(`カルテ番号 ${item.patientChartId} の返戻案件を削除しました`);
          loadReconcileMonth(reconcileMonthSelect.value);
        }
      }
    });
  }

  // 履歴テーブルの「表示」ボタンスイッチ
  if (reconcileHistoryTableBody) {
    reconcileHistoryTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-switch-month');
      if (btn) {
        const month = btn.getAttribute('data-month');
        if (month) {
          loadReconcileMonth(month);
          showToast(`請求月 ${month} の表示に切り替えました`);
        }
      }
    });
  }

  // 動作確認用サンプルデータボタン（調剤報酬消込・返戻追跡）
  if (btnLoadReconcileTest) {
    btnLoadReconcileTest.addEventListener('click', () => {
      if (confirm('【動作確認サンプル】\n「請求1,000,000円」「入金950,000円（差額 -50,000円）」「返戻50,000円（カルテ番号: A001, 未対応）」のサンプルデータをセットしますか？')) {
        reconciliationManager.loadPhase4ConstitutionalTestData();
        loadReconcileMonth('2026-07');
        showToast('サンプルデータをセットしました（請求100万、入金95万、差額-5万、返戻5万/A001）', 'info');
      }
    });
  }

  // 全消去ボタン
  if (btnClearReconcileData) {
    btnClearReconcileData.addEventListener('click', () => {
      if (confirm('【注意】調剤報酬消込・返戻追跡の全データを消去しますか？\nこの操作は取り消せません。')) {
        reconciliationManager.clearAll();
        loadReconcileMonth(reconcileMonthSelect?.value || '2026-07');
        showToast('消込・返戻データをリセットしました');
      }
    });
  }

  // 初回ロード（デフォルト請求月: 2026-07 または当月）
  const initialBillingMonth = '2026-07';
  if (reconcileMonthSelect) reconcileMonthSelect.value = initialBillingMonth;
  loadReconcileMonth(initialBillingMonth);

  // ----------------------------------------------------
  // フェーズ6: 月次集計レポート ＆ A4印刷帳票
  // ----------------------------------------------------
  const monthlySelectMonth = document.getElementById('monthly-select-month');
  const monthlyClosingCountBadge = document.getElementById('monthly-closing-count-badge');
  const btnPrintMonthlyReport = document.getElementById('btn-print-monthly-report');
  const btnLoadMonthlyTestData = document.getElementById('btn-load-monthly-test-data');

  // KPIカード
  const monthlySummaryDiscrepancy = document.getElementById('monthly-summary-discrepancy');
  const monthlyDiscrepancyStatusTag = document.getElementById('monthly-discrepancy-status-tag');
  const monthlySummaryDiscrepancySub = document.getElementById('monthly-summary-discrepancy-sub');
  const monthlySummaryTotalSales = document.getElementById('monthly-summary-total-sales');
  const monthlySummarySalesBreakdown = document.getElementById('monthly-summary-sales-breakdown');
  const monthlySummaryTotalNet = document.getElementById('monthly-summary-total-net');
  const monthlySummaryFeeSub = document.getElementById('monthly-summary-fee-sub');
  const monthlySummaryPettyExpense = document.getElementById('monthly-summary-petty-expense');
  const monthlySummaryPettyBalanceSub = document.getElementById('monthly-summary-petty-balance-sub');
  const monthlySummaryReconcileDiff = document.getElementById('monthly-summary-reconcile-diff');
  const monthlyReconcileStatusTag = document.getElementById('monthly-reconcile-status-tag');
  const monthlySummaryReconcileSub = document.getElementById('monthly-summary-reconcile-sub');

  // A4帳票プレビュー要素
  const printMetaMonth = document.getElementById('print-meta-month');
  const printMetaTimestamp = document.getElementById('print-meta-timestamp');

  // サマリー4列
  const printSumPresale = document.getElementById('print-sum-presale');
  const printSumCredit = document.getElementById('print-sum-credit');
  const printSumTotalSales = document.getElementById('print-sum-total-sales');
  const printSumFee = document.getElementById('print-sum-fee');
  const printSumNetExpected = document.getElementById('print-sum-net-expected');

  const printSumActualCash = document.getElementById('print-sum-actual-cash');
  const printSumExpectedCash = document.getElementById('print-sum-expected-cash');
  const printSumDiscrepancy = document.getElementById('print-sum-discrepancy');
  const printSumClosingDays = document.getElementById('print-sum-closing-days');
  const printSumDiscrepancyBreakdown = document.getElementById('print-sum-discrepancy-breakdown');

  const printSumPettyStart = document.getElementById('print-sum-petty-start');
  const printSumPettyIncome = document.getElementById('print-sum-petty-income');
  const printSumPettyExpense = document.getElementById('print-sum-petty-expense');
  const printSumPettyEnd = document.getElementById('print-sum-petty-end');
  const printSumPettyCount = document.getElementById('print-sum-petty-count');

  const printSumRecTargetMonth = document.getElementById('print-sum-rec-target-month');
  const printSumRecBilled = document.getElementById('print-sum-rec-billed');
  const printSumRecPaid = document.getElementById('print-sum-rec-paid');
  const printSumRecDiff = document.getElementById('print-sum-rec-diff');
  const printSumRecRemand = document.getElementById('print-sum-rec-remand');

  // 明細テーブルボディ
  const printDiscrepancyTableBody = document.getElementById('print-discrepancy-table-body');
  const printDiscrepancyEmpty = document.getElementById('print-discrepancy-empty');
  const printPettyCategoryTableBody = document.getElementById('print-petty-category-table-body');
  const printPettyEmpty = document.getElementById('print-petty-empty');
  const printDailyBreakdownTableBody = document.getElementById('print-daily-breakdown-table-body');
  const printDailyEmpty = document.getElementById('print-daily-empty');

  // 初期年月設定（デフォルト: "2026-09"）
  if (monthlySelectMonth) {
    monthlySelectMonth.value = '2026-09';
  }

  const renderMonthlyReport = (selectedMonth = null) => {
    const month = selectedMonth || monthlySelectMonth?.value || '2026-09';
    if (!month) return;

    const report = cashRegisterManager.getMonthlyReport(month, pettyCashManager, reconciliationManager);

    // ヘッダーメタ・件数バッジ
    if (monthlyClosingCountBadge) {
      monthlyClosingCountBadge.textContent = `${report.closingDaysCount}日分の締めデータ`;
      if (report.closingDaysCount === 0) {
        monthlyClosingCountBadge.className = 'badge badge-unconfirmed';
      } else {
        monthlyClosingCountBadge.className = 'badge badge-match';
      }
    }

    const [y, m] = month.split('-');
    const formattedMonth = `${y}年${m}月度`;
    if (printMetaMonth) printMetaMonth.textContent = formattedMonth;
    if (printMetaTimestamp) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      printMetaTimestamp.textContent = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    // 1. KPIカード描画
    // 過不足累計
    if (monthlySummaryDiscrepancy) {
      monthlySummaryDiscrepancy.textContent = formatYen(report.totalDiscrepancy);
      if (report.totalDiscrepancy < 0) {
        monthlySummaryDiscrepancy.style.color = 'var(--danger)';
        if (monthlyDiscrepancyStatusTag) {
          monthlyDiscrepancyStatusTag.className = 'badge badge-shortage';
          monthlyDiscrepancyStatusTag.textContent = `不足（${report.totalDiscrepancy.toLocaleString('ja-JP')}円）`;
        }
      } else if (report.totalDiscrepancy > 0) {
        monthlySummaryDiscrepancy.style.color = 'var(--warning)';
        if (monthlyDiscrepancyStatusTag) {
          monthlyDiscrepancyStatusTag.className = 'badge badge-excess';
          monthlyDiscrepancyStatusTag.textContent = `過剰（+${report.totalDiscrepancy.toLocaleString('ja-JP')}円）`;
        }
      } else {
        monthlySummaryDiscrepancy.style.color = '';
        if (monthlyDiscrepancyStatusTag) {
          monthlyDiscrepancyStatusTag.className = 'badge badge-match';
          monthlyDiscrepancyStatusTag.textContent = '一致（正常）';
        }
      }
    }
    if (monthlySummaryDiscrepancySub) {
      monthlySummaryDiscrepancySub.textContent = `過不足発生: ${report.shortageDaysCount + report.excessDaysCount}日 / 締め日数: ${report.closingDaysCount}日`;
    }

    // 総売上
    if (monthlySummaryTotalSales) monthlySummaryTotalSales.textContent = formatYen(report.grandTotalSales);
    if (monthlySummarySalesBreakdown) {
      monthlySummarySalesBreakdown.textContent = `窓口: ${formatYen(report.totalPresaleAmount)} / クレジット: ${formatYen(report.totalCreditSales)}`;
    }

    // 純入金見込
    if (monthlySummaryTotalNet) monthlySummaryTotalNet.textContent = formatYen(report.grandTotalNetExpected);
    if (monthlySummaryFeeSub) {
      monthlySummaryFeeSub.textContent = `決済手数料控除後（手数料計: ${formatYen(report.totalFeeAmount)}）`;
    }

    // 小口経費
    if (monthlySummaryPettyExpense) monthlySummaryPettyExpense.textContent = formatYen(report.pettyCash.monthlyExpense);
    if (monthlySummaryPettyBalanceSub) {
      monthlySummaryPettyBalanceSub.textContent = `小口月末残高: ${formatYen(report.pettyCash.endBalance)}`;
    }

    // 調剤報酬
    if (monthlySummaryReconcileDiff) {
      monthlySummaryReconcileDiff.textContent = formatYen(report.reconciliation.totalDiscrepancy);
      if (report.reconciliation.totalDiscrepancy < 0) {
        monthlySummaryReconcileDiff.style.color = 'var(--danger)';
        if (monthlyReconcileStatusTag) {
          monthlyReconcileStatusTag.className = 'badge badge-shortage';
          monthlyReconcileStatusTag.textContent = '入金不足';
        }
      } else if (report.reconciliation.totalDiscrepancy > 0) {
        monthlySummaryReconcileDiff.style.color = 'var(--warning)';
        if (monthlyReconcileStatusTag) {
          monthlyReconcileStatusTag.className = 'badge badge-excess';
          monthlyReconcileStatusTag.textContent = '入金過剰';
        }
      } else {
        monthlySummaryReconcileDiff.style.color = '';
        if (monthlyReconcileStatusTag) {
          monthlyReconcileStatusTag.className = 'badge badge-match';
          monthlyReconcileStatusTag.textContent = '差額なし';
        }
      }
    }
    if (monthlySummaryReconcileSub) {
      monthlySummaryReconcileSub.textContent = `未解決返戻: ${formatYen(report.reconciliation.unhandledRemandAmount + report.reconciliation.rebillingRemandAmount)}`;
    }

    // 2. A4帳票主要4項目サマリー表の更新
    if (printSumPresale) printSumPresale.textContent = formatYen(report.totalPresaleAmount);
    if (printSumCredit) printSumCredit.textContent = formatYen(report.totalCreditSales);
    if (printSumTotalSales) printSumTotalSales.textContent = formatYen(report.grandTotalSales);
    if (printSumFee) printSumFee.textContent = formatYen(report.totalFeeAmount);
    if (printSumNetExpected) printSumNetExpected.textContent = formatYen(report.grandTotalNetExpected);

    if (printSumActualCash) printSumActualCash.textContent = formatYen(report.totalActualCash);
    if (printSumExpectedCash) printSumExpectedCash.textContent = formatYen(report.totalExpectedCash);
    if (printSumDiscrepancy) {
      printSumDiscrepancy.textContent = formatYen(report.totalDiscrepancy);
      if (report.totalDiscrepancy < 0) printSumDiscrepancy.style.color = 'var(--danger)';
      else if (report.totalDiscrepancy > 0) printSumDiscrepancy.style.color = 'var(--warning)';
      else printSumDiscrepancy.style.color = '';
    }
    if (printSumClosingDays) printSumClosingDays.textContent = `${report.closingDaysCount} 日`;
    if (printSumDiscrepancyBreakdown) {
      printSumDiscrepancyBreakdown.textContent = `不足${report.shortageDaysCount}日 / 過剰${report.excessDaysCount}日 / 一致${report.matchDaysCount}日`;
    }

    if (printSumPettyStart) printSumPettyStart.textContent = formatYen(report.pettyCash.startBalance);
    if (printSumPettyIncome) printSumPettyIncome.textContent = formatYen(report.pettyCash.monthlyIncome);
    if (printSumPettyExpense) printSumPettyExpense.textContent = formatYen(report.pettyCash.monthlyExpense);
    if (printSumPettyEnd) printSumPettyEnd.textContent = formatYen(report.pettyCash.endBalance);
    if (printSumPettyCount) printSumPettyCount.textContent = `${report.pettyCash.count} 件`;

    if (printSumRecTargetMonth) {
      const depRecs = report.reconciliation.depositMonthRecords;
      if (depRecs && depRecs.length > 0) {
        printSumRecTargetMonth.textContent = depRecs.map(r => r.billingMonth).join(', ') + ' 請求分';
      } else {
        printSumRecTargetMonth.textContent = '当月入金データなし';
      }
    }
    if (printSumRecBilled) printSumRecBilled.textContent = formatYen(report.reconciliation.totalBilledAmount);
    if (printSumRecPaid) printSumRecPaid.textContent = formatYen(report.reconciliation.totalPaidAmount);
    if (printSumRecDiff) {
      printSumRecDiff.textContent = formatYen(report.reconciliation.totalDiscrepancy);
      if (report.reconciliation.totalDiscrepancy < 0) printSumRecDiff.style.color = 'var(--danger)';
      else if (report.reconciliation.totalDiscrepancy > 0) printSumRecDiff.style.color = 'var(--warning)';
      else printSumRecDiff.style.color = '';
    }
    if (printSumRecRemand) {
      const unresolvedRemand = report.reconciliation.unhandledRemandAmount + report.reconciliation.rebillingRemandAmount;
      printSumRecRemand.textContent = formatYen(unresolvedRemand);
      if (unresolvedRemand > 0) printSumRecRemand.style.color = 'var(--danger)';
      else printSumRecRemand.style.color = '';
    }

    // 3. 過不足明細テーブル
    if (printDiscrepancyTableBody) {
      printDiscrepancyTableBody.innerHTML = '';
      if (report.discrepancyRecords.length === 0) {
        if (printDiscrepancyEmpty) printDiscrepancyEmpty.style.display = 'block';
      } else {
        if (printDiscrepancyEmpty) printDiscrepancyEmpty.style.display = 'none';
        report.discrepancyRecords.forEach(item => {
          const tr = document.createElement('tr');
          const isShortage = item.discrepancy < 0;
          tr.innerHTML = `
            <td><span class="numeric" style="font-weight: 700;">${item.date}</span></td>
            <td style="text-align: right;"><strong class="numeric" style="color: ${isShortage ? 'var(--danger)' : 'var(--warning)'};">${item.discrepancy > 0 ? '+' : ''}${item.discrepancy.toLocaleString('ja-JP')}円</strong></td>
            <td><span class="badge ${isShortage ? 'badge-shortage' : 'badge-excess'}">${isShortage ? '不足' : '過剰'}</span></td>
            <td>${item.memo ? escapeHtml(item.memo) : '<span style="color: var(--text-muted);">（メモなし）</span>'}</td>
          `;
          printDiscrepancyTableBody.appendChild(tr);
        });
      }
    }

    // 4. 小口科目別内訳テーブル
    if (printPettyCategoryTableBody) {
      printPettyCategoryTableBody.innerHTML = '';
      const categories = Object.keys(report.pettyCash.expenseByCategory);
      const totalExpense = report.pettyCash.monthlyExpense;

      if (categories.length === 0 || totalExpense === 0) {
        if (printPettyEmpty) printPettyEmpty.style.display = 'block';
      } else {
        if (printPettyEmpty) printPettyEmpty.style.display = 'none';
        categories.sort((a, b) => report.pettyCash.expenseByCategory[b] - report.pettyCash.expenseByCategory[a]);
        categories.forEach(cat => {
          const amt = report.pettyCash.expenseByCategory[cat];
          const pct = totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) : '0.0';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${escapeHtml(cat)}</strong></td>
            <td style="text-align: right;"><span class="numeric" style="font-weight: 700;">${formatYen(amt)}</span></td>
            <td style="text-align: right;"><span class="numeric" style="color: var(--text-muted);">${pct}%</span></td>
          `;
          printPettyCategoryTableBody.appendChild(tr);
        });
      }
    }

    // 5. 日別締め実績推移一覧テーブル
    if (printDailyBreakdownTableBody) {
      printDailyBreakdownTableBody.innerHTML = '';
      if (report.daysInMonth.length === 0) {
        if (printDailyEmpty) printDailyEmpty.style.display = 'block';
      } else {
        if (printDailyEmpty) printDailyEmpty.style.display = 'none';
        report.daysInMonth.forEach(day => {
          const tr = document.createElement('tr');
          let discClass = 'badge-match';
          let discText = '一致 (±0)';
          if (day.discrepancy < 0) {
            discClass = 'badge-shortage';
            discText = `不足 (${day.discrepancy.toLocaleString('ja-JP')}円)`;
          } else if (day.discrepancy > 0) {
            discClass = 'badge-excess';
            discText = `過剰 (+${day.discrepancy.toLocaleString('ja-JP')}円)`;
          }

          tr.innerHTML = `
            <td><strong class="numeric">${day.date}</strong></td>
            <td style="text-align: right;"><span class="numeric">${formatYen(day.presaleAmount)}</span></td>
            <td style="text-align: right;"><span class="numeric">${formatYen(day.actualCash)}</span></td>
            <td style="text-align: center;"><span class="badge ${discClass}">${discText}</span></td>
            <td style="text-align: right;"><span class="numeric">${formatYen(day.creditSales)}</span></td>
            <td style="text-align: right;"><strong class="numeric">${formatYen(day.totalSales)}</strong></td>
            <td style="text-align: right;"><span class="numeric" style="color: var(--primary-dark); font-weight: 700;">${formatYen(day.totalNetExpected)}</span></td>
            <td><small style="color: var(--text-muted);">${escapeHtml(day.memo || '-')}</small></td>
          `;
          printDailyBreakdownTableBody.appendChild(tr);
        });
      }
    }
  };

  // グローバル公開（タブ切り替え時等）
  window.__renderMonthlyReport = () => renderMonthlyReport(monthlySelectMonth?.value);

  // 対象月選択変更イベント
  if (monthlySelectMonth) {
    monthlySelectMonth.addEventListener('change', () => {
      renderMonthlyReport(monthlySelectMonth.value);
    });
  }

  // A4印刷ボタン
  if (btnPrintMonthlyReport) {
    btnPrintMonthlyReport.addEventListener('click', () => {
      renderMonthlyReport(monthlySelectMonth?.value);
      window.print();
    });
  }

  // 動作確認用月次サンプルデータ一括セット
  if (btnLoadMonthlyTestData) {
    btnLoadMonthlyTestData.addEventListener('click', () => {
      if (confirm('【動作確認サンプル】\n「2026-09」の月次サンプルデータを一括セットしますか？\n・日計締め: Day1(200円不足) & Day2(完全一致) 計総売上4.5万円、過不足累計-200円\n・小口現金: 補充1万円、出金1千円、残高9千円\n・調剤報酬: 7月請求分(9月入金)、請求100万、入金95万、差額-5万、返戻5万(A001/未対応)')) {
        cashRegisterManager.loadMonthlyConstitutionalTestData(pettyCashManager, reconciliationManager);
        if (monthlySelectMonth) monthlySelectMonth.value = '2026-09';
        renderPettyCash();
        renderDailyClosing();
        loadReconcileMonth('2026-07');
        renderMonthlyReport('2026-09');
        showToast('月次サンプルデータを一括投入しました（総売上4.5万、過不足-200円、小口経費1千円、調剤報酬差額-5万円）');
      }
    });
  }

  // 各マネージャーのリスナー登録（データ変更時に月次レポートも自動更新）
  cashRegisterManager.subscribe(() => {
    renderMonthlyReport(monthlySelectMonth?.value);
  });
  pettyCashManager.subscribe(() => {
    renderMonthlyReport(monthlySelectMonth?.value);
  });
  reconciliationManager.subscribe(() => {
    renderMonthlyReport(monthlySelectMonth?.value);
  });

  // ----------------------------------------------------
  // フェーズ7: データ保護・バックアップ＆復元 (BackupManager)
  // ----------------------------------------------------
  const backupManager = new BackupManager({
    pettyCashManager,
    cashRegisterManager,
    reconciliationManager
  });

  const btnHeaderExport = document.getElementById('btn-header-export');
  const btnHeaderImport = document.getElementById('btn-header-import');
  const backupRestoreDialog = document.getElementById('backup-restore-dialog');
  const btnCloseBackupModal = document.getElementById('btn-close-backup-modal');
  const btnCancelRestore = document.getElementById('btn-cancel-restore');
  const btnExecuteRestore = document.getElementById('btn-execute-restore');
  const btnBrowseBackupFile = document.getElementById('btn-browse-backup-file');
  const backupFileInput = document.getElementById('backup-file-input');
  const backupDropzone = document.getElementById('backup-dropzone');
  const backupFileNameEl = document.getElementById('backup-file-name');
  const backupScanResultEl = document.getElementById('backup-scan-result');
  const backupSummaryPreviewEl = document.getElementById('backup-summary-preview');
  const restoreCountPettyEl = document.getElementById('restore-count-petty');
  const restoreCountCashEl = document.getElementById('restore-count-cash');
  const restoreCountReconcileEl = document.getElementById('restore-count-reconcile');
  const restoreCountRemandEl = document.getElementById('restore-count-remand');

  let stagedBackupData = null;

  // バックアップ保存（エクスポート）
  if (btnHeaderExport) {
    btnHeaderExport.addEventListener('click', () => {
      try {
        const savedFilename = backupManager.downloadBackupFile();
        showToast(`全データバックアップを保存しました（${savedFilename}）`);
      } catch (err) {
        showToast(`バックアップ保存に失敗しました: ${err.message}`, 'error');
      }
    });
  }

  // データ復元モーダル初期化
  const resetRestoreModal = () => {
    stagedBackupData = null;
    if (backupFileInput) backupFileInput.value = '';
    if (backupFileNameEl) {
      backupFileNameEl.textContent = '';
      backupFileNameEl.style.display = 'none';
    }
    if (backupScanResultEl) {
      backupScanResultEl.innerHTML = '';
      backupScanResultEl.style.display = 'none';
    }
    if (backupSummaryPreviewEl) backupSummaryPreviewEl.style.display = 'none';
    if (btnExecuteRestore) btnExecuteRestore.disabled = true;
  };

  if (btnHeaderImport) {
    btnHeaderImport.addEventListener('click', () => {
      resetRestoreModal();
      if (backupRestoreDialog) backupRestoreDialog.showModal();
    });
  }

  if (btnCloseBackupModal) {
    btnCloseBackupModal.addEventListener('click', () => {
      if (backupRestoreDialog) backupRestoreDialog.close();
    });
  }

  if (btnCancelRestore) {
    btnCancelRestore.addEventListener('click', () => {
      if (backupRestoreDialog) backupRestoreDialog.close();
    });
  }

  if (btnBrowseBackupFile && backupFileInput) {
    btnBrowseBackupFile.addEventListener('click', () => {
      backupFileInput.click();
    });
  }

  // ファイル解析＆個人情報非保持スキャン処理
  const handleBackupFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      if (backupScanResultEl) {
        backupScanResultEl.style.display = 'block';
        backupScanResultEl.innerHTML = `
          <div class="scan-box-error">
            <span>❌</span>
            <div>
              <strong>ファイル形式エラー</strong>
              <div>JSON形式（.json）のファイルを選択してください。</div>
            </div>
          </div>
        `;
      }
      if (btnExecuteRestore) btnExecuteRestore.disabled = true;
      if (backupSummaryPreviewEl) backupSummaryPreviewEl.style.display = 'none';
      return;
    }

    if (backupFileNameEl) {
      backupFileNameEl.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      backupFileNameEl.style.display = 'inline-block';
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const validation = BackupManager.validateBackupData(content);

      if (backupScanResultEl) backupScanResultEl.style.display = 'block';

      if (!validation.valid || !validation.scanResult.safe) {
        stagedBackupData = null;
        if (btnExecuteRestore) btnExecuteRestore.disabled = true;
        if (backupSummaryPreviewEl) backupSummaryPreviewEl.style.display = 'none';

        let violationsHtml = '';
        if (validation.scanResult && validation.scanResult.violations && validation.scanResult.violations.length > 0) {
          violationsHtml = `
            <ul>
              ${validation.scanResult.violations.map(v => `<li>${escapeHtml(v)}</li>`).join('')}
            </ul>
          `;
        }

        if (backupScanResultEl) {
          backupScanResultEl.innerHTML = `
            <div class="scan-box-error">
              <span>⚠️</span>
              <div>
                <strong>復元を中止しました: 個人情報保護ルール違反または無効なデータ</strong>
                <div>${escapeHtml(validation.error)}</div>
                ${violationsHtml}
              </div>
            </div>
          `;
        }
      } else {
        stagedBackupData = content;
        if (btnExecuteRestore) btnExecuteRestore.disabled = false;

        if (backupScanResultEl) {
          backupScanResultEl.innerHTML = `
            <div class="scan-box-success">
              <span>🛡️</span>
              <div>
                <strong>個人情報非保持ディープスキャン 合格</strong>
                <div>患者氏名・個人情報は一切含まれていません。安全に復元可能です。</div>
              </div>
            </div>
          `;
        }

        if (backupSummaryPreviewEl) {
          backupSummaryPreviewEl.style.display = 'block';
          if (restoreCountPettyEl) restoreCountPettyEl.textContent = `${validation.summary.pettyCashCount} 件`;
          if (restoreCountCashEl) restoreCountCashEl.textContent = `${validation.summary.cashRegisterCount} 件`;
          if (restoreCountReconcileEl) restoreCountReconcileEl.textContent = `${validation.summary.reconciliationMonthCount} ヶ月`;
          if (restoreCountRemandEl) restoreCountRemandEl.textContent = `${validation.summary.remandItemCount} 件`;
        }
      }
    };

    reader.onerror = () => {
      showToast('ファイルの読み込みに失敗しました', 'error');
    };

    reader.readAsText(file);
  };

  if (backupFileInput) {
    backupFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleBackupFile(file);
    });
  }

  // ドラッグ＆ドロップ対応
  if (backupDropzone) {
    backupDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      backupDropzone.classList.add('dragover');
    });

    backupDropzone.addEventListener('dragleave', () => {
      backupDropzone.classList.remove('dragover');
    });

    backupDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      backupDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleBackupFile(e.dataTransfer.files[0]);
      }
    });

    backupDropzone.addEventListener('click', (e) => {
      if (e.target !== btnBrowseBackupFile && backupFileInput) {
        backupFileInput.click();
      }
    });
  }

  // 復元実行
  if (btnExecuteRestore) {
    btnExecuteRestore.addEventListener('click', () => {
      if (!stagedBackupData) return;

      if (confirm('【最終確認】\nバックアップデータから全データを復元しますか？\n\n※現在のブラウザ上の登録データはすべて上書きされます。')) {
        try {
          const summary = backupManager.importData(stagedBackupData, {
            pettyCashManager,
            cashRegisterManager,
            reconciliationManager
          });

          if (backupRestoreDialog) backupRestoreDialog.close();

          // 全画面再描画
          renderPettyCash();
          const currentDate = dailyDateInput?.value || new Date().toISOString().substring(0, 10);
          loadDateData(currentDate);
          renderDailyClosing();
          loadReconcileMonth(reconcileMonthSelect?.value || '2026-07');
          renderMonthlyReport(monthlySelectMonth?.value || '2026-09');

          showToast(`全データを正常に復元しました（小口${summary.pettyCashCount}件、レジ締め${summary.cashRegisterCount}件、調剤報酬${summary.reconciliationMonthCount}ヶ月、返戻${summary.remandItemCount}件）`);
        } catch (err) {
          showToast(`復元に失敗しました: ${err.message}`, 'error');
        }
      }
    });
  }

  // ====================================================
  // フェーズ8: 簡単・優しさの仕組み化 初期設定
  // ====================================================
  const setupPhase8KindnessAndSimplicity = () => {
    // 1. ワンタップ日付切替（今日／昨日）
    const btnDateToday = document.getElementById('btn-date-today');
    const btnDateYesterday = document.getElementById('btn-date-yesterday');

    if (btnDateToday && dailyDateInput) {
      btnDateToday.addEventListener('click', () => {
        const today = new Date().toISOString().substring(0, 10);
        dailyDateInput.value = today;
        loadDateData(today);
        renderDailyClosing();
        showToast(`締め日を本日に設定しました: ${today}`, 'info');
      });
    }

    if (btnDateYesterday && dailyDateInput) {
      btnDateYesterday.addEventListener('click', () => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
        dailyDateInput.value = yesterday;
        loadDateData(yesterday);
        renderDailyClosing();
        showToast(`締め日を昨日に設定しました: ${yesterday}`, 'info');
      });
    }

    // 2. つり銭準備金リセット（標準 ¥50,000）
    const btnResetFund = document.getElementById('btn-reset-change-fund');
    if (btnResetFund && dailyChangeFundInput) {
      btnResetFund.addEventListener('click', () => {
        dailyChangeFundInput.value = '50000';
        updateDailyPreviews();
        showToast('つり銭準備金を標準値（¥50,000）にリセットしました', 'info');
      });
    }

    // 3. 差額ゼロ（あるべき現金をそのまま反映）
    const btnMatchCash = document.getElementById('btn-match-expected-cash');
    if (btnMatchCash && dailyActualCashInput) {
      btnMatchCash.addEventListener('click', () => {
        const fund = parseInt(dailyChangeFundInput?.value, 10) || 0;
        const presale = parseInt(dailyPresaleInput?.value, 10) || 0;
        const expected = fund + presale;
        dailyActualCashInput.value = expected;
        updateDailyPreviews();
        showToast(`あるべき現金（¥${expected.toLocaleString('ja-JP')}）を実査現金にセットしました（過不足ゼロ✓）`, 'success');
      });
    }

    // 4. 金種別かんたん計算アシスト（金種カウンター）
    const denomPanel = document.getElementById('denomination-panel');
    const btnToggleDenom = document.getElementById('btn-toggle-denomination');
    const btnCloseDenom = document.getElementById('btn-close-denomination');
    const btnClearDenom = document.getElementById('btn-clear-denomination');
    const btnApplyDenom = document.getElementById('btn-apply-denomination');
    const denomTotalDisplay = document.getElementById('denom-total-display');

    const updateDenominationCalculations = () => {
      if (!denomPanel) return 0;
      const rows = denomPanel.querySelectorAll('.denom-row');
      const counts = {};
      rows.forEach(row => {
        const val = parseInt(row.getAttribute('data-val'), 10) || 0;
        const input = row.querySelector('.denom-count');
        const count = parseInt(input?.value, 10) || 0;
        counts[val] = count;
      });

      const calc = CashRegisterManager.calculateDenominations(counts);
      calc.breakdown.forEach(item => {
        const row = denomPanel.querySelector(`.denom-row[data-val="${item.value}"]`);
        if (row) {
          const subtotalEl = row.querySelector('.denom-subtotal');
          if (subtotalEl) {
            subtotalEl.textContent = formatYen(item.subtotal);
          }
        }
      });

      if (denomTotalDisplay) {
        denomTotalDisplay.textContent = formatYen(calc.total);
      }
      return calc.total;
    };

    if (btnToggleDenom && denomPanel) {
      btnToggleDenom.addEventListener('click', () => {
        const isHidden = denomPanel.style.display === 'none' || !denomPanel.style.display;
        denomPanel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          updateDenominationCalculations();
        }
      });
    }

    if (btnCloseDenom && denomPanel) {
      btnCloseDenom.addEventListener('click', () => {
        denomPanel.style.display = 'none';
      });
    }

    if (btnClearDenom && denomPanel) {
      btnClearDenom.addEventListener('click', () => {
        denomPanel.querySelectorAll('.denom-count').forEach(inp => inp.value = '');
        updateDenominationCalculations();
      });
    }

    if (denomPanel) {
      denomPanel.querySelectorAll('.denom-count').forEach(input => {
        input.addEventListener('input', updateDenominationCalculations);
      });

      denomPanel.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.denom-row');
          const input = row?.querySelector('.denom-count');
          if (input) {
            const cur = parseInt(input.value, 10) || 0;
            input.value = Math.max(0, cur - 1);
            updateDenominationCalculations();
          }
        });
      });

      denomPanel.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.denom-row');
          const input = row?.querySelector('.denom-count');
          if (input) {
            const cur = parseInt(input.value, 10) || 0;
            input.value = cur + 1;
            updateDenominationCalculations();
          }
        });
      });
    }

    if (btnApplyDenom && dailyActualCashInput) {
      btnApplyDenom.addEventListener('click', () => {
        const total = updateDenominationCalculations();
        dailyActualCashInput.value = total;
        if (denomPanel) denomPanel.style.display = 'none';
        updateDailyPreviews();
        showToast(`金種計算合計（${formatYen(total)}）を実査現金に反映しました！`, 'success');
      });
    }

    // 5. 定型理由メモのワンタップ入力
    document.querySelectorAll('.btn-memo-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        if (!text || !dailyMemoInput) return;
        if (dailyMemoInput.value.trim().length === 0) {
          dailyMemoInput.value = text;
        } else {
          dailyMemoInput.value += `、${text}`;
        }
        showToast(`メモに「${btn.textContent.trim()}」を追加しました`, 'info');
      });
    });

    // 6. 小口現金のクイックプリセットチップ
    document.querySelectorAll('.btn-petty-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type') || 'expense';
        const category = btn.getAttribute('data-category') || '';
        const memo = btn.getAttribute('data-memo') || '';
        const amount = btn.getAttribute('data-amount') || '';

        const typeRadio = document.querySelector(`input[name="petty-type"][value="${type}"]`);
        if (typeRadio) {
          typeRadio.checked = true;
          updateCategoryOptions(type);
        }
        const categorySelect = document.getElementById('petty-category');
        if (categorySelect && category) {
          categorySelect.value = category;
        }
        const memoInput = document.getElementById('petty-memo');
        if (memoInput && memo) {
          memoInput.value = memo;
        }
        const amountInput = document.getElementById('petty-amount');
        if (amountInput && amount) {
          amountInput.value = amount;
        }
        const dateInput = document.getElementById('petty-date');
        if (dateInput && !dateInput.value) {
          dateInput.value = new Date().toISOString().substring(0, 10);
        }
        showToast(`プリセット「${btn.textContent.trim()}」をセットしました`, 'info');
      });
    });

    // 7. 調剤報酬返戻のクイック事由チップ
    document.querySelectorAll('.btn-remand-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = btn.getAttribute('data-reason') || '';
        const select = document.getElementById('remand-form-reason');
        if (select && reason) {
          let found = false;
          for (let i = 0; i < select.options.length; i++) {
            const optVal = select.options[i].value;
            if (optVal === reason || optVal.includes(reason.substring(0, 4)) || reason.includes(optVal.substring(0, 4))) {
              select.selectedIndex = i;
              found = true;
              break;
            }
          }
          if (!found) {
            select.value = reason;
          }
          showToast(`事由に「${select.value || reason}」をセットしました`, 'info');
        }
      });
    });

    // 8. 温かい労いモーダルの閉じるボタン
    const btnCloseWarm = document.getElementById('btn-close-warm-modal');
    const warmDialog = document.getElementById('warm-closing-dialog');
    if (btnCloseWarm && warmDialog) {
      btnCloseWarm.addEventListener('click', () => {
        if (typeof warmDialog.close === 'function') {
          warmDialog.close();
        } else {
          warmDialog.style.display = 'none';
        }
      });
    }
  };

  // フェーズ8 簡単・優しさの仕組み化の初期化
  setupPhase8KindnessAndSimplicity();

  // ====================================================
  // フェーズ9: 本部クラウド同期 初期設定
  // ====================================================
  const cloudSyncManager = new CloudSyncManager();

  const setupPhase9CloudSync = () => {
    const cloudSyncBadge = document.getElementById('cloud-sync-badge');
    const cloudSyncText = document.getElementById('cloud-sync-text');
    const btnCloudSettings = document.getElementById('btn-cloud-settings');
    const cloudSettingsDialog = document.getElementById('cloud-settings-dialog');
    const btnCloseCloudModal = document.getElementById('btn-close-cloud-modal');
    const btnCancelCloudSettings = document.getElementById('btn-cancel-cloud-settings');
    const btnSaveCloudSettings = document.getElementById('btn-save-cloud-settings');
    const cloudStoreNameInput = document.getElementById('cloud-store-name');
    const cloudEndpointUrlInput = document.getElementById('cloud-endpoint-url');
    const cloudAutoSyncCheckbox = document.getElementById('cloud-auto-sync');
    const cloudQueueStatus = document.getElementById('cloud-queue-status');
    const cloudQueueCount = document.getElementById('cloud-queue-count');
    const btnRetryQueue = document.getElementById('btn-cloud-retry-queue');

    const updateCloudBadge = () => {
      if (!cloudSyncBadge || !cloudSyncText) return;
      cloudSyncBadge.classList.remove('unconfigured', 'connected', 'syncing', 'offline');

      if (!cloudSyncManager.isConfigured()) {
        cloudSyncBadge.classList.add('unconfigured');
        cloudSyncText.textContent = 'クラウド: 未設定';
        cloudSyncBadge.title = '本部Googleスプレッドシート同期URLが未設定です（ローカル保存のみ）';
      } else if (cloudSyncManager.queue.length > 0) {
        cloudSyncBadge.classList.add('offline');
        cloudSyncText.textContent = `オフライン (${cloudSyncManager.queue.length}件保留)`;
        cloudSyncBadge.title = 'オフラインのため未送信キューにデータが保留されています';
      } else {
        cloudSyncBadge.classList.add('connected');
        cloudSyncText.textContent = 'クラウド: 本部連携中 ✓';
        cloudSyncBadge.title = `本部スプレッドシートへリアルタイム自動同期中 (${cloudSyncManager.settings.storeName})`;
      }

      if (cloudQueueStatus && cloudQueueCount) {
        if (cloudSyncManager.queue.length > 0) {
          cloudQueueStatus.style.display = 'block';
          cloudQueueCount.textContent = cloudSyncManager.queue.length;
        } else {
          cloudQueueStatus.style.display = 'none';
        }
      }
    };

    cloudSyncManager.addListener(updateCloudBadge);
    updateCloudBadge();

    // モーダル開閉
    if (btnCloudSettings && cloudSettingsDialog) {
      btnCloudSettings.addEventListener('click', () => {
        if (cloudStoreNameInput) cloudStoreNameInput.value = cloudSyncManager.settings.storeName;
        if (cloudEndpointUrlInput) cloudEndpointUrlInput.value = cloudSyncManager.settings.endpointUrl;
        if (cloudAutoSyncCheckbox) cloudAutoSyncCheckbox.checked = cloudSyncManager.settings.autoSync;
        updateCloudBadge();
        if (typeof cloudSettingsDialog.showModal === 'function') {
          cloudSettingsDialog.showModal();
        } else {
          cloudSettingsDialog.style.display = 'block';
        }
      });
    }

    const closeCloudModal = () => {
      if (cloudSettingsDialog) {
        if (typeof cloudSettingsDialog.close === 'function') {
          cloudSettingsDialog.close();
        } else {
          cloudSettingsDialog.style.display = 'none';
        }
      }
    };

    if (btnCloseCloudModal) btnCloseCloudModal.addEventListener('click', closeCloudModal);
    if (btnCancelCloudSettings) btnCancelCloudSettings.addEventListener('click', closeCloudModal);

    // 設定保存
    if (btnSaveCloudSettings) {
      btnSaveCloudSettings.addEventListener('click', () => {
        const storeName = cloudStoreNameInput?.value || 'リリー薬局';
        const endpointUrl = cloudEndpointUrlInput?.value || '';
        const autoSync = cloudAutoSyncCheckbox ? cloudAutoSyncCheckbox.checked : true;

        cloudSyncManager.saveSettings({ endpointUrl, storeName, autoSync });
        updateCloudBadge();
        closeCloudModal();

        if (cloudSyncManager.isConfigured()) {
          showToast(`本部クラウド連携を設定しました（店舗名: ${storeName}）`, 'success');
        } else {
          showToast('クラウド設定を更新しました（URL未設定のためローカル保存のみ）', 'info');
        }
      });
    }

    // キュー再送
    if (btnRetryQueue) {
      btnRetryQueue.addEventListener('click', async () => {
        btnRetryQueue.disabled = true;
        btnRetryQueue.textContent = '再送中...';
        try {
          const res = await cloudSyncManager.retryQueue();
          showToast(`${res.sentCount}件の保留データを本部へ再送しました`, 'success');
        } catch (e) {
          showToast('再送に失敗しました。ネット接続をご確認ください', 'error');
        } finally {
          btnRetryQueue.disabled = false;
          btnRetryQueue.textContent = '今すぐ再送';
          updateCloudBadge();
        }
      });
    }
  };

  // フェーズ9 本部クラウド同期の初期化
  setupPhase9CloudSync();

  // 初回ロード
  renderMonthlyReport('2026-09');
});



