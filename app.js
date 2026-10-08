'use strict';
const APP_ID = 54811464;
const bridge = window.vkBridge;
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
let token = null;
let busy = false;
const journalKey = 'sl-calls-54811464-attempt';
function validLink(link) {
  const u = new URL(link);
  if (u.protocol !== 'https:' || !['vk.ru', 'vk.com'].includes(u.hostname)
      || u.username || u.password || (u.port && u.port !== '443')
      || !/^\/call\/join\/[A-Za-z0-9_-]+$/.test(u.pathname)) throw new Error('invalid-link');
  return link;
}
function errorCode(error) {
  // Do not stringify raw bridge errors: they can echo request tokens.
  const value = error?.error_data?.error_code ?? error?.error_code;
  return Number.isInteger(value) ? String(value) : 'не указан';
}
async function init() {
  if (!bridge || window.parent === window) {
    status('Откройте эту страницу внутри SL Calls в VK. В обычной вкладке создание отключено.');
    return;
  }
  const id = new URLSearchParams(location.search).get('vk_app_id');
  if (id !== String(APP_ID)) { status('Неверный ID приложения. Создание отключено.'); return; }
  try {
    await bridge.send('VKWebAppInit');
    if (localStorage.getItem(journalKey)) {
      status('На этом браузере уже зарегистрирована попытка создания. Проверьте результат в VK перед новым запросом.');
      return;
    }
    $('authorize').disabled = false;
    status('Готово. Нажмите первую кнопку и подтвердите доступ только к звонкам.');
  } catch { status('VK Bridge не инициализировался. Запросы создания не отправлены.'); }
}
$('authorize').onclick = async () => {
  if (busy) return;
  busy = true; $('authorize').disabled = true;
  try {
    const auth = await bridge.send('VKWebAppGetAuthToken', { app_id: APP_ID, scope: 'calls' });
    const scopes = String(auth.scope || '').split(',').map(x => x.trim());
    if (!auth.access_token || !scopes.includes('calls')) {
      status('VK не выдал право calls нашему приложению. Комната не создавалась.'); return;
    }
    token = auth.access_token;
    $('create').disabled = false;
    status('Разрешение получено. Вторая кнопка создаст одну отдельную комнату.');
  } catch (error) { status('Доступ не получен. Код VK: ' + errorCode(error) + '. Комната не создавалась.'); }
  finally { busy = false; }
};
$('create').onclick = async () => {
  if (busy || !token) return;
  busy = true; $('create').disabled = true;
  try {
    // Save intent before mutation; never retry a timeout or unexpected result.
    localStorage.setItem(journalKey, JSON.stringify({ state: 'pending', time: Date.now() }));
    status('Один запрос отправляется. При задержке не обновляйте страницу.');
    const reply = await bridge.send('VKWebAppCallAPIMethod', {
      method: 'calls.start', params: { access_token: token, v: '5.199' }
    });
    const value = reply.response || reply;
    const link = validLink(value.join_link);
    localStorage.setItem(journalKey, JSON.stringify({ state: 'created', time: Date.now() }));
    $('link').value = link; $('result').hidden = false;
    status('Комната создана. Сохранение без участников ещё не проверено. Скопируйте ссылку для отдельного теста.');
  } catch (error) {
    status('Создание не подтверждено. Код VK: ' + errorCode(error) + '. Повтора не будет: сначала проверьте звонки в VK.');
  } finally { token = null; busy = false; }
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('link').value); status('Ссылка скопирована. Она ещё не проверена как постоянная.'); }
  catch { $('link').focus(); $('link').select(); status('Выделенная ссылка доступна для ручного копирования.'); }
};
init();
