/**
 * 調剤薬局 売上・入金・返戻管理システム
 * データ保護・バックアップ＆復元モジュール (js/backup.js)
 * 理念: 守るためのシステム（店舗PC故障・キャッシュ消去からスタッフの記録を守る）
 * 開発憲法厳守: 個人情報（患者氏名・生年月日・処方等）の非保持スキャンをインポート時に徹底
 */

class BackupManager {
  static SYSTEM_IDENTIFIER = 'pharmacy-cash-management';
  static BACKUP_VERSION = '1.0';

  constructor(options = {}) {
    this.pettyCashManager = options.pettyCashManager || null;
    this.cashRegisterManager = options.cashRegisterManager || null;
    this.reconciliationManager = options.reconciliationManager || null;
  }

  /**
   * 現在の全データを1つのバックアップオブジェクトとしてエクスポート
   */
  exportData() {
    const pettyCash = this.pettyCashManager ? this.pettyCashManager.transactions : [];
    const cashRegister = this.cashRegisterManager ? this.cashRegisterManager.records : [];
    const monthlyRecords = this.reconciliationManager ? this.reconciliationManager.monthlyRecords : [];
    const remandItems = this.reconciliationManager ? this.reconciliationManager.remandItems : [];

    const now = new Date();
    return {
      system: BackupManager.SYSTEM_IDENTIFIER,
      version: BackupManager.BACKUP_VERSION,
      exportedAt: now.toISOString(),
      metadata: {
        pharmacyName: 'リリー薬局',
        pettyCashCount: pettyCash.length,
        cashRegisterCount: cashRegister.length,
        reconciliationMonthCount: monthlyRecords.length,
        remandItemCount: remandItems.length
      },
      data: {
        pettyCash: JSON.parse(JSON.stringify(pettyCash)),
        cashRegister: JSON.parse(JSON.stringify(cashRegister)),
        reconciliation: {
          monthlyRecords: JSON.parse(JSON.stringify(monthlyRecords)),
          remandItems: JSON.parse(JSON.stringify(remandItems))
        }
      }
    };
  }

  /**
   * エクスポート用JSON文字列を生成
   */
  generateExportJSON() {
    return JSON.stringify(this.exportData(), null, 2);
  }

