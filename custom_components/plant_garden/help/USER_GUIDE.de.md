# Autogarten – Anleitung

[English](USER_GUIDE.md)

Autogarten ergänzt Home Assistant um einen Gartenplaner und ein Pflanzentagebuch.
Alles passiert im Seitenleisten-Eintrag der Integration; die Einstellungen liegen
unter **Einstellungen → Geräte & Dienste → Autogarten**.

## 1. Erste Schritte

1. Integration installieren (siehe [README](../README.md)) und mit einem Namen für
   den Garten hinzufügen. Der Garten beginnt am Zuhause-Standort von Home Assistant.
2. Unter **Pflanzen** die Pflanzen anlegen – von Hand oder einmalig aus einer
   bestehenden To-do-Liste importieren. Name und Kategorie reichen; der Rest kann
   später kommen.
   Am schnellsten für einen ganzen Garten: der **Garten-Rundgang** (Reiter
   Pflanzen). Eine Pflanze nach der anderen fotografieren oder viele Fotos auf
   einmal wählen. Jedes Foto wird zu einer Pflanze; trägt das Foto einen
   GPS-Standort in deinem Garten, landet die Pflanze dort auf dem Plan. Mit
   *Mit KI bestimmen und benennen* (die Kosten pro Foto stehen dabei, aus bis du
   es ankreuzt) wird jede Pflanze bestimmt, nach ihrer Art benannt und mit
   botanischem Namen, Pflegewerten und Größe als KI-Vorschlägen gefüllt. Ist die
   KI unsicher, behält die Pflanze einen vorläufigen Namen („Neue Pflanze 3“),
   über den du auf ihrer Seite entscheidest.
3. Auf der Pflanzenseite Fotos hinzufügen (Drag-and-drop geht). Das Aufnahmedatum
   kommt aus dem Foto; GPS und andere Metadaten werden entfernt.
4. Nach dem Hochladen öffnet sich für jedes Foto **Foto zuschneiden**: Der Rahmen
   steht schon um die Pflanze (erkannt an ihren Farben, ohne KI). Zieh ihn mit
   Finger oder Maus oder an seinen Ecken, wähle *Quadrat* für runde Vorschaubilder
   und *Drehen* für schief aufgenommene Fotos. *Übernehmen* speichert den
   Ausschnitt, *Überspringen* lässt das Foto wie es ist. Später geht das im
   Fotobetrachter mit **Zuschneiden**; das hochgeladene Foto bleibt erhalten, *Wie
   hochgeladen* holt es zurück. Vorschaubilder, die Pflanze auf dem Plan und die KI
   sehen den Ausschnitt.

## 2. Gartenplan

- **Ansichtsmodus**: Plan verschieben, zoomen, Pflanze antippen für die Info-Karte.
  Nichts verrutscht aus Versehen.
- **Bearbeitungsmodus** (Stift): Beete, Rasen, Wege, Gebäude und andere Flächen als
  Rechteck, Kreis oder Polygon zeichnen; Pflanzen aus der Ablage auf den Plan
  ziehen; verschieben, Größe ändern, drehen; Rückgängig und Wiederholen
  (Strg+Z / Strg+Y). Jede Änderung wird sofort gespeichert.
- **Hintergrund**: amtliche Luftbilder vieler Bundesländer (mit der vorgeschriebenen
  Quellenangabe), jeder WMS-Dienst oder eine hochgeladene Skizze, die mit zwei
  bekannten Punkten kalibriert wird. **Hintergrund grau** (Schaltfläche neben
  *Alles anzeigen*) blendet ihn aus und zeigt schlichtes Grau, damit Pflanzen,
  Beete und Ringe hervortreten; Luftbilder werden dann nicht geladen. Jedes Gerät
  merkt sich das. Beim Verschieben und Kalibrieren ist der Hintergrund trotzdem zu
  sehen.
- **Plan aus einem Bild** (Bearbeitungsmodus, mit einem hochgeladenen Bild als
  Hintergrund): das Bild kalibrieren, dann *Flächen aus dem Bild erkennen* wählen.
  Die KI zeichnet die Flächen nach, die sie erkennt - Haus, Terrasse, Rasen, Beete,
  Wege, Teich - und listet sie mit ihrer Größe auf; was nicht passt abwählen, den
  Rest übernehmen. Es sind normale Flächen, die sich nachformen lassen, und ein
  *Rückgängig* entfernt sie alle wieder. Das geht mit einer Handskizze, einem
  Lageplan oder einem Screenshot eines Luftbilds; die eingebauten Luftbilder lassen
  sich so nicht lesen (dein Browser lädt sie, Home Assistant sieht sie nie). Das
  Bild wird an deinen KI-Anbieter gesendet.
