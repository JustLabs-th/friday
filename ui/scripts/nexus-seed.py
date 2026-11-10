"""Copy every npm package a pnpm lockfile needs into the company Nexus (npm-hosted).

Run on a machine that can reach both npmjs.org and Nexus. Packages already in Nexus are skipped, and
each download is checked against the lockfile's integrity hash before it is uploaded.

  python scripts/nexus-seed.py                      # dry run: shows what would be uploaded
  NEXUS_USER=... NEXUS_PASSWORD=... python scripts/nexus-seed.py --upload
  python scripts/nexus-seed.py --lock path/to/pnpm-lock.yaml --upload

Credentials come from the environment so they never land in a file or in shell history.
"""
import argparse, base64, hashlib, json, os, re, ssl, sys, urllib.parse, urllib.request, uuid

NEXUS = os.environ.get('NEXUS_URL', 'https://nexus.digitalx.srt').rstrip('/')
REPO = 'npm-hosted'
UPSTREAM = os.environ.get('NPM_UPSTREAM', 'https://registry.npmjs.org').rstrip('/')
# Nexus uses a company CA; set NEXUS_INSECURE=1 only if the CA is not installed on this machine.
CTX = ssl._create_unverified_context() if os.environ.get('NEXUS_INSECURE') else None


def parse(lock):
    """(name, version, integrity) for each entry of the lockfile's `packages:` section."""
    text = open(lock, encoding='utf-8').read()
    section = text.split('\npackages:\n', 1)[1].split('\nsnapshots:\n', 1)[0]
    found = []
    for match in re.finditer(r"^  '?([^\s'][^\n]*?)'?:\n    resolution: \{([^}]*)\}", section, re.M):
        spec, resolution = match.groups()
        if 'tarball' in resolution or 'directory' in resolution:
            continue  # not from the registry
        name, _, version = spec.rpartition('@')
        integrity = re.search(r'integrity: (\S+?)[,}\s]', resolution + ' ')
        found.append((name, version, integrity.group(1) if integrity else None))
    return found


def request(url, data=None, headers=None, auth=False):
    req = urllib.request.Request(url, data, headers or {})
    if auth:
        token = base64.b64encode(f"{os.environ['NEXUS_USER']}:{os.environ['NEXUS_PASSWORD']}".encode()).decode()
        req.add_header('Authorization', 'Basic ' + token)
    return urllib.request.urlopen(req, context=CTX if url.startswith(NEXUS) else None, timeout=120)


def in_nexus(name, version):
    url = f"{NEXUS}/repository/{REPO}/{urllib.parse.quote(name, safe='@')}"
    try:
        meta = json.load(request(url))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        raise
    return version in meta.get('versions', {})


def tarball(name, version):
    base = name.split('/')[-1]
    return f"{UPSTREAM}/{name}/-/{base}-{version}.tgz"


def check(data, integrity):
    if not integrity or '-' not in integrity:
        return True
    algorithm, expected = integrity.split('-', 1)
    return base64.b64encode(hashlib.new(algorithm, data).digest()).decode() == expected


def upload(name, version, data):
    boundary = uuid.uuid4().hex
    filename = f"{name.split('/')[-1]}-{version}.tgz"
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="npm.asset"; filename="{filename}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
    request(f"{NEXUS}/service/rest/v1/components?repository={REPO}", body,
            {'Content-Type': f'multipart/form-data; boundary={boundary}'}, auth=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--lock', default=os.path.join(os.path.dirname(__file__), '..', 'pnpm-lock.yaml'))
    parser.add_argument('--upload', action='store_true', help='really upload (default is a dry run)')
    args = parser.parse_args()
    if args.upload and not (os.environ.get('NEXUS_USER') and os.environ.get('NEXUS_PASSWORD')):
        sys.exit('Set NEXUS_USER and NEXUS_PASSWORD first.')
    packages = parse(args.lock)
    print(f'{len(packages)} packages in the lockfile')
    missing = [p for p in packages if not in_nexus(p[0], p[1])]
    print(f'{len(packages) - len(missing)} already in Nexus, {len(missing)} missing')
    if not args.upload:
        for name, version, _ in missing[:40]:
            print(f'  would upload {name}@{version}')
        if len(missing) > 40:
            print(f'  ... and {len(missing) - 40} more')
        return
    failed = []
    for index, (name, version, integrity) in enumerate(missing, 1):
        try:
            data = request(tarball(name, version)).read()
            if not check(data, integrity):
                raise ValueError('integrity mismatch')
            upload(name, version, data)
            print(f'[{index}/{len(missing)}] uploaded {name}@{version}')
        except Exception as error:  # keep going; report at the end
            failed.append((name, version, str(error)))
            print(f'[{index}/{len(missing)}] FAILED {name}@{version}: {error}')
    print(f'done, {len(failed)} failed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
