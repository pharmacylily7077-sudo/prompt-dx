/**
 * 外車・高級車販売 資金統制・不正根絶システム
 * オートローン・信販会社入金消込・立替金追跡マネージャー (DealerLoanManager)
 * 
 * 統制機能:
 * 1. 信販会社着金消込（契約元金 ＋ キックバック ＝ 実着金額 ＋ 事務手数料）
 * 2. 未特定差額ゼロ原則（1円の入金ズレ・使途不明金を許さない完全消込）
 * 3. 他社残債立替・頭金立替金の回収追跡（焦げ付き・私的立替の根絶）
 * 4. 納車後30日以上未着金の信販債権遅延検知（着金遅延トリップワイヤー）
 */

(function(global) {
  'use strict';

  var STORAGE_KEY_LOANS = 'car_dealer_loans_v1';
  var STORAGE_KEY_ADVANCES = 'car_dealer_advances_v1';

  function DealerLoanManager(storage) {
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.loans = this._loadLoans();
    this.advances = this._loadAdvances();
  }

  DealerLoanManager.prototype._loadLoans = function() {
    if (!this.storage) return [];
    var data = this.storage.getItem(STORAGE_KEY_LOANS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  DealerLoanManager.prototype._saveLoans = function() {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY_LOANS, JSON.stringify(this.loans));
  };

  DealerLoanManager.prototype._loadAdvances = function() {
    if (!this.storage) return [];
    var data = this.storage.getItem(STORAGE_KEY_ADVANCES);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  DealerLoanManager.prototype._saveAdvances = function() {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY_ADVANCES, JSON.stringify(this.advances));
  };

  DealerLoanManager.prototype.getAllLoans = function() {
    return this.loans.slice();
  };

  DealerLoanManager.prototype.getLoanById = function(id) {
    for (var i = 0; i < this.loans.length; i++) {
      if (this.loans[i].id === id) return this.loans[i];
    }
    return null;
  };

  DealerLoanManager.prototype.getLoanByContractId = function(contractId) {
    for (var i = 0; i < this.loans.length; i++) {
      if (this.loans[i].contractId === contractId) return this.loans[i];
    }
    return null;
  };

  /**
   * ローン入金消込の計算・突合検証
   * あるべき着金額 = 契約元金 + キックバック手数料 - 事務取扱手数料
   */
  DealerLoanManager.prototype.calculateSettlement = function(params) {
    var contractPrincipal = Number(params.contractPrincipal) || 0;
    var kickbackAmount = Number(params.kickbackAmount) || 0;
    var handlingFee = Number(params.handlingFee) || 0;
    var actualReceivedAmount = Number(params.actualReceivedAmount) || 0;

    var expectedPayout = contractPrincipal + kickbackAmount - handlingFee;
    var difference = actualReceivedAmount - expectedPayout;

    return {
      contractPrincipal: contractPrincipal,
      kickbackAmount: kickbackAmount,
      handlingFee: handlingFee,
      expectedPayout: expectedPayout,
      actualReceivedAmount: actualReceivedAmount,
      difference: difference,
      isMatched: (difference === 0 && actualReceivedAmount > 0)
    };
  };

  /**
   * ローン案件レコードの作成
   */
  DealerLoanManager.prototype.createLoan = function(data) {
    if (!data.contractId) throw new Error('契約管理番号は必須です');
    if (!data.loanCompany) throw new Error('信販会社名は必須です');

    var existing = this.getLoanByContractId(data.contractId);
    if (existing) throw new Error('すでに同一契約のローンレコードが存在します: ' + data.contractId);

    var contractPrincipal = Number(data.contractPrincipal) || 0;
    if (contractPrincipal <= 0) {
      throw new Error('ローン元金は正の数値である必要があります');
    }

    var loan = {
      id: 'LN-' + data.contractId,
      contractId: data.contractId,
      vin: (data.vin || '').toUpperCase().trim(),
      salesRep: (data.salesRep || '').trim(),
      loanCompany: data.loanCompany.trim(), // オリコ, ジャックス, アプラス, セディナ, 残価設定等
      loanApprovalNo: (data.loanApprovalNo || '').trim(),
      contractPrincipal: contractPrincipal,
      contractDate: data.contractDate || new Date().toISOString().slice(0, 10),
      expectedSettlementDate: data.expectedSettlementDate || '',
      actualSettlementDate: '',
      actualReceivedAmount: 0,
      kickbackAmount: Number(data.kickbackAmount) || 0,
      handlingFee: Number(data.handlingFee) || 0,
      difference: 0,
      status: 'pending', // pending, reconciled
      bankTransferRef: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.loans.unshift(loan);
    this._saveLoans();
    return loan;
  };

  /**
   * 信販会社着金の消込実行
   */
  DealerLoanManager.prototype.reconcileLoan = function(loanId, actualReceivedAmount, kickbackAmount, handlingFee, settlementDate, bankTransferRef) {
    var loan = this.getLoanById(loanId);
    if (!loan) throw new Error('ローンレコードが見つかりません');

    var calc = this.calculateSettlement({
      contractPrincipal: loan.contractPrincipal,
      kickbackAmount: kickbackAmount !== undefined ? kickbackAmount : loan.kickbackAmount,
      handlingFee: handlingFee !== undefined ? handlingFee : loan.handlingFee,
      actualReceivedAmount: actualReceivedAmount
    });

    if (!calc.isMatched) {
      throw new Error('ローン消込エラー: 振込通知書金額と着金額に ' + calc.difference + '円 の不整合があります（未特定差額ゼロ原則）');
    }

    loan.actualReceivedAmount = Number(actualReceivedAmount);
    loan.kickbackAmount = Number(calc.kickbackAmount);
    loan.handlingFee = Number(calc.handlingFee);
    loan.difference = 0;
    loan.actualSettlementDate = settlementDate || new Date().toISOString().slice(0, 10);
    loan.bankTransferRef = (bankTransferRef || '').trim();
    loan.status = 'reconciled';
    loan.updatedAt = new Date().toISOString();

    this._saveLoans();
    return loan;
  };

  // ==========================================
  // 立替金（残債一括返済・頭金立替）管理
  // ==========================================

  DealerLoanManager.prototype.getAllAdvances = function() {
    return this.advances.slice();
  };

  DealerLoanManager.prototype.addAdvance = function(data) {
    if (!data.contractId) throw new Error('契約管理番号は必須です');
    var amount = Number(data.amount) || 0;
    if (amount <= 0) throw new Error('立替金額は正の数値を入力してください');

    var advance = {
      id: 'ADV-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
      contractId: data.contractId,
      vin: (data.vin || '').toUpperCase().trim(),
      salesRep: (data.salesRep || '').trim(),
      type: data.type || 'tradein_residual_debt', // tradein_residual_debt(下取残債), down_payment_advance(頭金立替), other
      amount: amount,
      payee: (data.payee || '').trim(), // 立替先（他社信販、ローン会社等）
      paymentDate: data.paymentDate || new Date().toISOString().slice(0, 10),
      voucherRef: (data.voucherRef || '').trim(),
      recoveredAmount: 0,
      recoveredDate: '',
      recoveryRef: '',
      status: 'pending', // pending, recovered
      memo: data.memo || '',
      createdAt: new Date().toISOString()
    };

    this.advances.unshift(advance);
    this._saveAdvances();
    return advance;
  };

  DealerLoanManager.prototype.recoverAdvance = function(advanceId, recoveredAmount, recoveryDate, recoveryRef) {
    var advance = null;
    for (var i = 0; i < this.advances.length; i++) {
      if (this.advances[i].id === advanceId) {
        advance = this.advances[i];
        break;
      }
    }
    if (!advance) throw new Error('立替金レコードが見つかりません');

    var recAmount = Number(recoveredAmount) || 0;
    if (recAmount !== advance.amount) {
      throw new Error('回収金額不一致: 立替金 ' + advance.amount + '円 と回収額 ' + recAmount + '円 が一致しません');
    }

    advance.recoveredAmount = recAmount;
    advance.recoveredDate = recoveryDate || new Date().toISOString().slice(0, 10);
    advance.recoveryRef = (recoveryRef || '').trim();
    advance.status = 'recovered';

    this._saveAdvances();
    return advance;
  };

  /**
   * 信販着金遅延（30日超）トリップワイヤーの監査
   */
  DealerLoanManager.prototype.detectOverdueLoans = function(contractManager) {
    var alerts = [];
    var now = new Date();

    for (var i = 0; i < this.loans.length; i++) {
      var loan = this.loans[i];
      if (loan.status === 'pending') {
        var contractDate = new Date(loan.contractDate);
        var elapsedDays = Math.floor((now - contractDate) / (1000 * 60 * 60 * 24));

        var isDelivered = false;
        if (contractManager) {
          var deal = contractManager.getDealById(loan.contractId);
          if (deal && (deal.status === 'delivered' || deal.status === 'settled')) {
            isDelivered = true;
          }
        }

        if (elapsedDays >= 30 || isDelivered) {
          alerts.push({
            level: isDelivered ? 'CRITICAL' : 'WARNING',
            type: 'OVERDUE_LOAN_SETTLEMENT',
            contractId: loan.contractId,
            vin: loan.vin,
            salesRep: loan.salesRep,
            loanCompany: loan.loanCompany,
            contractPrincipal: loan.contractPrincipal,
            elapsedDays: elapsedDays,
            isDelivered: isDelivered,
            message: (isDelivered ? '【🚨未着金納車・債権未回収】' : '【⚠️信販着金長期遅延】') + 
                     loan.loanCompany + 'のローン元金 ' + loan.contractPrincipal + '円 が契約後 ' + 
                     elapsedDays + '日経過しても未着金です。'
          });
        }
      }
    }
    return alerts;
  };

  DealerLoanManager.prototype.clearAll = function() {
    this.loans = [];
    this.advances = [];
    if (this.storage) {
      this.storage.removeItem(STORAGE_KEY_LOANS);
      this.storage.removeItem(STORAGE_KEY_ADVANCES);
    }
  };

  global.DealerLoanManager = DealerLoanManager;

})(typeof window !== 'undefined' ? window : this);
