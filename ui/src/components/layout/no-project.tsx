import { Button } from '@/components/ui/button';

/** Shown in place of the chat when there is no project to work in. */
export function NoProject({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        <p className="mb-4 text-[10px] tracking-[.25em] text-muted-foreground">FRIDAY</p>
        <h1 id="page-title" className="text-2xl font-medium tracking-tight">
          ยังไม่มี project
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          สร้าง project เพื่อเลือกโฟลเดอร์และเริ่ม session
        </p>
        <Button className="mt-5" onClick={onCreate}>
          สร้าง project
        </Button>
      </div>
    </div>
  );
}
