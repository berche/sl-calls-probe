'use strict';
const APP_ID = 54811464;
const bridge = window.vkBridge;
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
let ready = false;
let busy = false;
let diagnosisBusy = false;
class ProbeError extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}
const explanations = {
  'timeout': 'Ответ VK не получен за 20 секунд. Это не подтверждает отказ VK.',
  'unexpected-result': 'VK ответил, но значение result не равно true.',
  'missing-link': 'VK ответил, но ссылка join_link отсутствует или имеет неверный тип.',
  'invalid-link': 'VK ответил, но ссылка не прошла проверку адреса.'
};
function bounded(operation) {
  let timer;
  return Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ProbeError('timeout')), 20000);
  })]).finally(() => clearTimeout(timer));
}
const journalKey = 'sl-calls-54811464-native-attempt';
const oldJournalKey = 'sl-calls-54811464-attempt';
function hasAttempt() { return localStorage.getItem(journalKey) || localStorage.getItem(oldJournalKey); }
function validLink(link) {
  const u = new URL(link);
  if (u.protocol !== 'https:' || !['vk.ru', 'vk.com'].includes(u.hostname)
      || u.username || u.password || (u.port && u.port !== '443')
      || !/^\/call\/join\/[A-Za-z0-9_-]+$/.test(u.pathname)) throw new ProbeError('invalid-link');
  return link;
}
function safeError(error) {
  if (error instanceof ProbeError && Object.hasOwn(explanations, error.kind)) return explanations[error.kind];
  // Only known labels and a numeric code, never arbitrary response data.
  const types = { client_error: 'ошибка интерфейса VK', api_error: 'ошибка API VK', auth_error: 'ошибка авторизации VK' };
  const reasons = { 'Invalid params': 'некорректные параметры', 'Access denied': 'доступ отклонён', 'Unknown method': 'метод не поддерживается' };
  const code = error?.error_data?.error_code ?? error?.error_code;
  const type = Object.hasOwn(types, error?.error_type) ? types[error.error_type] : 'тип не указан';
  const rawReason = error?.error_data?.error_reason;
  const reason = Object.hasOwn(reasons, rawReason) ? '; ' + reasons[rawReason] : '';
  const local = error instanceof Error ? 'Ошибка JavaScript; ' : '';
  return local + type + '; код ' + (Number.isInteger(code) ? code : 'не указан') + reason;
}
function replyShape(reply) {
  const result = reply?.result;
  const resultShape = typeof result === 'boolean' ? String(result) : typeof result;
  return 'Формат ответа: result=' + resultShape + '; join_link=' + typeof reply?.join_link
    + '; response=' + typeof reply?.response + '.';
}
function savedDiagnostic() {
  const raw = localStorage.getItem(journalKey);
  if (!raw) return hasAttempt() ? 'Есть прежняя попытка версии 1.' : 'Прежних попыток создания нет.';
  try {
    const record = JSON.parse(raw);
    const labels = { pending: 'исход неизвестен', created: 'ссылка получена', failed: 'создание не подтверждено' };
    const state = Object.hasOwn(labels, record.state) ? labels[record.state] : 'неизвестная запись';
    const kinds = Object.hasOwn(explanations, record.kind) ? explanations[record.kind] : '';
    // Never render arbitrary fields read from storage.
    return 'Прежняя попытка: ' + state + '. ' + kinds
      + (record.version !== 3 ? 'Версия 2 не сохранила подробности ошибки; восстановить их нельзя.' : '');
  } catch { return 'Прежняя запись не читается. Повтор создания отключён.'; }
}
async function diagnose() {
  if (diagnosisBusy || busy) return;
  diagnosisBusy = true; $('diagnose').disabled = true;
  const lines = ['Версия 3. Проверка не создаёт звонок.'];
  try {
    lines.push(savedDiagnostic());
    await bounded(bridge.send('VKWebAppInit'));
    lines.push('Связь с интерфейсом VK: есть.');
    const supported = typeof bridge.supportsAsync === 'function'
      && await bounded(bridge.supportsAsync('VKWebAppCallStart'));
    lines.push('VK сообщает о поддержке создания звонка: ' + (supported ? 'да' : 'нет') + '.');
    lines.push('Запрос создания при этой проверке не отправлялся.');
  } catch (error) { lines.push('Проверка остановлена: ' + safeError(error)); }
  finally { $('diagnostic').textContent = lines.join('\n'); diagnosisBusy = false; $('diagnose').disabled = false; }
}
async function init() {
  if (!bridge || window.parent === window) {
    status('Откройте SL Calls внутри VK. В обычной вкладке создание отключено.'); return;
  }
  if (new URLSearchParams(location.search).get('vk_app_id') !== String(APP_ID)) {
    status('Неверный ID приложения. Создание отключено.'); return;
  }
  $('diagnose').disabled = false;
  try {
    await bounded(bridge.send('VKWebAppInit'));
    if (hasAttempt()) {
      $('diagnostic').textContent = savedDiagnostic();
      status('Попытка создания уже зарегистрирована. Сначала проверьте её результат в VK. Повтор отключён.'); return;
    }
    if (typeof bridge.supportsAsync !== 'function' || !await bounded(bridge.supportsAsync('VKWebAppCallStart'))) {
      status('VK не сообщил о поддержке создания звонка в этом окне. Запрос создания не отправлялся.'); return;
    }
    ready = true; $('create').disabled = false;
    status('Готово. Можно создать одну отдельную тестовую комнату.');
  } catch (error) { status('Проверка VK не завершилась: ' + safeError(error) + '. Запрос создания не отправлялся.'); }
}
$('create').onclick = async () => {
  if (busy || diagnosisBusy || !ready) return;
  busy = true; ready = false; $('create').disabled = true;
  let sent = false;
  try {
    if (hasAttempt()) { status('Повтор создания отключён. Проверьте прежнюю попытку в VK.'); return; }
    // Reserve before mutation; unavailable storage prevents sending. Never retry.
    localStorage.setItem(journalKey, JSON.stringify({ state: 'pending', version: 3, time: Date.now() }));
    status('Запрос создания отправляется. При задержке не обновляйте страницу.');
    sent = true;
    const reply = await bounded(bridge.send('VKWebAppCallStart', {}));
    $('diagnostic').textContent = replyShape(reply);
    if (reply?.result !== true) throw new ProbeError('unexpected-result');
    if (typeof reply.join_link !== 'string' || !reply.join_link) throw new ProbeError('missing-link');
    let link;
    try { link = validLink(reply.join_link); } catch { throw new ProbeError('invalid-link'); }
    $('link').value = link; $('result').hidden = false;
    try { localStorage.setItem(journalKey, JSON.stringify({ state: 'created', version: 3, time: Date.now() })); } catch {}
    status('Комната создана. Скопируйте ссылку. Сохранение без участников пока не проверено.');
  } catch (error) {
    if (sent) {
      const kind = error instanceof ProbeError && Object.hasOwn(explanations, error.kind) ? error.kind : 'other';
      try { localStorage.setItem(journalKey, JSON.stringify({ state: 'failed', version: 3, kind, time: Date.now() })); } catch {}
    }
    status((sent ? 'Создание не подтверждено: ' : 'Запрос создания не отправлен: ') + safeError(error)
      + '. Автоматического повтора не будет.');
  } finally { busy = false; }
};
$('diagnose').onclick = diagnose;
$('copy').onclick = async () => {
  if ($('result').hidden) return;
  try { await navigator.clipboard.writeText($('link').value); status('Ссылка скопирована. Она ещё не проверена как постоянная.'); }
  catch { $('link').focus(); $('link').select(); status('Выделенная ссылка доступна для ручного копирования.'); }
};
init();
