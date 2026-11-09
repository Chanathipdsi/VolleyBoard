# VolleyBoard 2.0

ระบบจัดการทีมวอลเลย์บอล (ไทย/อังกฤษ) — โค้ชลงทะเบียนด้วยอีเมล + OTP, ผู้ช่วย/ผู้เล่นเข้าด้วยไอดีทีม + ไอดีประจำตัว

Stack: static ES modules + Vercel Function (`api/[...path].js`) + Neon Postgres (ฟรี)

## ตั้งค่าบน Vercel
1. **ฐานข้อมูล**: Project → Storage → Create → *Neon* (Free) → Connect to project (ได้ `DATABASE_URL` อัตโนมัติ; ตารางสร้างเองเมื่อใช้งานครั้งแรก)
2. **Environment Variables**
   - `SESSION_SECRET` — สุ่มยาว ≥ 24 ตัวอักษร (จำเป็น)
   - ส่งอีเมล OTP อย่างใดอย่างหนึ่ง:
     - Brevo: `BREVO_API_KEY`, `MAIL_FROM` (อีเมลผู้ส่งที่ยืนยันแล้ว), `MAIL_FROM_NAME` (ไม่บังคับ) — ฟรี 300 ฉบับ/วัน
     - Resend: `RESEND_API_KEY`, `MAIL_FROM` (ต้องเป็นโดเมนที่ยืนยันแล้ว)
3. Redeploy

## รันในเครื่อง
```
node dev-server.mjs      # http://localhost:3000, ใช้ SQLite ในหน่วยความจำ, OTP แสดงใน console
npm test                 # ทดสอบ API
```

## ข้อจำกัดที่ควรรู้
- OTP ส่งทางอีเมลเท่านั้น (เบอร์โทรเก็บเป็นข้อมูลติดต่อ) — SMS มีค่าใช้จ่าย
- "ผู้ช่วยกติกา" เป็นระบบกฎ (rule engine) ไม่ใช่โมเดล AI
- ผู้ช่วย/ผู้เล่นเข้าด้วยไอดีโดยไม่มีรหัสผ่าน (จำกัดจำนวนครั้งที่ลองแล้ว) — อย่าแชร์ไอดีนอกทีม
