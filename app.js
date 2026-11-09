(function () {
  'use strict';

  var Q = window.__Q || '';

  var $ = function (s) { return document.querySelector(s); };
  var track = $('#track'), rail = $('#rail'), poolWrap = $('#poolWrap');
  var poolEl = $('#pool'), seg = $('#seg'), toastEl = $('#toast');

  var ALL = [], byIdMap = {}, group = 'h', order = [];
  var pool = [null, null, null];
  var half = 0, paused = false, dragging = false;
  var SPEEDS = [0.7, 1.5, 2.8], SPEED_LABEL = ['慢', '中', '快'], speedIdx = 1;
  var userHold = false, resumeAt = 0;
  var toastTimer = null, lbId = null;

  function byId(id) { return byIdMap[id]; }

  /* 微信内若仍有资源被拦，给出「在浏览器中打开」的明确引导 */
  (function () {
    var tip = document.getElementById('wxTip');
    if (!tip || !/MicroMessenger/i.test(navigator.userAgent)) return;
    var fails = 0;
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'IMG' || t.tagName === 'LINK' || t.tagName === 'SCRIPT')) {
        fails++;
        if (fails >= 3) tip.style.display = 'block';
      }
    }, true);
  })();


  function toast(msg, warn) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 2600);
  }

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function cardHTML(p, i) {
    return '<div class="card ' + p.o + '" data-id="' + p.id + '">' +
      '<img src="' + p.src + Q + '" alt="' + p.id + '" ' +
      (i < 14 ? 'loading="eager"' : 'loading="lazy"') + ' decoding="async" draggable="false">' +
      '<span class="num">' + p.id + '</span>' +
      '<span class="grip">⋮⋮</span>' +
      '<button class="add" data-add="' + p.id + '" aria-label="加入备选">＋</button>' +
      '</div>';
  }

  function renderRail() {
    var list = ALL.filter(function (p) { return p.o === group; });
    order = shuffled(list);
    track.innerHTML = order.concat(order).map(cardHTML).join('');
    rail.scrollLeft = 0;
    half = 0;
    requestAnimationFrame(function () {
      var cards = track.querySelectorAll('.card');
      if (cards.length > order.length) {
        half = cards[order.length].offsetLeft - cards[0].offsetLeft;
      }
    });
    document.querySelectorAll('.card').forEach(function (c) {
      if (pool.indexOf(c.dataset.id) >= 0) c.classList.add('in-pool');
    });
  }

  /* 自动滚动：慢/中/快三档；手动滑动时暂停，松手约 2.5 秒后恢复 */
  function pauseAuto(ms) { resumeAt = performance.now() + (ms || 2500); }

  function tick(ts) {
    if (!paused && !userHold && !dragging && half > 0 && ts > resumeAt) {
      rail.scrollLeft += SPEEDS[speedIdx];
      if (rail.scrollLeft >= half) {
        rail.scrollLeft -= half * Math.floor(rail.scrollLeft / half);
      }
    }
    requestAnimationFrame(tick);
  }

  rail.addEventListener('wheel', function () { pauseAuto(2600); }, { passive: true });
  rail.addEventListener('touchstart', function () { userHold = true; }, { passive: true });
  rail.addEventListener('touchend', function () { userHold = false; pauseAuto(2600); }, { passive: true });
  rail.addEventListener('touchcancel', function () { userHold = false; pauseAuto(2600); }, { passive: true });
  window.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && rail.contains(e.target)) userHold = true;
  });
  window.addEventListener('pointerup', function () {
    if (userHold) { userHold = false; pauseAuto(1800); }
  });

  /* ---------- 备选池 ---------- */
  function renderPool() {
    var n = 0;
    pool.forEach(function (id, i) {
      var slot = poolEl.children[i];
      if (!id) {
        slot.className = 'slot';
        slot.innerHTML = '<span class="slot-num">0' + (i + 1) + '</span><span class="slot-ph">拖到这里</span>';
      } else {
        n++;
        slot.className = 'slot filled';
        slot.innerHTML = '<span class="slot-num">0' + (i + 1) + '</span>' +
          '<img src="' + byId(id).src + Q + '" alt="' + id + '">' +
          '<span class="sid">' + id + '</span>' +
          '<button class="rm" data-rm="' + i + '" aria-label="移走">×</button>';
      }
    });
    $('#poolCount').textContent = n + ' / 3';
    $('#submitBtn').disabled = n === 0;
    document.querySelectorAll('.card').forEach(function (c) {
      c.classList.toggle('in-pool', pool.indexOf(c.dataset.id) >= 0);
    });
  }

  function addToPool(id) {
    var p = byId(id);
    if (!p) return;
    if (p.o !== group) { toast('这张属于另一组，请先切换组别', true); return; }
    if (pool.indexOf(id) >= 0) { toast('这张已经在备选池里了'); return; }
    var idx = pool.indexOf(null);
    if (idx < 0) {
      toast('备选池已满，请先移走一张再投', true);
      poolWrap.classList.remove('full');
      void poolWrap.offsetWidth;
      poolWrap.classList.add('full');
      return;
    }
    pool[idx] = id;
    renderPool();
  }

  poolEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rm]');
    if (!b) return;
    pool[Number(b.dataset.rm)] = null;
    renderPool();
    toast('已移出备选池');
  });

  /* ---------- 拖拽 ---------- */
  function makeGhost(id) {
    var p = byId(id);
    var small = window.innerWidth < 640;
    var g = document.createElement('div');
    g.className = 'drag-ghost';
    g.style.width = (p.o === 'h' ? (small ? 150 : 190) : (small ? 100 : 120)) + 'px';
    g.style.height = (p.o === 'h' ? (small ? 100 : 128) : (small ? 134 : 160)) + 'px';
    g.innerHTML = '<img src="' + p.src + Q + '" alt="">';
    document.body.appendChild(g);
    return g;
  }

  function hitPool(x, y) {
    var r = poolWrap.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top - 12 && y <= r.bottom;
  }

  track.addEventListener('pointerdown', function (e) {
    var card = e.target.closest('.card');
    if (!card) return;
    if (e.target.closest('[data-add]')) {
      e.preventDefault();
      e.stopPropagation();
      addToPool(e.target.closest('[data-add]').dataset.add);
      return;
    }
    var id = card.dataset.id;
    var sx = e.clientX, sy = e.clientY, so = rail.scrollLeft;
    var decided = false, mode = null, ghost = null;
    try { card.setPointerCapture(e.pointerId); } catch (_) {}

    function startDrag() {
      dragging = true;
      ghost = makeGhost(id);
      card.classList.add('dragging');
      poolWrap.classList.add('over');
    }
    function endDrag() {
      if (ghost) { ghost.remove(); ghost = null; }
      card.classList.remove('dragging');
      poolWrap.classList.remove('over');
      dragging = false;
    }
    function cleanup() {
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerup', up);
      card.removeEventListener('pointercancel', cancel);
      try { card.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    function move(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!decided) {
        if (Math.sqrt(dx * dx + dy * dy) < 9) return;
        decided = true;
        /* 向下拖 = 投进备选池；左右拖 = 浏览照片（触摸交给原生横向滚动） */
        if (dy > 8 && dy > Math.abs(dx) * 0.8) {
          mode = 'drag';
          startDrag();
        } else {
          mode = 'scroll';
        }
      }
      if (mode === 'drag' && ghost) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
      } else if (mode === 'scroll' && e.pointerType === 'mouse') {
        rail.scrollLeft = so - dx;
        pauseAuto(2000);
      }
    }
    function up(ev) {
      cleanup();
      if (mode === 'drag') {
        if (hitPool(ev.clientX, ev.clientY)) addToPool(id);
        endDrag();
      } else if (!decided) {
        openLightbox(id);
      }
    }
    function cancel() {
      cleanup();
      if (mode === 'drag') endDrag();
    }
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up);
    card.addEventListener('pointercancel', cancel);
  });

  /* 轨道空白处拖动，手动快速浏览 */
  rail.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.card')) return;
    if (e.pointerType !== 'mouse') return; // 触摸交给原生横向滚动
    var sx = e.clientX, so = rail.scrollLeft;
    rail.classList.add('grabbing');
    try { rail.setPointerCapture(e.pointerId); } catch (_) {}
    function move(ev) {
      rail.scrollLeft = so - (ev.clientX - sx);
      pauseAuto(2000);
    }
    function up() {
      rail.removeEventListener('pointermove', move);
      rail.removeEventListener('pointerup', up);
      rail.removeEventListener('pointercancel', up);
      rail.classList.remove('grabbing');
      pauseAuto(1800);
    }
    rail.addEventListener('pointermove', move);
    rail.addEventListener('pointerup', up);
    rail.addEventListener('pointercancel', up);
  });

  /* ---------- 大图 ---------- */
  function openLightbox(id) {
    var p = byId(id);
    lbId = id;
    $('#lbImg').src = p.src + Q;
    $('#lbMeta').textContent = id + ' · ' + p.name;
    $('#lightbox').hidden = false;
  }
  function closeLightbox() { $('#lightbox').hidden = true; }
  $('#lbClose').onclick = closeLightbox;
  $('#lightbox').addEventListener('click', function (e) {
    if (e.target === this) closeLightbox();
  });
  $('#lbAdd').onclick = function () {
    addToPool(lbId);
    closeLightbox();
  };

  /* ---------- 分组 / 控制 ---------- */
  function switchGroup(g) {
    if (g === group) return;
    if (pool.some(Boolean)) {
      toast('已切换组别，原备选池已清空');
      pool = [null, null, null];
      renderPool();
    }
    group = g;
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.o === g);
    });
    $('#groupTag').textContent = g === 'h' ? '横版组' : '竖版组';
    renderRail();
  }
  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-o]');
    if (b) switchGroup(b.dataset.o);
  });
  $('#shuffleBtn').onclick = function () { renderRail(); toast('已重新随机排序'); };
  $('#speedBtn').onclick = function () {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    this.textContent = '速度：' + SPEED_LABEL[speedIdx];
    if (paused) { paused = false; $('#pauseBtn').textContent = '暂停滚动'; }
    resumeAt = 0;
  };
  $('#pauseBtn').onclick = function () {
    paused = !paused;
    this.textContent = paused ? '继续滚动' : '暂停滚动';
  };
  $('#toBoard').onclick = function () { location.href = 'dashboard.html' + Q; };

  /* ---------- 提交 ---------- */
  var modal = $('#submitModal'), sheet = $('#submitSheet');
  var sheetHTML = sheet.innerHTML;

  $('#submitBtn').onclick = function () {
    var picks = pool.filter(Boolean);
    if (!picks.length) return;
    sheet.innerHTML = sheetHTML;
    bindSheet();
    $('#picksSummary').textContent = (group === 'h' ? '横版组' : '竖版组') + ' · 你选了 ' + picks.join(' / ');
    modal.hidden = false;
    setTimeout(function () { $('#wechatId').focus(); }, 120);
  };

  function bindSheet() {
    $('#cancelSubmit').onclick = function () { modal.hidden = true; };
    $('#confirmSubmit').onclick = doSubmit;
    $('#wechatId').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSubmit();
    });
  }

  function showSuccess(wid, picks) {
    sheet.innerHTML = '<div class="ok-state">' +
      '<div class="tick">✓</div>' +
      '<h2>投票已记下</h2>' +
      '<p>' + escapeHTML(wid) + ' 在' + (group === 'h' ? '横版组' : '竖版组') +
      '投给了 <b>' + picks.join(' / ') + '</b><br>谢谢，结果会实时出现在看板里。</p>' +
      '<button id="okBtn">继续投另一组</button></div>';
    $('#okBtn').onclick = function () {
      modal.hidden = true;
      switchGroup(group === 'h' ? 'v' : 'h');
    };
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function doSubmit() {
    var input = $('#wechatId');
    if (!input) return;
    var wid = input.value.trim();
    if (!wid) { toast('请先填写微信 ID', true); input.focus(); return; }
    var picks = pool.filter(Boolean);
    if (!picks.length) { toast('请先把照片拖进备选池', true); return; }
    var btn = $('#confirmSubmit');
    btn.disabled = true;
    btn.textContent = '提交中…';
    try {
      var existing = await VoteBackend.list();
      if (existing.some(function (r) { return r.wechat_id === wid && r.orientation === group; })) {
        toast('这个微信 ID 已经在' + (group === 'h' ? '横版' : '竖版') + '组投过啦', true);
        btn.disabled = false;
        btn.textContent = '确认提交';
        return;
      }
      await VoteBackend.submit({ wechat_id: wid, orientation: group, picks: picks });
      pool = [null, null, null];
      renderPool();
      showSuccess(wid, picks);
    } catch (e) {
      toast('提交失败：' + (e && e.message ? e.message : '网络异常，请稍后重试'), true);
      btn.disabled = false;
      btn.textContent = '确认提交';
    }
  }

  modal.addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });

  /* ---------- boot ---------- */
  fetch('photos.json' + Q).then(function (r) {
    if (!r.ok) throw new Error('photos.json ' + r.status);
    return r.json();
  }).then(function (meta) {
    ALL = meta.photos;
    ALL.forEach(function (p) { byIdMap[p.id] = p; });
    $('#cntH').textContent = meta.h;
    $('#cntV').textContent = meta.v;
    var q = new URLSearchParams(location.search).get('o');
    if (q === 'v') group = 'v';
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.o === group);
    });
    $('#groupTag').textContent = group === 'h' ? '横版组' : '竖版组';
    renderRail();
    renderPool();
    requestAnimationFrame(tick);
  }).catch(function (e) {
    toast('照片清单加载失败，请刷新页面', true);
    console.error(e);
  });
})();
