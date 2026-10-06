'use strict';

/* =========================================================================
   Sportverein-App – Verwaltung von Mannschaften, Anlagen und Belegungen
   Daten werden lokal im Browser (localStorage) gespeichert.
   ========================================================================= */

const STORE_KEY = 'sportverein-app/v1';
const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const TYPES = {
  training:      { label: 'Training',            icon: '🏃', color: '#64748b' },
  spiel:         { label: 'Spiel',               icon: '🏆', color: '#dc2626' },
  turnier:       { label: 'Turnier / Lehrgang',  icon: '🥇', color: '#ca8a04' },
  veranstaltung: { label: 'Veranstaltung',       icon: '🎉', color: '#db2777' },
  versammlung:   { label: 'Versammlung',         icon: '🗣️', color: '#0891b2' },
  vermietung:    { label: 'Vermietung',          icon: '🔑', color: '#9333ea' },
  wartung:       { label: 'Platzpflege / Wartung', icon: '🛠️', color: '#78716c' },
  sonstiges:     { label: 'Sonstiges',           icon: '📌', color: '#6366f1' },
};

const KINDS = {
  platz: { label: 'Sportplätze', icon: '🏟️' },
  halle: { label: 'Sporthallen', icon: '🏢' },
  heim:  { label: 'Sportheim',   icon: '🍻' },
};

const DAY_START = 7 * 60;   // Zeitleiste ab 07:00
const DAY_END = 23 * 60;    // bis 23:00

/* ---------- Hilfsfunktionen ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const pad = n => String(n).padStart(2, '0');
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const weekdayOf = k => (fromKey(k).getDay() + 6) % 7 + 1; // 1 = Montag … 7 = Sonntag
const todayKey = () => toKey(new Date());
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtLong = k => fromKey(k).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = k => fromKey(k).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const monthStart = k => k.slice(0, 8) + '01';
const addMonths = (k, n) => { const d = fromKey(monthStart(k)); d.setMonth(d.getMonth() + n); return toKey(d); };

/* ---------- Beispieldaten ---------- */
function demoData() {
  const t = todayKey();
  const wd = weekdayOf(t);
  const next = n => addDays(t, (n - wd + 7) % 7);
  const sat = next(6), sun = next(7), fri = next(5), wed = next(3);
  const units = (prefix, names) => names.map((name, i) => ({ id: `${prefix}-${i + 1}`, name }));

  return {
    version: 1,
    club: { name: 'SV Grün-Weiß 1920 e.V.' },
    teams: [
      { id: 'fb1',   name: '1. Mannschaft', sport: 'Fußball',    icon: '⚽', color: '#16a34a', trainer: 'Thomas Becker', contact: '0171 1234567' },
      { id: 'fb2',   name: '2. Mannschaft', sport: 'Fußball',    icon: '⚽', color: '#0284c7', trainer: 'Stefan Wolf',   contact: '' },
      { id: 'bb',    name: 'Basketball',    sport: 'Basketball', icon: '🏀', color: '#ea580c', trainer: 'Lena Hoffmann', contact: '' },
      { id: 'kendo', name: 'Kendo',         sport: 'Kendo',      icon: '🥋', color: '#7c3aed', trainer: 'Kenji Sato',    contact: '' },
    ],
    facilities: [
      { id: 'p1',   kind: 'platz', icon: '🏟️', name: 'Sportplatz 1', info: 'Rasen, Flutlicht',          units: units('p1', ['Hälfte A', 'Hälfte B']) },
      { id: 'p2',   kind: 'platz', icon: '🏟️', name: 'Sportplatz 2', info: 'Kunstrasen, Flutlicht',     units: units('p2', ['Viertel 1', 'Viertel 2', 'Viertel 3', 'Viertel 4']) },
      { id: 'p3',   kind: 'platz', icon: '🏟️', name: 'Sportplatz 3', info: 'Kleinfeld / Trainingsplatz', units: units('p3', ['Feld A', 'Feld B']) },
      { id: 'h1',   kind: 'halle', icon: '🏢', name: 'Sporthalle 1', info: 'Dreifachhalle',              units: units('h1', ['Feld 1', 'Feld 2', 'Feld 3']) },
      { id: 'h2',   kind: 'halle', icon: '🏢', name: 'Sporthalle 2', info: 'Gymnastik- & Dojohalle',     units: units('h2', ['Feld 1', 'Feld 2']) },
      { id: 'heim', kind: 'heim',  icon: '🍻', name: 'Sportheim',    info: 'Vereinsheim',                units: units('heim', ['Saal', 'Nebenraum', 'Küche', 'Terrasse']) },
    ],
    trainings: [
      { id: 't1', teamId: 'fb1',   weekday: 2, start: '19:00', end: '20:30', facilityId: 'p1', unitIds: ['p1-1', 'p1-2'] },
      { id: 't2', teamId: 'fb1',   weekday: 4, start: '19:00', end: '20:30', facilityId: 'p1', unitIds: ['p1-1', 'p1-2'] },
      { id: 't3', teamId: 'fb2',   weekday: 1, start: '19:00', end: '20:30', facilityId: 'p2', unitIds: ['p2-1', 'p2-2', 'p2-3', 'p2-4'] },
      { id: 't4', teamId: 'fb2',   weekday: 3, start: '19:00', end: '20:30', facilityId: 'p2', unitIds: ['p2-1', 'p2-2'] },
      { id: 't5', teamId: 'bb',    weekday: 1, start: '18:00', end: '20:00', facilityId: 'h1', unitIds: ['h1-1', 'h1-2'] },
      { id: 't6', teamId: 'bb',    weekday: 4, start: '18:30', end: '20:30', facilityId: 'h1', unitIds: ['h1-1', 'h1-2'] },
      { id: 't7', teamId: 'kendo', weekday: 2, start: '19:00', end: '21:00', facilityId: 'h2', unitIds: ['h2-1', 'h2-2'] },
      { id: 't8', teamId: 'kendo', weekday: 5, start: '18:00', end: '20:00', facilityId: 'h2', unitIds: ['h2-1'] },
      { id: 't9', teamId: 'kendo', weekday: 6, start: '10:00', end: '12:00', facilityId: 'h2', unitIds: ['h2-1', 'h2-2'] },
    ],
    events: [
      { id: 'e1', title: 'Heimspiel vs. FC Musterdorf', type: 'spiel', teamId: 'fb1', facilityId: 'p1', unitIds: ['p1-1', 'p1-2'], date: sun, start: '15:00', end: '17:00', note: 'Kreisliga A, 9. Spieltag' },
      { id: 'e2', title: 'Heimspiel vs. TSV Beispielheim II', type: 'spiel', teamId: 'fb2', facilityId: 'p1', unitIds: ['p1-1', 'p1-2'], date: sun, start: '12:45', end: '14:45', note: '' },
      { id: 'e3', title: 'Bewirtung Spieltag', type: 'veranstaltung', teamId: null, facilityId: 'heim', unitIds: ['heim-3', 'heim-4'], date: sun, start: '12:00', end: '19:00', note: 'Kuchenspenden bitte bis Samstag melden' },
      { id: 'e4', title: 'Heimspiel vs. Baskets Nord', type: 'spiel', teamId: 'bb', facilityId: 'h1', unitIds: ['h1-1', 'h1-2', 'h1-3'], date: sat, start: '16:00', end: '18:00', note: '' },
      { id: 'e5', title: 'Vorstandssitzung', type: 'versammlung', teamId: null, facilityId: 'heim', unitIds: ['heim-2'], date: wed, start: '20:00', end: '22:00', note: '' },
      { id: 'e6', title: 'Kendo-Lehrgang', type: 'turnier', teamId: 'kendo', facilityId: 'h2', unitIds: ['h2-1', 'h2-2'], date: addDays(sat, 7), start: '09:00', end: '16:00', note: 'Gastreferent, Anmeldung über Trainer' },
      { id: 'e7', title: 'Geburtstagsfeier (Vermietung)', type: 'vermietung', teamId: null, facilityId: 'heim', unitIds: ['heim-1', 'heim-3'], date: fri, start: '18:00', end: '23:00', note: 'Schlüsselübergabe 17:30' },
      { id: 'e8', title: 'Rasen mähen & abkreiden', type: 'wartung', teamId: null, facilityId: 'p1', unitIds: ['p1-1', 'p1-2'], date: sat, start: '09:00', end: '11:00', note: '' },
    ],
  };
}

