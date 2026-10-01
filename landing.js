(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const bump = (v, a, b, c, d) => smooth(a, b, v) * (1 - smooth(c, d, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // Where the "sign up / log in" links go (the artifact build points them at the hosted demo).
  if (window.BUROS_APP_URL) document.querySelectorAll('[data-app]').forEach(a => { a.href = window.BUROS_APP_URL; a.target = '_blank'; a.rel = 'noopener'; });

  const topbar = document.getElementById('topbar');
  const story = document.querySelector('.story');
  const chapters = [...document.querySelectorAll('.chapter')];
  const rail = [...document.querySelectorAll('.rail li')];
  const hint = document.querySelector('.scroll-hint');
  const lightBands = [...document.querySelectorAll('.features,.steps,.pricing,.faq')];
  const floaters = [...document.querySelectorAll('[data-speed]')];

  const storyProgress = () => { const r = story.getBoundingClientRect(), total = r.height - innerHeight; return total > 0 ? clamp(-r.top / total) : 0; };
  let target = storyProgress(), cur = target;

  function updateChapters(p) {
    for (const ch of chapters) {
      const from = +ch.dataset.from, to = +ch.dataset.to, span = to - from, t = (p - from) / span;
      const fadeIn = ch.hasAttribute('data-first') ? 1 : smooth(0, .22, t);
      const fadeOut = ch.hasAttribute('data-last') ? 1 : 1 - smooth(.78, 1, t);
      const o = clamp(fadeIn * fadeOut);
      ch.style.opacity = o.toFixed(3);
      ch.style.visibility = o > .01 ? 'visible' : 'hidden';
      ch.style.pointerEvents = o > .5 ? 'auto' : 'none';
      if (reduce) continue;
      const drift = (.5 - clamp(t, -.2, 1.2)) * 110;
      for (const el of ch.children) { const d = +(el.dataset.depth || 1); el.style.transform = `translate3d(0,${(drift * d).toFixed(1)}px,0)`; }
    }
    const active = rail.reduce((best, li, i) => p >= +li.dataset.at - .05 ? i : best, 0);
    rail.forEach((li, i) => li.classList.toggle('on', i === active));
    if (hint) hint.style.opacity = p > .03 ? 0 : 1;
  }

  const foot = document.getElementById('siteFoot');
  function updatePage() {
    if (foot) { const r = foot.getBoundingClientRect(); foot.style.setProperty('--reveal', clamp((innerHeight - r.top) / Math.max(1, r.height)).toFixed(3)); }
    topbar.classList.toggle('scrolled', scrollY > 20);
    topbar.classList.toggle('light', lightBands.some(b => { const r = b.getBoundingClientRect(); return r.top <= 40 && r.bottom >= 40; }));
    if (reduce) return;
    const mid = innerHeight / 2;
    for (const el of floaters) { const r = el.getBoundingClientRect(); if (r.bottom < -200 || r.top > innerHeight + 200) continue; el.style.transform = `translate3d(0,${((r.top + r.height / 2 - mid) * +el.dataset.speed * .5).toFixed(1)}px,0)`; }
  }
  addEventListener('scroll', () => { target = storyProgress(); updatePage(); }, { passive: true });
  updatePage(); updateChapters(cur);

  // Billing period toggle
  document.querySelectorAll('[data-billing]').forEach(b => b.addEventListener('click', () => {
    const yearly = b.dataset.billing === 'yearly';
    document.querySelectorAll('[data-billing]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('[data-monthly]').forEach(el => { el.textContent = yearly ? el.dataset.yearly : el.dataset.monthly; });
    document.querySelectorAll('[data-monthly-note]').forEach(el => { el.textContent = yearly ? el.dataset.yearlyNote : el.dataset.monthlyNote; });
  }));

  // ---------- Editable content (admin panel → /api/site) ----------
  const escHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const richText = v => escHtml(v).replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  function applyContent(c) {
    document.querySelectorAll('[data-cms]').forEach(el => { const v = c[el.dataset.cms]; if (typeof v === 'string' && v.trim()) el.innerHTML = richText(v); });
    const ann = document.querySelector('[data-cms-announce]');
    if (ann && c.announcement && c.announcement.trim()) { ann.hidden = false; if (c.announcement_link) ann.setAttribute('href', c.announcement_link); }
    document.querySelectorAll('[data-cms-price]').forEach(el => { const k = el.dataset.cmsPrice; if (c[`price_${k}_monthly`]) el.dataset.monthly = c[`price_${k}_monthly`]; if (c[`price_${k}_yearly`]) el.dataset.yearly = c[`price_${k}_yearly`]; const yearly = document.querySelector('[data-billing="yearly"]')?.getAttribute('aria-pressed') === 'true'; el.textContent = yearly ? el.dataset.yearly : el.dataset.monthly; });
    const contact = document.querySelector('[data-cms-contact]');
    if (contact && (c.contact_email || c.contact_phone)) { contact.hidden = false; contact.innerHTML = 'Doğrudan ulaşın: ' + [c.contact_email && `<a href="mailto:${escHtml(c.contact_email)}">${escHtml(c.contact_email)}</a>`, c.contact_phone && `<a href="tel:${escHtml(c.contact_phone.replace(/[^+0-9]/g, ''))}">${escHtml(c.contact_phone)}</a>`].filter(Boolean).join(' · '); }
  }
  if (!window.BUROS_PREVIEW) fetch('/api/site').then(r => r.ok ? r.json() : null).then(d => d && applyContent(d.content || {})).catch(() => {});

  // ---------- Anonymous counters (no cookies, nothing personal) ----------
  const track = (e, extra = {}) => { if (window.BUROS_PREVIEW) return; try { const body = JSON.stringify({ e, ...extra }); if (!navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }))) fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }); } catch {} };
  try { if (!sessionStorage.getItem('buros-v')) { sessionStorage.setItem('buros-v', '1'); track('visit', { ref: document.referrer || '' }); } } catch { track('visit'); }
  document.addEventListener('click', e => { if (e.target.closest('[data-app="signup"]')) track('signup_click'); });
  const pricing = document.getElementById('fiyat');
  if (pricing && 'IntersectionObserver' in window) { const po = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { track('pricing_view'); po.disconnect(); } }, { threshold: .35 }); po.observe(pricing); }

  // ---------- Demo request: two steps and a confirmation ----------
  const form = document.getElementById('waitlist'), msg = document.getElementById('wl-msg');
  const steps = [...form.querySelectorAll('[data-step]')], dots = [...form.querySelectorAll('.demo-steps span')];
  let started = false;
  const go = n => { steps.forEach(st => { st.hidden = +st.dataset.step !== n; }); dots.forEach((d, i) => { d.classList.toggle('on', i < n); }); form.dataset.at = n; const f = steps[n - 1].querySelector('input:not([type=radio]),textarea,a,button'); if (n > 1) f?.focus({ preventScroll: true }); };
  const fail = (text, el) => { msg.textContent = text; msg.classList.add('error'); el?.focus(); };
  form.addEventListener('focusin', () => { if (!started) { started = true; track('demo_start'); } });
  form.querySelector('[data-next]').addEventListener('click', () => {
    msg.textContent = ''; msg.classList.remove('error');
    if (!form.name.value.trim()) return fail('Adınızı yazın.', form.name);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) return fail('Geçerli bir iş e-postası yazın.', form.email);
    go(2);
  });
  form.querySelector('[data-back]').addEventListener('click', () => go(1));
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && form.dataset.at !== '2' && e.target.tagName === 'INPUT') { e.preventDefault(); form.querySelector('[data-next]').click(); } });
  document.querySelectorAll('[data-interest]').forEach(a => a.addEventListener('click', () => { const r = form.querySelector(`input[name="plan"][value="${a.dataset.interest}"]`); if (r) r.checked = true; }));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.dataset.at !== '2') return form.querySelector('[data-next]').click();
    msg.textContent = ''; msg.classList.remove('error');
    const v = Object.fromEntries(new FormData(form));
    if (v.phone && !/^[+0-9 ()-]{7,30}$/.test(v.phone)) return fail('Telefon numarası geçersiz.', form.phone);
    const done = () => { form.querySelector('[data-done-name]').textContent = v.name ? ', ' + v.name.trim().split(' ')[0] : ''; go(3); form.classList.add('sent'); };
    if (window.BUROS_PREVIEW) { try { const saved = JSON.parse(localStorage.getItem('buros-waitlist') || '[]'); saved.push(v); localStorage.setItem('buros-waitlist', JSON.stringify(saved)); } catch {} return done(); }
    const button = form.querySelector('button[type=submit]'); button.disabled = true; button.classList.add('busy');
    try {
      const r = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Kaydedilemedi.');
      done();
    } catch (err) { fail(err.message === 'Kaydedilemedi.' ? 'Gönderilemedi. Birazdan tekrar deneyin.' : err.message); }
    finally { button.disabled = false; button.classList.remove('busy'); }
  });

  // ---------- Live product preview in the demo section ----------
  const live = document.querySelector('.live');
  if (live) {
    const play = () => {
      live.classList.add('play');
      live.querySelectorAll('[data-count]').forEach(el => { const to = +el.dataset.count; if (reduce) { el.textContent = to; return; } const t0 = performance.now(); const tick = t => { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      if (reduce) return;
      live.querySelectorAll('.live-state').forEach((el, i) => setTimeout(() => { el.classList.add('flip'); setTimeout(() => { el.textContent = el.dataset.to; el.classList.add('done'); el.classList.remove('flip'); }, 220); }, 1600 + i * 900));
    };
    if ('IntersectionObserver' in window) { const lo = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { play(); lo.disconnect(); } }, { threshold: .4 }); lo.observe(live); } else play();
  }

  // ---------- Footer: night skyline that fills the screen at the end of the page ----------
  (function footScene() {
    const scene = document.getElementById('footScene'); if (!scene) return;
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const W = 1600, H = 600, NS = 'http://www.w3.org/2000/svg';
    const layer = (cls, count, minH, maxH, lit, crane) => {
      const svg = scene.querySelector('.fs-layer.' + cls); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      let x = -20, out = '', wins = '';
      while (x < W + 20) {
        const w = 40 + rnd() * (cls === 'near' ? 110 : 80), h = minH + rnd() * (maxH - minH), top = H - h, slant = rnd() < .55 ? Math.min(w * .35, 34) : 0, left = rnd() < .5;
        out += `<path d="M${x.toFixed(1)} ${H}V${(top + (left ? slant : 0)).toFixed(1)}L${(x + w).toFixed(1)} ${(top + (left ? 0 : slant)).toFixed(1)}V${H}Z"/>`;
        if (lit) { for (let fy = top + slant + 14; fy < H - 18; fy += 16) for (let fx = x + 8; fx < x + w - 10; fx += 12) if (rnd() < lit) wins += `<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="5" height="7"${rnd() < .12 ? ` class="tw" style="animation-delay:${(rnd() * 6).toFixed(2)}s"` : ''}/>`; }
        x += w + (cls === 'far' ? 2 : 6 + rnd() * 14);
      }
      let extra = '';
      if (crane) { const cx = W * crane, base = H, top = H - maxH - 120; extra = `<g class="crane"><path d="M${cx} ${base}V${top}M${cx - 8} ${base}V${top + 12}M${cx - 140} ${top + 8}H${cx + 260}M${cx} ${top - 24}L${cx - 140} ${top + 8}M${cx} ${top - 24}L${cx + 260} ${top + 8}M${cx + 170} ${top + 8}V${top + 150}"/><rect x="${cx + 160}" y="${top + 150}" width="20" height="12"/><rect x="${cx - 150}" y="${top + 8}" width="36" height="22"/></g><circle class="beacon" cx="${cx}" cy="${top - 28}" r="4"/>`; }
      svg.innerHTML = `<g class="blocks">${out}</g>${extra}<g class="wins">${wins}</g>`;
    };
    layer('far', 0, 120, 300, 0, 0); layer('mid', 0, 90, 250, .07, .72); layer('near', 0, 50, 170, .16, 0);
    const stars = scene.querySelector('.fs-stars'); let st = '';
    for (let i = 0; i < 90; i++) st += `<i style="left:${(rnd() * 100).toFixed(2)}%;top:${(rnd() * 55).toFixed(2)}%;animation-delay:${(rnd() * 5).toFixed(2)}s;opacity:${(.25 + rnd() * .6).toFixed(2)}"></i>`;
    stars.innerHTML = st;
  })();

  // ---------- Three.js scene ----------
  const canvas = document.getElementById('scene');
  let renderer;
  try { if (!window.THREE) throw 0; renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch { document.documentElement.classList.add('no-webgl'); canvas.remove(); loopText(); return; }
  function loopText() { let last = performance.now(); const tick = now => { const dt = Math.min(.1, (now - last) / 1000 || 0); last = now; cur += (target - cur) * (reduce ? 1 : 1 - Math.exp(-dt * 5)); updateChapters(cur); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }

  const small = innerWidth < 700;
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  const NIGHT = new THREE.Color(0x0e1511), DUSK = new THREE.Color(0x141f19);
  renderer.setClearColor(NIGHT);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(NIGHT.clone(), 38, 150);
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 500);

  scene.add(new THREE.HemisphereLight(0xc9d3c0, 0x0b120d, .75));
  const sun = new THREE.DirectionalLight(0xf4f2ea, .7); sun.position.set(30, 40, 14); scene.add(sun);

  const LIME = 0xadbe8e, RUST = 0x7d887f, WARM = 0xe9e4cf; // brand sage, neutral steel, cream
  let seed = 7; const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // Ground, drawing sheet and grid
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x111c15 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(240, 80, LIME, LIME); grid.material.transparent = true; grid.material.opacity = .07; grid.position.y = .01; scene.add(grid);
  const sheetPts = [[-9, -7], [9, -7], [9, 7], [-9, 7], [-9, -7]].map(([x, z]) => new THREE.Vector3(x, .02, z));
  const sheetMat = new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: .5 });
  const sheet = new THREE.Line(new THREE.BufferGeometry().setFromPoints(sheetPts), sheetMat); scene.add(sheet);
  const ticks = []; for (let i = -8; i <= 8; i += 2) ticks.push(new THREE.Vector3(i, .02, -7), new THREE.Vector3(i, .02, -7.5), new THREE.Vector3(-9, .02, i * .8), new THREE.Vector3(-9.5, .02, i * .8));
  const tickLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), sheetMat); scene.add(tickLines);

  const edgeMat = new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: .32 });
  const facadeMats = [0x17241b, 0x1c2b21, 0x1a2620, 0x202f25].map(c => new THREE.MeshLambertMaterial({ color: c }));
  const winGeo = new THREE.PlaneGeometry(.26, .34);
  const windows = [];
  const faces = [[0, 1, 0], [Math.PI, -1, 0], [Math.PI / 2, 0, 1], [-Math.PI / 2, 0, -1]];
  function addWindows(x, z, w, d, floors, fh, list, y0 = 0) {
    for (let f = 0; f < floors; f++) for (const [rot, sx, sz] of faces) {
      const len = sx ? w : d, cols = Math.max(1, Math.floor(len / .62));
      for (let c = 0; c < cols; c++) {
        const off = (c + .5) / cols * len - len / 2, y = y0 + f * fh + fh * .55;
        const px = sx ? x + off : x + (sz > 0 ? w / 2 + .01 : -w / 2 - .01), pz = sx ? z + (sx > 0 ? d / 2 + .01 : -d / 2 - .01) : z + off;
        list.push({ x: px, y, z: pz, rot: sx ? rot : rot, r: rand() });
      }
    }
  }

  // City around the hero site
  const buildings = [];
  const R = small ? 4 : 6, S = 6.4;
  for (let gx = -R; gx <= R; gx++) for (let gz = -R; gz <= R; gz++) {
    if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue;
    if (rand() < .18) continue;
    const dist = Math.hypot(gx, gz), w = 2 + rand() * 2.2, d = 2 + rand() * 2.2;
    const floors = Math.max(2, Math.round((3 + rand() * 9) * (1.15 - dist / (R * 1.6)))), fh = .78, h = floors * fh;
    const x = gx * S + (rand() - .5) * 1.4, z = gz * S + (rand() - .5) * 1.4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMats[Math.floor(rand() * 4)]);
    mesh.position.set(x, h / 2, z); scene.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat); edges.position.copy(mesh.position); scene.add(edges);
    addWindows(x, z, w, d, floors, fh, windows);
    buildings.push({ x, z, h, gx, gz });
  }
  windows.sort((a, b) => a.r - b.r);
  const litMat = new THREE.MeshBasicMaterial({ color: WARM, fog: true });
  const cityLit = new THREE.InstancedMesh(winGeo, litMat, windows.length);
  const tmp = new THREE.Object3D();
  windows.forEach((w, i) => { tmp.position.set(w.x, w.y, w.z); tmp.rotation.set(0, w.rot, 0); tmp.updateMatrix(); cityLit.setMatrixAt(i, tmp.matrix); });
  scene.add(cityLit);

  // Hero building rises floor by floor
  const HERO = { w: 4.2, d: 3.2, floors: 9, fh: .82 };
  const heroFloors = [], heroWindows = [];
  for (let f = 0; f < HERO.floors; f++) {
    const g = new THREE.BoxGeometry(HERO.w, HERO.fh * .96, HERO.d); g.translate(0, HERO.fh * .48, 0);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: f % 2 ? 0x223226 : 0x1f2e23 }));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: .7 }));
    const grp = new THREE.Group(); grp.add(m, e); grp.position.y = f * HERO.fh; scene.add(grp); heroFloors.push(grp);
  }
  const ghostGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(HERO.w, HERO.floors * HERO.fh, HERO.d));
  const ghostMat = new THREE.LineDashedMaterial({ color: LIME, dashSize: .25, gapSize: .18, transparent: true, opacity: .55 });
  const ghost = new THREE.LineSegments(ghostGeo, ghostMat); ghost.computeLineDistances(); ghost.position.y = HERO.floors * HERO.fh / 2; scene.add(ghost);
  addWindows(0, 0, HERO.w, HERO.d, HERO.floors, HERO.fh, heroWindows);
  heroWindows.sort((a, b) => a.y - b.y || a.r - b.r);
  const heroLit = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ color: 0xf7f4e6 }), heroWindows.length);
  heroWindows.forEach((w, i) => { tmp.position.set(w.x, w.y, w.z); tmp.rotation.set(0, w.rot, 0); tmp.updateMatrix(); heroLit.setMatrixAt(i, tmp.matrix); });
  scene.add(heroLit);

  // Tower crane
  const crane = new THREE.Group(); crane.position.set(-3.6, 0, -2.9); scene.add(crane);
  const craneMat = new THREE.MeshLambertMaterial({ color: 0x46524a });
  const mastH = HERO.floors * HERO.fh + 3.4;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(.22, mastH, .22), craneMat); mast.position.y = mastH / 2; crane.add(mast);
  const lattice = []; for (let y = 0; y < mastH - .4; y += .45) lattice.push(new THREE.Vector3(-.13, y, .12), new THREE.Vector3(.13, y + .45, .12), new THREE.Vector3(.13, y, -.12), new THREE.Vector3(-.13, y + .45, -.12));
  crane.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lattice), new THREE.LineBasicMaterial({ color: 0x6f7d73 })));
  const jib = new THREE.Group(); jib.position.y = mastH; crane.add(jib);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(11, .16, .18), craneMat); arm.position.x = -3.4; jib.add(arm);
  const cw = new THREE.Mesh(new THREE.BoxGeometry(.9, .5, .5), new THREE.MeshLambertMaterial({ color: 0x2c3530 })); cw.position.set(1.7, -.2, 0); jib.add(cw);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(.5, .4, .45), new THREE.MeshLambertMaterial({ color: 0xcfd5c8 })); cab.position.set(.1, -.35, .3); jib.add(cab);
  jib.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(-8.6, .05, 0), new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(1.9, .05, 0)]), new THREE.LineBasicMaterial({ color: 0x6f7d73 })));
  const hookLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6, 0, 0), new THREE.Vector3(-6, -3, 0)]), new THREE.LineBasicMaterial({ color: 0x8e9990 })); jib.add(hookLine);
  const load = new THREE.Mesh(new THREE.BoxGeometry(.9, .18, .5), new THREE.MeshLambertMaterial({ color: 0xadbe8e })); jib.add(load);

  // Office node and the two networks: tangled (problem) and ordered tree (solution)
  const office = new THREE.Mesh(new THREE.OctahedronGeometry(.9), new THREE.MeshBasicMaterial({ color: LIME, transparent: true })); office.position.set(0, 20, 0); scene.add(office);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.5, 48), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, side: THREE.DoubleSide })); halo.rotation.x = -Math.PI / 2; halo.position.copy(office.position); scene.add(halo);
  const chaosPts = [], orderPts = [], hubs = [[-14, 11, -10], [15, 11, -8], [-10, 11, 14], [13, 11, 13]].map(a => new THREE.Vector3(...a));
  const net = buildings.filter((_, i) => i % 2 === 0);
  for (const b of net) {
    const top = new THREE.Vector3(b.x, b.h + .05, b.z);
    const mid = new THREE.Vector3((rand() - .5) * 60, 6 + rand() * 22, (rand() - .5) * 60);
    const curve = new THREE.QuadraticBezierCurve3(office.position.clone(), mid, top).getPoints(24);
    for (let i = 0; i < curve.length - 1; i++) chaosPts.push(curve[i], curve[i + 1]);
    const hub = hubs[(b.gx < 0 ? 0 : 1) + (b.gz < 0 ? 0 : 2)];
    const bend = new THREE.Vector3(b.x, hub.y, b.z);
    orderPts.push(office.position.clone(), new THREE.Vector3(hub.x, office.position.y, hub.z), new THREE.Vector3(hub.x, office.position.y, hub.z), hub.clone(), hub.clone(), bend, bend, top);
  }
  const chaos = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(chaosPts), new THREE.LineBasicMaterial({ color: RUST, transparent: true, opacity: 0 })); scene.add(chaos);
  const order = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(orderPts), new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0 })); scene.add(order);
  const hubMeshes = hubs.map(h => { const m = new THREE.Mesh(new THREE.BoxGeometry(.9, .9, .9), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0 })); m.position.copy(h); scene.add(m); return m; });

  // Dust for depth
  const dustN = small ? 500 : 1100, dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (rand() - .5) * 90; dustPos[i * 3 + 1] = rand() * 30; dustPos[i * 3 + 2] = (rand() - .5) * 90; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: LIME, size: .06, transparent: true, opacity: .22, depthWrite: false })); scene.add(dust);

  // Camera keyframes: close on the sheet → building rises → zoom out on the city → top view of the tree → zoom in on site → aerial dusk
  const K = [
    { p: 0, pos: [3.4, 1.3, 4.6], tgt: [0, 1.3, 0], fov: 30 },
    { p: .14, pos: [6.2, 3.4, 8.2], tgt: [0, 2.8, 0], fov: 33 },
    { p: .3, pos: [11, 7.5, 14], tgt: [0, 3.6, 0], fov: 35 },
    { p: .46, pos: [38, 30, 44], tgt: [0, 4, 0], fov: 40 },
    { p: .61, pos: [3, 70, 8], tgt: [0, 0, 0], fov: 42 },
    { p: .75, pos: [7.4, 4.6, 8.6], tgt: [.4, 4.4, 0], fov: 33 },
    { p: .87, pos: [10, 7.5, -7], tgt: [0, 4.4, 0], fov: 35 },
    { p: 1, pos: [52, 26, -34], tgt: [0, 3, 0], fov: 38 }
  ].map(k => ({ ...k, pos: new THREE.Vector3(...k.pos), tgt: new THREE.Vector3(...k.tgt) }));
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), look = new THREE.Vector3();
  function cameraAt(p) {
    let i = 0; while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i], b = K[i + 1], t = ease(clamp((p - a.p) / (b.p - a.p)));
    camPos.lerpVectors(a.pos, b.pos, t); camTgt.lerpVectors(a.tgt, b.tgt, t);
    return a.fov + (b.fov - a.fov) * t;
  }

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!reduce) addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth - .5; pointer.y = e.clientY / innerHeight - .5; }, { passive: true });

  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(story);
  const clock = new THREE.Clock();
  const fogColor = new THREE.Color();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(.1, clock.getDelta());
    cur += (target - cur) * (reduce ? 1 : 1 - Math.exp(-dt * 5));
    updateChapters(cur);
    if (!visible) return;
    const p = cur, time = clock.elapsedTime;

    // Building: rises between 4% and 30%; wireframe ghost fades as floors complete
    const build = smooth(.03, .3, p);
    heroFloors.forEach((g, i) => { const s = clamp(build * HERO.floors - i); g.visible = s > 0; g.scale.y = Math.max(.001, s); g.children[1].material.opacity = .25 + .5 * (1 - s); });
    ghostMat.opacity = .6 * (1 - smooth(.22, .34, p)) + .12;
    sheetMat.opacity = .55 * (1 - smooth(.3, .45, p)) + .08;

    // Lights: a few city windows at first, the site lights up in chapter 5, all at the end
    cityLit.count = Math.floor(windows.length * (.12 + .25 * smooth(.3, .5, p) + .63 * smooth(.86, 1, p)));
    heroLit.count = Math.floor(heroWindows.length * (build * .15 + .85 * smooth(.7, .84, p)));

    // Networks
    const chaosO = bump(p, .34, .41, .5, .57), orderO = bump(p, .52, .59, .72, .8);
    chaos.material.opacity = chaosO * .7; order.material.opacity = orderO * .9;
    office.material.opacity = Math.max(chaosO, orderO); halo.material.opacity = office.material.opacity * .5;
    office.visible = halo.visible = office.material.opacity > .01;
    hubMeshes.forEach(m => { m.material.opacity = orderO; m.visible = orderO > .01; });
    office.rotation.y = time * .6; halo.scale.setScalar(1 + Math.sin(time * 2) * .08);
    if (chaosO > 0 && !reduce) chaos.rotation.y = Math.sin(time * .4) * .015;

    // Crane
    jib.rotation.y = reduce ? 2.4 : 2.4 + Math.sin(time * .25) * .5;
    const hookY = -2.2 - Math.sin(time * .5) * .8, hookPos = hookLine.geometry.attributes.position; hookPos.setY(1, hookY); hookPos.needsUpdate = true; load.position.set(-6, hookY - .1, 0);

    // Dusk tint at the end
    const dusk = smooth(.86, 1, p); fogColor.copy(NIGHT).lerp(DUSK, dusk); scene.fog.color.copy(fogColor); renderer.setClearColor(fogColor);
    dust.rotation.y = time * .01; dust.material.opacity = .25 + .3 * (1 - dusk);

    camera.fov = cameraAt(p) * (camera.aspect < 1 ? Math.min(1.8, .9 / camera.aspect) : 1);
    pointer.sx += (pointer.x - pointer.sx) * .05; pointer.sy += (pointer.y - pointer.sy) * .05;
    const drift = camPos.distanceTo(camTgt) * .035;
    camera.position.set(camPos.x + pointer.sx * drift * 2, camPos.y - pointer.sy * drift, camPos.z);
    look.copy(camTgt); camera.lookAt(look); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  frame();
})();
