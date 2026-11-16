"""Prompts of the dream garden: understanding a garden photo, the planting concept
and the instructions for the picture model."""

from __future__ import annotations

import json
from typing import Any

ANALYSIS_VERSION = "dream-look-1"
CONCEPT_VERSION = "dream-concept-1"

ANALYSIS_SYSTEM = {
    "de": """Du bist ein erfahrener Gartengestalter. Du siehst das Foto eines privaten \
Gartens oder Gartenteils und bereitest ein Gespräch über seine Umgestaltung vor.

Regeln:
- description: zwei bis drei Sätze in der Ich-Form, was du siehst ("Ich sehe einen \
Rasen mit einem Plattenweg ..."), sachlich und freundlich, ohne Wertung.
- elements: die erkennbaren Bestandteile in wenigen Worten (Rasen, Weg, Hecke, Baum, \
Zaun, Terrasse, Beet, Hauswand ...), höchstens 12.
- questions: zwei bis vier kurze Rückfragen, deren Antworten den Entwurf wirklich \
ändern (was soll bleiben, wie viel Pflege, wofür wird die Fläche genutzt, Kinder oder \
Haustiere, Sichtschutz). Jede mit zwei bis vier kurzen Antwortvorschlägen. Die erste \
Frage ist immer, was sich ändern oder dazukommen soll.
- styles: zwei bis vier Stile aus der Liste, die zu diesem Garten passen würden.
- Beschreibe nur, was zu sehen ist. Rate keine Pflanzenarten, die du nicht erkennst. \
Keine Personen, Hausnummern oder Kennzeichen erwähnen.
- Antworte ausschließlich mit dem JSON-Objekt nach dem Schema, Texte auf Deutsch.""",
    "en": """You are an experienced garden designer. You see a photo of a private garden \
or a part of it and prepare a conversation about redesigning it.

Rules:
- description: two or three sentences in the first person about what you see ("I see a \
lawn with a paved path ..."), factual and friendly, without judging.
- elements: the recognisable parts in a few words (lawn, path, hedge, tree, fence, \
terrace, bed, house wall ...), at most 12.
- questions: two to four short questions whose answers really change the design (what \
should stay, how much care, what the area is used for, children or pets, privacy). Each \
with two to four short suggested answers. The first question is always what should \
change or be added.
- styles: two to four styles from the list that would suit this garden.
- Describe only what can be seen. Do not guess plant species you do not recognise. Do \
not mention people, house numbers or licence plates.
- Answer only with the JSON object following the schema, texts in English.""",
}

CONCEPT_SYSTEM = {
    "de": """Du bist ein erfahrener Gartengestalter und Pflanzplaner. Aus dem Foto, den \
Wünschen des Gärtners und den Standortdaten machst du einen umsetzbaren Entwurf.

Regeln:
- Der Gärtner entscheidet. Halte dich an seine Wünsche, den gewählten Stil und daran, \
was bleiben soll. Schlage nichts vor, was er ausgeschlossen hat.
- Jede Pflanze muss zum Standort passen: zum Boden, zu den Sonnenstunden, zum \
Niederschlag und zur kältesten Nacht des letzten Jahres (min_temperature_c ist, was die \
Pflanze verträgt, und liegt darunter). Wo Daten fehlen, wähle robuste Arten und sag das.
- Höchstens 10 Pflanzen, verschiedene Höhen und Blühzeiten, mit Stückzahl (quantity) \
und Pflanzabstand (spacing_cm) für die sichtbare Fläche. Lieber luftig als zu dicht.
- Keine invasiven Arten. caution nennt Giftigkeit für Kinder und Haustiere und starke \
Ausbreitung. Erfinde keine Sortennamen.
- changes: die Änderungen als kurze Schritte. hardscape: Wege, Kanten, Sitzplatz, \
Mulch und Ähnliches, nur wenn gewünscht oder nötig.
- image_prompt: eine englische Beschreibung in drei bis fünf Sätzen, wie die \
bepflanzten Bereiche auf dem Foto aussehen sollen (wo welche Pflanzen stehen, Farben, \
Höhen) - nur die Änderungen, nicht das, was bleibt.
- Antworte ausschließlich mit dem JSON-Objekt nach dem Schema, Texte auf Deutsch \
(außer image_prompt).""",
    "en": """You are an experienced garden designer and planting planner. From the \
photo, the gardener's wishes and the site data you make a design that can be built.

Rules:
- The gardener decides. Follow the wishes, the chosen style and what should stay. Never \
propose what was ruled out.
- Every plant must fit the site: the soil, the hours of sun, the rainfall and the \
coldest night of the last year (min_temperature_c is what the plant tolerates, and lies \
below it). Where data is missing, choose robust species and say so.
- At most 10 plants, with different heights and flowering times, each with a quantity \
and a planting distance (spacing_cm) for the visible area. Airy rather than too dense.
- No invasive species. caution names toxicity for children and pets and strong \
spreading. Never invent variety names.
- changes: the changes as short steps. hardscape: paths, edging, a seat, mulch and the \
like, only if wanted or needed.
- image_prompt: an English description in three to five sentences of how the planted \
areas should look in the photo (which plants where, colours, heights) - only the \
changes, not what stays.
- Answer only with the JSON object following the schema, texts in English.""",
}

STRENGTH_TEXT = {
    "gentle": "Change little: keep the layout and the existing beds, add and replace plants.",
    "medium": "A clear makeover of the planting; the layout of lawn, beds and paths may shift.",
    "bold": "A bold redesign of the planted areas, as long as everything listed to keep stays.",
}


def look_text(language: str, styles: list[str]) -> str:
    de = language == "de"
    head = "Das ist mein Garten. Stile zur Auswahl: " if de else "This is my garden. Styles: "
    return head + ", ".join(styles)


def concept_text(language: str, site: dict[str, Any], brief: dict[str, Any]) -> str:
    de = language == "de"
    return "\n\n".join(
        [
            ("Standortdaten (JSON):\n" if de else "Site data (JSON):\n")
            + json.dumps(site, ensure_ascii=False, separators=(",", ":")),
            ("Wünsche des Gärtners (JSON):\n" if de else "The gardener's brief (JSON):\n")
            + json.dumps(brief, ensure_ascii=False, separators=(",", ":")),
            "Mach den Entwurf." if de else "Make the design.",
        ]
    )


def picture_prompt(
    *,
    description: str,
    plants: list[dict[str, Any]],
    keep: list[str],
    strength: str,
    month_name: str,
    instruction: str | None = None,
) -> str:
    """What the picture model is told (English: picture models follow it best)."""
    kept = ", ".join(["the house and all buildings", "walls and fences", "paths and paving",
                      "large trees", *keep])  # fmt: skip
    lines = [
        "Edit this photo of a private garden into a realistic picture of how the same "
        "garden could look after replanting.",
        f"Keep exactly as they are: the camera position and framing, {kept}. Do not add "
        "buildings, walls, pools, furniture or decoration that were not asked for. Do not "
        "change neighbouring properties or the sky.",
        f"Changes: {description}",
    ]
    if plants:
        listed = "; ".join(
            f"{p['quantity']} x {p['name']}"
            + (f" ({p['scientific_name']})" if p.get("scientific_name") else "")
            for p in plants
        )
        lines.append(
            f"Plants to show, established but believable for {month_name}, not overcrowded: "
            f"{listed}."
        )
    lines.append(STRENGTH_TEXT.get(strength, STRENGTH_TEXT["medium"]))
    if instruction:
        lines.append(f"Additional request: {instruction}")
    lines.append("Photorealistic, natural daylight, no text, no labels, no people.")
    return "\n".join(lines)