/* ---------- Speicher ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.teams) && Array.isArray(d.facilities)) return normalize(d);
    }
  } catch (e) { /* defekte Daten → Beispieldaten */ }
  return demoData();
}
function normalize(d) {
  d.club = d.club || { name: 'Sportverein' };
  d.trainings = d.trainings || [];
  d.events = d.events || [];
  d.facilities.forEach(f => { f.units = f.units || []; });
  return d;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch (e) { toast('⚠️ Speichern fehlgeschlagen'); }
}

let data = load();
const state = {
  date: todayKey(),
  calMode: 'monat',
  calMonth: monthStart(todayKey()),
  teamFilter: '',
  kindFilter: '',
};

/* ---------- Datenzugriff ---------- */
const team = id => data.teams.find(t => t.id === id);
const facility = id => data.facilities.find(f => f.id === id);
const training = id => data.trainings.find(t => t.id === id);
const eventById = id => data.events.find(e => e.id === id);

function unitsLabel(facId, unitIds) {
  const f = facility(facId);
  if (!f) return '';
  if (f.units.length > 1 && f.units.every(u => unitIds.includes(u.id))) return 'komplett';
  return f.units.filter(u => unitIds.includes(u.id)).map(u => u.name).join(', ');
}
function placeLabel(e) {
  const f = facility(e.facilityId);
  if (!f) return 'Ohne Ort';
  const u = unitsLabel(e.facilityId, e.unitIds);
  return u ? `${f.name} · ${u}` : f.name;
}
function entryTitle(e) {
  if (e.kind === 'training') { const t = team(e.teamId); return `Training ${t ? t.name : ''}`.trim(); }
  return e.title || TYPES[e.type]?.label || 'Termin';
}
function entryColor(e) {
  const t = team(e.teamId);
  return t ? t.color : (TYPES[e.type]?.color || '#6366f1');
}
function entryIcon(e) {
  const t = team(e.teamId);
  if (e.kind === 'training' && t) return t.icon;
  return TYPES[e.type]?.icon || '📌';
}

/** Alle Belegungen (Trainings + Termine) eines Tages */
function entriesForDate(k) {
  const wd = weekdayOf(k);
  const out = [];
  for (const t of data.trainings) {
    if (t.weekday !== wd) continue;
    if (t.validFrom && k < t.validFrom) continue;
    if (t.validTo && k > t.validTo) continue;
    out.push({
      kind: 'training', id: t.id, date: k, type: 'training', teamId: t.teamId,
      facilityId: t.facilityId, unitIds: t.unitIds, start: t.start, end: t.end,
      note: t.note || '', cancelled: (t.skipDates || []).includes(k),
    });
  }
  for (const e of data.events) if (e.date === k) out.push({ kind: 'event', ...e });
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function overlaps(a, b) {
  return a.facilityId === b.facilityId && !a.cancelled && !b.cancelled &&
    toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end) &&
    a.unitIds.some(u => b.unitIds.includes(u));
}
const sameEntry = (a, b) => a.kind === b.kind && a.id === b.id;
function conflictsOn(cand, k) {
  return entriesForDate(k).filter(e => !sameEntry(e, cand) && overlaps(cand, e));
}
/** Konflikte für ein wiederkehrendes Training in den nächsten Wochen */
function trainingConflicts(cand, weeks = 12) {
  let k = todayKey();
  if (cand.validFrom && cand.validFrom > k) k = cand.validFrom;
  k = addDays(k, (cand.weekday - weekdayOf(k) + 7) % 7);
  const found = [];
  for (let i = 0; i < weeks; i++, k = addDays(k, 7)) {
    if (cand.validTo && k > cand.validTo) break;
    conflictsOn({ ...cand, date: k }, k).forEach(c => found.push(c));
  }
  return found;
}

function applyFilters(list) {
  return list.filter(e =>
    (!state.teamFilter || e.teamId === state.teamFilter) &&
    (!state.kindFilter || facility(e.facilityId)?.kind === state.kindFilter));
}

/* ---------- UI-Bausteine ---------- */
function entryHtml(e, opts = {}) {
  const conflicts = e.cancelled ? [] : conflictsOn(e, e.date);
  const tags = [];
  const t = team(e.teamId);
  if (e.kind === 'event') tags.push(`<span class="tag">${TYPES[e.type]?.icon || ''} ${esc(TYPES[e.type]?.label || '')}</span>`);
  if (t && e.kind === 'event') tags.push(`<span class="tag">${esc(t.icon)} ${esc(t.name)}</span>`);
  if (e.cancelled) tags.push('<span class="tag danger">Fällt aus</span>');
  if (conflicts.length) tags.push(`<span class="tag warn">⚠️ Überschneidung</span>`);
  return `
    <button class="entry ${e.cancelled ? 'cancelled' : ''}" style="--c:${esc(entryColor(e))}"
      data-action="openEntry" data-kind="${e.kind}" data-id="${esc(e.id)}" data-date="${e.date}">
      <div class="time">${e.start}<small>${e.end}</small>${opts.showDate ? `<small>${fmtShort(e.date)}</small>` : ''}</div>
      <div>
        <div class="title">${entryIcon(e)} ${esc(entryTitle(e))}</div>
        <div class="meta">📍 ${esc(placeLabel(e))}</div>
        ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
      </div>
    </button>`;
}
function entryListHtml(list, emptyText = 'Keine Termine', opts) {
  if (!list.length) return `<div class="empty">${emptyText}</div>`;
  return `<div class="entry-list">${list.map(e => entryHtml(e, opts)).join('')}</div>`;
}

function dateBarHtml(k, actionPrefix = 'day') {
  const isToday = k === todayKey();
  return `
    <div class="datebar">
      <button class="nav-btn" data-action="${actionPrefix}Prev" aria-label="Vorheriger Tag">‹</button>
      <label class="date-label">
        ${fromKey(k).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        <small>${isToday ? 'Heute' : fromKey(k).getFullYear()} · Datum wählen</small>
        <input type="date" class="date-overlay" data-change="setDate" value="${k}" aria-label="Datum wählen">
      </label>
      <button class="nav-btn" data-action="${actionPrefix}Next" aria-label="Nächster Tag">›</button>
      ${isToday ? '' : '<button class="btn small" data-action="goToday">Heute</button>'}
    </div>`;
}

function timelineHtml(f, k, entries) {
  const span = DAY_END - DAY_START;
  const pct = m => ((Math.min(Math.max(m, DAY_START), DAY_END) - DAY_START) / span) * 100;
  const hours = [];
  for (let h = DAY_START / 60 + 1; h < DAY_END / 60; h++) hours.push(`<span style="left:${pct(h * 60)}%">${h}:00</span>`);
  const showNow = k === todayKey() && nowMin() > DAY_START && nowMin() < DAY_END;
  const own = entries.filter(e => e.facilityId === f.id);

  const rows = f.units.map(u => {
    const blocks = own.filter(e => e.unitIds.includes(u.id)).map(e => {
      const left = pct(toMin(e.start));
      const width = Math.max(pct(toMin(e.end)) - left, 1.5);
      const conflict = !e.cancelled && conflictsOn(e, k).length > 0;
      return `<button class="block ${e.cancelled ? 'cancelled' : ''} ${conflict ? 'conflict' : ''}"
        style="left:${left}%;width:${width}%;--c:${esc(entryColor(e))}"
        data-action="openEntry" data-kind="${e.kind}" data-id="${esc(e.id)}" data-date="${k}"
        title="${esc(`${e.start}–${e.end} ${entryTitle(e)}`)}">${esc(entryTitle(e))}<small>${e.start}–${e.end}</small></button>`;
    }).join('');
    return `<div class="tl-row">
      <div class="tl-label">${esc(u.name)}</div>
      <div class="tl-track" data-action="trackClick" data-fac="${f.id}" data-unit="${u.id}" data-date="${k}">
        ${showNow ? `<div class="tl-now" style="left:${pct(nowMin())}%"></div>` : ''}${blocks}
      </div>
    </div>`;
  }).join('');

  return `<div class="timeline-wrap"><div class="timeline">
    <div class="tl-row"><div class="tl-label"></div><div class="tl-hours">${hours.join('')}</div></div>
    ${rows || '<div class="empty">Keine Bereiche angelegt</div>'}
  </div></div>`;
}

