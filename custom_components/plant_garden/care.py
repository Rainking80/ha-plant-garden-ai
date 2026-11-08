"""Tasks, problems, questions and the chat history (spec 4.7) - the assistant's data.

No AI in here: `ai/assistant.py` fills problems with diagnoses and proposes
tasks and questions, the user does everything else. Records live in SQLite
(schema 5) next to photos and irrigation events.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import StrEnum
from functools import partial
import json
import logging
import sqlite3
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now

from .const import EVENT_PROBLEM_DETECTED, EVENT_TASK_DUE
from .database import GardenDatabase
from .garden import GardenChange, GardenManager, NotFoundError
from .models import Photo

_LOGGER = logging.getLogger(__name__)

PROBLEM_TAG = "problem"
PRUNE_AHEAD_DAYS = 7  # the plan shows "pruning due" a week ahead
DONE_KEEP_DAYS = 30  # completed tasks stay visible (and in the to-do list) this long
CHAT_KEEP = 200  # messages per conversation
DUE_CHECK_HOUR = 7  # local time of the daily "task due" events


class TaskKind(StrEnum):
    WATER = "water"
    FERTILIZE = "fertilize"
    PRUNE = "prune"
    REPOT = "repot"
    PEST_CHECK = "pest_check"
    HARVEST = "harvest"
    PHOTO = "photo"
    OTHER = "other"


class TaskStatus(StrEnum):
    OPEN = "open"
    DONE = "done"


class RepeatUnit(StrEnum):
    DAYS = "days"
    WEEKS = "weeks"


class ProblemStatus(StrEnum):
    OPEN = "open"
    TREATING = "treating"
    WATCHING = "watching"
    RESOLVED = "resolved"


class QuestionStatus(StrEnum):
    OPEN = "open"
    ANSWERED = "answered"
    DISMISSED = "dismissed"


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def next_due(done_on: date, every: int, unit: RepeatUnit, months: list[int]) -> date:
    """The next date of a repeating task, counted from the day it was done.

    `months` (1-12) limits a seasonal task: a date outside them moves to the 1st
    of the next allowed month.
    """
    step = timedelta(days=every * (7 if unit is RepeatUnit.WEEKS else 1))
    result = done_on + step
    allowed = {m for m in months if 1 <= m <= 12}
    if not allowed or result.month in allowed:
        return result
    year, month = result.year, result.month
    for _ in range(12):
        month += 1
        if month > 12:
            year, month = year + 1, 1
        if month in allowed:
            return date(year, month, 1)
    return result  # pragma: no cover - some month is always allowed


@dataclass(slots=True, kw_only=True)
class Task:
    id: str
    kind: TaskKind
    title: str
    notes: str = ""
    plant_id: str | None = None
    problem_id: str | None = None
    due: date | None = None
    repeat_every: int | None = None
    repeat_unit: RepeatUnit | None = None
    months: list[int] = field(default_factory=list)
    status: TaskStatus = TaskStatus.OPEN
    source: str = "user"
    created_at: datetime
    done_at: datetime | None = None
    due_notified: date | None = None

    @property
    def repeats(self) -> bool:
        return bool(self.repeat_every and self.repeat_unit)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind.value,
            "title": self.title,
            "notes": self.notes,
            "plant_id": self.plant_id,
            "problem_id": self.problem_id,
            "due": _iso(self.due),
            "repeat": {"every": self.repeat_every, "unit": self.repeat_unit.value}
            if self.repeats and self.repeat_unit
            else None,
            "months": self.months,
            "status": self.status.value,
            "source": self.source,
            "created_at": _iso(self.created_at),
            "done_at": _iso(self.done_at),
        }


@dataclass(slots=True, kw_only=True)
class Problem:
    id: str
    plant_id: str
    title: str
    status: ProblemStatus = ProblemStatus.OPEN
    observed_on: date
    created_at: datetime
    resolved_at: datetime | None = None
    photo_ids: list[str] = field(default_factory=list)
    diagnosis: dict[str, Any] | None = None

    @property
    def active(self) -> bool:
        return self.status is not ProblemStatus.RESOLVED

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "plant_id": self.plant_id,
            "title": self.title,
            "status": self.status.value,
            "observed_on": _iso(self.observed_on),
            "created_at": _iso(self.created_at),
            "resolved_at": _iso(self.resolved_at),
            "photo_ids": self.photo_ids,
            "diagnosis": self.diagnosis,
        }


@dataclass(slots=True, kw_only=True)
class LogEntry:
    """One line of a problem's log: what was done, seen or decided."""

    id: str
    problem_id: str
    ts: datetime
    kind: str  # note | action | status | diagnosis | photo
    text: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {"id": self.id, "ts": _iso(self.ts), "kind": self.kind, "text": self.text}


