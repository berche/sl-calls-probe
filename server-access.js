'use strict';
async function initServerAccess() {
  if (!bridge || window.parent === window
      || new URLSearchParams(location.search).get('vk_app_id') !== String(APP_ID)) return;
  try {
    await bounded(bridge.send('VKWebAppInit'));
    $('server-access').disabled = false;
  } catch { $('server-status').textContent = 'Интерфейс VK недоступен. Файл не создавался.'; }
}
$('server-access').onclick = async () => {
  if (busy || diagnosisBusy || $('server-access').disabled) return;
  busy = true; $('server-access').disabled = true;
  let token = null;
  try {
    const auth = await bounded(bridge.send('VKWebAppGetAuthToken', { app_id: APP_ID, scope: '' }));
    if (typeof auth?.access_token !== 'string' || !auth.access_token) throw new ProbeError('unexpected-result');
    token = auth.access_token;
    const issued = new Date();
    const content = JSON.stringify({ format: 'sl-calls-api-access', version: 1,
      app_id: APP_ID, issued_at: issued.toISOString(), access_token: token });
    const blobUrl = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'SL-api-access-' + issued.toISOString().replace(/[^0-9TZ]/g, '') + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    $('server-status').textContent = 'Файл SL-api-access скачан на компьютер. В чат его не присылайте. На VPS он ещё не передан; автоматизация ещё не включена.';
  } catch (error) {
    $('server-status').textContent = 'Подготовка не завершена: ' + safeError(error) + '. Никакой комнаты не создавалось.';
  } finally { token = null; busy = false; }
};
initServerAccess();
