"""Real Tauri -> Codex smoke test (small live model requests).

Start the dev app with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=
--remote-debugging-port=9224. Requires Python websockets. No backend is mocked.
Only the test project metadata is seeded; original project metadata is restored.
"""
import base64
import json
import re
from pathlib import Path
import sys
import time
import urllib.request
import uuid
from websockets.sync.client import connect

sys.stdout.reconfigure(encoding='utf-8')
UI = Path(__file__).resolve().parents[1]
artifacts = UI / '.artifacts'
workspace = artifacts / 'codex-smoke-workspace'
workspace.mkdir(parents=True, exist_ok=True)


class Page:
    def __init__(self):
        targets = json.load(urllib.request.urlopen('http://127.0.0.1:9224/json/list'))
        target = next(t for t in targets if t['type'] == 'page' and '127.0.0.1:5173' in t['url'])
        self.socket = connect(target['webSocketDebuggerUrl'], max_size=16 * 1024 * 1024)
        self.seq = 0

    def command(self, method, params=None):
        self.seq += 1
        self.socket.send(json.dumps({'id': self.seq, 'method': method, 'params': params or {}}))
        while True:
            message = json.loads(self.socket.recv(timeout=100))
            if message.get('id') != self.seq:
                continue
            if 'error' in message:
                raise AssertionError(message['error'])
            return message.get('result', {})

    def evaluate(self, expression):
        result = self.command('Runtime.evaluate', {'expression': expression, 'awaitPromise': True, 'returnByValue': True})
        if 'exceptionDetails' in result:
            details = result['exceptionDetails']
            raise AssertionError(details.get('exception', {}).get('description') or details.get('exception', {}).get('value') or details.get('text'))
        return result.get('result', {}).get('value')

    def wait(self, expression, timeout=120):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                result = self.evaluate(expression)
                if result:
                    return result
            except AssertionError:
                pass  # Contexts are briefly unavailable during a reload.
            time.sleep(.15)
        raise AssertionError('Timed out: ' + expression[:180])

    def fill(self, label, value):
        self.evaluate(f"""(() => {{
          const el = document.querySelector('[aria-label={json.dumps(label)}]');
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, {json.dumps(value)});
          el.dispatchEvent(new Event('input', {{bubbles:true}}));
        }})()""")

    def click(self, label):
        self.wait(f"(() => {{ const el = document.querySelector('[aria-label={json.dumps(label)}]'); return !!el && !el.disabled; }})()", timeout=15)
        self.evaluate(f"document.querySelector('[aria-label={json.dumps(label)}]').click()")


snapshot = "(await import(window.__smokeCodexModule)).codex.getSnapshot()"
page = Page()
original = page.evaluate("localStorage.getItem('friday.projects.v1')")
token = 'FRIDAY_CODEX_' + uuid.uuid4().hex[:8].upper()
file_token = 'ATTACHMENT_' + uuid.uuid4().hex[:8].upper()
project = {'id': 'codex-smoke', 'name': 'Codex smoke', 'prompt': '', 'path': str(workspace)}
if '--failure-only' in sys.argv:
    project['path'] = str(workspace / ('missing-' + uuid.uuid4().hex))
thread_id = None

def locate_client():
    # Vite attaches an HMR timestamp to the module URL after source edits.
    page.wait("(() => { const entry=performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/lib/codex.ts'); if(!entry) return false; window.__smokeCodexModule=entry.name; return true; })()", timeout=20)