- **Standort**: Liegt der Garten nicht zu Hause (Kleingarten), den Plan an seinen
  echten Ort verschieben; Gezeichnetes bleibt auf der Karte, wo es ist, oder zieht
  mit.
- **Marker** zeigen Live-Werte beliebiger Entitäten (Bodenfeuchte, Temperatur …).
- **Ebenen**: Plan, Wasserdefizit (grün bis rot), Bewässerungsabdeckung oder
  **Sonne und Schatten**: die Stunden direkter Sonne, die jede Stelle an einem
  klaren Tag des gewählten Monats bekommt (dunkelblau = Schatten, gelb = Sonne den
  ganzen Tag). Schatten werfen Gebäude, Gewächshäuser, Dächer, Hecken und hohe
  Pflanzen; im Bearbeitungsmodus bekommt eine Fläche ihre *Höhe* (ein Haus zählt
  bis dahin als 6 m, eine Hecke als 1,8 m), Bäume und Sträucher nehmen ihre
  gemessene Höhe. Die Seite einer Pflanze zeigt die Sonne ihres Standorts über
  die Saison und bietet sie als *Licht* der Pflanze an. Wolken, Hänge und alles
  außerhalb des Plans bleiben unberücksichtigt.

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

Autogarten **schaltet nie etwas**. Es erfasst jeden Lauf, berechnet, wie viel
Wasser jede Pflanze der Zone bekommen hat, und bietet Sensoren und den
Binärsensor „Bewässerung empfohlen“ für eigene Automationen. Gießen mit der Kanne
wird auf der Pflanzenseite oder mit der Aktion `plant_garden.log_watering` erfasst.

## 4. Wetter und Wasserbilanz

In den Einstellungen eine Wetterquelle hinzufügen: eigene Sensoren (haben Vorrang),
Open-Meteo (weltweit) oder Bright Sky / Deutscher Wetterdienst. Vorher wird nichts
abgerufen; die Dienste erhalten den Standort auf etwa 1 km gerundet.

Autogarten führt für jede Pflanze einen Bodenwasser-„Eimer“ aus Regen,
Verdunstung (FAO-56 ET₀), Boden, Wurzeltiefe, Wasserbedarf und Bewässerung;
Gießbedarf besteht, wenn das leicht verfügbare Wasser verbraucht ist. Pflanzen
unter einem Dach bekommen keinen Regen.

**Bodenfeuchtesensoren**: Auf der Seite einer Pflanze unter *Wasser* *Bodenfeuchtesensor
verknüpfen* wählen. Ab dann steht der Messwert des Sensors für das Bodenwasser der
Pflanze - „Gießbedarf“, der Wochenausblick und die Zonenempfehlung rechnen von der
Messung aus weiter, und die Seite zeigt, was die Berechnung ergeben hätte. Der Sensor
braucht eine Skala: *nass* ist der Messwert einen Tag nach gründlichem Gießen,
*trocken* der Wert, bei dem die Pflanze welkt. Ohne eigene Angaben gilt als *nass*
der höchste Wert der letzten 60 Tage, *trocken* folgt aus der Bodenart (beide als
„gelernt“ markiert); ein Tipp darauf trägt eigene Werte ein. Ein Sensor ohne
Messwert seit einem Tag wird ignoriert, dann wird wieder gerechnet. Ein Sensor kann
mit mehreren Pflanzen verknüpft sein.

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
- **Garten-Assistent** (die Roboter-Schaltfläche im Kopfbereich, auf jeder Seite;
  sie bleibt beim Scrollen sichtbar): ein Chat neben der Seite - halb so breit wie
  das Fenster, mit einer Schaltfläche zum Vergrößern. Er kennt deine Pflanzen,
  Bodenwasser, Wetter, Aufgaben und Probleme, schlägt in dieser Anleitung nach und
  sucht - mit Claude, Gemini oder OpenRouter - im Web nach Gartenwissen. Frag „Was
  ist heute zu tun?“, „Welche Pflanzen brauchen Wasser?“ oder „Wie richte ich die
  Bewässerung ein?“, oder gib ihm einen Auftrag: „Leg einen Lavendel an und erinnere
  mich im Frühjahr an den Schnitt“, „Ich habe die Tomaten mit fünf Litern gegossen“,
  „Das Basilikum hat braune Flecken“. Angelegte Pflanzen stehen noch nicht auf dem
  Plan - dorthin ziehst du sie selbst. Alles, was er geändert hat, steht unter
  seiner Antwort mit *Rückgängig*. Er kann nichts löschen, keine Einstellungen
  ändern und nichts schalten, und er bekommt nie deine Pflanzennotizen oder deinen
  Standort. Jede Antwort ist ein oder mehrere KI-Aufrufe; die Kosten stehen
  darunter. Er braucht Claude, OpenAI, OpenRouter oder Gemini als KI-Anbieter -
  eine in Home Assistant eingerichtete KI (AI Task) reicht dafür nicht.
  Jede Unterhaltung wird gespeichert und bekommt nach der ersten Antwort einen
  kurzen Titel von der KI. Die Uhr-Schaltfläche listet deine Chats mit Titel und
  Datum: antippen, um weiterzumachen, oder den Papierkorb zum Löschen; *Neuer
  Chat* (das Plus) beginnt einen frischen. Bis zu 50 Chats bleiben erhalten, der
  am längsten ungenutzte macht Platz.
