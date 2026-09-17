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
});
