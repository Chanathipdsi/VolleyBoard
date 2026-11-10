import { fail } from './http.js';

export const outbox = []; // dev/test only

export async function sendOtp(to, code) {
  const subject = `รหัสยืนยัน VolleyBoard: ${code} / Your VolleyBoard code`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px">
<h2 style="margin:0 0 8px;color:#2128D0">VolleyBoard</h2>
<p style="margin:0 0 16px">รหัสยืนยันของคุณ (ใช้ได้ 10 นาที)<br>Your verification code (valid for 10 minutes)</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:0 0 16px">${code}</p>
<p style="color:#666;font-size:13px;margin:0">หากคุณไม่ได้ขอรหัสนี้ ให้ละเว้นอีเมลฉบับนี้ / If you didn't request this, ignore this email.</p></div>`;
  const from = process.env.MAIL_FROM;
  const name = process.env.MAIL_FROM_NAME || 'VolleyBoard';
  if (process.env.BREVO_API_KEY && from) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name, email: from }, to: [{ email: to }], subject, htmlContent: html })
    });
    if (!r.ok) throw fail(502, 'mail_failed', { detail: 'brevo ' + r.status });
    return;
  }
  if (process.env.RESEND_API_KEY && from) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: `${name} <${from}>`, to: [to], subject, html })
    });
    if (!r.ok) throw fail(502, 'mail_failed', { detail: 'resend ' + r.status });
    return;
  }
  if (process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_KEY) {
    // Free relay: a Google Apps Script web app that sends through the owner's Gmail (see README).
    const r = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST', redirect: 'follow', headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: process.env.APPS_SCRIPT_KEY, to, subject, html, name })
    });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch { /* */ }
    if (!r.ok || !j || j.ok !== true) throw fail(502, 'mail_failed', { detail: 'apps-script ' + r.status + ' ' + (j ? String(j.error || '') : 'non-JSON reply: ' + txt.replace(/\s+/g, ' ').slice(0, 80)).slice(0, 160) });
    return;
  }
  if (process.env.MAIL_PROVIDER === 'console' && process.env.NODE_ENV !== 'production') {
    outbox.push({ to, code, at: Date.now() });
    console.log(`[mail:dev] OTP for ${to}: ${code}`);
    return;
  }
  throw fail(503, 'mail_not_configured');
}
