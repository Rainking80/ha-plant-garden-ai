# Plant Garden – Anleitung

[English](USER_GUIDE.md)

Plant Garden ergänzt Home Assistant um einen Gartenplaner und ein Pflanzentagebuch.
Alles passiert im Seitenleisten-Eintrag der Integration; die Einstellungen liegen
unter **Einstellungen → Geräte & Dienste → Plant Garden**.

## 1. Erste Schritte

1. Integration installieren (siehe [README](../README.md)) und mit einem Namen für
   den Garten hinzufügen. Der Garten beginnt am Zuhause-Standort von Home Assistant.
2. Unter **Pflanzen** die Pflanzen anlegen – von Hand oder einmalig aus einer
   bestehenden To-do-Liste importieren. Name und Kategorie reichen; der Rest kann
   später kommen.
3. Auf der Pflanzenseite Fotos hinzufügen (Drag-and-drop geht). Das Aufnahmedatum
   kommt aus dem Foto; GPS und andere Metadaten werden entfernt.

## 2. Gartenplan

- **Ansichtsmodus**: Plan verschieben, zoomen, Pflanze antippen für die Info-Karte.
  Nichts verrutscht aus Versehen.
- **Bearbeitungsmodus** (Stift): Beete, Rasen, Wege, Gebäude und andere Flächen als
  Rechteck, Kreis oder Polygon zeichnen; Pflanzen aus der Ablage auf den Plan
  ziehen; verschieben, Größe ändern, drehen; Rückgängig und Wiederholen
  (Strg+Z / Strg+Y). Jede Änderung wird sofort gespeichert.
- **Hintergrund**: amtliche Luftbilder vieler Bundesländer (mit der vorgeschriebenen
  Quellenangabe), jeder WMS-Dienst oder eine hochgeladene Skizze, die mit zwei
  bekannten Punkten kalibriert wird.
- **Standort**: Liegt der Garten nicht zu Hause (Kleingarten), den Plan an seinen
  echten Ort verschieben; Gezeichnetes bleibt auf der Karte, wo es ist, oder zieht
  mit.
- **Marker** zeigen Live-Werte beliebiger Entitäten (Bodenfeuchte, Temperatur …).
- **Ebenen**: Plan, Wasserdefizit (grün bis rot) oder Bewässerungsabdeckung.

Ringe um Pflanzen: orange gestrichelt = Gießbedarf, eisblau = Frost unter der
Grenze der Pflanze erwartet, violett gepunktet = Schnitt innerhalb einer Woche
fällig; ein roter Punkt zeigt ein offenes Problem.

## 3. Bewässerung

Im Bearbeitungsmodus bietet die Gruppe **Bewässerung** in der Werkzeugleiste:

- **Rasensprenger**: dort tippen, wo er steht – er bewässert 45° nach Norden –
  oder von dort in die Richtung ziehen, in die er wirft. Die beiden Punkte an den
  Enden des Bogens ändern den Winkel, der blaue Punkt in der Mitte Reichweite und
  Richtung, der Regner selbst lässt sich verschieben.
- **Kreisregner**: tippen oder bis zur Reichweite ziehen; der blaue Punkt ändert
  die Reichweite.
- **Tropfschlauch**: Punkt für Punkt entlang des Schlauchs tippen und zum Beenden
  den letzten Punkt noch einmal antippen (oder Doppelklick, Enter). Punkte lassen
  sich verschieben, der kleine Punkt zwischen zweien fügt einen ein, Doppelklick
  entfernt einen. Die Wassermenge geht in L/h je Meter Schlauch; die benetzte
  Breite ist anfangs 0,4 m.
- **Bewässerungsfläche**: eine beliebige Fläche zeichnen, die ein Ventil bewässert.

Danach rechts das Ventil, den Schalter oder Input-Boolean verknüpfen. Mehrere
Regner an einem Ventil verknüpfen jeweils denselben Schalter. Optional: ein Timer
(Restlaufzeit im Plan) und ein Wasserzähler (echte Liter statt Schätzung; Regner
an einem Zähler teilen sich seine Liter). Regner, Versenkregner, Tropfschlauch,
Tropfer pro Pflanze oder „von Hand“ und die Niederschlagsrate oder Durchflussmenge
wählen.

Plant Garden **schaltet nie etwas**. Es erfasst jeden Lauf, berechnet, wie viel
Wasser jede Pflanze der Zone bekommen hat, und bietet Sensoren und den
Binärsensor „Bewässerung empfohlen“ für eigene Automationen. Gießen mit der Kanne
wird auf der Pflanzenseite oder mit der Aktion `plant_garden.log_watering` erfasst.

## 4. Wetter und Wasserbilanz

