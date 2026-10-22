(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Finance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'student-finance:v1';
  const MAX_AMOUNT = 99999999999;

  function parseAmount(value) {
    const text = String(value).trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) {
      throw new Error('Введите сумму больше нуля: например, 250 или 250,50. Не более двух цифр после запятой.');
    }
    const [whole, fraction = ''] = text.replace(',', '.').split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT) {
      throw new Error('Сумма должна быть от 0,01 до 999 999 999,99 ₽.');
    }
    return cents;
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number(value.slice(0, 4)) >= 1900 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validateRecord(record) {
    if (!record || typeof record !== 'object' || !['income', 'expense'].includes(record.type)) throw new Error('Выберите доход или расход.');
    if (!Number.isSafeInteger(record.amount) || record.amount <= 0 || record.amount > MAX_AMOUNT) throw new Error('Некорректная сумма операции.');
    if (typeof record.category !== 'string' || !record.category.trim() || record.category.length > 60) throw new Error('Укажите категорию: от 1 до 60 символов.');
    if (!validDate(record.date)) throw new Error('Укажите существующую дату, начиная с 1900 года.');
    if (typeof record.id !== 'string' || !record.id || record.id.length > 100) throw new Error('Некорректный номер операции.');
  }

  function totals(records) {
    let income = 0, expense = 0;
    for (const record of records) {
      if (record.type === 'income') income += record.amount;
      else expense += record.amount;
      if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense)) throw new Error('Общая сумма слишком велика. Уменьшите сумму операций.');
    }
    return { income, expense, balance: income - expense };
  }

  function validateRecords(records) {
    if (!Array.isArray(records)) throw new Error('Некорректный формат данных.');
    const ids = new Set();
    for (const record of records) {
      validateRecord(record);
      if (ids.has(record.id)) throw new Error('Номера операций не должны повторяться.');
      ids.add(record.id);
    }
    totals(records);
  }

  function upsert(records, record, editingId = null) {
    validateRecord(record);
    let next;
    if (editingId !== null) {
      if (record.id !== editingId || !records.some(item => item.id === editingId)) throw new Error('Операция для изменения не найдена.');
      next = records.map(item => item.id === editingId ? { ...record } : item);
    } else {
      next = [...records, { ...record }];
    }
    validateRecords(next);
    return next;
  }

  function remove(records, id) {
    if (!records.some(item => item.id === id)) throw new Error('Операция для удаления не найдена.');
    return records.filter(item => item.id !== id);
  }

  function load(storage) {
    const raw = storage.getItem(KEY);
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) throw new Error('Неизвестная версия данных.');
    validateRecords(data.records);
    return data.records;
  }

  function save(storage, records) {
    validateRecords(records);
    storage.setItem(KEY, JSON.stringify({ version: 1, records }));
  }

  function formatMoney(cents) {
    // Format integer and fractional parts separately: no floating point arithmetic.
    const sign = cents < 0 ? '−' : '';
    const abs = Math.abs(cents);
    return sign + Math.floor(abs / 100).toLocaleString('ru-RU') + ',' + String(abs % 100).padStart(2, '0') + ' ₽';
  }
  return { KEY, parseAmount, validDate, validateRecords, totals, upsert, remove, load, save, formatMoney };
});
