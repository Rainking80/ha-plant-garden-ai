# Autogarden – user guide

[Deutsch](USER_GUIDE.de.md)

Autogarden adds a garden planner and plant journal to Home Assistant. Everything
happens in the sidebar entry the integration creates; the settings live under
**Settings → Devices & services → Autogarden**.

## 1. First steps

1. Install the integration (see the [README](../README.md)) and add it with a name
   for your garden. The garden starts at Home Assistant's home location.
2. Open **Plants** and add your plants – by hand, or import them once from an
   existing to-do list. Name and category are enough; everything else can follow.
   Fastest for a whole garden: the **garden walk** (Plants tab). Take a photo of
   one plant after the other, or choose many photos at once. Every photo becomes
   a plant; when the photo carries a GPS position inside your garden, the plant
   is placed on the plan there. Tick *Identify and name with AI* (the cost per
   photo is shown, off until you tick it) and each plant is identified, named
   after its species and filled with its botanical name, care values and size
   as AI suggestions. When the AI is not sure, the plant keeps a provisional
   name ("New plant 3") for you to decide on its page.
3. Add photos on a plant's page (drag and drop works). Capture dates come from the
   photo; GPS and other metadata are removed.
4. After the upload, **Crop photo** opens for each photo: the frame already sits
   around the plant (found from its colours, without AI). Drag it by finger or
   mouse or by its corners, choose *Square* for round thumbnails and *Rotate* for
   photos taken sideways. *Apply* saves the crop, *Skip* keeps the photo as it is.
   Later the photo viewer offers **Crop**; the uploaded photo is kept, *As
   uploaded* brings it back. Thumbnails, the plant on the plan and the AI see the
   crop.

## 2. Garden plan

- **View mode** shows the plan; drag to pan, pinch or scroll to zoom, tap a plant
  for its info card. Nothing moves by accident.
- **Edit mode** (pencil): draw beds, lawns, paths, buildings and other areas as
  rectangles, circles or polygons; drag plants from the tray onto the plan; move,
  resize and rotate; undo and redo (Ctrl+Z / Ctrl+Y). Every change is saved
  immediately.
- **Background**: official aerial imagery of many German states (with the required
  attribution), any WMS service, or an uploaded sketch that you calibrate with two
  known points. **Grey background** (button next to *Show everything*) hides it
  behind plain grey, so plants, beds and rings stand out, and no aerial imagery
  is loaded; each device remembers it. Moving or calibrating the background
  still shows it.
- **A plan from a picture** (edit mode, with an uploaded picture as background):
  calibrate the picture, then choose *Find areas in the picture*. The AI traces
  the areas it recognises - house, terrace, lawn, beds, paths, pond - and lists
  them with their size; untick what does not fit and take the rest over. They
  are ordinary areas you can reshape, and one *Undo* removes them all. It works
  on a hand sketch, a site plan or a screenshot of an aerial image; the built-in
  aerial imagery cannot be read this way (your browser loads it, Home Assistant
  never sees it). The picture is sent to your AI provider.
- **Location**: if your garden is not at home (an allotment), move the plan to its
  real place; everything already drawn can stay where it is on the map or move
  along.
- **Markers** show live values of any Home Assistant entity (soil moisture,
  temperature …) on the plan.
- **Layers**: plan, soil water deficit (green to red), irrigation coverage, or
  **sun and shade**: the hours of direct sun every place gets on a clear day of
  the month you choose (dark blue = shade, yellow = sun all day). Shadows come
  from buildings, greenhouses, roofs, hedges and tall plants; give an area its
  *height* in edit mode (a house counts as 6 m, a hedge as 1.8 m until you do),
  trees and shrubs use their measured height. A plant's page shows the sun of
  its place over the growing season and offers it as the plant's *light*.
  Clouds, slopes and anything outside the plan are not considered.

Rings around plants: amber dashed = needs water, icy blue = frost expected below
the plant's limit, violet dotted = pruning due within a week; a red dot marks an
open problem.

## 3. Irrigation

In edit mode, the tool bar group **Irrigation** offers:

- **Sprinkler**: tap where it stands – it waters 45° to the north – or drag from
  there in the direction it throws. Drag the two points at the ends of the arc to
  change the angle, the blue point in its middle for reach and direction, the
  sprinkler itself to move it.
- **Circular sprinkler**: tap or drag to its reach; the blue point changes the
  reach.
- **Drip line**: tap point by point along the hose and tap the last point again
  (or double-click, Enter) to finish. Drag points to move them, the small point
  between two to add one; double-click removes one. Its water can be given in L/h
  per metre of hose; the wetted width is 0.4 m to start.
