/**
 * 外車・高級車販売 資金統制・不正根絶システム
 * 諸費用出納・預り金管理・法定税額自動逆算マネージャー (DealerExpenseManager)
 * 
 * 統制機能:
 * 1. 法定税額自動逆算マスタ（排気量・重量・登録月等から1円単位で税額を確定、改ざん封殺）
 * 2. 諸費用預り金の三方照合（受託額 ＝ 法定納付実費 ＋ 店舗代行売上 ＋ 顧客返還金）
 * 3. 領収証書・納付レシート番号の全件必須紐付け
 * 4. 納車後滞留預り金の即時検知（納車済かつ残高>0は横領・自転車操業トリップワイヤー）
 */

(function(global) {
  'use strict';

  var STORAGE_KEY = 'car_dealer_expenses_v1';

  function DealerExpenseManager(storage) {
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.records = this._load();
  }

  DealerExpenseManager.prototype._load = function() {
    if (!this.storage) return [];
    var data = this.storage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  DealerExpenseManager.prototype._save = function() {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.records));
  };

  /**
   * 法定税額自動逆算マスタ
   * 営業マンが適当な数字を言っても、法律・公的基準により1円単位で自動計算
   */
  DealerExpenseManager.prototype.calculateStatutoryTaxes = function(params) {
    var displacement = Number(params.displacement) || 2000; // 排気量 (cc)
    var curbWeight = Number(params.curbWeight) || 1500;       // 車両重量 (kg)
    var regMonth = Number(params.registrationMonth) || 4;    // 登録月 (1〜12)
    var termMonths = Number(params.inspectionTermMonths) || 36; // 36ヶ月(新車) or 24ヶ月(中古車検)
    var vehiclePrice = Number(params.vehiclePrice) || 10000000;

    // 1. 自動車税（種別割） 2019年10月以降の新税率（年額）
    var annualAutoTax = 25000;
    if (displacement <= 1000) annualAutoTax = 25000;
    else if (displacement <= 1500) annualAutoTax = 30500;
    else if (displacement <= 2000) annualAutoTax = 36000;
    else if (displacement <= 2500) annualAutoTax = 43500;
    else if (displacement <= 3000) annualAutoTax = 50000;
    else if (displacement <= 3500) annualAutoTax = 57000;
    else if (displacement <= 4000) annualAutoTax = 65500;
    else if (displacement <= 4500) annualAutoTax = 75500;
    else if (displacement <= 6000) annualAutoTax = 87000;
    else annualAutoTax = 110000; // 6,000cc超（ロールスロイス等）

    // 月割計算: 登録月の翌月から翌年3月（地方税法上の年度末）までの月数
    var remainingMonths = 0;
    if (regMonth >= 4 && regMonth <= 12) {
      remainingMonths = 15 - regMonth; // 4月登録: 11ヶ月, 9月登録: 6ヶ月, 12月登録: 3ヶ月
    } else if (regMonth >= 1 && regMonth <= 3) {
      remainingMonths = 3 - regMonth;  // 1月登録: 2ヶ月, 2月登録: 1ヶ月, 3月登録: 0ヶ月
    }
    var autoTax = Math.floor(annualAutoTax * remainingMonths / 12);

    // 2. 自動車重量税（自家用乗用車 0.5トンごと）
    // 本則税率: 0.5トンあたり年4,100円
    var weightTons = Math.ceil(curbWeight / 500) * 0.5;
    var weightTaxPerHalfTonAnnual = 4100;
    var weightTaxYears = termMonths >= 36 ? 3 : 2;
    var weightTax = (weightTons / 0.5) * weightTaxPerHalfTonAnnual * weightTaxYears;

    // 3. 環境性能割（旧自動車取得税: 高級輸入車は概ね3%）
    // 課税標準額（本体価格の概ね約0.9×残価率）の3%
    var taxableBase = Math.floor(vehiclePrice * 0.85);
    var environmentalTax = Math.floor(taxableBase * 0.03);

    // 4. 自賠責保険料（強制保険）
    // 自家用乗用車: 36ヶ月 23,690円 / 24ヶ月 17,650円 / 25ヶ月 18,160円
    var compulsoryInsurance = 17650;
    if (termMonths >= 36) compulsoryInsurance = 23690;
    else if (termMonths === 25) compulsoryInsurance = 18160;

    // 5. 公的印紙・登録手数料・ナンバー代・車庫証明証紙
    var stampFee = 2800;          // 登録印紙・OSS手数料
    var licensePlateFee = 4500;   // 希望ナンバー・封印代
    var garageCertificateFee = 2700; // 警察署車庫証明証紙代

    var statutoryTotal = autoTax + weightTax + environmentalTax + 
                         compulsoryInsurance + stampFee + licensePlateFee + garageCertificateFee;

    return {
      autoTax: autoTax,
      annualAutoTax: annualAutoTax,
      remainingMonths: remainingMonths,
      weightTax: weightTax,
      weightTons: weightTons,
      environmentalTax: environmentalTax,
      compulsoryInsurance: compulsoryInsurance,
      stampFee: stampFee,
      licensePlateFee: licensePlateFee,
      garageCertificateFee: garageCertificateFee,
      statutoryTotal: statutoryTotal
    };
  };

  DealerExpenseManager.prototype.getAllRecords = function() {
    return this.records.slice();
  };

  DealerExpenseManager.prototype.getRecordById = function(id) {
    for (var i = 0; i < this.records.length; i++) {
      if (this.records[i].id === id) {
        return this.records[i];
      }
    }
    return null;
  };

  DealerExpenseManager.prototype.getRecordByContractId = function(contractId) {
    for (var i = 0; i < this.records.length; i++) {
      if (this.records[i].contractId === contractId) {
        return this.records[i];
      }
    }
    return null;
  };

  /**
   * 預り金残高の計算
   * 手元残高 = 顧客預り金受領額 - (法定実費支払計 + 店舗代行手数料売上 + 顧客返還額)
   */
  DealerExpenseManager.prototype.getRemainingDepositBalance = function(record) {
    var depositReceived = Number(record.depositReceived) || 0;
    var actualPaidTotal = 0;

    if (record.items && Array.isArray(record.items)) {
      for (var i = 0; i < record.items.length; i++) {
        actualPaidTotal += Number(record.items[i].paidAmount) || 0;
      }
    }

    var dealerFeeRevenue = Number(record.dealerFeeRevenue) || 0;
    var customerRefund = Number(record.customerRefund) || 0;

    return depositReceived - (actualPaidTotal + dealerFeeRevenue + customerRefund);
  };

  /**
   * 三方照合ステータスの検証
   */
  DealerExpenseManager.prototype.verifyThreeWayMatch = function(record) {
    var balance = this.getRemainingDepositBalance(record);
    var depositReceived = Number(record.depositReceived) || 0;

    var actualPaidTotal = 0;
    var missingReceiptCount = 0;

    if (record.items && Array.isArray(record.items)) {
      for (var i = 0; i < record.items.length; i++) {
        var item = record.items[i];
        actualPaidTotal += Number(item.paidAmount) || 0;
        // 実費支払があるのに領収書番号がない場合は不備
        if (Number(item.paidAmount) > 0 && (!item.receiptNo || item.receiptNo.trim() === '')) {
          missingReceiptCount++;
        }
      }
    }

    var dealerFeeRevenue = Number(record.dealerFeeRevenue) || 0;
    var customerRefund = Number(record.customerRefund) || 0;

    var isBalanced = (balance === 0);
    var allReceiptsAttached = (missingReceiptCount === 0);

    return {
      depositReceived: depositReceived,
      actualPaidTotal: actualPaidTotal,
      dealerFeeRevenue: dealerFeeRevenue,
      customerRefund: customerRefund,
      balance: balance,
      isBalanced: isBalanced,
      missingReceiptCount: missingReceiptCount,
      allReceiptsAttached: allReceiptsAttached,
      isFullyReconciled: isBalanced && allReceiptsAttached
    };
  };

  /**
   * 諸費用管理レコードの新規作成
   */
  DealerExpenseManager.prototype.createRecord = function(data) {
    if (!data.contractId) throw new Error('契約管理番号は必須です');
    if (!data.vin) throw new Error('車台番号（VIN）は必須です');

    var existing = this.getRecordByContractId(data.contractId);
    if (existing) throw new Error('すでに同一契約の諸費用レコードが存在します: ' + data.contractId);

    var depositReceived = Number(data.depositReceived) || 0;
    var defaultItems = [
      { name: '自動車税（種別割）', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' },
      { name: '自動車重量税', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' },
      { name: '環境性能割', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' },
      { name: '自賠責保険料', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' },
      { name: 'ナンバープレート代', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' },
      { name: '車庫証明証紙代', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' },
      { name: '登録印紙・OSS代', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' },
      { name: '登録陸送実費', estimatedAmount: 0, paidAmount: 0, receiptNo: '', status: 'unpaid' }
    ];

    var record = {
      id: 'EXP-' + data.contractId,
      contractId: data.contractId,
      vin: data.vin.toUpperCase().trim(),
      salesRep: (data.salesRep || '').trim(),
      depositReceived: depositReceived,
      depositDate: data.depositDate || new Date().toISOString().slice(0, 10),
      depositMethod: data.depositMethod || 'wire', // wire, cash
      cashVaultLocation: data.cashVaultLocation || '本社中央金庫',
      items: data.items || defaultItems,
      dealerFeeRevenue: Number(data.dealerFeeRevenue) || 0,
      customerRefund: Number(data.customerRefund) || 0,
      refundWireTransferRef: data.refundWireTransferRef || '',
      refundDate: data.refundDate || '',
      customerNoticeSent: !!data.customerNoticeSent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    var match = this.verifyThreeWayMatch(record);
    record.balance = match.balance;
    record.isBalanced = match.isBalanced;
    record.allReceiptsAttached = match.allReceiptsAttached;
    record.reconciled = match.isFullyReconciled;

    this.records.unshift(record);
    this._save();
    return record;
  };

  /**
   * 諸費用項目の支払と領収書登録
   */
  DealerExpenseManager.prototype.recordPaymentItem = function(recordId, itemIndex, paidAmount, receiptNo, receiptDate) {
    var record = this.getRecordById(recordId);
    if (!record) throw new Error('レコードが見つかりません');
    if (!record.items[itemIndex]) throw new Error('対象項目が見つかりません');

    record.items[itemIndex].paidAmount = Number(paidAmount) || 0;
    record.items[itemIndex].receiptNo = (receiptNo || '').trim();
    record.items[itemIndex].receiptDate = receiptDate || new Date().toISOString().slice(0, 10);
    record.items[itemIndex].status = Number(paidAmount) > 0 ? 'paid' : 'unpaid';

    var match = this.verifyThreeWayMatch(record);
    record.balance = match.balance;
    record.isBalanced = match.isBalanced;
    record.allReceiptsAttached = match.allReceiptsAttached;
    record.reconciled = match.isFullyReconciled;
    record.updatedAt = new Date().toISOString();

    this._save();
    return record;
  };

  /**
   * 余剰預り金の精算（店舗代行売上計上 or 顧客返還）
   */
  DealerExpenseManager.prototype.finalizeSettlement = function(recordId, dealerFeeRevenue, customerRefund, refundRef) {
    var record = this.getRecordById(recordId);
    if (!record) throw new Error('レコードが見つかりません');

    record.dealerFeeRevenue = Number(dealerFeeRevenue) || 0;
    record.customerRefund = Number(customerRefund) || 0;
    record.refundWireTransferRef = (refundRef || '').trim();
    if (record.customerRefund > 0 && !record.refundDate) {
      record.refundDate = new Date().toISOString().slice(0, 10);
    }

    var match = this.verifyThreeWayMatch(record);
    record.balance = match.balance;
    record.isBalanced = match.isBalanced;
    record.allReceiptsAttached = match.allReceiptsAttached;
    record.reconciled = match.isFullyReconciled;
    record.updatedAt = new Date().toISOString();

    this._save();
    return record;
  };

  /**
   * 顧客直結バイパス受領通知の発行生成
   * 営業マンを介さず、会社・オーナー公式名義で受領明細を発行
   */
  DealerExpenseManager.prototype.generateCustomerNotice = function(recordId, contractDeal) {
    var record = this.getRecordById(recordId);
    if (!record) throw new Error('レコードが見つかりません');

    var paidTotal = 0;
    var taxBreakdown = [];
    for (var i = 0; i < record.items.length; i++) {
      var item = record.items[i];
      if (item.paidAmount > 0) {
        paidTotal += item.paidAmount;
        taxBreakdown.push({
          name: item.name,
          amount: item.paidAmount,
          receiptNo: item.receiptNo || '納付手続き中'
        });
      }
    }

    var notice = {
      noticeId: 'NTC-' + record.contractId,
      issueDate: new Date().toISOString().slice(0, 10),
      contractId: record.contractId,
      vin: record.vin,
      model: contractDeal ? contractDeal.model : '',
      depositReceived: record.depositReceived,
      paidTotal: paidTotal,
      taxBreakdown: taxBreakdown,
      dealerFeeRevenue: record.dealerFeeRevenue,
      customerRefund: record.customerRefund,
      refundWireTransferRef: record.refundWireTransferRef,
      balance: record.balance,
      companyOfficialHeader: '高級車販売事業統制本部・オーナー事務局 公式受領証明',
      inquiryContact: '統制本部直通監査窓口: audit-control@group-executive.internal'
    };

    record.customerNoticeSent = true;
    record.updatedAt = new Date().toISOString();
    this._save();

    return notice;
  };

  /**
   * 納車後滞留預り金トリップワイヤーの監査
   * 納車完了しているのに残高 > 0 の案件を検出
   */
  DealerExpenseManager.prototype.detectStagnantDeposits = function(contractManager) {
    var alerts = [];
    for (var i = 0; i < this.records.length; i++) {
      var record = this.records[i];
      var balance = this.getRemainingDepositBalance(record);

      if (contractManager) {
        var deal = contractManager.getDealById(record.contractId);
        if (deal && (deal.status === 'delivered' || deal.status === 'settled')) {
          if (balance !== 0) {
            alerts.push({
              level: 'CRITICAL',
              type: 'STAGNANT_DEPOSIT_AFTER_DELIVERY',
              contractId: record.contractId,
              vin: record.vin,
              salesRep: record.salesRep,
              stagnantAmount: balance,
              depositReceived: record.depositReceived,
              depositDate: record.depositDate,
              deliveryDate: deal.deliveryDate || deal.actualDeliveryDate,
              message: '【🚨横領・自転車操業トリップワイヤー】納車完了済（' + (deal.deliveryDate || '納車済') + 
                       '）であるにもかかわらず、諸費用預り金残高 ' + balance + '円 が手元に滞留しています。'
            });
          }
        }
      }
    }
    return alerts;
  };

  DealerExpenseManager.prototype.clearAll = function() {
    this.records = [];
    if (this.storage) {
      this.storage.removeItem(STORAGE_KEY);
    }
  };

  global.DealerExpenseManager = DealerExpenseManager;

})(typeof window !== 'undefined' ? window : this);