- **Chat zu einer Pflanze**: „KI fragen“ auf ihrer Seite. Die Antwort erscheint,
  während sie geschrieben wird.
- **Wochencheck** (Option, standardmäßig aus): jeden Montag um 8 Uhr schaut die KI
  auf den Garten und hinterlässt Tipps.
- **Pflanzenwissen** (auf jeder Pflanzenseite): Der Assistent
  recherchiert Pflege nach Themen, einen Pflegekalender, Warnungen (z. B.
  Giftigkeit) und die Quellen zu einer Pflanze – im Web mit Claude, Gemini oder
  OpenRouter, sonst in Wikipedia. *Wissen recherchieren* auf der Pflanzenseite,
  oder selbstständig: eine Pflanze pro Woche, pro Tag, drei pro Tag oder eine pro
  Stunde (standardmäßig aus; im Tab Technik, nur Administratoren). Die Kosten für eine Pflanze werden angezeigt,
  mit Websuche meist um 10 Cent. Eine Pflanze mit Wissen wird nie erneut
  recherchiert – lösche ihr Wissen auf der Pflanzenseite, um es neu zu holen.
  Arbeiten aus ihrem Pflegekalender werden mit *Als Aufgabe* (oder alle auf
  einmal) zu jährlichen Aufgaben.
- **Wetter-Warnungen** (Tab *Wasser & Wetter*): Frost unter der
  Grenze einer Pflanze, Hitze, Sturm, Starkregen sowie Pilz- und Schneckenwetter,
  jeweils mit dem, was zu tun ist, und den betroffenen Pflanzen. Neue Warnungen
  kommen auch als Home-Assistant-Benachrichtigung und als Event
  `plant_garden_weather_alert` (Option *Wetter-Warnungen*, an; ohne KI, ohne
  Kosten).
- **Traumgarten** (eigener Reiter): Ideen für die Umgestaltung aus einem Foto, in
  vier Schritten - jeder startet erst, wenn du seine Schaltfläche drückst.
  1. *Foto hochladen* vom Garten oder einem Teil davon. *Foto ansehen lassen*:
     Die KI beschreibt, was sie sieht („Ich sehe einen Rasen mit einem
     Plattenweg ...“), und stellt ein paar Fragen mit Antworten zum Antippen.
  2. Wünsche nennen, antippen, was bleiben soll, einen Stil wählen (von der KI
     als passend erkannte sind umrandet) und wie stark sich etwas ändern darf.
  3. *Konzept erstellen*: Schritte und eine Pflanzenliste, die zum Standort
     passt - Boden der Beete, kälteste Nacht, heißester Tag und Niederschlag des
     letzten Jahres, vorhandene Pflanzen - mit Stückzahl, Abstand und
     Warnhinweisen. Das ist ein Text-Aufruf, der wenig kostet. Pflanzen, die du
     nicht möchtest, abwählen.
  4. *Bild erzeugen*: Die KI bearbeitet dein Foto so, dass es die angekreuzten
     Pflanzen zeigt. **Ein Bild kostet mehrere Cent**; der geschätzte Preis und
     der Anbieter stehen dabei, und du bestätigst jedes Bild. Mit dem
     Vorher-Nachher-Schieber vergleichen, eine Änderung beschreiben („mehr Weiß,
     ohne Bank“) oder ein neues Bild erzeugen.
  *Übernehmen* macht aus den angekreuzten Pflanzen geplante Pflanzen mit einer
  Pflanzaufgabe. Das Bild ist eine Idee, kein Bauplan: Bildmodelle können Details
  am Haus oder an der Aufteilung verändern - verbindlich ist die Pflanzenliste.
  Bilder brauchen OpenAI, Google Gemini oder OpenRouter als KI-Anbieter (Anbieter
  und auf Wunsch das Bildmodell in den Optionen der Integration wählen); die
  ersten beiden Schritte gehen mit jedem Anbieter, der Fotos liest.