function facilityStatus(f, entries) {
  const now = nowMin();
  const active = entries.filter(e => e.facilityId === f.id && !e.cancelled);
  const busy = new Set();
  active.filter(e => toMin(e.start) <= now && now < toMin(e.end)).forEach(e => e.unitIds.forEach(u => busy.add(u)));
  const nextE = active.find(e => toMin(e.start) > now);
  const busyCount = f.units.filter(u => busy.has(u.id)).length;
  let tag;
  if (!busyCount) tag = '<span class="tag ok">frei</span>';
  else if (busyCount === f.units.length) tag = '<span class="tag danger">belegt</span>';
  else tag = `<span class="tag warn">${busyCount}/${f.units.length} belegt</span>`;
  const sub = nextE ? `ab ${nextE.start}: ${esc(entryTitle(nextE))}` : 'heute keine weiteren Buchungen';
  return { tag, sub };
}

/* ---------- Seiten ---------- */
const views = {
  start() {
    const k = todayKey();
    const today = entriesForDate(k);
    const upcoming = [];
    for (let i = 1; i <= 14; i++) {
      const d = addDays(k, i);
      entriesForDate(d).filter(e => e.kind === 'event').forEach(e => upcoming.push(e));
    }
    const activeToday = today.filter(e => !e.cancelled);
    const weekCount = Array.from({ length: 7 }, (_, i) => entriesForDate(addDays(k, i)).filter(e => !e.cancelled).length).reduce((a, b) => a + b, 0);

    return `
      <section class="card hero">
        <h1>${esc(data.club.name)}</h1>
        <p>${fmtLong(k)}</p>
        <div class="stats">
          <div class="stat"><b>${activeToday.length}</b><span>Termine heute</span></div>
          <div class="stat"><b>${weekCount}</b><span>in 7 Tagen</span></div>
          <div class="stat"><b>${data.teams.length}</b><span>Mannschaften</span></div>
        </div>
      </section>

      <h2 class="section-title">Heute</h2>
      ${entryListHtml(today, 'Heute ist nichts geplant 🎉')}

      <h2 class="section-title">Anlagen jetzt</h2>
      <div class="card"><div class="status-list">
        ${data.facilities.map(f => {
          const s = facilityStatus(f, today);
          return `<a class="status-row" href="#/anlage/${f.id}">
            <div class="name"><span>${esc(f.icon || KINDS[f.kind]?.icon)}</span>
              <div style="min-width:0"><div>${esc(f.name)}</div><div class="small muted">${s.sub}</div></div></div>
            ${s.tag}</a>`;
        }).join('')}
      </div></div>

      <h2 class="section-title">Mannschaften</h2>
      <div class="grid">
        ${data.teams.map(t => `
          <a class="tile" href="#/team/${t.id}" style="--accent:${esc(t.color)}">
            <span class="tile-icon">${esc(t.icon)}</span>
            <span class="tile-title">${esc(t.name)}</span>
            <span class="tile-sub">${esc(t.sport)} · ${trainingsSummary(t.id)}</span>
          </a>`).join('')}
      </div>

      <h2 class="section-title">Nächste Veranstaltungen (14 Tage)</h2>
      ${entryListHtml(upcoming, 'Keine Veranstaltungen geplant', { showDate: true })}
    `;
  },

  kalender() {
    const modeSwitch = `
      <div class="segmented" role="tablist">
        <button class="${state.calMode === 'monat' ? 'on' : ''}" data-action="calMode" data-mode="monat">Monat</button>
        <button class="${state.calMode === 'tag' ? 'on' : ''}" data-action="calMode" data-mode="tag">Tag</button>
      </div>`;
    const filters = `
      <div class="chips scroll" style="margin-bottom:12px">
        <button class="chip ${!state.teamFilter ? 'on' : ''}" data-action="teamFilter" data-id="">Alle</button>
        ${data.teams.map(t => `<button class="chip ${state.teamFilter === t.id ? 'on' : ''}" data-action="teamFilter" data-id="${t.id}">${esc(t.icon)} ${esc(t.name)}</button>`).join('')}
      </div>`;

    let body;
    if (state.calMode === 'monat') {
      const ms = state.calMonth;
      const md = fromKey(ms);
      let k = addDays(ms, -(weekdayOf(ms) - 1));
      const cells = [];
      for (let i = 0; i < 42; i++, k = addDays(k, 1)) {
        const list = applyFilters(entriesForDate(k)).filter(e => !e.cancelled);
        const hasConflict = list.some(e => conflictsOn(e, k).length);
        const other = fromKey(k).getMonth() !== md.getMonth();
        if (i === 35 && other) break; // 6. Zeile nur falls nötig
        cells.push(`
          <button class="day ${other ? 'other' : ''} ${k === todayKey() ? 'today' : ''} ${k === state.date ? 'sel' : ''}"
            data-action="pickDay" data-date="${k}" aria-label="${fmtLong(k)}, ${list.length} Termine">
            ${hasConflict ? '<span class="conflict-flag">⚠️</span>' : ''}
            <span class="num">${fromKey(k).getDate()}</span>
            <span class="dots">${list.slice(0, 4).map(e => `<i class="dot" style="--c:${esc(entryColor(e))}" data-label="${esc(e.start + ' ' + entryTitle(e))}"></i>`).join('')}</span>
            ${list.length > 4 ? `<span class="more">+${list.length - 4}</span>` : ''}
          </button>`);
      }
      body = `
        <div class="datebar">
          <button class="nav-btn" data-action="monthPrev" aria-label="Vorheriger Monat">‹</button>
          <label class="date-label">${MONTHS[md.getMonth()]} ${md.getFullYear()}
            <small>Monat wählen</small>
            <input type="month" class="date-overlay" data-change="setMonth" value="${ms.slice(0, 7)}" aria-label="Monat wählen">
          </label>
          <button class="nav-btn" data-action="monthNext" aria-label="Nächster Monat">›</button>
        </div>
        <div class="card" style="padding:10px">
          <div class="month">
            ${WD_SHORT.map(w => `<div class="wd">${w}</div>`).join('')}
            ${cells.join('')}
          </div>
        </div>
        <h2 class="section-title">${fmtLong(state.date)}</h2>
        ${entryListHtml(applyFilters(entriesForDate(state.date)))}
        <div class="btn-row"><button class="btn primary" data-action="newEvent">＋ Termin am ${fmtShort(state.date)}</button></div>`;
    } else {
      body = `
        ${dateBarHtml(state.date)}
        ${entryListHtml(applyFilters(entriesForDate(state.date)), 'Keine Termine an diesem Tag')}
        <div class="btn-row"><button class="btn primary" data-action="newEvent">＋ Neuer Termin</button></div>`;
    }

    return `
      <div class="page-title"><h1>Vereinskalender</h1>${modeSwitch}</div>
      ${filters}
      ${body}`;
  },

  belegung() {
    const k = state.date;
    const entries = entriesForDate(k);
    const kinds = Object.entries(KINDS);
    const facs = data.facilities.filter(f => !state.kindFilter || f.kind === state.kindFilter);
    return `
      <div class="page-title"><h1>Platz- & Raumbelegung</h1></div>
      ${dateBarHtml(k)}
      <div class="chips scroll" style="margin-bottom:12px">
        <button class="chip ${!state.kindFilter ? 'on' : ''}" data-action="kindFilter" data-kind="">Alle</button>
        ${kinds.map(([id, v]) => `<button class="chip ${state.kindFilter === id ? 'on' : ''}" data-action="kindFilter" data-kind="${id}">${v.icon} ${v.label}</button>`).join('')}
      </div>
      <p class="small muted" style="margin:0 0 12px">Tippe auf eine freie Stelle in der Zeitleiste, um direkt zu buchen.</p>
      ${facs.map(f => `
        <section class="card">
          <div class="card-head">
            <h3><span>${esc(f.icon || KINDS[f.kind]?.icon)}</span> <a href="#/anlage/${f.id}">${esc(f.name)}</a></h3>
            <span class="small muted">${esc(f.info || '')}</span>
          </div>
          ${timelineHtml(f, k, entries)}
        </section>`).join('') || '<div class="empty">Keine Anlagen</div>'}
      <div class="legend">
        ${data.teams.map(t => `<span><i style="--c:${esc(t.color)}"></i>${esc(t.name)}</span>`).join('')}
        <span><i style="--c:var(--danger)"></i>rot umrandet = Überschneidung</span>
      </div>`;
  },

  teams() {
    return `
      <div class="page-title"><h1>Mannschaften</h1><button class="btn small" data-action="newTeam">＋ Mannschaft</button></div>
      <div class="grid-2">
        ${data.teams.map(t => `
          <a class="card" href="#/team/${t.id}" style="border-left:5px solid ${esc(t.color)}">
            <div class="card-head" style="margin-bottom:4px"><h3><span>${esc(t.icon)}</span>${esc(t.name)}</h3><span class="tag">${esc(t.sport)}</span></div>
            <div class="small muted">Trainer: ${esc(t.trainer || '–')}</div>
            <div class="small" style="margin-top:6px">🗓️ ${trainingsSummary(t.id)}</div>
          </a>`).join('')}
      </div>`;
  },

  team(id) {
    const t = team(id);
    if (!t) return notFound();
    const trainings = data.trainings.filter(x => x.teamId === id).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
    const upcoming = [];
    for (let i = 0; i < 21; i++) {
      const d = addDays(todayKey(), i);
      entriesForDate(d).filter(e => e.teamId === id).forEach(e => upcoming.push(e));
    }
    return `
      <a class="small muted" href="#/teams">‹ Alle Mannschaften</a>
      <section class="card" style="margin-top:8px;border-top:5px solid ${esc(t.color)}">
        <div class="card-head"><h3 style="font-size:22px"><span>${esc(t.icon)}</span>${esc(t.name)}</h3>
          <button class="btn small" data-action="editTeam" data-id="${t.id}">Bearbeiten</button></div>
        <div class="detail-rows">
          <div><span>🏅</span><span>${esc(t.sport)}</span></div>
          <div><span>🧑‍🏫</span><span>Trainer: ${esc(t.trainer || '–')}</span></div>
          ${t.contact ? `<div><span>📞</span><a href="tel:${esc(t.contact.replace(/[^\d+]/g, ''))}">${esc(t.contact)}</a></div>` : ''}
        </div>
      </section>

      <h2 class="section-title">Trainingszeiten</h2>
      <div class="card">
        ${trainings.length ? `<div class="list">${trainings.map(x => `
          <div class="list-item">
            <div class="grow">
              <div><b>${WD_LONG[x.weekday - 1]}</b> · ${x.start}–${x.end}</div>
              <div class="small muted">📍 ${esc(placeLabel(x))}${x.validFrom || x.validTo ? ` · gültig ${x.validFrom ? 'ab ' + fmtShort(x.validFrom) : ''} ${x.validTo ? 'bis ' + fmtShort(x.validTo) : ''}` : ''}</div>
              ${trainingConflicts({ kind: 'training', ...x }).length ? '<span class="tag warn">⚠️ Überschneidung in den nächsten Wochen</span>' : ''}
            </div>
            <div class="actions"><button class="btn small" data-action="editTraining" data-id="${x.id}">Ändern</button></div>
          </div>`).join('')}</div>` : '<div class="empty">Noch keine Trainingszeiten</div>'}
        <div class="btn-row"><button class="btn primary" data-action="newTraining" data-team="${t.id}">＋ Trainingszeit</button>
          <button class="btn" data-action="newEvent" data-team="${t.id}">＋ Spiel / Termin</button></div>
      </div>

      <h2 class="section-title">Nächste 3 Wochen</h2>
      ${entryListHtml(upcoming, 'Keine Termine', { showDate: true })}`;
  },

  anlagen() {
    return `
      <div class="page-title"><h1>Anlagen</h1><button class="btn small" data-action="newFacility">＋ Anlage</button></div>
      ${Object.entries(KINDS).map(([kind, v]) => {
        const list = data.facilities.filter(f => f.kind === kind);
        if (!list.length) return '';
        return `
          <h2 class="section-title">${v.icon} ${v.label} (${list.length})</h2>
          <div class="grid-2">${list.map(f => `
            <a class="card" href="#/anlage/${f.id}">
              <div class="card-head" style="margin-bottom:4px"><h3><span>${esc(f.icon || v.icon)}</span>${esc(f.name)}</h3>${facilityStatus(f, entriesForDate(todayKey())).tag}</div>
              <div class="small muted">${esc(f.info || '')}</div>
              <div class="chips" style="margin-top:8px">${f.units.map(u => `<span class="tag">${esc(u.name)}</span>`).join('')}</div>
            </a>`).join('')}</div>`;
      }).join('')}`;
  },

  anlage(id) {
    const f = facility(id);
    if (!f) return notFound();
    const k = state.date;
    const entries = entriesForDate(k);
    const regular = data.trainings.filter(t => t.facilityId === id).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
    return `
      <a class="small muted" href="#/anlagen">‹ Alle Anlagen</a>
      <section class="card" style="margin-top:8px">
        <div class="card-head"><h3 style="font-size:22px"><span>${esc(f.icon || KINDS[f.kind]?.icon)}</span>${esc(f.name)}</h3>
          <button class="btn small" data-action="editFacility" data-id="${f.id}">Bearbeiten</button></div>
        <div class="small muted">${esc(KINDS[f.kind]?.label || '')}${f.info ? ' · ' + esc(f.info) : ''}</div>
      </section>

      <h2 class="section-title">Unterteilungen / Bereiche</h2>
      <div class="card"><div class="list">
        ${f.units.map(u => `
          <div class="list-item"><div class="grow"><b>${esc(u.name)}</b></div>
            <div class="actions">
              <button class="btn small" data-action="renameUnit" data-fac="${f.id}" data-unit="${u.id}">Umbenennen</button>
              <button class="btn small danger" data-action="deleteUnit" data-fac="${f.id}" data-unit="${u.id}" aria-label="Löschen">🗑</button>
            </div></div>`).join('') || '<div class="empty">Keine Bereiche</div>'}
      </div>
      <div class="btn-row"><button class="btn" data-action="addUnit" data-fac="${f.id}">＋ Bereich hinzufügen</button></div></div>

      <h2 class="section-title">Belegung</h2>
      ${dateBarHtml(k)}
      <section class="card">${timelineHtml(f, k, entries)}</section>
      <div class="btn-row"><button class="btn primary" data-action="newEvent" data-fac="${f.id}">＋ ${esc(f.name)} buchen</button></div>

      <h2 class="section-title">Feste Trainingszeiten</h2>
      <div class="card">${regular.length ? `<div class="list">${regular.map(t => `
        <div class="list-item"><div class="grow">
          <div><b>${WD_SHORT[t.weekday - 1]}</b> ${t.start}–${t.end} · ${esc(team(t.teamId)?.icon || '')} ${esc(team(t.teamId)?.name || '')}</div>
          <div class="small muted">${esc(unitsLabel(t.facilityId, t.unitIds))}</div></div></div>`).join('')}</div>` : '<div class="empty">Keine festen Trainings</div>'}
      </div>`;
  },

  einstellungen() {
    return `
      <div class="page-title"><h1>Einstellungen</h1></div>
      <div class="card">
        <label class="field"><span>Vereinsname</span>
          <input class="input" id="clubNameInput" value="${esc(data.club.name)}" data-change="clubName"></label>
      </div>
      <h2 class="section-title">Daten</h2>
      <div class="card">
        <p class="small muted" style="margin-top:0">Alle Daten werden lokal auf diesem Gerät gespeichert. Mit Export/Import kannst du sie sichern oder auf ein anderes Gerät übertragen.</p>
        <div class="btn-row">
          <button class="btn" data-action="exportData">⬇️ Exportieren</button>
          <button class="btn" data-action="pasteImport">📋 Text importieren</button>
          <label class="btn">⬆️ Datei importieren<input type="file" accept="application/json,.json" data-change="importData" hidden></label>
        </div>
        <div class="btn-row"><button class="btn danger" data-action="resetData">Beispieldaten wiederherstellen</button></div>
      </div>
      <h2 class="section-title">Übersicht</h2>
      <div class="card small">
        ${data.teams.length} Mannschaften · ${data.facilities.length} Anlagen · ${data.facilities.reduce((a, f) => a + f.units.length, 0)} Bereiche ·
        ${data.trainings.length} feste Trainingszeiten · ${data.events.length} Termine
      </div>`;
  },
};

