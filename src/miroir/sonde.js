/*
 * SONDE DU COMPARATEUR LIVE / V3 (17/11) — injectée en tête de jeu/index.html des deux copies de démo
 * (dist/miroir/live et dist/miroir/v3, scripts/miroir/build.mjs), AVANT tout script du jeu. Jamais dans le vrai jeu.
 *
 *  - Stockage : localStorage / sessionStorage / Cache Storage rangés sous « miroir.<côté>. » — les deux copies ne se
 *    marchent pas dessus, ni sur le vrai jeu V3 du même site. Le comparateur recopie la live dans la V3 à chaque ouverture.
 *  - Pas de service worker, de notifications ni de push : rien n'est installé sur l'appareil.
 *  - Hasard reproductible : Math.random suit une graine relancée à chaque geste (même numéro des deux côtés) ; les
 *    tirages de la démo (localBackend, packRoll, ecoLocal…) ont chacun leur propre suite (transformation au build).
 *  - Gestes : chaque geste réel (souris, toucher, molette, clavier, saisie) est envoyé au comparateur, qui le rejoue
 *    tout de suite dans l'autre copie (mêmes coordonnées : les deux cadres ont la même taille). Défilements et adresse
 *    (#/…) suivent le côté « meneur » (celui qui reçoit les vrais gestes).
 *  - Son : seul le côté meneur s'entend (gain maître inséré dans chaque AudioContext, volume des <audio>).
 */
