import pytest
from app.grpc_server.server import evaluate_answer, finalize_report, generate_next_question


@pytest.mark.asyncio
async def test_generate_question_contains_domain() -> None:
    result = await generate_next_question({"domain": "dsa", "difficulty": "easy"})
    assert "question" in result
    assert isinstance(result["question"], str)
    assert len(result["question"]) > 0


@pytest.mark.asyncio
async def test_evaluate_answer_returns_all_fields() -> None:
    result = await evaluate_answer({
        "answer": "I would use a hashmap to store counts and iterate through the array",
        "domain": "dsa",
        "difficulty": "medium",
    })
    assert "score" in result
    assert "clarity" in result
    assert "next_question" in result
    assert "positives" in result
    assert isinstance(result["score"], int)
    assert 0 <= result["score"] <= 100


@pytest.mark.asyncio
async def test_finalize_report_averages() -> None:
    result = await finalize_report({
        "scores": [60, 80],
        "clarity_scores": [70, 90],
        "weak_topics": ["graphs", "dp"],
    })
    assert result["average_score"] == 70
    assert result["clarity_score"] == 80
    assert "summary" in result
    assert "strengths" in result


@pytest.mark.asyncio
async def test_finalize_report_empty_scores_defaults() -> None:
    result = await finalize_report({"scores": [], "clarity_scores": []})
    assert result["average_score"] == 0
    assert result["clarity_score"] == 0
