import { t } from '../i18n.js';
import { S, can } from '../store.js';

const ROWS = [
  ['จัดตำแหน่งผู้เล่นบนกระดานสนาม', 'full', 'view', 'view'], ['เพิ่ม/แก้ไข/ลบ ผู้เล่นและผู้ช่วยโค้ช', 'full', 'none', 'none'], ['ดูไอดีเข้าสู่ระบบของคนอื่น', 'full', 'none', 'none'],
  ['เพิ่ม/แก้ไขตารางแมตช์และแผนการเล่น', 'full', 'view', 'view'], ['เพิ่ม/แก้ไขวันซ้อมและเช็กชื่อ', 'full', 'full', 'view'], ['บันทึกคะแนนสดและสถิติรายแต้ม', 'full', 'full', 'none'],
  ['ดูแดชบอร์ดสรุปแมตช์', 'full', 'full', 'view'], ['ดูเบอร์โทรของผู้เล่น', 'full', 'view', 'none'], ['แก้ข้อมูลส่วนตัวและหน้าตา', 'full', 'full', 'full'], ['แก้ชื่อทีม/ไอดีทีม/ลบทีม', 'full', 'none', 'none']
];
const L = { full: 'ทำได้', view: 'ดูอย่างเดียว', none: 'ไม่ได้' };
export function render() {
  const me = S.me.role, cols = ['coach', 'assistant', 'player'], names = { coach: 'โค้ช', assistant: 'ผู้ช่วยโค้ช', player: 'ผู้เล่น' };
  return `<section class="hero"><div><h1>${t('สิทธิ์ผู้ใช้')}</h1><p>${t('คุณเข้าสู่ระบบเป็น')} <b>${t(names[me])}</b></p></div></section>
<section class="card"><div class="scroll"><table><thead><tr><th>${t('การใช้งาน')}</th>${cols.map((c) => `<th>${t(names[c])}${c === me ? ' ★' : ''}</th>`).join('')}</tr></thead><tbody>${ROWS.map((r) => `<tr><td class="wrap">${t(r[0])}</td>${[1, 2, 3].map((i) => `<td><span class="perm ${r[i]}">${t(L[r[i]])}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>
<p class="muted">${t('ระบบตรวจสิทธิ์ที่ฝั่งเซิร์ฟเวอร์ทุกครั้ง ไม่ใช่แค่ซ่อนปุ่ม')}</p></section>`;
}