In den Einstellungen eine Wetterquelle hinzufügen: eigene Sensoren (haben Vorrang),
Open-Meteo (weltweit) oder Bright Sky / Deutscher Wetterdienst. Vorher wird nichts
abgerufen; die Dienste erhalten den Standort auf etwa 1 km gerundet.

Plant Garden führt für jede Pflanze einen Bodenwasser-„Eimer“ aus Regen,
Verdunstung (FAO-56 ET₀), Boden, Wurzeltiefe, Wasserbedarf und Bewässerung;
Gießbedarf besteht, wenn das leicht verfügbare Wasser verbraucht ist. Pflanzen
unter einem Dach bekommen keinen Regen.

Der Tab **Wasser & Wetter** zeigt Regen und Verdunstung der letzten Woche und der
nächsten sieben Tage, mit Wochentag und Datum. Über jedem kommenden Tag stehen die
Pflanzen, die dann Wasser brauchen, als Kreise in einer Wolke (Antippen öffnet die
Pflanze): Der Eimer wird mit der vorhergesagten Verdunstung und dem
vorhergesagten Regen – nach seiner Wahrscheinlichkeit – weitergerechnet. Füllt der
Regen der nächsten zwei Tage eine durstige Pflanze wieder auf, wartet sie; nach
ihrem Gießtag gilt sie als gegossen. Die Bodenwasser-Liste zeigt für jede Pflanze
den nächsten Gießtag oder „Regen erwartet“.

## 5. KI-Bestimmung (optional)

In den Einstellungen **KI-Anbieter hinzufügen**:

