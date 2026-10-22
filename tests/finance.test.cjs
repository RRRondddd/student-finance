const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../finance.js');
const record = (overrides = {}) => ({ id: 'one', type: 'expense', amount: 1050, category: 'Продукты', date: '2026-10-20', ...overrides });
const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) };
};

test('рубли и копейки преобразуются в точные целые значения', () => {
  for (const [input, expected] of [['0,01', 1], ['0.1', 10], ['123', 12300], ['123,45', 12345], [' 350.5 ', 35050], ['0001,09', 109], ['999999999.99', 99999999999]]) assert.equal(F.parseAmount(input), expected);
});
test('пустые, отрицательные, нулевые, буквенные и неточные суммы отклоняются', () => {
  for (const input of ['', ' ', '0', '0,00', '-1', '+1', 'abc', '1abc', '1e3', 'NaN', 'Infinity', '1,001', '1.234', '1,2.3', '1 000', '1\n2', '1000000000', '999999999999999999999']) assert.throws(() => F.parseAmount(input), undefined, input);
});
test('баланс после добавления, изменения типа и удаления считается до копейки', () => {
  let records = F.upsert([], record({ id: 'income', type: 'income', amount: F.parseAmount('0,30') }));
  records = F.upsert(records, record({ amount: F.parseAmount('0,10') }));
  assert.deepEqual(F.totals(records), { income: 30, expense: 10, balance: 20 });
  records = F.upsert(records, record({ amount: 20 }), 'one');
  assert.equal(records.length, 2);
  assert.equal(F.totals(records).balance, 10);
  records = F.upsert(records, record({ type: 'income', amount: 20 }), 'one');
  assert.deepEqual(F.totals(records), { income: 50, expense: 0, balance: 50 });
  records = F.remove(records, 'income');
  assert.equal(F.totals(records).balance, 20);
  records = F.remove(records, 'one');
  assert.deepEqual(F.totals(records), { income: 0, expense: 0, balance: 0 });
});
test('расходы могут превышать доходы', () => assert.equal(F.totals([record()]).balance, -1050));
test('категория, тип, дата и идентификатор проверяются', () => {
  for (const overrides of [{ category: '' }, { category: '  ' }, { category: 'x'.repeat(61) }, { type: 'other' }, { date: '2026-02-29' }, { date: '2026-04-31' }, { date: '' }, { date: '1899-12-31' }, { id: '' }, { amount: 1.5 }, { amount: -1 }, { amount: 0 }]) assert.throws(() => F.upsert([], record(overrides)));
  assert.equal(F.validDate('2024-02-29'), true);
  assert.equal(F.validDate('1900-01-01'), true);
});
test('изменение не мутирует исходный массив; неизвестные и повторные ID отклоняются', () => {
  const initial = [record()];
  const edited = F.upsert(initial, record({ category: 'Учёба' }), 'one');
  assert.equal(initial[0].category, 'Продукты');
  assert.equal(edited[0].category, 'Учёба');
  assert.throws(() => F.upsert(initial, record()));
  assert.throws(() => F.upsert(initial, record({ id: 'unknown' }), 'unknown'));
  assert.throws(() => F.remove(initial, 'unknown'));
});
test('сохранение и повторное чтение восстанавливают всю историю', () => {
  const storage = memoryStorage();
  assert.deepEqual(F.load(storage), []);
  const records = [record(), record({ id: 'two', type: 'income', category: 'Стипендия', amount: 100000 })];
  F.save(storage, records);
  assert.deepEqual(F.load(storage), records);
  F.save(storage, F.remove(records, 'one'));
  assert.deepEqual(F.load(storage), [records[1]]);
  F.save(storage, []);
  assert.deepEqual(F.load(storage), []);
});
test('повреждённые данные и неподдерживаемая версия не заменяются пустой историей', () => {
  const storage = memoryStorage();
  for (const value of ['{broken', 'null', '{"version":2,"records":[]}', '{"version":1,"records":{}}', JSON.stringify({version:1,records:[record({amount:-1})]})]) {
    storage.setItem(F.KEY, value);
    assert.throws(() => F.load(storage));
    assert.equal(storage.getItem(F.KEY), value);
  }
});
test('ошибки доступа и переполнения хранилища передаются вызывающему коду', () => {
  const storage = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota exceeded'); } };
  assert.throws(() => F.load(storage), /Denied/);
  assert.throws(() => F.save(storage, [record()]), /Quota/);
});
test('слишком большой общий итог не теряет точность', () => {
  const records = Array.from({length: 90073}, (_, i) => record({id:String(i), amount:99999999999, type:'income'}));
  assert.throws(() => F.validateRecords(records), /Общая сумма/);
});
test('форматирование сохраняет копейки и знак', () => {
  assert.equal(F.formatMoney(30), '0,30 ₽');
  assert.equal(F.formatMoney(-1), '−0,01 ₽');
  assert.equal(F.formatMoney(0), '0,00 ₽');
});
