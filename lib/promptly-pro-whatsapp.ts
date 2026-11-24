export const PROMPTLY_PRO_WHATSAPP_NUMBER = "6281188088811";
export const PROMPTLY_PRO_PRICE = "Rp29.000";

export function createPromptlyProWhatsAppMessage(accountEmail?: string | null) {
  const email = accountEmail?.replace(/[\r\n]/g, "").trim() || "[isi email terdaftar]";
  return `Halo Admin Promptly! 👋\n\nSaya ingin berlangganan Promptly Pro dengan harga ${PROMPTLY_PRO_PRICE} untuk 30 hari.\n\nEmail akun Promptly: ${email}\n\nMohon informasi metode dan instruksi pembayarannya. Terima kasih!`;
}

export function buildPromptlyProWhatsAppUrl(accountEmail?: string | null) {
  const message = createPromptlyProWhatsAppMessage(accountEmail);
  return `https://wa.me/${PROMPTLY_PRO_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