@dataclass(slots=True, kw_only=True)
class Question:
    """A question of the assistant to the user, e.g. about a missing soil type."""

    id: str
    plant_id: str | None
    field: str | None
    question: str
    answer: str | None = None
    status: QuestionStatus = QuestionStatus.OPEN
    created_at: datetime
    answered_at: datetime | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "plant_id": self.plant_id,
            "field": self.field,
            "question": self.question,
            "answer": self.answer,
            "status": self.status.value,
            "created_at": _iso(self.created_at),
            "answered_at": _iso(self.answered_at),
        }


@dataclass(slots=True, kw_only=True)
class ChatMessage:
    id: str
    plant_id: str | None
    role: str  # user | assistant
    text: str
    ts: datetime
    model: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "plant_id": self.plant_id,
            "role": self.role,
            "text": self.text,
            "ts": _iso(self.ts),
            "model": self.model,
        }


# ---------------------------------------------------------------- SQLite (blocking)
def _task(row: sqlite3.Row) -> Task:
    return Task(
        id=row["id"],
        kind=TaskKind(row["kind"]),
        title=row["title"],
        notes=row["notes"],
        plant_id=row["plant_id"],
        problem_id=row["problem_id"],
        due=_date(row["due"]),
        repeat_every=row["repeat_every"],
        repeat_unit=RepeatUnit(row["repeat_unit"]) if row["repeat_unit"] else None,
        months=json.loads(row["months"]),
        status=TaskStatus(row["status"]),
        source=row["source"],
        created_at=datetime.fromisoformat(row["created_at"]),
        done_at=_datetime(row["done_at"]),
        due_notified=_date(row["due_notified"]),
    )


