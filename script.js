/* ==========================================================================
   script.js — 버튼·팝업·갤러리·카운트다운 등 "동작"을 담당하는 파일입니다.
   내용(문구·날짜·계좌 등)을 바꾸려면 이 파일이 아니라 data.js 를 고치세요.
   ========================================================================== */
'use strict';

/* ==========================================================================
   A. 날짜 계산 (한국 시간 기준) — 화면과 상관없는 순수 계산 부분
   ========================================================================== */
const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const MIN_MS = 60000;
const KST_OFFSET_MS = 9 * HOUR_MS; // 한국 표준시 = UTC+9 (서머타임 없음)
const WEEKDAYS_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function pad2(n) { return String(n).padStart(2, '0'); }

/* 어떤 시각(ms)을 "한국 시계로 읽었을 때"의 연·월·일·시·분·요일로 바꿉니다. */
function kstParts(ms) {
  const d = new Date(ms + KST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay(),
  };
}

function formatKoreanTime(h, mi) {
  const ampm = h < 12 ? '오전' : '오후';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return mi ? `${ampm} ${hh}시 ${mi}분` : `${ampm} ${hh}시`;
}

function formatWeddingDate(ms) {
  const p = kstParts(ms);
  return {
    long: `${p.y}년 ${p.mo}월 ${p.d}일 ${WEEKDAYS_KO[p.wd]}`,
    time: formatKoreanTime(p.h, p.mi),
    short: `${p.y}.${pad2(p.mo)}.${pad2(p.d)}`,
  };
}

/* 한국 시계 기준으로 n개월 뒤를 구합니다. (31일 → 다음 달 28일처럼 실제 달력에 맞춰 보정) */
function addMonthsWall(wallMs, n) {
  const d = new Date(wallMs);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), daysInMonth);
  return Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/* 남은 시간 계산. 개월 수는 30일 고정이 아니라 실제 달력으로 셉니다.
   totalDays 와 (months, days, hours, minutes) 는 같은 순간을 서로 다른 단위로 말한 것이라 모순되지 않아요. */
function calcCountdown(nowMs, targetMs) {
  const diff = targetMs - nowMs;
  if (diff <= 0) return null;

  const nowWall = nowMs + KST_OFFSET_MS;
  const tgtWall = targetMs + KST_OFFSET_MS;
  const a = new Date(nowWall);
  const b = new Date(tgtWall);

  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  while (months > 0 && addMonthsWall(nowWall, months) > tgtWall) months--;
  if (months < 0) months = 0;

  const rest = tgtWall - addMonthsWall(nowWall, months);
  return {
    totalDays: Math.floor(diff / DAY_MS),
    months,
    days: Math.floor(rest / DAY_MS),
    hours: Math.floor((rest % DAY_MS) / HOUR_MS),
    minutes: Math.floor((rest % HOUR_MS) / MIN_MS),
  };
}

/* 지금이 예식 전인지, 예식 당일(시작 이후)인지, 그 이후인지 알려줍니다. */
function getCountdownState(nowMs, targetMs) {
  const c = calcCountdown(nowMs, targetMs);
  if (c) return { mode: 'countdown', ...c };
  const dayKey = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
  return { mode: dayKey(nowMs) === dayKey(targetMs) ? 'today' : 'after' };
}

/* ==========================================================================
   B. 브라우저 저장소 (방문 기록 등) — 막혀 있어도 오류 없이 동작
   ========================================================================== */
const KEYS = {
  introSeen: 'wedding-intro-seen-v1',
  rsvpDone: 'wedding-rsvp-done-v1',
  rsvpLater: 'wedding-rsvp-later-v1',
  clientId: 'wedding-client-id-v1',
};