- **Irrigation area**: draw any area that one valve waters.

Then link the valve, switch or input boolean (on the right). Several sprinklers
on one valve each link the same switch. Optional: a timer (remaining time on the
plan) and a water meter (real litres instead of an estimate; sprinklers sharing it
share its litres). Choose the emitter (spray, rotor, drip line, drippers per plant,
by hand) and its rate or flow.

Autogarden **never switches anything**. It records every run, works out how much
water each plant in the zone received and offers sensors and the binary sensor
"irrigation recommended" for your own automations. Watering with a can is logged
on the plant page or with the action `plant_garden.log_watering`.

## 4. Weather and water balance

Add a weather source in the integration settings: your own sensors (they win),
Open-Meteo (worldwide) or Bright Sky / German Weather Service (Germany). Nothing is
fetched before you add one; the services receive your location rounded to about
1 km.

Autogarden keeps a soil water "bucket" for every plant from rain, evaporation
(FAO-56 ET₀), soil, root depth, water need and irrigation; a plant "needs water"
when its readily available water is used up. Plants under a roof get no rain.

**Soil moisture sensors**: on a plant's page, under *Water*, choose *Link a soil
moisture sensor*. From then on the sensor's reading stands for the plant's soil
water - "needs water", the week's outlook and the zone advice go on from the
measurement, and the page shows what the calculation would have said. The sensor
needs a scale: *wet* is the reading a day after thorough watering, *dry* the
reading when the plant wilts. Without your values, *wet* is the highest reading
of the last 60 days and *dry* follows from the soil type (both marked "learned");
tap either to enter your own. A sensor without a reading for a day is ignored
and the calculation takes over. One sensor can be linked to several plants.

The **Water & weather** tab shows rain and evaporation of the last week and the
next seven days, with weekday and date. Above each coming day, the plants that
will need water then are circles in a cloud (tap one to open the plant): the
bucket is run forward with the forecast evaporation and the forecast rain,
weighted by its probability. If the rain of the next two days will refill a
thirsty plant, it waits; after its watering day a plant counts as watered. The
soil water list shows each plant's next watering day, or "rain expected".

## 5. AI identification (optional)

Add an AI provider in the integration settings (**Add AI provider**):

| Provider | Key | Notes |
|---|---|---|
| Home Assistant AI task | none | uses an AI already set up in HA; costs are not reported |
| Anthropic Claude | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) | |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | |
| OpenRouter | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | reports the cost of every call |
| Ollama, LM Studio | none | local models; enter a price of 0 on the Tech page |
| Pl@ntNet | [my.plantnet.org](https://my.plantnet.org) | species candidates; 500 free identifications a day |

On a plant's page choose **Identify**, pick 1–3 photos and what they show (leaf,
flower, fruit, bark, whole plant). You see an estimate of the cost first. Every
suggestion can be taken over or dismissed on its own; values you entered yourself
are never replaced. Suggestions include a care profile (watering, fertilising,
pruning), which you can also write yourself in the plant form.

With the option *Identify new plants after a photo upload* (off by default), a
new photo of a plant without botanical name is identified automatically.

## 6. Assistant

- **Tasks** (tab *Tasks* and on every plant page): water, fertilise, prune, repot,
  check for pests, harvest, take a photo or anything else; with a due date, a
  repetition every N days or weeks (counted from the day you did it) and optional
  months for seasonal work. The same tasks appear in Home Assistant's to-do list
  **Garden tasks** – tick them off there or add new ones ("Rose: cut back" belongs
  to the plant named Rose).
- **Problems**: "Report a problem" on a plant page, or tag a photo with `problem`.
  Follow it with a log of what you did and change its status. With an AI provider,
  **Diagnose with AI** gives symptoms, possible causes with confidence and
  evidence, what to do and how urgent, warnings (e.g. toxicity for pets), what to
  watch and what information is missing. A follow-up photo becomes a task.
- **Tips** for a plant or the whole garden consider season, weather, soil water,
  tasks and problems. Proposed jobs become tasks with one click. The assistant
  may ask you questions (e.g. the soil type) – answer or skip them.
