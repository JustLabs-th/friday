"""Start the Friday web UI, when needed, and show it in a Tauri window."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request

UI = Path(__file__).resolve().parents[1]


def environment():
    env = os.environ.copy()
    if os.name != 'nt':
        return env
    program_files = Path(env.get('ProgramFiles(x86)', r'C:\Program Files (x86)'))
    vswhere = program_files / 'Microsoft Visual Studio/Installer/vswhere.exe'
    libraries = []
    includes = []
    if vswhere.exists():
        installs = subprocess.check_output([str(vswhere), '-all', '-products', '*', '-property', 'installationPath'], text=True).splitlines()
        for install in filter(None, installs):
            for version in sorted((Path(install) / 'VC/Tools/MSVC').glob('*'), reverse=True):
                if (version / 'include/excpt.h').exists() and (version / 'lib/x64/msvcrt.lib').exists():
                    libraries.append(str(version / 'lib/x64'))
                    includes.append(str(version / 'include'))
                    compiler_dir = version / 'bin/Hostx64/x64'
                    env['PATH'] = str(compiler_dir) + os.pathsep + env['PATH']
                    env['CC'] = env['CXX'] = str(compiler_dir / 'cl.exe')
                    env['VCToolsInstallDir'] = str(version) + os.sep
                    env['VCINSTALLDIR'] = str(Path(install) / 'VC') + os.sep
                    break
            if includes:
                break
    for version in sorted((program_files / 'Windows Kits/10/Lib').glob('*'), reverse=True):
        if (version / 'um/x64/kernel32.lib').exists() and (version / 'ucrt/x64/ucrt.lib').exists():
            libraries.extend([str(version / 'um/x64'), str(version / 'ucrt/x64')])
            sdk_include = program_files / 'Windows Kits/10/Include' / version.name
            includes.extend(str(sdk_include / part) for part in ['ucrt', 'shared', 'um', 'winrt'])
            break
    if libraries:
        env['LIB'] = os.pathsep.join(libraries + ([env['LIB']] if env.get('LIB') else []))
    if includes:
        env['INCLUDE'] = os.pathsep.join(includes + ([env['INCLUDE']] if env.get('INCLUDE') else []))
    return env


def server_ready():
    try:
        with urllib.request.urlopen('http://127.0.0.1:5173', timeout=1) as response:
            return response.status == 200
    except OSError:
        return False


if __name__ == '__main__':
    pnpm = shutil.which('pnpm.cmd' if os.name == 'nt' else 'pnpm')
    if not pnpm:
        sys.exit('pnpm is required.')
    env = environment()
    server = None
    try:
        if not server_ready():
            server = subprocess.Popen([pnpm, '--dir', str(UI), 'dev'], cwd=UI, env=env)
            for _ in range(60):
                if server_ready():
                    break
                if server.poll() is not None:
                    sys.exit('The UI dev server failed to start.')
                time.sleep(.5)
            else:
                sys.exit('The UI dev server did not become ready.')
        sys.exit(subprocess.call([pnpm, '--dir', str(UI), 'exec', 'tauri', 'dev', *sys.argv[1:]], cwd=UI, env=env))
    finally:
        if server is not None:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(server.pid), '/T', '/F'], capture_output=True)
            else:
                server.terminate()
