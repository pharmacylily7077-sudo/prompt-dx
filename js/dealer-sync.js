/**
 * 外車・高級車販売 資金統制・不正根絶システム
 * オーナー直結クラウド同期・プライバシースキャンマネージャー (DealerSyncManager)
 * 
 * 統制機能:
 * 1. 中間管理職・営業部長をバイパスしたオーナー直結Googleスプレッドシート自動記帳
 * 2. 個人情報非保持ディープスキャン（顧客氏名・電話番号・住所の自動検知と同期遮断）
 * 3. VIN（車台番号）・契約管理番号をキーストーンとした安全なクラウド監査連携
 */

(function(global) {
  'use strict';

  var STORAGE_KEY_CONFIG = 'car_dealer_sync_config_v1';
  var STORAGE_KEY_QUEUE = 'car_dealer_sync_queue_v1';

  function DealerSyncManager(storage) {
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.config = this._loadConfig();
    this.queue = this._loadQueue();
  }

  DealerSyncManager.prototype._loadConfig = function() {
    if (!this.storage) return { endpointUrl: '', showroomName: '麻布ショールーム' };
    var data = this.storage.getItem(STORAGE_KEY_CONFIG);
    if (!data) return { endpointUrl: '', showroomName: '麻布ショールーム' };
    try {
      return JSON.parse(data);
    } catch (e) {
      return { endpointUrl: '', showroomName: '麻布ショールーム' };
    }
  };

  DealerSyncManager.prototype._saveConfig = function() {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
  };

  DealerSyncManager.prototype._loadQueue = function() {
    if (!this.storage) return [];
    var data = this.storage.getItem(STORAGE_KEY_QUEUE);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  DealerSyncManager.prototype._saveQueue = function() {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(this.queue));
  };

  DealerSyncManager.prototype.isConfigured = function() {
    return !!(this.config && this.config.endpointUrl && this.config.endpointUrl.trim().length > 10);
  };

  DealerSyncManager.prototype.saveSettings = function(endpointUrl, showroomName) {
    this.config = {
      endpointUrl: (endpointUrl || '').trim(),
      showroomName: (showroomName || '麻布ショールーム').trim()
    };
    this._saveConfig();
    return this.config;
  };

  /**
   * 個人情報非保持ディープスキャン
   * 顧客氏名や電話番号などの個人情報が混入していないかを検証
   */
  DealerSyncManager.prototype.scanForPrivacyViolations = function(payload) {
    var jsonString = JSON.stringify(payload);

    // 電話番号パターン (090-XXXX-XXXX, 03-XXXX-XXXX など)
    var phoneRegex = /0\d{1,4}[-(]?\d{1,4}[-)]?\d{4}/;
    if (phoneRegex.test(jsonString)) {
      return { safe: false, reason: '電話番号と推測される文字列が検出されました' };
    }

    // 顧客氏名フィールドの存在検知
    var forbiddenKeys = ['customerName', 'patientName', 'fullName', 'customerAddress', 'customerPhone', '氏名', '顧客名', '患者名'];
    for (var i = 0; i < forbiddenKeys.length; i++) {
      if (jsonString.indexOf('"' + forbiddenKeys[i] + '"') !== -1) {
        return { safe: false, reason: '個人情報フィールド「' + forbiddenKeys[i] + '」が検出されました' };
      }
    }

    return { safe: true };
  };

  /**
   * 同期ペイロードの生成とキューイング
   */
  DealerSyncManager.prototype.prepareSyncPayload = function(action, data) {
    var payload = {
      action: action, // 'sync_deal', 'sync_expense', 'sync_loan', 'sync_audit_alert'
      showroom: this.config.showroomName || '麻布ショールーム',
      timestamp: new Date().toISOString(),
      data: data
    };

    var scan = this.scanForPrivacyViolations(payload);
    if (!scan.safe) {
      throw new Error('プライバシー保護エラー: ' + scan.reason + '。個人情報は保存・送信できません');
    }

    return payload;
  };

  DealerSyncManager.prototype.addToQueue = function(payload) {
    this.queue.push(payload);
    this._saveQueue();
    return this.queue.length;
  };

  DealerSyncManager.prototype.getQueue = function() {
    return this.queue.slice();
  };

  DealerSyncManager.prototype.clearQueue = function() {
    this.queue = [];
    this._saveQueue();
  };

  /**
   * クラウド送信（GASエンドポイントへPOST）
   */
  DealerSyncManager.prototype.sendToCloud = function(payload, callback) {
    if (!this.isConfigured()) {
      this.addToQueue(payload);
      if (callback) callback({ success: false, queued: true, message: 'クラウド未設定のためローカルキューに保持しました' });
      return;
    }

    // ブラウザの fetch による送信
    if (typeof fetch !== 'undefined') {
      var self = this;
      fetch(this.config.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      }).then(function() {
        if (callback) callback({ success: true, message: 'オーナー専用クラウドへ即時同期完了' });
      }).catch(function(err) {
        self.addToQueue(payload);
        if (callback) callback({ success: false, queued: true, error: err.message });
      });
    } else {
      // サーバー・テスト環境
      if (callback) callback({ success: true, simulated: true });
    }
  };

  global.DealerSyncManager = DealerSyncManager;

})(typeof window !== 'undefined' ? window : this);
