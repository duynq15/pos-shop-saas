import { $, esc, modal, closeModal, toast } from '../util.js';
import { api, loadInfo, state } from '../store.js';

export async function showLanInfo() {
  try {
    await loadInfo();
    const qr = await api('/api/info/qr');
    modal(`<h2>Kết nối từ thiết bị khác</h2>
      <p class="muted">Điện thoại/máy tính bảng cùng Wi-Fi mở một trong các địa chỉ sau. Hoặc quét mã QR bên dưới.</p>
      <div class="qr-wrap"><img src="${qr.dataUrl}" alt="QR"><div class="info">${esc(qr.url)}</div></div>
      <table class="line-items"><tbody>
        ${state.info.urls.map((u) => `<tr><td>${esc(u.name)}</td><td class="r"><code>${esc(u.url)}</code></td>
          <td class="r"><button class="btn sm copy" data-url="${esc(u.url)}">Sao chép</button></td></tr>`).join('')}
      </tbody></table>
      <div class="modal-actions"><button class="btn" id="lan-close">Đóng</button></div>`);
    $('#lan-close').onclick = closeModal;
    for (const b of document.querySelectorAll('#modal .copy')) {
      b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.url); toast('Đã sao chép'); } catch { toast(b.dataset.url); } };
    }
  } catch (e) { toast(e.message, true); }
}
