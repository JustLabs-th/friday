"""Build Liam's Next.js project template (ui/src-tauri/templates/nextjs) from the approved stack in Nexus.

The approved stack (raw-tools/stacks/nextjs/<stamp>/approved-stack.zip) pins every dependency, ships an
audited lockfile whose tarballs all come from Nexus, and keeps the shadcn component sources. This script
downloads it and adds the few app files around it (layout, page, Docker build, ignore files).

  python scripts/build-nextjs-template.py [--stamp 20261029T095904Z]

Run on a machine that can reach Nexus. The result is committed, so builds of Liam do not need it.
"""
import argparse, io, json, os, shutil, ssl, urllib.request, zipfile

NEXUS = os.environ.get('NEXUS_URL', 'https://nexus.digitalx.srt').rstrip('/')
CTX = ssl._create_unverified_context() if os.environ.get('NEXUS_INSECURE') else None
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src-tauri', 'templates', 'nextjs')
UI_COMPONENTS = ['button', 'card', 'input', 'label', 'badge', 'table']


def fetch(url):
    return urllib.request.urlopen(url, context=CTX, timeout=120).read()


def latest_stamp():
    """The newest stack folder in raw-tools."""
    stamps, token = set(), None
    while True:
        url = f"{NEXUS}/service/rest/v1/components?repository=raw-tools" + (f"&continuationToken={token}" if token else '')
        data = json.loads(fetch(url))
        for item in data['items']:
            parts = item['name'].strip('/').split('/')
            if parts[:2] == ['stacks', 'nextjs'] and len(parts) > 2:
                stamps.add(parts[2])
        token = data.get('continuationToken')
        if not token:
            return sorted(stamps)[-1]


FILES = {
    'app/layout.tsx': '''import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "__NAME__",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
''',
    'app/page.tsx': '''import { Button } from "@/components/ui/button";
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
''',
    'app/globals.css': '''@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: system-ui, "Noto Sans Thai", sans-serif;
}
''',
    'app/icon.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#171717"/><path d="M20 22h24M20 32h24M20 42h14" stroke="#fafafa" stroke-width="5" stroke-linecap="round"/></svg>
''',
    'next.config.ts': '''import type { NextConfig } from "next";

const config: NextConfig = {
  // A self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
};

export default config;
''',
    'postcss.config.mjs': '''export default {
  plugins: { "@tailwindcss/postcss": {} },
};
''',
    'tsconfig.json': '''{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
''',
    'Dockerfile': '''# Builds and runs the app on Coolify. Images and packages come from the company Nexus, not the internet.
FROM registry.digitalx.srt/node:24.22.2-bookworm-slim AS deps
WORKDIR /app
ENV NODE_EXTRA_CA_CERTS=/app/certs/srt-platform-root-ca.crt
COPY package.json package-lock.json .npmrc ./
COPY certs ./certs
RUN npm ci --audit=false

FROM registry.digitalx.srt/node:24.22.2-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM registry.digitalx.srt/node:24.22.2-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
''',
    '.dockerignore': 'node_modules\n.next\n.git\n*.md\n.env*\n',
    '.gitignore': 'node_modules\n.next\nnext-env.d.ts\n.env*\n*.tsbuildinfo\n',
    'public/.gitkeep': '',
    'README.md': '''# __NAME__

โปรเจกต์ Next.js ที่สร้างจาก Liam ใช้ชุดแพ็กเกจที่ผ่านการอนุมัติของบริษัท (ติดตั้งจาก Nexus เท่านั้น)

- เพิ่มหน้าใหม่ใน `app/` (เช่น `app/about/page.tsx`)
- ปุ่ม การ์ด ช่องกรอก ตาราง อยู่ใน `components/ui/`
- อย่าเพิ่มแพ็กเกจที่ไม่อยู่ในรายการอนุมัติ (`package.json`) ให้ถามผู้ดูแลก่อน
- Deploy: ให้ Liam จัดการ (Dockerfile พร้อมแล้ว)
''',
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stamp')
    args = parser.parse_args()
    stamp = args.stamp or latest_stamp()
    print('stack', stamp)
    blob = fetch(f"{NEXUS}/repository/raw-tools/stacks/nextjs/{stamp}/approved-stack.zip")
    stack = zipfile.ZipFile(io.BytesIO(blob))
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)

    def write(path, data):
        target = os.path.join(OUT, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        mode = 'wb' if isinstance(data, bytes) else 'w'
        with open(target, mode, **({} if mode == 'wb' else {'encoding': 'utf-8', 'newline': '\n'})) as handle:
            handle.write(data)

    for name in ('package-lock.json', '.npmrc', 'certs/srt-platform-root-ca.crt'):
        write(name, stack.read(name))
    package = json.loads(stack.read('package.json'))
    package['name'] = '__NAME__'
    package['scripts'] = {'dev': 'next dev', 'build': 'next build', 'start': 'next start', 'typecheck': 'tsc --noEmit', 'test': 'vitest run'}
    write('package.json', json.dumps(package, indent=2) + '\n')
    for name in UI_COMPONENTS:
        item = json.loads(stack.read(f'shadcn/{name}.json'))
        for file in item['files']:
            write('components/ui/' + file['path'].split('/')[-1], file['content'].replace('@/registry/new-york-v4/ui/', '@/components/ui/'))
    for path, text in FILES.items():
        write(path, text)
    write('.liam-stack.json', json.dumps({'stack': 'nextjs', 'stamp': stamp, 'source': f'{NEXUS}/repository/raw-tools/stacks/nextjs/{stamp}/approved-stack.zip'}, indent=2) + '\n')
    print('template written to', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