  /**
   * ブラウザ環境でJSONファイルをダウンロード保存
   */
  downloadBackupFile(filename = null) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('ブラウザ環境でのみダウンロード可能です。');
    }
    const jsonStr = this.generateExportJSON();
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const defaultFilename = `pharmacy_backup_${timestamp}.json`;
    const targetFilename = filename || defaultFilename;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = targetFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return targetFilename;
  }

  /**
   * 個人情報非保持ディープスキャン
   * 憲法規約: 患者氏名（漢字・ひらがな・カタカナ等）が返戻カルテ番号等に含まれていないか検査
   */
  static scanForPersonalInfo(backupObj) {
    const violations = [];
    const japaneseRegex = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/;
    const personalKeys = ['patientname', 'patient_name', 'name', 'kananame', 'patient'];

    if (!backupObj || typeof backupObj !== 'object') {
      return { safe: false, violations: ['バックアップデータの形式が不正です。'] };
    }

    const data = backupObj.data || backupObj;

    // 1. 調剤報酬・返戻明細の検査
    if (data.reconciliation && Array.isArray(data.reconciliation.remandItems)) {
      data.reconciliation.remandItems.forEach((item, idx) => {
        const rowNum = idx + 1;
        // カルテ番号チェック
        if (item.patientChartId && typeof item.patientChartId === 'string') {
          if (japaneseRegex.test(item.patientChartId)) {
            violations.push(`返戻明細 ${rowNum}件目: カルテ番号「${item.patientChartId}」に患者氏名と思われる日本語（漢字・かな・カナ）が検出されました。カルテ番号（半角英数・記号）のみが許可されています。`);
          }
        }
        // 個人情報プロパティの検査
        Object.keys(item).forEach(key => {
          if (personalKeys.includes(key.toLowerCase()) && item[key]) {
            violations.push(`返戻明細 ${rowNum}件目: 個人情報プロパティ「${key}」が検出されました。`);
          }
        });
      });
    }

    // 2. 小口現金・日計締めデータの個人情報プロパティ検査
    ['pettyCash', 'cashRegister'].forEach(tableName => {
      if (Array.isArray(data[tableName])) {
        data[tableName].forEach((item, idx) => {
          Object.keys(item).forEach(key => {
            if (personalKeys.includes(key.toLowerCase()) && item[key]) {
              violations.push(`${tableName} ${idx + 1}件目: 個人情報プロパティ「${key}」が検出されました。`);
            }
          });
        });
      }
    });

    return {
      safe: violations.length === 0,
      violations: violations
    };
  }

  /**
   * インポートデータの妥当性検証および個人情報非保持スキャン
   */
  static validateBackupData(input) {
    let parsed = input;
    if (typeof input === 'string') {
      try {
        parsed = JSON.parse(input);
      } catch (e) {
        return {
          valid: false,
          error: 'JSONファイルの解析に失敗しました。ファイルが破損しているか、JSON形式ではありません。',
          scanResult: { safe: false, violations: [] }
        };
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        valid: false,
        error: 'バックアップデータの形式が無効です（オブジェクトではありません）。',
        scanResult: { safe: false, violations: [] }
      };
    }

    // データ領域の特定（{ system, version, data } または 直接 { pettyCash, cashRegister, reconciliation }）
    const data = parsed.data || parsed;
    if (!data.pettyCash && !data.cashRegister && !data.reconciliation) {
      return {
        valid: false,
        error: 'バックアップデータに必要なテーブル（小口現金、レジ締め、調剤報酬消込）が見つかりません。',
        scanResult: { safe: false, violations: [] }
      };
    }

    // 個人情報非保持スキャンの実行
    const scanResult = BackupManager.scanForPersonalInfo(parsed);
    if (!scanResult.safe) {
      return {
        valid: false,
        error: '【開発憲法・個人情報保護規約違反】ファイル内に患者氏名等の個人情報が検出されたため、復元を拒否しました。',
        scanResult: scanResult
      };
    }

    // 件数サマリー
    const pettyCash = Array.isArray(data.pettyCash) ? data.pettyCash : [];
    const cashRegister = Array.isArray(data.cashRegister) ? data.cashRegister : [];
    const reconciliation = data.reconciliation || {};
    const monthlyRecords = Array.isArray(reconciliation.monthlyRecords) ? reconciliation.monthlyRecords : [];
    const remandItems = Array.isArray(reconciliation.remandItems) ? reconciliation.remandItems : [];

    return {
      valid: true,
      error: null,
      scanResult: scanResult,
      data: {
        pettyCash,
        cashRegister,
        reconciliation: {
          monthlyRecords,
          remandItems
        }
      },
      summary: {
        pettyCashCount: pettyCash.length,
        cashRegisterCount: cashRegister.length,
        reconciliationMonthCount: monthlyRecords.length,
        remandItemCount: remandItems.length,
        exportedAt: parsed.exportedAt || null,
        version: parsed.version || '1.0'
      }
    };
  }

  /**
   * データの復元を実行
   */
  importData(input, managers = null) {
    const pMgr = (managers && managers.pettyCashManager) || this.pettyCashManager;
    const cMgr = (managers && managers.cashRegisterManager) || this.cashRegisterManager;
    const rMgr = (managers && managers.reconciliationManager) || this.reconciliationManager;

    if (!pMgr || !cMgr || !rMgr) {
      throw new Error('復元先のマネージャー（PettyCash, CashRegister, Reconciliation）が指定されていません。');
    }

    const validation = BackupManager.validateBackupData(input);
    if (!validation.valid) {
      const err = new Error(validation.error);
      err.scanResult = validation.scanResult;
      throw err;
    }

    const { pettyCash, cashRegister, reconciliation } = validation.data;

    // 小口現金復元
    pMgr.transactions = JSON.parse(JSON.stringify(pettyCash));
    pMgr.saveToStorage();

    // レジ締め復元
    cMgr.records = JSON.parse(JSON.stringify(cashRegister));
    cMgr.saveToStorage();

    // 調剤報酬復元
    rMgr.monthlyRecords = JSON.parse(JSON.stringify(reconciliation.monthlyRecords));
    rMgr.remandItems = JSON.parse(JSON.stringify(reconciliation.remandItems));
    rMgr.saveToStorage();

    return validation.summary;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BackupManager;
}
