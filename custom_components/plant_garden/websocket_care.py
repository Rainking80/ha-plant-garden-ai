"""WebSocket API of the assistant: tasks, problems, questions, tips and chat (spec 4.7)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
import functools
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
import probatio

from .ai.assistant import Assistant
from .ai.base import AIError, BudgetExceededError
from .care import CareManager, ProblemStatus, RepeatUnit, TaskKind
from .const import DOMAIN
from .garden import NotFoundError
from .runtime import get_assistant, get_care
from .websocket_ai import ERR_AI, ERR_BUDGET

ERR_NOT_LOADED = "not_loaded"

type CareHandler = Callable[
    [HomeAssistant, websocket_api.ActiveConnection, dict[str, Any], CareManager, Assistant],
    Awaitable[Any],
]


def care_command(
    schema: dict[Any, Any],
) -> Callable[[CareHandler], websocket_api.const.WebSocketCommandHandler]:
    """Like `garden_command`, with the care manager and the assistant; AI errors are readable."""

    def decorator(func: CareHandler) -> websocket_api.const.WebSocketCommandHandler:
        @websocket_api.websocket_command(schema)
        @websocket_api.async_response
        @functools.wraps(func)
        async def handler(
            hass: HomeAssistant,
            connection: websocket_api.ActiveConnection,
            msg: dict[str, Any],
        ) -> None:
            care, assistant = get_care(hass), get_assistant(hass)
            if care is None or assistant is None:
                connection.send_error(msg["id"], ERR_NOT_LOADED, "Plant Garden is not set up")
                return
            try:
                result = await func(hass, connection, msg, care, assistant)
            except NotFoundError as err:
                connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, f"Not found: {err}")
            except BudgetExceededError as err:
                connection.send_error(msg["id"], ERR_BUDGET, str(err))
            except AIError as err:
                connection.send_error(msg["id"], ERR_AI, str(err))
            except ValueError as err:
                connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
            else:
                connection.send_result(msg["id"], result)

        return handler

    return decorator


def _type(name: str) -> dict[Any, Any]:
    return {probatio.Required("type"): f"{DOMAIN}/{name}"}


def _fields(msg: dict[str, Any], *exclude: str) -> dict[str, Any]:
    return {k: v for k, v in msg.items() if k not in ("id", "type", *exclude)}


TEXT = probatio.All(str, probatio.Length(max=2000))
REPEAT = probatio.Any(
    None,
    {
        probatio.Required("every"): probatio.All(int, probatio.Range(min=1, max=365)),
        probatio.Required("unit"): probatio.In([u.value for u in RepeatUnit]),
    },
)
TASK_FIELDS = {
    probatio.Optional("kind"): probatio.In([k.value for k in TaskKind]),
    probatio.Optional("title"): probatio.All(str, probatio.Length(min=1, max=200)),
    probatio.Optional("notes"): TEXT,
    probatio.Optional("plant_id"): probatio.Any(None, str),
    probatio.Optional("problem_id"): probatio.Any(None, str),
    probatio.Optional("due"): probatio.Any(None, cv.date),
    probatio.Optional("repeat"): REPEAT,
    probatio.Optional("months"): [probatio.All(int, probatio.Range(min=1, max=12))],
}


@callback
def async_register_care_commands(hass: HomeAssistant) -> None:
    for command in (
        ws_care_summary,
        ws_tasks_list,
        ws_tasks_create,
        ws_tasks_update,
        ws_tasks_complete,
        ws_tasks_reopen,
        ws_tasks_delete,
        ws_problems_list,
        ws_problems_get,
        ws_problems_create,
        ws_problems_update,
        ws_problems_log,
        ws_problems_add_photo,
        ws_problems_delete,
        ws_problems_diagnose,
        ws_questions_list,
        ws_questions_answer,
        ws_tips_get,
        ws_tips_create,
        ws_tips_decide,
        ws_compare_get,
        ws_compare_run,
        ws_chat_history,
        ws_chat_clear,
        ws_chat,
    ):
        websocket_api.async_register_command(hass, command)


@care_command(_type("care/summary"))
async def ws_care_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Per plant: open and overdue tasks, pruning due, active problem, open questions."""
    return care.summary()