| Anbieter | Key | Hinweis |
|---|---|---|
| Home Assistant AI Task | keiner | nutzt eine in HA eingerichtete KI; Kosten werden nicht gemeldet |
| Anthropic Claude | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) | |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | |
| OpenRouter | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | meldet die Kosten jedes Aufrufs |
| Ollama, LM Studio | keiner | lokale Modelle; auf der Technikseite Preis 0 eintragen |
| Pl@ntNet | [my.plantnet.org](https://my.plantnet.org) | Artvorschläge; 500 kostenlose Bestimmungen pro Tag |

Auf der Pflanzenseite **Bestimmen** wählen, 1–3 Fotos auswählen und angeben, was
sie zeigen (Blatt, Blüte, Frucht, Rinde, ganze Pflanze). Vorher erscheint eine
Kostenschätzung. Jeder Vorschlag wird einzeln übernommen oder verworfen; eigene
Eingaben werden nie überschrieben. Die Vorschläge enthalten auch ein Pflegeprofil
(Gießen, Düngen, Schnitt), das du im Pflanzenformular auch selbst schreiben kannst.

Mit der Option *Neue Pflanzen nach dem Foto-Upload bestimmen* (standardmäßig aus)
wird ein neues Foto einer Pflanze ohne botanischen Namen automatisch bestimmt.

## 6. Assistent

- **Aufgaben** (Tab *Aufgaben* und auf jeder Pflanzenseite): gießen, düngen,
  schneiden, umtopfen, Schädlingskontrolle, ernten, Foto machen oder Sonstiges; mit
  Fälligkeit, Wiederholung alle N Tage oder Wochen (ab Erledigung gezählt) und
  optional Monaten für saisonale Arbeiten. Dieselben Aufgaben stehen in der
  To-do-Liste **Gartenaufgaben** von Home Assistant – dort abhaken oder neue
  anlegen („Rose: zurückschneiden“ gehört zur Pflanze Rose).
- **Probleme**: „Problem melden“ auf der Pflanzenseite oder ein Foto mit dem Tag
  `problem` versehen. Mit einem Verlauf der Maßnahmen begleiten und den Status
  ändern. Mit KI-Anbieter liefert **Mit KI diagnostizieren** Symptome, mögliche
  Ursachen mit Sicherheit und Belegen, Maßnahmen mit Dringlichkeit, Warnhinweise
  (z. B. Giftigkeit für Haustiere), Beobachtungshinweise und fehlende Angaben. Ein
  Folgefoto wird zur Aufgabe.
- **Tipps** für eine Pflanze oder den Garten berücksichtigen Jahreszeit, Wetter,
  Bodenwasser, Aufgaben und Probleme. Vorgeschlagene Arbeiten werden per Klick zu
  Aufgaben. Der Assistent stellt manchmal Rückfragen (z. B. zum Boden) – beantworten
  oder überspringen.
- **Chat**: Fragen zum Garten (Tab *Assistent*) oder zu einer Pflanze („KI fragen“
  auf ihrer Seite). Die Antwort erscheint, während sie geschrieben wird.
- **Wochencheck** (Option, standardmäßig aus): jeden Montag um 8 Uhr schaut die KI
  auf den Garten und hinterlässt Tipps.

Der Assistent bekommt eine kompakte Zusammenfassung des Gartens (siehe
*Datenschutz*). Jeder KI-Aufruf wird mit Tokens und Kosten protokolliert.

## 7. Kosten und Technikseite

Der Tab **Technik** (Administratoren) zeigt Anfragen, Tokens und Kosten heute, im
Monat und insgesamt, nach Modell, Funktion und Pflanze, das Anfrage-Protokoll
(CSV-Export), die Anbieter mit „Verbindung testen“ und die Preistabelle. Preise (USD
pro Million Tokens, Stand 2026-11-08) lassen sich pro Modell ändern. In den Optionen
gibt es ein Monatsbudget (Hinweis bei 80 % und 100 %, optional Stopp) und einen
festen Kurs USD → EUR.

## 8. Automationen

Entitäten pro Pflanze: Wasser erhalten (L, für die Langzeitstatistik), Wasser heute,
letzte Bewässerung, Bodenwasserdefizit, offene Aufgaben, Gießbedarf, Problem (und
der Pflanzenstatus, standardmäßig deaktiviert). Pro Zone: Laufzeit und Liter heute,
empfohlene Laufzeit, Bewässerung empfohlen. Für den Garten: ET₀ und Regen heute,
Regen morgen, KI-Kosten, -Tokens und -Anfragen, die To-do-Liste.

Aktionen: `log_watering`, `refresh_weather`, `identify_plant`, `ask_assistant`
(liefert die Antwort zurück), `create_task`, `add_photo` (Datei aus einem erlaubten
Ordner oder Kamera-Schnappschuss).

Events: `plant_garden_irrigation_finished`, `plant_garden_task_due`,
`plant_garden_problem_detected`.

Beispiel: Benachrichtigung bei fälliger Aufgabe.

```yaml
triggers:
  - trigger: event
    event_type: plant_garden_task_due
actions:
  - action: notify.mobile_app_handy
    data:
      message: "Garten: {{ trigger.event.data.title }}"
```

## 9. Datenschutz

- Fotos und alle Daten bleiben in Home Assistant (`<config>/plant_garden/` und
  `.storage`) und sind Teil der Backups.
- KI-Anbieter bekommen nur, was eine Funktion braucht: die gewählten Fotos (neu
  kodiert, ohne Metadaten), Angaben zur Pflanze, Monat und Halbkugel, und für den
  Assistenten eine Zusammenfassung von Bodenwasser, Wetter, Bewässerung, Aufgaben
  und Problemen. Nie den Standort, deine Pflanzennotizen, Namen von Personen oder
  Entity-IDs. Keys verlassen Home Assistant nicht.
- Wetterdienste bekommen den Standort auf etwa 1 km gerundet. Luftbilder lädt der
  Browser direkt bei den Vermessungsämtern.

## 10. Garten in ein anderes Home Assistant umziehen

Auf der Seite **Technik** (Administratoren) speichert *Als JSON exportieren* den
Plan (mit Standort und Hintergrund), die Pflanzen, Messungen und offenen Aufgaben.
Im anderen Home Assistant Plant Garden einrichten, die Technikseite öffnen und
*Datei importieren …* wählen: Du siehst, was die Datei enthält, und bestätigst. Der
Import geht nur in einen leeren Garten, und alles landet an derselben Stelle auf
der Karte, egal welchen Zuhause-Standort dieses Home Assistant hat. Fotos, Verlauf,
KI-Anbieter und Wetterquellen sind nicht enthalten – die richtest du neu ein;
Ventile und Sensoren mit anderen Namen stehen unter Reparaturen, bis du sie neu
verknüpfst.

## 11. Integration entfernen

Beim Entfernen bleibt der Garten erhalten: Pflanzen, Fotos und Verlauf sind wieder
da, wenn die Integration erneut hinzugefügt wird. Um alles zu löschen: Integration
entfernen, Home Assistant stoppen und den Ordner `<config>/plant_garden/` sowie die
Dateien `.storage/plant_garden.*` löschen.

## 12. Fehlersuche

- **Reparaturen** meldet eine Zone, die stundenlang läuft (hängendes Ventil), eine
  Zone, deren Entität es nicht mehr gibt, einen abgelehnten KI-Key und das
  KI-Budget.
- **Diagnose** (Menü der Integration → *Diagnosedaten herunterladen*) enthält
  Anzahlen, Einstellungen, Wetter- und KI-Status – ohne Keys, Koordinaten oder
  Entity-IDs – und hilft bei Fehlermeldungen.
- Das Panel lädt endlos: Browserseite neu laden; im Home-Assistant-Log nach
  `plant_garden` suchen.
