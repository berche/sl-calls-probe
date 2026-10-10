'use strict';
// Test only our own application's ordinary authorized token, never a borrowed ID.
let apiToken = null;
const apiJournal = 'sl-calls-54811464-official-api-attempt';
const apiStatus = message => { $('api-status').textContent = message; };
async function initApiProbe() {
  if (!bridge || window.parent === window
      || new URLSearchParams(location.search).get('vk_app_id') !== String(APP_ID)) {
    apiStatus('Проверка доступна только внутри нашего SL Calls в VK.'); return;
  }
  try {
    await bounded(bridge.send('VKWebAppInit'));
    if (localStorage.getItem(apiJournal)) {
      apiStatus('Запуск API уже зарегистрирован. Повтор отключён; сначала проверьте результат.'); return;
    }
    $('api-authorize').disabled = false;
    apiStatus('Готова проверка обычного доступа нашего приложения.');
  } catch (error) { apiStatus('Интерфейс VK недоступен: ' + safeError(error)); }
}
$('api-authorize').onclick = async () => {
  if (busy || diagnosisBusy || $('api-authorize').disabled) return;
  busy = true; $('api-authorize').disabled = true;
  try {
    // The earlier calls scope request failed. Empty scope requests only the
    // documented ordinary token; VK must still authorize calls.start separately.
    const auth = await bounded(bridge.send('VKWebAppGetAuthToken', { app_id: APP_ID, scope: '' }));
    if (typeof auth?.access_token !== 'string' || !auth.access_token) throw new ProbeError('unexpected-result');
    apiToken = auth.access_token;
    $('api-create').disabled = false;
    apiStatus('Обычный доступ получен. Это ещё не разрешение на создание звонков. Вторая кнопка проверит метод API один раз.');
  } catch (error) { apiToken = null; apiStatus('Обычный доступ не получен: ' + safeError(error) + '. Запрос создания не отправлялся.'); }
  finally { busy = false; }
};
$('api-create').onclick = async () => {
  if (busy || diagnosisBusy || !apiToken || $('api-create').disabled) return;
  busy = true; $('api-create').disabled = true;
  let sent = false;
  try {
    if (localStorage.getItem(apiJournal)) { apiStatus('Повтор API отключён.'); return; }
    localStorage.setItem(apiJournal, JSON.stringify({ state: 'pending', time: Date.now() }));
    sent = true;
    const reply = await bounded(bridge.send('VKWebAppCallAPIMethod', {
      method: 'calls.start', params: { access_token: apiToken, v: '5.199' }
    }));
    if (reply?.error) {
      throw { error_type: 'api_error', error_data: {
        error_code: Number.isInteger(reply.error.error_code) ? reply.error.error_code : null
      } };
    }
    const original = returnedLink(reply);
    if (original) { $('api-link').value = original; $('api-result').hidden = false; }
    const link = acceptedLink(reply);
    $('api-link').value = link; $('api-result').hidden = false;
    localStorage.setItem(apiJournal, JSON.stringify({ state: 'created', returnedLink: link, time: Date.now() }));
    apiStatus('API вернул ссылку. Автоматическое разрешение гостевого входа и срок жизни требуют отдельной проверки.');
  } catch (error) {
    if (sent) {
      const record = safeFailureRecord(error);
      const linkRecord = !$('api-result').hidden ? { returnedLink: $('api-link').value } : {};
      try { localStorage.setItem(apiJournal, JSON.stringify({ state: 'unconfirmed', ...record, ...linkRecord, time: Date.now() })); } catch {}
    }
    apiStatus((sent ? 'Создание через API не подтверждено: ' : 'Запрос API не отправлен: ')
      + safeError(error) + '. Повтора не будет. Доступ другого приложения не используется.');
  } finally { apiToken = null; busy = false; }
};
initApiProbe();
