"use client";

import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROWS = [
  { id: "WK-0412", task: "ตรวจรับวัตถุดิบ", owner: "สมชาย ใจดี", status: "done", hours: 2.5 },
  { id: "WK-0413", task: "บันทึกผลทดสอบความแข็ง", owner: "สมหญิง รักงาน", status: "doing", hours: 4 },
  { id: "WK-0414", task: "ปรับตั้งเครื่องอัดรีด", owner: "วิชัย มั่นคง", status: "doing", hours: 3.5 },
  { id: "WK-0415", task: "รายงานของเสียประจำวัน", owner: "นภา สดใส", status: "waiting", hours: 1 },
  { id: "WK-0416", task: "ตรวจสอบมาตรฐานบรรจุภัณฑ์", owner: "สมชาย ใจดี", status: "late", hours: 0.5 },
] as const;

const STATUS = {
  done: { label: "เสร็จ", variant: "default" },
  doing: { label: "กำลังทำ", variant: "secondary" },
  waiting: { label: "รอตรวจ", variant: "outline" },
  late: { label: "เกินกำหนด", variant: "destructive" },
} as const;

/** A table that reads well: bordered and rounded, a tinted header, roomy rows, status badges, numbers on the right, row actions. */
export function DemoTable() {
  const total = ROWS.reduce((sum, row) => sum + row.hours, 0);
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 w-28 px-4">รหัส</TableHead>
            <TableHead className="h-11 px-4">งาน</TableHead>
            <TableHead className="h-11 px-4">ผู้รับผิดชอบ</TableHead>
            <TableHead className="h-11 px-4">สถานะ</TableHead>
            <TableHead className="h-11 px-4 text-right">ชั่วโมง</TableHead>
            <TableHead className="h-11 w-12 px-4"><span className="sr-only">การทำงาน</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map(row => (
            <TableRow key={row.id}>
              <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.id}</TableCell>
              <TableCell className="px-4 py-3 font-medium">{row.task}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">{row.owner}</TableCell>
              <TableCell className="px-4 py-3">
                <Badge variant={STATUS[row.status].variant}>{STATUS[row.status].label}</Badge>
              </TableCell>
              <TableCell className="px-4 py-3 text-right tabular-nums">{row.hours.toFixed(1)}</TableCell>
              <TableCell className="px-4 py-3 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`การทำงานของ ${row.id}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>ดูรายละเอียด</DropdownMenuItem>
                    <DropdownMenuItem>แก้ไข</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={4} className="px-4 py-3">รวม {ROWS.length} งาน</TableCell>
            <TableCell className="px-4 py-3 text-right tabular-nums">{total.toFixed(1)}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
        <TableCaption className="sr-only">งานประจำวันและสถานะ</TableCaption>
      </Table>
    </div>
  );
}