try:
    page.evaluate("localStorage.setItem('friday.projects.v1', " + json.dumps(json.dumps([project])) + ")")
    page.command('Page.reload')
    locate_client()
    page.wait(f"(async () => ({snapshot}).status === 'ready' && !!document.querySelector('textarea[aria-label=Message]'))()")
    if '--failure-only' in sys.argv:
        draft = 'Keep this draft when the project directory is invalid'
        page.fill('Message', draft)
        page.click('Send')
        page.wait("!!document.querySelector('[role=alert]')")
        assert page.evaluate("document.querySelector('textarea[aria-label=Message]').value") == draft
        assert 'Project directory' in page.evaluate("document.querySelector('[role=alert]').textContent")
        assert not page.evaluate(f"(async () => Object.keys(({snapshot}).running).length)()")
        print('PASS: invalid workspace is rejected and the unsent draft is preserved')
        sys.exit(0)
    page.evaluate("""(async () => {
      window.__smokeDeltas = 0;
      const {listen} = await import('/node_modules/@tauri-apps/api/event.js');
      await listen('codex-event', e => { if (e.payload.message.method === 'item/agentMessage/delta') window.__smokeDeltas++; });
    })()""")
    if '--approval-only' in sys.argv:
        saved = json.loads((artifacts / 'codex-smoke-result.json').read_text(encoding='utf-8'))
        thread_id = saved['threadId']
        page.wait(f"(async () => !!({snapshot}).threads[{json.dumps(thread_id)}])()")
        title = page.evaluate(f"(async () => ({snapshot}).threads[{json.dumps(thread_id)}].name)()")
        page.evaluate(f"Array.from(document.querySelectorAll('button[data-sidebar=menu-button]')).find(b => b.textContent.trim() === {json.dumps(title)}).click()")
        page.wait(f"(async () => !!({snapshot}).messages[{json.dumps(thread_id)}])()")
        marker = 'FRIDAY_APPROVAL_' + uuid.uuid4().hex[:8].upper()
        prompt = f"Test the approval UI: run exactly the PowerShell command Write-Output '{marker}' with sandbox_permissions=require_escalated and a brief justification asking permission to print a test marker. Do not run any other command or change files. If denied, do not retry. After completion reply OK."
        page.evaluate("window.__TAURI_INTERNALS__.invoke('codex_request', " + json.dumps({'method': 'turn/start', 'params': {'threadId': thread_id, 'approvalPolicy': 'on-request', 'input': [{'type': 'text', 'text': prompt}]}}) + ")")
        request = page.wait(f"(async () => ({snapshot}).messages[{json.dumps(thread_id)}]?.flatMap(m => m.confirmations || []).find(c => c.state === 'requested'))()")
        command = request['command'].strip()
        wrapper = re.fullmatch(r'"([^\"]+)" -Command "([^\"]+)"', command, re.IGNORECASE)
        if wrapper:
            exe = re.sub('/+', '/', wrapper[1].replace('\\', '/')).lower()
            if exe == 'c:/windows/system32/windowspowershell/v1.0/powershell.exe':
                command = wrapper[2]
        if not re.fullmatch(r"(?:Write-Output|echo)\s+['\"]?" + marker + r"['\"]?", command, re.IGNORECASE):
            page.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Deny').click()")
            raise AssertionError('Denied a command that did not exactly match the harmless test command: ' + command)
        page.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Approve').click()")
        page.wait(f"(async () => {{const s={snapshot}; return !s.running[{json.dumps(thread_id)}] && s.messages[{json.dumps(thread_id)}]?.some(m => m.runs?.some(r => r.output?.includes({json.dumps(marker)})));}})()")
        assert page.evaluate(f"(async () => ({snapshot}).messages[{json.dumps(thread_id)}]?.some(m => m.confirmations?.some(c => c.id === {json.dumps(request['id'])} && c.state === 'approved')))()")
        assert not page.evaluate("window.__TAURI_INTERNALS__.invoke('codex_pending')")
        print('PASS: real approval request, UI Approve, one-time protocol response, real shell output')
        sys.exit(0)
    page.fill('Message', f'Reply with exactly {token}. Do not use tools or change files.')
    page.click('Send')
    page.wait(f"(async () => {{ const s={snapshot}; return Object.values(s.messages).some(messages => messages.some(m => m.role === 'assistant' && m.text.trim() === {json.dumps(token)})) && !Object.keys(s.running).length; }})()")
    assert page.evaluate('window.__smokeDeltas > 0'), 'No streaming deltas were received'
    thread_id = page.evaluate(f"(async () => Object.values(({snapshot}).threads).find(t => t.preview.includes({json.dumps(token)}))?.id)()")
    actual_cwd = page.evaluate(f"(async () => ({snapshot}).threads[{json.dumps(thread_id)}].cwd)()")
    assert Path(actual_cwd).resolve() == workspace.resolve(), (actual_cwd, str(workspace))
    print('PASS: real engine handshake, model catalog, correct workspace, UI send and streaming')

    # Attach actual file contents and check the previous turn is still in context.
    page.evaluate(f"""(() => {{
      const dt = new DataTransfer();
      dt.items.add(new File([{json.dumps(file_token)}], 'note.txt', {{type:'text/plain'}}));
      const input = document.querySelector('input[type=file]'); input.files = dt.files;
      input.dispatchEvent(new Event('change', {{bubbles:true}}));
    }})()""")
    expected = token + '|' + file_token
    page.fill('Message', 'Reply with exactly the token from your previous answer, a vertical bar, and the token in note.txt. Do not use tools.')
    page.click('Send')
    page.wait(f"(async () => {{ const s={snapshot}; return s.messages[{json.dumps(thread_id)}]?.some(m => m.role === 'assistant' && m.text.trim() === {json.dumps(expected)}) && !s.running[{json.dumps(thread_id)}]; }})()")
    print('PASS: multi-turn context and real text attachment contents')

    # Rename through the native transport, then reload and resume through the sidebar.
    title = 'Integration ' + token
    page.evaluate(f"(async () => (await import(window.__smokeCodexModule)).codex.rename({json.dumps(thread_id)}, {json.dumps(title)}))()")
    page.command('Page.reload')
    locate_client()
    page.wait(f"(async () => {{ const s={snapshot}; return s.status === 'ready' && s.threads[{json.dumps(thread_id)}]?.name === {json.dumps(title)}; }})()")
    page.evaluate(f"Array.from(document.querySelectorAll('button[data-sidebar=menu-button]')).find(b => b.textContent.trim() === {json.dumps(title)}).click()")
    page.wait(f"(async () => ({snapshot}).messages[{json.dumps(thread_id)}]?.some(m => m.role === 'assistant' && m.text.trim() === {json.dumps(expected)}))()")
    print('PASS: durable rename, history listing and transcript resume after reload')

    page.fill('Message', 'Print integers from 1 to 5000, one per line, without tools or explanation. Start immediately.')
    page.click('Send')
    page.wait("!!document.querySelector('button[aria-label=Stop]')")
    page.click('Stop')
    page.wait(f"(async () => !({snapshot}).running[{json.dumps(thread_id)}])()")
    wire = page.evaluate(f"window.__TAURI_INTERNALS__.invoke('codex_request', {{method:'thread/read', params:{{threadId:{json.dumps(thread_id)},includeTurns:true}}}})")
    assert wire['thread']['turns'][-1]['status'] == 'interrupted', wire['thread']['turns'][-1]['status']
    print('PASS: Stop interrupts the actual Codex turn')

    screenshot = page.command('Page.captureScreenshot', {'format': 'png'})
    (artifacts / 'codex-native.png').write_bytes(base64.b64decode(screenshot['data']))
    result = {'threadId': thread_id, 'workspace': str(workspace), 'checks': ['streaming', 'context', 'attachments', 'rename', 'resume', 'interrupt']}
    (artifacts / 'codex-smoke-result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
finally:
    if original is None:
        page.evaluate("localStorage.removeItem('friday.projects.v1')")
    else:
        page.evaluate("localStorage.setItem('friday.projects.v1', " + json.dumps(original) + ")")
    page.command('Page.reload')
    page.socket.close()
