#!/usr/bin/env python3
"""Kaido (I5): Kein „Postiz“ in der Oberfläche.

Jeder Upstream-Text, der Postiz nennt, bekommt in locales-kaido/<sprache>.json
eine Fassung mit „Kaido Publish“. Die Upstream-Dateien bleiben unberührt (der
wöchentliche Rebase kollidiert dort nie); nach jedem Rebase einmal laufen
lassen, neue Upstream-Texte kommen dann automatisch dazu.

  marke-uebersetzungen.py            schreibt die Kaido-Dateien
  marke-uebersetzungen.py --pruefen  Exit 1, wenn etwas fehlt (nichts schreiben)

Von Hand gepflegte Kaido-Texte ohne „Postiz“ bleiben stehen. Texte, die mit
Postiz' Nutzerzahlen werben, werden nicht umbenannt, sondern ersetzt — für
Kaido Publish wären sie falsch (die Bezahlseiten zeigen nur noch den Namen).
"""
import json
import re
import sys
from pathlib import Path

BASIS = Path(__file__).resolve().parent.parent / 'libraries/react-shared-libraries/src/translation'
NAME = 'Kaido Publish'

# Werbeaussagen mit Postiz-Zahlen: eigener Text statt Umbenennung.
ERSATZ = {
    # Überschrift der Bezahlseiten, darunter steht „To Manage All Your Social Media Channels“.
    'join_10000_entrepreneurs_who_use_postiz': {'en': NAME},
    'billing_postiz_grow_social': {
        'en': 'Plan, review and publish every post in one place',
        'de': 'Jeden Beitrag an einem Ort planen, prüfen und veröffentlichen',
    },
}


def umbenennen(text: str) -> str:
    return re.sub(r'postiz', NAME, text, flags=re.IGNORECASE)


def main() -> int:
    pruefen = '--pruefen' in sys.argv
    fehlt = []
    for datei in sorted((BASIS / 'locales').glob('*/translation.json')):
        sprache = datei.parent.name
        upstream = json.loads(datei.read_text(encoding='utf-8'))
        ziel = BASIS / 'locales-kaido' / f'{sprache}.json'
        kaido = json.loads(ziel.read_text(encoding='utf-8')) if ziel.exists() else {}
        vorher = dict(kaido)
        for schluessel, wert in upstream.items():
            if not isinstance(wert, str) or not re.search('postiz', wert, re.IGNORECASE):
                continue
            eigen = kaido.get(schluessel)
            if eigen is not None and not re.search('postiz', eigen, re.IGNORECASE):
                continue
            if schluessel in ERSATZ:
                kaido[schluessel] = ERSATZ[schluessel].get(sprache, ERSATZ[schluessel]['en'])
            else:
                kaido[schluessel] = umbenennen(wert)
        if kaido != vorher:
            fehlt.append(f'{sprache}: {len(set(kaido) - set(vorher))} neu, '
                         f'{sum(1 for k in vorher if kaido[k] != vorher[k])} geändert')
            if not pruefen:
                ziel.write_text(json.dumps(kaido, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for zeile in fehlt:
        print(zeile)
    return 1 if (pruefen and fehlt) else 0


if __name__ == '__main__':
    sys.exit(main())
