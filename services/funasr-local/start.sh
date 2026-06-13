#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .venv/bin/activate

export PORT="${PORT:-8002}"
export LOCAL_ASR_SERVICE_ID="${LOCAL_ASR_SERVICE_ID:-funasr-local}"
export FUNASR_MODEL="${FUNASR_MODEL:-paraformer-zh}"
export FUNASR_VAD_MODEL="${FUNASR_VAD_MODEL:-fsmn-vad}"
export FUNASR_PUNC_MODEL="${FUNASR_PUNC_MODEL:-ct-punc}"
export FUNASR_DEVICE="${FUNASR_DEVICE:-cpu}"
export FUNASR_BATCH_SIZE_S="${FUNASR_BATCH_SIZE_S:-60}"
export FUNASR_MERGE_VAD="${FUNASR_MERGE_VAD:-1}"
export FUNASR_MERGE_LENGTH_S="${FUNASR_MERGE_LENGTH_S:-15}"
export MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-$PWD/models/modelscope}"
export FUNASR_TMP_DIR="${FUNASR_TMP_DIR:-$PWD/tmp}"

mkdir -p "$MODELSCOPE_CACHE" "$FUNASR_TMP_DIR"
exec uvicorn app:app --host "${HOST:-127.0.0.1}" --port "$PORT"
