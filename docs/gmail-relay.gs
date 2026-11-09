// Google Apps Script: sends VolleyBoard OTP emails through your own Gmail (free, ~100 emails/day).
// Replace SECRET with a long random string and use the same value as APPS_SCRIPT_KEY in Vercel.
const SECRET = 'PUT-A-LONG-RANDOM-STRING-HERE';
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.key !== SECRET) return out({ ok: false, error: 'forbidden' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.to || '')) return out({ ok: false, error: 'bad_to' });
    MailApp.sendEmail({ to: d.to, subject: String(d.subject).slice(0, 200), htmlBody: String(d.html), name: d.name || 'VolleyBoard' });
    return out({ ok: true });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
