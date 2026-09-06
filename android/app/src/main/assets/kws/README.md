# Bundled KWS model (BD003)

On-device keyword spotting uses **sherpa-onnx** via `@siteed/sherpa-onnx.rn`,
with the English GigaSpeech zipformer int8 checkpoint under `assets/kws/`.

## Files

| File | Role |
|------|------|
| `encoder-…int8.onnx` / `decoder-…` / `joiner-…` | KWS transducer |
| `tokens.txt` | BPE tokens |
| `keywords.txt` | Spotting phrases (BPE). Default includes **Hey Genie** |

At runtime `KwsAssets.ensureModelDir()` copies these into the app `filesDir`
so the native library can open filesystem paths.

## Refresh / rebuild keywords

Upstream archive:

https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2

```bash
# from repo root (PowerShell-friendly)
./scripts/fetch-kws-model.ps1
```

To regenerate `keywords.txt` from plain phrases (needs sherpa-onnx CLI + `bpe.model`
from the archive):

```text
HEY GENIE
```

→ `sherpa-onnx-cli text2token …` → space-separated BPE with `▁` word starts.
