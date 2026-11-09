"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function DemoDialog() {
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">เปิดหน้าต่าง</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการทำรายการ</DialogTitle>
            <DialogDescription>หน้าต่างโต้ตอบมาตรฐาน ปิดได้ด้วยปุ่ม Esc หรือกดนอกกรอบ</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>ตกลง</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">เมนู</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>แก้ไข</DropdownMenuItem>
          <DropdownMenuItem>ทำสำเนา</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary">เลื่อนเมาส์มาที่นี่</Button>
          </TooltipTrigger>
          <TooltipContent>คำอธิบายสั้นๆ</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}
