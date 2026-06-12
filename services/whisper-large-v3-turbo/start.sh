#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .venv/bin/activate

export PORT="${PORT:-8001}"
LOCAL_MODEL_DIR="$PWD/models/mobiuslabsgmbh-faster-whisper-large-v3-turbo"
if [[ -z "${WHISPER_MODEL:-}" && -f "$LOCAL_MODEL_DIR/model.bin" ]]; then
  export WHISPER_MODEL="$LOCAL_MODEL_DIR"
else
  export WHISPER_MODEL="${WHISPER_MODEL:-mobiuslabsgmbh/faster-whisper-large-v3-turbo}"
fi
export WHISPER_DEVICE="${WHISPER_DEVICE:-cpu}"
export WHISPER_COMPUTE_TYPE="${WHISPER_COMPUTE_TYPE:-int8}"
export WHISPER_BATCH_SIZE="${WHISPER_BATCH_SIZE:-4}"
export WHISPER_BEAM_SIZE="${WHISPER_BEAM_SIZE:-5}"
export HF_HOME="${HF_HOME:-$PWD/models/huggingface}"
export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
export WHISPER_TMP_DIR="${WHISPER_TMP_DIR:-$PWD/tmp}"

mkdir -p "$HF_HOME" "$WHISPER_TMP_DIR"
exec uvicorn app:app --host "${HOST:-127.0.0.1}" --port "$PORT"
