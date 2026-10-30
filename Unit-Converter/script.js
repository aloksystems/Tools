(function () {
  'use strict';

  const CATEGORIES = {
    length: {
      name: 'Length',
      units: {
        Meters: 1,
        Kilometers: 1000,
        Miles: 1609.344,
        Feet: 0.3048,
        Inches: 0.0254,
        Centimeters: 0.01,
        Millimeters: 0.001,
        Yards: 0.9144
      },
      defaults: ['Meters', 'Feet']
    },
    mass: {
      name: 'Mass',
      units: {
        Kilograms: 1,
        Grams: 0.001,
        Milligrams: 0.000001,
        Pounds: 0.45359237,
        Ounces: 0.028349523125,
        'Tons (metric)': 1000,
        Stones: 6.35029318
      },
      defaults: ['Kilograms', 'Pounds']
    },
    temperature: {
      name: 'Temperature',
      units: ['Celsius', 'Fahrenheit', 'Kelvin'],
      defaults: ['Celsius', 'Fahrenheit'],
      special: true
    },
    volume: {
      name: 'Volume',
      units: {
        Liters: 1,
        Milliliters: 0.001,
        'Gallons (US)': 3.785411784,
        'Quarts (US)': 0.946352946,
        'Pints (US)': 0.473176473,
        'Cups (US)': 0.2365882365,
        'Fluid Ounces (US)': 0.0295735295625,
        'Cubic Meters': 1000
      },
      defaults: ['Liters', 'Gallons (US)']
    },
    area: {
      name: 'Area',
      units: {
        'Square Meters': 1,
        'Square Kilometers': 1000000,
        'Square Centimeters': 0.0001,
        'Square Feet': 0.09290304,
        'Square Inches': 0.00064516,
        'Square Yards': 0.83612736,
        Acres: 4046.8564224,
        Hectares: 10000,
        'Square Miles': 2589988.110336
      },
      defaults: ['Square Meters', 'Square Feet']
    },
    speed: {
      name: 'Speed',
      units: {
        'Meters per Second': 1,
        'Kilometers per Hour': 1 / 3.6,
        'Miles per Hour': 0.44704,
        'Feet per Second': 0.3048,
        Knots: 0.5144444444444445
      },
      defaults: ['Kilometers per Hour', 'Miles per Hour']
    },
    time: {
      name: 'Time',
      units: {
        Milliseconds: 0.001,
        Seconds: 1,
        Minutes: 60,
        Hours: 3600,
        Days: 86400,
        Weeks: 604800
      },
      defaults: ['Hours', 'Minutes']
    },
    data: {
      name: 'Data',
      units: {
        Bits: 0.125,
        Bytes: 1,
        'Kilobytes (kB)': 1000,
        'Megabytes (MB)': 1000000,
        'Gigabytes (GB)': 1000000000,
        'Terabytes (TB)': 1000000000000,
        'Kibibytes (KiB)': 1024,
        'Mebibytes (MiB)': 1048576,
        'Gibibytes (GiB)': 1073741824,
        'Tebibytes (TiB)': 1099511627776
      },
      defaults: ['Megabytes (MB)', 'Mebibytes (MiB)']
    }
  };

  const TEMPERATURE = {
    Celsius: { toBase: function (v) { return v; }, fromBase: function (v) { return v; } },
    Fahrenheit: {
      toBase: function (v) { return (v - 32) * 5 / 9; },
      fromBase: function (v) { return v * 9 / 5 + 32; }
    },
    Kelvin: {
      toBase: function (v) { return v - 273.15; },
      fromBase: function (v) { return v + 273.15; }
    }
  };

  const fromValue = document.getElementById('from-value');
  const toValue = document.getElementById('to-value');
  const fromUnit = document.getElementById('from-unit');
  const toUnit = document.getElementById('to-unit');
  const swapBtn = document.getElementById('swap-btn');
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const copyBtn = document.getElementById('copyBtn');
  const copyStatus = document.getElementById('copyStatus');
  const liveStatus = document.getElementById('liveStatus');
  const resultContext = document.getElementById('resultContext');
  const resultUnit = document.getElementById('resultUnit');
  const equation = document.getElementById('equation');
  const inputError = document.getElementById('inputError');
  const inputErrorText = document.getElementById('inputErrorText');
  const reference = document.getElementById('reference');
  const referenceList = document.getElementById('referenceList');

  let currentCategory = 'length';
  let copyStatusTimer = null;

  function unitNames(category) {
    const data = CATEGORIES[category];
    return data.special ? data.units.slice() : Object.keys(data.units);
  }

  function populateSelect(select, names, selected) {
    select.replaceChildren();
    names.forEach(function (name) {
      select.add(new Option(name, name));
    });
    select.value = selected;
  }

  function switchCategory(category) {
    if (!CATEGORIES[category]) return;
    currentCategory = category;
    const data = CATEGORIES[category];
    const names = unitNames(category);

    tabButtons.forEach(function (button) {
      const active = button.dataset.category === category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    populateSelect(fromUnit, names, data.defaults[0]);
    populateSelect(toUnit, names, data.defaults[1]);
    copyStatus.textContent = '';
    updateConversion({ announce: true, categoryChanged: true });
  }

  function parseAmount(raw) {
    const cleaned = String(raw).trim().replace(/,/g, '');
    if (!cleaned) return { empty: true };
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) {
      return { invalid: true };
    }
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return { invalid: true };
    return { value: value };
  }

  function convertValue(value, from, to) {
    if (CATEGORIES[currentCategory].special) {
      return TEMPERATURE[to].fromBase(TEMPERATURE[from].toBase(value));
    }
    const factors = CATEGORIES[currentCategory].units;
    return value * factors[from] / factors[to];
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs < 0.000001 || abs >= 1000000000000) {
      return value.toExponential(6)
        .replace(/\.?0+e/, 'e')
        .replace('e+', 'e');
    }
    return new Intl.NumberFormat('en-US', {
      maximumSignificantDigits: 10
    }).format(value);
  }

  function formatEditable(value) {
    if (!Number.isFinite(value)) return '';
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toPrecision(12)));
  }

  function updateConversion(options) {
    const opts = options || {};
    const parsed = parseAmount(fromValue.value);
    const data = CATEGORIES[currentCategory];

    if (parsed.empty || parsed.invalid) {
      toValue.textContent = '—';
      resultUnit.textContent = '';
      resultContext.textContent = data.name + ' conversion · ' + fromUnit.value + ' to ' + toUnit.value;
      inputError.hidden = parsed.empty;
      fromValue.setAttribute('aria-invalid', String(Boolean(parsed.invalid)));
      if (parsed.invalid) {
        inputErrorText.textContent = 'Enter a valid number, such as 12.5.';
        equation.textContent = 'Check the amount and try again.';
      } else {
        equation.textContent = 'Enter an amount to see the conversion.';
      }
      copyBtn.disabled = true;
      reference.hidden = true;
      return;
    }

    const result = convertValue(parsed.value, fromUnit.value, toUnit.value);
    if (!Number.isFinite(result)) {
      toValue.textContent = '—';
      resultUnit.textContent = '';
      equation.textContent = 'This value is too large to convert.';
      inputError.hidden = false;
      inputErrorText.textContent = 'That number is too large to convert.';
      fromValue.setAttribute('aria-invalid', 'true');
      copyBtn.disabled = true;
      reference.hidden = true;
      return;
    }

    inputError.hidden = true;
    fromValue.setAttribute('aria-invalid', 'false');
    copyBtn.disabled = false;

    const from = fromUnit.value;
    const to = toUnit.value;
    const formattedResult = formatNumber(result);
    toValue.textContent = formattedResult;
    resultUnit.textContent = to;
    resultContext.textContent = data.name + ' conversion · ' + from + ' to ' + to;
    equation.textContent = formatNumber(parsed.value) + ' ' + from + ' = ' + formattedResult + ' ' + to;

    renderReference(parsed.value, from, to);

    if (opts.announce) {
      liveStatus.textContent = opts.categoryChanged
        ? data.name + ' category selected. ' + from + ' to ' + to + '.'
        : equation.textContent;
    }
    copyStatus.textContent = '';
  }

  function renderReference(value, from, to) {
    const names = unitNames(currentCategory).filter(function (name) {
      return name !== from && name !== to;
    });

    referenceList.replaceChildren();
    if (!names.length) {
      reference.hidden = true;
      return;
    }

    reference.hidden = false;
    names.slice(0, 4).forEach(function (name) {
      const converted = convertValue(value, from, name);
      const li = document.createElement('li');
      const unit = document.createElement('span');
      const amount = document.createElement('strong');
      unit.textContent = name;
      amount.textContent = formatNumber(converted);
      li.append(unit, amount);
      referenceList.appendChild(li);
    });
  }

  function swapUnits() {
    const parsed = parseAmount(fromValue.value);
    let previousResult = null;
    if (parsed.value !== undefined) {
      previousResult = convertValue(parsed.value, fromUnit.value, toUnit.value);
    }

    const previousFrom = fromUnit.value;
    fromUnit.value = toUnit.value;
    toUnit.value = previousFrom;

    if (previousResult !== null && Number.isFinite(previousResult)) {
      fromValue.value = formatEditable(previousResult);
    }

    updateConversion({ announce: true });
    liveStatus.textContent = 'Units swapped. ' + fromUnit.value + ' to ' + toUnit.value + '.';
    animateSwapIcon();
  }

  function animateSwapIcon() {
    const icon = swapBtn.querySelector('svg');
    if (!icon || prefersReducedMotion()) return;
    icon.classList.remove('is-spinning');
    void icon.offsetWidth;
    icon.classList.add('is-spinning');
    icon.addEventListener('animationend', function () {
      icon.classList.remove('is-spinning');
    }, { once: true });
  }

  function copyResult() {
    const text = equation.textContent;
    if (copyBtn.disabled || !text) return;
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

  function init() {
    tabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        switchCategory(button.dataset.category);
      });
    });

    fromValue.addEventListener('input', function () {
      updateConversion({ announce: false });
    });

    fromValue.addEventListener('change', function () {
      updateConversion({ announce: true });
    });

    fromValue.addEventListener('focus', function () {
      fromValue.select();
    });

    fromUnit.addEventListener('change', function () {
      updateConversion({ announce: true });
    });

    toUnit.addEventListener('change', function () {
      updateConversion({ announce: true });
    });

    swapBtn.addEventListener('click', swapUnits);
    copyBtn.addEventListener('click', copyResult);

    switchCategory('length');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