function trainingsSummary(teamId) {
  const list = data.trainings.filter(x => x.teamId === teamId).sort((a, b) => a.weekday - b.weekday);
  if (!list.length) return 'kein Training';
  return list.map(x => `${WD_SHORT[x.weekday - 1]} ${x.start}`).join(', ');
}
function notFound() { return '<div class="empty">Nicht gefunden. <a href="#/">Zur Startseite</a></div>'; }

/* ---------- Router ---------- */
/* Navigation intern speichern; die Adresszeile wird nur genutzt, wenn der Browser das erlaubt
   (in eingebetteten Ansichten ist sie oft gesperrt) – so funktioniert auch „Zurück“ am Handy. */
const routeFromHash = () => (location.hash.startsWith('#/') ? location.hash.slice(1) : '/');
let route = routeFromHash();
function go(path) {
  if (!$('#sheet').hidden) closeSheet();
  route = path.replace(/^#/, '') || '/';
  try { history.pushState({ route }, '', '#' + route); } catch (e) { /* nicht erlaubt – egal */ }
  render(true);
}
window.addEventListener('popstate', ev => {
  route = (ev.state && ev.state.route) || routeFromHash();
  if (!$('#sheet').hidden) closeSheet();
  render(true);
});
function parseRoute() {
  const parts = route.replace(/^\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'start', arg: parts[1] ? decodeURIComponent(parts[1]) : undefined };
}
function render(scrollTop = false) {
  const { name, arg } = parseRoute();
  const view = views[name] || views.start;
  const main = $('#view');
  const y = window.scrollY;
  main.innerHTML = view(arg);
  $('#clubName').textContent = data.club.name;
  const navKey = { team: 'teams', anlage: 'anlagen' }[name] || name;
  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));
  window.scrollTo(0, scrollTop ? 0 : y);
  scrollTimelines();
}

