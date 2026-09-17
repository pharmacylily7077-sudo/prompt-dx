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
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // フェーズ2 外部検証ボタン
  if (closingTestBtn) {
    closingTestBtn.addEventListener('click', () => {
      if (confirm('【開発憲法 外部検証】\n「つり銭準備金 50,000円」「レセコン売上 10,000円」「実査現金 59,800円（200円不足）」「クレジット 10,000円（手数料324円）」の検証データをセットしますか？')) {
        cashRegisterManager.loadConstitutionalTestData();

        const today = new Date().toISOString().substring(0, 10);
        if (dailyDateInput) dailyDateInput.value = today;
        loadDateData(today);
        showToast('外部検証データをセットしました（実査200円不足⚠️、クレジット手数料324円）', 'error');
      }
    });
  }

  // フェーズ3 外部検証ボタン（複数日：Day 1 & Day 2）
  if (phase3TestBtn) {
    phase3TestBtn.addEventListener('click', () => {
      if (confirm('【開発憲法 フェーズ3外部検証】\n「Day1（2026-09-17: 200円不足・小口1千円出金）」および「Day2（2026-09-18: 一致・クレジット5千円）」の複数日日計締めデータをセットしますか？')) {
        cashRegisterManager.loadPhase3ConstitutionalTestData(pettyCashManager);

        // まずDay 1を表示
        if (dailyDateInput) dailyDateInput.value = '2026-09-17';
        loadDateData('2026-09-17');
        showToast('フェーズ3検証データ（Day 1 & Day 2）をセットしました。日付を切り替えて履歴の完全性を確認してください。', 'success');
      }
    });
  }

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
});


