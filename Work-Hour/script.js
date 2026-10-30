(function () {
  'use strict';

  const STORAGE_SHIFTS = 'work-hour.shifts.v1';
  const STORAGE_SETTINGS = 'work-hour.settings.v1';

  const els = {
    shiftDate: document.getElementById('shiftDate'),
    breakMinutes: document.getElementById('breakMinutes'),
    startTime: document.getElementById('startTime'),
    endTime: document.getElementById('endTime'),
    hourlyRate: document.getElementById('hourlyRate'),
    currency: document.getElementById('currency'),
    addShiftBtn: document.getElementById('addShiftBtn'),
    resetBtn: document.getElementById('resetBtn'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    shiftContext: document.getElementById('shiftContext'),
    shiftTotal: document.getElementById('shiftTotal'),
    breakNote: document.getElementById('breakNote'),
    shiftEarnings: document.getElementById('shiftEarnings'),
    todayHours: document.getElementById('todayHours'),
    todayEarnings: document.getElementById('todayEarnings'),
    weekHours: document.getElementById('weekHours'),
    weekRange: document.getElementById('weekRange'),
    weekEarnings: document.getElementById('weekEarnings'),
    logCount: document.getElementById('logCount'),
    exportBtn: document.getElementById('exportBtn'),
    emptyLog: document.getElementById('emptyLog'),
    shiftList: document.getElementById('shiftList'),
    copyBtn: document.getElementById('copyBtn'),
    toast: document.getElementById('toast')
  };

  let entries = [];
  let currentShift = null;
  let toastTimer = null;

  function init() {
    els.shiftDate.value = localISODate(new Date());
    loadSettings();
    entries = loadEntries();
    bindEvents();
    renderAll();
  }

  function bindEvents() {
    [els.shiftDate, els.startTime, els.endTime, els.breakMinutes].forEach(function (input) {
      input.addEventListener('input', function () {
        hideError();
        renderCurrent();
        renderStats();
      });
      input.addEventListener('change', function () {
        hideError();
        renderCurrent();
        renderStats();
      });
    });

    els.hourlyRate.addEventListener('input', function () {
      hideError();
      renderCurrent();
      saveSettings();
    });

    els.currency.addEventListener('change', function () {
      renderCurrent();
      saveSettings();
    });

    els.addShiftBtn.addEventListener('click', addShift);
    els.resetBtn.addEventListener('click', resetEntry);
    els.copyBtn.addEventListener('click', copySummary);
    els.exportBtn.addEventListener('click', exportCsv);
    els.shiftList.addEventListener('click', handleLogClick);
  }

  function localISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function parseISODate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])) {
      return null;
    }
    return date;
  }

  function isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
  }

  function timeToMinutes(value) {
    const parts = value.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }

  function grossMinutes(start, end) {
    let diff = timeToMinutes(end) - timeToMinutes(start);
    if (diff <= 0) diff += 1440;
    return diff;
  }

  function formatClock(value) {
    const parts = value.split(':').map(Number);
    const suffix = parts[0] >= 12 ? 'PM' : 'AM';
    const hour = parts[0] % 12 || 12;
    return hour + ':' + String(parts[1]).padStart(2, '0') + ' ' + suffix;
  }

  function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return hours + 'h ' + String(mins).padStart(2, '0') + 'm';
  }

  function formatMoney(amount, currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      return currency + ' ' + Number(amount).toFixed(2);
    }
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function formatEntryDate(iso) {
    const date = parseISODate(iso);
    if (!date) return iso;
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function isToday(iso) {
    return iso === localISODate(new Date());
  }

  function startOfWeek(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    return start;
  }

  function addDays(date, count) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + count);
    return next;
  }

  function shortDate(date) {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function validateShift() {
    const dateValue = els.shiftDate.value;
    if (!parseISODate(dateValue)) {
      return { ok: false, message: 'Choose a valid work date.', focus: els.shiftDate };
    }

    const start = els.startTime.value;
    const end = els.endTime.value;
    if (!isValidTime(start) || !isValidTime(end)) {
      return { ok: false, message: 'Add a valid start and end time.', focus: !isValidTime(start) ? els.startTime : els.endTime };
    }

    const rawBreak = els.breakMinutes.value.trim();
    const breakValue = rawBreak === '' ? 0 : Math.round(Number(rawBreak));
    if (!Number.isFinite(breakValue) || breakValue < 0) {
      return { ok: false, message: 'Break minutes must be zero or more.', focus: els.breakMinutes };
    }

    const gross = grossMinutes(start, end);
    const net = gross - breakValue;
    if (net <= 0) {
      return { ok: false, message: 'The unpaid break is longer than the shift.', focus: els.breakMinutes };
    }

    const rawRate = els.hourlyRate.value.trim();
    let rate = null;
    if (rawRate !== '') {
      const parsedRate = Number(rawRate);
      if (!Number.isFinite(parsedRate) || parsedRate < 0) {
        return { ok: false, message: 'Enter a valid hourly rate or leave it blank.', focus: els.hourlyRate };
      }
      rate = round2(parsedRate);
    }

    const currency = els.currency.value || 'INR';
    return {
      ok: true,
      shift: {
        date: dateValue,
        start: start,
        end: end,
        breakMinutes: breakValue,
        grossMinutes: gross,
        minutes: net,
        rate: rate,
        currency: currency,
        earnings: rate === null ? null : round2((net / 60) * rate)
      }
    };
  }

  function renderCurrent() {
    const result = validateShift();
    currentShift = result.ok ? result.shift : null;

    if (!result.ok) {
      els.shiftTotal.textContent = '—';
      els.shiftContext.textContent = result.message;
      els.breakNote.textContent = 'Enter valid shift details to see the total.';
      els.shiftEarnings.textContent = '—';
    } else {
      const shift = result.shift;
      const dateLabel = isToday(shift.date) ? 'Today' : formatEntryDate(shift.date);
      els.shiftTotal.textContent = formatDuration(shift.minutes);
      els.shiftContext.textContent = dateLabel + ' · ' + formatClock(shift.start) + ' to ' + formatClock(shift.end);
      els.breakNote.textContent = shift.breakMinutes > 0
        ? '−' + shift.breakMinutes + ' min unpaid break · ' + formatDuration(shift.grossMinutes) + ' gross'
        : 'No unpaid break · ' + formatDuration(shift.grossMinutes) + ' gross';
      els.shiftEarnings.textContent = shift.rate === null
        ? 'Add a rate'
        : formatMoney(shift.earnings, shift.currency);
    }

    els.copyBtn.disabled = !result.ok && entries.length === 0;
  }

  function earningsText(list) {
    const totals = new Map();
    list.forEach(function (entry) {
      if (entry.earnings === null || !Number.isFinite(entry.earnings)) return;
      totals.set(entry.currency, round2((totals.get(entry.currency) || 0) + entry.earnings));
    });
    if (!totals.size) return 'No pay recorded';
    const parts = [];
    totals.forEach(function (amount, currency) {
      parts.push(formatMoney(amount, currency));
    });
    return 'Pay ' + parts.join(' + ');
  }

  function renderStats() {
    const today = localISODate(new Date());
    const todayEntries = entries.filter(function (entry) { return entry.date === today; });
    const todayMinutes = todayEntries.reduce(function (sum, entry) { return sum + entry.minutes; }, 0);
    els.todayHours.textContent = formatDuration(todayMinutes);
    els.todayEarnings.textContent = earningsText(todayEntries);

    const weekStart = startOfWeek(new Date());
    const weekEnd = addDays(weekStart, 6);
    const startIso = localISODate(weekStart);
    const endIso = localISODate(weekEnd);
    const weekEntries = entries.filter(function (entry) {
      return entry.date >= startIso && entry.date <= endIso;
    });
    const weekMinutes = weekEntries.reduce(function (sum, entry) { return sum + entry.minutes; }, 0);
    els.weekHours.textContent = formatDuration(weekMinutes);
    els.weekRange.textContent = shortDate(weekStart) + ' – ' + shortDate(weekEnd);
    els.weekEarnings.textContent = earningsText(weekEntries);
  }

  function renderAll() {
    renderLog();
    renderCurrent();
    renderStats();
  }

  function renderLog() {
    const sorted = entries.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || b.start.localeCompare(a.start) ||
        (b.createdAt || 0) - (a.createdAt || 0);
    });

    els.shiftList.replaceChildren();
    els.emptyLog.hidden = entries.length > 0;
    els.logCount.textContent = entries.length === 1 ? '1 shift saved' : entries.length + ' shifts saved';
    els.exportBtn.disabled = entries.length === 0;

    sorted.forEach(function (entry) {
      const item = document.createElement('li');
      item.className = 'shift-item';

      const info = document.createElement('div');
      info.className = 'shift-info';

      const dateLine = document.createElement('p');
      dateLine.className = 'shift-date';
      dateLine.appendChild(document.createTextNode(formatEntryDate(entry.date)));
      if (isToday(entry.date)) {
        const badge = document.createElement('span');
        badge.className = 'today-badge';
        badge.textContent = 'Today';
        dateLine.appendChild(badge);
      }

      const meta = document.createElement('p');
      meta.className = 'shift-meta';
      const overnight = entry.end <= entry.start;
      meta.textContent = formatClock(entry.start) + ' – ' + formatClock(entry.end) +
        (entry.breakMinutes > 0 ? ' · ' + entry.breakMinutes + ' min break' : '') +
        (overnight ? ' · overnight' : '');

      info.append(dateLine, meta);

      const values = document.createElement('div');
      values.className = 'shift-values';
      const duration = document.createElement('strong');
      duration.textContent = formatDuration(entry.minutes);
      const pay = document.createElement('span');
      pay.className = 'shift-pay';
      pay.textContent = entry.earnings === null ? 'No pay' : formatMoney(entry.earnings, entry.currency);
      values.append(duration, pay);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-btn';
      remove.setAttribute('data-delete-id', entry.id);
      remove.setAttribute('aria-label', 'Delete shift on ' + formatEntryDate(entry.date));
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>';

      item.append(info, values, remove);
      els.shiftList.appendChild(item);
    });
  }

  function handleLogClick(event) {
    const button = event.target.closest('[data-delete-id]');
    if (!button) return;
    const id = button.getAttribute('data-delete-id');
    const entry = entries.find(function (item) { return item.id === id; });
    if (!entry) return;

    if (!window.confirm('Delete the shift on ' + formatEntryDate(entry.date) + '?')) return;

    entries = entries.filter(function (item) { return item.id !== id; });
    const saved = saveEntries();
    renderAll();
    showToast(saved ? 'Shift deleted.' : 'Shift deleted for this session — storage is unavailable.');
  }

  function addShift() {
    const result = validateShift();
    if (!result.ok) {
      showError(result.message, result.focus);
      return;
    }

    const duplicate = entries.some(function (entry) {
      return entry.date === result.shift.date && entry.start === result.shift.start &&
        entry.end === result.shift.end && entry.breakMinutes === result.shift.breakMinutes;
    });
    if (duplicate) {
      showError('That shift is already in the log. Change a time or the date to add a different one.', els.shiftDate);
      return;
    }

    entries.push(Object.assign({
      id: makeId(),
      createdAt: Date.now()
    }, result.shift));

    hideError();
    const saved = saveEntries();
    renderAll();
    showToast(saved ? 'Shift added to the log.' : 'Shift added for this session — browser storage is unavailable.');
  }

  function resetEntry() {
    els.shiftDate.value = localISODate(new Date());
    els.startTime.value = '09:00';
    els.endTime.value = '17:00';
    els.breakMinutes.value = '0';
    hideError();
    renderCurrent();
    renderStats();
    showToast('Shift entry reset.');
  }

  function makeId() {
    return 'shift-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const date = String(raw.date || '');
    const start = String(raw.start || '');
    const end = String(raw.end || '');
    if (!parseISODate(date) || !isValidTime(start) || !isValidTime(end)) return null;

    const breakMinutes = Math.round(Number(raw.breakMinutes || 0));
    if (!Number.isFinite(breakMinutes) || breakMinutes < 0) return null;

    const net = grossMinutes(start, end) - breakMinutes;
    if (net <= 0) return null;

    let rate = raw.rate === null || raw.rate === undefined || raw.rate === '' ? null : Number(raw.rate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) rate = null;

    const currency = typeof raw.currency === 'string' && raw.currency ? raw.currency : 'INR';

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
      createdAt: Number(raw.createdAt) || Date.now(),
      date: date,
      start: start,
      end: end,
      breakMinutes: breakMinutes,
      minutes: net,
      rate: rate,
      currency: currency,
      earnings: rate === null ? null : round2((net / 60) * rate)
    };
  }

  function loadEntries() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_SHIFTS) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.map(normalizeEntry).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_SHIFTS, JSON.stringify(entries));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}');
      const wantedCurrency = saved && saved.currency;
      if (wantedCurrency && Array.from(els.currency.options).some(function (option) {
        return option.value === wantedCurrency;
      })) {
        els.currency.value = wantedCurrency;
      }
      if (saved && (typeof saved.rate === 'string' || typeof saved.rate === 'number')) {
        els.hourlyRate.value = String(saved.rate);
      }
    } catch (e) {
      /* Storage may be unavailable; defaults remain. */
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify({
        currency: els.currency.value,
        rate: els.hourlyRate.value
      }));
    } catch (e) {
      /* The tool still works for this session. */
    }
  }

  function showError(message, focusElement) {
    els.errorText.textContent = message;
    els.errorMessage.hidden = false;
    [els.shiftDate, els.startTime, els.endTime, els.breakMinutes, els.hourlyRate].forEach(function (input) {
      input.setAttribute('aria-invalid', 'false');
    });
    if (focusElement) {
      focusElement.setAttribute('aria-invalid', 'true');
      focusElement.focus();
    }
  }

  function hideError() {
    els.errorMessage.hidden = true;
    [els.shiftDate, els.startTime, els.endTime, els.breakMinutes, els.hourlyRate].forEach(function (input) {
      input.setAttribute('aria-invalid', 'false');
    });
  }

  function showToast(message) {
    if (toastTimer) window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = window.setTimeout(function () {
      els.toast.classList.remove('show');
      toastTimer = null;
    }, 2800);
  }

  function buildSummary() {
    const lines = [];
    if (currentShift) {
      lines.push('Work shift — ' + formatEntryDate(currentShift.date));
      lines.push(formatClock(currentShift.start) + ' to ' + formatClock(currentShift.end) +
        (currentShift.breakMinutes > 0 ? ' · ' + currentShift.breakMinutes + ' min unpaid break' : ' · no unpaid break'));
      lines.push('Net hours: ' + formatDuration(currentShift.minutes));
      lines.push('Estimated pay: ' + (currentShift.rate === null
        ? 'not set'
        : formatMoney(currentShift.earnings, currentShift.currency)));
      lines.push('');
    }

    const today = localISODate(new Date());
    const todayEntries = entries.filter(function (entry) { return entry.date === today; });
    const todayMinutes = todayEntries.reduce(function (sum, entry) { return sum + entry.minutes; }, 0);
    lines.push('Logged today: ' + formatDuration(todayMinutes) +
      (todayEntries.some(function (entry) { return entry.earnings !== null; })
        ? ' · ' + earningsText(todayEntries)
        : ''));

    const weekStart = startOfWeek(new Date());
    const weekEnd = addDays(weekStart, 6);
    const startIso = localISODate(weekStart);
    const endIso = localISODate(weekEnd);
    const weekEntries = entries.filter(function (entry) {
      return entry.date >= startIso && entry.date <= endIso;
    });
    const weekMinutes = weekEntries.reduce(function (sum, entry) { return sum + entry.minutes; }, 0);
    lines.push('This week (' + shortDate(weekStart) + ' – ' + shortDate(weekEnd) + '): ' + formatDuration(weekMinutes) +
      (weekEntries.some(function (entry) { return entry.earnings !== null; })
        ? ' · ' + earningsText(weekEntries)
        : ''));

    return lines.join('\n').trim();
  }

  function copySummary() {
    if (els.copyBtn.disabled) return;
    const text = buildSummary();
    if (!text) return;
    writeClipboard(text).then(function (ok) {
      showToast(ok ? 'Summary copied.' : 'Copy did not work — select the summary manually.');
    });
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function exportCsv() {
    if (!entries.length) return;
    const header = ['Date', 'Start', 'End', 'Break (minutes)', 'Net hours', 'Hourly rate', 'Currency', 'Earnings'];
    const rows = entries.slice().sort(function (a, b) {
      return a.date.localeCompare(b.date) || a.start.localeCompare(b.start);
    }).map(function (entry) {
      return [
        entry.date,
        entry.start,
        entry.end,
        entry.breakMinutes,
        (entry.minutes / 60).toFixed(2),
        entry.rate === null ? '' : entry.rate.toFixed(2),
        entry.currency,
        entry.earnings === null ? '' : entry.earnings.toFixed(2)
      ];
    });

    const csv = '\uFEFF' + [header].concat(rows).map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'work-hours-' + localISODate(new Date()) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    showToast('CSV downloaded.');
  }

  function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
