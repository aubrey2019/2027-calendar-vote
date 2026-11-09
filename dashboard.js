(function () {
  'use strict';


  var Q = window.__Q || '';
  var $ = function (s) { return document.querySelector(s); };
  var ALL = [], byIdMap = {}, rows = [], group = 'h', ranking = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mask(s) {
    s = String(s || '');
    if (s.length <= 2) return s.charAt(0) + '*';
    return s.slice(0, 2) + '***' + s.slice(-1);
  }
  function timeStr(s) {
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) +
      ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function nowStr() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }

  async function load() {
    try {
      rows = await VoteBackend.list();
      $('#err').style.display = 'none';
      $('#lastUpdate').textContent = '更新于 ' + nowStr();
      render();
    } catch (e) {
      $('#err').style.display = 'block';
      $('#err').textContent = '读取投票数据失败：' + (e && e.message ? e.message : '网络异常，5 秒后自动重试');
    }
  }

  function countFor(o) {
    var c = {};
    rows.forEach(function (r) {
      if (r.orientation !== o) return;
      (r.picks || []).forEach(function (id) { c[id] = (c[id] || 0) + 1; });
    });
    return c;
  }

  function render() {
    var hRows = rows.filter(function (r) { return r.orientation === 'h'; });
    var vRows = rows.filter(function (r) { return r.orientation === 'v'; });
    var picks = 0;
    rows.forEach(function (r) { picks += (r.picks || []).length; });
    $('#sTotal').innerHTML = rows.length + '<span class="u">条</span>';
    $('#sH').innerHTML = hRows.length + '<span class="u">人</span>';
    $('#sV').innerHTML = vRows.length + '<span class="u">人</span>';
    $('#sPicks').innerHTML = picks + '<span class="u">票</span>';

    var c = countFor(group);
    ranking = ALL.filter(function (p) { return p.o === group; })
      .map(function (p) { return { id: p.id, name: p.name, src: p.src, n: c[p.id] || 0 }; })
      .sort(function (a, b) { return b.n - a.n || a.id.localeCompare(b.id); });
    var max = Math.max.apply(null, [1].concat(ranking.map(function (r) { return r.n; })));

    $('#rankTitle').textContent = (group === 'h' ? '横版组' : '竖版组') + ' · 照片票数排名';
    $('#rankCap').textContent = '共 ' + ranking.length + ' 张候选 · 已投出 ' + Object.keys(c).length + ' 张不同照片 · 前 13 名入选';

    var html = '';
    ranking.forEach(function (r, i) {
      if (i === 13) html += '<div class="cut">TOP 13 · 入选线</div>';
      html += '<div class="row ' + (i < 13 ? 'top' : '') + '">' +
        '<span class="idx">' + (i + 1) + '</span>' +
        '<img src="' + r.src + Q + '" alt="" loading="lazy">' +
        '<span class="info"><div class="code">' + r.id + '</div><div class="name">' + esc(r.name) + '</div></span>' +
        '<span class="bar"><i style="width:' + (r.n / max * 100).toFixed(1) + '%"></i></span>' +
        '<span class="num">' + r.n + '</span></div>';
    });
    $('#rank').innerHTML = html || '<div class="empty">暂无数据</div>';

    $('#feed').innerHTML = rows.slice(0, 40).map(function (r) {
      return '<div class="feed-item">' +
        '<div class="l1"><b>' + esc(mask(r.wechat_id)) + '</b><span class="tag">' +
        (r.orientation === 'h' ? '横版' : '竖版') + '</span></div>' +
        '<div class="l2">' + esc((r.picks || []).join(' / ')) + ' · ' + timeStr(r.created_at) + '</div>' +
        '</div>';
    }).join('') || '<div class="empty">还没有人投票</div>';
  }

  function exportCSV() {
    var lines = ['排名,编号,方向,票数,是否Top13,原文件名'];
    ranking.forEach(function (r, i) {
      lines.push([i + 1, r.id, group === 'h' ? '横版' : '竖版', r.n,
        i < 13 ? '是' : '否', '"' + String(r.name).replace(/"/g, '""') + '"'].join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '2027台历_' + (group === 'h' ? '横版' : '竖版') + '组_票数排名.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  $('#seg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-o]');
    if (!b) return;
    group = b.dataset.o;
    this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
    render();
  });
  $('#refreshBtn').onclick = load;
  $('#exportBtn').onclick = exportCSV;
  $('#backVote').onclick = function () { location.href = 'index.html' + Q; };

  fetch('photos.json' + Q).then(function (r) { return r.json(); }).then(function (meta) {
    ALL = meta.photos;
    ALL.forEach(function (p) { byIdMap[p.id] = p; });
    var q = new URLSearchParams(location.search).get('o');
    if (q === 'v') {
      group = 'v';
      $('#seg').querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x.dataset.o === 'v'); });
    }
    load();
    setInterval(load, 5000);
  }).catch(function (e) {
    $('#err').style.display = 'block';
    $('#err').textContent = '照片清单加载失败，请刷新页面';
    console.error(e);
  });
})();
