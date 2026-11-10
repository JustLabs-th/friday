"""Exercise the real native scheduler over WebView CDP (debug port 9224).

Creates a temporary task, runs one live Codex prompt, then lets the cron fire.
Requires the same Python websockets dependency as codex-smoke.py.
"""
import ast
from pathlib import Path

# Reuse only the imports and CDP Page class, without executing chat tests.
source = Path(__file__).with_name('codex-smoke.py').read_text(encoding='utf-8')
tree = ast.parse(source)
nodes = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom, ast.ClassDef))]
exec(compile(ast.Module(body=nodes, type_ignores=[]), __file__, 'exec'))
sys.stdout.reconfigure(encoding='utf-8')
page = Page()
workspace = Path(__file__).resolve().parents[1] / '.artifacts' / 'scheduler-smoke-workspace'
workspace.mkdir(parents=True, exist_ok=True)
job = None
def invoke(name, **args):
    return page.evaluate('window.__TAURI_INTERNALS__.invoke(' + json.dumps(name) + ',' + json.dumps(args) + ')')
def current_run():
    return next((run for run in invoke('scheduler_list')['runs'] if run['jobId'] == job['id']), None)
try:
    page.wait("!!window.__TAURI_INTERNALS__")
    page.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Scheduled tasks').click()")
    page.wait("document.querySelector('h1')?.textContent === 'Scheduled tasks'")
    preview = invoke('scheduler_preview', cron='0 9 * * 1-5', timezone='Asia/Bangkok')
    assert len(preview) == 3 and preview == sorted(preview)
    try:
        invoke('scheduler_preview', cron='99 * * * *', timezone='Asia/Bangkok')
        raise AssertionError('Invalid cron accepted')
    except AssertionError as error:
        assert 'Invalid cron' in str(error)
    token = 'SCHEDULER_' + uuid.uuid4().hex[:8]
    job = invoke('scheduler_save', input={
        'name': 'Scheduler smoke', 'cwd': str(workspace),
        'prompt': f'Reply with exactly {token}. Do not call tools or change files.',
        'cron': '* * * * *', 'timezone': 'Asia/Bangkok', 'enabled': False,
        'model': None, 'effort': None, 'projectPrompt': None, 'timeoutMinutes': 3,
    })
    page.wait("document.body.textContent.includes('Scheduler smoke')")
    page.click('Run Scheduler smoke now')
    page.wait("document.body.textContent.includes('Run history')")
    try:
        invoke('scheduler_run', id=job['id'])
        raise AssertionError('Duplicate run accepted')
    except AssertionError as error:
        assert 'already running' in str(error)
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        run = current_run()
        if run and run['status'] not in ('starting', 'running', 'waitingApproval', 'stopping'):
            break
        time.sleep(.4)
    assert run['status'] == 'completed', run
    assert token in run['output'], run
    print('PASS: real Codex manual run completed, output persisted, duplicate rejected', flush=True)
    job = invoke('scheduler_save', input={**job, 'enabled': True})
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        scheduled = [run for run in invoke('scheduler_list')['runs'] if run['jobId'] == job['id'] and run['trigger'] == 'schedule']
        if scheduled and scheduled[0]['status'] == 'completed':
            break
        if scheduled and scheduled[0]['status'] == 'failed':
            raise AssertionError(scheduled[0])
        time.sleep(.5)
    assert scheduled and scheduled[0]['status'] == 'completed', scheduled
    assert token in scheduled[0]['output']
    job = invoke('scheduler_save', input={**job, 'enabled': False})
    assert job['nextRunAt'] is None
    page.command('Page.reload')
    page.wait("!!window.__TAURI_INTERNALS__")
    assert any(item['id'] == job['id'] and not item['enabled'] for item in invoke('scheduler_list')['jobs'])
    print('PASS: minute cron fired automatically, pause and reload preserve task/history', flush=True)
finally:
    if job:
        data = invoke('scheduler_list')
        for run in data['runs']:
            if run['jobId'] == job['id'] and run['status'] in ('starting', 'running', 'waitingApproval', 'stopping'):
                invoke('scheduler_stop', id=run['id'])
        if not any(run['jobId'] == job['id'] and run['status'] in ('starting', 'running', 'waitingApproval', 'stopping') for run in invoke('scheduler_list')['runs']):
            invoke('scheduler_delete', id=job['id'])
            print('Temporary schedule and its history removed', flush=True)
