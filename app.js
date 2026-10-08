'use strict';
const APP_ID = 54811464;
const bridge = window.vkBridge;
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
let ready = false;
let busy = false;
const journalKey = 'sl-calls-54811464-native-attempt';
const oldJournalKey = 'sl-calls-54811464-attempt';
function hasAttempt() { return localStorage.getItem(journalKey) || localStorage.getItem(oldJournalKey); }
function validLink(link) {
  const u = new URL(link);
  if (u.protocol !== 'https:' || !['vk.ru', 'vk.com'].includes(u.hostname)
      || u.username || u.password || (u.port && u.port !== '443')
      || !/^\/call\/join\/[A-Za-z0-9_-]+$/.test(u.pathname)) throw new Error('invalid-link');
  return link;
}
function safeError(error) {
  // Only known labels and a numeric code, never arbitrary response data.
  const types = { client_error: 'ошибка интерфейса VK', api_error: 'ошибка API VK', auth_error: 'ошибка авторизации VK' };
  const reasons = { 'Invalid params': 'некорректные параметры', 'Access denied': 'доступ отклонён', 'Unknown method': 'метод не поддерживается' };
  const code = error?.error_data?.error_code ?? error?.error_code;
  const type = Object.hasOwn(types, error?.error_type) ? types[error.error_type] : 'тип не указан';
  const rawReason = error?.error_data?.error_reason;
  const reason = Object.hasOwn(reasons, rawReason) ? '; ' + reasons[rawReason] : '';
  return type + '; код ' + (Number.isInteger(code) ? code : 'не указан') + reason;
}
async function init() {
  if (!bridge || window.parent === window) {
    status('Откройте SL Calls внутри VK. В обычной вкладке создание отключено.'); return;
  }
  if (new URLSearchParams(location.search).get('vk_app_id') !== String(APP_ID)) {
    status('Неверный ID приложения. Создание отключено.'); return;
  }
  try {
    await bridge.send('VKWebAppInit');
    if (hasAttempt()) {
      status('Попытка создания уже зарегистрирована. Сначала проверьте её результат в VK. Повтор отключён.'); return;
    }
    if (typeof bridge.supportsAsync !== 'function' || !await bridge.supportsAsync('VKWebAppCallStart')) {
      status('VK не сообщил о поддержке создания звонка в этом окне. Запрос создания не отправлялся.'); return;
    }
    ready = true; $('create').disabled = false;
    status('Готово. Можно создать одну отдельную тестовую комнату.');
  } catch (error) { status('Проверка VK не завершилась: ' + safeError(error) + '. Запрос создания не отправлялся.'); }
}
$('create').onclick = async () => {
  if (busy || !ready) return;
  busy = true; ready = false; $('create').disabled = true;
  let sent = false;
  try {
    if (hasAttempt()) { status('Повтор создания отключён. Проверьте прежнюю попытку в VK.'); return; }
    // Reserve before mutation; unavailable storage prevents sending. Never retry.
    localStorage.setItem(journalKey, JSON.stringify({ state: 'pending', time: Date.now() }));
    status('Запрос создания отправляется. При задержке не обновляйте страницу.');
    sent = true;
    const reply = await bridge.send('VKWebAppCallStart', {});
    if (reply?.result !== true) throw new Error('unexpected-result');
    const link = validLink(reply.join_link);
    $('link').value = link; $('result').hidden = false;
    try { localStorage.setItem(journalKey, JSON.stringify({ state: 'created', time: Date.now() })); } catch {}
    status('Комната создана. Скопируйте ссылку. Сохранение без участников пока не проверено.');
  } catch (error) {
    status((sent ? 'Создание не подтверждено: ' : 'Запрос создания не отправлен: ') + safeError(error)
      + '. Автоматического повтора не будет.');
  } finally { busy = false; }
};
$('copy').onclick = async () => {
  if ($('result').hidden) return;
  try { await navigator.clipboard.writeText($('link').value); status('Ссылка скопирована. Она ещё не проверена как постоянная.'); }
  catch { $('link').focus(); $('link').select(); status('Выделенная ссылка доступна для ручного копирования.'); }
};
init();
