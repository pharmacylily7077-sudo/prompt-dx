/**
 * ==============================================================================
 * 外車・高級車販売 資金統制・不正根絶システム
 * 過去不正フォレンジック分析エンジン (dealer-forensic.js)
 * 
 * 目的:
 * 「未来の不正を防ぐ盾」だけでなく、「過去の帳簿・銀行通帳を遡って不正を暴く刀」を提供する。
 * 
 * 4大フォレンジック機能:
 * 1. 過去データ一括インポート（主要銀行CSV・成約台帳CSV・Excelコピペ）
 * 2. 5大異常検知アルゴリズム（通帳突合、諸費用滞留、USS買叩き、外注癒着、現金比率）
 * 3. フォレンジック・ダッシュボード（ヒートマップ、時系列タイムライン、突合照合台帳）
 * 4. 証拠保全A4公式監査報告書（民事訴訟・警察相談・税務修正申告用）
 * ==============================================================================
 */

(function(global) {
  'use strict';

  var STORAGE_KEY_FORENSIC_DEALS = 'car_dealer_forensic_deals_v1';
  var STORAGE_KEY_FORENSIC_BANK = 'car_dealer_forensic_bank_v1';

  function DealerForensicManager(storage) {
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.deals = this._load(STORAGE_KEY_FORENSIC_DEALS);
    this.bankRecords = this._load(STORAGE_KEY_FORENSIC_BANK);
  }

  DealerForensicManager.prototype._load = function(key) {
    if (!this.storage) return [];
    var data = this.storage.getItem(key);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  DealerForensicManager.prototype._save = function(key, items) {
    if (!this.storage) return;
    this.storage.setItem(key, JSON.stringify(items));
  };

  DealerForensicManager.prototype.clearAll = function() {
    this.deals = [];
    this.bankRecords = [];
    this._save(STORAGE_KEY_FORENSIC_DEALS, []);
    this._save(STORAGE_KEY_FORENSIC_BANK, []);
  };

  // =====================================================
  // 1. パーサー群（銀行CSV・台帳CSV・TSV/コピペ）
  // =====================================================

  /**
   * 銀行通帳CSVの自動パース
   * 三井住友、三菱UFJ、みずほ、りそな、楽天、住信SBI等を自動判別
   */
  DealerForensicManager.prototype.parseBankCSV = function(csvText) {
    if (!csvText || !csvText.trim()) return [];
    var lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    var records = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      // カンマ区切り（クォート考慮）
      var cols = this._splitCsvLine(line);
      if (cols.length < 3) continue;

      // 日付、入金額、出金額、摘要を推定
      var date = this._extractDate(cols);
      var deposit = this._extractAmount(cols, 'in');
      var withdrawal = this._extractAmount(cols, 'out');
      var description = this._extractDescription(cols);

      if (date && (deposit > 0 || withdrawal > 0)) {
        records.push({
          id: 'BNK-' + (records.length + 1),
          date: date,
          deposit: deposit,
          withdrawal: withdrawal,
          description: description,
          raw: line
        });
      }
    }
    return records;
  };

  /**
   * 過去成約台帳CSV/TSVのパース
   */
  DealerForensicManager.prototype.parseDealsData = function(text) {
    if (!text || !text.trim()) return [];
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    var isTsv = lines[0].indexOf('\t') !== -1;
    var deals = [];

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = isTsv ? line.split('\t') : this._splitCsvLine(line);
      if (cols.length < 6) continue;

      // 想定列: 契約日, 契約番号, VIN, 車種, 担当営業, 契約総額, 預り諸費用, 諸費用実費納付額, 精算完了日, 現金受託額, ローン元金, 下取査定額, USS落札相場, 外注工場名, 外注加修費
      var deal = {
        id: (cols[1] || 'CT-PAST-' + (i)).trim(),
        contractDate: this._normalizeDate((cols[0] || '').trim()),
        vin: (cols[2] || 'VIN' + Math.random().toString(36).substr(2, 9)).trim(),
        model: (cols[3] || '不明車両').trim(),
        salesRep: (cols[4] || '未定').trim(),
        contractTotal: Number((cols[5] || '0').replace(/[^0-9.-]/g, '')),
        expenseDeposit: Number((cols[6] || '0').replace(/[^0-9.-]/g, '')),
        expenseActualPaid: Number((cols[7] || '0').replace(/[^0-9.-]/g, '')),
        expenseSettledDate: this._normalizeDate((cols[8] || '').trim()),
        cashReceived: Number((cols[9] || '0').replace(/[^0-9.-]/g, '')),
        loanPrincipal: Number((cols[10] || '0').replace(/[^0-9.-]/g, '')),
        tradeInAppraised: Number((cols[11] || '0').replace(/[^0-9.-]/g, '')),
        ussMarketPrice: Number((cols[12] || '0').replace(/[^0-9.-]/g, '')),
        repairVendor: (cols[13] || '').trim(),
        repairCost: Number((cols[14] || '0').replace(/[^0-9.-]/g, ''))
      };

      deals.push(deal);
    }
    return deals;
  };

  DealerForensicManager.prototype.setBankRecords = function(records) {
    this.bankRecords = records;
    this._save(STORAGE_KEY_FORENSIC_BANK, records);
  };

  DealerForensicManager.prototype.setDeals = function(deals) {
    this.deals = deals;
    this._save(STORAGE_KEY_FORENSIC_DEALS, deals);
  };

  // =====================================================
  // 2. 自動異常検知エンジン（フォレンジック・スキャン）
  // =====================================================

  /**
   * 過去データ全量フォレンジック監査の実行
   */
  DealerForensicManager.prototype.runFullAudit = function() {
    var results = {
      summary: {
        totalDeals: this.deals.length,
        totalBankRecords: this.bankRecords.length,
        suspiciousDealsCount: 0,
        estimatedDamageAmount: 0,
        highestRiskRep: '未検出',
        overallRiskLevel: 'NORMAL' // NORMAL / ELEVATED / CRITICAL
      },
      bankDiscrepancies: [],   // 通帳と台帳の不一致
      stagnantExpenses: [],    // 預り金の長期滞留・私的流用
      tradeInUnderpriced: [],  // 下取車買叩き・USS乖離
      vendorCollusions: [],    // 外注先癒着・キックバック疑惑
      salesRepProfiles: {},    // 営業マン別行動統計
      anomaliesTimeline: []    // 時系列異常イベント
    };

    if (this.deals.length === 0) return results;

    // ① 営業マン別プロファイル初期化
    var reps = {};
    this.deals.forEach(function(d) {
      if (!reps[d.salesRep]) {
        reps[d.salesRep] = {
          salesRep: d.salesRep,
          totalDeals: 0,
          totalSales: 0,
          totalCash: 0,
          stagnantDaysSum: 0,
          stagnantDealsCount: 0,
          underpricedTradeIns: 0,
          vendorCostMap: {},
          vendorTotalCost: 0,
          suspicionScore: 0,
          criticalAlerts: []
        };
      }
      var r = reps[d.salesRep];
      r.totalDeals++;
      r.totalSales += d.contractTotal;
      r.totalCash += d.cashReceived;

      // 諸費用滞留日数の計算
      if (d.contractDate) {
        var start = new Date(d.contractDate);
        var end = d.expenseSettledDate ? new Date(d.expenseSettledDate) : new Date();
        var diffDays = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
        r.stagnantDaysSum += diffDays;

        // 14日以上の滞留
        if (diffDays > 14 && d.expenseDeposit > 0) {
          r.stagnantDealsCount++;
          var leakEstimate = Math.max(0, d.expenseDeposit - d.expenseActualPaid);
          results.stagnantExpenses.push({
            contractId: d.id,
            vin: d.vin,
            model: d.model,
            salesRep: d.salesRep,
            contractDate: d.contractDate,
            settledDate: d.expenseSettledDate || '未精算',
            stagnantDays: diffDays,
            deposit: d.expenseDeposit,
            actualPaid: d.expenseActualPaid,
            unaccountedAmount: leakEstimate,
            type: 'EXPENSE_STAGNANT_LEAK'
          });
          results.anomaliesTimeline.push({
            date: d.contractDate,
            salesRep: d.salesRep,
            contractId: d.id,
            category: '諸費用長期滞留・流用疑義',
            amount: leakEstimate,
            detail: d.model + ' (諸費用 ¥' + d.expenseDeposit.toLocaleString() + ' が ' + diffDays + '日間手元滞留)'
          });
        }
      }

      // 下取車のUSS相場乖離判定（相場より15%以上安く買叩いて闇流しの疑い）
      if (d.ussMarketPrice > 0 && d.tradeInAppraised > 0) {
        var gapRate = ((d.ussMarketPrice - d.tradeInAppraised) / d.ussMarketPrice) * 100;
        if (gapRate >= 15) {
          r.underpricedTradeIns++;
          var hiddenMargin = d.ussMarketPrice - d.tradeInAppraised;
          results.tradeInUnderpriced.push({
            contractId: d.id,
            vin: d.vin,
            model: d.model,
            salesRep: d.salesRep,
            tradeInAppraised: d.tradeInAppraised,
            ussMarketPrice: d.ussMarketPrice,
            gapAmount: hiddenMargin,
            gapRate: Math.round(gapRate * 10) / 10,
            type: 'TRADEIN_UNDERPRICED_THEFT'
          });
          results.anomaliesTimeline.push({
            date: d.contractDate,
            salesRep: d.salesRep,
            contractId: d.id,
            category: '下取車過小買叩き・中抜き疑義',
            amount: hiddenMargin,
            detail: 'USS相場より ¥' + hiddenMargin.toLocaleString() + ' (' + Math.round(gapRate) + '%) 安値査定'
          });
        }
      }

      // 外注先集中度集計
      if (d.repairVendor && d.repairCost > 0) {
        r.vendorCostMap[d.repairVendor] = (r.vendorCostMap[d.repairVendor] || 0) + d.repairCost;
        r.vendorTotalCost += d.repairCost;
      }
    });

    // ② 銀行通帳との突合（成約台帳にあるのに通帳に着金がない / 差額が存在する）
    if (this.bankRecords.length > 0) {
      this.deals.forEach(function(d) {
        var expectedDeposit = d.contractTotal - d.cashReceived; // 振込・ローン予定額
        if (expectedDeposit <= 0) return;

        // 通帳から日付前後7日以内かつ金額の一致するレコードを探索
        var matched = null;
        var dDate = new Date(d.contractDate);

        for (var b = 0; b < results.bankDiscrepancies.length; b++) {} // dummy
        var foundBank = null;

        // 金額完全一致を探す
        for (var k = 0; k < this.bankRecords.length; k++) {
          var br = this.bankRecords[k];
          if (br.deposit === expectedDeposit) {
            var bDate = new Date(br.date);
            var dayDiff = Math.abs((bDate - dDate) / (1000 * 60 * 60 * 24));
            if (dayDiff <= 30) { // 30日以内
              foundBank = br;
              break;
            }
          }
        }

        if (!foundBank) {
          // 通帳未着金、または過少着金
          var loss = expectedDeposit;
          results.bankDiscrepancies.push({
            contractId: d.id,
            vin: d.vin,
            model: d.model,
            salesRep: d.salesRep,
            contractDate: d.contractDate,
            expectedAmount: expectedDeposit,
            cashReceived: d.cashReceived,
            status: 'BANK_RECORD_MISSING',
            note: '会社口座への着金確認不可（手渡し着服または口座迂回疑義）'
          });
          results.anomaliesTimeline.push({
            date: d.contractDate,
            salesRep: d.salesRep,
            contractId: d.id,
            category: '会社口座着金欠如（中抜き疑義）',
            amount: loss,
            detail: d.model + ' (台帳請求額 ¥' + expectedDeposit.toLocaleString() + ' が公式通帳に未着金)'
          });
        }
      }, this);
    }

    // ③ 営業マン別フォレンジック行動統計の集計＆スコアリング
    var maxScore = 0;
    var worstRep = '未検出';

    Object.keys(reps).forEach(function(repName) {
      var p = reps[repName];
      var cashRatio = p.totalSales > 0 ? (p.totalCash / p.totalSales) * 100 : 0;
      var avgStagnantDays = p.totalDeals > 0 ? Math.round(p.stagnantDaysSum / p.totalDeals) : 0;

      // 外注集中度の計算
      var maxVendorConcentration = 0;
      var topVendor = 'なし';
      if (p.vendorTotalCost > 0) {
        Object.keys(p.vendorCostMap).forEach(function(v) {
          var c = (p.vendorCostMap[v] / p.vendorTotalCost) * 100;
          if (c > maxVendorConcentration) {
            maxVendorConcentration = c;
            topVendor = v;
          }
        });
      }

      // スコア計算
      var score = 0;
      if (cashRatio >= 40) score += 35; // 現金比率過大
      else if (cashRatio >= 20) score += 15;

      if (avgStagnantDays >= 20) score += 35; // 諸費用長期滞留
      else if (avgStagnantDays >= 10) score += 15;

      if (maxVendorConcentration >= 75) score += 20; // 外注癒着
      if (p.underpricedTradeIns >= 2) score += 25; // 下取買叩き

      p.cashRatio = Math.round(cashRatio * 10) / 10;
      p.avgStagnantDays = avgStagnantDays;
      p.topVendor = topVendor;
      p.topVendorConcentration = Math.round(maxVendorConcentration * 10) / 10;
      p.suspicionScore = score;
      p.rank = score >= 60 ? 'CRITICAL' : (score >= 35 ? 'ELEVATED' : 'NORMAL');

      if (score > maxScore) {
        maxScore = score;
        worstRep = repName;
      }

      if (maxVendorConcentration >= 75 && p.vendorTotalCost >= 2000000) {
        results.vendorCollusions.push({
          salesRep: repName,
          vendor: topVendor,
          concentration: Math.round(maxVendorConcentration),
          totalCost: p.vendorTotalCost,
          note: '特定外注先への発注集中（キックバック・水増し請求疑義）'
        });
      }
    });

    results.salesRepProfiles = reps;

    // 時系列ソート
    results.anomaliesTimeline.sort(function(a, b) {
      return (a.date || '').localeCompare(b.date || '');
    });

    // 被害推定総額の合算
    var totalEstimatedLoss = 0;
    results.stagnantExpenses.forEach(function(e) { totalEstimatedLoss += e.unaccountedAmount; });
    results.tradeInUnderpriced.forEach(function(t) { totalEstimatedLoss += t.gapAmount; });
    results.bankDiscrepancies.forEach(function(b) { totalEstimatedLoss += b.expectedAmount; });

    results.summary.suspiciousDealsCount = results.stagnantExpenses.length + results.tradeInUnderpriced.length + results.bankDiscrepancies.length;
    results.summary.estimatedDamageAmount = totalEstimatedLoss;
    results.summary.highestRiskRep = worstRep;
    results.summary.overallRiskLevel = maxScore >= 60 ? 'CRITICAL' : (maxScore >= 35 ? 'ELEVATED' : 'NORMAL');

    return results;
  };

  // =====================================================
  // 3. ヘルパー関数
  // =====================================================
  DealerForensicManager.prototype._splitCsvLine = function(line) {
    var re = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    var a = [];
    var match;
    while ((match = re.exec(line))) {
      var val = match[1] || match[2] || match[3] || '';
      a.push(val.replace(/""/g, '"'));
      if (re.lastIndex >= line.length && line.slice(-1) !== ',') break;
    }
    return a;
  };

  DealerForensicManager.prototype._extractDate = function(cols) {
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i].trim();
      if (/^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/.test(c)) {
        return this._normalizeDate(c);
      }
    }
    return null;
  };

  DealerForensicManager.prototype._extractAmount = function(cols, type) {
    for (var i = 0; i < cols.length; i++) {
      var num = Number(cols[i].replace(/[^0-9.-]/g, ''));
      if (!isNaN(num) && num > 0) {
        // 簡易判定
        if (type === 'in' && (i === 1 || i === 2 || cols[i].indexOf('+') !== -1)) return num;
        if (type === 'out' && (i === 2 || i === 3 || cols[i].indexOf('-') !== -1)) return num;
      }
    }
    return 0;
  };

  DealerForensicManager.prototype._extractDescription = function(cols) {
    var descs = [];
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i].trim();
      if (c && !/^\d+$/.test(c) && !/^\d{4}[\/\-.]\d{1,2}/.test(c)) {
        descs.push(c);
      }
    }
    return descs.join(' ');
  };

  DealerForensicManager.prototype._normalizeDate = function(dStr) {
    if (!dStr) return '';
    var m = dStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) {
      var y = m[1];
      var mon = m[2].padStart(2, '0');
      var d = m[3].padStart(2, '0');
      return y + '-' + mon + '-' + d;
    }
    return dStr;
  };

  // =====================================================
  // 4. 検証用 過去3年分デモデータ生成
  // =====================================================
  DealerForensicManager.prototype.loadPastAuditDemo = function() {
    var pastDeals = [
      // 神田 敏幸（歴32年営業部長）: 組織的不正モデル
      {
        id: 'CT-PAST-0891',
        contractDate: '2024-05-12',
        vin: 'WP0ZZZ99ZNS293810',
        model: 'Porsche 911 GT3 (992)',
        salesRep: '神田 敏幸',
        contractTotal: 29800000,
        expenseDeposit: 1250000,
        expenseActualPaid: 580000,
        expenseSettledDate: '2024-07-28', // 77日間滞留
        cashReceived: 18000000, // 多額の現金受託
        loanPrincipal: 10000000,
        tradeInAppraised: 11000000,
        ussMarketPrice: 15500000, // 450万安値買叩き (29%乖離)
        repairVendor: '神田オート鈑金（特定個人工場）',
        repairCost: 2850000
      },
      {
        id: 'CT-PAST-0922',
        contractDate: '2024-09-18',
        vin: 'W1N4633461X991823',
        model: 'Mercedes-AMG G63 Edition 1',
        salesRep: '神田 敏幸',
        contractTotal: 34500000,
        expenseDeposit: 1400000,
        expenseActualPaid: 620000,
        expenseSettledDate: '2024-11-20', // 63日間滞留
        cashReceived: 20000000,
        loanPrincipal: 14500000,
        tradeInAppraised: 8500000,
        ussMarketPrice: 12000000, // 350万安値買叩き (29%乖離)
        repairVendor: '神田オート鈑金（特定個人工場）',
        repairCost: 3100000
      },
      {
        id: 'CT-PAST-1004',
        contractDate: '2025-02-10',
        vin: 'SCA664S46LU102938',
        model: 'Rolls-Royce Ghost V12',
        salesRep: '神田 敏幸',
        contractTotal: 42000000,
        expenseDeposit: 1800000,
        expenseActualPaid: 850000,
        expenseSettledDate: '', // 未精算・流用中
        cashReceived: 25000000,
        loanPrincipal: 17000000,
        tradeInAppraised: 14000000,
        ussMarketPrice: 19000000, // 500万安値買叩き (26%乖離)
        repairVendor: '神田オート鈑金（特定個人工場）',
        repairCost: 4200000
      },

      // 佐藤 健一（シニア・歴8年）: クリーンモデル
      {
        id: 'CT-PAST-0885',
        contractDate: '2024-04-10',
        vin: 'WBA53AY05PFL19283',
        model: 'BMW M8 Gran Coupe',
        salesRep: '佐藤 健一',
        contractTotal: 18500000,
        expenseDeposit: 750000,
        expenseActualPaid: 720000,
        expenseSettledDate: '2024-04-18', // 8日精算完了
        cashReceived: 0, // 全額振込
        loanPrincipal: 15000000,
        tradeInAppraised: 6800000,
        ussMarketPrice: 7000000, // 相場近似 (2.8%乖離・適正)
        repairVendor: '正規ヤナセ指定工場',
        repairCost: 450000
      },
      {
        id: 'CT-PAST-0940',
        contractDate: '2024-10-05',
        vin: 'ZHWUR1ZF4MLA02918',
        model: 'Lamborghini Urus S',
        salesRep: '佐藤 健一',
        contractTotal: 36000000,
        expenseDeposit: 1300000,
        expenseActualPaid: 1280000,
        expenseSettledDate: '2024-10-14', // 9日精算完了
        cashReceived: 0,
        loanPrincipal: 30000000,
        tradeInAppraised: 12500000,
        ussMarketPrice: 12800000, // 相場近似
        repairVendor: 'コーンズ認定サービスセンター',
        repairCost: 550000
      }
    ];

    var pastBank = [
      { id: 'BNK-101', date: '2024-04-10', deposit: 18500000, withdrawal: 0, description: 'フリカエ BMW M8 ダイキン サトウ' },
      { id: 'BNK-102', date: '2024-10-05', deposit: 36000000, withdrawal: 0, description: 'フリカエ URUS ダイキン サトウ' },
      // 神田の案件は現金手渡しのため通帳に入金が一部しか届いていない
      { id: 'BNK-103', date: '2024-05-15', deposit: 10000000, withdrawal: 0, description: 'オリコ ローン カンダ GT3' },
      { id: 'BNK-104', date: '2024-09-20', deposit: 14500000, withdrawal: 0, description: 'ジャックス ローン カンダ G63' }
    ];

    this.setDeals(pastDeals);
    this.setBankRecords(pastBank);
    return { deals: pastDeals, bank: pastBank };
  };

  global.DealerForensicManager = DealerForensicManager;

})(typeof window !== 'undefined' ? window : this);
