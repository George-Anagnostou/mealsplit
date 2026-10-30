import { computeSplit, computeTip, toCents, fmt, dollars, UNASSIGNED } from './split.js';
import { parseReceipt } from './parser.js';
import { venmoWebLink, venmoAppLink, billNote, shareMessage, zelleMessage, smsLink, groupSummary, cleanVenmo } from './links.js';

const KEY = 'mealsplit.v1';
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const newBill = () => ({ title: '', date: todayISO(), raw: '', items: [], taxC: 0, feesC: 0, discountC: 0, tipMode: 'pct', tipPct: 0, tipAmtC: 0, feesEven: false, here: [], parsedTotalC: null });
const defaults = () => ({ me: { name: 'George', venmo: '', contact: '' }, people: [], bill: newBill() });

let S;
try { S = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; S.bill = { ...newBill(), ...S.bill }; } catch { S = defaults(); }
const ui = { tab: 'receipt', sel: null, editing: null };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

// ---------- helpers ----------
const B = () => S.bill;
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initials = (n) => (String(n).trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase();
const av = (n, cls = '') => `<span class="av ${cls}" style="background:hsl(${hue(n)} 55% 46%)">${esc(initials(n))}</span>`;
const parties = () => [{ id: 'me', name: S.me.name || 'Me', me: true }, ...S.people.filter((p) => B().here.includes(p.id))];
const nameOf = (id) => (id === 'me' ? S.me.name || 'Me' : S.people.find((p) => p.id === id)?.name || '?');
const subtotalC = () => B().items.reduce((a, i) => a + (i.cents || 0), 0);
const tipC = () => computeTip(subtotalC(), B().tipMode, B().tipPct, B().tipAmtC);
const note = () => billNote(B().title || 'Dinner', B().date);
const opts = () => ({ taxC: B().taxC, tipC: tipC(), feesC: B().feesC, discountC: B().discountC, feesEven: B().feesEven });
const compute = () => computeSplit(B().items.map((i) => ({ cents: i.cents, who: i.who.filter((id) => id === 'me' || B().here.includes(id)) })), opts());

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 1800); }
async function copy(text, msg = 'Copied') {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = 0; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove(); }
  toast(msg);
}

