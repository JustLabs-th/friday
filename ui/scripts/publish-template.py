"""Publish Liam's Next.js template to Nexus so Liam (and projects made from it) can pick up a newer one
without a new Liam release.

  python scripts/publish-template.py            # dry run: shows what would be uploaded
  NEXUS_USER=... NEXUS_PASSWORD=... python scripts/publish-template.py --apply

The version is the number in src-tauri/templates/nextjs/template.json: raise it before publishing.
A published version is never overwritten (the script stops if it already exists); only latest.json moves.
Layout in the raw-tools repository:

  templates/nextjs/latest.json            {"version": N}
  templates/nextjs/vN/manifest.json       the file list with SHA-256 checksums
  templates/nextjs/vN/files/<path>        every file

The raw-tools repository must allow redeploying latest.json (Nexus: repository -> Hosted -> Deployment policy).
Nexus uses a company CA; set NEXUS_INSECURE=1 only if the CA is not installed on this machine.
"""
import base64, hashlib, json, os, ssl, sys, urllib.error, urllib.request

NEXUS = os.environ.get('NEXUS_URL', 'https://nexus.digitalx.srt').rstrip('/')
BASE = f'{NEXUS}/repository/raw-tools/templates/nextjs'
CTX = ssl._create_unverified_context() if os.environ.get('NEXUS_INSECURE') else None
HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, '..', 'src-tauri', 'templates', 'nextjs')
SKIP_DIRS = {'node_modules', '.next', '.git'}
SKIP_FILES = {'.complete'}
APPLY = '--apply' in sys.argv


def auth():
    token = base64.b64encode(f"{os.environ['NEXUS_USER']}:{os.environ['NEXUS_PASSWORD']}".encode()).decode()
    return {'Authorization': f'Basic {token}'}


def exists(path):
    request = urllib.request.Request(f'{BASE}/{path}', method='HEAD')
    try:
        urllib.request.urlopen(request, context=CTX, timeout=30)
        return True
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        raise


def put(path, data):
    request = urllib.request.Request(f'{BASE}/{path}', data=data, method='PUT', headers=auth())
    urllib.request.urlopen(request, context=CTX, timeout=120).read()


def collect():
    files = []
    for folder, dirs, names in os.walk(SOURCE):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(names):
            if name in SKIP_FILES:
                continue
            full = os.path.join(folder, name)
            relative = os.path.relpath(full, SOURCE).replace(os.sep, '/')
            data = open(full, 'rb').read()
            files.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest(), 'data': data})
    return files


def main():
    marker = json.load(open(os.path.join(SOURCE, 'template.json'), encoding='utf-8'))
    version = int(marker['version'])
    files = collect()
    manifest = json.dumps({'version': version, 'files': [{'path': f['path'], 'sha256': f['sha256']} for f in files]}, indent=2).encode()
    total = sum(len(f['data']) for f in files)
    print(f'Template version {version}: {len(files)} files, {total / 1024:.0f} KB')
    if not APPLY:
        for f in files:
            print('  ', f['path'])
        print('\nDry run. Add --apply (with NEXUS_USER and NEXUS_PASSWORD) to upload.')
        return
    if not (os.environ.get('NEXUS_USER') and os.environ.get('NEXUS_PASSWORD')):
        sys.exit('Set NEXUS_USER and NEXUS_PASSWORD first.')
    if exists(f'v{version}/manifest.json'):
        sys.exit(f'Version {version} is already published. Raise "version" in template.json and run again.')
    for f in files:
        put(f"v{version}/files/{f['path']}", f['data'])
        print('uploaded', f['path'])
    put(f'v{version}/manifest.json', manifest)
    put('latest.json', json.dumps({'version': version}).encode())
    print(f'Published version {version}. Liam picks it up the next time it creates or upgrades a project.')


if __name__ == '__main__':
    main()