- **Was passt hier hin?** (die Funkel-Schaltfläche im Plan): eine freie Stelle
  antippen, bei Bedarf einen Wunsch ergänzen („etwas für Bienen“) und *Vorschläge
  holen* wählen. Die KI bekommt, was der Plan über die Stelle weiß - berechnete
  Sonnenstunden, den Boden des Beets, den freien Platz bis zur nächsten Krone, die
  Nachbarpflanzen, die kälteste Nacht des letzten Jahres, ob bewässert wird - und
  schlägt bis zu fünf Pflanzen vor, mit Größe, Pflanzmonaten, guten und schlechten
  Nachbarn und Warnhinweisen. *Übernehmen* setzt die Pflanze an die Stelle
  (markiert als *geplant*, ihre Werte als KI-Vorschläge) und legt eine Aufgabe zum
  Pflanzen im nächsten Pflanzmonat an.
- **Fotovergleich** (Pflanzenseite): Die KI vergleicht das neueste Foto mit einem
  früheren – Wachstum, Veränderungen, Auffälligkeiten – und legt ein Problem an,
  wenn etwas nicht stimmt. Nach jedem Hochladen von selbst mit der Option *Neue
  Fotos mit früheren vergleichen* (aus; ein KI-Aufruf mit Kosten).
- **Kamera-Wächter und Zeitraffer** (Pflanzenseite, unter *Fotos*): *Kamera
  verknüpfen*, und die Pflanze bekommt jeden Mittag ein Bild dieser Kamera, mit dem
  Tag `camera` - kostenlos und ohne KI. Direkt nach dem Verknüpfen öffnet sich das
  ganze Kamerabild: den Rahmen um die Pflanze ziehen und *Ausschnitt speichern*.
  Jedes Kamerabild dieser Pflanze wird darauf zugeschnitten, so kann eine Kamera
  mehrere Pflanzen beobachten, jede mit eigenem Ausschnitt; *Ausschnitt ändern*
  passt ihn später an (frühere Bilder behalten ihren Zuschnitt). *Jetzt aufnehmen*
  ergänzt sofort ein Bild.
  *Zeitraffer* spielt die Fotos einer Pflanze vom ältesten zum neuesten ab (bei
  Kamerabildern nur diese, weil sie denselben Blick zeigen). Kamerabilder, die älter
  als 60 Tage sind, werden auf eines pro Woche ausgedünnt; Bilder mit eigenem Tag,
  Notiz, Zuschnitt oder als Titelbild bleiben immer. Mit der Option *Wöchentlicher
  Blick auf die Kamerabilder* (aus; ein KI-Aufruf mit Kosten) vergleicht die KI
  jeden Montag das neueste Kamerabild mit einem früheren und legt ein Problem an,
  wenn etwas nicht stimmt.
- **Hecken in Deutschland**: Vom 1. März bis 30. September ist nur ein schonender
  Form- und Pflegeschnitt erlaubt (§ 39 BNatSchG); Schnitt-Aufgaben an Hecken in
  dieser Zeit weisen darauf hin, und die KI berücksichtigt es (Land in Home
  Assistant: Deutschland).

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
`plant_garden_problem_detected`, `plant_garden_weather_alert`.

**Sprachassistenten**: Autogarten erscheint als Werkzeugsatz *Autogarten* für
Konversationsagenten mit Sprachmodell. Eingeschaltet wird er in den Einstellungen
des Agenten (**Einstellungen → Sprachassistenten →** dein Agent **→** die Liste,
was der Assistent steuern darf). Danach per Sprache oder im Assist-Chat fragen:
„Was braucht heute Wasser?“, „Wie geht es der Rose?“ - oder sagen: „Ich habe die
Tomaten mit fünf Litern gegossen“, „Erinnere mich in drei Tagen an den
Heckenschnitt“, „Der Rosenschnitt ist erledigt“, „Das Basilikum hat braune
Flecken“. Die Werkzeuge lesen und schreiben nur den Garten - geschaltet wird
nichts. Das Modell des Agenten sieht, was die Werkzeuge antworten: Pflanzennamen,
Bodenwasser, Aufgaben, Probleme und Pflegehinweise, nie deine Notizen, deinen
Standort oder Entitäts-IDs. Mit einem Agenten, dem du den Werkzeugsatz nicht
gegeben hast, wird nichts geteilt.

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
- Die Recherche zum Pflanzenwissen schickt Name, botanischen Namen, Sorte,
  Kategorie, Standorttyp, Monat und Halbkugel; der KI-Anbieter sucht dann im Web.
  Ohne Websuche bekommt Wikipedia den Namen der Pflanze.
- Wetterdienste bekommen den Standort auf etwa 1 km gerundet. Luftbilder lädt der
  Browser direkt bei den Vermessungsämtern.

## 10. Garten in ein anderes Home Assistant umziehen

Auf der Seite **Technik** (Administratoren) speichert *Als JSON exportieren* den
Plan (mit Standort und Hintergrund), die Pflanzen, Messungen und offenen Aufgaben.
Im anderen Home Assistant Autogarten einrichten, die Technikseite öffnen und
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
