(function () {
  'use strict';
  const F = window.Finance;
  const $ = id => document.getElementById(id);
  const form = $('operation-form');
  let records = [], editingId = null, pendingDelete = null, storage;
  let blocked = false;
  const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const showError = message => {
    $('form-error').textContent = message;
    $('form-error').hidden = false;
  };
  function resetForm() {
    editingId = null;
    form.reset();
    $('date').value = today();
    $('form-title').textContent = 'Новая операция';
    $('form-caption').textContent = 'Добавьте доход или расход';
    $('submit-button').textContent = '＋ Добавить операцию';
    $('cancel-edit').hidden = true;
    $('form-error').hidden = true;
  }
  function block(message) {
    blocked = true;
    $('storage-error').textContent = message;
    $('storage-error').hidden = false;
    form.querySelectorAll('input, button').forEach(element => element.disabled = true);
  }
  try {
    storage = window.localStorage;
    records = F.load(storage);
  } catch (error) {
    block('Не удалось прочитать сохранённые данные. Возможно, хранилище запрещено или данные повреждены. Запись отключена, чтобы не потерять данные. Разрешите браузеру хранение данных и перезагрузите страницу. При повреждении данных сначала сохраните копию хранилища через инструменты браузера.');
  }
  function commit(next) {
    if (blocked) throw new Error('Хранилище недоступно. Перезагрузите страницу после устранения ошибки.');
    // Never change the visible state until persistent storage succeeds.
    try { F.save(storage, next); }
    catch (error) { throw new Error('Не удалось сохранить изменения. Проверьте разрешение на хранение данных и свободное место в браузере. Операция не изменена.'); }
    records = next;
    render();
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function render() {
    const total = F.totals(records);
    for (const key of ['income', 'expense', 'balance']) $(key).textContent = F.formatMoney(total[key]);
    $('count').textContent = records.length;
    $('empty-state').hidden = records.length > 0 || blocked;
    const list = $('operations');
    list.replaceChildren();
    // For equal dates, show the most recently added operation first.
    const sorted = records.map((record, index) => ({ record, index })).sort((a, b) => b.record.date.localeCompare(a.record.date) || b.index - a.index);
    for (const { record } of sorted) {
      const item = element('li', 'operation ' + record.type);
      const icon = element('span', 'operation-icon', record.type === 'income' ? '+' : '−');
      icon.setAttribute('aria-hidden', 'true');
      const info = element('div');
      info.append(element('p', 'operation-category', record.category));
      const date = element('p', 'operation-date', `${record.type === 'income' ? 'Доход' : 'Расход'} · ${record.date.split('-').reverse().join('.')}`);
      info.append(date);
      const money = element('p', 'operation-money', (record.type === 'income' ? '+' : '−') + F.formatMoney(record.amount));
      const actions = element('div', 'operation-actions');
      for (const [label, action] of [['Редактировать', () => edit(record.id)], ['Удалить', () => askDelete(record.id)]]) {
        const button = element('button', '', label);
        button.type = 'button';
        button.setAttribute('aria-label', `${label}: ${record.category}, ${F.formatMoney(record.amount)}, ${record.date.split('-').reverse().join('.')}`);
        button.addEventListener('click', action);
        actions.append(button);
      }
      item.append(icon, info, money, actions);
      list.append(item);
    }
  }
  function edit(id) {
    const record = records.find(item => item.id === id);
    if (!record) return;
    editingId = id;
    form.elements.type.value = record.type;
    $('amount').value = `${Math.floor(record.amount / 100)},${String(record.amount % 100).padStart(2, '0')}`;
    $('category').value = record.category;
    $('date').value = record.date;
    $('form-title').textContent = 'Редактирование';
    $('form-caption').textContent = 'Измените данные операции';
    $('submit-button').textContent = 'Сохранить изменения';
    $('cancel-edit').hidden = false;
    $('form-error').hidden = true;
    $('amount').focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function askDelete(id) {
    const record = records.find(item => item.id === id);
    if (!record) return;
    pendingDelete = id;
    $('delete-description').textContent = `${record.category} · ${F.formatMoney(record.amount)} · ${record.date.split('-').reverse().join('.')}`;
    $('delete-dialog').showModal();
    $('cancel-delete').focus();
  }
  $('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
  $('delete-dialog').addEventListener('close', () => { pendingDelete = null; });
  $('confirm-delete').addEventListener('click', () => {
    const id = pendingDelete;
    try {
      commit(F.remove(records, id));
      if (editingId === id) resetForm();
      $('delete-dialog').close();
      $('status').textContent = 'Операция удалена. Баланс пересчитан.';
      $('amount').focus();
    } catch (error) {
      $('delete-dialog').close();
      showError(error.message);
    }
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); $('amount').focus(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    $('form-error').hidden = true;
    try {
      const record = {
        id: editingId || (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)),
        type: form.elements.type.value,
        amount: F.parseAmount($('amount').value),
        category: $('category').value.trim(),
        date: $('date').value
      };
      const wasEditing = editingId !== null;
      commit(F.upsert(records, record, editingId));
      resetForm();
      $('status').textContent = wasEditing ? 'Изменения сохранены. Баланс пересчитан.' : 'Операция добавлена и сохранена в браузере.';
    } catch (error) { showError(error.message); }
  });
  // Refresh when another tab changes the same budget. Preserve an unfinished form.
  window.addEventListener('storage', event => {
    if (event.key !== F.KEY && event.key !== null) return;
    if (blocked) return;
    try {
      records = F.load(storage);
      render();
      if (editingId && !records.some(record => record.id === editingId)) resetForm();
      $('status').textContent = 'Данные обновлены из другой вкладки.';
    } catch (error) { block('Данные изменились в другой вкладке и не могут быть прочитаны. Перезагрузите страницу.'); }
  });
  resetForm();
  render();
})();
