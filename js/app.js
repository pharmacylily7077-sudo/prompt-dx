/**
 * 調剤薬局 売上・入金・返戻管理システム メインスクリプト (js/app.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ユーティリティ
  const formatYen = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '¥0';
    return '¥' + amount.toLocaleString('ja-JP');
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
  // タブ切り替え制御
  // ----------------------------------------------------
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
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
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 開発憲法検証ボタン（10,000円補充 → 1,000円出金 → 残高9,000円）
  if (testDataBtn) {
    testDataBtn.addEventListener('click', () => {
      if (confirm('【開発憲法 外部検証】\n「小口補充 10,000円」および「消耗品費 1,000円」の暗算用検証データをセットしますか？\n（現在のデータは検証データに置き換わります）')) {
        pettyCashManager.loadConstitutionalTestData();
        showToast('外部検証データをセットしました（残高9,000円）');
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
  // レジ現金＆クレジット決済管理 (★フェーズ2 実装)
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

  // リアルタイムプレビュー要素
  const discrepancyPreviewBox = document.getElementById('daily-discrepancy-preview');
  const previewExpectedCashEl = document.getElementById('preview-expected-cash');
  const previewDiscrepancyAmountEl = document.getElementById('preview-discrepancy-amount');
  const previewDiscrepancyNoteEl = document.getElementById('preview-discrepancy-note');
  const previewFeeAmountEl = document.getElementById('preview-fee-amount');
  const previewNetCreditEl = document.getElementById('preview-net-credit');

  // サマリーカード要素
  const dailySummaryDiscrepancyEl = document.getElementById('daily-summary-discrepancy');
  const dailyStatusTagEl = document.getElementById('daily-status-tag');
  const dailySummaryPresaleEl = document.getElementById('daily-summary-presale');
  const dailySummaryActualEl = document.getElementById('daily-summary-actual');
  const dailySummaryCreditNetEl = document.getElementById('daily-summary-credit-net');
  const dailyCardDiscrepancyEl = document.getElementById('daily-card-discrepancy');

  // テーブル要素
  const dailyTableBody = document.getElementById('daily-table-body');
  const dailyEmptyStateEl = document.getElementById('daily-empty-state');
  const closingTestBtn = document.getElementById('btn-load-closing-test-data');
  const clearClosingDataBtn = document.getElementById('btn-clear-closing-data');

  // 初期日付
  if (dailyDateInput) {
    dailyDateInput.value = new Date().toISOString().substring(0, 10);
  }

  // リアルタイム計算プレビュー更新
  const updateDailyPreviews = () => {
    const fund = parseInt(dailyChangeFundInput?.value, 10) || 0;
    const presale = parseInt(dailyPresaleInput?.value, 10) || 0;
    const actual = parseInt(dailyActualCashInput?.value, 10) || 0;
    const creditSales = parseInt(dailyCreditSalesInput?.value, 10) || 0;
    const feeRate = parseFloat(dailyFeeRateInput?.value) || 3.24;

    // 現金照合計算
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

    // クレジット計算
    const creditCalc = CashRegisterManager.calculateCredit(creditSales, feeRate);
    if (previewFeeAmountEl) {
      previewFeeAmountEl.textContent = formatYen(creditCalc.feeAmount);
    }
    if (previewNetCreditEl) {
      previewNetCreditEl.textContent = formatYen(creditCalc.netCreditAmount);
    }
  };

  // 入力イベントリスナー登録（リアルタイム計算）
  [dailyChangeFundInput, dailyPresaleInput, dailyActualCashInput, dailyCreditSalesInput, dailyFeeRateInput].forEach(input => {
    if (input) {
      input.addEventListener('input', updateDailyPreviews);
    }
  });

  // レジ締め画面レンダリング
  const renderDailyClosing = () => {
    const records = cashRegisterManager.getDisplayRecords();

    // 最新レコードまたは本日レコードをサマリーに反映
    const today = dailyDateInput?.value || new Date().toISOString().substring(0, 10);
    const targetRecord = cashRegisterManager.getRecordByDate(today) || (records.length > 0 ? records[0] : null);

    if (targetRecord) {
      if (dailySummaryDiscrepancyEl) {
        if (targetRecord.status === 'match') {
          dailySummaryDiscrepancyEl.textContent = '±¥0';
        } else if (targetRecord.status === 'shortage') {
          dailySummaryDiscrepancyEl.textContent = `-¥${Math.abs(targetRecord.discrepancy).toLocaleString('ja-JP')}`;
        } else {
          dailySummaryDiscrepancyEl.textContent = `+¥${targetRecord.discrepancy.toLocaleString('ja-JP')}`;
        }
      }

      if (dailyCardDiscrepancyEl) {
        dailyCardDiscrepancyEl.classList.remove('primary', 'danger', 'info');
        if (targetRecord.status === 'shortage') {
          dailyCardDiscrepancyEl.classList.add('danger');
        } else {
          dailyCardDiscrepancyEl.classList.add('primary');
        }
      }

      if (dailyStatusTagEl) {
        dailyStatusTagEl.className = 'badge';
        if (targetRecord.status === 'match') {
          dailyStatusTagEl.classList.add('badge-match');
          dailyStatusTagEl.textContent = '一致（正常）';
        } else if (targetRecord.status === 'shortage') {
          dailyStatusTagEl.classList.add('badge-shortage');
          dailyStatusTagEl.textContent = `不足（-${Math.abs(targetRecord.discrepancy).toLocaleString('ja-JP')}円）⚠️`;
        } else {
          dailyStatusTagEl.classList.add('badge-excess');
          dailyStatusTagEl.textContent = `過剰（+${targetRecord.discrepancy.toLocaleString('ja-JP')}円）⚠️`;
        }
      }

      if (dailySummaryPresaleEl) dailySummaryPresaleEl.textContent = formatYen(targetRecord.presaleAmount);
      if (dailySummaryActualEl) dailySummaryActualEl.textContent = formatYen(targetRecord.actualCash);
      if (dailySummaryCreditNetEl) dailySummaryCreditNetEl.textContent = formatYen(targetRecord.netCreditAmount);
    } else {
      if (dailySummaryDiscrepancyEl) dailySummaryDiscrepancyEl.textContent = '¥0';
      if (dailyCardDiscrepancyEl) {
        dailyCardDiscrepancyEl.className = 'summary-card primary';
      }
      if (dailyStatusTagEl) {
        dailyStatusTagEl.className = 'badge badge-match';
        dailyStatusTagEl.textContent = '未締め / 正常';
      }
      if (dailySummaryPresaleEl) dailySummaryPresaleEl.textContent = '¥0';
      if (dailySummaryActualEl) dailySummaryActualEl.textContent = '¥0';
      if (dailySummaryCreditNetEl) dailySummaryCreditNetEl.textContent = '¥0';
    }

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

        row.innerHTML = `
          <td class="numeric"><strong>${r.date}</strong></td>
          <td class="numeric" style="text-align: right;">${formatYen(r.changeFund)}</td>
          <td class="numeric" style="text-align: right; color: var(--info); font-weight: 600;">${formatYen(r.presaleAmount)}</td>
          <td class="numeric" style="text-align: right; font-weight: 700;">${formatYen(r.actualCash)}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td class="numeric" style="text-align: right;">${formatYen(r.creditSales)}</td>
          <td class="numeric" style="text-align: right; color: #64748b;">${formatYen(r.feeAmount)}</td>
          <td class="numeric" style="text-align: right; font-weight: 700; color: var(--primary-dark);">${formatYen(r.netCreditAmount)}</td>
          <td>${r.memo || '<span style="color:#94a3b8;">-</span>'}</td>
          <td style="text-align: center;">
            <button class="btn btn-danger-outline btn-delete-daily" data-id="${r.id}" title="削除">削除</button>
          </td>
        `;

        // 削除ボタンイベント
        const deleteBtn = row.querySelector('.btn-delete-daily');
        deleteBtn.addEventListener('click', () => {
          if (confirm(`【確認】\n締め日: ${r.date} の締めデータを削除しますか？\n（レセコン売上: ${formatYen(r.presaleAmount)}、実査現金: ${formatYen(r.actualCash)}）`)) {
            cashRegisterManager.deleteRecord(r.id);
            showToast('締めデータを削除しました');
          }
        });

        dailyTableBody.appendChild(row);
      });
    }
  };

  // フォーム送信
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

        if (saved.status === 'shortage') {
          showToast(`【注意】${date} の締めを保存しました。現金のズレ: 不足 -¥${Math.abs(saved.discrepancy).toLocaleString('ja-JP')}`, 'error');
        } else if (saved.status === 'excess') {
          showToast(`${date} の締めを保存しました。現金のズレ: 過剰 +¥${saved.discrepancy.toLocaleString('ja-JP')}`, 'error');
        } else {
          showToast(`${date} の締めデータを保存しました（レジ現金一致✓）`, 'success');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 開発憲法検証ボタン（実査現金200円不足、クレジット10,000円・手数料324円）
  if (closingTestBtn) {
    closingTestBtn.addEventListener('click', () => {
      if (confirm('【開発憲法 外部検証】\n「つり銭準備金 50,000円」「レセコン売上 10,000円」「実査現金 59,800円（200円不足）」「クレジット 10,000円（手数料324円）」の検証データをセットしますか？')) {
        cashRegisterManager.loadConstitutionalTestData();

        // フォームにも検証数値を反映
        const today = new Date().toISOString().substring(0, 10);
        if (dailyDateInput) dailyDateInput.value = today;
        if (dailyChangeFundInput) dailyChangeFundInput.value = '50000';
        if (dailyPresaleInput) dailyPresaleInput.value = '10000';
        if (dailyActualCashInput) dailyActualCashInput.value = '59800';
        if (dailyCreditSalesInput) dailyCreditSalesInput.value = '10000';
        if (dailyFeeRateInput) dailyFeeRateInput.value = '3.24';
        if (dailyMemoInput) dailyMemoInput.value = '【憲法検証】実査現金200円不足、クレジット10,000円（手数料324円）';

        updateDailyPreviews();
        showToast('外部検証データをセットしました（実査200円不足⚠️、クレジット手数料324円）', 'error');
      }
    });
  }

  // レジ締め全データクリア
  if (clearClosingDataBtn) {
    clearClosingDataBtn.addEventListener('click', () => {
      if (confirm('【注意】日計締めの全データをリセットしますか？\nこの操作は取り消せません。')) {
        cashRegisterManager.clearAll();
        showToast('日計締めのデータをリセットしました');
      }
    });
  }

  // データ購読登録＆初回描画
  cashRegisterManager.subscribe(() => {
    renderDailyClosing();
  });
  updateDailyPreviews();
  renderDailyClosing();
});

