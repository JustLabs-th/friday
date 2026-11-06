"""Put the engine and the installer helper where the installer expects them. Run before `tauri build`.

The engine is not committed (it is about 370 MB). It is copied from, in order: the path in
FRIDAY_CODEX_BIN, a build in ../codex-rs/target/release, or the installed Codex app. The licence
files travel with it, as Apache-2.0 requires when redistributing.
"""
import os, shutil, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
import desktop

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
dest = os.path.join(root, 'ui', 'src-tauri', 'engine')
name = 'codex.exe' if os.name == 'nt' else 'codex'
out_name = 'liam-engine.exe' if os.name == 'nt' else 'liam-engine'
candidates = [
    os.environ.get('FRIDAY_CODEX_BIN'),
    os.path.join(root, 'codex-rs', 'target', 'release', name),
    os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'OpenAI', 'Codex', 'bin', name),
]
source = next((c for c in candidates if c and os.path.isfile(c)), None)
if not source:
    sys.exit('No Codex engine found. Set FRIDAY_CODEX_BIN to a codex executable.')

os.makedirs(dest, exist_ok=True)
shutil.copy2(source, os.path.join(dest, out_name))
for notice in ('LICENSE', 'NOTICE'):
    if os.path.isfile(os.path.join(root, notice)):
        shutil.copy2(os.path.join(root, notice), os.path.join(dest, notice))
print(f'engine: {source} -> {dest} ({os.path.getsize(os.path.join(dest, out_name)) // 2**20} MB)')

# The installer's helper (trusts the company CA, sets host names). Built here so it is a plain program,
# not a script: endpoint protection on company PCs blocks PowerShell.
helper_dir = os.path.join(root, 'ui', 'helper')
subprocess.run(['cargo', 'build', '--release', '--manifest-path', os.path.join(helper_dir, 'Cargo.toml')],
               env=desktop.environment(), check=True)
shutil.copy2(os.path.join(helper_dir, 'target', 'release', 'liam-setup.exe'),
             os.path.join(root, 'ui', 'src-tauri', 'installer', 'liam-setup.exe'))
print('helper: liam-setup.exe ready')