function getStore(kind) {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
}
function getItem(key, kind) {
  try { const s = getStore(kind); return s ? s.getItem(key) : null; } catch (e) { return null; }
}
function setItem(key, value, kind) {
  try { const s = getStore(kind); if (s) s.setItem(key, value == null ? '1' : value); } catch (e) { /* 저장이 막힌 브라우저 */ }
}
function getClientId() {
  let id = getItem(KEYS.clientId);
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    setItem(KEYS.clientId, id);
  }
  return id;
}

/* 글자를 "보이는 글자 단위"로 쪼갭니다. (♥︎ 같은 기호가 따로 떨어지지 않게) */
function splitGraphemes(str) {
  if (window.Intl && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(str), (s) => s.segment);
  }
  const out = [];
  Array.from(str).forEach((ch) => {
    if ((ch === '︎' || ch === '️') && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  });
  return out;
}

/* ==========================================================================
   C. 화면 동작
   ========================================================================== */
function init() {
  const W = window.WEDDING;
  if (!W) { console.error('data.js 를 불러오지 못했습니다.'); return; }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetMs = Date.parse(W.weddingDateTime);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function getByPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  /* ---------- C-1. data.js 의 문구를 화면에 채우기 ---------- */
  $$('[data-text]').forEach((node) => {
    const v = getByPath(W, node.dataset.text);
    if (typeof v === 'string') node.textContent = v;
  });
  $('#intro-title-sr').textContent = W.texts.introTitle;

  const dateInfo = formatWeddingDate(targetMs);
  $('#d-date').textContent = dateInfo.long;
  $('#d-time').textContent = dateInfo.time;
  $('#d-venue').textContent = W.venue.name;
  $('#d-hall').textContent = W.venue.hall;
  $('#d-address').textContent = W.venue.address;
  $('#closing-date').textContent = dateInfo.short;

  /* ---------- C-2. 스크롤 잠금 · 팝업(레이어) 관리 ---------- */
  let lockCount = 0;
  let savedScroll = 0;
  function lockScroll() {
    if (lockCount++ === 0) {
      savedScroll = window.pageYOffset || 0;
      const b = document.body;
      b.style.position = 'fixed';
      b.style.top = `-${savedScroll}px`;
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
    }
  }
  function unlockScroll() {
    if (lockCount === 0) return;
    if (--lockCount === 0) {
      const b = document.body;
      b.style.position = b.style.top = b.style.left = b.style.right = b.style.width = '';
      window.scrollTo(0, savedScroll); // 닫으면 보던 위치로 정확히 복귀
    }
  }
  function setBackgroundInert(on) {
    ['site-header', 'main'].forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      if (on) node.setAttribute('inert', ''); else node.removeAttribute('inert');
    });
  }

  let introActive = false;
  let current = null; // 지금 열려 있는 레이어 {el, trigger, onClose}

  function openLayer(node, opts) {
    opts = opts || {};
    if (current) closeLayer({ restoreFocus: false });
    current = { el: node, trigger: opts.trigger || document.activeElement, onClose: opts.onClose };
    node.hidden = false;
    lockScroll();
    setBackgroundInert(true);
    const target = (opts.focus && $(opts.focus, node)) || $('[data-autofocus]', node) || $('.modal__panel', node) || node;
    target.focus({ preventScroll: true });
  }
  function closeLayer(opts) {
    opts = opts || {};
    const cur = current;
    if (!cur) return;
    current = null;
    cur.el.hidden = true;
    unlockScroll();
    setBackgroundInert(false);
    if (cur.onClose) cur.onClose();
    if (opts.restoreFocus !== false && cur.trigger && document.contains(cur.trigger)) {
      cur.trigger.focus({ preventScroll: true });
    }
  }
  function focusables(root) {
    return $$('a[href], button, input, select, textarea, [tabindex]', root).filter(
      (n) => !n.disabled && n.tabIndex >= 0 && !n.closest('[hidden]') && !n.closest('.hp')
    );
  }

  document.addEventListener('keydown', (e) => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(); return; }
    if (e.key === 'Tab') {
      const list = focusables(current.el);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const inside = current.el.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
      return;
    }
    if (current.el.id === 'gallery') {
      if (e.key === 'ArrowLeft') { e.preventDefault(); galleryGo(gIndex - 1, true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); galleryGo(gIndex + 1, true); }
    }
  });

  /* 닫기 버튼 · 배경 클릭 */
  $$('.modal, .menu').forEach((layer) => {
    layer.addEventListener('click', (e) => {
      const closer = e.target.closest('[data-close]');
      if (!closer || !layer.contains(closer)) return;
      if (closer.classList.contains('modal__backdrop') && layer.dataset.backdropClose === 'false') return;
      closeLayer();
    });
  });

  /* ---------- C-3. 안내 메시지(토스트) · 복사 ---------- */
  let toastTimer = null;
  function showToast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-show'), 2400);
  }
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 아래 방법으로 다시 시도 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  async function copyWithToast(text, okMessage, returnFocusTo) {
    const ok = await copyText(text);
    if (returnFocusTo) returnFocusTo.focus({ preventScroll: true });
    showToast(ok ? okMessage : '복사하지 못했어요. 직접 선택해서 복사해 주세요.');
    return ok;
  }

  /* ---------- C-4. 스크롤 이동 ---------- */
  function scrollToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }
  $('#brand').addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  /* ---------- C-5. 메뉴 ---------- */
  const menu = $('#menu');
  const menuBtn = $('#menu-btn');
  menuBtn.addEventListener('click', () => {
    menuBtn.setAttribute('aria-expanded', 'true');
    openLayer(menu, { trigger: menuBtn, onClose: () => menuBtn.setAttribute('aria-expanded', 'false') });
  });
  $$('[data-menu-target]', menu).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.menuTarget;
      closeLayer({ restoreFocus: false });
      scrollToSection(id);
    });
  });
  $('[data-menu-action="rsvp"]', menu).addEventListener('click', () => {
    closeLayer({ restoreFocus: false });
    openRsvp('form', menuBtn);
  });

  /* ---------- C-6. 사진: 메인 3장 + 전체 화면 갤러리 ---------- */
  const galleryList = (W.photos.gallery && W.photos.gallery.length) ? W.photos.gallery : W.photos.featured;

  function makePhoto(tag, src, extraClass, eager) {
    const node = el(tag, 'photo ' + extraClass);
    if (tag === 'button') node.type = 'button';
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.loading = eager ? 'eager' : 'lazy';
    img.addEventListener('error', () => { node.classList.add('is-missing'); img.remove(); });
    img.src = src;
    node.appendChild(img);
    return node;
  }

  (function renderMoments() {
    const grid = $('#moments-grid');
    const f = W.photos.featured.slice(0, 3);
    f.forEach((src, i) => {
      const btn = makePhoto('button', src, i === 0 ? 'photo--lead' : 'photo--pair', i === 0);
      btn.setAttribute('aria-label', `사진 ${i + 1} 크게 보기`);
      btn.addEventListener('click', () => {
        const idx = galleryList.indexOf(src);
        openGallery(idx >= 0 ? idx : 0, btn);
      });
      if (i === 0) grid.appendChild(btn);
      else {
        let row = $('.moments__row', grid);
        if (!row) { row = el('div', 'moments__row'); grid.appendChild(row); }
        row.appendChild(btn);
      }
    });
    $('#btn-more-photos').addEventListener('click', (e) => openGallery(0, e.currentTarget));
  })();

  (function renderClosingPhoto() {
    const fig = $('#closing-photo');
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.addEventListener('error', () => { fig.classList.add('is-missing'); img.remove(); });
    img.src = W.photos.closing;
    fig.appendChild(img);
  })();

  const gallery = $('#gallery');
  const track = $('#gallery-track');
  const countEl = $('#gallery-count');
  const prevBtn = $('#gallery-prev');
  const nextBtn = $('#gallery-next');
  let gIndex = 0;
  let galleryBuilt = false;

  function buildGallery() {
    if (galleryBuilt) return;
    galleryList.forEach((src, i) => {
      const slide = el('div', 'gallery__slide');
      const img = new Image();
      img.alt = `우리의 사진 ${i + 1}`;
      img.decoding = 'async';
      img.dataset.src = src;
      img.addEventListener('error', () => { slide.classList.add('is-missing'); img.remove(); });
      slide.appendChild(img);
      track.appendChild(slide);
    });
    galleryBuilt = true;
  }
  function loadSlide(i) {
    const slide = track.children[i];
    if (!slide) return;
    const img = $('img', slide);
    if (img && !img.getAttribute('src') && img.dataset.src) img.src = img.dataset.src;
  }
  function updateGalleryUi() {
    countEl.textContent = `${pad2(gIndex + 1)} / ${pad2(galleryList.length)}`;
    prevBtn.setAttribute('aria-disabled', String(gIndex <= 0));
    nextBtn.setAttribute('aria-disabled', String(gIndex >= galleryList.length - 1));
    [gIndex - 1, gIndex, gIndex + 1].forEach(loadSlide);
  }
  function galleryGo(i, smooth) {
    i = Math.max(0, Math.min(galleryList.length - 1, i));
    gIndex = i;
    updateGalleryUi();
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }
  function openGallery(start, trigger) {
    buildGallery();
    openLayer(gallery, { trigger, focus: '#gallery-close' });
    galleryGo(start || 0, false);
  }
  let scrollRaf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const w = track.clientWidth || 1;
      const idx = Math.max(0, Math.min(galleryList.length - 1, Math.round(track.scrollLeft / w)));
      if (idx !== gIndex) { gIndex = idx; updateGalleryUi(); }
    });
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (current && current.el === gallery) track.scrollTo({ left: gIndex * track.clientWidth, behavior: 'auto' });
  });
  prevBtn.addEventListener('click', () => galleryGo(gIndex - 1, true));
  nextBtn.addEventListener('click', () => galleryGo(gIndex + 1, true));
  $('#gallery-close').addEventListener('click', () => closeLayer());

  /* ---------- C-7. D-Day 카운트다운 ---------- */
  (function startCountdown() {
    const live = $('#cd-live');
    const msg = $('#cd-message');
    const ids = { total: '#cd-total', months: '#cd-months', days: '#cd-days', hours: '#cd-hours', minutes: '#cd-minutes' };
    const nodes = {};
    Object.keys(ids).forEach((k) => { nodes[k] = $(ids[k]); });
    const lastText = {};
    function put(key, value) {
      const text = String(value);
      if (lastText[key] !== text) { lastText[key] = text; nodes[key].textContent = text; }
    }
    function tick() {
      const s = getCountdownState(Date.now(), targetMs);
      if (s.mode === 'countdown') {
        live.hidden = false;
        msg.hidden = true;
        put('total', s.totalDays);
        put('months', s.months);
        put('days', s.days);
        put('hours', s.hours);
        put('minutes', s.minutes);
      } else {
        live.hidden = true;
        msg.hidden = false;
        msg.textContent = s.mode === 'today' ? W.texts.weddingToday : W.texts.weddingAfter;
      }
    }
    tick();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
  })();

  /* ---------- C-8. 결혼식 안내 · 지도 ---------- */
  const searchKeyword = W.venue.searchKeyword || W.venue.name;

  function mapUrl(app) {
    const custom = (W.mapLinks && W.mapLinks[app]) || '';
    if (custom) return custom;
    if (app === 'kakao') return 'https://map.kakao.com/link/search/' + encodeURIComponent(searchKeyword);
    return '';
  }
  function openMap(app, trigger) {
    const url = mapUrl(app);
    if (url) { window.open(url, '_blank', 'noopener'); return; }
    // 확인된 링크가 아직 없으면 주소를 복사해 드려요. (앱이 없는 폰에서 오류 창이 뜨지 않도록 앱 호출은 하지 않습니다)
    const appName = app === 'naver' ? '네이버 지도' : '티맵';
    copyWithToast(W.venue.address, `주소를 복사했어요. ${appName}에서 붙여넣어 검색해 주세요.`, trigger);
  }

  $('#btn-copy-address').addEventListener('click', (e) => {
    copyWithToast(W.venue.address, '주소를 복사했어요.', e.currentTarget);
  });
  $('#btn-map').addEventListener('click', (e) => openMap('kakao', e.currentTarget));
  $('#btn-directions').addEventListener('click', () => {
    const custom = (W.mapLinks && W.mapLinks.directions) || '';
    if (custom) window.open(custom, '_blank', 'noopener');
    else scrollToSection('location');
  });
  $$('[data-map]').forEach((btn) => btn.addEventListener('click', () => openMap(btn.dataset.map, btn)));

  (function renderTransport() {
    const list = $('#transport-list');
    (W.transport.groups || []).forEach((g) => {
      const d = el('details', 'acc');
      if (g.open) d.open = true;
      d.appendChild(el('summary', null, g.title));
      const body = el('div', 'acc__body');
      (g.blocks || []).forEach((b) => {
        if (b.heading) body.appendChild(el('p', 'acc__heading', b.heading));
        (b.lines || []).forEach((line) => body.appendChild(el('p', 'acc__line', line)));
      });
      d.appendChild(body);
      list.appendChild(d);
    });
  })();

  /* ---------- C-9. 가족 · 계좌 팝업 ---------- */
  const infoModal = $('#modal-info');
  const infoTitle = $('#info-title');
  const infoBody = $('#info-body');

  function openFamily(side, trigger) {
    const f = W.families[side];
    infoTitle.textContent = f.title;
    infoBody.textContent = '';
    [['아버지', f.father], ['어머니', f.mother]].forEach(([label, name]) => {
      const row = el('div', 'info-row');
      row.appendChild(el('span', 'info-row__label', label));
      row.appendChild(el('span', 'info-row__value' + (name ? '' : ' info-row__value--muted'), name || '준비 중'));
      infoBody.appendChild(row);
    });
    openLayer(infoModal, { trigger });
  }

  function openAccounts(side, trigger) {
    infoTitle.textContent = side === 'groom' ? '신랑 측 계좌' : '신부 측 계좌';
    infoBody.textContent = '';
    const list = (W.accounts[side] || []).filter((a) => a.bank && a.holder && a.number);
    if (!list.length) {
      infoBody.appendChild(el('p', 'info-empty', '계좌 정보는 준비 중입니다.'));
    }
    list.forEach((a) => {
      const box = el('div', 'account');
      if (a.label) box.appendChild(el('p', 'account__who', a.label));
      box.appendChild(el('p', 'account__bank', `${a.bank} · ${a.holder}`));
      box.appendChild(el('p', 'account__number', a.number));
      const copyBtn = el('button', 'btn', '계좌번호 복사');
      copyBtn.type = 'button';
      copyBtn.setAttribute('aria-label', `${a.label ? a.label + ' ' : ''}계좌번호 복사`);
      copyBtn.addEventListener('click', () => copyWithToast(a.number, '계좌번호를 복사했어요.', copyBtn));
      box.appendChild(copyBtn);
      infoBody.appendChild(box);
    });
    openLayer(infoModal, { trigger });
  }
  $$('[data-family]').forEach((b) => b.addEventListener('click', () => openFamily(b.dataset.family, b)));
  $$('[data-account]').forEach((b) => b.addEventListener('click', () => openAccounts(b.dataset.account, b)));

  /* ---------- C-10. 참석 여부(RSVP) ---------- */
  const rsvpModal = $('#modal-rsvp');
  const stepIntro = $('#rsvp-step-intro');
  const form = $('#rsvp-form');
  const stepDone = $('#rsvp-step-done');
  const notice = $('#rsvp-notice');
  const submitBtn = $('#rsvp-submit');
  const nameInput = $('#rsvp-name');
  const companionsSel = $('#rsvp-companions');
  const extra = $('#rsvp-extra');
  const formError = $('#rsvp-error');
  let submitting = false;
  let submittedNow = false;

  const maxCompanions = Math.max(0, parseInt(W.rsvp.maxCompanions, 10) || 5);
  for (let i = 0; i <= maxCompanions; i++) {
    const opt = el('option', null, i === 0 ? '없음 (본인만)' : `${i}명`);
    opt.value = String(i);
    companionsSel.appendChild(opt);
  }

  function rsvpEndpoint() { return String((W.rsvp && W.rsvp.endpoint) || '').trim(); }
  function showStep(name) {
    stepIntro.hidden = name !== 'intro';
    form.hidden = name !== 'form';
    stepDone.hidden = name !== 'done';
  }
  function focusStep(name) {
    const target = name === 'intro' ? $('#rsvp-start')
      : name === 'form' ? nameInput
      : $('#rsvp-done-close');
    setTimeout(() => target.focus({ preventScroll: true }), 0);
  }
  function prepareNotice() {
    let text = '';
    if (!rsvpEndpoint()) {
      text = '지금은 응답을 저장하는 기능이 연결되지 않은 상태예요. 제출해도 응답이 전달되지 않습니다.';
    } else if (getItem(KEYS.rsvpDone)) {
      text = '이미 응답을 전달해 주셨어요. 내용을 바꾸시려면 다시 제출해 주세요.';
    }
    notice.hidden = !text;
    notice.textContent = text;
  }
  function openRsvp(step, trigger) {
    submittedNow = false;
    formError.textContent = '';
    showStep(step);
    if (step === 'form') prepareNotice();
    openLayer(rsvpModal, {
      trigger,
      onClose: () => {
        if (!submittedNow) setItem(KEYS.rsvpLater, '1', 'session'); // 이번 방문에서는 자동 팝업을 다시 띄우지 않음
      },
    });
    focusStep(step);
  }

  $('#rsvp-start').addEventListener('click', () => {
    showStep('form');
    prepareNotice();
    focusStep('form');
  });
  $('#rsvp-later').addEventListener('click', () => closeLayer());

  $$('input[name="attend"]', form).forEach((r) => {
    r.addEventListener('change', () => {
      const v = form.querySelector('input[name="attend"]:checked');
      extra.hidden = !(v && v.value === 'yes');
      $('#err-attend').textContent = '';
    });
  });
  nameInput.addEventListener('input', () => {
    $('#err-name').textContent = '';
    nameInput.closest('.field').classList.remove('has-error');
  });

  function validate() {
    const name = nameInput.value.trim();
    const attend = form.querySelector('input[name="attend"]:checked');
    let firstBad = null;
    $('#err-name').textContent = '';
    $('#err-attend').textContent = '';
    formError.textContent = '';
    nameInput.closest('.field').classList.remove('has-error');
    if (!name) {
      $('#err-name').textContent = '성함을 입력해 주세요.';
      nameInput.closest('.field').classList.add('has-error');
      firstBad = nameInput;
    }
    if (!attend) {
      $('#err-attend').textContent = '참석 여부를 선택해 주세요.';
      firstBad = firstBad || form.querySelector('input[name="attend"]');
    }
    if (firstBad) { firstBad.focus({ preventScroll: false }); return null; }
    return { name, attend: attend.value };
  }

  function setSubmitting(on) {
    submitting = on;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? '전달 중…' : '전달하기';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return; // 중복 제출 방지
    const base = validate();
    if (!base) return;
    if (form.elements.website && form.elements.website.value) return; // 자동 입력 프로그램은 조용히 무시

    const endpoint = rsvpEndpoint();
    if (!endpoint) {
      formError.textContent = '현재 응답을 저장하는 기능이 연결되어 있지 않아 응답이 전달되지 않았어요. 신랑·신부에게 직접 알려주세요.';
      return;
    }

    const attending = base.attend === 'yes';
    const mealChoice = form.querySelector('input[name="meal"]:checked');
    const payload = {
      clientId: getClientId(),
      name: base.name,
      attend: base.attend,
      companions: attending ? parseInt(companionsSel.value, 10) || 0 : 0,
      meal: attending && mealChoice ? mealChoice.value : '',
      website: '',
    };

    setSubmitting(true);
    formError.textContent = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      // 헤더를 따로 지정하지 않아야 브라우저가 사전 확인(preflight) 없이 바로 보냅니다.
      const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify(payload), signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'not ok');
      setItem(KEYS.rsvpDone, '1');
      submittedNow = true;
      showStep('done');
      focusStep('done');
    } catch (err) {
      formError.textContent = '전달하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 신랑·신부에게 직접 알려주세요.';
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  });

  /* ---------- C-11. 인트로 → 메인 진입 ---------- */
  function onMainEntered() {
    if (getItem(KEYS.rsvpDone) || getItem(KEYS.rsvpLater, 'session')) return;
    const delay = Math.max(0, parseInt(W.rsvp.autoPopupDelayMs, 10) || 3000);
    setTimeout(() => {
      // 인트로가 끝나기 전, 또는 다른 메뉴·팝업이 열려 있으면 띄우지 않습니다.
      if (introActive || current) return;
      if (getItem(KEYS.rsvpDone) || getItem(KEYS.rsvpLater, 'session')) return;
      openRsvp('intro', null);
    }, delay);
  }

  function runIntro() {
    const intro = $('#intro');
    const titleEl = $('#intro-title');
    const figure = $('#intro-figure');
    const photo = $('#intro-photo');
    const skipBtn = $('#intro-skip');
    const chars = splitGraphemes(W.texts.introTitle);
    const timers = [];
    let finished = false;

    introActive = true;
    lockScroll();
    setBackgroundInert(true);

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function finish() {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      setItem(KEYS.introSeen, '1');
      intro.classList.add('is-leaving');
      setTimeout(() => {
        intro.hidden = true;
        introActive = false;
        unlockScroll();
        setBackgroundInert(false);
        onMainEntered();
      }, reduceMotion ? 0 : 600);
    }
    skipBtn.addEventListener('click', finish);

    // 사진이 없거나 불러오지 못해도 인트로는 계속 진행됩니다.
    photo.addEventListener('error', () => figure.classList.add('is-missing'));
    photo.src = W.photos.intro;

    later(finish, 9000); // 안전장치: 무슨 일이 있어도 9초 안에는 메인으로

    function showPhoto() {
      titleEl.parentElement.classList.add('is-hidden');
      figure.classList.add('is-visible');
      later(finish, 2100);
    }

    if (reduceMotion) { // 동작 줄이기: 글자는 한 번에, 사진은 바로, 짧게 보여주고 이동
      titleEl.textContent = chars.join('');
      later(() => { showPhoto(); }, 900);
      return;
    }

    // 장면 A: 한 글자씩 타이핑 → 장면 B: 사진 페이드인 → 장면 C: 메인으로 전환
    let i = 0;
    function typeNext() {
      i += 1;
      titleEl.textContent = chars.slice(0, i).join('');
      if (i < chars.length) later(typeNext, 110);
      else later(showPhoto, 500);
    }
    later(typeNext, 300);
  }

  if (document.documentElement.classList.contains('intro-seen')) {
    $('#intro').hidden = true;
    onMainEntered();
  } else {
    runIntro();
  }
}

/* 화면이 있는 브라우저에서만 실행합니다. (날짜 계산 테스트 때는 건너뜀) */
if (typeof document !== 'undefined') init();
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcCountdown, getCountdownState, formatWeddingDate, addMonthsWall };
}
