#!/usr/bin/env zsh
# Dex local analytics auto-tracker for interactive zsh sessions.
# Logs every command via preexec hook to System/analytics/events.jsonl
# using local logger script (no network calls).

# Guard against double-loading
if [[ -n "${DEX_ANALYTICS_ZSH_LOADED:-}" ]]; then
  return 0
fi
export DEX_ANALYTICS_ZSH_LOADED=1

# Resolve vault root from this script location
_dex_analytics_script_path="${${(%):-%N}:A}"
_dex_analytics_scripts_dir="${_dex_analytics_script_path:h}"
export DEX_VAULT_ROOT="${_dex_analytics_scripts_dir:h:h}"
export DEX_ANALYTICS_LOGGER="$DEX_VAULT_ROOT/.scripts/analytics/log-local-event.cjs"

# Skip obviously sensitive command lines from logging
function _dex_analytics_is_sensitive() {
  local cmd="$1"
  [[ "$cmd" == *"password"* ]] && return 0
  [[ "$cmd" == *"token"* ]] && return 0
  [[ "$cmd" == *"secret"* ]] && return 0
  [[ "$cmd" == *"PRIVATE_KEY"* ]] && return 0
  [[ "$cmd" == *"OPENAI_API_KEY"* ]] && return 0
  [[ "$cmd" == *"ANTHROPIC_API_KEY"* ]] && return 0
  [[ "$cmd" == *"export "*"_KEY="* ]] && return 0
  return 1
}

function _dex_analytics_log_preexec() {
  local cmd="$1"
  [[ -z "$cmd" ]] && return 0
  [[ ! -f "$DEX_ANALYTICS_LOGGER" ]] && return 0
  _dex_analytics_is_sensitive "$cmd" && return 0

  local props
  props="$(CMD="$cmd" CWD="$PWD" node -e 'process.stdout.write(JSON.stringify({trigger:"zsh_preexec",command:process.env.CMD,cwd:process.env.CWD,shell:"zsh"}))' 2>/dev/null)" || return 0
  node "$DEX_ANALYTICS_LOGGER" script_invoked "$props" >/dev/null 2>&1 || true
}

function _dex_analytics_log_precmd() {
  [[ ! -f "$DEX_ANALYTICS_LOGGER" ]] && return 0
  local last_exit="$?"
  local props
  props="$(EXIT_CODE="$last_exit" CWD="$PWD" node -e 'process.stdout.write(JSON.stringify({trigger:"zsh_precmd",exit_code:Number(process.env.EXIT_CODE),cwd:process.env.CWD,shell:"zsh"}))' 2>/dev/null)" || return 0
  node "$DEX_ANALYTICS_LOGGER" shell_prompt "$props" >/dev/null 2>&1 || true
}

# Register hooks (prefer add-zsh-hook if available)
if autoload -Uz add-zsh-hook 2>/dev/null; then
  add-zsh-hook preexec _dex_analytics_log_preexec
  add-zsh-hook precmd _dex_analytics_log_precmd
else
  preexec_functions+=(_dex_analytics_log_preexec)
  precmd_functions+=(_dex_analytics_log_precmd)
fi

# Convenience alias for explicit wrapped runs (optional)
alias dex-run="$DEX_VAULT_ROOT/.scripts/analytics/dex-run.sh"
