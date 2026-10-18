"""Genera l'audio dei versi dell'Avvento da public/data/avvento.json.

Un file per ogni porta con un testo: public/audio/porta-NN.mp3.
Le porte con solo il disegno non hanno file: il pop-up usa quello della porta successiva.

Voce di prova gratuita (gTTS). La registrazione vera sostituirà questi file
con gli stessi nomi.

Uso: python3 scripts/genera-audio-avvento.py
"""
import json
import pathlib

from gtts import gTTS

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'public' / 'data' / 'avvento.json'
OUT = ROOT / 'public' / 'audio'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    porte = json.loads(DATA.read_text(encoding='utf-8'))['doors']
    for porta in porte:
        testo = (porta.get('text') or '').strip()
        if not testo:
            continue
        file = OUT / f"porta-{porta['day']:02d}.mp3"
        gTTS(testo, lang='it').save(str(file))
        print(f"porta {porta['day']:02d}: {file.name}")


if __name__ == '__main__':
    main()
