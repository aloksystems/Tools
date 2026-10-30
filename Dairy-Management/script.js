(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fields = {
    name: $('customerName'), customer: $('customerSelect'), start: $('startDate'), end: $('endDate'),
    missing: $('missingDates'), quantity: $('milkQty'), price: $('pricePerLiter')
  };
  const errorBox = $('inputError');
  const formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  let customers = readCustomers();
  let currentCustomer = '';
  let lastPrice = readLastPrice();
  let latestAccount = null;

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function readLastPrice() {
    const value = Number(safeStorageGet('lastPrice'));
    return Number.isFinite(value) && value >= 0 && value <= 1000000 ? value : 0;
  }

  function readCustomers() {
    let parsed;
    try { parsed = JSON.parse(safeStorageGet('customers') || '{}'); } catch (error) { parsed = {}; }
    const safe = Object.create(null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return safe;
    Object.keys(parsed).forEach((name) => {
      if (!validCustomerName(name)) return;
      const source = parsed[name];
      if (!source || typeof source !== 'object' || Array.isArray(source)) return;
      safe[name] = {
        startDate: parseDateOnly(source.startDate)?.key || '',
        endDate: parseDateOnly(source.endDate)?.key || '',
        missingDates: typeof source.missingDates === 'string' ? source.missingDates.slice(0, 20000) : '',
        milkQty: boundedNumber(source.milkQty, 1, 0.01, 10000),
        pricePerLiter: boundedNumber(source.pricePerLiter, 0, 0, 1000000)
      };
    });
    return safe;
  }

  function persistCustomers() {
    try { localStorage.setItem('customers', JSON.stringify(customers)); } catch (error) { showError('Your browser could not save customer records. You can still calculate and export this account.'); }
  }

  function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
  }

  function validCustomerName(name) {
    return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80 && !/[\u0000-\u001f\u007f]/.test(name);
  }

  function pad(value) { return String(value).padStart(2, '0'); }

  function parseDateOnly(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    let year, month, day;
    let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match) {
      year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
    } else {
      match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
      if (!match) return null;
      day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
      if (year < 100) year += 2000;
    }
    if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return { key: `${year}-${pad(month)}-${pad(day)}`, year, month, day };
  }

  function currentDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function addDays(key, amount) {
    const date = new Date(`${key}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  function dateLabel(key) {
    const date = new Date(`${key}T00:00:00Z`);
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  function setDateRange(start, end) {
    fields.start.value = start;
    fields.end.value = end;
    updateResults();
  }

  function setThisMonth() {
    const today = currentDateKey();
    setDateRange(`${today.slice(0, 8)}01`, today);
  }

  function setLastDays(count) {
    const end = currentDateKey();
    setDateRange(addDays(end, -(count - 1)), end);
  }

  function selectCustomer(name) {
    currentCustomer = Object.prototype.hasOwnProperty.call(customers, name) ? name : '';
    if (!currentCustomer) {
      updateResults();
      return;
    }
    const record = customers[currentCustomer];
    fields.start.value = record.startDate || fields.start.value;
    fields.end.value = record.endDate || fields.end.value;
    fields.missing.value = record.missingDates;
    fields.quantity.value = String(record.milkQty);
    fields.price.value = String(record.pricePerLiter);
    updateResults();
  }

  function renderCustomerOptions() {
    const selected = currentCustomer;
    fields.customer.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No customer selected';
    fields.customer.appendChild(empty);
    Object.keys(customers).sort((a, b) => a.localeCompare(b)).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      fields.customer.appendChild(option);
    });
    fields.customer.value = selected;
  }

  function addCustomer() {
    const name = fields.name.value.trim();
    if (!validCustomerName(name)) {
      showError('Enter a customer name with 1 to 80 characters.');
      fields.name.focus();
      return;
    }
    const existingName = Object.keys(customers).find((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existingName) {
      fields.name.value = '';
      currentCustomer = existingName;
      fields.customer.value = existingName;
      selectCustomer(existingName);
      return;
    }
    customers[name] = {
      startDate: fields.start.value,
      endDate: fields.end.value,
      missingDates: '',
      milkQty: 1,
      pricePerLiter: lastPrice
    };
    currentCustomer = name;
    fields.name.value = '';
    fields.missing.value = '';
    fields.quantity.value = '1';
    fields.price.value = String(lastPrice);
    renderCustomerOptions();
    persistCustomers();
    updateResults();
  }

  function parseMissingDates(raw, startKey, endKey) {
    const entries = raw.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    const unique = new Set();
    let invalidCount = 0;
    entries.forEach((entry) => {
      const date = parseDateOnly(entry);
      if (!date) { invalidCount++; return; }
      if (date.key >= startKey && date.key <= endKey) unique.add(date.key);
    });
    return { dates: Array.from(unique).sort(), invalidCount };
  }

  function displayError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function showError(message) { displayError(message); }

  function persistCurrentRecord() {
    if (!currentCustomer) return;
    customers[currentCustomer] = {
      startDate: fields.start.value,
      endDate: fields.end.value,
      missingDates: fields.missing.value.slice(0, 20000),
      milkQty: Number(fields.quantity.value),
      pricePerLiter: Number(fields.price.value)
    };
    persistCustomers();
  }

  function updateResults() {
    displayError('');
    latestAccount = null;
    $('downloadCsvBtn').disabled = true;
    $('shareBtn').disabled = true;
    $('totalDays').textContent = '0';
    $('missingDays').textContent = '0';
    $('deliveryDays').textContent = '0';
    $('totalMilk').textContent = '0 L';
    $('totalCost').textContent = money.format(0);
    $('potentialCost').textContent = money.format(0);
    $('summaryPeriod').textContent = 'Set a billing period to see your totals.';
    $('dailyDetails').replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Enter a valid period to view each day.' }));
    $('summary-title').textContent = currentCustomer || 'Milk account';

    const start = parseDateOnly(fields.start.value);
    const end = parseDateOnly(fields.end.value);
    if (!start || !end) { displayError('Choose a valid start date and end date.'); return; }
    if (start.key > end.key) { displayError('The start date must be on or before the end date.'); return; }
    const totalDays = Math.floor((Date.parse(`${end.key}T00:00:00Z`) - Date.parse(`${start.key}T00:00:00Z`)) / 86400000) + 1;
    if (totalDays > 3660) { displayError('Choose a billing period of 10 years or less to create a daily statement.'); return; }

    const quantity = Number(fields.quantity.value);
    const price = Number(fields.price.value);
    if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > 10000) { displayError('Milk per delivery must be between 0.01 and 10,000 liters.'); return; }
    if (!Number.isFinite(price) || price < 0 || price > 1000000) { displayError('Price per liter must be between ₹0 and ₹1,000,000.'); return; }

    const missing = parseMissingDates(fields.missing.value, start.key, end.key);
    if (missing.invalidCount) { displayError(`Fix or remove ${missing.invalidCount} invalid missed date${missing.invalidCount === 1 ? '' : 's'}. Use YYYY-MM-DD or DD/MM/YYYY.`); return; }
    const missingSet = new Set(missing.dates);
    const deliveryDays = totalDays - missingSet.size;
    const totalMilk = deliveryDays * quantity;
    const totalCost = totalMilk * price;
    const potentialCost = totalDays * quantity * price;
    latestAccount = { startDate: start.key, endDate: end.key, totalDays, missingDates: missing.dates, deliveryDays, quantity, price, totalMilk, totalCost, potentialCost, customer: currentCustomer };

    $('totalDays').textContent = formatter.format(totalDays);
    $('missingDays').textContent = formatter.format(missingSet.size);
    $('deliveryDays').textContent = formatter.format(deliveryDays);
    $('totalMilk').textContent = `${formatter.format(totalMilk)} L`;
    $('totalCost').textContent = money.format(totalCost);
    $('potentialCost').textContent = money.format(potentialCost);
    $('summaryPeriod').textContent = `${dateLabel(start.key)} – ${dateLabel(end.key)}`;
    $('downloadCsvBtn').disabled = false;
    $('shareBtn').disabled = false;
    renderDailyBreakdown(start.key, totalDays, missingSet, quantity, price);

    if (price > 0) {
      lastPrice = price;
      try { localStorage.setItem('lastPrice', String(price)); } catch (error) { /* Rate remains usable for this visit. */ }
    }
    persistCurrentRecord();
  }

  function renderDailyBreakdown(startKey, totalDays, missingDates, quantity, price) {
    const container = $('dailyDetails');
    const table = document.createElement('table');
    table.className = 'breakdown-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Date', 'Status', 'Milk', 'Amount'].forEach((label) => {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      headRow.appendChild(cell);
    });
    head.appendChild(headRow);
    const body = document.createElement('tbody');
    for (let offset = 0; offset < totalDays; offset++) {
      const key = addDays(startKey, offset);
      const missed = missingDates.has(key);
      const row = document.createElement('tr');
      [dateLabel(key), missed ? 'Missed' : 'Delivered', missed ? '0 L' : `${formatter.format(quantity)} L`, money.format(missed ? 0 : quantity * price)].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    }
    table.append(head, body);
    container.replaceChildren(table);
  }

  function markSundays() {
    const start = parseDateOnly(fields.start.value);
    const end = parseDateOnly(fields.end.value);
    if (!start || !end || start.key > end.key) { updateResults(); return; }
    const current = new Date(`${start.key}T00:00:00Z`);
    const endTime = Date.parse(`${end.key}T00:00:00Z`);
    if (Math.floor((endTime - Date.parse(`${start.key}T00:00:00Z`)) / 86400000) + 1 > 3660) {
      displayError('Choose a billing period of 10 years or less before marking Sundays.');
      return;
    }
    const sundays = [];
    while (current.getTime() <= endTime) {
      if (current.getUTCDay() === 0) sundays.push(`${current.getUTCFullYear()}-${pad(current.getUTCMonth() + 1)}-${pad(current.getUTCDate())}`);
      current.setUTCDate(current.getUTCDate() + 1);
    }
    const existing = fields.missing.value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
    fields.missing.value = Array.from(new Set(existing.concat(sundays))).join(', ');
    updateResults();
  }

  function safeCsvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv() {
    if (!latestAccount) return;
    const account = latestAccount;
    const rows = [
      ['Field', 'Value'],
      ['Customer', account.customer || 'Unassigned'],
      ['Start date', account.startDate], ['End date', account.endDate],
      ['Calendar days', account.totalDays], ['Missed dates', account.missingDates.length ? account.missingDates.join(', ') : 'None'],
      ['Missed days', account.missingDates.length], ['Delivery days', account.deliveryDays],
      ['Milk per delivery (L)', account.quantity], ['Price per liter (INR)', account.price],
      ['Milk delivered (L)', account.totalMilk.toFixed(2)], ['Amount due (INR)', account.totalCost.toFixed(2)],
      ['Amount if no days missed (INR)', account.potentialCost.toFixed(2)]
    ];
    const csv = '\uFEFF' + rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `dairy-account-${safeFilename(account.customer || 'summary')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  function safeFilename(value) {
    const name = String(value).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    return name || 'summary';
  }

  function shareSummary() {
    if (!latestAccount) return;
    const account = latestAccount;
    const message = [
      `Milk Account: ${account.customer || 'Customer'}`,
      `Period: ${dateLabel(account.startDate)} to ${dateLabel(account.endDate)}`,
      `Delivery days: ${account.deliveryDays} of ${account.totalDays}`,
      `Missed days: ${account.missingDates.length}`,
      `Milk delivered: ${formatter.format(account.totalMilk)} L`,
      `Amount due: ${money.format(account.totalCost)}`
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  function bindEvents() {
    $('addCustomerBtn').addEventListener('click', addCustomer);
    fields.name.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomer(); } });
    fields.customer.addEventListener('change', () => selectCustomer(fields.customer.value));
    [fields.start, fields.end, fields.missing, fields.quantity, fields.price].forEach((field) => {
      field.addEventListener('input', updateResults);
      field.addEventListener('change', updateResults);
    });
    $('thisMonthBtn').addEventListener('click', setThisMonth);
    $('last30Btn').addEventListener('click', () => setLastDays(30));
    $('last7Btn').addEventListener('click', () => setLastDays(7));
    $('sundaysBtn').addEventListener('click', markSundays);
    $('lastPriceBtn').addEventListener('click', () => { fields.price.value = String(lastPrice); updateResults(); });
    $('downloadCsvBtn').addEventListener('click', downloadCsv);
    $('shareBtn').addEventListener('click', shareSummary);
  }

  function init() {
    bindEvents();
    renderCustomerOptions();
    setThisMonth();
    const firstCustomer = Object.keys(customers).sort((a, b) => a.localeCompare(b))[0];
    if (firstCustomer) {
      currentCustomer = firstCustomer;
      fields.customer.value = firstCustomer;
      selectCustomer(firstCustomer);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
