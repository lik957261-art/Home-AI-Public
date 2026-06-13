#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .venv/bin/activate

export PORT="${PORT:-8003}"
export LOCAL_ASR_SERVICE_ID="${LOCAL_ASR_SERVICE_ID:-sensevoice-local}"
export SENSEVOICE_MODEL="${SENSEVOICE_MODEL:-iic/SenseVoiceSmall}"
export SENSEVOICE_VAD_MODEL="${SENSEVOICE_VAD_MODEL:-fsmn-vad}"
export SENSEVOICE_DEVICE="${SENSEVOICE_DEVICE:-cpu}"
export SENSEVOICE_BATCH_SIZE_S="${SENSEVOICE_BATCH_SIZE_S:-60}"
export SENSEVOICE_MERGE_VAD="${SENSEVOICE_MERGE_VAD:-1}"
export SENSEVOICE_MERGE_LENGTH_S="${SENSEVOICE_MERGE_LENGTH_S:-15}"
export SENSEVOICE_USE_ITN="${SENSEVOICE_USE_ITN:-1}"
export MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-$PWD/models/modelscope}"
export SENSEVOICE_TMP_DIR="${SENSEVOICE_TMP_DIR:-$PWD/tmp}"

mkdir -p "$MODELSCOPE_CACHE" "$SENSEVOICE_TMP_DIR"
exec uvicorn app:app --host "${HOST:-127.0.0.1}" --port "$PORT"
