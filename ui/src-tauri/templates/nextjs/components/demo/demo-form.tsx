"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function DemoForm() {
  return (
    <form className="grid gap-4 sm:max-w-md" onSubmit={event => event.preventDefault()}>
      <div className="grid gap-2">
        <Label htmlFor="title">หัวข้อ</Label>
        <Input id="title" placeholder="เช่น ตรวจรับวัตถุดิบ" />
      </div>
      <div className="grid gap-2">
        <Label>แผนก</Label>
        <Select>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="เลือกแผนก" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="qa">ควบคุมคุณภาพ</SelectItem>
            <SelectItem value="prod">ผลิต</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="note">รายละเอียด</Label>
        <Textarea id="note" placeholder="พิมพ์ที่นี่" />
      </div>
      <Button type="submit" className="w-fit">บันทึก</Button>
    </form>
  );
}
