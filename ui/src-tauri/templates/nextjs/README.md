# __NAME__

เทมเพลตเว็บแอป Next.js ของบริษัท ใช้เป็นจุดเริ่มต้นของแอปภายใน ไม่ผูกกับเครื่องมือตัวใดตัวหนึ่ง
(ใช้ผ่าน Liam, Gitea "Use this template" หรือคัดลอกโฟลเดอร์เองก็ได้)

## มีอะไรในเทมเพลต

| ส่วน | รายละเอียด |
|---|---|
| Next.js 16 · React 19 · Tailwind 4 · TypeScript 7 | ล็อกเวอร์ชันแบบตรงตัวใน `package.json` และ `package-lock.json` |
| `components/ui/` | shadcn (new-york) 16 ชิ้นตามชุดที่แพลตฟอร์มอนุมัติ: badge, button, card, chart, dialog, dropdown-menu, field, input, label, select, separator, skeleton, table, tabs, textarea, tooltip ใช้สีแบรนด์ (เหลือง/ดำ/แดง) จาก `app/globals.css` ดูตัวอย่างทั้งหมดที่ `/components` |
| `components.json` | ค่าตั้งของ shadcn (ใช้ `cn` จากแพ็กเกจ `cn` ตามชุดที่อนุมัติ) |
| แถบด้านบน (`components/user-bar.tsx`) | ซ้าย: ไอคอนและชื่อระบบ (แก้ได้ที่ `<UserBar title="..." icon={...} />` ใน `app/layout.tsx`) ขวา: เข้าสู่ระบบ / โปรไฟล์ / เลือกธีม / ออกจากระบบ ซึ่งแพลตฟอร์มทำไว้ให้ ไม่ต้องแก้ สร้างจาก shadcn (`Button`, `DropdownMenu`) ทั้งหมด |
| ธีม สว่าง / มืด / ตามเครื่อง | เลือกในเมนูโปรไฟล์ จำค่าไว้ในเบราว์เซอร์ และตั้งก่อนวาดหน้า (ไม่กะพริบ) ใช้คลาส `dark` บน `<html>` สีทั้งสองธีมอยู่ใน `app/globals.css` เขียนสไตล์โหมดมืดด้วย `dark:` ได้ |
| `lib/user.ts` | `getUser()` ให้ชื่อ รหัสพนักงาน อีเมล กลุ่ม และ claim ทั้งหมดของผู้ใช้ที่ล็อกอินอยู่ |
| `Dockerfile` | build จาก image ใน `registry.digitalx.srt` (ไม่ออกอินเทอร์เน็ต) |
| `.npmrc` + `certs/` | ติดตั้งแพ็กเกจจาก Nexus และเชื่อใบรับรอง SRT Root CA |

## เริ่มใช้งาน

ต้องใช้ Node 24 และเข้าถึง Nexus ได้ (`nexus.digitalx.srt`)

```bash
npm ci
npm run dev      # http://localhost:3000
npm run build    # ตรวจก่อน deploy
```

- เพิ่มหน้าใน `app/` (เช่น `app/report/page.tsx`) แล้วเพิ่มลิงก์ในเมนูที่ `<UserBar links={[...]} />` ใน `app/layout.tsx`
- ห้ามเพิ่มแพ็กเกจนอกรายการใน `package.json` โดยไม่ผ่านผู้ดูแลแพลตฟอร์ม และห้ามแก้ `.npmrc` หรือ `certs/`
- ห้ามสร้างหน้าล็อกอินหรือเก็บรหัสผ่านเอง ดูหัวข้อถัดไป

## การล็อกอิน (SSO)

แอปที่ deploy บนแพลตฟอร์มบริษัทจะมีล็อกอินครอบอยู่ข้างหน้า (oauth2-proxy + Keycloak ผ่าน Traefik)
ผู้ใช้ที่ไม่ล็อกอินจะไม่ถึงตัวแอป และแอปรู้ว่าใครใช้อยู่จาก header ที่ proxy ส่งมา:

```ts
import { getUser, isInGroup } from "@/lib/user";

const user = await getUser();      // ใน Server Component / Route Handler / Server Action
user.name; user.employeeId; user.email; user.groups; user.claims
isInGroup(user, "frontend");
```

- รันบนเครื่องตัวเอง (ไม่ใช่ production) ไม่มีล็อกอิน `getUser()` จะคืนผู้ใช้จำลองชื่อ `dev`
- `employeeId` อ่านจาก claim `employee_id` หรือ `employeeId` ถ้าไม่มีใช้ชื่อผู้ใช้ (รหัสพนักงานของบริษัท)
- แอปต้องเข้าถึงได้ **เฉพาะผ่าน proxy** ไม่เช่นนั้นเรื่อง header ปลอมได้ อย่าเปิดพอร์ตของแอปออกนอกเครือข่าย Docker
- ปรับที่อยู่ของระบบล็อกอินได้ด้วยตัวแปรสภาพแวดล้อม ดู `.env.example` (`SSO_ISSUER`, `SSO_CLIENT_ID`, `AUTH_URL`)

## เพิ่มคอมโพเนนต์ shadcn

คำสั่ง `npx shadcn add ...` ปกติดึงจาก `ui.shadcn.com` ซึ่งเข้าไม่ได้ในเครือข่ายบริษัท ใช้ได้เฉพาะ 16 ชิ้นที่มีอยู่ใน `components/ui/`
ถ้าต้องการชิ้นอื่น ให้ขอผู้ดูแลแพลตฟอร์มเพิ่มในชุดที่อนุมัติ (ที่มา: `raw-tools/stacks/nextjs/<stamp>/approved-stack.zip` ใน Nexus)

## เวอร์ชันแพ็กเกจ

ชุดที่แพลตฟอร์มอนุมัติและตรวจช่องโหว่แล้ว (zero advisories) ล็อก TypeScript 6.0.3, lucide-react 1.64.0 และ cn 0.5.0
โปรเจกต์นี้ใช้เวอร์ชันใหม่กว่า (TypeScript 7.0.2, lucide-react 1.68.0, cn 0.5.2) ตามคำสั่ง "ใช้เวอร์ชันล่าสุด" และ **ยังไม่ได้ตรวจช่องโหว่ใหม่**
(`npm audit` ใช้ผ่าน Nexus ไม่ได้ ต้องให้ผู้ดูแลตรวจ) ถ้าจะใช้งานจริงให้ขอตรวจก่อน หรือย้อนกลับเป็นเวอร์ชันที่อนุมัติ

## ไฟล์ของแพลตฟอร์ม

`template.json` ระบุเวอร์ชันของเทมเพลตและไฟล์ที่เป็นของแพลตฟอร์ม (`platform`) ไฟล์เหล่านี้อัปเดตได้โดยคัดลอกจากเวอร์ชันใหม่
(เครื่องมืออย่าง Liam ทำให้อัตโนมัติ) อย่าแก้ในโปรเจกต์ของคุณ ถ้าต้องการเปลี่ยน ให้แก้ที่เทมเพลตแล้วเพิ่มเลข `version`

## Deploy

push ขึ้น Gitea แล้ว deploy ผ่าน Coolify (แพลตฟอร์มสร้างจาก `Dockerfile` ให้ แอปฟังพอร์ต 3000 ที่ `0.0.0.0`)
โดเมนของแอปคือ `<ชื่อ>.apps.digitalx.srt`
