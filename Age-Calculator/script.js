(function () {
  'use strict';

  const dobDay = document.getElementById('dobDay');
  const dobMonth = document.getElementById('dobMonth');
  const dobYear = document.getElementById('dobYear');
  const targetDay = document.getElementById('targetDay');
  const targetMonth = document.getElementById('targetMonth');
  const targetYear = document.getElementById('targetYear');
  const calculateBtn = document.getElementById('calculateBtn');
  const resetBtn = document.getElementById('resetBtn');
  const themeBtn = document.getElementById('themeBtn');
  const toggleSpecificDate = document.getElementById('toggleSpecificDate');
  const specificDateField = document.getElementById('specificDateField');
  const resultsSection = document.getElementById('resultsSection');
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');

  let birthDate = null;
  let targetDate = null;
  let secondsInterval = null;
  let isSpecificDate = false;

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ZODIAC_SIGNS = ['Capricorn', 'Aquarius', 'Pisces', 'Aries', 'Taurus', 'Gemini',
    'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius'];
  const ZODIAC_END_DATES = [19, 18, 20, 19, 20, 20, 22, 22, 22, 22, 21, 21];

  function init() {
    loadTheme();
    setupEventListeners();
    registerSW();
  }

  function setupEventListeners() {
    calculateBtn.addEventListener('click', function (e) {
      createRipple(e);
      handleCalculate();
    });
    resetBtn.addEventListener('click', handleReset);
    themeBtn.addEventListener('click', toggleTheme);

    toggleSpecificDate.addEventListener('click', function () {
      isSpecificDate = !isSpecificDate;
      specificDateField.classList.toggle('hidden', !isSpecificDate);
      this.classList.toggle('active', isSpecificDate);
      this.setAttribute('aria-expanded', String(isSpecificDate));
      const span = this.querySelector('span');
      span.textContent = isSpecificDate ? 'Calculate age on today\'s date' : 'Calculate age on a specific date';
    });

    setupAutoTab(dobDay, dobMonth);
    setupAutoTab(dobMonth, dobYear);
    setupAutoTab(targetDay, targetMonth);
    setupAutoTab(targetMonth, targetYear);

    [dobDay, dobMonth, dobYear, targetDay, targetMonth, targetYear].forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleCalculate();
      });
      el.addEventListener('blur', function () {
        if (this.value.length > 0 && this.value.length < parseInt(this.getAttribute('maxlength'))) {
          this.value = this.value.padStart(parseInt(this.getAttribute('maxlength')), '0');
        }
      });
    });
  }

  function setupAutoTab(current, next) {
    current.addEventListener('input', function () {
      if (this.value.length >= parseInt(this.getAttribute('maxlength'))) {
        next.focus();
        next.select();
      }
    });
  }

  function getDOBValues() {
    return {
      day: dobDay.value.trim(),
      month: dobMonth.value.trim(),
      year: dobYear.value.trim()
    };
  }

  function getTargetValues() {
    return {
      day: targetDay.value.trim(),
      month: targetMonth.value.trim(),
      year: targetYear.value.trim()
    };
  }

  function handleCalculate() {
    const dob = getDOBValues();

    if (!dob.day || !dob.month || !dob.year) {
      showError('Please enter your complete date of birth (DD-MM-YYYY).');
      if (!dob.day) dobDay.focus();
      else if (!dob.month) dobMonth.focus();
      else dobYear.focus();
      return;
    }

    const parsedDOB = parseDate(dob.day, dob.month, dob.year);
    if (!parsedDOB) {
      showError('Please enter a valid date. Example: 20-10-2005');
      return;
    }

    const now = new Date();
    if (parsedDOB > now) {
      showError('Date of birth cannot be in the future.');
      return;
    }

    if (parsedDOB < new Date(1582, 9, 15)) {
      showError('Please enter a date on or after 15 October 1582.');
      return;
    }

    birthDate = parsedDOB;

    if (isSpecificDate) {
      const tgt = getTargetValues();
      if (tgt.day || tgt.month || tgt.year) {
        if (!tgt.day || !tgt.month || !tgt.year) {
          showError('Please enter the complete target date (DD-MM-YYYY).');
          return;
        }
        const parsedTarget = parseDate(tgt.day, tgt.month, tgt.year);
        if (!parsedTarget) {
          showError('Please enter a valid target date.');
          return;
        }
        if (parsedTarget < parsedDOB) {
          showError('The selected date must be on or after the date of birth.');
          return;
        }
        targetDate = parsedTarget;
      } else {
        targetDate = null;
      }
    } else {
      targetDate = null;
    }

    hideError();
    calculateAndDisplay(birthDate, targetDate || new Date());
  }

  function parseDate(dayStr, monthStr, yearStr) {
    if (!/^\d{1,2}$/.test(dayStr) || !/^\d{1,2}$/.test(monthStr) || !/^\d{4}$/.test(yearStr)) return null;
    const d = Number(dayStr);
    const m = Number(monthStr);
    const y = Number(yearStr);

    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    if (d < 1 || d > 31) return null;
    if (m < 1 || m > 12) return null;
    if (y < 1 || y > 9999) return null;

    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  function calculateAndDisplay(birth, target) {
    const age = calcAge(birth, target);
    const totals = calcTotals(birth, target);
    const nextBirthday = calcNextBirthday(birth, target);

    displayAge(age);
    displayTotals(totals);
    displayNextBirthday(nextBirthday);
    displayOptionalInfo(birth);

    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });

    startLiveSeconds(birth, target);
  }

  function calcAge(birth, target) {
    let years = target.getFullYear() - birth.getFullYear();
    let months = target.getMonth() - birth.getMonth();
    const birthDay = birth.getMonth() === 1 && birth.getDate() === 29 && !isLeapYear(target.getFullYear())
      ? 28
      : birth.getDate();
    let days = target.getDate() - birthDay;

    if (days < 0) {
      months--;
      const prevMonth = new Date(target.getFullYear(), target.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    return { years, months, days };
  }

  function calcTotals(birth, target) {
    const birthDay = Date.UTC(birth.getFullYear(), birth.getMonth(), birth.getDate());
    const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    const totalDays = Math.floor((targetDay - birthDay) / 86400000);
    const totalWeeks = Math.floor(totalDays / 7);
    const elapsedMilliseconds = Math.max(0, target.getTime() - birth.getTime());
    const totalHours = Math.floor(elapsedMilliseconds / 3600000);
    const totalMinutes = Math.floor(elapsedMilliseconds / 60000);
    const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
    return { totalDays, totalWeeks, totalHours, totalMinutes, totalSeconds };
  }

  function calcNextBirthday(birth, target) {
    let next = makeBirthdayDate(target.getFullYear(), birth);
    const nextDay = Date.UTC(next.getFullYear(), next.getMonth(), next.getDate());
    const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    if (nextDay < targetDay) {
      return getNextBirthday(birth, target, target.getFullYear() + 1);
    }
    const daysLeft = calendarDaysBetween(target, next);
    return { date: next, daysLeft };
  }

  function getNextBirthday(birth, target, year) {
    const next = makeBirthdayDate(year, birth);
    return { date: next, daysLeft: calendarDaysBetween(target, next) };
  }

  function makeBirthdayDate(year, birth) {
    const day = birth.getMonth() === 1 && birth.getDate() === 29 && !isLeapYear(year) ? 28 : birth.getDate();
    return new Date(year, birth.getMonth(), day);
  }

  function calendarDaysBetween(from, to) {
    const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.max(0, Math.round((toDay - fromDay) / 86400000));
  }

  function displayAge(age) {
    const yearsEl = document.getElementById('displayYears');
    const monthsEl = document.getElementById('displayMonths');
    const daysEl = document.getElementById('displayDays');
    animateValue(yearsEl, 0, age.years, 600);
    animateValue(monthsEl, 0, age.months, 500);
    animateValue(daysEl, 0, age.days, 400);
  }

  function displayTotals(totals) {
    const age = calcAge(birthDate, targetDate || new Date());
    const els = {
      detailYears: age.years,
      detailMonths: age.years * 12 + age.months,
      detailWeeks: totals.totalWeeks,
      detailDays: totals.totalDays,
      detailHours: totals.totalHours,
      detailMinutes: totals.totalMinutes,
      detailSeconds: totals.totalSeconds,
    };

    Object.keys(els).forEach((id, index) => {
      const el = document.getElementById(id);
      if (el) {
        const duration = 600 + index * 80;
        animateValue(el, 0, els[id], duration);
      }
    });
  }

  function displayNextBirthday(nextBirthday) {
    document.getElementById('nextBirthdayDays').textContent = nextBirthday.daysLeft;
    const d = nextBirthday.date;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    document.getElementById('nextBirthdayDate').querySelector('.date-dmy').textContent = `${day}-${month}-${year}`;
  }

  function displayOptionalInfo(birth) {
    document.getElementById('dayBorn').textContent = DAY_NAMES[birth.getDay()];
    document.getElementById('zodiacSign').textContent = getZodiac(birth);
    document.getElementById('leapYear').textContent = isLeapYear(birth.getFullYear()) ? 'Yes' : 'No';
  }

  function getZodiac(date) {
    const month = date.getMonth();
    const day = date.getDate();
    let index = month;
    if (day <= ZODIAC_END_DATES[month]) {
      index = month === 0 ? 11 : month - 1;
    }
    return ZODIAC_SIGNS[index];
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  function animateValue(el, start, end, duration) {
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = Number(end).toLocaleString();
      return;
    }
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  }

  function startLiveSeconds(birth, target) {
    if (secondsInterval) {
      clearInterval(secondsInterval);
    }

    const isLiveMode = target.toDateString() === new Date().toDateString();

    if (!isLiveMode) {
      return;
    }

    secondsInterval = setInterval(function () {
      const now = new Date();
      const diffSeconds = Math.floor((now - birth) / 1000);
      const secEl = document.getElementById('detailSeconds');
      if (secEl) {
        secEl.textContent = diffSeconds.toLocaleString();
      }
    }, 1000);
  }

  function showError(msg) {
    errorText.textContent = msg;
    errorMessage.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    if (secondsInterval) {
      clearInterval(secondsInterval);
      secondsInterval = null;
    }
  }

  function hideError() {
    errorMessage.classList.add('hidden');
  }

  function handleReset() {
    dobDay.value = '';
    dobMonth.value = '';
    dobYear.value = '';
    targetDay.value = '';
    targetMonth.value = '';
    targetYear.value = '';
    resultsSection.classList.add('hidden');
    hideError();
    if (secondsInterval) {
      clearInterval(secondsInterval);
      secondsInterval = null;
    }
    birthDate = null;
    targetDate = null;
    if (isSpecificDate) {
      isSpecificDate = false;
      specificDateField.classList.add('hidden');
      toggleSpecificDate.classList.remove('active');
      toggleSpecificDate.setAttribute('aria-expanded', 'false');
      toggleSpecificDate.querySelector('span').textContent = 'Calculate age on a specific date';
    }
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    dobDay.focus();
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    updateThemeControl();
    try { localStorage.setItem('tools-theme', next); } catch (e) { /* Theme still applies for this visit. */ }
  }

  function loadTheme() {
    let saved = null;
    try { saved = localStorage.getItem('tools-theme'); } catch (e) { /* Storage may be disabled. */ }
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeControl();
  }

  function updateThemeControl() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.setAttribute('aria-pressed', String(isDark));
    themeBtn.innerHTML = isDark
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg>';
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function createRipple(e) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', function () {
      ripple.remove();
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('service-worker.js').catch(function () {
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
