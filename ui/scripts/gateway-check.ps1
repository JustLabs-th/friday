<#
.SYNOPSIS
  Checks whether an LLM gateway can serve Codex: the Responses API, streaming, and tool calls.

.DESCRIPTION
  Reads the virtual key from the FRIDAY_GATEWAY_KEY environment variable and never prints it.
  Prints only pass/fail results, model ids and short snippets of the model's own answer.
  Certificate verification stays on; if the company CA is not trusted this fails instead of skipping it.

.EXAMPLE
  $env:FRIDAY_GATEWAY_KEY = Read-Host "Gateway key"   # session only, not saved
  ./gateway-check.ps1 -Model "llama/qwen3.8-27b"
#>
param(
  [string]$BaseUrl = 'https://bifrost.digitalx.srt/v1',
  [string]$Model = ''
)

$ErrorActionPreference = 'Stop'
$key = $env:FRIDAY_GATEWAY_KEY
if (-not $key) { Write-Host 'Set FRIDAY_GATEWAY_KEY first (see -? for an example).'; exit 2 }
$headers = @{ Authorization = "Bearer $key" }
$BaseUrl = $BaseUrl.TrimEnd('/')

function Send($method, $path, $body) {
  $args = @{ Uri = "$BaseUrl$path"; Method = $method; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 120 }
  if ($body) { $args.ContentType = 'application/json'; $args.Body = ($body | ConvertTo-Json -Depth 20 -Compress) }
  try {
    $r = Invoke-WebRequest @args
    return @{ Ok = $true; Status = [int]$r.StatusCode; Text = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { return @{ Ok = $false; Status = 0; Text = $_.Exception.Message } }
    $text = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
    return @{ Ok = $false; Status = [int]$resp.StatusCode; Text = $text }
  }
}
function Snip($text, $n = 300) { if ($text.Length -gt $n) { $text.Substring(0, $n) + '...' } else { $text } }
function Result($name, $pass, $detail) {
  $mark = if ($pass) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1}  {2}" -f $mark, $name, $detail)
}

# 1. Models the key can see.
$models = Send 'GET' '/models' $null
if (-not $models.Ok) { Result 'models' $false "HTTP $($models.Status) $(Snip $models.Text 200)"; exit 1 }
$ids = @(($models.Text | ConvertFrom-Json).data | ForEach-Object { $_.id } | Sort-Object)
Result 'models' ($ids.Count -gt 0) "$($ids.Count) visible"
$ids | Select-Object -First 60 | ForEach-Object { Write-Host "    $_" }
if (-not $Model) { $Model = ($ids | Where-Object { $_ -match 'qwen' } | Select-Object -First 1) }
if (-not $Model) { Write-Host 'No qwen model found; pass -Model <id>.'; exit 1 }
Write-Host "Using model: $Model"

# 2. A plain Responses request.
$plain = Send 'POST' '/responses' @{ model = $Model; input = 'Reply with the single word OK.' }
if ($plain.Ok) {
  $o = $plain.Text | ConvertFrom-Json
  $reply = (($o.output | Where-Object { $_.type -eq 'message' } | ForEach-Object { $_.content } | ForEach-Object { $_.text }) -join ' ')
  Result 'responses (plain)' ($reply.Length -gt 0) "reply: $(Snip $reply 80)"
} else { Result 'responses (plain)' $false "HTTP $($plain.Status) $(Snip $plain.Text 200)" }

# 3. Streaming: Codex reads server-sent events named like response.output_text.delta.
$stream = Send 'POST' '/responses' @{ model = $Model; input = 'Count from 1 to 3.'; stream = $true }
if ($stream.Ok) {
  $events = @($stream.Text -split "`n" | Where-Object { $_ -like 'event:*' } | ForEach-Object { $_.Substring(6).Trim() })
  $kinds = $events | Select-Object -Unique
  $hasDelta = $kinds -contains 'response.output_text.delta'
  $hasDone = $kinds -contains 'response.completed'
  Result 'responses (stream)' ($hasDelta -and $hasDone) ("events: " + (($kinds | Select-Object -First 8) -join ', '))
} else { Result 'responses (stream)' $false "HTTP $($stream.Status) $(Snip $stream.Text 200)" }

# 4. Tool call round trip, stateless (no previous_response_id): the model calls a function,
#    then the result is sent back and it should answer using it.
$tool = @{ type = 'function'; name = 'get_time'; description = 'Returns the current time.'; parameters = @{ type = 'object'; properties = @{}; required = @() } }
$ask = @{ role = 'user'; content = 'What time is it? Use the get_time tool.' }
$first = Send 'POST' '/responses' @{ model = $Model; input = @($ask); tools = @($tool); tool_choice = 'auto' }
if ($first.Ok) {
  $o = $first.Text | ConvertFrom-Json
  $call = $o.output | Where-Object { $_.type -eq 'function_call' } | Select-Object -First 1
  Result 'tool call (model calls a function)' ($null -ne $call) $(if ($call) { "called $($call.name)" } else { 'no function_call in output' })
  if ($call) {
    $followUp = @($ask, @{ type = 'function_call'; call_id = $call.call_id; name = $call.name; arguments = $call.arguments },
      @{ type = 'function_call_output'; call_id = $call.call_id; output = '10:42' })
    $second = Send 'POST' '/responses' @{ model = $Model; input = $followUp; tools = @($tool) }
    if ($second.Ok) {
      $o2 = $second.Text | ConvertFrom-Json
      $answer = (($o2.output | Where-Object { $_.type -eq 'message' } | ForEach-Object { $_.content } | ForEach-Object { $_.text }) -join ' ')
      Result 'tool call (result sent back)' ($answer -match '10') "answer: $(Snip $answer 100)"
    } else { Result 'tool call (result sent back)' $false "HTTP $($second.Status) $(Snip $second.Text 200)" }
  }
} else { Result 'tool call (model calls a function)' $false "HTTP $($first.Status) $(Snip $first.Text 200)" }

Write-Host 'Done. The key was not printed.'