// ---------- tabs ----------
function setTab(t) {
  ui.tab = t;
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${t}`));
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'assign') renderAssign();
  if (t === 'split') renderSplit();
  if (t === 'people') renderFriends();
  $('#picker').hidden = t !== 'assign' || ui.sel == null;
  window.scrollTo(0, 0);
}
$('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });

// ---------- receipt tab ----------
function renderItemsEdit() {
  $('#itemsEdit').innerHTML = B().items.length
    ? B().items.map((it, i) => `<div class="itemrow" data-i="${i}">
        <input class="nm" value="${esc(it.name)}" placeholder="Item" aria-label="Item name">
        <input class="price" value="${it.cents ? dollars(it.cents) : ''}" inputmode="decimal" placeholder="0.00" aria-label="Price">
        <button class="x ghost" aria-label="Remove item">✕</button></div>`).join('')
    : '<p class="hint">No items yet. Paste or scan a receipt, or add items by hand.</p>';
}
function renderTotalsInputs() {
  const b = B();
  $('#title').value = b.title; $('#date').value = b.date; $('#raw').value = b.raw;
  $('#tax').value = b.taxC ? dollars(b.taxC) : ''; $('#fees').value = b.feesC ? dollars(b.feesC) : ''; $('#discount').value = b.discountC ? dollars(b.discountC) : '';
  $('#tip').value = b.tipMode === 'pct' ? (b.tipPct || '') : (b.tipAmtC ? dollars(b.tipAmtC) : '');
  $('#tip').placeholder = b.tipMode === 'pct' ? '20' : '0.00';
  document.querySelectorAll('#tipMode button').forEach((x) => x.classList.toggle('on', x.dataset.mode === b.tipMode));
  $('#feesEven').checked = b.feesEven;
}
function renderTotals() {
  const b = B(), sub = subtotalC(), tip = tipC();
  const total = sub + b.taxC + tip + b.feesC - b.discountC;
  let rec = '';
  if (b.parsedTotalC != null) {
    const d = total - b.parsedTotalC;
    rec = d === 0 ? `<div class="ok"><span>Receipt total</span><span>${fmt(b.parsedTotalC)} ✓</span></div>`
      : `<div class="bad"><span>Receipt says ${fmt(b.parsedTotalC)}</span><span>off by ${fmt(d)}</span></div>`;
  }
  $('#totalsBox').innerHTML = `<div><span>Items subtotal</span><span>${fmt(sub)}</span></div>
    <div><span>Tax</span><span>${fmt(b.taxC)}</span></div>
    <div><span>Tip${b.tipMode === 'pct' ? ` (${b.tipPct || 0}%)` : ''}</span><span>${fmt(tip)}</span></div>
    <div><span>Fees</span><span>${fmt(b.feesC)}</span></div>
    ${b.discountC ? `<div><span>Discount</span><span>-${fmt(b.discountC)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${fmt(total)}</span></div>${rec}`;
}
function applyParsed(p) {
  const b = B();
  b.items = p.items.map((i) => ({ id: uid(), name: i.name, cents: i.cents, who: [] }));
  b.taxC = p.taxC; b.feesC = p.feesC; b.discountC = p.discountC; b.parsedTotalC = p.totalC;
  if (p.hasTip) { b.tipMode = 'amt'; b.tipAmtC = p.tipC; }
  ui.sel = null;
  const w = $('#parseWarn'); w.hidden = !p.warnings.length; w.textContent = p.warnings.join(' ');
  renderTotalsInputs(); renderItemsEdit(); renderTotals(); save();
  toast(`${p.items.length} item${p.items.length === 1 ? '' : 's'} found`);
}
$('#parseBtn').onclick = () => { B().raw = $('#raw').value; applyParsed(parseReceipt(B().raw)); };
$('#raw').addEventListener('input', (e) => { B().raw = e.target.value; save(); });
$('#title').addEventListener('input', (e) => { B().title = e.target.value; save(); });
$('#date').addEventListener('input', (e) => { B().date = e.target.value; save(); });
$('#exampleBtn').onclick = () => {
  B().raw = `Order from Chipotle\n1x Burrito Bowl - Chicken   $11.95\n2x Chips & Guacamole   $8.90\n1x Kids Quesadilla   $5.45\n1x Fountain Drink   $2.99\n1x Tacos (3)   $10.50\nSubtotal   $39.79\nDelivery Fee   $1.99\nService Fee   $4.40\nEstimated Tax   $3.62\nPromo   -$5.00\nDasher Tip   $5.00\nTotal   $49.80`;
  if (!B().title) B().title = 'Burritos';
  renderTotalsInputs(); $('#parseBtn').click();
};
$('#addItem').onclick = () => { B().items.push({ id: uid(), name: '', cents: 0, who: [] }); renderItemsEdit(); renderTotals(); save(); const r = [...document.querySelectorAll('.itemrow .nm')].pop(); r?.focus(); };
$('#itemsEdit').addEventListener('input', (e) => {
  const row = e.target.closest('.itemrow'); if (!row) return; const it = B().items[+row.dataset.i];
  if (e.target.classList.contains('nm')) it.name = e.target.value; else it.cents = toCents(e.target.value);
  renderTotals(); save();
});
$('#itemsEdit').addEventListener('click', (e) => {
  const x = e.target.closest('.x'); if (!x) return;
  B().items.splice(+x.closest('.itemrow').dataset.i, 1); ui.sel = null; renderItemsEdit(); renderTotals(); save();
});
const moneyInput = (id, key) => $(id).addEventListener('input', (e) => { B()[key] = Math.max(0, toCents(e.target.value)); renderTotals(); save(); });
moneyInput('#tax', 'taxC'); moneyInput('#fees', 'feesC'); moneyInput('#discount', 'discountC');
$('#tip').addEventListener('input', (e) => {
  if (B().tipMode === 'pct') B().tipPct = parseFloat(e.target.value) || 0; else B().tipAmtC = Math.max(0, toCents(e.target.value));
  renderTotals(); save();
});
$('#tipMode').addEventListener('click', (e) => {
  const m = e.target.closest('button')?.dataset.mode; if (!m) return; B().tipMode = m; renderTotalsInputs(); renderTotals(); save();
});
$('#feesEven').addEventListener('change', (e) => { B().feesEven = e.target.checked; save(); });
$('#newBill').onclick = () => {
  if (B().items.length && !confirm('Start a new bill? Your friends list is kept.')) return;
  S.bill = newBill(); S.bill.here = []; ui.sel = null; $('#parseWarn').hidden = true; $('#ocrStatus').hidden = true;
  renderAll(); setTab('receipt'); save();
};

// ---------- OCR (tesseract.js loaded on demand from CDN) ----------
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const loadScript = (src) => new Promise((res, rej) => { if (window.Tesseract) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the OCR library. Check your connection.')); document.head.appendChild(s); });
async function prepImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  let w, h, src;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else { src = await new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = URL.createObjectURL(file); }); w = src.naturalWidth; h = src.naturalHeight; }
  const scale = Math.min(2200 / Math.max(w, h), Math.max(1, 1400 / Math.max(w, h)));
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
  // grayscale + contrast stretch helps on phone photos of thermal paper
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data; let lo = 255, hi = 0;
  for (let i = 0; i < px.length; i += 4) { const y = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0; px[i] = y; if (y < lo) lo = y; if (y > hi) hi = y; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) { const y = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span)); px[i] = px[i + 1] = px[i + 2] = y; }
  g.putImageData(d, 0, 0); return c;
}
$('#photo').addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const st = $('#ocrStatus'); st.hidden = false;
  const setSt = (m, p) => (st.innerHTML = `${esc(m)}${p != null ? `<div class="progress"><i style="width:${Math.round(p * 100)}%"></i></div>` : ''}`);
  try {
    setSt('Loading text recognition…', 0.02);
    await loadScript(TESS);
    const canvas = await prepImage(f);
    const worker = await window.Tesseract.createWorker('eng', 1, { logger: (m) => { if (m.status === 'recognizing text') setSt('Reading receipt…', m.progress); else if (m.status) setSt(`${m.status[0].toUpperCase()}${m.status.slice(1)}…`, 0.05); } });
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    await worker.terminate();
    B().raw = data.text; $('#raw').value = data.text;
    applyParsed(parseReceipt(data.text));
    st.textContent = 'Done. OCR can misread digits, so check each item and the totals below.';
  } catch (err) { st.textContent = `Scan failed: ${err.message || err}. You can still paste the text.`; }
  e.target.value = '';
});

