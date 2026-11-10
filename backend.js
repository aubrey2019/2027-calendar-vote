/* Supabase 持久化后端（切换时把本文件内容覆盖到 backend.js 即可）
   配置：把下面两个 __ 占位符换成项目的 Project URL 与 anon public key。
   表结构见 supabase_schema.sql。投票写入即落 Postgres，不再依赖 ntfy 缓存。 */
(function (global) {
  'use strict';

  var URL = 'https://ovxmbdjwehtaygjmciyg.supabase.co';
  var KEY = 'sb_publishable_iuKkHG2SAUjf4TVtWo5A1g_5VFRDlsF';
  var BASE = URL.replace(/\/$/, '') + '/rest/v1';

  function enc(v) {
    return 'b64_' + btoa(unescape(encodeURIComponent(String(v))));
  }
  function dec(v) {
    var t = String(v || '');
    if (t.indexOf('b64_') !== 0) return t;
    try { return decodeURIComponent(escape(atob(t.slice(4)))); } catch (_) { return t; }
  }
  function headers(extra) {
    var h = {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  function list() {
    return fetch(BASE + '/votes?select=vid,wechat_id,orientation,picks,created_at&order=created_at.desc&limit=5000',
      { headers: headers(), cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('读取投票失败（HTTP ' + r.status + '）');
        return r.json();
      })
      .then(function (rows) {
        return (rows || [])
          .map(function (r) { return Object.assign({}, r, { wechat_id: dec(r.wechat_id) }); })
          .filter(function (r) { return String(r.wechat_id).indexOf('__') !== 0; });
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
    return fetch(BASE + '/votes', {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(full)
    }).then(function (r) {
      if (r.status === 409) throw new Error('这个微信 ID 已经在这一组投过啦');
      if (!r.ok) throw new Error('提交失败（HTTP ' + r.status + '）');
      return full;
    });
  }

  global.VoteBackend = { list: list, submit: submit };
})(window);