- **Garden assistant** (the robot button in the header, on every page; it stays
  in view while you scroll): a chat beside the page - half the window wide, with
  a button to enlarge it. It knows your plants, soil water, weather, tasks and
  problems, looks things up in this guide and - with Claude, Gemini or
  OpenRouter - searches the web for gardening knowledge. Ask "What is to do
  today?", "Which plants need water?" or "How do I set up the irrigation?", or
  give it a job: "Create a lavender and remind me to prune it in spring", "I
  watered the tomatoes with five litres", "The basil has brown spots". Plants it
  creates are not on the plan yet - drag them there yourself. Everything it
  changed is listed under its answer with *Undo*. It cannot delete, change
  settings or switch anything, and it never gets your plant notes or your
  location. Every answer is one or more AI calls; its cost stands below it. It
  needs Claude, OpenAI, OpenRouter or Gemini as AI provider - an AI set up in
  Home Assistant (AI task) cannot run it.
- **Chat about one plant**: "Ask the AI" on its page. The answer appears while it
  is written.
- **Weekly check** (option, off by default): every Monday at 8:00 the AI looks at
  the garden and leaves tips.
- **Plant knowledge** (on every plant page): the assistant
  researches care by topic, a care calendar, warnings (e.g. toxicity) and the
  sources for a plant - on the web with Claude, Gemini or OpenRouter, else from
  Wikipedia. Choose *Research knowledge* on a plant page, or let it research on
  its own: one plant a week, a day, three a day or an hour (off by default; on
  the Tech tab, administrators only).
  The cost of one plant is shown, usually around 10 cents with web search. A
  plant with knowledge is never researched again - delete its knowledge on the
  plant page to have it researched anew. Jobs of its care calendar become yearly
  tasks with *As a task* (or all at once).
- **Weather warnings** (tab *Water & weather*): frost below a
  plant's limit, heat, storm, heavy rain, and weather for fungal diseases and
  slugs, each with what to do and the plants at risk. New warnings also arrive as
  a Home Assistant notification and as the event `plant_garden_weather_alert`
  (option *Weather warnings*, on; no AI, no costs).
- **Dream garden** (its own tab): ideas for redesigning the garden from a photo,
  in four steps - each starts only when you press its button.
  1. *Upload a photo* of the garden or a part of it. *Let the AI look*: it
     describes what it sees ("I see a lawn with a paved path ...") and asks a
     few questions with answers to tap.
  2. Say what you wish for, tap what must stay as it is, pick a style (the ones
     the AI finds fitting are outlined) and how much may change.
  3. *Create the concept*: steps and a plant list that fits your site - the
     soil of your beds, last year's coldest night, hottest day and rainfall,
     the plants you already have - with quantity, spacing and cautions. This is
     a text call that costs little. Untick plants you do not want.
  4. *Create the picture*: the AI edits your photo to show the ticked plants.
     **A picture costs several cents**; the estimated price and the provider
     are shown, and you confirm every picture. Compare with the before/after
     slider, describe a change ("more white, no bench") to refine it, or
     create a new one.
  *Take over* turns the ticked plants into planned plants with a task to plant
  them. The picture is an idea, not a building plan: image models may alter
  details of the house or the layout - what counts is the plant list. Pictures
  need OpenAI, Google Gemini or OpenRouter as AI provider (choose it and, if you
  like, the picture model in the integration's options); the first two steps
  work with any provider that reads photos.
- **What fits here?** (the sparkle button on the plan): tap a free place, add a
  wish if you like ("something for bees"), and choose *Get suggestions*. The AI
  gets what the plan knows about the place - computed hours of sun, the bed's
  soil, the free room to the next crown, the neighbouring plants, last year's
  coldest night, whether it is irrigated - and proposes up to five plants with
  size, planting months, good and bad neighbours and cautions. *Take over*
  places the plant there (tagged *planned*, its values marked as AI
  suggestions) and adds a task to plant it in the next planting month.
- **Photo comparison** (plant page): the AI compares the newest photo with an
  earlier one - growth, changes, concerns - and opens a problem when something is
  wrong. After every upload on its own with the option *Compare new photos with
  earlier ones* (off; an AI call with costs).
- **Camera watch and time-lapse** (plant page, under *Photos*): *Link a camera*
  and the plant gets a picture from that camera every day at noon, tagged
  `camera` - free and without AI. Right after linking, the camera's whole
  picture opens: drag the frame around the plant and *Save the frame*. Every
  camera picture of this plant is cut to it, so one camera can watch several
  plants, each with its own frame; *Change the frame* adjusts it later (earlier
  pictures keep their cut). *Take one now* adds a picture at once.
  *Time-lapse* plays a plant's photos from the oldest to the newest (with camera
  pictures only those, as they show the same view). Camera pictures older than
  60 days are thinned to one per week; pictures you tagged, annotated, cropped
  or made the cover always stay. With the option *Weekly look at the camera
  pictures* (off; an AI call with costs) the AI compares the newest camera
  picture with an earlier one every Monday and opens a problem when something
  is wrong.
