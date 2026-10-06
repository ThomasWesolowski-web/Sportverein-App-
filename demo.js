/* Beispieldaten – wird vom Browser (app.js) und vom Server (server/) genutzt */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
  const weekdayOf = k => (fromKey(k).getDay() + 6) % 7 + 1;
  const todayKey = () => toKey(new Date());

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


  if (typeof module !== 'undefined' && module.exports) module.exports = { demoData };
  else root.demoData = demoData;
})(typeof globalThis !== 'undefined' ? globalThis : this);
