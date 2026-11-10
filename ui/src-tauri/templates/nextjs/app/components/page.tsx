import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoDialog } from "@/components/demo/demo-dialog";
import { DemoForm } from "@/components/demo/demo-form";
import { DemoTable } from "@/components/demo/demo-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** A page that shows every ready-made part. Delete it (and components/demo) when you no longer need it. */
export default function ComponentsPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">ชุดคอมโพเนนต์ (shadcn)</h1>
        <p className="text-muted-foreground">ตัวอย่างชิ้นส่วนที่พร้อมใช้ใน components/ui</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ปุ่มและป้าย</CardTitle>
          <CardDescription>สีหลักคือเหลืองของแบรนด์ ปุ่มลบใช้สีแดง</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>บันทึก</Button>
          <Button variant="secondary">ยกเลิก</Button>
          <Button variant="outline">ตัวเลือก</Button>
          <Button variant="destructive">ลบ</Button>
          <Button variant="link">ลิงก์</Button>
          <Badge>ใหม่</Badge>
          <Badge variant="secondary">รอตรวจ</Badge>
          <Badge variant="destructive">ด่วน</Badge>
          <DemoDialog />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ฟอร์ม</CardTitle>
          <CardDescription>ช่องกรอก รายการเลือก และข้อความยาว</CardDescription>
        </CardHeader>
        <CardContent>
          <DemoForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>แท็บและตาราง</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="today">
            <TabsList>
              <TabsTrigger value="today">วันนี้</TabsTrigger>
              <TabsTrigger value="week">สัปดาห์นี้</TabsTrigger>
            </TabsList>
            <TabsContent value="today">
              <div className="pt-2">
                <DemoTable />
              </div>
            </TabsContent>
            <TabsContent value="week">
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