def _problem(row: sqlite3.Row) -> Problem:
    return Problem(
        id=row["id"],
        plant_id=row["plant_id"],
        title=row["title"],
        status=ProblemStatus(row["status"]),
        observed_on=date.fromisoformat(row["observed_on"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        resolved_at=_datetime(row["resolved_at"]),
        photo_ids=json.loads(row["photo_ids"]),
        diagnosis=json.loads(row["diagnosis"]) if row["diagnosis"] else None,
    )


def _question(row: sqlite3.Row) -> Question:
    return Question(
        id=row["id"],
        plant_id=row["plant_id"],
        field=row["field"],
        question=row["question"],
        answer=row["answer"],
        status=QuestionStatus(row["status"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        answered_at=_datetime(row["answered_at"]),
    )


class CareTables:
    """The assistant's tables; every method blocks and runs in the executor."""

    def __init__(self, db: GardenDatabase) -> None:
        self._db = db

    # tasks
    def save_task(self, task: Task) -> None:
        with self._db.cursor() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO tasks (id, kind, title, notes, plant_id, problem_id, due,"
                " repeat_every, repeat_unit, months, status, source, created_at, done_at,"
                " due_notified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    task.id,
                    task.kind.value,
                    task.title,
                    task.notes,
                    task.plant_id,
                    task.problem_id,
                    _iso(task.due),
                    task.repeat_every,
                    task.repeat_unit.value if task.repeat_unit else None,
                    json.dumps(task.months),
                    task.status.value,
                    task.source,
                    _iso(task.created_at),
                    _iso(task.done_at),
                    _iso(task.due_notified),
                ),
            )

    def get_task(self, task_id: str) -> Task | None:
        with self._db.cursor() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task(row) if row else None

    def delete_task(self, task_id: str) -> None:
        with self._db.cursor() as conn:
            conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))

    def tasks(self, *, done_since: datetime, plant_id: str | None = None) -> list[Task]:
        """Open tasks and those completed since `done_since`, by due date (none last)."""
        query = "SELECT * FROM tasks WHERE (status = 'open' OR done_at >= ?)"
        args: list[Any] = [done_since.isoformat()]
        if plant_id is not None:
            query += " AND plant_id = ?"
            args.append(plant_id)
        query += " ORDER BY status = 'done', due IS NULL, due, created_at"
        with self._db.cursor() as conn:
            return [_task(row) for row in conn.execute(query, args)]

    # problems
    def save_problem(self, problem: Problem) -> None:
        with self._db.cursor() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO problems (id, plant_id, title, status, observed_on,"
                " created_at, resolved_at, photo_ids, diagnosis)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    problem.id,
                    problem.plant_id,
                    problem.title,
                    problem.status.value,
                    _iso(problem.observed_on),
                    _iso(problem.created_at),
                    _iso(problem.resolved_at),
                    json.dumps(problem.photo_ids),
                    json.dumps(problem.diagnosis) if problem.diagnosis is not None else None,
                ),
            )

    def get_problem(self, problem_id: str) -> Problem | None:
        with self._db.cursor() as conn:
            row = conn.execute("SELECT * FROM problems WHERE id = ?", (problem_id,)).fetchone()
        return _problem(row) if row else None

    def problems(self, *, plant_id: str | None = None, active_only: bool = False) -> list[Problem]:
        query = "SELECT * FROM problems WHERE 1"
        args: list[Any] = []
        if plant_id is not None:
            query += " AND plant_id = ?"
            args.append(plant_id)
        if active_only:
            query += " AND status != 'resolved'"
        query += " ORDER BY status = 'resolved', created_at DESC"
        with self._db.cursor() as conn:
            return [_problem(row) for row in conn.execute(query, args)]

    def delete_problem(self, problem_id: str) -> None:
        with self._db.cursor() as conn:
            conn.execute("DELETE FROM problem_log WHERE problem_id = ?", (problem_id,))
            conn.execute("DELETE FROM problems WHERE id = ?", (problem_id,))
            conn.execute("UPDATE tasks SET problem_id = NULL WHERE problem_id = ?", (problem_id,))

    def add_log(self, entry: LogEntry) -> None:
        with self._db.cursor() as conn:
            conn.execute(
                "INSERT INTO problem_log (id, problem_id, ts, kind, text) VALUES (?, ?, ?, ?, ?)",
                (entry.id, entry.problem_id, _iso(entry.ts), entry.kind, entry.text),
            )

    def log(self, problem_id: str) -> list[LogEntry]:
        with self._db.cursor() as conn:
            rows = conn.execute(
                "SELECT * FROM problem_log WHERE problem_id = ? ORDER BY ts", (problem_id,)
            ).fetchall()
        return [
            LogEntry(
                id=row["id"],
                problem_id=row["problem_id"],
                ts=datetime.fromisoformat(row["ts"]),
                kind=row["kind"],
                text=row["text"],
            )
            for row in rows
        ]

    # questions
    def save_question(self, question: Question) -> None:
        with self._db.cursor() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO questions (id, plant_id, field, question, answer, status,"
                " created_at, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    question.id,
                    question.plant_id,
                    question.field,
                    question.question,
                    question.answer,
                    question.status.value,
                    _iso(question.created_at),
                    _iso(question.answered_at),
                ),
            )

    def get_question(self, question_id: str) -> Question | None:
        with self._db.cursor() as conn:
            row = conn.execute("SELECT * FROM questions WHERE id = ?", (question_id,)).fetchone()
        return _question(row) if row else None

    def questions(self, *, plant_id: str | None = None, open_only: bool = True) -> list[Question]:
        query = "SELECT * FROM questions WHERE 1"
        args: list[Any] = []
        if plant_id is not None:
            query += " AND plant_id = ?"
            args.append(plant_id)
        if open_only:
            query += " AND status = 'open'"
        query += " ORDER BY created_at DESC LIMIT 100"
        with self._db.cursor() as conn:
            return [_question(row) for row in conn.execute(query, args)]

    # chat
    def add_chat(self, message: ChatMessage) -> None:
        with self._db.cursor() as conn:
            conn.execute(
                "INSERT INTO chat (id, plant_id, role, text, ts, model) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    message.id,
                    message.plant_id,
                    message.role,
                    message.text,
                    _iso(message.ts),
                    message.model,
                ),
            )
            # keep the newest CHAT_KEEP messages of this conversation
            conn.execute(
                "DELETE FROM chat WHERE plant_id IS ? AND id NOT IN (SELECT id FROM chat"
                " WHERE plant_id IS ? ORDER BY ts DESC LIMIT ?)",
                (message.plant_id, message.plant_id, CHAT_KEEP),
            )

    def chat(self, plant_id: str | None, limit: int) -> list[ChatMessage]:
        with self._db.cursor() as conn:
            rows = conn.execute(
                "SELECT * FROM (SELECT * FROM chat WHERE plant_id IS ? ORDER BY ts DESC LIMIT ?)"
                " ORDER BY ts",
                (plant_id, limit),
            ).fetchall()
        return [
            ChatMessage(
                id=row["id"],
                plant_id=row["plant_id"],
                role=row["role"],
                text=row["text"],
                ts=datetime.fromisoformat(row["ts"]),
                model=row["model"],
            )
            for row in rows
        ]

    def clear_chat(self, plant_id: str | None) -> None:
        with self._db.cursor() as conn:
            conn.execute("DELETE FROM chat WHERE plant_id IS ?", (plant_id,))

    def delete_plant(self, plant_id: str) -> None:
        with self._db.cursor() as conn:
            conn.execute(
                "DELETE FROM problem_log WHERE problem_id IN"
                " (SELECT id FROM problems WHERE plant_id = ?)",
                (plant_id,),
            )
            for table in ("problems", "tasks", "questions", "chat"):
                conn.execute(f"DELETE FROM {table} WHERE plant_id = ?", (plant_id,))  # noqa: S608


