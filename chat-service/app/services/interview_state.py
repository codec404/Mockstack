from __future__ import annotations

from app.core.errors import BadRequestError
from app.db.models import InterviewStatus

ALLOWED_TRANSITIONS: dict[InterviewStatus, set[InterviewStatus]] = {
    InterviewStatus.draft: {
        InterviewStatus.scheduled,
        InterviewStatus.in_progress,
        InterviewStatus.cancelled,
    },
    InterviewStatus.scheduled: {
        InterviewStatus.in_progress,
        InterviewStatus.cancelled,
    },
    InterviewStatus.in_progress: {
        InterviewStatus.completed,
    },
    InterviewStatus.completed: set(),
    InterviewStatus.cancelled: set(),
}


def validate_transition(current: InterviewStatus, target: InterviewStatus) -> None:
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise BadRequestError(
            f"Cannot transition interview from '{current.value}' to '{target.value}'. "
            f"Allowed targets: {[s.value for s in allowed] or 'none'}."
        )