(function () {
  'use strict';
  var W = window;
  var D = document;
  var SIDE = W.__MIROIR_SIDE || 'live';
  var PFX = 'miroir.' + SIDE + '.';

  /* ---------- stockage cloisonné ---------- */
  function nsStorage(real) {
    function keys() {
      var out = [];
      for (var i = 0; i < real.length; i++) {
        var k = real.key(i);
        if (k && k.indexOf(PFX) === 0) out.push(k.slice(PFX.length));
      }
      return out;
    }
    var api = {
      getItem: function (k) { return real.getItem(PFX + k); },
      setItem: function (k, v) { real.setItem(PFX + k, String(v)); },
      removeItem: function (k) { real.removeItem(PFX + k); },
      clear: function () { keys().forEach(function (k) { real.removeItem(PFX + k); }); },
      key: function (i) { var ks = keys(); return i >= 0 && i < ks.length ? ks[i] : null; },
    };
    Object.defineProperty(api, 'length', { configurable: true, get: function () { return keys().length; } });
    return new Proxy(api, {
      get: function (t, p) {
        if (p in t) return t[p];
        if (typeof p !== 'string') return undefined;
        var v = real.getItem(PFX + p);
        return v === null ? undefined : v;
      },
      set: function (t, p, v) {
        if (p in t) return true;
        real.setItem(PFX + String(p), String(v));
        return true;
      },
      has: function (t, p) { return p in t || (typeof p === 'string' && real.getItem(PFX + p) !== null); },
      deleteProperty: function (t, p) { if (!(p in t)) real.removeItem(PFX + String(p)); return true; },
      ownKeys: function () { return keys(); },
      getOwnPropertyDescriptor: function (t, p) {
        if (typeof p !== 'string' || p in t) return undefined;
        var v = real.getItem(PFX + p);
        return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
      },
    });
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      var s = nsStorage(W[name]);
      Object.defineProperty(W, name, { configurable: true, enumerable: true, get: function () { return s; } });
    } catch (e) { /* stockage bloqué : le jeu fait comme d'habitude */ }
  });
  // les écritures de l'autre copie (ou du comparateur) ne doivent jamais réveiller le jeu
  W.addEventListener('storage', function (e) { e.stopImmediatePropagation(); }, true);

  try {
    if (W.caches) {
      var C = W.caches;
      var CP = 'miroir-' + SIDE + '-';
      var co = { open: C.open.bind(C), has: C.has.bind(C), del: C.delete.bind(C), keys: C.keys.bind(C), match: C.match.bind(C) };
      var nsC = {
        open: function (n) { return co.open(CP + n); },
        has: function (n) { return co.has(CP + n); },
        delete: function (n) { return co.del(CP + n); },
        keys: function () {
          return co.keys().then(function (ks) { return ks.filter(function (k) { return k.indexOf(CP) === 0; }).map(function (k) { return k.slice(CP.length); }); });
        },
        match: function (req, opts) {
          if (opts && opts.cacheName) return co.match(req, Object.assign({}, opts, { cacheName: CP + opts.cacheName }));
          return nsC.keys().then(function (ks) {
            return ks.reduce(function (p, k) {
              return p.then(function (r) { return r || co.open(CP + k).then(function (c) { return c.match(req, opts); }); });
            }, Promise.resolve(undefined));
          });
        },
      };
      Object.defineProperty(W, 'caches', { configurable: true, enumerable: true, get: function () { return nsC; } });
    }
  } catch (e) { /* pas de Cache Storage */ }

  /* ---------- rien d'installé : ni service worker, ni push, ni notifications ---------- */
  try { delete Navigator.prototype.serviceWorker; } catch (e) {}
  try { delete W.PushManager; } catch (e) {}
  try {
    var N = function Notification() { throw new TypeError('miroir'); };
    N.permission = 'default';
    N.requestPermission = function () { return Promise.resolve('default'); };
    Object.defineProperty(W, 'Notification', { configurable: true, writable: true, value: N });
  } catch (e) {}

  /* ---------- hasard reproductible ---------- */
  function mulberry(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  var ui = mulberry(hash('miroir:ui'));
  function reseed(n) { ui = mulberry(hash('miroir:ui') ^ Math.imul(n, 2654435761)); }
  Math.random = function random() { return ui(); };
  var streams = {};
  /** appelé en tête des modules de la démo (transformation du build) : une suite à part par module */
  W.__miroirMath = function (name) {
    var r = streams[name] || (streams[name] = mulberry(hash('miroir:' + name)));
    return Object.create(Math, { random: { value: r } });
  };

  /* ---------- son : seul le côté meneur s'entend ---------- */
  var audible = SIDE === 'live';
  var gains = [];
  try {
    var AC = W.AudioContext;
    var destGet = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination').get;
    if (AC && destGet) {
      var Wrapped = function AudioContext(opts) {
        var ctx = opts === undefined ? new AC() : new AC(opts);
        var g = AC.prototype.createGain.call(ctx);
        g.gain.value = audible ? 1 : 0;
        g.connect(destGet.call(ctx));
        Object.defineProperty(ctx, 'destination', { configurable: true, get: function () { return g; } });
        gains.push(g);
        return ctx;
      };
      Wrapped.prototype = AC.prototype;
      W.AudioContext = Wrapped;
    }
  } catch (e) {}
  var media = new Set();
  var wantVol = new WeakMap();
  var MP = HTMLMediaElement.prototype;
  var vd = Object.getOwnPropertyDescriptor(MP, 'volume');
  try {
    Object.defineProperty(MP, 'volume', {
      configurable: true,
      enumerable: true,
      get: function () { return wantVol.has(this) ? wantVol.get(this) : vd.get.call(this); },
      set: function (v) {
        wantVol.set(this, v);
        media.add(this);
        vd.set.call(this, audible ? v : 0);
      },
    });
    var oPlay = MP.play;
    MP.play = function () {
      media.add(this);
      if (!audible) vd.set.call(this, 0);
      return oPlay.apply(this, arguments);
    };
  } catch (e) {}
  function setAudible(on) {
    if (audible === on) return;
    audible = on;
    gains.forEach(function (g) {
      try { g.gain.setTargetAtTime(on ? 1 : 0, g.context.currentTime, 0.03); } catch (e) { g.gain.value = on ? 1 : 0; }
    });
    media.forEach(function (el) {
      try { vd.set.call(el, on ? (wantVol.has(el) ? wantVol.get(el) : 1) : 0); } catch (e) {}
    });
  }

  /* ---------- relais vers le comparateur ---------- */
  var top = W.parent !== W ? W.parent : null;
  var replaying = false;
  function relay(m) {
    if (!top) return 0;
    try { return (top.__miroir && top.__miroir.relay(SIDE, m)) || 0; } catch (e) { return 0; }
  }

  function kindOf(e) {
    if (W.PointerEvent && e instanceof PointerEvent) return 'p';
    if (W.WheelEvent && e instanceof WheelEvent) return 'w';
    if (e instanceof MouseEvent) return 'm';
    if (W.TouchEvent && e instanceof TouchEvent) return 't';
    if (e instanceof KeyboardEvent) return 'k';
    return '';
  }
  function touchList(l) {
    var out = [];
    for (var i = 0; i < l.length; i++) {
      var t = l[i];
      out.push({ id: t.identifier, x: t.clientX, y: t.clientY, sx: t.screenX, sy: t.screenY, rx: t.radiusX, ry: t.radiusY, ra: t.rotationAngle, f: t.force });
    }
    return out;
  }
  function pack(e) {
    var k = kindOf(e);
    var m = { k: k, type: e.type, bub: e.bubbles, c: e.cancelable, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey };
    if (k === 'p' || k === 'm' || k === 'w') {
      m.x = e.clientX; m.y = e.clientY; m.sx = e.screenX; m.sy = e.screenY;
      m.b = e.button; m.bs = e.buttons; m.det = e.detail; m.mx = e.movementX || 0; m.my = e.movementY || 0;
    }
    if (k === 'p') {
      m.id = e.pointerId; m.pt = e.pointerType; m.prim = e.isPrimary; m.w = e.width; m.h = e.height;
      m.pr = e.pressure; m.tp = e.tangentialPressure; m.tx = e.tiltX; m.ty = e.tiltY; m.tw = e.twist;
    }
    if (k === 'w') { m.dx = e.deltaX; m.dy = e.deltaY; m.dz = e.deltaZ; m.dm = e.deltaMode; }
    if (k === 'k') {
      m.key = e.key; m.code = e.code; m.kl = e.location; m.rep = e.repeat; m.isc = e.isComposing;
      // (le focus ne suit pas toujours dans l'autre copie : on vise le même élément)
      var ft = e.target;
      if (ft && ft.nodeType === 1 && ft !== D.body && ft !== D.documentElement) m.loc = locate(ft);
    }
    if (k === 't') { m.all = touchList(e.touches); m.ch = touchList(e.changedTouches); }
    return m;
  }
  function onGesture(e) {
    if (!e.isTrusted || replaying) return;
    var m = pack(e);
    if (!m.k) return;
    var n = relay(m);
    if (n) reseed(n);
  }
  [
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu',
    'touchstart', 'touchmove', 'touchend', 'touchcancel',
    'wheel', 'keydown', 'keyup',
  ].forEach(function (t) { W.addEventListener(t, onGesture, { capture: true, passive: true }); });

  /* champs de saisie : la valeur suit (une touche simulée n'écrit rien) */
  function isField(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    var tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    return !/^(checkbox|radio|button|submit|reset|file|image)$/i.test(el.type);
  }
  function fieldVal(el) { return el.isContentEditable ? el.textContent : el.value; }
  function onField(e) {
    if (!e.isTrusted || replaying || !isField(e.target)) return;
    relay({ k: 'v', type: e.type, loc: locate(e.target), v: fieldVal(e.target) });
  }
  D.addEventListener('input', onField, true);
  D.addEventListener('change', onField, true);

  /* défilements du meneur (une fois par image) */
  var dirty = new Set();
  var raf = 0;
  function flushScroll() {
    raf = 0;
    dirty.forEach(function (el) {
      if (el.isConnected) relay({ k: 's', loc: locate(el), top: el.scrollTop, left: el.scrollLeft });
    });
    dirty.clear();
  }
  D.addEventListener('scroll', function (e) {
    var t = e.target === D ? D.scrollingElement || D.documentElement : e.target;
    if (!t || t.nodeType !== 1) return;
    dirty.add(t);
    if (!raf) raf = requestAnimationFrame(flushScroll);
  }, true);
  W.addEventListener('hashchange', function () { relay({ k: 'h', h: location.hash }); });

  /* ---------- retrouver « le même élément » dans l'autre copie ---------- */
  function esc(s) { return W.CSS && CSS.escape ? CSS.escape(s) : s; }
  function selOf(el, all) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + esc(el.id);
    var cl = Array.prototype.slice.call(el.classList, 0, all ? 99 : 1);
    return s + cl.map(function (c) { return '.' + esc(c); }).join('');
  }
  function locate(el) {
    if (el === D.scrollingElement || el === D.documentElement || el === D.body) return { root: 1 };
    var r = el.getBoundingClientRect();
    var L = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, s: [] };
    [true, false].forEach(function (all) {
      var sel = selOf(el, all);
      var list = D.querySelectorAll(sel);
      L.s.push({ sel: sel, i: Array.prototype.indexOf.call(list, el), n: list.length });
    });
    return L;
  }
  function scrollable(el) {
    var cs = getComputedStyle(el);
    return (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) || (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth);
  }
  function resolve(L, wantScroll) {
    if (L.root) return D.scrollingElement || D.documentElement;
    for (var j = 0; j < L.s.length; j++) {
      var q = L.s[j];
      var list;
      try { list = D.querySelectorAll(q.sel); } catch (e) { continue; }
      if (list.length === q.n && q.i >= 0) return list[q.i];
      if (list.length === 1) return list[0];
    }
    var el = D.elementFromPoint(L.cx, L.cy);
    if (wantScroll) while (el && el !== D.documentElement && !scrollable(el)) el = el.parentElement;
    return el;
  }

  /* ---------- rejouer un geste venu de l'autre copie ---------- */
  var capt = {}; // capture de pointeur simulée : pointerId → élément
  var touchT = {}; // doigt → cible du touchstart
  var hoverEl = null;
  var EP = Element.prototype;
  var oSet = EP.setPointerCapture;
  var oRel = EP.releasePointerCapture;
  var oHas = EP.hasPointerCapture;
  function lost(el, id) {
    setTimeout(function () {
      try { el.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: id })); } catch (e) {}
    }, 0);
  }
  EP.setPointerCapture = function (id) {
    if (replaying || capt[id] !== undefined) {
      capt[id] = this;
      return;
    }
    return oSet.call(this, id);
  };
  EP.releasePointerCapture = function (id) {
    if (capt[id] !== undefined) {
      var el = capt[id];
      delete capt[id];
      if (el === this) lost(el, id);
      return;
    }
    return oRel.call(this, id);
  };
  EP.hasPointerCapture = function (id) { return capt[id] === this || oHas.call(this, id); };

  function at(x, y) { return D.elementFromPoint(x, y) || D.body || D.documentElement; }
  function mods(m) { return { altKey: !!m.alt, ctrlKey: !!m.ctrl, metaKey: !!m.meta, shiftKey: !!m.shift }; }
  function mouseInit(m, bubbles, cancelable) {
    return Object.assign(mods(m), {
      bubbles: bubbles, cancelable: cancelable, composed: true, view: W, detail: m.det || 0,
      screenX: m.sx, screenY: m.sy, clientX: m.x, clientY: m.y, button: m.b, buttons: m.bs, movementX: m.mx, movementY: m.my,
    });
  }
  function ptrInit(m, bubbles, cancelable) {
    return Object.assign(mouseInit(m, bubbles, cancelable), {
      pointerId: m.id, pointerType: m.pt, isPrimary: m.prim, width: m.w, height: m.h, pressure: m.pr,
      tangentialPressure: m.tp, tiltX: m.tx, tiltY: m.ty, twist: m.tw,
    });
  }
  function chain(el) {
    var out = [];
    for (; el; el = el.parentElement) out.push(el);
    return out;
  }
  /* survol : les événements over / out / enter / leave sont recalculés ici (cibles propres à cette copie) */
  function hover(next, m) {
    if (next === hoverEl) return;
    var prev = hoverEl;
    hoverEl = next;
    var a = chain(prev);
    var b = chain(next);
    var pm = m.k === 'p' ? m : null;
    function fireB(el, type, related, bubbles) {
      try {
        var init = pm ? ptrInit(pm, bubbles, bubbles) : mouseInit(m, bubbles, bubbles);
        init.relatedTarget = related;
        if (pm) el.dispatchEvent(new PointerEvent('pointer' + type, init));
        var mi = mouseInit(m, bubbles, bubbles);
        mi.relatedTarget = related;
        if (!pm || pm.pt === 'mouse') el.dispatchEvent(new MouseEvent('mouse' + type, mi));
      } catch (e) {}
    }
    if (prev && prev.isConnected) {
      fireB(prev, 'out', next, true);
      a.forEach(function (el) { if (b.indexOf(el) < 0) fireB(el, 'leave', next, false); });
    }
    if (next) {
      fireB(next, 'over', prev, true);
      b.slice().reverse().forEach(function (el) { if (a.indexOf(el) < 0) fireB(el, 'enter', prev, false); });
    }
  }
  var FOCUSABLE = 'input,textarea,select,button,a[href],[tabindex],[contenteditable=""],[contenteditable="true"],summary';
  var R = {
    p: function (m) {
      var hit = at(m.x, m.y);
      var c = capt[m.id];
      var t = c && c.isConnected ? c : hit;
      if (m.type === 'pointermove' || m.type === 'pointerdown') hover(c && c.isConnected ? c : hit, m);
      var ev = new PointerEvent(m.type, ptrInit(m, m.bub, m.c));
      Object.defineProperty(ev, 'getCoalescedEvents', { configurable: true, value: function () { return [ev]; } });
      Object.defineProperty(ev, 'getPredictedEvents', { configurable: true, value: function () { return []; } });
      t.dispatchEvent(ev);
      if (m.type === 'pointerup' || m.type === 'pointercancel') {
        if (capt[m.id] !== undefined) {
          var el = capt[m.id];
          delete capt[m.id];
          lost(el, m.id);
        }
        if (m.pt !== 'mouse') hover(null, m);
      }
    },
    m: function (m) {
      var t = m.type === 'click' && !m.det && !m.x && !m.y ? D.activeElement || D.body : (capt[1] && capt[1].isConnected && m.type !== 'click' ? capt[1] : at(m.x, m.y));
      var ev = new MouseEvent(m.type, mouseInit(m, m.bub, m.c));
      t.dispatchEvent(ev);
      // focus par défaut d'un clic (un mousedown simulé ne déplace pas le focus)
      if (m.type === 'mousedown' && m.b === 0 && !ev.defaultPrevented) {
        var f = t.closest ? t.closest(FOCUSABLE) : null;
        var a = D.activeElement;
        if (f) { if (a !== f) try { f.focus({ preventScroll: true }); } catch (e) {} }
        else if (a && a !== D.body && a.blur) a.blur();
      }
    },
    w: function (m) {
      var init = mouseInit(m, true, m.c);
      init.deltaX = m.dx; init.deltaY = m.dy; init.deltaZ = m.dz; init.deltaMode = m.dm;
      at(m.x, m.y).dispatchEvent(new WheelEvent('wheel', init));
    },
    k: function (m) {
      var t = (m.loc && resolve(m.loc, false)) || D.activeElement || D.body;
      t.dispatchEvent(new KeyboardEvent(m.type, Object.assign(mods(m), {
        bubbles: true, cancelable: true, composed: true, view: W, key: m.key, code: m.code, location: m.kl, repeat: m.rep, isComposing: m.isc,
      })));
    },
    t: function (m) {
      if (m.type === 'touchstart') m.ch.forEach(function (d) { touchT[d.id] = at(d.x, d.y); });
      function mk(d) {
        var target = touchT[d.id] && touchT[d.id].isConnected ? touchT[d.id] : at(d.x, d.y);
        return new Touch({
          identifier: d.id, target: target, clientX: d.x, clientY: d.y, screenX: d.sx, screenY: d.sy,
          pageX: d.x + W.scrollX, pageY: d.y + W.scrollY, radiusX: d.rx, radiusY: d.ry, rotationAngle: d.ra, force: d.f,
        });
      }
      var touches = m.all.map(mk);
      var changed = m.ch.map(mk);
      var target = changed.length ? changed[0].target : D.body;
      var ev = new TouchEvent(m.type, Object.assign(mods(m), {
        bubbles: true, cancelable: m.c, composed: true, view: W, touches: touches,
        targetTouches: touches.filter(function (t) { return t.target === target; }), changedTouches: changed,
      }));
      target.dispatchEvent(ev);
      if (m.type === 'touchend' || m.type === 'touchcancel') m.ch.forEach(function (d) { delete touchT[d.id]; });
    },
    v: function (m) {
      var el = resolve(m.loc, false);
      if (!isField(el)) el = D.activeElement;
      if (!isField(el)) return;
      if (fieldVal(el) !== m.v) {
        if (el.isContentEditable) el.textContent = m.v;
        else el.value = m.v;
      }
      el.dispatchEvent(m.type === 'input' ? new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }) : new Event('change', { bubbles: true }));
    },
    s: function (m) {
      var el = resolve(m.loc, true);
      if (el && (el.scrollTop !== m.top || el.scrollLeft !== m.left)) el.scrollTo({ top: m.top, left: m.left, behavior: 'instant' });
    },
    h: function (m) {
      if (location.hash !== m.h) location.hash = m.h;
    },
  };
  function replay(m) {
    var f = R[m.k];
    if (!f) return;
    if (m.seq) reseed(m.seq);
    replaying = true;
    try { f(m); } catch (e) { console.warn('[miroir] geste non rejoué', m.type, e); } finally { replaying = false; }
  }

  /* ---------- prêt : l'écran de chargement du jeu a disparu ---------- */
  var sonde = (W.__sonde = { side: SIDE, replay: replay, setAudible: setAudible, ready: false });
  function poll() {
    var l = D.querySelector('#app > .loader');
    if (D.readyState === 'complete' && (!l || l.classList.contains('done'))) {
      sonde.ready = true;
      relay({ k: 'r' });
      return;
    }
    setTimeout(poll, 150);
  }
  setTimeout(poll, 150);
})();