# ---------------------------------------------------------------- manager
TASK_FIELDS = ("kind", "title", "notes", "plant_id", "problem_id", "due", "repeat", "months")


class CareManager:
    """Tasks, problems, questions and chat for the panel, the to-do entity and the AI."""

    def __init__(self, hass: HomeAssistant, manager: GardenManager) -> None:
        self.hass = hass
        self._manager = manager
        self._tables = CareTables(manager.db)
        self._unsubs: list[CALLBACK_TYPE] = []
        # per plant: open tasks, overdue, prune due, active problem (for sensors and the plan)
        self.stats: dict[str, dict[str, Any]] = {}
        self.garden_stats: dict[str, int] = {}

    async def _run(self, func: Any, *args: Any, **kwargs: Any) -> Any:
        return await self.hass.async_add_executor_job(partial(func, *args, **kwargs))

    async def async_setup(self) -> None:
        self._unsubs.append(self._manager.async_subscribe(self._on_garden_change))
        self._manager.photo_hooks.append(self._async_on_photo)
        self._unsubs.append(
            async_track_time_change(
                self.hass, self._async_daily, hour=DUE_CHECK_HOUR, minute=0, second=0
            )
        )
        await self.async_refresh_stats()
        await self.async_check_due()

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._async_on_photo in self._manager.photo_hooks:
            self._manager.photo_hooks.remove(self._async_on_photo)

    @callback
    def _on_garden_change(self, change: GardenChange) -> None:
        if change.kind == "plant_removed" and change.plant_id:
            # not eager: listeners after this one see "plant_removed" first
            self.hass.async_create_task(
                self._async_forget_plant(change.plant_id), eager_start=False
            )

    async def _async_forget_plant(self, plant_id: str) -> None:
        await self._run(self._tables.delete_plant, plant_id)
        await self._async_changed(None)

    async def _async_daily(self, _now: datetime) -> None:
        await self.async_check_due()
        await self._async_changed(None)  # overdue counts change with the date

    async def _async_changed(self, plant_id: str | None) -> None:
        await self.async_refresh_stats()
        self._manager.notify_care(plant_id)

    @staticmethod
    def _today() -> date:
        return dt_util.now().date()

    def _check_plant(self, plant_id: str | None) -> None:
        if plant_id is not None:
            self._manager.get_plant(plant_id)

    # ------------------------------------------------------------ summary
    async def async_refresh_stats(self) -> None:
        today = self._today()
        tasks = await self._run(self._tables.tasks, done_since=dt_util.utcnow() + timedelta(days=1))
        problems = await self._run(self._tables.problems, active_only=True)
        questions = await self._run(self._tables.questions)
        stats: dict[str, dict[str, Any]] = {}

        def entry(plant_id: str) -> dict[str, Any]:
            return stats.setdefault(
                plant_id,
                {
                    "open_tasks": 0,
                    "overdue": 0,
                    "prune_due": False,
                    "problem": None,
                    "questions": 0,
                },
            )

        for task in tasks:
            if task.plant_id is None:
                continue
            item = entry(task.plant_id)
            item["open_tasks"] += 1
            if task.due is not None and task.due < today:
                item["overdue"] += 1
            if (
                task.kind is TaskKind.PRUNE
                and task.due is not None
                and task.due <= today + timedelta(days=PRUNE_AHEAD_DAYS)
            ):
                item["prune_due"] = True
        for problem in problems:
            item = entry(problem.plant_id)
            if item["problem"] is None:
                item["problem"] = problem.status.value
        for question in questions:
            if question.plant_id is not None:
                entry(question.plant_id)["questions"] += 1
        self.stats = stats
        self.garden_stats = {
            "open_tasks": len(tasks),
            "overdue": sum(1 for t in tasks if t.due is not None and t.due < today),
            "problems": len(problems),
            "questions": len(questions),
        }

    def summary(self) -> dict[str, Any]:
        return {"plants": self.stats, "garden": self.garden_stats}

    # ------------------------------------------------------------ tasks
    async def async_tasks(self, plant_id: str | None = None) -> list[Task]:
        since = dt_util.utcnow() - timedelta(days=DONE_KEEP_DAYS)
        result: list[Task] = await self._run(
            self._tables.tasks, done_since=since, plant_id=plant_id
        )
        return result

    async def async_get_task(self, task_id: str) -> Task:
        task: Task | None = await self._run(self._tables.get_task, task_id)
        if task is None:
            raise NotFoundError(task_id)
        return task

    def _apply_task_fields(self, task: Task, fields: dict[str, Any]) -> None:
        if "kind" in fields:
            task.kind = TaskKind(fields["kind"])
        if "title" in fields:
            title = str(fields["title"]).strip()
            if not title:
                raise ValueError("title must not be empty")
            task.title = title[:200]
        if "notes" in fields:
            task.notes = str(fields["notes"] or "").strip()[:2000]
        if "plant_id" in fields:
            self._check_plant(fields["plant_id"])
            task.plant_id = fields["plant_id"]
        if "problem_id" in fields:
            task.problem_id = fields["problem_id"]
        if "due" in fields:
            due = fields["due"]
            due = date.fromisoformat(due) if isinstance(due, str) else due
            if due != task.due:
                task.due = due
                task.due_notified = None
        if "repeat" in fields:
            repeat = fields["repeat"]
            if repeat:
                task.repeat_every = int(repeat["every"])
                task.repeat_unit = RepeatUnit(repeat["unit"])
            else:
                task.repeat_every = task.repeat_unit = None
        if "months" in fields:
            task.months = sorted({int(m) for m in fields["months"] or [] if 1 <= int(m) <= 12})

    async def async_create_task(self, fields: dict[str, Any], *, source: str = "user") -> Task:
        if not str(fields.get("title") or "").strip():
            raise ValueError("title must not be empty")
        task = Task(
            id=ulid_now(),
            kind=TaskKind(fields.get("kind") or TaskKind.OTHER),
            title="",
            source=source,
            created_at=dt_util.utcnow(),
        )
        self._apply_task_fields(task, {k: v for k, v in fields.items() if k in TASK_FIELDS})
        if task.problem_id is not None:
            problem = await self.async_get_problem(task.problem_id)
            task.plant_id = task.plant_id or problem.plant_id
        await self._run(self._tables.save_task, task)
        await self._async_changed(task.plant_id)
        await self.async_check_due()
        return task

    async def async_update_task(self, task_id: str, fields: dict[str, Any]) -> Task:
        task = await self.async_get_task(task_id)
        self._apply_task_fields(task, {k: v for k, v in fields.items() if k in TASK_FIELDS})
        await self._run(self._tables.save_task, task)
        await self._async_changed(task.plant_id)
        return task

    async def async_complete_task(self, task_id: str) -> Task | None:
        """Mark a task done; a repeating task gets its next occurrence (returned)."""
        task = await self.async_get_task(task_id)
        if task.status is TaskStatus.DONE:
            return None
        task.status = TaskStatus.DONE
        task.done_at = dt_util.utcnow()
        await self._run(self._tables.save_task, task)
        following = None
        if task.repeats and task.repeat_every and task.repeat_unit:
            following = Task(
                id=ulid_now(),
                kind=task.kind,
                title=task.title,
                notes=task.notes,
                plant_id=task.plant_id,
                problem_id=task.problem_id,
                due=next_due(self._today(), task.repeat_every, task.repeat_unit, task.months),
                repeat_every=task.repeat_every,
                repeat_unit=task.repeat_unit,
                months=task.months,
                source=task.source,
                created_at=dt_util.utcnow(),
            )
            await self._run(self._tables.save_task, following)
        if task.problem_id is not None:
            await self._async_log(task.problem_id, "action", task.title)
        await self._async_changed(task.plant_id)
        return following

    async def async_reopen_task(self, task_id: str) -> Task:
        task = await self.async_get_task(task_id)
        task.status = TaskStatus.OPEN
        task.done_at = None
        await self._run(self._tables.save_task, task)
        await self._async_changed(task.plant_id)
        return task

    async def async_delete_task(self, task_id: str) -> None:
        task = await self.async_get_task(task_id)
        await self._run(self._tables.delete_task, task_id)
        await self._async_changed(task.plant_id)

    async def async_check_due(self) -> None:
        """Fire `plant_garden_task_due` once for every open task due today or earlier."""
        today = self._today()
        for task in await self.async_tasks():
            if (
                task.status is TaskStatus.OPEN
                and task.due is not None
                and task.due <= today
                and task.due_notified != task.due
            ):
                task.due_notified = task.due
                await self._run(self._tables.save_task, task)
                self.hass.bus.async_fire(
                    EVENT_TASK_DUE,
                    {
                        "task_id": task.id,
                        "title": task.title,
                        "kind": task.kind.value,
                        "plant_id": task.plant_id,
                        "due": task.due.isoformat(),
                    },
                )

    # ------------------------------------------------------------ problems
    async def async_problems(
        self, plant_id: str | None = None, *, active_only: bool = False
    ) -> list[Problem]:
        result: list[Problem] = await self._run(
            self._tables.problems, plant_id=plant_id, active_only=active_only
        )
        return result

    async def async_get_problem(self, problem_id: str) -> Problem:
        problem: Problem | None = await self._run(self._tables.get_problem, problem_id)
        if problem is None:
            raise NotFoundError(problem_id)
        return problem

    async def async_problem_log(self, problem_id: str) -> list[LogEntry]:
        result: list[LogEntry] = await self._run(self._tables.log, problem_id)
        return result

    async def _async_log(self, problem_id: str, kind: str, text: str) -> None:
        entry = LogEntry(
            id=ulid_now(), problem_id=problem_id, ts=dt_util.utcnow(), kind=kind, text=text
        )
        await self._run(self._tables.add_log, entry)

    async def async_create_problem(
        self,
        plant_id: str,
        title: str,
        *,
        photo_ids: list[str] | None = None,
        observed_on: date | None = None,
        note: str = "",
    ) -> Problem:
        plant = self._manager.get_plant(plant_id)
        for photo_id in photo_ids or []:
            photo = await self._manager.async_get_photo(photo_id)
            if photo.plant_id != plant_id:
                raise ValueError("photo of another plant")
        problem = Problem(
            id=ulid_now(),
            plant_id=plant_id,
            title=(title.strip() or plant.name)[:200],
            observed_on=observed_on or self._today(),
            created_at=dt_util.utcnow(),
            photo_ids=list(dict.fromkeys(photo_ids or [])),
        )
        await self._run(self._tables.save_problem, problem)
        if note.strip():
            await self._async_log(problem.id, "note", note.strip()[:2000])
        self.hass.bus.async_fire(
            EVENT_PROBLEM_DETECTED,
            {"problem_id": problem.id, "plant_id": plant_id, "title": problem.title},
        )
        await self._async_changed(plant_id)
        return problem

    async def async_update_problem(self, problem_id: str, fields: dict[str, Any]) -> Problem:
        problem = await self.async_get_problem(problem_id)
        if "title" in fields and str(fields["title"]).strip():
            problem.title = str(fields["title"]).strip()[:200]
        if "status" in fields:
            status = ProblemStatus(fields["status"])
            if status is not problem.status:
                problem.status = status
                problem.resolved_at = dt_util.utcnow() if status is ProblemStatus.RESOLVED else None
                await self._async_log(problem_id, "status", status.value)
        if fields.get("observed_on"):
            problem.observed_on = date.fromisoformat(str(fields["observed_on"]))
        await self._run(self._tables.save_problem, problem)
        await self._async_changed(problem.plant_id)
        return problem

    async def async_add_log(self, problem_id: str, kind: str, text: str) -> list[LogEntry]:
        problem = await self.async_get_problem(problem_id)
        if not text.strip():
            raise ValueError("text must not be empty")
        await self._async_log(problem_id, kind, text.strip()[:2000])
        await self._async_changed(problem.plant_id)
        return await self.async_problem_log(problem_id)

    async def async_add_problem_photo(self, problem_id: str, photo_id: str) -> Problem:
        problem = await self.async_get_problem(problem_id)
        photo = await self._manager.async_get_photo(photo_id)
        if photo.plant_id != problem.plant_id:
            raise ValueError("photo of another plant")
        if photo_id not in problem.photo_ids:
            problem.photo_ids.append(photo_id)
            await self._run(self._tables.save_problem, problem)
            await self._async_log(problem_id, "photo", photo_id)
            await self._async_changed(problem.plant_id)
        return problem

    async def async_set_diagnosis(
        self, problem_id: str, diagnosis: dict[str, Any], *, summary: str
    ) -> Problem:
        """Store the newest diagnosis; a follow-up photo becomes a task."""
        problem = await self.async_get_problem(problem_id)
        problem.diagnosis = diagnosis
        await self._run(self._tables.save_problem, problem)
        await self._async_log(problem_id, "diagnosis", summary[:2000])
        days = diagnosis.get("follow_up_days")
        if isinstance(days, int) and 1 <= days <= 60:
            await self.async_create_task(
                {
                    "kind": TaskKind.PHOTO,
                    "title": diagnosis.get("follow_up_title") or problem.title,
                    "problem_id": problem_id,
                    "plant_id": problem.plant_id,
                    "due": self._today() + timedelta(days=days),
                },
                source="ai",
            )
        await self._async_changed(problem.plant_id)
        return problem

    async def async_delete_problem(self, problem_id: str) -> None:
        problem = await self.async_get_problem(problem_id)
        await self._run(self._tables.delete_problem, problem_id)
        await self._async_changed(problem.plant_id)

    async def _async_on_photo(self, photo: Photo) -> None:
        """A photo tagged "problem" opens a problem or joins the newest active one."""
        if PROBLEM_TAG not in photo.tags:
            return
        problems = await self.async_problems(photo.plant_id, active_only=True)
        if any(photo.id in p.photo_ids for p in problems):
            return
        if problems:
            await self.async_add_problem_photo(problems[0].id, photo.id)
            return
        local = dt_util.as_local(photo.taken_at).date()
        await self.async_create_problem(
            photo.plant_id,
            photo.note or "",
            photo_ids=[photo.id],
            observed_on=local,
        )

    # ------------------------------------------------------------ questions
    async def async_questions(
        self, plant_id: str | None = None, *, open_only: bool = True
    ) -> list[Question]:
        result: list[Question] = await self._run(
            self._tables.questions, plant_id=plant_id, open_only=open_only
        )
        return result

    async def async_add_questions(self, items: list[dict[str, Any]]) -> list[Question]:
        """Questions of the assistant; the same open question is not asked twice."""
        existing = {(q.plant_id, q.question.casefold()) for q in await self.async_questions()}
        added = []
        for item in items:
            text = str(item.get("question") or "").strip()[:500]
            plant_id = item.get("plant_id")
            if not text or (plant_id, text.casefold()) in existing:
                continue
            if plant_id is not None and plant_id not in {p.id for p in self._manager.plants}:
                plant_id = None
            question = Question(
                id=ulid_now(),
                plant_id=plant_id,
                field=item.get("field"),
                question=text,
                created_at=dt_util.utcnow(),
            )
            await self._run(self._tables.save_question, question)
            existing.add((plant_id, text.casefold()))
            added.append(question)
        if added:
            await self._async_changed(added[0].plant_id if len(added) == 1 else None)
        return added

    async def async_answer_question(
        self, question_id: str, *, answer: str | None, dismiss: bool = False
    ) -> Question:
        question: Question | None = await self._run(self._tables.get_question, question_id)
        if question is None:
            raise NotFoundError(question_id)
        if dismiss:
            question.status = QuestionStatus.DISMISSED
        else:
            if not (answer or "").strip():
                raise ValueError("answer must not be empty")
            question.answer = (answer or "").strip()[:2000]
            question.status = QuestionStatus.ANSWERED
        question.answered_at = dt_util.utcnow()
        await self._run(self._tables.save_question, question)
        await self._async_changed(question.plant_id)
        return question

    # ------------------------------------------------------------ chat
    async def async_chat(self, plant_id: str | None, limit: int = 50) -> list[ChatMessage]:
        self._check_plant(plant_id)
        result: list[ChatMessage] = await self._run(self._tables.chat, plant_id, limit)
        return result

    async def async_add_chat(
        self, plant_id: str | None, role: str, text: str, model: str | None = None
    ) -> ChatMessage:
        message = ChatMessage(
            id=ulid_now(),
            plant_id=plant_id,
            role=role,
            text=text,
            ts=dt_util.utcnow(),
            model=model,
        )
        await self._run(self._tables.add_chat, message)
        return message

    async def async_clear_chat(self, plant_id: str | None) -> None:
        self._check_plant(plant_id)
        await self._run(self._tables.clear_chat, plant_id)
        self._manager.notify_care(plant_id)
