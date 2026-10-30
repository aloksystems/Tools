(function () {
  'use strict';

  const dobDay = document.getElementById('dobDay');
  const dobMonth = document.getElementById('dobMonth');
  const dobYear = document.getElementById('dobYear');
  const targetDate = document.getElementById('targetDate');
  const specificDateToggle = document.getElementById('specificDateToggle');
  const specificDateField = document.getElementById('specificDateField');
  const calculateBtn = document.getElementById('calculateBtn');
  const resetBtn = document.getElementById('resetBtn');
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');

  const resultEmpty = document.getElementById('resultEmpty');
  const resultBody = document.getElementById('resultBody');
  const resultContext = document.getElementById('resultContext');
  const copyBtn = document.getElementById('copyBtn');
  const copyStatus = document.getElementById('copyStatus');
  const calcStatus = document.getElementById('calcStatus');
  const liveNote = document.getElementById('liveNote');

  const displayYears = document.getElementById('displayYears');
  const displayMonths = document.getElementById('displayMonths');
  const displayDays = document.getElementById('displayDays');
  const yearsLabel = document.getElementById('yearsLabel');
  const monthsLabel = document.getElementById('monthsLabel');
  const daysLabel = document.getElementById('daysLabel');

  const totalMonths = document.getElementById('totalMonths');
  const totalWeeks = document.getElementById('totalWeeks');
  const totalDays = document.getElementById('totalDays');
  const totalHours = document.getElementById('totalHours');
  const totalMinutes = document.getElementById('totalMinutes');
  const totalSeconds = document.getElementById('totalSeconds');
  const nextBirthdayDays = document.getElementById('nextBirthdayDays');
  const nextBirthdayLabel = document.getElementById('nextBirthdayLabel');
  const nextBirthdayDate = document.getElementById('nextBirthdayDate');
  const dayBorn = document.getElementById('dayBorn');
  const zodiacSign = document.getElementById('zodiacSign');
  const leapYear = document.getElementById('leapYear');

  const MIN_DATE = new Date(1582, 9, 15);
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const ZODIAC_SIGNS = ['Capricorn', 'Aquarius', 'Pisces', 'Aries', 'Taurus', 'Gemini',
    'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius'];
  const ZODIAC_END_DAYS = [19, 18, 20, 19, 20, 20, 22, 22, 22, 22, 21, 21];

  let liveTimer = null;
  let currentSummary = null;
  let copyStatusTimer = null;

  function init() {
    dobYear.max = String(todayStart().getFullYear());
    populateDobChoices();
    setupEvents();
    syncTargetField();
    registerServiceWorker();
  }

  function populateDobChoices() {
    MONTH_NAMES.forEach(function (name, index) {
      const option = document.createElement('option');
      option.value = String(index + 1);
      option.textContent = name;
      dobMonth.appendChild(option);
    });
    rebuildDayOptions();
  }

  function daysInSelectedMonth() {
    const month = Number(dobMonth.value);
    if (!month) return 31;
    const year = Number(dobYear.value);
    if (!year || dobYear.value.trim().length !== 4) return month === 2 ? 29 : new Date(2000, month, 0).getDate();
    return new Date(year, month, 0).getDate();
  }

  function rebuildDayOptions() {
    const maxDay = daysInSelectedMonth();
    const keep = Math.min(Number(dobDay.value) || 0, maxDay);
    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Day';
    fragment.appendChild(placeholder);
    for (let day = 1; day <= maxDay; day++) {
      const option = document.createElement('option');
      option.value = String(day);
      option.textContent = String(day);
      fragment.appendChild(option);
    }
    dobDay.replaceChildren(fragment);
    dobDay.value = keep ? String(keep) : '';
  }

  function getDobValue() {
    const day = Number(dobDay.value);
    const month = Number(dobMonth.value);
    const yearText = dobYear.value.trim();
    if (!day || !month || !/^\d{4}$/.test(yearText)) return '';
    const year = Number(yearText);
    if (day > new Date(year, month, 0).getDate()) return '';
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function handleDobChange() {
    const value = getDobValue();
    targetDate.min = value;
    if (!value) {
      const started = Boolean(dobDay.value || dobMonth.value || dobYear.value.trim());
      hideError();
      clearResults(started ? 'Finish your date of birth to see your age.' : 'Pick your date of birth to begin.');
      return;
    }
    calculate({ announce: true });
  }

  function setupEvents() {
    dobDay.addEventListener('change', handleDobChange);
    dobMonth.addEventListener('change', function () {
      rebuildDayOptions();
      handleDobChange();
    });
    dobYear.addEventListener('input', function () {
      const digits = dobYear.value.replace(/\D/g, '').slice(0, 4);
      if (digits !== dobYear.value) dobYear.value = digits;
      if (digits.length === 4) rebuildDayOptions();
      handleDobChange();
    });

    targetDate.addEventListener('change', function () {
      calculate({ announce: true });
    });
    targetDate.addEventListener('input', function () {
      if (!targetDate.value && specificDateToggle.checked) {
        calculate({ announce: false });
      }
    });

    specificDateToggle.addEventListener('change', function () {
      const enabled = specificDateToggle.checked;
      specificDateField.hidden = !enabled;
      specificDateToggle.setAttribute('aria-expanded', String(enabled));
      if (enabled) {
        if (!targetDate.value) targetDate.value = toInputValue(todayStart());
        targetDate.min = getDobValue();
        targetDate.focus();
      }
      calculate({ announce: enabled });
    });

    calculateBtn.addEventListener('click', function () {
      calculate({ announce: true, scroll: true, forceErrors: true });
    });

    resetBtn.addEventListener('click', resetAll);
    copyBtn.addEventListener('click', copySummary);
  }

  function syncTargetField() {
    specificDateField.hidden = !specificDateToggle.checked;
    specificDateToggle.setAttribute('aria-expanded', String(specificDateToggle.checked));
  }

  function resetAll() {
    stopLiveTimer();
    dobDay.value = '';
    dobMonth.value = '';
    dobYear.value = '';
    rebuildDayOptions();
    targetDate.value = '';
    targetDate.min = '';
    specificDateToggle.checked = false;
    syncTargetField();
    hideError();
    clearResults('Pick your date of birth to begin.');
    copyStatus.textContent = '';
    currentSummary = null;
    focusDob();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function parseInputDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function todayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function toInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function dayStamp(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function calendarDaysBetween(from, to) {
    return Math.round((dayStamp(to) - dayStamp(from)) / 86400000);
  }

  function isSameDay(a, b) {
    return dayStamp(a) === dayStamp(b);
  }

  function addMonthsClamped(start, months) {
    const anchor = new Date(start.getFullYear(), start.getMonth() + months, 1);
    const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return new Date(anchor.getFullYear(), anchor.getMonth(), Math.min(start.getDate(), lastDay));
  }

  function calcAge(birth, target) {
    let total = (target.getFullYear() - birth.getFullYear()) * 12 +
      (target.getMonth() - birth.getMonth());
    let anchor = addMonthsClamped(birth, total);
    if (anchor > target) {
      total -= 1;
      anchor = addMonthsClamped(birth, total);
    }
    const days = calendarDaysBetween(anchor, target);
    const years = Math.floor(total / 12);
    return { years: years, months: total - years * 12, days: days, totalMonths: total };
  }

  function calcTotals(birth, target, useNow) {
    const birthMidnight = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate());
    const instant = useNow ? new Date() : new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const elapsed = Math.max(0, instant.getTime() - birthMidnight.getTime());
    const days = Math.max(0, calendarDaysBetween(birth, target));
    return {
      days: days,
      weeks: Math.floor(days / 7),
      hours: Math.floor(elapsed / 3600000),
      minutes: Math.floor(elapsed / 60000),
      seconds: Math.floor(elapsed / 1000)
    };
  }

  function birthdayForYear(birth, year) {
    const isLeapDay = birth.getMonth() === 1 && birth.getDate() === 29;
    const day = isLeapDay && !isLeapYear(year) ? 28 : birth.getDate();
    return new Date(year, birth.getMonth(), day);
  }

  function calcNextBirthday(birth, from) {
    let next = birthdayForYear(birth, from.getFullYear());
    if (dayStamp(next) < dayStamp(from)) {
      next = birthdayForYear(birth, from.getFullYear() + 1);
    }
    return { date: next, days: calendarDaysBetween(from, next) };
  }

  function calculate(options) {
    const opts = options || {};
    const dobValue = getDobValue();
    const dob = parseInputDate(dobValue);
    const target = specificDateToggle.checked && targetDate.value
      ? parseInputDate(targetDate.value)
      : todayStart();

    if (!dobValue) {
      hideError();
      clearResults('Pick your date of birth to begin.');
      if (opts.forceErrors) {
        showError('Choose your full date of birth — day, month, and year.', 'dob');
      }
      return;
    }

    if (!dob) {
      showError('That date of birth is not valid. Please choose it again.', 'dob');
      clearResults('Pick a valid date of birth.');
      return;
    }

    if (dob < MIN_DATE) {
      showError('Choose a date on or after 15 October 1582.', 'dob');
      clearResults('The date of birth is outside the supported range.');
      return;
    }

    const today = todayStart();
    if (dob > today) {
      showError('Date of birth cannot be in the future.', 'dob');
      clearResults('Enter a date of birth that is not in the future.');
      return;
    }

    if (specificDateToggle.checked && targetDate.value && !target) {
      showError('That measuring date is not valid. Please choose it again.', 'target');
      clearResults('Choose a valid measuring date.');
      return;
    }

    if (target && target < dob) {
      showError('The measuring date must be on or after your date of birth.', 'target');
      clearResults('Choose a measuring date on or after your birthday.');
      return;
    }

    hideError();
    renderResult(dob, target || today, opts);
  }

  function renderResult(birth, target, opts) {
    stopLiveTimer();

    const age = calcAge(birth, target);
    const live = isSameDay(target, todayStart());
    const totals = calcTotals(birth, target, live);
    const next = calcNextBirthday(birth, target);
    const projected = dayStamp(target) > dayStamp(todayStart());
    const targetLabel = formatDate(target);

    resultEmpty.hidden = true;
    resultBody.hidden = false;
    copyBtn.disabled = false;

    resultContext.textContent = projected
      ? 'Projected for ' + targetLabel + '.'
      : live
        ? 'Measured today, ' + targetLabel + '.'
        : 'Measured on ' + targetLabel + '.';

    animateValue(displayYears, age.years, 650);
    animateValue(displayMonths, age.months, 500);
    animateValue(displayDays, age.days, 400);
    yearsLabel.textContent = plural(age.years, 'year');
    monthsLabel.textContent = plural(age.months, 'month');
    daysLabel.textContent = plural(age.days, 'day');

    animateValue(totalMonths, age.totalMonths, 680);
    animateValue(totalWeeks, totals.weeks, 700);
    animateValue(totalDays, totals.days, 720);
    animateValue(totalHours, totals.hours, 740);
    animateValue(totalMinutes, totals.minutes, 760);
    animateValue(totalSeconds, totals.seconds, 780);

    nextBirthdayDays.textContent = next.days.toLocaleString('en-US');
    nextBirthdayLabel.textContent = next.days === 0 ? "It's today" : plural(next.days, 'day to go', 'days to go');
    nextBirthdayDate.textContent = next.days === 0 ? formatDate(next.date) + ' · today' : formatDate(next.date);

    dayBorn.textContent = DAY_NAMES[birth.getDay()];
    zodiacSign.textContent = getZodiac(birth);
    leapYear.textContent = isLeapYear(birth.getFullYear()) ? 'Yes' : 'No';

    liveNote.textContent = live
      ? 'Totals update live because you are measuring to today.'
      : 'Totals are fixed to ' + targetLabel + '.';

    currentSummary = {
      birth: birth,
      target: target,
      age: age,
      totals: totals,
      next: next,
      live: live,
      projected: projected,
      targetLabel: targetLabel
    };

    calcStatus.textContent = 'Age calculated: ' + age.years + ' ' + plural(age.years, 'year') + ', ' +
      age.months + ' ' + plural(age.months, 'month') + ', and ' + age.days + ' ' +
      plural(age.days, 'day') + '.';

    if (live) startLiveTimer(birth, target);

    if (opts.scroll && window.matchMedia('(max-width: 700px)').matches) {
      document.querySelector('.summary-panel').scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  }

  function clearResults(message) {
    stopLiveTimer();
    currentSummary = null;
    resultBody.hidden = true;
    resultEmpty.hidden = false;
    copyBtn.disabled = true;
    resultContext.textContent = message || 'Pick your date of birth to begin.';
    copyStatus.textContent = '';
    calcStatus.textContent = '';
  }

  function startLiveTimer(birth, target) {
    stopLiveTimer();
    liveTimer = window.setInterval(function () {
      const totals = calcTotals(birth, target, true);
      totalHours.textContent = totals.hours.toLocaleString('en-US');
      totalMinutes.textContent = totals.minutes.toLocaleString('en-US');
      totalSeconds.textContent = totals.seconds.toLocaleString('en-US');
      if (currentSummary) {
        currentSummary.totals = totals;
      }
    }, 1000);
  }

  function stopLiveTimer() {
    if (liveTimer !== null) {
      window.clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  function showError(message, focusTarget) {
    errorText.textContent = message;
    errorMessage.hidden = false;
    setDobInvalid(false);
    targetDate.setAttribute('aria-invalid', 'false');
    if (focusTarget === 'dob') {
      setDobInvalid(true);
      focusDob();
    } else if (focusTarget === 'target') {
      targetDate.setAttribute('aria-invalid', 'true');
      targetDate.focus();
    }
  }

  function hideError() {
    errorMessage.hidden = true;
    setDobInvalid(false);
    targetDate.setAttribute('aria-invalid', 'false');
  }

  function setDobInvalid(invalid) {
    [dobDay, dobMonth, dobYear].forEach(function (el) {
      el.setAttribute('aria-invalid', String(invalid));
    });
  }

  function focusDob() {
    if (!dobDay.value) {
      dobDay.focus();
    } else if (!dobMonth.value) {
      dobMonth.focus();
    } else {
      dobYear.focus();
    }
  }

  function animateValue(el, value, duration) {
    if (!el) return;
    const target = Math.max(0, Number(value) || 0);
    if (prefersReducedMotion()) {
      el.textContent = target.toLocaleString('en-US');
      return;
    }
    const token = String((Number(el.dataset.animToken) || 0) + 1);
    el.dataset.animToken = token;
    const startTime = performance.now();

    function frame(now) {
      if (el.dataset.animToken !== token) return;
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (progress < 1) requestAnimationFrame(frame);
      else el.textContent = target.toLocaleString('en-US');
    }
    requestAnimationFrame(frame);
  }

  function getZodiac(date) {
    const month = date.getMonth();
    const day = date.getDate();
    const index = day <= ZODIAC_END_DAYS[month] ? (month + 11) % 12 : month;
    return ZODIAC_SIGNS[index];
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function plural(count, singular, pluralForm) {
    return Number(count) === 1 ? singular : (pluralForm || singular + 's');
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function buildCopyText() {
    if (!currentSummary) return '';
    const s = currentSummary;
    const measured = s.projected
      ? 'Projected for ' + s.targetLabel
      : s.live
        ? 'Measured today, ' + s.targetLabel
        : 'Measured on ' + s.targetLabel;
    const nextLine = s.next.days === 0
      ? 'Next birthday: today, ' + formatDate(s.next.date)
      : 'Next birthday: ' + formatDate(s.next.date) + ' (' + s.next.days + ' ' +
        plural(s.next.days, 'day') + ' to go)';
    return [
      'Age summary — ' + measured,
      'Exact age: ' + s.age.years + ' ' + plural(s.age.years, 'year') + ', ' +
        s.age.months + ' ' + plural(s.age.months, 'month') + ', ' +
        s.age.days + ' ' + plural(s.age.days, 'day'),
      'Total: ' + s.age.totalMonths.toLocaleString('en-US') + ' months · ' +
        s.totals.weeks.toLocaleString('en-US') + ' weeks · ' +
        s.totals.days.toLocaleString('en-US') + ' days · ' +
        s.totals.hours.toLocaleString('en-US') + ' hours',
      nextLine,
      'Born on a ' + DAY_NAMES[s.birth.getDay()] + '.'
    ].join('\n');
  }

  function copySummary() {
    const text = buildCopyText();
    if (!text) return;
    writeClipboard(text).then(function (ok) {
      copyStatus.textContent = ok ? 'Copied to clipboard.' : 'Copy did not work — select the result manually.';
      if (copyStatusTimer) window.clearTimeout(copyStatusTimer);
      copyStatusTimer = window.setTimeout(function () {
        copyStatus.textContent = '';
      }, 4000);
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

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('service-worker.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
