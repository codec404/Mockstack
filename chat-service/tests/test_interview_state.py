import pytest
from app.core.errors import BadRequestError
from app.db.models import InterviewStatus
from app.services.interview_state import validate_transition


@pytest.mark.parametrize(
    "current,target",
    [
        (InterviewStatus.draft, InterviewStatus.scheduled),
        (InterviewStatus.draft, InterviewStatus.in_progress),
        (InterviewStatus.draft, InterviewStatus.cancelled),
        (InterviewStatus.scheduled, InterviewStatus.in_progress),
        (InterviewStatus.scheduled, InterviewStatus.cancelled),
        (InterviewStatus.in_progress, InterviewStatus.completed),
    ],
)
def test_valid_transitions(current, target) -> None:
    validate_transition(current, target)


@pytest.mark.parametrize(
    "current,target",
    [
        (InterviewStatus.completed, InterviewStatus.in_progress),
        (InterviewStatus.cancelled, InterviewStatus.in_progress),
        (InterviewStatus.in_progress, InterviewStatus.draft),
        (InterviewStatus.completed, InterviewStatus.scheduled),
    ],
)
def test_invalid_transitions_raise(current, target) -> None:
    with pytest.raises(BadRequestError):
        validate_transition(current, target)
