"""Genera l'audio delle porte dell'Avvento da public/data/avvento.json.

Voce di prova gratuita (gTTS). La registrazione vera sostituirà questi file
con gli stessi nomi: public/audio/porta-NN.mp3.

Uso: python3 scripts/genera-audio-avvento.py
"""
import json
import pathlib

from gtts import gTTS

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'public' / 'data' / 'avvento.json'
OUT = ROOT / 'public' / 'audio'


def testo_porta(porta, porta_successiva):
    # Stessa precedenza del pop-up: audio, poi filastrocca, poi testo.
    # Una porta con solo disegno fa sentire il testo della porta successiva.
    testo = porta.get('audio') or porta.get('filastrocca') or porta.get('text')
    if not testo and porta_successiva:
        testo = porta_successiva.get('text')
    return (testo or '').strip()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    porte = json.loads(DATA.read_text(encoding='utf-8'))['doors']
    for indice, porta in enumerate(porte):
        successiva = porte[indice + 1] if indice + 1 < len(porte) else None
        testo = testo_porta(porta, successiva)
        if not testo:
            continue
        file = OUT / f"porta-{porta['day']:02d}.mp3"
        gTTS(testo, lang='it').save(str(file))
        print(f"porta {porta['day']:02d}: {file.name}")


if __name__ == '__main__':
    main()
