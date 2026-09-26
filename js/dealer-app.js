/**
 * 外車・高級車販売 資金統制・不正根絶システム
 * 総合UIコントローラー ＆ イベント制御 (dealer-app.js)
 */

(function(global) {
  'use strict';

  var contractManager, expenseManager, loanManager, auditManager, syncManager, supremeManager;

  // 通貨フォーマッター
  function formatYen(num) {
    var val = Number(num) || 0;
    return '¥' + val.toLocaleString('ja-JP');
  }

  function nl2br(str) {
    return (str || '').replace(/\n/g, '<br>');
  }

  // 初期化
  function init() {
    contractManager = new global.DealerContractManager();
    expenseManager = new global.DealerExpenseManager();
    loanManager = new global.DealerLoanManager();
    auditManager = new global.DealerAuditManager(contractManager, expenseManager, loanManager);
    syncManager = new global.DealerSyncManager();
    supremeManager = new global.DealerSupremeManager(contractManager, expenseManager, loanManager);

    // 初回起動時、データが0件なら自動的に検証デモデータをロードして動作確認できるようにする
    if (contractManager.getAllDeals().length === 0) {
      try {
        loadDemoData();
      } catch (err) {
        console.warn('Initial demo load exception caught:', err);
      }
    }

    try {
      bindTabs();
      bindModals();
      bindFormEvents();
      bindActionButtons();
      updateCloudStatusUI();
      renderAll();
    } catch (e) {
      console.error('Initialization error in dealer-app:', e);
    }
  }

  // ==========================================
  // タブ切り替え
  // ==========================================
  function bindTabs() {
    var tabBtns = document.querySelectorAll('.tab-button');
    tabBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        tabBtns.forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });

        btn.classList.add('active');
        var targetId = btn.getAttribute('data-tab');
        var targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
        renderAll();
      });
    });
  }

  // ==========================================
  // モーダル共通制御
  // ==========================================
  function openModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  function bindModals() {
    document.querySelectorAll('[data-close]').forEach(function(el) {
      el.addEventListener('click', function() {
        var targetModalId = el.getAttribute('data-close');
        closeModal(targetModalId);
      });
    });

    // モーダル背景クリックで閉じる
    document.querySelectorAll('.dealer-modal').forEach(function(modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  }

  // ==========================================
  // 全画面レンダリング
  // ==========================================
  function renderAll() {
    renderContractTab();
    renderExpenseTab();
    renderLoanTab();
    renderAuditTab();
    updateBadges();
  }

  // ==========================================
  // ① 車両別成約締めタブの描画
  // ==========================================
  function renderContractTab() {
    var deals = contractManager.getAllDeals();
    var tbody = document.getElementById('deal-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    var totalSales = 0;
    var totalCost = 0;
    var totalGrossProfit = 0;

    deals.forEach(function(deal) {
      totalSales += (deal.totalSales || 0);
      totalCost += (deal.totalCost || 0);
      totalGrossProfit += (deal.grossProfit || 0);

      var tr = document.createElement('tr');

      // ステータスバッジ
      var statusBadge = '<span class="badge badge-info">' + deal.status + '</span>';
      if (deal.status === 'delivered') statusBadge = '<span class="badge badge-success">納車完了</span>';
      if (deal.status === 'contracted') statusBadge = '<span class="badge badge-warning">成約済・準備中</span>';
      if (deal.illegalDelivery) statusBadge = '<span class="badge badge-lock">🚨違法出庫ロック</span>';

      // ゲートキーボタン
      var gateBtnHtml = '';
      if (deal.status !== 'delivered') {
        gateBtnHtml = '<button class="btn-outline btn-gate-check" data-id="' + deal.id + '" style="font-size:11px; padding:3px 6px;">出庫ゲート審査</button>' +
                      '<button class="btn-outline btn-scrivener-pass" data-id="' + deal.id + '" style="font-size:11px; padding:3px 6px; margin-left:4px;" title="専属行政書士用 陸運局出庫承認パス">🛡️行政書士パス</button>';
      } else {
        gateBtnHtml = '<span style="font-size:11px; color:var(--dealer-success); font-weight:700;">✓ 出庫済</span>' +
                      '<button class="btn-outline btn-scrivener-pass" data-id="' + deal.id + '" style="font-size:11px; padding:3px 6px; margin-left:4px;" title="専属行政書士用 陸運局出庫承認パス">🛡️行政書士パス</button>';
      }

      var downMethodLabel = deal.downPaymentMethod === 'cash' ? 
        '<span style="color:var(--dealer-danger); font-weight:700;">頭金: 現金手渡し</span>' : '頭金: 振込';

      tr.innerHTML = 
        '<td><strong>' + deal.id + '</strong></td>' +
        '<td><span style="font-family:monospace; font-size:11px;">' + deal.vin + '</span></td>' +
        '<td><strong>' + deal.model + '</strong> (' + deal.year + ')</td>' +
        '<td>' + deal.salesRep + '</td>' +
        '<td>' + (deal.contractDate || '-') + '</td>' +
        '<td class="numeric font-bold">' + formatYen(deal.contractTotal) + '</td>' +
        '<td class="numeric">' + formatYen(deal.totalCost) + '</td>' +
        '<td class="numeric font-bold" style="color:var(--dealer-navy);">' + formatYen(deal.grossProfit) + '</td>' +
        '<td class="numeric"><span class="badge ' + (deal.marginRate >= 15 ? 'badge-success' : 'badge-warning') + '">' + deal.marginRate + '%</span></td>' +
        '<td><div style="font-size:11px;">' + downMethodLabel + '<br>ローン: ' + formatYen(deal.loanPrincipal) + '</div></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + gateBtnHtml + '</td>';

      tbody.appendChild(tr);
    });

    if (deals.length === 0) {
      var emptyTr = document.createElement('tr');
      emptyTr.innerHTML = '<td colspan="12" style="text-align:center; padding:45px 20px; background:#f8fafc; border-radius:8px;">' +
        '<div style="font-size:16px; font-weight:700; margin-bottom:8px; color:var(--dealer-navy);">🏛️ 現在: まっさらな本番運用モード（登録データ 0件）</div>' +
        '<div style="font-size:13px; margin-bottom:16px; color:#64748b;">右上の「＋ 新規成約締め登録」から実車データを登録してください。<br>30年トップ営業マンの不正シミュレーションを体験する場合は、下のボタンまたはヘッダーの「🔄 デモデータ読込」を押してください。</div>' +
        '<button id="btn-empty-demo" class="btn-primary" style="font-size:12px; margin:0 auto; padding:6px 14px;">🔄 検証デモデータをロードして動作確認する</button>' +
        '</td>';
      tbody.appendChild(emptyTr);
      var btnEmptyDemo = document.getElementById('btn-empty-demo');
      if (btnEmptyDemo) {
        btnEmptyDemo.addEventListener('click', function() {
          loadDemoData();
          renderAll();
        });
      }
    }

    // KPI更新
    document.getElementById('kpi-total-sales').textContent = formatYen(totalSales);
    document.getElementById('kpi-total-cost').textContent = formatYen(totalCost);
    document.getElementById('kpi-gross-profit').textContent = formatYen(totalGrossProfit);
    document.getElementById('kpi-deal-count').textContent = deals.length + ' 台';

    var avgRate = totalSales > 0 ? ((totalGrossProfit / totalSales) * 100) : 0;
    document.getElementById('kpi-margin-rate').textContent = (Math.round(avgRate * 10) / 10) + '%';

    // ゲートボタンイベント
    document.querySelectorAll('.btn-gate-check').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dealId = btn.getAttribute('data-id');
        openDeliveryGateModal(dealId);
      });
    });

    document.querySelectorAll('.btn-scrivener-pass').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dealId = btn.getAttribute('data-id');
        openScrivenerPassModal(dealId);
      });
    });
  }

  // ==========================================
  // ② 諸費用出納・預り金管理タブの描画
  // ==========================================
  function renderExpenseTab() {
    var records = expenseManager.getAllRecords();
    var tbody = document.getElementById('expense-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    var totalDeposit = 0;
    var totalPaid = 0;
    var totalDealerFee = 0;
    var totalStagnantBalance = 0;

    records.forEach(function(rec) {
      var match = expenseManager.verifyThreeWayMatch(rec);
      totalDeposit += match.depositReceived;
      totalPaid += match.actualPaidTotal;
      totalDealerFee += match.dealerFeeRevenue;
      totalStagnantBalance += match.balance;

      var tr = document.createElement('tr');

      var matchBadge = match.isFullyReconciled ? 
        '<span class="badge badge-success">✓ 三方一致 (差額¥0)</span>' : 
        '<span class="badge badge-danger">🚨未精算・不一致</span>';

      var receiptBadge = match.allReceiptsAttached ?
        '<span style="color:var(--dealer-success); font-size:11px;">領収書完備</span>' :
        '<span style="color:var(--dealer-danger); font-size:11px; font-weight:700;">領収書未済: ' + match.missingReceiptCount + '件</span>';

      var balanceColor = match.balance === 0 ? 'color:var(--dealer-success);' : 'color:var(--dealer-danger); font-weight:bold;';

      tr.innerHTML = 
        '<td><strong>' + rec.contractId + '</strong></td>' +
        '<td><span style="font-family:monospace; font-size:11px;">' + rec.vin + '</span></td>' +
        '<td>' + rec.salesRep + '</td>' +
        '<td>' + rec.depositDate + ' (' + (rec.depositMethod === 'cash' ? '<strong style="color:var(--dealer-danger);">現金</strong>' : '振込') + ')</td>' +
        '<td class="numeric font-bold">' + formatYen(match.depositReceived) + '</td>' +
        '<td class="numeric">' + formatYen(match.actualPaidTotal) + '<br>' + receiptBadge + '</td>' +
        '<td class="numeric">' + formatYen(match.dealerFeeRevenue) + '</td>' +
        '<td class="numeric">' + formatYen(match.customerRefund) + '</td>' +
        '<td class="numeric" style="' + balanceColor + '">' + formatYen(match.balance) + '</td>' +
        '<td>' + matchBadge + '</td>' +
        '<td><button class="btn-outline btn-view-notice" data-id="' + rec.id + '" style="font-size:11px; padding:3px 6px;">📄公式受領書</button></td>' +
        '<td>' +
          '<div style="display:flex; gap:4px;">' +
            '<button class="btn-outline btn-pay-item" data-id="' + rec.id + '" style="font-size:11px; padding:3px 6px;">実費納付</button>' +
            '<button class="btn-outline btn-finalize-exp" data-id="' + rec.id + '" style="font-size:11px; padding:3px 6px;">余剰精算</button>' +
          '</div>' +
        '</td>';

      tbody.appendChild(tr);
    });

    document.getElementById('kpi-exp-deposit-received').textContent = formatYen(totalDeposit);
    document.getElementById('kpi-exp-actual-paid').textContent = formatYen(totalPaid);
    document.getElementById('kpi-exp-dealer-fee').textContent = formatYen(totalDealerFee);
    document.getElementById('kpi-exp-stagnant-balance').textContent = formatYen(totalStagnantBalance);

    var badgeStagnant = document.getElementById('badge-stagnant-status');
    if (totalStagnantBalance > 0) {
      badgeStagnant.className = 'badge badge-danger';
      badgeStagnant.textContent = '滞留警戒あり';
    } else {
      badgeStagnant.className = 'badge badge-success';
      badgeStagnant.textContent = '正常 (¥0)';
    }

    // 滞留アラート枠
    var stagnantAlerts = expenseManager.detectStagnantDeposits(contractManager);
    var alertBox = document.getElementById('expense-stagnant-alert-box');
    var alertList = document.getElementById('expense-stagnant-alert-list');
    if (stagnantAlerts.length > 0) {
      alertBox.style.display = 'block';
      alertList.innerHTML = '';
      stagnantAlerts.forEach(function(a) {
        var li = document.createElement('li');
        li.className = 'tripwire-item';
        li.innerHTML = '<strong>[' + a.contractId + ' / ' + a.salesRep + ']</strong> ' + a.message;
        alertList.appendChild(li);
      });
    } else {
      alertBox.style.display = 'none';
    }

    // 諸費用アクションボタンイベント
    document.querySelectorAll('.btn-view-notice').forEach(function(b) {
      b.addEventListener('click', function() {
        openCustomerNoticeModal(b.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.btn-pay-item').forEach(function(b) {
      b.addEventListener('click', function() {
        openExpensePayModal(b.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.btn-finalize-exp').forEach(function(b) {
      b.addEventListener('click', function() {
        openExpenseFinalizeModal(b.getAttribute('data-id'));
      });
    });
  }

  // ==========================================
  // ③ オートローン・信販消込タブの描画
  // ==========================================
  function renderLoanTab() {
    var loans = loanManager.getAllLoans();
    var tbody = document.getElementById('loan-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    var totalPrincipal = 0;
    var totalReceived = 0;
    var totalKickback = 0;
    var pendingTotal = 0;

    loans.forEach(function(loan) {
      totalPrincipal += (loan.contractPrincipal || 0);
      totalReceived += (loan.actualReceivedAmount || 0);
      totalKickback += (loan.kickbackAmount || 0);
      if (loan.status === 'pending') {
        pendingTotal += (loan.contractPrincipal || 0);
      }

      var tr = document.createElement('tr');

      var statusBadge = loan.status === 'reconciled' ? 
        '<span class="badge badge-success">✓ 消込完了</span>' : 
        '<span class="badge badge-warning">未着金・消込待機</span>';

      var matchDiffBadge = loan.status === 'reconciled' ?
        '<span style="color:var(--dealer-success); font-size:11px;">差額¥0 (完全一致)</span>' :
        '<span style="color:var(--dealer-text-subtle); font-size:11px;">未照合</span>';

      var actionBtn = loan.status === 'reconciled' ?
        '<span style="font-size:11px; color:#64748b;">消込済 (' + loan.actualSettlementDate + ')</span>' :
        '<button class="btn-primary btn-reconcile-loan" data-id="' + loan.id + '" style="font-size:11px; padding:4px 8px;">消込実行</button>';

      tr.innerHTML = 
        '<td><strong>' + loan.contractId + '</strong></td>' +
        '<td><span style="font-family:monospace; font-size:11px;">' + loan.vin + '</span></td>' +
        '<td>' + loan.salesRep + '</td>' +
        '<td><strong>' + loan.loanCompany + '</strong></td>' +
        '<td>' + (loan.loanApprovalNo || '-') + '</td>' +
        '<td class="numeric font-bold">' + formatYen(loan.contractPrincipal) + '</td>' +
        '<td>' + (loan.expectedSettlementDate || '-') + '</td>' +
        '<td>' + (loan.actualSettlementDate || '-') + '</td>' +
        '<td class="numeric">' + formatYen(loan.actualReceivedAmount) + '</td>' +
        '<td class="numeric font-bold" style="color:var(--dealer-success);">' + formatYen(loan.kickbackAmount) + '</td>' +
        '<td>' + matchDiffBadge + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actionBtn + '</td>';

      tbody.appendChild(tr);
    });

    document.getElementById('kpi-loan-total-principal').textContent = formatYen(totalPrincipal);
    document.getElementById('kpi-loan-total-received').textContent = formatYen(totalReceived);
    document.getElementById('kpi-loan-total-kickback').textContent = formatYen(totalKickback);
    document.getElementById('kpi-loan-pending-total').textContent = formatYen(pendingTotal);

    // 消込ボタンイベント
    document.querySelectorAll('.btn-reconcile-loan').forEach(function(b) {
      b.addEventListener('click', function() {
        openLoanReconcileModal(b.getAttribute('data-id'));
      });
    });

    // 立替金テーブル描画
    renderAdvancesTable();
  }

  function renderAdvancesTable() {
    var advances = loanManager.getAllAdvances();
    var tbody = document.getElementById('advance-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    advances.forEach(function(adv) {
      var tr = document.createElement('tr');
      var typeLabel = adv.type === 'tradein_residual_debt' ? '下取残債一括返済' : '顧客頭金一時立替';
      var statusBadge = adv.status === 'recovered' ? 
        '<span class="badge badge-success">✓ 回収精算完了</span>' : 
        '<span class="badge badge-danger">🚨未回収・立替中</span>';

      var action = adv.status === 'recovered' ? 
        '<span style="font-size:11px; color:#64748b;">精算済</span>' :
        '<button class="btn-outline btn-recover-advance" data-id="' + adv.id + '" style="font-size:11px; padding:3px 6px;">回収完了反映</button>';

      tr.innerHTML = 
        '<td><strong>' + adv.id + '</strong></td>' +
        '<td>' + adv.contractId + '</td>' +
        '<td>' + adv.salesRep + '</td>' +
        '<td>' + typeLabel + '</td>' +
        '<td>' + adv.payee + '</td>' +
        '<td class="numeric font-bold">' + formatYen(adv.amount) + '</td>' +
        '<td>' + adv.paymentDate + '</td>' +
        '<td>' + (adv.recoveredDate || '-') + '</td>' +
        '<td class="numeric">' + formatYen(adv.recoveredAmount) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + action + '</td>';

      tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-recover-advance').forEach(function(b) {
      b.addEventListener('click', function() {
        var advId = b.getAttribute('data-id');
        var adv = loanManager.getAllAdvances().find(function(a) { return a.id === advId; });
        if (adv && confirm('立替金 ' + formatYen(adv.amount) + ' の回収（口座着金・領収）を確認しましたか？')) {
          loanManager.recoverAdvance(advId, adv.amount, new Date().toISOString().slice(0, 10), 'BNK-REC-ADV');
          renderLoanTab();
        }
      });
    });
  }

  // ==========================================
  // ④ 月次粗利監査 ＆ 不正検知コックピットの描画
  // ==========================================
  function renderAuditTab() {
    var summary = auditManager.getMonthlySummary();

    document.getElementById('kpi-audit-sales').textContent = summary.totalDeals + '台 / ' + formatYen(summary.totalSales);
    document.getElementById('kpi-audit-profit').textContent = formatYen(summary.totalGrossProfit);
    document.getElementById('kpi-audit-margin-rate').textContent = summary.avgMarginRate + '%';
    document.getElementById('kpi-audit-stagnant-deposit').textContent = formatYen(summary.totalStagnantDeposit);
    document.getElementById('kpi-audit-tripwire-count').textContent = summary.tripwireAlertCount + ' 件';

    var statusBadge = document.getElementById('badge-audit-tripwire-status');
    if (summary.criticalAlertsCount > 0) {
      statusBadge.className = 'badge badge-danger';
      statusBadge.textContent = '🚨重大統制警告 ' + summary.criticalAlertsCount + '件';
    } else if (summary.tripwireAlertCount > 0) {
      statusBadge.className = 'badge badge-warning';
      statusBadge.textContent = '要確認 ' + summary.tripwireAlertCount + '件';
    } else {
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = '全件正常';
    }

    // トリップワイヤー検知ログの描画
    var tripwires = auditManager.scanAllTripwires();
    var container = document.getElementById('audit-tripwire-container');
    if (container) {
      if (tripwires.length === 0) {
        container.innerHTML = '<div style="padding:16px; background:#f0fdf4; border:1px solid #a7f3d0; border-radius:6px; color:#065f46; font-size:13px; font-weight:600;">✓ 現在、6大フォレンジック・トリップワイヤーの違反および異常値は検知されていません。</div>';
      } else {
        var html = '<div class="tripwire-container"><div class="tripwire-header"><h3>🚨 統制トリップワイヤー検知案件 (' + tripwires.length + '件)</h3></div><ul class="tripwire-list">';
        tripwires.forEach(function(tw) {
          var levelClass = tw.level === 'CRITICAL' ? 'style="border-color:#b91c1c; background:#fff1f2;"' : '';
          html += '<li class="tripwire-item" ' + levelClass + '><strong>[' + tw.level + ' | ' + tw.contractId + ' | 担当: ' + tw.salesRep + ']</strong> ' + tw.message + '</li>';
        });
        html += '</ul></div>';
        container.innerHTML = html;
      }
    }

    // 営業マン別フォレンジック行動統計スコアカードの描画
    var scorecard = auditManager.getSalesRepForensicScorecard();
    var repBody = document.getElementById('salesrep-scorecard-body');
    if (repBody) {
      repBody.innerHTML = '';
      scorecard.forEach(function(rep) {
        var tr = document.createElement('tr');

        var riskBadge = '<span class="badge badge-success">NORMAL (正常)</span>';
        if (rep.riskLevel === 'CRITICAL') {
          riskBadge = '<span class="badge badge-danger">🚨 CRITICAL (横領・中抜きリスク極大)</span>';
        } else if (rep.riskLevel === 'ELEVATED') {
          riskBadge = '<span class="badge badge-warning">⚠️ ELEVATED (要重点監査)</span>';
        }

        var cashRatioColor = rep.cashRatio >= 50 ? 'color:var(--dealer-danger); font-weight:bold;' : '';
        var holdingDaysColor = rep.avgHoldingDays >= 14 ? 'color:var(--dealer-danger); font-weight:bold;' : '';
        var balanceColor = rep.stagnantDepositBalance > 0 ? 'color:var(--dealer-danger); font-weight:bold;' : '';

        tr.innerHTML = 
          '<td><strong>' + rep.name + '</strong></td>' +
          '<td>' + rep.dealCount + ' 台</td>' +
          '<td class="numeric">' + formatYen(rep.totalSales) + '</td>' +
          '<td class="numeric font-bold">' + formatYen(rep.totalProfit) + '</td>' +
          '<td class="numeric">' + rep.avgMarginRate + '%</td>' +
          '<td class="numeric" style="' + cashRatioColor + '">' + rep.cashRatio + '%</td>' +
          '<td class="numeric" style="' + holdingDaysColor + '">' + rep.avgHoldingDays + ' 日</td>' +
          '<td class="numeric" style="' + balanceColor + '">' + formatYen(rep.stagnantDepositBalance) + '</td>' +
          '<td class="numeric font-bold" style="font-size:15px;">' + rep.riskScore + ' pt</td>' +
          '<td>' + riskBadge + '</td>';

        repBody.appendChild(tr);
      });
    }
  }

  // ==========================================
  // バッジ更新
  // ==========================================
  function updateBadges() {
    var stagnantAlerts = expenseManager.detectStagnantDeposits(contractManager);
    var badgeStagnant = document.getElementById('badge-stagnant-count');
    if (badgeStagnant) {
      if (stagnantAlerts.length > 0) {
        badgeStagnant.style.display = 'inline-block';
        badgeStagnant.textContent = stagnantAlerts.length;
      } else {
        badgeStagnant.style.display = 'none';
      }
    }

    var loans = loanManager.getAllLoans().filter(function(l) { return l.status === 'pending'; });
    var badgeLoan = document.getElementById('badge-loan-pending-count');
    if (badgeLoan) {
      if (loans.length > 0) {
        badgeLoan.style.display = 'inline-block';
        badgeLoan.textContent = loans.length;
      } else {
        badgeLoan.style.display = 'none';
      }
    }

    var tripwires = auditManager.scanAllTripwires();
    var badgeTripwire = document.getElementById('badge-tripwire-count');
    if (badgeTripwire) {
      if (tripwires.length > 0) {
        badgeTripwire.style.display = 'inline-block';
        badgeTripwire.textContent = tripwires.length;
      } else {
        badgeTripwire.style.display = 'none';
      }
    }
  }

  // ==========================================
  // 納車出庫物理ゲート審査モーダル
  // ==========================================
  function openDeliveryGateModal(dealId) {
    var deal = contractManager.getDealById(dealId);
    if (!deal) return;

    document.getElementById('gate-deal-id').value = dealId;
    document.getElementById('delivery-gate-title').textContent = '納車出庫 物理ゲートキー審査: ' + deal.model + ' (' + deal.id + ')';

    var container = document.getElementById('delivery-gate-checklist');
    var blockers = [];

    // 1. 諸費用預り金残高ゼロ監査
    var exp = expenseManager.getRecordByContractId(dealId);
    var expCheckHtml = '';
    if (exp) {
      var expMatch = expenseManager.verifyThreeWayMatch(exp);
      if (expMatch.isFullyReconciled) {
        expCheckHtml = '<li style="color:var(--dealer-success); font-weight:600;">✓ 諸費用預り金残高 ¥0（公的レシート番号登録済・三方照合完了）</li>';
      } else {
        var msg = '諸費用預り金が ' + formatYen(expMatch.balance) + ' 残高滞留（0円精算必須）';
        if (!expMatch.allReceiptsAttached) msg += ' / 公的領収書番号未済: ' + expMatch.missingReceiptCount + '件';
        expCheckHtml = '<li style="color:var(--dealer-danger); font-weight:700;">🚨 ' + msg + '</li>';
        blockers.push(msg);
      }
    } else {
      expCheckHtml = '<li style="color:var(--dealer-danger); font-weight:700;">🚨 諸費用預り金台帳レコードが未登録です</li>';
      blockers.push('諸費用レコード未作成');
    }

    // 2. オートローン着金消込監査
    var loanCheckHtml = '';
    if (deal.loanPrincipal > 0) {
      var loan = loanManager.getLoanByContractId(dealId);
      if (loan && loan.status === 'reconciled') {
        loanCheckHtml = '<li style="color:var(--dealer-success); font-weight:600;">✓ 信販オートローン着金消込完了（口座入金確認済）</li>';
      } else {
        var loanMsg = '信販会社オートローン（' + formatYen(deal.loanPrincipal) + '）の口座着金消込が未完了です';
        loanCheckHtml = '<li style="color:var(--dealer-danger); font-weight:700;">🚨 ' + loanMsg + '</li>';
        blockers.push(loanMsg);
      }
    } else {
      loanCheckHtml = '<li style="color:var(--dealer-success); font-weight:600;">✓ 現金全額決済（ローンなし）</li>';
    }

    // 3. 下取車過小査定監査
    var tradeCheckHtml = '';
    if (deal.tradeIn && deal.tradeIn.hasTradeIn) {
      var tradeCheck = contractManager.verifyTradeInValuation(deal.tradeIn);
      if (tradeCheck.requiresOwnerApproval) {
        var tradeMsg = '下取車がUSS基準相場から ' + tradeCheck.deviationRate + '% 低く、オーナー承認未取得です';
        tradeCheckHtml = '<li style="color:var(--dealer-danger); font-weight:700;">🚨 ' + tradeMsg + '</li>';
        blockers.push(tradeMsg);
      } else {
        tradeCheckHtml = '<li style="color:var(--dealer-success); font-weight:600;">✓ 下取車USS相場査定チェック合格</li>';
      }
    }

    var resultSummary = '';
    var confirmBtn = document.getElementById('btn-confirm-delivery');

    if (blockers.length === 0) {
      resultSummary = '<div style="padding:14px; background:#f0fdf4; border:1px solid #a7f3d0; border-radius:6px; color:#065f46; font-weight:700; margin-bottom:14px;">' +
        '✓ 全ゲートチェック合格: 車両キーの引き渡しおよび物理出庫が許可されています。' +
        '</div>';
      confirmBtn.disabled = false;
      confirmBtn.textContent = '出庫ロック解除・納車完了を確定';
    } else {
      resultSummary = '<div style="padding:14px; background:#fef2f2; border:1px solid #fca5a5; border-radius:6px; color:#b91c1c; font-weight:700; margin-bottom:14px;">' +
        '🚨【物理出庫ロック発動中】以下の内部統制条件が未解決のため出庫できません。強制出庫した場合は即座にオーナー直結で違法出庫アラートが発報されます。' +
        '</div>';
      confirmBtn.disabled = false;
      confirmBtn.textContent = '⚠️ 警告を無視して強制出庫（オーナー直結緊急通報）';
    }

    container.innerHTML = resultSummary + '<ul style="list-style:none; display:flex; flex-direction:column; gap:8px; font-size:13px;">' +
      expCheckHtml + loanCheckHtml + tradeCheckHtml + '</ul>';

    openModal('modal-delivery-gate');
  }

  // ==========================================
  // 顧客直結バイパス公式受領書プレビュー
  // ==========================================
  function openCustomerNoticeModal(recordId) {
    var exp = expenseManager.getRecordById(recordId);
    if (!exp) return;
    var deal = contractManager.getDealById(exp.contractId);

    var notice = expenseManager.generateCustomerNotice(recordId, deal);
    var contentDiv = document.getElementById('customer-notice-preview-content');

    var breakdownRows = '';
    notice.taxBreakdown.forEach(function(item) {
      breakdownRows += '<tr><td>' + item.name + '</td><td class="numeric font-bold">' + formatYen(item.amount) + '</td><td>' + item.receiptNo + '</td></tr>';
    });

    contentDiv.innerHTML = 
      '<div style="background:#ffffff; border:2px solid var(--dealer-gold); border-radius:8px; padding:20px; font-size:13px;">' +
        '<div style="text-align:center; border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px;">' +
          '<div style="font-size:11px; color:var(--dealer-gold-text); font-weight:700;">' + notice.companyOfficialHeader + '</div>' +
          '<h3 style="font-size:17px; color:var(--dealer-navy); margin-top:4px;">諸費用預り金 公式受領証明書 兼 精算明細</h3>' +
          '<div style="font-size:11px; color:#64748b;">発行番号: ' + notice.noticeId + ' ｜ 発行日: ' + notice.issueDate + '</div>' +
        '</div>' +
        '<p style="margin-bottom:12px;">貴殿のご成約車両（<strong>' + notice.model + ' / VIN: ' + notice.vin + '</strong>）に関し、弊社がお預かりいたしました諸費用預り金および法定実費内訳を下記の通り公式にご報告申し上げます。</p>' +
        '<table class="dealer-table" style="font-size:12px; margin-bottom:14px;">' +
          '<tr style="background:#f8fafc;"><td style="font-weight:700;">お預かり諸費用受領総額</td><td class="numeric font-bold" style="font-size:14px; color:var(--dealer-navy);">' + formatYen(notice.depositReceived) + '</td><td>公式受領確認済</td></tr>' +
          breakdownRows +
          '<tr><td>店舗登録代行手数料（正規粗利売上）</td><td class="numeric font-bold">' + formatYen(notice.dealerFeeRevenue) + '</td><td>伝票確定</td></tr>' +
          '<tr style="background:#edf2f7;"><td style="font-weight:700;">余剰金返還額（貴殿口座へ返金）</td><td class="numeric font-bold" style="font-size:14px; color:var(--dealer-success);">' + formatYen(notice.customerRefund) + '</td><td>振込照会: ' + (notice.refundWireTransferRef || '手続き中') + '</td></tr>' +
          '<tr style="font-weight:700;"><td>未精算手元残高</td><td class="numeric font-bold" style="color:var(--dealer-success);">' + formatYen(notice.balance) + '</td><td>差額ゼロ精算</td></tr>' +
        '</table>' +
        '<div style="font-size:11px; color:#64748b; background:#f8fafc; padding:10px; border-radius:4px;">' +
          '※本証明書は営業担当者を介さず、本部統制管理システムより直接発行されています。<br>' +
          'ご提示の金額と営業マンとの口頭合意に相違がある場合は、直ちに【' + notice.inquiryContact + '】までご連絡ください。' +
        '</div>' +
      '</div>';

    openModal('modal-customer-notice');
  }

  // ==========================================
  // 実費支払・領収書登録モーダル
  // ==========================================
  function openExpensePayModal(recordId) {
    var exp = expenseManager.getRecordById(recordId);
    if (!exp) return;

    // 未払いの最初の項目または0番目を選択
    var itemIndex = 0;
    for (var i = 0; i < exp.items.length; i++) {
      if (exp.items[i].paidAmount === 0 || !exp.items[i].receiptNo) {
        itemIndex = i;
        break;
      }
    }

    document.getElementById('exp-record-id').value = recordId;
    document.getElementById('exp-item-index').value = itemIndex;
    document.getElementById('exp-item-name').value = exp.items[itemIndex].name;
    document.getElementById('exp-pay-amount').value = exp.items[itemIndex].paidAmount || 50000;
    document.getElementById('exp-receipt-no').value = exp.items[itemIndex].receiptNo || '';
    document.getElementById('exp-receipt-date').value = exp.items[itemIndex].receiptDate || new Date().toISOString().slice(0, 10);

    openModal('modal-expense-pay');
  }

  // ==========================================
  // 諸費用余剰金精算モーダル
  // ==========================================
  function openExpenseFinalizeModal(recordId) {
    var exp = expenseManager.getRecordById(recordId);
    if (!exp) return;

    var actualPaid = 0;
    exp.items.forEach(function(i) { actualPaid += (i.paidAmount || 0); });
    var surplus = exp.depositReceived - actualPaid;

    document.getElementById('finalize-record-id').value = recordId;
    document.getElementById('finalize-dealer-fee').value = exp.dealerFeeRevenue || (surplus > 250000 ? 250000 : surplus);
    document.getElementById('finalize-customer-refund').value = exp.customerRefund || (surplus > 250000 ? surplus - 250000 : 0);
    document.getElementById('finalize-refund-ref').value = exp.refundWireTransferRef || 'TR-REF-2026-001';

    openModal('modal-expense-finalize');
  }

  // ==========================================
  // ローン消込モーダル
  // ==========================================
  function openLoanReconcileModal(loanId) {
    var loan = loanManager.getLoanById(loanId);
    if (!loan) return;

    document.getElementById('rec-loan-id').value = loanId;
    document.getElementById('rec-loan-info').value = loan.loanCompany + ' / 元金: ' + formatYen(loan.contractPrincipal);

    var kickback = loan.kickbackAmount || Math.round(loan.contractPrincipal * 0.025);
    var fee = loan.handlingFee || 100000;
    var expected = loan.contractPrincipal + kickback - fee;

    document.getElementById('rec-actual-received').value = expected;
    document.getElementById('rec-kickback').value = kickback;
    document.getElementById('rec-handling-fee').value = fee;
    document.getElementById('rec-settlement-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('rec-bank-ref').value = 'BNK-REC-' + Date.now().toString().slice(-6);

    openModal('modal-loan-reconcile');
  }

  // ==========================================
  // 専属行政書士用 陸運局出庫承認パス
  // ==========================================
  function openScrivenerPassModal(contractId) {
    try {
      var pass = supremeManager.generateScrivenerGatePass(contractId);
      var container = document.getElementById('scrivener-pass-content');
      container.innerHTML = 
        '<div class="gate-pass-card">' +
          '<div class="gate-pass-header">' +
            '<div class="gate-pass-title">🏛️ 陸運局 登録申請・出庫承認パス（専属行政書士 専任用）</div>' +
            '<div class="security-token-pill">' + pass.securityToken + '</div>' +
          '</div>' +
          '<p style="font-size:13px; margin-bottom:12px;">本承認書は、成約代金決済・諸費用預り金残高0円精算（公的レシート紐付済）および信販着金が完全確認されたことを証明する不可逆ゲートキーです。</p>' +
          '<table class="dealer-table" style="font-size:12px; margin-bottom:14px;">' +
            '<tr><td>管理契約番号</td><td><strong>' + pass.contractId + '</strong></td><td>車台番号(VIN)</td><td><span style="font-family:monospace;">' + pass.vin + '</span></td></tr>' +
            '<tr><td>車種モデル</td><td><strong>' + pass.model + '</strong></td><td>担当営業</td><td>' + pass.salesRep + '</td></tr>' +
            '<tr><td>諸費用残高照合</td><td><span style="color:var(--dealer-success); font-weight:700;">✓ 残高¥' + pass.verifiedDepositBalance + ' (公的領収書' + pass.verifiedReceiptCount + '点完備)</span></td><td>ローン・決済</td><td><span style="color:var(--dealer-success); font-weight:700;">✓ ' + pass.loanCleared + '</span></td></tr>' +
            '<tr><td>統制監査実施者</td><td colspan="3"><strong>' + pass.inspectorName + '</strong> (承認日時: ' + pass.issueTimestamp + ')</td></tr>' +
          '</table>' +
          '<div class="gate-pass-barcode-area">' +
            '<div class="barcode-strip">||| | |||| || ||| |||| | |||</div>' +
            '<div style="text-align:right;"><span style="font-size:11px; color:#64748b;">Security Verified Hash</span><br><strong style="font-family:monospace; font-size:13px;">' + pass.securityToken + '</strong></div>' +
          '</div>' +
          '<div class="vip-warning-box" style="margin-top:14px; font-size:11px; border-left-color:var(--dealer-danger); color:#991b1b; background:#fef2f2;">' +
            nl2br(pass.scrivenerMandateClause) +
          '</div>' +
        '</div>';
      openModal('modal-scrivener-pass');
    } catch (err) {
      alert('【行政書士パス 発行拒否】\n' + err.message);
    }
  }

  // ==========================================
  // 第三者 50点パーツ検収アーカイブ モーダル
  // ==========================================
  function openPartsAuditModal() {
    var select = document.getElementById('parts-contract-id');
    if (select) {
      select.innerHTML = '';
      contractManager.getAllDeals().forEach(function(d) {
        var opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.id + ': ' + d.model + ' (' + d.salesRep + ')';
        select.appendChild(opt);
      });
    }
    document.getElementById('parts-inspector-name').value = '統制室 専任検査員';
    openModal('modal-parts-audit');
  }

  // ==========================================
  // オーナー室直属 年次VIP顧客 取引照合状 モーダル
  // ==========================================
  function openVipAuditModal() {
    var statement = supremeManager.generateVipAnnualAuditStatement('ALL', 2026);
    var container = document.getElementById('vip-statement-content');
    var rows = '';
    statement.deals.forEach(function(d) {
      rows += '<tr>' +
        '<td><strong>' + d.contractDate + '</strong></td>' +
        '<td><strong>' + d.model + '</strong><br><span style="font-family:monospace; font-size:10px;">' + d.vin + '</span></td>' +
        '<td class="numeric font-bold">' + formatYen(d.contractTotal) + '</td>' +
        '<td>' + d.tradeInModel + (d.tradeInAppraisal > 0 ? ' (' + formatYen(d.tradeInAppraisal) + ')' : '') + '</td>' +
        '<td class="numeric">' + formatYen(d.expenseDeposit) + '</td>' +
        '<td class="numeric font-bold" style="color:var(--dealer-success);">' + formatYen(d.expenseRefund) + '</td>' +
        '<td>' + d.salesRep + '</td>' +
      '</tr>';
    });

    container.innerHTML = 
      '<div class="vip-statement-card">' +
        '<div class="vip-letterhead">' +
          '<div style="font-size:12px; color:var(--dealer-gold-text); font-weight:700;">' + statement.officialSender + '</div>' +
          '<h2 class="vip-letter-title" style="margin-top:6px;">年次VIP顧客 お取引実績照合状 兼 公式御礼状</h2>' +
          '<div style="font-size:11px; color:#64748b;">文書照合番号: ' + statement.letterId + ' ｜ 発行日: ' + statement.issueDate + '</div>' +
        '</div>' +
        '<p style="font-size:13px; margin-bottom:14px; line-height:1.7;">' +
          '拝啓　平素は格別のご高配を賜り、心より厚く御礼申し上げます。<br>' +
          '本状は、弊社代表オーナー室より、お客様の資産保全および最高峰のアフターサービス・保証権利を厳格に期するため、' +
          '本年（' + statement.targetYear + '年）の公式お取引内容の一覧をご報告申し上げる親展状でございます。' +
        '</p>' +
        '<table class="dealer-table" style="font-size:12px; margin-bottom:14px;">' +
          '<thead><tr><th>成約日</th><th>ご成約車両</th><th class="numeric">総お支払額</th><th>下取車両(査定額)</th><th class="numeric">諸費用受託</th><th class="numeric">余剰返還額</th><th>担当営業</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '<div class="vip-warning-box">' +
          nl2br(statement.warningClause) +
          '<div style="margin-top:8px; font-weight:700;">' + statement.confidentialHotline + '</div>' +
        '</div>' +
      '</div>';

    openModal('modal-vip-audit');
  }

  // ==========================================
  // フォームおよびボタンイベント
  // ==========================================
  function bindFormEvents() {
    // 新規成約締め登録フォーム
    var formDeal = document.getElementById('form-deal');
    if (formDeal) {
      formDeal.addEventListener('submit', function(e) {
        e.preventDefault();

        try {
          var dealData = {
            id: document.getElementById('deal-id').value.trim(),
            vin: document.getElementById('deal-vin').value.trim(),
            model: document.getElementById('deal-model').value.trim(),
            year: Number(document.getElementById('deal-year').value),
            salesRep: document.getElementById('deal-salesrep').value.trim(),
            contractDate: document.getElementById('deal-contract-date').value,
            deliveryDate: document.getElementById('deal-delivery-date').value,

            vehiclePrice: Number(document.getElementById('deal-vehicle-price').value),
            optionPrice: Number(document.getElementById('deal-option-price').value),
            expenseMargin: Number(document.getElementById('deal-expense-margin').value),
            loanKickback: Number(document.getElementById('deal-loan-kickback').value),
            contractTotal: Number(document.getElementById('deal-contract-total').value),

            downPayment: Number(document.getElementById('deal-down-payment').value),
            downPaymentMethod: document.getElementById('deal-down-method').value,
            loanPrincipal: Number(document.getElementById('deal-loan-principal').value),
            tradeInAllowance: Number(document.getElementById('deal-tradein-allowance').value),

            purchaseCost: Number(document.getElementById('deal-purchase-cost').value),
            repairCost: Number(document.getElementById('deal-repair-cost').value),
            repairInvoiceNo: document.getElementById('deal-repair-invoice').value.trim(),
            transportCost: Number(document.getElementById('deal-transport-cost').value),
            transportInvoiceNo: document.getElementById('deal-transport-invoice').value.trim(),

            tradeIn: {
              hasTradeIn: document.getElementById('deal-has-tradein').value === 'true',
              model: document.getElementById('deal-tradein-model').value.trim(),
              ussBenchmark: Number(document.getElementById('deal-tradein-uss').value),
              appraisalValue: Number(document.getElementById('deal-tradein-appraisal').value),
              ownerApproved: document.getElementById('deal-tradein-owner-approved').checked
            }
          };

          contractManager.addDeal(dealData);

          // 諸費用管理レコードの初期自動生成
          if (!expenseManager.getRecordByContractId(dealData.id)) {
            expenseManager.createRecord({
              contractId: dealData.id,
              vin: dealData.vin,
              salesRep: dealData.salesRep,
              depositReceived: 1000000,
              depositMethod: dealData.downPaymentMethod
            });
          }

          // ローンレコードの自動生成（ローンがある場合）
          if (dealData.loanPrincipal > 0 && !loanManager.getLoanByContractId(dealData.id)) {
            loanManager.createLoan({
              contractId: dealData.id,
              vin: dealData.vin,
              salesRep: dealData.salesRep,
              loanCompany: 'オリコ オートローン',
              loanApprovalNo: 'AP-' + Math.floor(Math.random() * 899999 + 100000),
              contractPrincipal: dealData.loanPrincipal,
              kickbackAmount: dealData.loanKickback
            });
          }

          // オーナー直結リアルタイム同期
          if (syncManager.isConfigured()) {
            var payload = syncManager.prepareSyncPayload('sync_deal', dealData);
            syncManager.sendToCloud(payload);
          }

          closeModal('modal-deal');
          renderAll();
          alert('成約レコード（' + dealData.id + ': ' + dealData.model + '）を確定保存しました。');
        } catch (err) {
          alert('【保存ブロック】' + err.message);
        }
      });
    }

    // 諸費用納付保存
    var btnSaveExpPay = document.getElementById('btn-save-expense-pay');
    if (btnSaveExpPay) {
      btnSaveExpPay.addEventListener('click', function() {
        var recId = document.getElementById('exp-record-id').value;
        var itemIdx = Number(document.getElementById('exp-item-index').value);
        var amount = Number(document.getElementById('exp-pay-amount').value);
        var receiptNo = document.getElementById('exp-receipt-no').value.trim();
        var receiptDate = document.getElementById('exp-receipt-date').value;

        if (!receiptNo) {
          alert('公的領収証書番号・納税証明レシート番号の入力は必須です（改ざん防止規約）');
          return;
        }

        expenseManager.recordPaymentItem(recId, itemIdx, amount, receiptNo, receiptDate);
        closeModal('modal-expense-pay');
        renderAll();
      });
    }

    // 諸費用余剰金最終精算
    var btnSaveFinalize = document.getElementById('btn-save-finalize-expense');
    if (btnSaveFinalize) {
      btnSaveFinalize.addEventListener('click', function() {
        var recId = document.getElementById('finalize-record-id').value;
        var fee = Number(document.getElementById('finalize-dealer-fee').value);
        var refund = Number(document.getElementById('finalize-customer-refund').value);
        var ref = document.getElementById('finalize-refund-ref').value.trim();

        expenseManager.finalizeSettlement(recId, fee, refund, ref);
        closeModal('modal-expense-finalize');
        renderAll();
      });
    }

    // 出庫ゲート解除・納車完了
    var btnConfirmDelivery = document.getElementById('btn-confirm-delivery');
    if (btnConfirmDelivery) {
      btnConfirmDelivery.addEventListener('click', function() {
        var dealId = document.getElementById('gate-deal-id').value;
        var result = contractManager.attemptDelivery(dealId, expenseManager, loanManager);

        closeModal('modal-delivery-gate');
        renderAll();

        if (result.success) {
          alert('出庫ゲート解除成功: 納車完了ステータスへ移行しました。');
        } else {
          alert('🚨【違法出庫ロック検知】未解決の統制項目があるため、違法出庫としてオーナーへ緊急通報されました。\n' + result.blockers.join('\n'));
        }
      });
    }

    // ローン消込実行
    var btnSaveLoanRec = document.getElementById('btn-save-loan-reconcile');
    if (btnSaveLoanRec) {
      btnSaveLoanRec.addEventListener('click', function() {
        var loanId = document.getElementById('rec-loan-id').value;
        var actual = Number(document.getElementById('rec-actual-received').value);
        var kickback = Number(document.getElementById('rec-kickback').value);
        var fee = Number(document.getElementById('rec-handling-fee').value);
        var date = document.getElementById('rec-settlement-date').value;
        var ref = document.getElementById('rec-bank-ref').value;

        try {
          loanManager.reconcileLoan(loanId, actual, kickback, fee, date, ref);
          closeModal('modal-loan-reconcile');
          renderAll();
          alert('ローン着金消込が完了しました（差額¥0 一致確認）。');
        } catch (err) {
          alert('【消込エラー】' + err.message);
        }
      });
    }

    // 法定税額シミュレーター入力変化
    var calcInputs = ['calc-displacement', 'calc-weight', 'calc-month', 'calc-term', 'calc-price'];
    // 第三者パーツ検収フォーム送信
    var formParts = document.getElementById('form-parts-audit');
    if (formParts) {
      formParts.addEventListener('submit', function(e) {
        e.preventDefault();
        try {
          var contractId = document.getElementById('parts-contract-id').value;
          var stage = document.getElementById('parts-stage').value;
          var inspector = document.getElementById('parts-inspector-name').value.trim();
          var deal = contractManager.getDealById(contractId);

          supremeManager.recordPartsAudit({
            contractId: contractId,
            vin: deal ? deal.vin : '',
            model: deal ? deal.model : '',
            inspectionStage: stage,
            inspectorName: inspector,
            brakeVerified: document.getElementById('chk-part-brake').checked,
            wheelVerified: document.getElementById('chk-part-wheel').checked,
            exhaustVerified: document.getElementById('chk-part-exhaust').checked,
            interiorVerified: document.getElementById('chk-part-interior').checked,
            ecuVerified: document.getElementById('chk-part-ecu').checked,
            photoArchiveCount: 50
          });

          closeModal('modal-parts-audit');
          alert('第三者パーツ検収レコード（50枚高精細アーカイブ紐付）を確定保存しました。');
        } catch (err) {
          alert('【パーツ検収ブロック】\n' + err.message);
        }
      });
    }
  }

  // 法定税額シミュレーション実行
  function runTaxSimulation() {
    var res = expenseManager.calculateStatutoryTaxes({
      displacement: Number(document.getElementById('calc-displacement').value),
      curbWeight: Number(document.getElementById('calc-weight').value),
      registrationMonth: Number(document.getElementById('calc-month').value),
      inspectionTermMonths: Number(document.getElementById('calc-term').value),
      vehiclePrice: Number(document.getElementById('calc-price').value)
    });

    document.getElementById('res-auto-tax').textContent = formatYen(res.autoTax) + ' (' + res.remainingMonths + 'ヶ月分)';
    document.getElementById('res-weight-tax').textContent = formatYen(res.weightTax);
    document.getElementById('res-env-tax').textContent = formatYen(res.environmentalTax);
    document.getElementById('res-comp-ins').textContent = formatYen(res.compulsoryInsurance);
    document.getElementById('res-statutory-total').textContent = formatYen(res.statutoryTotal);
  }

  function bindActionButtons() {
    // 50点パーツ検収モーダル開く
    var btnOpenParts = document.getElementById('btn-open-parts-audit');
    if (btnOpenParts) {
      btnOpenParts.addEventListener('click', function() {
        openPartsAuditModal();
      });
    }

    // オーナー室VIP年次取引照合状開く
    var btnOpenVip = document.getElementById('btn-open-vip-letter');
    if (btnOpenVip) {
      btnOpenVip.addEventListener('click', function() {
        openVipAuditModal();
      });
    }

    // 行政書士出庫パス印刷
    var btnPrintPass = document.getElementById('btn-print-scrivener-pass');
    if (btnPrintPass) {
      btnPrintPass.addEventListener('click', function() {
        window.print();
      });
    }

    // VIP親展状印刷
    var btnPrintVip = document.getElementById('btn-print-vip-letter');
    if (btnPrintVip) {
      btnPrintVip.addEventListener('click', function() {
        window.print();
      });
    }
    // 新規成約モーダル開く
    var btnOpenNewDeal = document.getElementById('btn-open-new-deal');
    if (btnOpenNewDeal) {
      btnOpenNewDeal.addEventListener('click', function() {
        var form = document.getElementById('form-deal');
        if (form) form.reset();
        document.getElementById('deal-id').value = 'CT-2026-00' + (contractManager.getAllDeals().length + 1);
        document.getElementById('deal-contract-date').value = new Date().toISOString().slice(0, 10);
        openModal('modal-deal');
      });
    }

    // 法定税額シミュレーター開く
    var btnOpenTaxCalc = document.getElementById('btn-open-tax-calc');
    if (btnOpenTaxCalc) {
      btnOpenTaxCalc.addEventListener('click', function() {
        runTaxSimulation();
        openModal('modal-tax-calc');
      });
    }

    // デモデータ読込
    var btnDemoData = document.getElementById('btn-demo-data');
    if (btnDemoData) {
      btnDemoData.addEventListener('click', function() {
        if (confirm('【検証デモデータ読込】\n歴30年トップ営業マン（神田部長）の不正シミュレーションを含む3台の検証データをロードしますか？')) {
          loadDemoData();
          renderAll();
          alert('検証デモデータをロードしました。ポルシェ911の「出庫ゲート審査」やタブ④「月次粗利監査」をご確認いただけます。');
        }
      });
    }

    // 本番データ初期化（全消去）
    var btnClearProd = document.getElementById('btn-clear-production');
    if (btnClearProd) {
      btnClearProd.addEventListener('click', function() {
        if (confirm('【本番データ初期化】\n登録されているすべてのデータ（成約、諸費用、ローン、監査ログ）を消去し、まっさらな本番運用状態へリセットしますか？\n（この操作は取り消せません）')) {
          contractManager.clearAll();
          expenseManager.clearAll();
          loanManager.clearAll();
          auditManager.clearAll();
          if (supremeManager && supremeManager.clearAll) supremeManager.clearAll();
          renderAll();
          alert('本番運用データベースを初期化しました。デモデータはすべて消去され、1台目から実際の成約データを入力できる本番モードになりました。');
        }
      });
    }

    // 即時ディープスキャン実行
    var btnScan = document.getElementById('btn-scan-tripwires');
    if (btnScan) {
      btnScan.addEventListener('click', function() {
        renderAuditTab();
        alert('6大フォレンジック・トリップワイヤーの全件ディープスキャンを完了しました。');
      });
    }

    // A4印刷
    var btnPrint = document.getElementById('btn-print-audit-report');
    if (btnPrint) {
      btnPrint.addEventListener('click', function() {
        window.print();
      });
    }

    // クラウド設定
    var btnCloud = document.getElementById('btn-cloud-config');
    if (btnCloud) {
      btnCloud.addEventListener('click', function() {
        document.getElementById('cfg-showroom-name').value = syncManager.config.showroomName || '麻布ショールーム';
        document.getElementById('cfg-endpoint-url').value = syncManager.config.endpointUrl || '';
        openModal('modal-cloud-settings');
      });
    }

    var btnSaveCloud = document.getElementById('btn-save-cloud-settings');
    if (btnSaveCloud) {
      btnSaveCloud.addEventListener('click', function() {
        var name = document.getElementById('cfg-showroom-name').value.trim();
        var url = document.getElementById('cfg-endpoint-url').value.trim();
        syncManager.saveSettings(url, name);
        closeModal('modal-cloud-settings');
        updateCloudStatusUI();
        alert('オーナー専用クラウド同期設定を保存しました。');
      });
    }
  }

  function updateCloudStatusUI() {
    var badge = document.getElementById('dealer-sync-badge');
    var text = document.getElementById('dealer-sync-text');
    if (!badge || !text) return;

    if (syncManager.isConfigured()) {
      badge.className = 'sync-badge connected';
      text.textContent = 'オーナー直結: 接続中';
    } else {
      badge.className = 'sync-badge unconfigured';
      text.textContent = 'クラウド: 未設定';
    }
  }

  // ==========================================
  // 検証用リアルデモデータ投入
  // （30年トップセールスマンの攻撃手口を含む完全検証モデル）
  // ==========================================
  function loadDemoData() {
    contractManager.clearAll();
    expenseManager.clearAll();
    loanManager.clearAll();

    // 1. 歴32年トップセールスマン「神田 敏幸（営業部長）」の不正・欺瞞シナリオ
    // 車両: Porsche 911 GT3 (992)
    // 手口A: 諸費用預り金120万円を現金で受け取り、28日間手元に滞留（自転車操業中）
    // 手口B: 下取車（Ferrari California）をUSS相場1600万円のところ1100万円で過小査定（オーナー承認未取得）
    // 手口C: 未精算のまま出庫ゲートを突破しようとした形跡
    var dealKandaData = {
      id: 'CT-2026-001',
      vin: 'WP0ZZZ99ZTS194821',
      model: 'Porsche 911 GT3 (992)',
      year: 2024,
      salesRep: '神田 敏幸（営業部長・歴32年）',
      contractDate: '2026-08-28',
      deliveryDate: '2026-09-20',
      status: 'contracted',

      vehiclePrice: 28500000,
      optionPrice: 2000000,
      expenseMargin: 800000,
      loanKickback: 700000,
      contractTotal: 32000000,

      downPayment: 5000000,
      downPaymentMethod: 'cash', // 現金手渡し
      loanPrincipal: 22000000,
      tradeInAllowance: 5000000,

      purchaseCost: 24500000,
      repairCost: 650000,
      repairInvoiceNo: 'INV-KD-001',
      transportCost: 150000,
      transportInvoiceNo: 'TP-KD-001',

      tradeIn: {
        hasTradeIn: true,
        vin: 'ZFF65LJB000189211',
        model: 'Ferrari California T',
        year: 2016,
        mileage: 24000,
        ussBenchmark: 16000000,   // USSオークション相場: 1,600万円
        appraisalValue: 11000000, // 査定買叩き: 1,100万円 (差額500万・乖離率31.3%！)
        remainingDebt: 6000000,
        ownerApproved: false      // オーナー未承認！（下取査定ロック＆監査アラート対象）
      }
    };
    var profitKanda = contractManager.calculateProfit(dealKandaData);
    dealKandaData.totalSales = profitKanda.totalSales;
    dealKandaData.totalCost = profitKanda.totalCost;
    dealKandaData.grossProfit = profitKanda.grossProfit;
    dealKandaData.marginRate = profitKanda.marginRate;
    dealKandaData.illegalDelivery = true;
    contractManager.deals.push(dealKandaData);
    contractManager._save();
    var dealKanda = dealKandaData;

    // 神田の諸費用預り金（受領120万、税金納付後61万5,800円が手元に滞留）
    var expKanda = expenseManager.createRecord({
      contractId: 'CT-2026-001',
      vin: 'WP0ZZZ99ZTS194821',
      salesRep: '神田 敏幸（営業部長・歴32年）',
      depositReceived: 1200000,
      depositDate: '2026-08-28',
      depositMethod: 'cash',
      items: [
        { name: '自動車税（種別割）', estimatedAmount: 32750, paidAmount: 32750, receiptNo: 'TAX-TOKYO-9921', status: 'paid' },
        { name: '自動車重量税', estimatedAmount: 36900, paidAmount: 36900, receiptNo: 'WGT-STAMP-8812', status: 'paid' },
        { name: '環境性能割', estimatedAmount: 450000, paidAmount: 450000, receiptNo: 'ENV-ZEI-7719', status: 'paid' },
        { name: '自賠責保険料', estimatedAmount: 23690, paidAmount: 23690, receiptNo: 'JIB-POL-6612', status: 'paid' },
        { name: 'ナンバープレート代', estimatedAmount: 4500, paidAmount: 4500, receiptNo: 'PLT-5512', status: 'paid' },
        { name: '車庫証明証紙代', estimatedAmount: 2700, paidAmount: 2700, receiptNo: 'GAR-POLICE-44', status: 'paid' },
        { name: '登録印紙・OSS代', estimatedAmount: 2800, paidAmount: 2800, receiptNo: '', status: 'paid' }, // 領収書番号未済！
        { name: '登録陸送実費', estimatedAmount: 30860, paidAmount: 30860, receiptNo: 'TR-KD-99', status: 'paid' }
      ],
      dealerFeeRevenue: 0,
      customerRefund: 0
    });

    // 神田のローン（未着金・承認のみ）
    loanManager.createLoan({
      contractId: 'CT-2026-001',
      vin: 'WP0ZZZ99ZTS194821',
      salesRep: '神田 敏幸（営業部長・歴32年）',
      loanCompany: 'ジャックス オートローン',
      loanApprovalNo: 'JAC-881920',
      contractPrincipal: 22000000,
      kickbackAmount: 700000,
      contractDate: '2026-08-28'
    });

    // 神田の違法出庫試行（ロック発動）
    dealKanda.illegalDelivery = true;
    contractManager._save();

    // 2. 実直な若手シニア営業「佐藤 健一」のクリーン成約モデル
    // 車両: Mercedes-AMG G63 (W463A)
    // 全て三方照合・領収書完備・振込決済・残高ゼロ・納車完了
    var dealSato = contractManager.addDeal({
      id: 'CT-2026-002',
      vin: 'W1N4632761X392184',
      model: 'Mercedes-AMG G63 (W463A)',
      year: 2023,
      salesRep: '佐藤 健一（シニアセールス・歴8年）',
      contractDate: '2026-09-02',
      deliveryDate: '2026-09-18',
      status: 'delivered',

      vehiclePrice: 24500000,
      optionPrice: 1500000,
      expenseMargin: 500000,
      loanKickback: 525000,
      contractTotal: 27025000,

      downPayment: 10025000,
      downPaymentMethod: 'wire', // 銀行振込
      loanPrincipal: 17000000,
      tradeInAllowance: 0,

      purchaseCost: 20500000,
      repairCost: 350000,
      repairInvoiceNo: 'INV-MB-901',
      transportCost: 80000,
      transportInvoiceNo: 'TP-MB-102',

      tradeIn: { hasTradeIn: false }
    });

    // 佐藤の諸費用預り金（受託95万、実費64万2,800円、代行売上25万、返金5万7,200円で残高0円完結！）
    var expSato = expenseManager.createRecord({
      contractId: 'CT-2026-002',
      vin: 'W1N4632761X392184',
      salesRep: '佐藤 健一（シニアセールス・歴8年）',
      depositReceived: 950000,
      depositDate: '2026-09-02',
      depositMethod: 'wire',
      items: [
        { name: '自動車税（種別割）', estimatedAmount: 32750, paidAmount: 32750, receiptNo: 'TAX-TYO-8801', status: 'paid' },
        { name: '自動車重量税', estimatedAmount: 49200, paidAmount: 49200, receiptNo: 'WGT-TAX-8802', status: 'paid' },
        { name: '環境性能割', estimatedAmount: 510000, paidAmount: 510000, receiptNo: 'ENV-TAX-8803', status: 'paid' },
        { name: '自賠責保険料', estimatedAmount: 23690, paidAmount: 23690, receiptNo: 'JIB-POL-8804', status: 'paid' },
        { name: 'ナンバープレート代', estimatedAmount: 4500, paidAmount: 4500, receiptNo: 'PLT-8805', status: 'paid' },
        { name: '車庫証明証紙代', estimatedAmount: 2700, paidAmount: 2700, receiptNo: 'GAR-8806', status: 'paid' },
        { name: '登録印紙・OSS代', estimatedAmount: 2800, paidAmount: 2800, receiptNo: 'OSS-8807', status: 'paid' },
        { name: '登録陸送実費', estimatedAmount: 17160, paidAmount: 17160, receiptNo: 'TR-8808', status: 'paid' }
      ],
      dealerFeeRevenue: 250000,
      customerRefund: 57200,
      refundWireTransferRef: 'TR-REF-2026-0915-001',
      refundDate: '2026-09-15'
    });

    // 佐藤のローン（オリコ 1700万 消込完了！）
    var loanSato = loanManager.createLoan({
      contractId: 'CT-2026-002',
      vin: 'W1N4632761X392184',
      salesRep: '佐藤 健一（シニアセールス・歴8年）',
      loanCompany: 'オリコ オートローン',
      loanApprovalNo: 'ORC-991204',
      contractPrincipal: 17000000,
      kickbackAmount: 525000,
      handlingFee: 125000
    });
    loanManager.reconcileLoan(loanSato.id, 17400000, 525000, 125000, '2026-09-12', 'BNK-ORC-991');

    // 3. 神田の別案件（超高額車両・架空加修水増し疑い）
    // 車両: Rolls-Royce Ghost V12
    var dealGhost = contractManager.addDeal({
      id: 'CT-2026-003',
      vin: 'SCA664D00LUX99012',
      model: 'Rolls-Royce Ghost V12 (Black Badge)',
      year: 2024,
      salesRep: '神田 敏幸（営業部長・歴32年）',
      contractDate: '2026-08-15',
      deliveryDate: '2026-09-30',
      status: 'contracted',

      vehiclePrice: 42000000,
      optionPrice: 3000000,
      expenseMargin: 1000000,
      loanKickback: 950000,
      contractTotal: 46950000,

      downPayment: 16950000,
      downPaymentMethod: 'cash',
      loanPrincipal: 30000000,
      tradeInAllowance: 0,

      purchaseCost: 36000000,
      repairCost: 2200000, // 220万円の超高額加修！
      repairInvoiceNo: '', // 外注伝票未登録（リベート疑いトリップワイヤー！）
      transportCost: 300000,
      transportInvoiceNo: 'TP-RR-001',

      tradeIn: { hasTradeIn: false }
    });

    expenseManager.createRecord({
      contractId: 'CT-2026-003',
      vin: 'SCA664D00LUX99012',
      salesRep: '神田 敏幸（営業部長・歴32年）',
      depositReceived: 1500000,
      depositDate: '2026-08-15',
      depositMethod: 'cash'
    });

    loanManager.createLoan({
      contractId: 'CT-2026-003',
      vin: 'SCA664D00LUX99012',
      salesRep: '神田 敏幸（営業部長・歴32年）',
      loanCompany: 'アプラス オートローン',
      loanApprovalNo: 'APL-771290',
      contractPrincipal: 30000000,
      kickbackAmount: 950000,
      contractDate: '2026-08-15' // 40日以上未着金滞留！
    });
  }

  // DOMロード時に開始（すでにロード済みの場合は即座に初期化）
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

})(typeof window !== 'undefined' ? window : this);
