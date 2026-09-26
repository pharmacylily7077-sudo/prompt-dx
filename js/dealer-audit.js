/**
 * 外車・高級車販売 資金統制・不正根絶システム
 * 月次粗利監査・6大フォレンジックトリップワイヤー・営業別リスクスコアマネージャー (DealerAuditManager)
 * 
 * 統制機能:
 * 1. 6大フォレンジックトリップワイヤーによる多角的不正検知
 * 2. 営業マン別フォレンジック行動統計（預り金滞留日数、現金決済比率、特定外注集中度）
 * 3. 月次横断粗利集計（総売上、個別総原価、確定粗利、ローンキックバック）
 * 4. オーナー決裁印・統制監査印欄付きA4印刷帳票データ生成
 */

(function(global) {
  'use strict';

  function DealerAuditManager(contractManager, expenseManager, loanManager) {
    this.contractManager = contractManager;
    this.expenseManager = expenseManager;
    this.loanManager = loanManager;
  }

  /**
   * 6大フォレンジックトリップワイヤーの全件スキャン
   */
  DealerAuditManager.prototype.scanAllTripwires = function() {
    var alerts = [];

    var deals = this.contractManager ? this.contractManager.getAllDeals() : [];
    var expenses = this.expenseManager ? this.expenseManager.getAllRecords() : [];
    var loans = this.loanManager ? this.loanManager.getAllLoans() : [];

    // トリップワイヤー1: 納車済・諸費用預り金滞留（横領・自転車操業検知）
    if (this.expenseManager) {
      var stagnantExpenseAlerts = this.expenseManager.detectStagnantDeposits(this.contractManager);
      alerts = alerts.concat(stagnantExpenseAlerts);
    }

    // トリップワイヤー2: 公的領収証書番号・納税証明書の未登録
    for (var i = 0; i < expenses.length; i++) {
      var exp = expenses[i];
      if (exp.items && Array.isArray(exp.items)) {
        for (var j = 0; j < exp.items.length; j++) {
          var item = exp.items[j];
          if (item.paidAmount > 0 && (!item.receiptNo || item.receiptNo.trim() === '')) {
            alerts.push({
              level: 'WARNING',
              type: 'MISSING_TAX_RECEIPT_VOUCHER',
              contractId: exp.contractId,
              vin: exp.vin,
              salesRep: exp.salesRep,
              category: item.name,
              paidAmount: item.paidAmount,
              message: '【⚠️公的納税レシート未登録】' + item.name + '（' + item.paidAmount + 
                       '円）の支払が計上されていますが、公的納付書・領収証書番号が未入力です。'
            });
          }
        }
      }
    }

    // トリップワイヤー3: 下取車 異常過小査定（闇転売・中抜き疑惑）
    for (var k = 0; k < deals.length; k++) {
      var deal = deals[k];
      if (deal.tradeIn && deal.tradeIn.hasTradeIn) {
        var tradeCheck = this.contractManager.verifyTradeInValuation(deal.tradeIn);
        if (tradeCheck.isUndervalued && !deal.tradeIn.ownerApproved) {
          alerts.push({
            level: 'CRITICAL',
            type: 'UNDERVALUED_TRADE_IN_ALERT',
            contractId: deal.id,
            vin: deal.vin,
            salesRep: deal.salesRep,
            model: deal.tradeIn.model,
            ussBenchmark: tradeCheck.ussBenchmark,
            appraisalValue: tradeCheck.appraisalValue,
            deviationRate: tradeCheck.deviationRate,
            message: '【🚨下取車 異常過小査定・中抜き疑惑】下取車（' + deal.tradeIn.model + '）の査定額が' +
                     'USS基準相場より ' + tradeCheck.deviationRate + '%（差額 ' + tradeCheck.diffAmount + '円）低く設定されています（オーナー承認未取得）。'
          });
        }
      }

      // トリップワイヤー4: 加修整備費の水増し疑惑（外注キックバック疑い）
      // 車両価格に対して加修費が15%超、または150万円以上の高額整備で外注伝票不備
      if (deal.repairCost >= 1500000 || (deal.vehiclePrice > 0 && (deal.repairCost / deal.vehiclePrice) >= 0.15)) {
        if (!deal.repairInvoiceNo || deal.repairInvoiceNo.trim() === '') {
          alerts.push({
            level: 'WARNING',
            type: 'INFLATED_REPAIR_COST_ALERT',
            contractId: deal.id,
            vin: deal.vin,
            salesRep: deal.salesRep,
            repairCost: deal.repairCost,
            repairVendor: deal.repairVendor || '指定外注先',
            message: '【⚠️加修整備費 水増し・外注リベート疑惑】加修整備費 ' + deal.repairCost + 
                     '円 が計上されていますが、正規外注工場の納品伝票番号が未登録です。'
          });
        }
      }

      // トリップワイヤー5: 違法出庫ゲート突破（未精算・ロック中の納車）
      if (deal.illegalDelivery) {
        alerts.push({
          level: 'CRITICAL',
          type: 'ILLEGAL_DELIVERY_GATE_BREACH',
          contractId: deal.id,
          vin: deal.vin,
          salesRep: deal.salesRep,
          message: '【🚨出庫ロック突破・重大統制違反】諸費用預り金残高またはローン未消込の状態で、出庫操作が行われました。'
        });
      }
    }

    // トリップワイヤー6: 信販着金遅延（30日超）
    if (this.loanManager) {
      var loanAlerts = this.loanManager.detectOverdueLoans(this.contractManager);
      alerts = alerts.concat(loanAlerts);
    }

    return alerts;
  };

  /**
   * 営業マン別フォレンジック行動統計スコアカード
   * 30年トップセールスマン等の「異常な行動パターン（預り金長期抱え込み、現金比率の突出）」を定量化
   */
  DealerAuditManager.prototype.getSalesRepForensicScorecard = function() {
    var deals = this.contractManager ? this.contractManager.getAllDeals() : [];
    var expenses = this.expenseManager ? this.expenseManager.getAllRecords() : [];

    var repMap = {};

    // 契約集計
    for (var i = 0; i < deals.length; i++) {
      var d = deals[i];
      var rep = d.salesRep || '未設定';
      if (!repMap[rep]) {
        repMap[rep] = {
          name: rep,
          dealCount: 0,
          totalSales: 0,
          totalProfit: 0,
          cashPaymentCount: 0,
          wirePaymentCount: 0,
          holdingDaysSum: 0,
          stagnantDepositBalance: 0,
          anomalyAlerts: 0
        };
      }
      var stats = repMap[rep];
      stats.dealCount++;
      stats.totalSales += (d.totalSales || 0);
      stats.totalProfit += (d.grossProfit || 0);

      if (d.downPaymentMethod === 'cash') {
        stats.cashPaymentCount++;
      } else {
        stats.wirePaymentCount++;
      }

      if (d.illegalDelivery) {
        stats.anomalyAlerts++;
      }
    }

    // 諸費用預り金・滞留日数集計
    var now = new Date();
    for (var j = 0; j < expenses.length; j++) {
      var exp = expenses[j];
      var repName = exp.salesRep || '未設定';
      if (!repMap[repName]) {
        repMap[repName] = {
          name: repName,
          dealCount: 0,
          totalSales: 0,
          totalProfit: 0,
          cashPaymentCount: 0,
          wirePaymentCount: 0,
          holdingDaysSum: 0,
          stagnantDepositBalance: 0,
          anomalyAlerts: 0
        };
      }
      var rStats = repMap[repName];
      var balance = this.expenseManager.getRemainingDepositBalance(exp);
      rStats.stagnantDepositBalance += balance;

      var depDate = new Date(exp.depositDate);
      var days = Math.floor((now - depDate) / (1000 * 60 * 60 * 24));
      if (days < 0) days = 0;
      rStats.holdingDaysSum += days;

      if (balance > 0 && days >= 14) {
        rStats.anomalyAlerts += 2; // 14日以上の預り金保有は警戒加点
      }
    }

    // 指標とリスク判定の算出
    var list = [];
    var keys = Object.keys(repMap);
    for (var k = 0; k < keys.length; k++) {
      var item = repMap[keys[k]];
      var totalPayments = item.cashPaymentCount + item.wirePaymentCount;
      var cashRatio = totalPayments > 0 ? (item.cashPaymentCount / totalPayments) * 100 : 0;
      var avgHoldingDays = item.dealCount > 0 ? Math.round(item.holdingDaysSum / item.dealCount) : 0;
      var avgMarginRate = item.totalSales > 0 ? ((item.totalProfit / item.totalSales) * 100) : 0;

      // リスクスコア判定
      var riskLevel = 'NORMAL';
      var riskScore = 0;

      if (cashRatio >= 50) riskScore += 30; // 現金比率が異常に高い
      if (avgHoldingDays >= 14) riskScore += 40; // 預り金を2週間以上抱えている
      if (item.stagnantDepositBalance > 1000000) riskScore += 40; // 百万円以上の預り金を保持
      if (item.anomalyAlerts > 0) riskScore += (item.anomalyAlerts * 20);

      if (riskScore >= 70) {
        riskLevel = 'CRITICAL'; // 横領・自転車操業の蓋然性極大
      } else if (riskScore >= 35) {
        riskLevel = 'ELEVATED'; // 要警戒
      }

      list.push({
        name: item.name,
        dealCount: item.dealCount,
        totalSales: item.totalSales,
        totalProfit: item.totalProfit,
        avgMarginRate: Math.round(avgMarginRate * 10) / 10,
        cashRatio: Math.round(cashRatio),
        avgHoldingDays: avgHoldingDays,
        stagnantDepositBalance: item.stagnantDepositBalance,
        riskScore: riskScore,
        riskLevel: riskLevel
      });
    }

    // リスクスコア降順ソート（危険人物を最上位に配置）
    list.sort(function(a, b) {
      return b.riskScore - a.riskScore;
    });

    return list;
  };

  /**
   * 月次横断KPI集計
   */
  DealerAuditManager.prototype.getMonthlySummary = function(targetYearMonth) {
    var deals = this.contractManager ? this.contractManager.getAllDeals() : [];
    var expenses = this.expenseManager ? this.expenseManager.getAllRecords() : [];
    var loans = this.loanManager ? this.loanManager.getAllLoans() : [];

    var filteredDeals = [];
    for (var i = 0; i < deals.length; i++) {
      var d = deals[i];
      if (!targetYearMonth || (d.contractDate && d.contractDate.indexOf(targetYearMonth) === 0)) {
        filteredDeals.push(d);
      }
    }

    var totalDeals = filteredDeals.length;
    var totalSales = 0;
    var totalCost = 0;
    var totalGrossProfit = 0;
    var totalLoanKickback = 0;

    for (var j = 0; j < filteredDeals.length; j++) {
      var deal = filteredDeals[j];
      totalSales += (deal.totalSales || 0);
      totalCost += (deal.totalCost || 0);
      totalGrossProfit += (deal.grossProfit || 0);
      totalLoanKickback += (deal.loanKickback || 0);
    }

    var avgMarginRate = totalSales > 0 ? ((totalGrossProfit / totalSales) * 100) : 0;

    // 諸費用預り金残高総計
    var totalStagnantDeposit = 0;
    for (var e = 0; e < expenses.length; e++) {
      totalStagnantDeposit += this.expenseManager.getRemainingDepositBalance(expenses[e]);
    }

    // 未着金ローン債権総額
    var totalPendingLoans = 0;
    for (var l = 0; l < loans.length; l++) {
      if (loans[l].status === 'pending') {
        totalPendingLoans += (loans[l].contractPrincipal || 0);
      }
    }

    var tripwires = this.scanAllTripwires();
    var criticalAlertsCount = 0;
    for (var t = 0; t < tripwires.length; t++) {
      if (tripwires[t].level === 'CRITICAL') {
        criticalAlertsCount++;
      }
    }

    return {
      targetYearMonth: targetYearMonth || '全期間',
      totalDeals: totalDeals,
      totalSales: totalSales,
      totalCost: totalCost,
      totalGrossProfit: totalGrossProfit,
      totalLoanKickback: totalLoanKickback,
      avgMarginRate: Math.round(avgMarginRate * 10) / 10,
      totalStagnantDeposit: totalStagnantDeposit,
      totalPendingLoans: totalPendingLoans,
      tripwireAlertCount: tripwires.length,
      criticalAlertsCount: criticalAlertsCount,
      deals: filteredDeals
    };
  };

  global.DealerAuditManager = DealerAuditManager;

})(typeof window !== 'undefined' ? window : this);