// ---------- people tab ----------
function renderFriends() {
  $('#meName').value = S.me.name; $('#meVenmo').value = S.me.venmo; $('#meContact').value = S.me.contact;
  $('#friends').innerHTML = S.people.length ? S.people.map((p) => ui.editing === p.id
    ? `<div class="editbox" data-id="${p.id}"><div class="grid">
        <label>Name<input data-f="name" value="${esc(p.name)}"></label><label>Venmo<input data-f="venmo" value="${esc(p.venmo)}" autocapitalize="none"></label>
        <label class="span">Phone or email<input data-f="contact" value="${esc(p.contact)}"></label></div>
        <div class="btns"><button class="primary small" data-act="done">Done</button><button class="ghost small" data-act="del">Delete</button></div></div>`
    : `<div class="friend" data-id="${p.id}"><input type="checkbox" data-act="here" ${B().here.includes(p.id) ? 'checked' : ''} aria-label="At this meal">
        ${av(p.name)}<div class="info"><div class="nm">${esc(p.name)}</div><div class="sub">${[p.venmo && '@' + esc(cleanVenmo(p.venmo)), esc(p.contact)].filter(Boolean).join(' · ') || 'no payment details'}</div></div>
        <button class="ghost small" data-act="edit">Edit</button></div>`).join('')
    : '<p class="hint">No friends yet. Add some below.</p>';
}
$('#friends').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act; const id = e.target.closest('[data-id]')?.dataset.id; if (!act || !id) return;
  if (act === 'here') { const h = B().here; const i = h.indexOf(id); if (i < 0) h.push(id); else h.splice(i, 1); save(); return; }
  if (act === 'edit') ui.editing = id;
  if (act === 'done') ui.editing = null;
  if (act === 'del') { if (!confirm('Delete this friend?')) return; S.people = S.people.filter((p) => p.id !== id); B().here = B().here.filter((x) => x !== id); B().items.forEach((it) => (it.who = it.who.filter((x) => x !== id))); ui.editing = null; }
  save(); renderFriends();
});
$('#friends').addEventListener('input', (e) => { const f = e.target.dataset.f; const id = e.target.closest('[data-id]')?.dataset.id; const p = S.people.find((x) => x.id === id); if (f && p) { p[f] = e.target.value; save(); } });
$('#addFriend').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = { id: uid(), name: $('#fName').value.trim(), venmo: cleanVenmo($('#fVenmo').value), contact: $('#fContact').value.trim() };
  if (!p.name) return; S.people.push(p); B().here.push(p.id); e.target.reset(); save(); renderFriends(); $('#fName').focus();
});
for (const [id, k] of [['#meName', 'name'], ['#meVenmo', 'venmo'], ['#meContact', 'contact']]) $(id).addEventListener('input', (e) => { S.me[k] = e.target.value; save(); });

