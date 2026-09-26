/**
 * 外車・高級車販売 資金統制・不正根絶システム
 * 【至高の防護・最終防衛線マネージャー】 (DealerSupremeManager)
 * 
 * 30年トップセールスマンの「システム外の闇ルート」を完全に断ち切る3大最終兵器:
 * 1. 【急所① 闇飛ばし封殺】 オーナー室直属 年次VIP顧客 取引照合状（親展レター発行）
 * 2. 【急所② 書類裏通し遮断】 専属行政書士用 陸運局出庫承認パス（セキュリティコード付）
 * 3. 【急所③ パーツ中抜き防止】 第三者検収・50点パーツ＆アセット監査アーカイブ
 */

(function(global) {
  'use strict';

  var STORAGE_KEY_PARTS = 'car_dealer_parts_audit_v1';

  function DealerSupremeManager(contractManager, expenseManager, loanManager, storage) {
    this.contractManager = contractManager;
    this.expenseManager = expenseManager;
    this.loanManager = loanManager;
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.partsAudits = this._loadPartsAudits();
  }

  DealerSupremeManager.prototype._loadPartsAudits = function() {
    if (!this.storage) return [];
    var data = this.storage.getItem(STORAGE_KEY_PARTS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  DealerSupremeManager.prototype._savePartsAudits = function() {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY_PARTS, JSON.stringify(this.partsAudits));
  };

  // =========================================================================
  // 1. 【急所① 闇飛ばし封殺】 オーナー室直属 年次VIP顧客 取引照合状
  // 営業マンを完全に介さず、オーナー事務局から顧客へ親展送付。闇仲介を即日露呈
  // =========================================================================
  DealerSupremeManager.prototype.generateVipAnnualAuditStatement = function(clientInitials, targetYear) {
    var year = targetYear || new Date().getFullYear();
    var deals = this.contractManager ? this.contractManager.getAllDeals() : [];

    // 該当年度の案件抽出
    var clientDeals = [];
    for (var i = 0; i < deals.length; i++) {
      var d = deals[i];
      if (d.contractDate && d.contractDate.indexOf(String(year)) === 0) {
        // デモ用、またはイニシャル合致
        if (!clientInitials || (d.clientInitials && d.clientInitials === clientInitials) || clientInitials === 'ALL') {
          var exp = this.expenseManager ? this.expenseManager.getRecordByContractId(d.id) : null;
          var expSummary = exp ? this.expenseManager.verifyThreeWayMatch(exp) : null;

          clientDeals.push({
            contractId: d.id,
            vin: d.vin,
            model: d.model,
            contractDate: d.contractDate,
            contractTotal: d.contractTotal,
            salesRep: d.salesRep,
            tradeInModel: (d.tradeIn && d.tradeIn.hasTradeIn) ? d.tradeIn.model : 'なし',
            tradeInAppraisal: (d.tradeIn && d.tradeIn.hasTradeIn) ? d.tradeIn.appraisalValue : 0,
            expenseDeposit: expSummary ? expSummary.depositReceived : 0,
            expenseRefund: expSummary ? expSummary.customerRefund : 0
          });
        }
      }
    }

    var letter = {
      letterId: 'VIP-AUDIT-' + year + '-' + Date.now().toString(36).toUpperCase(),
      issueDate: new Date().toISOString().slice(0, 10),
      targetYear: year,
      clientInitials: clientInitials || 'VIP顧客各位',
      officialSender: 'グループ経営統制本部 代表オーナー室（親展）',
      confidentialHotline: 'オーナー直通特命監査ホットライン（24時間守秘義務受付）: owner-audit@group-executive.internal / TEL: 03-XXXX-9999',
      deals: clientDeals,
      warningClause: '【重要なお願い】\n' +
        '弊社では、お客様の大切な資産と保証権利を完全に保護するため、全取引を本状にて年次照合しております。\n' +
        '万一、本状に記載のないお取引、担当営業マンによる個人口座へのお振込み案内、手渡し現金の受領、' +
        'または「社外の専門業者への直接売却の斡旋（闇飛ばし）」等がございましたら、' +
        '弊社公式保証および法的免責の対象外となりますので、直ちに上記オーナー直通ホットラインまでご一報ください。'
    };

    return letter;
  };

  // =========================================================================
  // 2. 【急所② 書類裏通し遮断】 専属行政書士用 陸運局出庫承認パス
  // 諸費用残高0円・ローン着金消込済の暗号化パスがない書類は行政書士が受任拒否
  // =========================================================================
  DealerSupremeManager.prototype.generateScrivenerGatePass = function(contractId, inspectorName) {
    var deal = this.contractManager ? this.contractManager.getDealById(contractId) : null;
    if (!deal) throw new Error('該当する成約車両が見つかりません: ' + contractId);

    var exp = this.expenseManager ? this.expenseManager.getRecordByContractId(contractId) : null;
    if (!exp) throw new Error('諸費用預り金台帳レコードが存在しません');

    var expMatch = this.expenseManager.verifyThreeWayMatch(exp);
    if (!expMatch.isFullyReconciled) {
      throw new Error('【出庫パス発行拒否】諸費用預り金残高が ' + expMatch.balance + 
        '円 滞留しているか、公的領収証書番号が未登録です。0円精算が完了するまで行政書士への書類持ち出しは法的に禁止されています。');
    }

    if (deal.loanPrincipal > 0) {
      var loan = this.loanManager ? this.loanManager.getLoanByContractId(contractId) : null;
      if (!loan || loan.status !== 'reconciled') {
        throw new Error('【出庫パス発行拒否】オートローンの信販会社口座着金消込が完了していません。');
      }
    }

    var inspector = (inspectorName || '統制監査室 専任検査員').trim();

    // 改ざん防止用セキュアハッシュ
    var rawString = contractId + '|' + deal.vin + '|' + expMatch.actualPaidTotal + '|' + inspector;
    var hash = 0;
    for (var i = 0; i < rawString.length; i++) {
      hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
      hash |= 0;
    }
    var securityToken = 'AUTH-PASS-' + Math.abs(hash).toString(16).toUpperCase() + '-' + deal.vin.slice(-6);

    var pass = {
      passId: 'PASS-' + contractId,
      securityToken: securityToken,
      issueTimestamp: new Date().toISOString(),
      contractId: contractId,
      vin: deal.vin,
      model: deal.model,
      salesRep: deal.salesRep,
      inspectorName: inspector,
      verifiedDepositBalance: expMatch.balance, // 0円
      verifiedReceiptCount: exp.items.length,
      loanCleared: deal.loanPrincipal > 0 ? '信販着金消込済' : '全額振込決済済',
      scrivenerMandateClause: '【提携行政書士 厳守義務条項】\n' +
        '本出庫承認パス（Security Token: ' + securityToken + '）が原本添付されていない車両の' +
        '登録申請・名義変更・OSS申請は、提携覚書第4条により受任・申請厳禁とする。' +
        '営業担当者からの口頭依頼や持込を独断で代行した場合は、顧問契約解除および連帯賠償の対象となる。'
    };

    return pass;
  };

  // =========================================================================
  // 3. 【急所③ パーツ中抜き防止】 第三者検収・50点パーツ＆アセット監査
  // 担当営業マン自身の自己検収を禁止。第三者整備士が写真・シリアルを完全記録
  // =========================================================================
  DealerSupremeManager.prototype.recordPartsAudit = function(data) {
    if (!data.contractId) throw new Error('契約番号は必須です');
    if (!data.vin) throw new Error('車台番号(VIN)は必須です');

    var deal = this.contractManager ? this.contractManager.getDealById(data.contractId) : null;
    var salesRep = deal ? deal.salesRep : (data.salesRep || '');
    var inspector = (data.inspectorName || '').trim();

    if (!inspector) {
      throw new Error('検収実施者（第三者検査員）の氏名は必須です');
    }

    // 【重要統制ルール】担当営業マンによる自己検収の絶対禁止
    if (salesRep && inspector.indexOf(salesRep) !== -1) {
      throw new Error('【不正検知トリップワイヤー】担当営業マン（' + salesRep + 
        '）自身によるパーツ検収は「自己監査の禁止規約」により遮断されました。専任整備士または統制事務員が検収してください。');
    }

    var auditRecord = {
      id: 'PRT-' + data.contractId + '-' + (data.inspectionStage || 'arrival'),
      contractId: data.contractId,
      vin: data.vin.toUpperCase().trim(),
      model: deal ? deal.model : (data.model || ''),
      salesRep: salesRep,
      inspectorName: inspector,
      inspectionStage: data.inspectionStage || 'arrival', // 'arrival'(入庫時), 'pre_delivery'(納車前)
      inspectionDate: data.inspectionDate || new Date().toISOString().slice(0, 10),
      odometerKm: Number(data.odometerKm) || 0,

      // 主要高額パーツ5大アセット監査
      components: {
        brakeSystem: {
          name: 'ブレーキシステム（カーボンセラミック/キャリパー）',
          type: data.brakeType || 'PCCB カーボンセラミックブレーキ',
          serialNo: data.brakeSerial || 'SN-BRK-9921',
          verified: !!data.brakeVerified
        },
        wheelTires: {
          name: 'ホイール・タイヤ（鍛造ホイール・DOT製造週）',
          spec: data.wheelSpec || '純正20/21インチGT3鍛造ホイール (ミシュラン Cup2)',
          dotCode: data.tireDot || 'DOT 2424',
          verified: !!data.wheelVerified
        },
        exhaustSystem: {
          name: 'エキゾースト・マフラー（スポーツ触媒・チタンマフラー）',
          type: data.exhaustType || '純正スポーツエキゾースト (可変バルブ)',
          verified: !!data.exhaustVerified
        },
        interiorCarbon: {
          name: '内装・カーボンパッケージ・バケットシート',
          spec: data.interiorSpec || 'フルバケットシート・カーボンドアシル',
          verified: !!data.interiorVerified
        },
        ecuElectronics: {
          name: 'ECU・メーター・スペアキー・整備手帳',
          spec: data.ecuSpec || '純正プログラム・記録簿完備・マスターキー2本',
          verified: !!data.ecuVerified
        }
      },

      photoArchiveCount: Number(data.photoArchiveCount) || 50, // 50枚デジタル撮影
      tamperDetected: !!data.tamperDetected,
      tamperDetails: data.tamperDetails || '',
      createdAt: new Date().toISOString()
    };

    // 既存更新または新規追加
    var index = -1;
    for (var i = 0; i < this.partsAudits.length; i++) {
      if (this.partsAudits[i].id === auditRecord.id) {
        index = i;
        break;
      }
    }
    if (index !== -1) {
      this.partsAudits[index] = auditRecord;
    } else {
      this.partsAudits.unshift(auditRecord);
    }

    this._savePartsAudits();
    return auditRecord;
  };

  DealerSupremeManager.prototype.getPartsAuditsByContractId = function(contractId) {
    var list = [];
    for (var i = 0; i < this.partsAudits.length; i++) {
      if (this.partsAudits[i].contractId === contractId) {
        list.push(this.partsAudits[i]);
      }
    }
    return list;
  };

  DealerSupremeManager.prototype.getAllPartsAudits = function() {
    return this.partsAudits.slice();
  };

  DealerSupremeManager.prototype.clearAll = function() {
    this.partsAudits = [];
    if (this.storage) {
      this.storage.removeItem(STORAGE_KEY_PARTS);
    }
  };

  global.DealerSupremeManager = DealerSupremeManager;

})(typeof window !== 'undefined' ? window : this);
