"""The garden's tasks as a Home Assistant to-do list, synchronised both ways (spec 4.7).

Items are the open tasks and those done in the last 30 days. Ticking an item
off completes the task (a repeating task gets its next date); items added in
Home Assistant become tasks of kind "other" - "Rose: cut back" is linked to the
plant named Rose.
"""

from __future__ import annotations

from datetime import date, datetime

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .care import Task, TaskKind, TaskStatus
from .entity import GARDEN_DEVICE
from .garden import GardenChange
from .runtime import PlantGardenConfigEntry

SEPARATOR = ": "


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PlantGardenConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([GardenTodoList(entry)])


class GardenTodoList(TodoListEntity):
    """Gartenaufgaben / Garden tasks."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_translation_key = "tasks"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(self, entry: PlantGardenConfigEntry) -> None:
        self._data = entry.runtime_data
        self._attr_unique_id = "garden_tasks"
        self._attr_device_info = DeviceInfo(identifiers={GARDEN_DEVICE})
        self._attr_todo_items = []

    async def async_added_to_hass(self) -> None:
        @callback
        def changed(change: GardenChange) -> None:
            if change.kind in ("care", "plant", "plant_removed"):
                self.hass.async_create_task(self._async_reload())

        self.async_on_remove(self._data.manager.async_subscribe(changed))
        await self._async_reload(write=False)

    def _summary(self, task: Task) -> str:
        plant = next((p for p in self._data.manager.plants if p.id == task.plant_id), None)
        return f"{plant.name}{SEPARATOR}{task.title}" if plant else task.title

    def _split(self, summary: str) -> tuple[str | None, str]:
        """Split "Rose: cut back" into (id of Rose, "cut back") when a plant has that name."""
        name, sep, title = summary.partition(SEPARATOR)
        if sep and title.strip():
            for plant in self._data.manager.plants:
                if plant.name.casefold() == name.strip().casefold():
                    return plant.id, title.strip()
        return None, summary.strip()

    async def _async_reload(self, *, write: bool = True) -> None:
        tasks = await self._data.care.async_tasks()
        self._attr_todo_items = [
            TodoItem(
                uid=task.id,
                summary=self._summary(task),
                status=TodoItemStatus.COMPLETED
                if task.status is TaskStatus.DONE
                else TodoItemStatus.NEEDS_ACTION,
                due=task.due,
                description=task.notes or None,
                completed=task.done_at,
            )
            for task in tasks
        ]
        if write:
            self.async_write_ha_state()

    @staticmethod
    def _due(value: date | datetime | None) -> date | None:
        return value.date() if isinstance(value, datetime) else value

    async def async_create_todo_item(self, item: TodoItem) -> None:
        plant_id, title = self._split(item.summary or "")
        task = await self._data.care.async_create_task(
            {
                "kind": TaskKind.OTHER,
                "title": title,
                "plant_id": plant_id,
                "due": self._due(item.due),
                "notes": item.description or "",
            }
        )
        if item.status == TodoItemStatus.COMPLETED:
            await self._data.care.async_complete_task(task.id)

    async def async_update_todo_item(self, item: TodoItem) -> None:
        if item.uid is None:
            return
        task = await self._data.care.async_get_task(item.uid)
        fields: dict[str, object] = {}
        if item.summary is not None:
            plant_id, title = self._split(item.summary)
            fields["title"] = title
            if plant_id is not None or task.plant_id is None:
                fields["plant_id"] = plant_id
            elif self._summary(task) != item.summary:
                fields["plant_id"] = None  # the plant prefix was removed
        fields["due"] = self._due(item.due)
        fields["notes"] = item.description or ""
        await self._data.care.async_update_task(task.id, fields)
        if item.status == TodoItemStatus.COMPLETED and task.status is TaskStatus.OPEN:
            await self._data.care.async_complete_task(task.id)
        elif item.status == TodoItemStatus.NEEDS_ACTION and task.status is TaskStatus.DONE:
            await self._data.care.async_reopen_task(task.id)

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            await self._data.care.async_delete_task(uid)
