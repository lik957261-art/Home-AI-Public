# No-Window Command Invocation Harness

## Purpose

Hermes Mobile maintenance scripts must not open visible console windows when they launch command-line processes. This applies to local operational helpers, deployment helpers, Gateway restart helpers, and any future PowerShell wrapper that starts another process.

## Rule

- PowerShell scripts that call `Start-Process` must use `-WindowStyle Hidden`.
- New Windows command wrappers should call `scripts/powershell/Invoke-NoWindowCommand.ps1` unless they have a narrower documented reason to build `Start-Process` arguments directly.
- Do not use visible interactive windows for background helpers, Gateway restarts, WSL launchers, deployment helpers, or smoke-test helpers.
- If a command must be interactive and visible, the script must document that exception next to the `Start-Process` call.
- Do not put complex JavaScript, Python, Bash heredocs, regular expressions, Chinese text, JSON payloads, or arrow functions directly inside a PowerShell `node -e`, `python -c`, `bash -lc`, or heredoc command.
- For non-trivial probes, create a checked-in script under `scripts/` or a temporary file, then execute that script with ordinary arguments. This avoids PowerShell stripping quotes, interpreting `<`, `|`, `=>`, `$`, brackets, or regex characters before the target runtime sees them.

## Standard Wrapper

Use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\powershell\Invoke-NoWindowCommand.ps1 `
  -FilePath "wsl.exe" `
  -ArgumentList @("-d", "Ubuntu", "--", "bash", "-lc", "echo ok") `
  -Wait
```

The wrapper uses `Start-Process -WindowStyle Hidden` and supports working directory, stdout/stderr redirection, wait, and passthrough modes.

## Harness Expectations

Before completing any change that adds or modifies Windows process-launch scripts:

1. Run the no-window command harness test.
2. Check every touched PowerShell `Start-Process` call for `-WindowStyle Hidden`.
3. Prefer redirecting stdout/stderr to files over leaving hidden background processes silent.
4. Do not compose destructive filesystem operations across PowerShell and another shell.
5. If a command needs more than a simple one-liner, put it in a script file and run the script; do not rely on nested PowerShell/Bash/Node/Python quoting.

## Command Quoting Harness

The test `tests/no-window-command-harness.test.js` also scans repository scripts for high-risk inline command patterns:

- `node -e` with complex JavaScript syntax.
- `python -c` with complex code or embedded quotes.
- Bash heredoc syntax inside PowerShell scripts.
- `bash -lc` payloads that mix PowerShell-sensitive operators without a dedicated script.

Allowed exception: add `COMPLEX_INLINE_OK` on the same line with a short reason, but prefer a script file.

Several existing provisioning/startup scripts still contain legacy complex inline shell payloads. They are locked in a baseline in `tests/no-window-command-harness.test.js` so new occurrences fail immediately while the old scripts can be migrated one by one without destabilizing production startup paths.

## Current Scope

This rule covers Windows host process launching. It does not require changes to normal Codex `shell_command` tool calls, because those run inside the current non-interactive execution channel and do not create visible desktop windows.