- **Hedges in Germany**: from 1 March to 30 September only gentle shaping cuts
  are allowed (§ 39 BNatSchG); pruning tasks of hedges in that time say so, and
  the AI takes it into account (Home Assistant's country must be Germany).

The assistant receives a compact summary of the garden (see *Privacy*). Every AI
call is logged with tokens and costs.

## 7. Costs and the Tech page

The **Tech** tab (administrators) shows requests, tokens and costs today, this
month and overall, per model, feature and plant, the request log (CSV export),
the providers with "test connection", and the price table. Prices (USD per million
tokens, as of 2026-11-08) can be changed per model. In the options you set a
monthly budget (a notice at 80 % and 100 %, optionally stop further calls) and a
fixed USD → EUR rate.

## 8. Automations

Entities per plant: water received (L, for long-term statistics), water today,
last watering, soil water deficit, open tasks, needs water, problem (and the plant
status, disabled by default). Per zone: run time and litres today, recommended run
time, irrigation recommended. For the garden: ET₀ and rain today, rain tomorrow,
AI costs, tokens and requests, the to-do list.

Actions: `log_watering`, `refresh_weather`, `identify_plant`, `ask_assistant`
(returns the answer), `create_task`, `add_photo` (file in an allowed folder or a
camera snapshot).

Events: `plant_garden_irrigation_finished`, `plant_garden_task_due`,
`plant_garden_problem_detected`, `plant_garden_weather_alert`.

**Voice assistants**: Autogarden appears as a tool set named *Autogarden* (*Autogarten* in German) for
conversation agents that use a language model. Switch it on in the agent's
settings (**Settings → Voice assistants →** your agent **→** the list of what the
assistant may control). Then ask, by voice or in the Assist chat, "what needs
water today?", "how is the rose doing?", or say "I watered the tomatoes with five
litres", "remind me to prune the hedge in three days", "the rose pruning is done",
"the basil has brown spots". The tools read and write the garden only - nothing is
switched. The agent's model sees what the tools answer: plant names, soil water,
tasks, problems and care hints, never your notes, your location or entity ids.
Nothing is shared with an agent you have not given the tool set to.

Example: notify when a task is due.

```yaml
triggers:
  - trigger: event
    event_type: plant_garden_task_due
actions:
  - action: notify.mobile_app_phone
    data:
      message: "Garden: {{ trigger.event.data.title }}"
```

## 9. Privacy

- Photos and all data stay in Home Assistant (`<config>/plant_garden/` and
  `.storage`) and are part of your backups.
- AI providers receive only what a feature needs: the chosen photos (re-encoded,
  without metadata), plant details, the month and hemisphere, and for the
  assistant a summary of soil water, weather, irrigation, tasks and problems.
  Never your location, your plant notes, names of people or entity ids. Keys never
  leave Home Assistant.
- The plant knowledge research sends the plant's name, botanical name, variety,
  category, where it grows, the month and the hemisphere; the AI provider then
  searches the web. Without web search, Wikipedia receives the plant's name.
- Weather services receive your location rounded to about 1 km. Aerial imagery is
  loaded by your browser from the survey offices.

## 10. Moving to another Home Assistant

On the **Tech** tab (administrators), *Export as JSON* saves the plan (with its
location and background), the plants, measurements and open tasks. In the other
Home Assistant, set up Autogarden, open the Tech tab and choose *Import a file*:
you see what the file contains and confirm. It only imports into an empty garden,
and everything lands at the same place on the map, whatever that Home Assistant's
home location is. Photos, history, AI providers and weather sources are not
part of the file – add them again; valves and sensors with other names are listed
under Repairs until you link them again.

## 11. Removing the integration

Removing the integration keeps your garden: plants, photos and history come back
when you add it again. To delete everything, remove the integration and then
delete the folder `<config>/plant_garden/` and the files
`.storage/plant_garden.*` while Home Assistant is stopped.

## 12. Troubleshooting

- **Repairs** tells you about a zone that ran for hours (stuck valve), a zone whose
  entity no longer exists, a rejected AI key and the AI budget.
- **Diagnostics** (integration menu → *Download diagnostics*) contains counts,
  settings, weather and AI status – without keys, coordinates or entity ids – and
  helps with bug reports.
- The panel shows "loading" forever: reload the browser page; check the Home
  Assistant log for `plant_garden`.
