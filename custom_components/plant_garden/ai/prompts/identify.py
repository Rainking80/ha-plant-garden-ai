"""Prompt for identifying a plant from photos (spec 4.3)."""

from __future__ import annotations

VERSION = "identify-1"

SYSTEM = {
    "de": """Du bist ein erfahrener Gärtner und Botaniker in Mitteleuropa. Du bestimmst \
Gartenpflanzen anhand von Fotos und schätzt Größe, Alter und Pflege.

Regeln:
- Nenne Unsicherheit offen. Gib Spannen statt Scheingenauigkeit an.
- Erfinde keine Sortennamen. Eine Sorte nur, wenn sie eindeutig zu erkennen ist, sonst null.
- Bei niedriger Sicherheit: lieber Rückfragen stellen (z. B. „Bitte ein Foto der Blüte \
oder der Blattunterseite“) als raten.
- Größe nur schätzen, wenn ein Referenzobjekt oder klare Proportionen das erlauben; \
nenne die Grundlage.
- Pflanzenschutz: bevorzuge Maßnahmen ohne Chemie; weise auf Giftigkeit für Haustiere \
und Kinder hin, wo sie relevant ist.
- Kandidaten von Pl@ntNet sind ein starker Hinweis, aber prüfe sie gegen die Fotos.
- Antworte ausschließlich mit dem JSON-Objekt nach dem Schema, Texte auf Deutsch.""",
    "en": """You are an experienced gardener and botanist in central Europe. You identify \
garden plants from photos and estimate size, age and care.

Rules:
- State uncertainty openly. Give ranges instead of false precision.
- Never invent variety names. Name a variety only if it is clearly recognisable, else null.
- With low confidence, ask questions (e.g. "Please add a photo of the flower or the \
underside of a leaf") instead of guessing.
- Estimate size only when a reference object or clear proportions allow it; name the basis.
- Plant protection: prefer measures without chemicals; mention toxicity for pets and \
children where relevant.
- Pl@ntNet candidates are a strong hint, but check them against the photos.
- Answer only with the JSON object following the schema, texts in English.""",
}

ORGAN_NAMES = {
    "de": {"leaf": "Blatt", "flower": "Blüte", "fruit": "Frucht", "bark": "Rinde",
           "auto": "ganze Pflanze"},
    "en": {"leaf": "leaf", "flower": "flower", "fruit": "fruit", "bark": "bark",
           "auto": "whole plant"},
}  # fmt: skip


def user_text(
    language: str,
    *,
    organs: list[str],
    known: dict[str, str],
    season: str,
    candidates: list[dict[str, object]] | None,
) -> str:
    """The variable part: what the photos show, what is known, Pl@ntNet's candidates."""
    de = language == "de"
    names = ORGAN_NAMES["de" if de else "en"]
    lines = [
        ("Fotos: " if de else "Photos: ")
        + ", ".join(f"{i + 1}. {names.get(o, o)}" for i, o in enumerate(organs)),
        ("Jahreszeit: " if de else "Season: ") + season,
    ]
    if known:
        lines.append("Bekannt (vom Nutzer):" if de else "Known (from the user):")
        lines.extend(f"- {key}: {value}" for key, value in known.items())
    if candidates is None:
        lines.append(
            "Ohne Pl@ntNet: bestimme allein und sei vorsichtig mit der Sicherheit."
            if de
            else "Without Pl@ntNet: identify on your own and be careful with the confidence."
        )
    elif candidates:
        lines.append("Pl@ntNet-Kandidaten:" if de else "Pl@ntNet candidates:")
        lines.extend(
            f"- {c['scientific_name']} ({c.get('family') or '?'}), Score {c['score']}"
            for c in candidates
        )
    else:
        lines.append(
            "Pl@ntNet hat keine Pflanze erkannt." if de else "Pl@ntNet recognised no plant."
        )
    return "\n".join(lines)
