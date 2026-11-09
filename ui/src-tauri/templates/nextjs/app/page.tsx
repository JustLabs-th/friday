import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>__NAME__</CardTitle>
          <CardDescription>เทมเพลตเริ่มต้นเว็บแอป Next.js ของบริษัท</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button>เริ่มได้เลย</Button>
          <Button variant="outline" asChild>
            <Link href="/components">ดูชุดคอมโพเนนต์</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
