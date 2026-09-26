/**
 * 外車・高級車販売 資金統制・不正根絶システム
 * 車両成約・個別原価計算・USS相場突合マネージャー (DealerContractManager)
 * 
 * 統制機能:
 * 1. 車両1台ごとの完全個別原価計算（仕入＋加修整備＋陸送）
 * 2. 成約代金三方突合（契約総額 ＝ 頭金 ＋ ローン元金 ＋ 下取相殺）
 * 3. 下取車 USSオークション基準相場突合（15%以上の過小査定・闇転売ブロック）
 * 4. 納車物理ゲート・違法出庫検知（預り金・ローン未完了時の出庫阻止）
 */

(function(global) {
  'use strict';

  var STORAGE_KEY = 'car_dealer_contracts_v1';

  function DealerContractManager(storage) {
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.deals = this._load();
  }

  DealerContractManager.prototype._load = function() {
    if (!this.storage) return [];
    var data = this.storage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  DealerContractManager.prototype._save = function() {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.deals));
  };

  DealerContractManager.prototype.getAllDeals = function() {
    return this.deals.slice();
  };

  DealerContractManager.prototype.getDealById = function(id) {
    for (var i = 0; i < this.deals.length; i++) {
      if (this.deals[i].id === id) {
        return this.deals[i];
      }
    }
    return null;
  };

  DealerContractManager.prototype.getDealByVin = function(vin) {
    for (var i = 0; i < this.deals.length; i++) {
      if (this.deals[i].vin === vin) {
        return this.deals[i];
      }
    }
    return null;
  };

  /**
   * 個別原価・売上・確定粗利の計算
   */
  DealerContractManager.prototype.calculateProfit = function(deal) {
    var vehiclePrice = Number(deal.vehiclePrice) || 0;
    var optionPrice = Number(deal.optionPrice) || 0;
    var expenseMargin = Number(deal.expenseMargin) || 0;
    var loanKickback = Number(deal.loanKickback) || 0;

    var totalSales = vehiclePrice + optionPrice + expenseMargin + loanKickback;

    var purchaseCost = Number(deal.purchaseCost) || 0;
    var repairCost = Number(deal.repairCost) || 0;
    var transportCost = Number(deal.transportCost) || 0;

    var totalCost = purchaseCost + repairCost + transportCost;
    var grossProfit = totalSales - totalCost;
    var marginRate = totalSales > 0 ? ((grossProfit / totalSales) * 100) : 0;

    return {
      totalSales: totalSales,
      totalCost: totalCost,
      grossProfit: grossProfit,
      marginRate: Math.round(marginRate * 10) / 10
    };
  };

  /**
   * 成約代金の三方突合検証
   * 契約総額 ＝ 頭金 ＋ ローン元金 ＋ 下取相殺額
   */
  DealerContractManager.prototype.verifyContractSettlement = function(deal) {
    var downPayment = Number(deal.downPayment) || 0;
    var loanPrincipal = Number(deal.loanPrincipal) || 0;
    var tradeInAllowance = Number(deal.tradeInAllowance) || 0;

    var totalPayment = downPayment + loanPrincipal + tradeInAllowance;
    var contractTotal = Number(deal.contractTotal) || 0;

    var diff = contractTotal - totalPayment;
    return {
      isValid: diff === 0,
      contractTotal: contractTotal,
      totalPayment: totalPayment,
      difference: diff
    };
  };

  /**
   * 下取車 USSオークション基準相場突合（過小査定・中抜き検知）
   */
  DealerContractManager.prototype.verifyTradeInValuation = function(tradeIn) {
    if (!tradeIn || !tradeIn.hasTradeIn) {
      return { isApplicable: false, isUndervalued: false, deviationRate: 0 };
    }

    var ussBenchmark = Number(tradeIn.ussBenchmark) || 0;
    var appraisalValue = Number(tradeIn.appraisalValue) || 0;

    if (ussBenchmark <= 0) {
      return { isApplicable: true, isUndervalued: false, deviationRate: 0, reason: '相場データ未登録' };
    }

    // 乖離率 = (USS相場 - 査定額) / USS相場
    var diff = ussBenchmark - appraisalValue;
    var deviationRate = (diff / ussBenchmark) * 100;

    // 相場より15%以上低く買い取っている場合は「異常過小査定」として警戒
    var isUndervalued = deviationRate >= 15.0;

    return {
      isApplicable: true,
      ussBenchmark: ussBenchmark,
      appraisalValue: appraisalValue,
      deviationRate: Math.round(deviationRate * 10) / 10,
      diffAmount: diff,
      isUndervalued: isUndervalued,
      requiresOwnerApproval: isUndervalued && !tradeIn.ownerApproved
    };
  };

  /**
   * 新規成約レコードの追加
   */
  DealerContractManager.prototype.addDeal = function(data) {
    if (!data.vin || data.vin.length < 10) {
      throw new Error('有効な車台番号（VIN）を入力してください');
    }
    if (!data.salesRep) {
      throw new Error('担当営業を入力してください');
    }

    var settlementCheck = this.verifyContractSettlement(data);
    if (!settlementCheck.isValid) {
      throw new Error('成約代金三方突合エラー: 契約総額と決済合計（頭金+ローン+下取）に ' + 
        settlementCheck.difference + '円 の不整合があります');
    }

    var tradeInCheck = this.verifyTradeInValuation(data.tradeIn);
    if (tradeInCheck.requiresOwnerApproval) {
      throw new Error('下取車過小査定ロック: USS基準相場から ' + 
        tradeInCheck.deviationRate + '% 低い査定額です。オーナーの個別承認が必要です');
    }

    var profit = this.calculateProfit(data);

    var deal = {
      id: data.id || ('CT-' + new Date().getFullYear() + '-' + String(this.deals.length + 1).padStart(3, '0')),
      vin: data.vin.toUpperCase().trim(),
      model: data.model || '',
      year: Number(data.year) || new Date().getFullYear(),
      salesRep: data.salesRep.trim(),
      contractDate: data.contractDate || new Date().toISOString().slice(0, 10),
      deliveryDate: data.deliveryDate || '',
      status: data.status || 'contracted', // negotiating, contracted, prepped, delivered, settled

      // 金額
      contractTotal: Number(data.contractTotal) || 0,
      vehiclePrice: Number(data.vehiclePrice) || 0,
      optionPrice: Number(data.optionPrice) || 0,
      expenseMargin: Number(data.expenseMargin) || 0,
      loanKickback: Number(data.loanKickback) || 0,

      // 決済
      downPayment: Number(data.downPayment) || 0,
      downPaymentMethod: data.downPaymentMethod || 'wire', // wire, cash
      loanPrincipal: Number(data.loanPrincipal) || 0,
      tradeInAllowance: Number(data.tradeInAllowance) || 0,

      // 原価
      purchaseCost: Number(data.purchaseCost) || 0,
      purchaseInvoiceNo: data.purchaseInvoiceNo || '',
      repairCost: Number(data.repairCost) || 0,
      repairVendor: data.repairVendor || '',
      repairInvoiceNo: data.repairInvoiceNo || '',
      transportCost: Number(data.transportCost) || 0,
      transportInvoiceNo: data.transportInvoiceNo || '',

      // 下取
      tradeIn: data.tradeIn ? {
        hasTradeIn: !!data.tradeIn.hasTradeIn,
        vin: (data.tradeIn.vin || '').toUpperCase().trim(),
        model: data.tradeIn.model || '',
        year: Number(data.tradeIn.year) || 0,
        mileage: Number(data.tradeIn.mileage) || 0,
        ussBenchmark: Number(data.tradeIn.ussBenchmark) || 0,
        appraisalValue: Number(data.tradeIn.appraisalValue) || 0,
        remainingDebt: Number(data.tradeIn.remainingDebt) || 0,
        ownerApproved: !!data.tradeIn.ownerApproved
      } : { hasTradeIn: false },

      // 計算値
      totalSales: profit.totalSales,
      totalCost: profit.totalCost,
      grossProfit: profit.grossProfit,
      marginRate: profit.marginRate,

      // 統制フラグ
      illegalDelivery: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.deals.unshift(deal);
    this._save();
    return deal;
  };

  /**
   * 成約レコードの更新
   */
  DealerContractManager.prototype.updateDeal = function(id, data) {
    var index = -1;
    for (var i = 0; i < this.deals.length; i++) {
      if (this.deals[i].id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      throw new Error('該当する成約レコードが見つかりません: ' + id);
    }

    var merged = Object.assign({}, this.deals[index], data);

    var settlementCheck = this.verifyContractSettlement(merged);
    if (!settlementCheck.isValid) {
      throw new Error('成約代金三方突合エラー: 契約総額と決済合計に不整合があります');
    }

    var profit = this.calculateProfit(merged);
    merged.totalSales = profit.totalSales;
    merged.totalCost = profit.totalCost;
    merged.grossProfit = profit.grossProfit;
    merged.marginRate = profit.marginRate;
    merged.updatedAt = new Date().toISOString();

    this.deals[index] = merged;
    this._save();
    return merged;
  };

  /**
   * 納車出庫ステータス変更時の物理ゲート審査
   * 諸費用マネージャーおよびローンマネージャーの状態を監査
   */
  DealerContractManager.prototype.attemptDelivery = function(id, expenseManager, loanManager) {
    var deal = this.getDealById(id);
    if (!deal) throw new Error('レコードが見つかりません');

    var blockers = [];

    // 1. 諸費用預り金残高ゼロ監査
    if (expenseManager) {
      var expenseRecord = expenseManager.getRecordByContractId(id);
      if (expenseRecord) {
        var balance = expenseManager.getRemainingDepositBalance(expenseRecord);
        if (balance !== 0) {
          blockers.push('諸費用預り金残高が ' + balance + '円 滞留しています（0円精算必須）');
        }
        if (!expenseRecord.allReceiptsAttached) {
          blockers.push('法定費用納税レシート・公的領収証書番号の登録が未完了です');
        }
      }
    }

    // 2. ローン決済監査（ローンがある場合）
    if (deal.loanPrincipal > 0 && loanManager) {
      var loanRecord = loanManager.getLoanByContractId(id);
      if (!loanRecord || loanRecord.status !== 'reconciled') {
        blockers.push('オートローンの信販会社着金消込が完了していません');
      }
    }

    // 3. 下取車の過小査定未承認チェック
    if (deal.tradeIn && deal.tradeIn.hasTradeIn) {
      var tradeCheck = this.verifyTradeInValuation(deal.tradeIn);
      if (tradeCheck.requiresOwnerApproval) {
        blockers.push('下取車がUSS基準相場から15%以上低く査定されており、オーナー承認が未取得です');
      }
    }

    if (blockers.length > 0) {
      // 出庫ロック発動
      deal.illegalDelivery = true;
      this._save();
      return {
        success: false,
        isBlocked: true,
        blockers: blockers
      };
    }

    // 合格: 納車完了へ
    deal.status = 'delivered';
    deal.illegalDelivery = false;
    deal.actualDeliveryDate = new Date().toISOString().slice(0, 10);
    this._save();

    return {
      success: true,
      isBlocked: false,
      blockers: []
    };
  };

  DealerContractManager.prototype.clearAll = function() {
    this.deals = [];
    if (this.storage) {
      this.storage.removeItem(STORAGE_KEY);
    }
  };

  global.DealerContractManager = DealerContractManager;

})(typeof window !== 'undefined' ? window : this);
