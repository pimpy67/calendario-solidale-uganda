"""Ricostruisce la chiave privata SSH dal segreto VPS_SSH_KEY, comunque sia stata incollata.

Accetta: la chiave normale (righe BEGIN/END), la chiave finita su una riga sola o con
spazi al posto degli a capo (copia da terminale web), oppure la chiave in base64 su una
riga (`base64 -w0 ~/.ssh/deploy_calendario`). Scrive il file in formato standard.
Non stampa mai il contenuto: solo dati di diagnosi non segreti.
"""
import base64
import os
import re
import sys

raw = os.environ.get("VPS_SSH_KEY", "")
key = raw.replace("\r", "").strip()

if "BEGIN" not in key:
    try:
        key = base64.b64decode(re.sub(r"\s+", "", key), validate=True).decode().replace("\r", "").strip()
    except Exception:
        pass

m = re.search(r"-----BEGIN ([A-Z0-9 ]+)-----(.*?)-----END \1-----", key, re.S)
if not m:
    print(f"::error::VPS_SSH_KEY non riconosciuta (righe: {raw.count(chr(10)) + 1}, "
          f"BEGIN presente: {'sì' if 'BEGIN' in raw else 'no'}, END presente: {'sì' if 'END' in raw else 'no'}). "
          "Ricopia la chiave intera, oppure usa la versione base64 (vedi DEPLOY.md).")
    sys.exit(1)

label, body = m.group(1), re.sub(r"\s+", "", m.group(2))
lines = [body[i:i + 70] for i in range(0, len(body), 70)]
out = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.ssh/deploy_key")
with open(out, "w") as f:
    f.write(f"-----BEGIN {label}-----\n" + "\n".join(lines) + f"\n-----END {label}-----\n")
os.chmod(out, 0o600)
print(f"Chiave ricostruita ({label}, {len(lines)} righe di contenuto).")