# ---------------------------------------------------------------- tasks
@care_command({**_type("tasks/list"), probatio.Optional("plant_id"): str})
async def ws_tasks_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Open tasks and those done in the last 30 days."""
    return {"tasks": [t.as_dict() for t in await care.async_tasks(msg.get("plant_id"))]}


@care_command(
    {
        **_type("tasks/create"),
        **TASK_FIELDS,
        probatio.Required("title"): probatio.All(str, probatio.Length(min=1, max=200)),
    }
)
async def ws_tasks_create(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    return (await care.async_create_task(_fields(msg))).as_dict()


@care_command({**_type("tasks/update"), probatio.Required("task_id"): str, **TASK_FIELDS})
async def ws_tasks_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    return (await care.async_update_task(msg["task_id"], _fields(msg, "task_id"))).as_dict()


@care_command({**_type("tasks/complete"), probatio.Required("task_id"): str})
async def ws_tasks_complete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Done; a repeating task answers with its next occurrence."""
    following = await care.async_complete_task(msg["task_id"])
    return {"next": following.as_dict() if following else None}


@care_command({**_type("tasks/reopen"), probatio.Required("task_id"): str})
async def ws_tasks_reopen(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    return (await care.async_reopen_task(msg["task_id"])).as_dict()


@care_command({**_type("tasks/delete"), probatio.Required("task_id"): str})
async def ws_tasks_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> None:
    await care.async_delete_task(msg["task_id"])


# ---------------------------------------------------------------- problems
async def _problem_result(care: CareManager, problem_id: str) -> dict[str, Any]:
    problem = await care.async_get_problem(problem_id)
    log = await care.async_problem_log(problem_id)
    return {"problem": problem.as_dict(), "log": [entry.as_dict() for entry in log]}


@care_command(
    {
        **_type("problems/list"),
        probatio.Optional("plant_id"): str,
        probatio.Optional("active_only", default=False): bool,
    }
)
async def ws_problems_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    problems = await care.async_problems(msg.get("plant_id"), active_only=msg["active_only"])
    return {"problems": [p.as_dict() for p in problems]}


@care_command({**_type("problems/get"), probatio.Required("problem_id"): str})
async def ws_problems_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """A problem with its log (actions, notes, status changes, diagnoses)."""
    return await _problem_result(care, msg["problem_id"])


@care_command(
    {
        **_type("problems/create"),
        probatio.Required("plant_id"): str,
        probatio.Optional("title", default=""): probatio.All(str, probatio.Length(max=200)),
        probatio.Optional("photo_ids", default=[]): [str],
        probatio.Optional("observed_on"): cv.date,
        probatio.Optional("note", default=""): TEXT,
    }
)
async def ws_problems_create(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Report a problem; fires `plant_garden_problem_detected`."""
    problem = await care.async_create_problem(
        msg["plant_id"],
        msg["title"],
        photo_ids=msg["photo_ids"],
        observed_on=msg.get("observed_on"),
        note=msg["note"],
    )
    return await _problem_result(care, problem.id)


@care_command(
    {
        **_type("problems/update"),
        probatio.Required("problem_id"): str,
        probatio.Optional("title"): probatio.All(str, probatio.Length(min=1, max=200)),
        probatio.Optional("status"): probatio.In([s.value for s in ProblemStatus]),
        probatio.Optional("observed_on"): cv.date,
    }
)
async def ws_problems_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    await care.async_update_problem(msg["problem_id"], _fields(msg, "problem_id"))
    return await _problem_result(care, msg["problem_id"])


@care_command(
    {
        **_type("problems/log"),
        probatio.Required("problem_id"): str,
        probatio.Required("kind"): probatio.In(["note", "action"]),
        probatio.Required("text"): probatio.All(str, probatio.Length(min=1, max=2000)),
    }
)
async def ws_problems_log(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Note what was done or seen."""
    await care.async_add_log(msg["problem_id"], msg["kind"], msg["text"])
    return await _problem_result(care, msg["problem_id"])


@care_command(
    {
        **_type("problems/add_photo"),
        probatio.Required("problem_id"): str,
        probatio.Required("photo_id"): str,
    }
)
async def ws_problems_add_photo(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    await care.async_add_problem_photo(msg["problem_id"], msg["photo_id"])
    return await _problem_result(care, msg["problem_id"])


@care_command({**_type("problems/delete"), probatio.Required("problem_id"): str})
async def ws_problems_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> None:
    await care.async_delete_problem(msg["problem_id"])


@care_command({**_type("problems/diagnose"), probatio.Required("problem_id"): str})
async def ws_problems_diagnose(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """AI diagnosis from the problem's photos and the garden data (costs money)."""
    await assistant.async_diagnose(msg["problem_id"])
    return await _problem_result(care, msg["problem_id"])


# ---------------------------------------------------------------- questions
@care_command(
    {
        **_type("questions/list"),
        probatio.Optional("plant_id"): str,
        probatio.Optional("open_only", default=True): bool,
    }
)
async def ws_questions_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Questions of the assistant to the user."""
    questions = await care.async_questions(msg.get("plant_id"), open_only=msg["open_only"])
    return {"questions": [q.as_dict() for q in questions]}


@care_command(
    {
        **_type("questions/answer"),
        probatio.Required("question_id"): str,
        probatio.Optional("answer"): TEXT,
        probatio.Optional("dismiss", default=False): bool,
    }
)
async def ws_questions_answer(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    question = await care.async_answer_question(
        msg["question_id"], answer=msg.get("answer"), dismiss=msg["dismiss"]
    )
    return question.as_dict()


# ---------------------------------------------------------------- tips
@care_command({**_type("assistant/tips"), probatio.Optional("plant_id"): str})
async def ws_tips_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any] | None:
    """The last tips for a plant or the garden (or null)."""
    return assistant.tips(msg.get("plant_id"))


@care_command({**_type("assistant/tips/create"), probatio.Optional("plant_id"): str})
async def ws_tips_create(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """New tips from the AI (costs money)."""
    return await assistant.async_tips(msg.get("plant_id"))


@care_command(
    {
        **_type("assistant/tips/decide"),
        probatio.Optional("plant_id"): str,
        probatio.Required("tip_id"): str,
        probatio.Required("accept"): bool,
    }
)
async def ws_tips_decide(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Take a proposed task over or dismiss it."""
    return await assistant.async_decide_tip(
        msg.get("plant_id"), msg["tip_id"], accept=msg["accept"]
    )


# ---------------------------------------------------------------- chat
@care_command({**_type("assistant/chat/history"), probatio.Optional("plant_id"): str})
async def ws_chat_history(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    messages = await care.async_chat(msg.get("plant_id"))
    return {"messages": [m.as_dict() for m in messages]}


@care_command({**_type("assistant/chat/clear"), probatio.Optional("plant_id"): str})
async def ws_chat_clear(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> None:
    await care.async_clear_chat(msg.get("plant_id"))


@websocket_api.websocket_command(
    {
        **_type("assistant/chat"),
        probatio.Optional("plant_id"): str,
        probatio.Required("text"): probatio.All(str, probatio.Length(min=1, max=4000)),
    }
)
@websocket_api.async_response
async def ws_chat(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Ask the assistant; a subscription that streams the answer.

    Events: `{"delta": text}` while the answer is written, then
    `{"done": true, "message": {...}}` or `{"error": text, "code": ...}`.
    """
    assistant = get_assistant(hass)
    if assistant is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Plant Garden is not set up")
        return
    msg_id = msg["id"]
    connection.send_result(msg_id)

    def send(payload: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg_id, payload))

    try:
        answer = await assistant.async_chat(
            msg.get("plant_id"), msg["text"], lambda text: send({"delta": text})
        )
    except NotFoundError as err:
        send({"error": f"Not found: {err}", "code": websocket_api.ERR_NOT_FOUND})
    except BudgetExceededError as err:
        send({"error": str(err), "code": ERR_BUDGET})
    except AIError as err:
        send({"error": str(err), "code": ERR_AI})
    except ValueError as err:
        send({"error": str(err), "code": websocket_api.ERR_INVALID_FORMAT})
    else:
        send({"done": True, "message": answer.as_dict()})


# ---------------------------------------------------------------- photo comparison
@care_command({**_type("assistant/comparison"), probatio.Required("plant_id"): str})
async def ws_compare_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any] | None:
    """The last comparison of a new photo of the plant with an earlier one (or null)."""
    return await assistant.async_comparison(msg["plant_id"])


@care_command({**_type("assistant/compare"), probatio.Required("photo_id"): str})
async def ws_compare_run(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    care: CareManager,
    assistant: Assistant,
) -> dict[str, Any]:
    """Compare a photo with an earlier one of its plant (costs money)."""
    return await assistant.async_compare(msg["photo_id"])