// ---------- assign tab ----------
function renderAssign() {
  const ps = parties(); const b = B();
  const un = b.items.filter((i) => !i.who.some((id) => id === 'me' || b.here.includes(id))).length;
  $('#assignBanner').innerHTML = !b.items.length ? '<div class="empty">Add items on the Receipt tab first.</div>'
    : ps.length < 2 ? '<div class="banner warn">Add friends on the People tab and tick who’s here.</div>'
    : un ? `<div class="banner warn">${un} item${un > 1 ? 's' : ''} not assigned yet. Tap an item, then tap who had it.</div>`
    : '<div class="banner">Everything is assigned ✓ Head to Split.</div>';
  $('#assignList').innerHTML = b.items.map((it, i) => {
    const who = it.who.filter((id) => id === 'me' || b.here.includes(id));
    return `<div class="arow ${ui.sel === i ? 'sel' : ''} ${who.length ? '' : 'none'}" data-i="${i}">
      <div class="nm">${esc(it.name || 'Item')}</div><div class="who">${who.map((id) => av(nameOf(id), 'sm')).join('')}</div><div class="pr">${fmt(it.cents)}</div></div>`;
  }).join('');
  renderPicker();
}
function renderPicker() {
  const p = $('#picker'); const it = B().items[ui.sel];
  if (ui.tab !== 'assign' || !it) { p.hidden = true; return; }
  const ps = parties();
  const all = ps.every((x) => it.who.includes(x.id));
  p.hidden = false;
  p.innerHTML = `<div class="ph"><b>${esc(it.name || 'Item')} · ${fmt(it.cents)}</b><span><button class="ghost small" data-all="1">${all ? 'None' : 'Everyone'}</button> <button class="primary small" data-next="1">Next ›</button></span></div>
    <div class="chips">${ps.map((x) => `<button class="chip ${it.who.includes(x.id) ? 'on' : ''}" data-id="${x.id}">${av(x.name)}${esc(x.name)}${x.me ? ' (me)' : ''}</button>`).join('')}</div>`;
}
$('#assignList').addEventListener('click', (e) => { const r = e.target.closest('.arow'); if (!r) return; ui.sel = ui.sel === +r.dataset.i ? null : +r.dataset.i; renderAssign(); });
$('#picker').addEventListener('click', (e) => {
  const it = B().items[ui.sel]; if (!it) return;
  const chip = e.target.closest('.chip');
  if (chip) { const i = it.who.indexOf(chip.dataset.id); if (i < 0) it.who.push(chip.dataset.id); else it.who.splice(i, 1); }
  else if (e.target.closest('[data-all]')) { const ps = parties(); it.who = ps.every((x) => it.who.includes(x.id)) ? [] : ps.map((x) => x.id); }
  else if (e.target.closest('[data-next]')) { ui.sel = ui.sel + 1 < B().items.length ? ui.sel + 1 : null; }
  save(); renderAssign();
  if (e.target.closest('[data-next]') && ui.sel != null) document.querySelector('.arow.sel')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
$('#allEveryone').onclick = () => { const ids = parties().map((p) => p.id); B().items.forEach((i) => (i.who = [...ids])); save(); renderAssign(); };
$('#clearAssign').onclick = () => { B().items.forEach((i) => (i.who = [])); ui.sel = null; save(); renderAssign(); };

// ---------- split tab ----------
function renderSplit() {
  const b = B(); const r = compute(); const n = note(); const out = [];
  if (!b.items.length) { $('#splitOut').innerHTML = '<div class="empty">Nothing to split yet. Start on the Receipt tab.</div>'; return; }
  const un = r.parties[UNASSIGNED];
  if (un) out.push(`<div class="banner warn">${un.count} item${un.count > 1 ? 's' : ''} (${fmt(un.totalC)} with tax/tip) still unassigned.</div>`);
  const friends = parties().filter((p) => !p.me && r.parties[p.id]);
  const rows = friends.map((p) => ({ name: p.name, ...r.parties[p.id] }));
  const meP = r.parties.me; const meRow = meP ? { name: S.me.name || 'Me', ...meP } : null;
  out.push(`<div class="btns" style="margin-top:4px"><button class="primary grow" id="copySummary" style="flex:1">Copy summary for the group</button></div>`);
  for (const p of friends) {
    const x = r.parties[p.id]; const person = S.people.find((q) => q.id === p.id);
    out.push(card(p.name, x, person, n, false));
  }
  if (meRow) out.push(card(meRow.name + ' (me)', meP, null, n, true));
  const reconOk = r.totalC === r.expectedTotalC;
  out.push(`<div class="recon ${reconOk ? 'ok' : 'bad'}">Shares add up to <b>${fmt(r.totalC)}</b> · receipt total <b>${fmt(r.expectedTotalC)}</b> ${reconOk ? '✓' : '⚠'}</div>`);
  $('#splitOut').innerHTML = out.join('');
  $('#copySummary')?.addEventListener('click', () => copy(groupSummary({ note: n, totalC: r.expectedTotalC, rows, meRow }), 'Summary copied'));
}
function card(name, x, person, n, isMe) {
  const lines = x.items.map((l) => { const it = B().items[l.index]; return `<div><span>${esc(it?.name || 'Item')}${l.of > 1 ? ` <small>(1/${l.of})</small>` : ''}</span><span>${fmt(l.shareC)}</span></div>`; }).join('');
  const extra = [['Tax', x.taxC], ['Tip', x.tipC], ['Fees', x.feesC], ['Discount', x.discountC]].filter(([, v]) => v).map(([k, v]) => `<div class="sep0"><span>${k}</span><span>${fmt(v)}</span></div>`).join('');
  let btns = '';
  if (!isMe && person) {
    const msg = shareMessage({ name: person.name, cents: x.totalC, note: n, me: S.me });
    const zel = zelleMessage({ name: person.name, cents: x.totalC, note: n, me: S.me });
    const web = venmoWebLink({ username: person.venmo, cents: x.totalC, note: n });
    const app = venmoAppLink({ username: person.venmo, cents: x.totalC, note: n });
    btns = `<div class="btns">
      <a class="btn venmo grow" href="${esc(web)}" rel="noopener">Request on Venmo</a>
      <a class="btn grow" href="${esc(smsLink({ to: person.contact, body: msg }))}">Text · Apple Cash</a>
      <button class="grow" data-copy="${esc(zel)}" data-msg="Zelle text copied">Copy · Zelle</button>
      <button class="ghost grow" data-copy="${esc(msg)}" data-msg="Message copied">Copy message</button></div>
      <div class="mini">${person.venmo ? '' : 'No Venmo username saved, so you’ll pick the person in Venmo. '}<a href="${esc(app)}">Venmo app link</a></div>`;
  }
  return `<div class="card pcard ${isMe ? 'me' : ''}"><h3>${av(name)}${esc(name)}<span class="big">${fmt(x.totalC)}</span></h3>
    <div class="lines">${lines}${extra.replace(/class="sep0"/, 'class="sep"')}</div>${btns}</div>`;
}
$('#splitOut').addEventListener('click', (e) => { const c = e.target.closest('[data-copy]'); if (c) copy(c.dataset.copy, c.dataset.msg); });

// ---------- init ----------
function renderAll() { renderTotalsInputs(); renderItemsEdit(); renderTotals(); renderFriends(); }
renderAll(); setTab('receipt');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__mealsplit = { S, ui, setTab }; // handy for debugging / screenshots
