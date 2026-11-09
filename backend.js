/* 投票数据层：ntfy.sh 追加写入 + 仓库归档合并，免登录、无后端服务器。 */
(function (global) {
  'use strict';

  var TOPIC = 'calvote20270d4d9822ee402c9e298425e1';
  var NTFY = 'https://ntfy.sh/' + TOPIC;
  var ARCHIVE = 'votes-archive.json';

  /* 微信 ID 在公开仓库/消息队列中不明文存放（编码，非加密；前端解码后照常展示与导出） */
  function enc(v) {
    return 'b64_' + btoa(unescape(encodeURIComponent(String(v))));
  }
  function dec(v) {
    var t = String(v || '');
    if (t.indexOf('b64_') !== 0) return t;
    try { return decodeURIComponent(escape(atob(t.slice(4)))); } catch (_) { return t; }
  }

  function parseNDJSON(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      try { out.push(JSON.parse(line)); } catch (_) {}
    });
    return out;
  }

  /* 按 vid 去重，同一微信号在同一组只保留最新一条 */
  function normalize(records) {
    var byVid = {}, latest = {};
    (records || []).forEach(function (r) {
      if (!r || !r.vid || !r.wechat_id || !r.orientation || !Array.isArray(r.picks)) return;
      r.wechat_id = dec(r.wechat_id);
      if (String(r.wechat_id).indexOf('__') === 0) return; // 过滤测试数据
      byVid[r.vid] = r;
    });
    Object.keys(byVid).forEach(function (k) {
      var r = byVid[k];
      var key = r.wechat_id + '|' + r.orientation;
      if (!latest[key] || String(r.created_at) > String(latest[key].created_at)) latest[key] = r;
    });
    return Object.keys(latest).map(function (k) { return latest[k]; })
      .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  }

  function list() {
    var archive = fetch(ARCHIVE + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
    var live = fetch(NTFY + '/json?poll=1', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('ntfy ' + r.status); return r.text(); })
      .then(function (t) {
        return parseNDJSON(t)
          .filter(function (e) { return e.event === 'message' && e.message; })
          .map(function (e) { try { return JSON.parse(e.message); } catch (_) { return null; } })
          .filter(Boolean);
      })
      .catch(function () { return []; });
    return Promise.all([archive, live]).then(function (a) {
      return normalize((Array.isArray(a[0]) ? a[0] : []).concat(a[1]));
    });
  }

  function submit(rec) {
    var full = {
      vid: 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10),
      wechat_id: enc(rec.wechat_id),
      orientation: rec.orientation,
      picks: rec.picks,
      created_at: new Date().toISOString()
    };
    return fetch(NTFY + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(full)
    }).then(function (r) {
      if (!r.ok) throw new Error('提交失败（HTTP ' + r.status + '），请稍后重试');
      return full;
    });
  }

  global.VoteBackend = { list: list, submit: submit };
})(window);