/** Zeitleisten auf dem Handy zur relevanten Uhrzeit scrollen (jetzt bzw. erster Termin) */
function scrollTimelines() {
  const wraps = document.querySelectorAll('.timeline-wrap');
  if (!wraps.length) return;
  const k = state.date;
  const active = entriesForDate(k).filter(e => !e.cancelled);
  let focus = active.length ? Math.min(...active.map(e => toMin(e.start))) - 30 : 16 * 60;
  if (k === todayKey()) focus = Math.max(nowMin() - 60, DAY_START);
  focus = Math.min(Math.max(focus, DAY_START), DAY_END);
  wraps.forEach(w => {
    const track = w.querySelector('.tl-track');
    if (!track || w.scrollWidth <= w.clientWidth) return;
    const frac = (focus - DAY_START) / (DAY_END - DAY_START);
    w.scrollLeft = Math.max(0, frac * track.clientWidth);
  });
}

/* ---------- Sheet & Toast ---------- */
function openSheet(title, html, onMount) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  if (onMount) onMount($('#sheetBody'));
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBody').innerHTML = '';
  document.body.style.overflow = '';
}
$('#sheet').addEventListener('click', ev => { if (ev.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- Bestätigen & Eingabe (statt confirm/prompt) ---------- */
const dialogEl = document.createElement('div');
dialogEl.id = 'dialog';
dialogEl.className = 'dialog-backdrop';
dialogEl.hidden = true;
dialogEl.innerHTML = `
  <form class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialogMsg" novalidate>
    <p class="dialog-msg" id="dialogMsg"></p>
    <input class="input dialog-input" id="dialogInput" maxlength="40" autocomplete="off">
    <div class="dialog-actions">
      <button type="button" class="btn" data-dlg="cancel">Abbrechen</button>
      <button type="submit" class="btn primary" data-dlg="ok">OK</button>
    </div>
  </form>`;
document.body.appendChild(dialogEl);
let dialogResolve = null;

/** Zeigt eine Rückfrage. Mit `input` wird ein Textfeld angezeigt und dessen Inhalt geliefert. */
function ask(message, { ok = 'OK', danger = false, input = null } = {}) {
  if (dialogResolve) dialogResolve(null);
  const field = $('#dialogInput');
  const okBtn = dialogEl.querySelector('[data-dlg="ok"]');
  $('#dialogMsg').textContent = message;
  okBtn.textContent = ok;
  okBtn.className = danger ? 'btn danger-solid' : 'btn primary';
  field.hidden = input === null;
  field.value = input ?? '';
  dialogEl.hidden = false;
  (input === null ? okBtn : field).focus();
  if (input !== null) field.select();
  return new Promise(resolve => { dialogResolve = resolve; });
}
function closeDialog(result) {
  dialogEl.hidden = true;
  const r = dialogResolve;
  dialogResolve = null;
  if (r) r(result);
}
dialogEl.addEventListener('submit', ev => {
  ev.preventDefault();
  const field = $('#dialogInput');
  closeDialog(field.hidden ? true : field.value);
});
/** Abbrechen liefert false (Rückfrage) bzw. null (Eingabe) */
const cancelValue = () => ($('#dialogInput').hidden ? false : null);
dialogEl.addEventListener('click', ev => {
  if (ev.target === dialogEl || ev.target.closest('[data-dlg="cancel"]')) closeDialog(cancelValue());
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && !dialogEl.hidden) { ev.stopImmediatePropagation(); closeDialog(cancelValue()); }
}, true);
const confirmAsk = (message, opts) => ask(message, opts).then(r => r === true);

/* ---------- Formulare ---------- */
function facilityOptions(selected) {
  return Object.entries(KINDS).map(([kind, v]) => {
    const list = data.facilities.filter(f => f.kind === kind);
    if (!list.length) return '';
    return `<optgroup label="${v.label}">${list.map(f => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</optgroup>`;
  }).join('');
}
function unitPickerHtml(facId, selected) {
  const f = facility(facId);
  if (!f) return '';
  const all = f.units.length > 0 && f.units.every(u => selected.includes(u.id));
  return `
    ${f.units.length > 1 ? `<button type="button" class="chip ${all ? 'on' : ''}" data-action="toggleAllUnits">Komplett</button>` : ''}
    ${f.units.map(u => `<label class="chip"><input type="checkbox" name="unit" value="${u.id}" ${selected.includes(u.id) ? 'checked' : ''}>${esc(u.name)}</label>`).join('')}`;
}
function selectedUnits(form) {
  return [...form.querySelectorAll('input[name="unit"]:checked')].map(i => i.value);
}
function teamOptions(selected, allowNone = true) {
  return (allowNone ? '<option value="">– keine –</option>' : '') +
    data.teams.map(t => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.icon)} ${esc(t.name)}</option>`).join('');
}
function conflictBox(conflicts, multi = false) {
  if (!conflicts.length) return '<div class="alert ok">✅ Keine Überschneidungen</div>';
  const seen = new Set();
  const items = conflicts.filter(c => { const key = c.kind + c.id + c.date; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 6)
    .map(c => `<li>${multi ? fmtShort(c.date) + ', ' : ''}${c.start}–${c.end} ${esc(entryTitle(c))} (${esc(unitsLabel(c.facilityId, c.unitIds))})</li>`).join('');
  return `<div class="alert warn">⚠️ Überschneidung mit:<ul>${items}</ul></div>`;
}

/** Wiring für Anlage/Bereich-Auswahl + Live-Konfliktprüfung */
function wireBookingForm(form, buildCandidate, multi) {
  const facSel = form.elements.facilityId;
  const picker = form.querySelector('.unit-picker');
  const box = form.querySelector('.conflict-box');
  const refresh = () => {
    const allChips = picker.querySelector('[data-action="toggleAllUnits"]');
    if (allChips) {
      const boxes = [...picker.querySelectorAll('input[name="unit"]')];
      allChips.classList.toggle('on', boxes.length > 0 && boxes.every(b => b.checked));
    }
    const c = buildCandidate();
    if (!c || !c.unitIds.length || !c.start || !c.end || toMin(c.end) <= toMin(c.start)) { box.innerHTML = ''; return; }
    box.innerHTML = conflictBox(multi ? trainingConflicts(c) : conflictsOn(c, c.date), multi);
  };
  facSel.addEventListener('change', () => {
    const f = facility(facSel.value);
    picker.innerHTML = unitPickerHtml(facSel.value, f ? f.units.map(u => u.id) : []);
    refresh();
  });
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form._refresh = refresh;
  refresh();
}

function validateTimes(start, end) {
  if (!start || !end) return 'Bitte Beginn und Ende angeben.';
  if (toMin(end) <= toMin(start)) return 'Das Ende muss nach dem Beginn liegen.';
  return '';
}

function openEventForm(ev = null, prefill = {}) {
  const e = ev || {
    id: null, title: '', type: prefill.teamId ? 'spiel' : 'sonstiges', teamId: prefill.teamId || '',
    facilityId: prefill.facilityId || data.facilities[0]?.id, unitIds: prefill.unitIds || null,
    date: prefill.date || state.date, start: prefill.start || '18:00', end: prefill.end || '20:00', note: '',
  };
  const fac = facility(e.facilityId);
  const units = e.unitIds || (fac ? fac.units.map(u => u.id) : []);

  openSheet(ev ? 'Termin bearbeiten' : 'Neuer Termin / Buchung', `
    <form class="form" id="eventForm" novalidate>
      <label class="field"><span>Titel</span>
        <input class="input" name="title" value="${esc(e.title)}" placeholder="z. B. Heimspiel, Weihnachtsfeier …" required></label>
      <div class="row-2">
        <label class="field"><span>Art</span>
          <select class="input" name="type">${Object.entries(TYPES).filter(([k]) => k !== 'training').map(([k, v]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></label>
        <label class="field"><span>Mannschaft</span>
          <select class="input" name="teamId">${teamOptions(e.teamId)}</select></label>
      </div>
      <label class="field"><span>Datum</span><input class="input" type="date" name="date" value="${e.date}" required></label>
      <div class="row-2">
        <label class="field"><span>Von</span><input class="input" type="time" name="start" value="${e.start}" step="900" required></label>
        <label class="field"><span>Bis</span><input class="input" type="time" name="end" value="${e.end}" step="900" required></label>
      </div>
      <label class="field"><span>Anlage / Raum</span><select class="input" name="facilityId">${facilityOptions(e.facilityId)}</select></label>
      <div class="field"><span>Bereiche</span><div class="chips unit-picker">${unitPickerHtml(e.facilityId, units)}</div></div>
      <div class="conflict-box"></div>
      <label class="field"><span>Notiz</span><textarea class="input" name="note" placeholder="optional">${esc(e.note || '')}</textarea></label>
      <div class="btn-row">
        ${ev ? '<button type="button" class="btn danger" data-action="deleteEvent">Löschen</button>' : ''}
        <button type="submit" class="btn primary">Speichern</button>
      </div>
    </form>`, body => {
    const form = $('#eventForm', body);
    const build = () => {
      const f = form.elements;
      return { kind: 'event', id: e.id || '__new', facilityId: f.facilityId.value, unitIds: selectedUnits(form),
        date: f.date.value, start: f.start.value, end: f.end.value };
    };
    wireBookingForm(form, build, false);
    form.addEventListener('submit', async sub => {
      sub.preventDefault();
      const f = form.elements;
      const title = f.title.value.trim();
      const units = selectedUnits(form);
      const err = !title ? 'Bitte einen Titel angeben.' : !f.date.value ? 'Bitte ein Datum wählen.'
        : validateTimes(f.start.value, f.end.value) || (!units.length ? 'Bitte mindestens einen Bereich wählen.' : '');
      if (err) { toast(err); return; }
      const conflicts = conflictsOn(build(), f.date.value);
      if (conflicts.length && !(await confirmAsk(`Es gibt ${conflicts.length} Überschneidung(en) mit anderen Buchungen. Trotzdem speichern?`, { ok: 'Trotzdem speichern' }))) return;
      const rec = { id: e.id || uid(), title, type: f.type.value, teamId: f.teamId.value || null,
        facilityId: f.facilityId.value, unitIds: units, date: f.date.value, start: f.start.value, end: f.end.value, note: f.note.value.trim() };
      if (ev) Object.assign(ev, rec); else data.events.push(rec);
      save();
      state.date = rec.date;
      state.calMonth = monthStart(rec.date);
      closeSheet();
      render();
      toast('✅ Termin gespeichert');
    });
    form.querySelector('[data-action="deleteEvent"]')?.addEventListener('click', async () => {
      if (!(await confirmAsk(`Termin „${ev.title}“ löschen?`, { ok: 'Löschen', danger: true }))) return;
      data.events = data.events.filter(x => x.id !== ev.id);
      save(); closeSheet(); render(); toast('🗑 Termin gelöscht');
    });
    if (!ev) form.elements.title.focus();
  });
}

function openTrainingForm(tr = null, teamId = null) {
  const t = tr || { id: null, teamId, weekday: weekdayOf(state.date), start: '18:00', end: '19:30',
    facilityId: data.facilities[0]?.id, unitIds: null, validFrom: '', validTo: '', note: '' };
  const fac = facility(t.facilityId);
  const units = t.unitIds || (fac ? fac.units.map(u => u.id) : []);
  openSheet(tr ? 'Trainingszeit ändern' : 'Neue Trainingszeit', `
    <form class="form" id="trainingForm" novalidate>
      <label class="field"><span>Mannschaft</span><select class="input" name="teamId">${teamOptions(t.teamId, false)}</select></label>
      <label class="field"><span>Wochentag</span>
        <select class="input" name="weekday">${WD_LONG.map((w, i) => `<option value="${i + 1}" ${i + 1 === t.weekday ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <div class="row-2">
        <label class="field"><span>Von</span><input class="input" type="time" name="start" value="${t.start}" step="900"></label>
        <label class="field"><span>Bis</span><input class="input" type="time" name="end" value="${t.end}" step="900"></label>
      </div>
      <label class="field"><span>Anlage / Halle</span><select class="input" name="facilityId">${facilityOptions(t.facilityId)}</select></label>
      <div class="field"><span>Bereiche</span><div class="chips unit-picker">${unitPickerHtml(t.facilityId, units)}</div></div>
      <div class="row-2">
        <label class="field"><span>Gültig ab (optional)</span><input class="input" type="date" name="validFrom" value="${t.validFrom || ''}"></label>
        <label class="field"><span>Gültig bis (optional)</span><input class="input" type="date" name="validTo" value="${t.validTo || ''}"></label>
      </div>
      <p class="small muted" style="margin:0">Konfliktprüfung für die nächsten 12 Wochen:</p>
      <div class="conflict-box"></div>
      <div class="btn-row">
        ${tr ? '<button type="button" class="btn danger" data-action="deleteTraining">Löschen</button>' : ''}
        <button type="submit" class="btn primary">Speichern</button>
      </div>
    </form>`, body => {
    const form = $('#trainingForm', body);
    const build = () => {
      const f = form.elements;
      return { kind: 'training', id: t.id || '__new', weekday: Number(f.weekday.value), facilityId: f.facilityId.value,
        unitIds: selectedUnits(form), start: f.start.value, end: f.end.value, validFrom: f.validFrom.value, validTo: f.validTo.value };
    };
    wireBookingForm(form, build, true);
    form.addEventListener('submit', async sub => {
      sub.preventDefault();
      const f = form.elements;
      const units = selectedUnits(form);
      const err = validateTimes(f.start.value, f.end.value) || (!units.length ? 'Bitte mindestens einen Bereich wählen.' : '')
        || (f.validFrom.value && f.validTo.value && f.validTo.value < f.validFrom.value ? '„Gültig bis“ liegt vor „Gültig ab“.' : '');
      if (err) { toast(err); return; }
      const conflicts = trainingConflicts(build());
      if (conflicts.length && !(await confirmAsk(`In den nächsten Wochen gibt es ${conflicts.length} Überschneidung(en). Trotzdem speichern?`, { ok: 'Trotzdem speichern' }))) return;
      const rec = { id: t.id || uid(), teamId: f.teamId.value, weekday: Number(f.weekday.value), start: f.start.value, end: f.end.value,
        facilityId: f.facilityId.value, unitIds: units, validFrom: f.validFrom.value || '', validTo: f.validTo.value || '',
        skipDates: t.skipDates || [] };
      if (tr) Object.assign(tr, rec); else data.trainings.push(rec);
      save(); closeSheet(); render(); toast('✅ Trainingszeit gespeichert');
    });
    form.querySelector('[data-action="deleteTraining"]')?.addEventListener('click', async () => {
      if (!(await confirmAsk('Diese Trainingszeit dauerhaft löschen?', { ok: 'Löschen', danger: true }))) return;
      data.trainings = data.trainings.filter(x => x.id !== tr.id);
      save(); closeSheet(); render(); toast('🗑 Trainingszeit gelöscht');
    });
  });
}

function openTeamForm(tm = null) {
  const t = tm || { id: null, name: '', sport: '', icon: '🏅', color: '#16a34a', trainer: '', contact: '' };
  openSheet(tm ? 'Mannschaft bearbeiten' : 'Neue Mannschaft', `
    <form class="form" id="teamForm" novalidate>
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(t.name)}" placeholder="z. B. A-Jugend" required></label>
      <div class="row-2">
        <label class="field"><span>Sportart</span><input class="input" name="sport" value="${esc(t.sport)}" placeholder="z. B. Fußball"></label>
        <label class="field"><span>Symbol</span><input class="input" name="icon" value="${esc(t.icon)}" maxlength="4"></label>
      </div>
      <div class="row-2">
        <label class="field"><span>Trainer/in</span><input class="input" name="trainer" value="${esc(t.trainer)}"></label>
        <label class="field"><span>Farbe</span><input class="input" type="color" name="color" value="${esc(t.color)}"></label>
      </div>
      <label class="field"><span>Kontakt (Telefon)</span><input class="input" type="tel" name="contact" value="${esc(t.contact)}"></label>
      <div class="btn-row">
        ${tm ? '<button type="button" class="btn danger" data-action="deleteTeam">Löschen</button>' : ''}
        <button type="submit" class="btn primary">Speichern</button>
      </div>
    </form>`, body => {
    const form = $('#teamForm', body);
    form.addEventListener('submit', sub => {
      sub.preventDefault();
      const f = form.elements;
      if (!f.name.value.trim()) { toast('Bitte einen Namen angeben.'); return; }
      const rec = { name: f.name.value.trim(), sport: f.sport.value.trim(), icon: f.icon.value.trim() || '🏅',
        color: f.color.value, trainer: f.trainer.value.trim(), contact: f.contact.value.trim() };
      if (tm) Object.assign(tm, rec);
      else { rec.id = uid(); data.teams.push(rec); }
      save(); closeSheet();
      if (!tm) go(`/team/${rec.id}`); else render();
      toast('✅ Mannschaft gespeichert');
    });
    form.querySelector('[data-action="deleteTeam"]')?.addEventListener('click', async () => {
      if (!(await confirmAsk(`„${tm.name}“ inkl. aller Trainingszeiten löschen? Termine bleiben ohne Mannschaft erhalten.`, { ok: 'Löschen', danger: true }))) return;
      data.teams = data.teams.filter(x => x.id !== tm.id);
      data.trainings = data.trainings.filter(x => x.teamId !== tm.id);
      data.events.forEach(e => { if (e.teamId === tm.id) e.teamId = null; });
      save(); closeSheet(); go('/teams'); toast('🗑 Mannschaft gelöscht');
    });
  });
}

function openFacilityForm(fa = null) {
  const f = fa || { id: null, kind: 'platz', name: '', info: '', icon: '', units: [] };
  openSheet(fa ? 'Anlage bearbeiten' : 'Neue Anlage', `
    <form class="form" id="facForm" novalidate>
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(f.name)}" placeholder="z. B. Sportplatz 4" required></label>
      <div class="row-2">
        <label class="field"><span>Typ</span><select class="input" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === f.kind ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></label>
        <label class="field"><span>Symbol</span><input class="input" name="icon" value="${esc(f.icon)}" maxlength="4" placeholder="automatisch"></label>
      </div>
      <label class="field"><span>Beschreibung</span><input class="input" name="info" value="${esc(f.info)}" placeholder="z. B. Kunstrasen, Flutlicht"></label>
      ${fa ? '' : `<label class="field"><span>Bereiche (durch Komma getrennt)</span><input class="input" name="units" placeholder="z. B. Hälfte A, Hälfte B"></label>`}
      <div class="btn-row">
        ${fa ? '<button type="button" class="btn danger" data-action="deleteFacility">Löschen</button>' : ''}
        <button type="submit" class="btn primary">Speichern</button>
      </div>
    </form>`, body => {
    const form = $('#facForm', body);
    form.addEventListener('submit', sub => {
      sub.preventDefault();
      const el = form.elements;
      if (!el.name.value.trim()) { toast('Bitte einen Namen angeben.'); return; }
      const rec = { name: el.name.value.trim(), kind: el.kind.value, info: el.info.value.trim(), icon: el.icon.value.trim() || KINDS[el.kind.value].icon };
      if (fa) { Object.assign(fa, rec); save(); closeSheet(); render(); }
      else {
        rec.id = uid();
        const names = (el.units.value || '').split(',').map(s => s.trim()).filter(Boolean);
        rec.units = (names.length ? names : ['Gesamt']).map(name => ({ id: uid(), name }));
        data.facilities.push(rec);
        save(); closeSheet(); go(`/anlage/${rec.id}`);
      }
      toast('✅ Anlage gespeichert');
    });
    form.querySelector('[data-action="deleteFacility"]')?.addEventListener('click', async () => {
      const used = data.trainings.filter(t => t.facilityId === fa.id).length + data.events.filter(e => e.facilityId === fa.id).length;
      if (!(await confirmAsk(`„${fa.name}“ löschen?${used ? ` ${used} Training(s)/Termin(e) auf dieser Anlage werden ebenfalls gelöscht.` : ''}`, { ok: 'Löschen', danger: true }))) return;
      data.facilities = data.facilities.filter(x => x.id !== fa.id);
      data.trainings = data.trainings.filter(t => t.facilityId !== fa.id);
      data.events = data.events.filter(e => e.facilityId !== fa.id);
      save(); closeSheet(); go('/anlagen'); toast('🗑 Anlage gelöscht');
    });
  });
}

function openEntrySheet(kind, id, date) {
  const entry = entriesForDate(date).find(e => e.kind === kind && e.id === id);
  if (!entry) return;
  const t = team(entry.teamId);
  const conflicts = entry.cancelled ? [] : conflictsOn(entry, date);
  openSheet(`${entryIcon(entry)} ${entryTitle(entry)}`, `
    <div class="detail-rows">
      <div><span>🏷️</span><span>${esc(TYPES[entry.type]?.label || '')}${kind === 'training' ? ' (regelmäßig, jeden ' + WD_LONG[weekdayOf(date) - 1] + ')' : ''}</span></div>
      ${t ? `<div><span>${esc(t.icon)}</span><a href="#/team/${t.id}" data-action="closeSheet">${esc(t.name)}</a></div>` : ''}
      <div><span>📅</span><span>${fmtLong(date)}</span></div>
      <div><span>⏰</span><span>${entry.start} – ${entry.end} Uhr</span></div>
      <div><span>📍</span><a href="#/anlage/${entry.facilityId}" data-action="closeSheet">${esc(placeLabel(entry))}</a></div>
      ${entry.note ? `<div><span>📝</span><span>${esc(entry.note)}</span></div>` : ''}
      ${entry.cancelled ? '<div><span>❌</span><span class="tag danger">Dieser Termin fällt aus</span></div>' : ''}
    </div>
    ${conflicts.length ? `<div style="margin-top:14px">${conflictBox(conflicts)}</div>` : ''}
    <div class="btn-row">
      ${kind === 'event'
        ? `<button class="btn" data-action="editEvent" data-id="${esc(id)}">Bearbeiten</button>
           <button class="btn" data-action="duplicateEvent" data-id="${esc(id)}">Kopieren</button>`
        : `<button class="btn" data-action="toggleSkip" data-id="${esc(id)}" data-date="${date}">${entry.cancelled ? '↩️ Wieder stattfinden lassen' : '❌ Am ' + fmtShort(date) + ' absagen'}</button>
           <button class="btn" data-action="editTraining" data-id="${esc(id)}">Trainingszeit ändern</button>`}
    </div>`);
}

/* ---------- Aktionen ---------- */
function setDate(k) {
  state.date = k;
  state.calMonth = monthStart(k);
  render();
}

const actions = {
  closeSheet,
  newEvent: el => {
    const { name, arg } = parseRoute();
    const prefill = { date: state.date };
    if (el.dataset.team) prefill.teamId = el.dataset.team;
    else if (name === 'team') prefill.teamId = arg;
    if (el.dataset.fac) prefill.facilityId = el.dataset.fac;
    else if (name === 'anlage') prefill.facilityId = arg;
    if (name !== 'kalender' && name !== 'belegung' && name !== 'anlage' && el.closest('.app-header')) prefill.date = todayKey();
    openEventForm(null, prefill);
  },
  editEvent: el => { const ev = eventById(el.dataset.id); if (ev) openEventForm(ev); },
  duplicateEvent: el => {
    const ev = eventById(el.dataset.id);
    if (!ev) return;
    const { id, ...rest } = ev;
    openEventForm(null, rest);
    const form = $('#eventForm');
    form.elements.title.value = ev.title;
    form.elements.type.value = ev.type;
    form.elements.note.value = ev.note || '';
    form._refresh();
  },
  openEntry: el => openEntrySheet(el.dataset.kind, el.dataset.id, el.dataset.date),
  toggleSkip: el => {
    const t = training(el.dataset.id);
    if (!t) return;
    t.skipDates = t.skipDates || [];
    const d = el.dataset.date;
    const i = t.skipDates.indexOf(d);
    if (i >= 0) t.skipDates.splice(i, 1); else t.skipDates.push(d);
    save(); closeSheet(); render();
    toast(i >= 0 ? '↩️ Training findet wieder statt' : '❌ Training abgesagt');
  },
  newTraining: el => openTrainingForm(null, el.dataset.team),
  editTraining: el => { const t = training(el.dataset.id); if (t) openTrainingForm(t); },
  newTeam: () => openTeamForm(),
  editTeam: el => openTeamForm(team(el.dataset.id)),
  newFacility: () => openFacilityForm(),
  editFacility: el => openFacilityForm(facility(el.dataset.id)),

  toggleAllUnits: el => {
    const boxes = [...el.parentElement.querySelectorAll('input[name="unit"]')];
    const all = boxes.every(b => b.checked);
    boxes.forEach(b => { b.checked = !all; });
    el.closest('form')._refresh?.();
  },

  addUnit: async el => {
    const f = facility(el.dataset.fac);
    const name = await ask('Name des neuen Bereichs (z. B. „Feld 4“, „Umkleide“):', { ok: 'Hinzufügen', input: '' });
    if (!name || !name.trim()) return;
    f.units.push({ id: uid(), name: name.trim() });
    save(); render(); toast('✅ Bereich hinzugefügt');
  },
  renameUnit: async el => {
    const u = facility(el.dataset.fac).units.find(x => x.id === el.dataset.unit);
    const name = await ask(`Neuer Name für „${u.name}“:`, { ok: 'Umbenennen', input: u.name });
    if (!name || !name.trim()) return;
    u.name = name.trim();
    save(); render();
  },
  deleteUnit: async el => {
    const f = facility(el.dataset.fac);
    const u = f.units.find(x => x.id === el.dataset.unit);
    if (f.units.length <= 1) { toast('Eine Anlage braucht mindestens einen Bereich.'); return; }
    if (!(await confirmAsk(`Bereich „${u.name}“ löschen? Buchungen, die nur diesen Bereich betreffen, werden entfernt.`, { ok: 'Löschen', danger: true }))) return;
    f.units = f.units.filter(x => x.id !== u.id);
    const strip = list => list.filter(x => {
      if (x.facilityId !== f.id) return true;
      x.unitIds = x.unitIds.filter(id => id !== u.id);
      return x.unitIds.length > 0;
    });
    data.trainings = strip(data.trainings);
    data.events = strip(data.events);
    save(); render(); toast('🗑 Bereich gelöscht');
  },

  trackClick: (el, ev) => {
    if (ev.target.closest('.block')) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1);
    let start = Math.floor((DAY_START + frac * (DAY_END - DAY_START)) / 30) * 30;
    start = Math.min(start, DAY_END - 60);
    openEventForm(null, { date: el.dataset.date, facilityId: el.dataset.fac, unitIds: [el.dataset.unit],
      start: fromMin(start), end: fromMin(start + 90 > DAY_END ? DAY_END : start + 90) });
  },

  dayPrev: () => setDate(addDays(state.date, -1)),
  dayNext: () => setDate(addDays(state.date, 1)),
  goToday: () => setDate(todayKey()),
  monthPrev: () => { state.calMonth = addMonths(state.calMonth, -1); render(); },
  monthNext: () => { state.calMonth = addMonths(state.calMonth, 1); render(); },
  pickDay: el => {
    const k = el.dataset.date;
    if (k === state.date && fromKey(k).getMonth() === fromKey(state.calMonth).getMonth()) { state.calMode = 'tag'; render(); return; }
    state.date = k;
    if (fromKey(k).getMonth() !== fromKey(state.calMonth).getMonth()) state.calMonth = monthStart(k);
    render();
  },
  calMode: el => { state.calMode = el.dataset.mode; if (state.calMode === 'monat') state.calMonth = monthStart(state.date); render(); },
  teamFilter: el => { state.teamFilter = el.dataset.id; render(); },
  kindFilter: el => { state.kindFilter = el.dataset.kind; render(); },

  exportData: () => {
    const json = JSON.stringify(data, null, 2);
    openSheet('Daten exportieren', `
      <p class="small muted" style="margin-top:0">Sicherung aller Mannschaften, Anlagen, Trainingszeiten und Termine.
        Den Text kopieren und z. B. in einer Notiz oder Mail speichern${window.SV_ARTIFACT ? '' : ' – oder als Datei herunterladen'}.</p>
      <textarea class="input export-text" id="exportText" readonly rows="8">${esc(json)}</textarea>
      <div class="btn-row">
        <button class="btn primary" data-action="copyExport">📋 Text kopieren</button>
        ${window.SV_ARTIFACT ? '' : '<button class="btn" data-action="downloadExport">⬇️ Als Datei</button>'}
      </div>`);
  },
  copyExport: () => {
    const area = $('#exportText');
    const fallback = () => { area.focus(); area.select(); toast('Text ist markiert – jetzt kopieren (Strg+C bzw. lange tippen)'); };
    try {
      navigator.clipboard.writeText(area.value).then(() => toast('✅ In die Zwischenablage kopiert'), fallback);
    } catch (e) { fallback(); }
  },
  downloadExport: () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sportverein-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Download gestartet – falls nichts passiert, bitte „Text kopieren“ nutzen');
  },
  pasteImport: () => {
    openSheet('Daten importieren', `
      <p class="small muted" style="margin-top:0">Exportierten Text hier einfügen. Die aktuellen Daten auf diesem Gerät werden ersetzt.</p>
      <textarea class="input export-text" id="importText" rows="8" placeholder="{ &quot;teams&quot;: … }"></textarea>
      <div class="btn-row"><button class="btn primary" data-action="runPasteImport">Importieren</button></div>`);
    $('#importText').focus();
  },
  runPasteImport: () => importJson($('#importText').value),
  resetData: async () => {
    if (!(await confirmAsk('Alle eigenen Änderungen verwerfen und Beispieldaten laden?', { ok: 'Beispieldaten laden', danger: true }))) return;
    data = demoData(); save(); go('/'); toast('Beispieldaten geladen');
  },
};

async function importJson(txt) {
  let d;
  try { d = JSON.parse(txt); } catch (e) { d = null; }
  if (!d || !Array.isArray(d.teams) || !Array.isArray(d.facilities)) {
    toast('⚠️ Das ist keine gültige Sicherung der Sportverein-App');
    return;
  }
  if (!(await confirmAsk('Aktuelle Daten auf diesem Gerät durch den Import ersetzen?', { ok: 'Importieren', danger: true }))) return;
  data = normalize(d);
  save();
  closeSheet();
  render();
  toast('✅ Daten importiert');
}

const changeHandlers = {
  setDate: el => { if (el.value) setDate(el.value); },
  setMonth: el => { if (el.value) { state.calMonth = el.value + '-01'; render(); } },
  clubName: el => { data.club.name = el.value.trim() || 'Sportverein'; save(); $('#clubName').textContent = data.club.name; toast('✅ Gespeichert'); },
  importData: el => {
    const file = el.files[0];
    el.value = '';
    if (file) file.text().then(importJson, () => toast('⚠️ Datei konnte nicht gelesen werden'));
  },
};

document.addEventListener('click', ev => {
  const link = ev.target.closest('a[href^="#/"]');
  if (link) {
    ev.preventDefault();
    go(link.getAttribute('href').slice(1));
    return;
  }
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'BUTTON') ev.preventDefault();
  fn(el, ev);
});
document.addEventListener('change', ev => {
  const el = ev.target.closest('[data-change]');
  if (el && changeHandlers[el.dataset.change]) changeHandlers[el.dataset.change](el);
});
// Datumsfeld liegt unsichtbar über der Beschriftung: Handys öffnen den Wähler selbst,
// am PC hilft showPicker() nach (wo erlaubt)
document.addEventListener('click', ev => {
  const input = ev.target.closest('.date-overlay');
  if (input && typeof input.showPicker === 'function') { try { input.showPicker(); } catch (e) { /* nicht erlaubt */ } }
});

// Uhrzeit-Markierung / Status regelmäßig aktualisieren
setInterval(() => {
  if ($('#sheet').hidden && ['start', 'belegung', 'anlage', 'anlagen'].includes(parseRoute().name)) render();
}, 60 * 1000);

/* ---------- Start ---------- */
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
