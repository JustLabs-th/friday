import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>__NAME__</CardTitle>
          <CardDescription>โปรเจกต์เริ่มต้นจาก Liam (Next.js)</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>เริ่มได้เลย</Button>
        </CardContent>
      </Card>
    </main>
  );
}
