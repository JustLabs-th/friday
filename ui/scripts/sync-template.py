"""Copy the company Next.js template into Liam (ui/src-tauri/templates/nextjs).

The template's home is its own repository (nextjs-template). Liam keeps a bundled copy so it works without
Nexus; the newest version is published to Nexus with scripts/publish-template.py and Liam picks it up from there.

  python scripts/sync-template.py [path-to-nextjs-template]     (default: E:/Projects/nextjs-template)

Run it after the template changes, then publish. In the copy the project's name is replaced by the placeholder
__NAME__ in package.json, app/layout.tsx, app/page.tsx and README.md; Liam fills it in when it creates a project.
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, '..', 'src-tauri', 'templates', 'nextjs')
SOURCE = sys.argv[1] if len(sys.argv) > 1 else r'E:\Projects\nextjs-template'
NAME = 'nextjs-template'
NAMED = ['package.json', 'app/layout.tsx', 'app/page.tsx', 'README.md']
SKIP_DIRS = {'node_modules', '.next', '.git'}
SKIP_FILES = {'next-env.d.ts', 'tsconfig.tsbuildinfo'}


def main():
    if not os.path.isfile(os.path.join(SOURCE, 'template.json')):
        sys.exit(f'{SOURCE} is not the template (no template.json).')
    if os.path.isdir(TARGET):
        shutil.rmtree(TARGET)
    copied = 0
    for folder, dirs, names in os.walk(SOURCE):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            if name in SKIP_FILES or (name.startswith('.env') and name != '.env.example'):
                continue
            source = os.path.join(folder, name)
            relative = os.path.relpath(source, SOURCE).replace(os.sep, '/')
            target = os.path.join(TARGET, *relative.split('/'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            if relative in NAMED:
                text = open(source, encoding='utf-8', newline='').read().replace(NAME, '__NAME__')
                open(target, 'w', encoding='utf-8', newline='').write(text)
            else:
                shutil.copyfile(source, target)
            copied += 1
    print(f'Copied {copied} files from {SOURCE} to {os.path.normpath(TARGET)}')


if __name__ == '__main__':
    main()
