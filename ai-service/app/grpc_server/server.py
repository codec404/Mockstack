from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from concurrent import futures
from statistics import mean
from typing import Any

import grpc
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Gemini setup ─────────────────────────────────────────────────────────────
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)
    _model = genai.GenerativeModel(settings.gemini_model)
else:
    _model = None
    logger.warning("GEMINI_API_KEY not set — AI service running in fallback mode")

# ── Domain / difficulty labels ────────────────────────────────────────────────
DOMAIN_LABELS: dict[str, str] = {
    "dsa": "Data Structures & Algorithms",
    "cs_fundamentals": "Computer Science Fundamentals",
    "lld": "Low-Level Design & OOP",
    "hld": "High-Level System Design",
}

DIFFICULTY_LABELS: dict[str, str] = {
    "easy":   "Easy — junior engineer (0-2 years experience)",
    "medium": "Medium — mid-level engineer (2-4 years experience)",
    "hard":   "Hard — senior engineer (4-7 years experience)",
    "expert": "Expert — staff/principal engineer level",
}

# ── Interview pacing constants ────────────────────────────────────────────────

# DSA: 2 problems per 1-hour session.
# First problem gets follow-ups for the first DSA_PROBLEM_SWITCH_AFTER user turns,
# then we introduce Problem 2.
DSA_PROBLEM_SWITCH_AFTER = 4   # switch after 4 user answers (~30 min)

# Keywords that indicate the candidate is asking for a hint
_HINT_KEYWORDS = frozenset([
    "hint", "clue", "help", "stuck", "i don't know", "i dont know",
    "not sure", "how do i", "how should i", "can you guide",
    "give me a tip", "what should i", "any suggestion",
])

def _wants_hint(message: str) -> bool:
    m = message.lower()
    return any(kw in m for kw in _HINT_KEYWORDS)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict[str, Any]:
    """Robustly strip markdown fences and parse JSON from Gemini response."""
    # Remove markdown code fences
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*", "", text).strip()

    # Extract the first {...} block (handles surrounding prose)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group()

    # Attempt 1: direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Attempt 2: close any unterminated string before the last quote then re-parse
    # Handles cases where Gemini truncates mid-string
    repaired = _repair_truncated_json(text)
    return json.loads(repaired)


def _repair_truncated_json(text: str) -> str:
    """Best-effort repair of JSON truncated mid-string by closing open brackets/strings."""
    # Count open structures
    depth_curly  = 0
    depth_square = 0
    in_string    = False
    escaped      = False
    last_good    = 0

    for i, ch in enumerate(text):
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_string:
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            if not in_string:
                last_good = i
            continue
        if in_string:
            continue
        if ch == "{":
            depth_curly  += 1
        elif ch == "}":
            depth_curly  -= 1
            last_good = i
        elif ch == "[":
            depth_square += 1
        elif ch == "]":
            depth_square -= 1
            last_good = i

    tail = text
    # Close an unterminated string
    if in_string:
        tail = text[:last_good + 1] if last_good else text
        # Try to close it gracefully by chopping after last complete value
        tail = re.sub(r',\s*"[^"]*$', "", tail)  # remove dangling key with no value

    # Re-close open brackets
    tail += "]" * max(0, depth_square) + "}" * max(0, depth_curly)
    return tail


async def _gemini(prompt: str, max_tokens: int = 1024) -> str:
    """Run a Gemini call with retry on 429 (rate-limit) errors."""
    assert _model is not None

    def _call() -> str:
        resp = _model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=max_tokens,
                response_mime_type="application/json",
            ),
        )
        return resp.text

    loop = asyncio.get_event_loop()
    backoff = 5
    for attempt in range(4):          # up to 3 retries
        try:
            return await loop.run_in_executor(None, _call)
        except ResourceExhausted as e:
            # Parse retry_delay from the error if available
            delay = backoff * (2 ** attempt)
            msg = str(e)
            m = re.search(r"retry.*?(\d+)\s*s", msg, re.IGNORECASE)
            if m:
                delay = max(delay, int(m.group(1)) + 2)
            logger.warning("Gemini 429 on attempt %d — waiting %ds: %s", attempt + 1, delay, msg[:120])
            time.sleep(delay)
    # Final attempt — let it propagate
    return await loop.run_in_executor(None, _call)


# ── Core AI functions ─────────────────────────────────────────────────────────

async def generate_next_question(request: dict[str, Any]) -> dict[str, Any]:
    domain     = request.get("domain", "dsa")
    difficulty = request.get("difficulty", "medium")
    history: list[dict] = request.get("history", [])

    if _model is None:
        return _fallback_question(domain, difficulty)

    num_user_turns = sum(1 for t in history if t.get("role") == "user")
    last_user_msg  = next((t["content"] for t in reversed(history) if t.get("role") == "user"), "")

    try:
        if domain == "dsa":
            return await _dsa_question(difficulty, history, num_user_turns, last_user_msg)
        elif domain == "cs_fundamentals":
            return await _cs_fundamentals_question(difficulty, history, num_user_turns, last_user_msg)
        else:
            return await _design_question(domain, difficulty, history, num_user_turns)
    except Exception as e:
        logger.error("generate_next_question failed: %s", e)
        return _fallback_question(domain, difficulty)


# ── Domain-specific question generators ───────────────────────────────────────

def _fmt_history(history: list[dict], last_n: int = 10) -> str:
    """Format the last N turns of history as a readable string."""
    lines = []
    for turn in history[-last_n:]:
        role = "Interviewer" if turn.get("role") == "assistant" else "Candidate"
        lines.append(f"{role}: {turn['content']}")
    return "\n".join(lines)


async def _dsa_question(
    difficulty: str,
    history: list[dict],
    num_user_turns: int,
    last_user_msg: str,
) -> dict[str, Any]:
    diff_label = DIFFICULTY_LABELS[difficulty]

    # ── Hint request ──────────────────────────────────────────────────────────
    if num_user_turns > 0 and _wants_hint(last_user_msg):
        ctx = _fmt_history(history, last_n=8)
        prompt = f"""You are a senior technical interviewer conducting a DSA session.

The candidate is stuck and asking for a hint. Here is the conversation so far:
{ctx}

Provide a PROGRESSIVE hint that:
- Does NOT reveal the full solution or the algorithm name outright
- Points the candidate toward a useful observation (e.g., "Think about what changes when you move from index i to i+1" or "Which data structure gives O(1) lookup?")
- Ends with a nudge like "Try to apply that observation — what does your approach look like now?"

Keep the hint to 2-4 sentences.

Respond with ONLY this JSON:
{{"question": "hint text here"}}"""
        raw = await _gemini(prompt, max_tokens=1024)
        return {"question": _extract_json(raw)["question"]}

    # ── First question: full LeetCode-style problem ───────────────────────────
    if num_user_turns == 0:
        prompt = f"""You are a senior technical interviewer.
This is a 1-hour DSA interview. You will ask exactly 2 coding problems — one now and one roughly halfway through.

Generate Problem 1 — a COMPLETE, well-specified coding problem appropriate for a **{diff_label}** interview.

Format it exactly like a LeetCode problem with ALL of the following sections:

**Problem Title**
A concise, descriptive title.

**Description**
Clear problem statement (3-5 sentences). Define all terms. State what to return.

**Examples**
Provide 2-3 worked examples:
  Input: ...
  Output: ...
  Explanation: ... (brief)

**Constraints**
- List 3-5 concrete constraints (array size, value ranges, time limits, etc.)

**Note to candidate**
End with: "Please walk me through your high-level approach before writing any code."

Respond with ONLY this JSON (the question field should contain the full formatted problem):
{{"question": "full problem statement"}}"""
        raw = await _gemini(prompt, max_tokens=1024)
        data = _extract_json(raw)
        if not data.get("question"):
            raise ValueError("empty")
        return {"question": data["question"]}

    # ── Switch to Problem 2 at the halfway mark ───────────────────────────────
    if num_user_turns == DSA_PROBLEM_SWITCH_AFTER:
        # First problem recap (first assistant message is the problem)
        first_problem = next(
            (t["content"][:200] for t in history if t.get("role") == "assistant"), ""
        )
        prompt = f"""You are a senior technical interviewer.
The candidate has completed the first DSA problem (shown below). Now introduce Problem 2 for the second half of the interview.

First problem (summary): {first_problem}...

Generate Problem 2 — a DIFFERENT coding problem on a DIFFERENT topic/data-structure than Problem 1.
Appropriate for a **{diff_label}** interview.

Use the same full LeetCode format:
- Problem Title
- Description (3-5 sentences)
- 2-3 Examples with Input / Output / Explanation
- Constraints (3-5 bullet points)
- End with: "Same as before — please explain your approach first."

Respond with ONLY this JSON:
{{"question": "full problem 2 statement"}}"""
        raw = await _gemini(prompt, max_tokens=1024)
        data = _extract_json(raw)
        if not data.get("question"):
            raise ValueError("empty")
        return {"question": data["question"]}

    # ── Follow-up on the current problem ─────────────────────────────────────
    ctx = _fmt_history(history, last_n=10)
    is_second_problem = num_user_turns > DSA_PROBLEM_SWITCH_AFTER
    problem_label = "the second problem" if is_second_problem else "the first problem"

    prompt = f"""You are a senior technical interviewer conducting a {diff_label} DSA session.
The candidate is working through {problem_label}.

Conversation so far:
{ctx}

Ask ONE targeted follow-up question about THE SAME problem. Choose the most appropriate angle:

• If the candidate gave a brute-force / naive solution → ask them to optimize (better time or space complexity).
• If the candidate gave a correct optimal solution → ask them to state and justify the time AND space complexity.
• If the candidate discussed complexity → ask about edge cases they may have missed (empty input, duplicates, overflow, etc.).
• If the candidate handled edge cases → ask them to write the core function in code (pseudocode is fine).
• If the candidate wrote code → ask them to dry-run it on one of the examples, or probe a specific line.
• If the candidate is struggling after a good attempt → ask what specific part is confusing and nudge them.

Do NOT introduce a new problem. Stay focused on what has been discussed.
Keep the question concise (1-3 sentences).

Respond with ONLY this JSON:
{{"question": "follow-up question"}}"""

    raw = await _gemini(prompt, max_tokens=1024)
    data = _extract_json(raw)
    if not data.get("question"):
        raise ValueError("empty")
    return {"question": data["question"]}


async def _cs_fundamentals_question(
    difficulty: str,
    history: list[dict],
    num_user_turns: int,
    last_user_msg: str,
) -> dict[str, Any]:
    diff_label = DIFFICULTY_LABELS[difficulty]

    # ── Hint request ──────────────────────────────────────────────────────────
    if num_user_turns > 0 and _wants_hint(last_user_msg):
        ctx = _fmt_history(history, last_n=6)
        prompt = f"""You are a technical interviewer. The candidate needs a hint.

Conversation:
{ctx}

Give a targeted hint (2-3 sentences) that steers them toward the answer without giving it away.
Respond with ONLY: {{"question": "hint"}}"""
        raw = await _gemini(prompt, max_tokens=1024)
        return {"question": _extract_json(raw)["question"]}

    ctx = _fmt_history(history, last_n=10) if history else ""
    topics_covered = ctx  # the LLM will read this to avoid repeating topics

    if num_user_turns == 0:
        # First question — pick a topic from the full breadth
        prompt = f"""You are a senior technical interviewer conducting a {diff_label} Computer Science Fundamentals interview.

Topics you may ask about (rotate across the session — pick ONE for the opening question):
1. Operating Systems — processes vs threads, context switching, scheduling algorithms, virtual memory, page faults
2. Databases & SQL — write a SQL query for a given schema, explain indexes, transactions, ACID, isolation levels
3. Concurrency & Multithreading — race conditions, deadlocks, mutex vs semaphore, thread-safe data structures, async/await
4. Computer Networking — TCP handshake, HTTP vs HTTPS, DNS resolution, CDN, load balancing
5. Distributed Systems — CAP theorem, consistency models, leader election, message queues

Pick the most interesting topic for a {diff_label} level. Generate ONE question that:
- For conceptual topics: asks the candidate to explain AND give a concrete real-world example
- For SQL: provides a small schema (2-3 tables) and asks for a specific query
- For concurrency: presents a short scenario (e.g., two threads accessing a shared bank balance) and asks how to make it thread-safe
- Is specific, not vague ("Explain SQL" is bad; "Given this schema, write a query that..." is good)

Respond with ONLY this JSON:
{{"question": "full question with any schema / scenario embedded"}}"""
    else:
        # Follow-up — vary the topic, ask for examples if they gave a definition
        prompt = f"""You are a senior technical interviewer conducting a {diff_label} CS Fundamentals session.

Conversation so far:
{ctx}

Generate the NEXT question. Rules:
- Do NOT repeat topics already covered in the conversation above
- Rotate through: OS, SQL/Databases, Concurrency, Networking, Distributed Systems
- If the candidate just gave a textbook definition → follow up with "Can you give a real-world example?" or a scenario-based variant
- For SQL: give a schema and a problem statement, not just "write a query"
- For concurrency: give a specific scenario (producer-consumer, bank transfer, rate limiter) and ask how they'd implement thread safety
- Keep each question focused and answerable in 3-5 minutes

Respond with ONLY this JSON:
{{"question": "question text"}}"""

    raw = await _gemini(prompt, max_tokens=1024)
    data = _extract_json(raw)
    if not data.get("question"):
        raise ValueError("empty")
    return {"question": data["question"]}


async def _design_question(
    domain: str,
    difficulty: str,
    history: list[dict],
    num_user_turns: int,
) -> dict[str, Any]:
    diff_label  = DIFFICULTY_LABELS[difficulty]
    domain_label = DOMAIN_LABELS.get(domain, domain)
    ctx = _fmt_history(history, last_n=10) if history else ""

    if num_user_turns == 0:
        style = (
            "object-oriented class design (classes, interfaces, design patterns, SOLID)"
            if domain == "lld"
            else "distributed system design (components, scalability, trade-offs, data flow)"
        )
        prompt = f"""You are a senior technical interviewer conducting a {diff_label} {domain_label} interview.

Generate ONE system/design problem. Structure it as:

**Problem**
2-3 sentence description of what to design.

**Requirements**
Functional: 3-4 core features the system must support.
Non-functional: 2-3 constraints (scale, latency, consistency, etc.).

**Opening question**
Ask the candidate to start by clarifying requirements and outlining their high-level design ({style}).

Respond with ONLY this JSON:
{{"question": "full design problem"}}"""
    else:
        prompt = f"""You are a senior {domain_label} interviewer ({diff_label} level).

Conversation so far:
{ctx}

Ask ONE targeted follow-up that digs deeper into the candidate's design. Examples:
- "How would your design handle 10x traffic spike?"
- "Walk me through the database schema for the component you described."
- "Where is the single point of failure in your design and how would you eliminate it?"
- "Which design pattern are you using for X and why?"
- "How would you handle concurrent writes to the same resource?"

Pick the most relevant angle. 1-2 sentences.

Respond with ONLY this JSON:
{{"question": "follow-up question"}}"""

    raw = await _gemini(prompt, max_tokens=1024)
    data = _extract_json(raw)
    if not data.get("question"):
        raise ValueError("empty")
    return {"question": data["question"]}


async def evaluate_answer(request: dict[str, Any]) -> dict[str, Any]:
    domain = request.get("domain", "dsa")
    difficulty = request.get("difficulty", "medium")
    question = request.get("question", "")
    answer = request.get("answer", "")
    history: list[dict] = request.get("history", [])

    domain_label = DOMAIN_LABELS.get(domain, domain)
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)

    if _model is None:
        return _fallback_evaluate(answer, domain)

    history_ctx = ""
    if history:
        lines = []
        for turn in history[-6:]:
            role = "Interviewer" if turn.get("role") == "assistant" else "Candidate"
            lines.append(f"{role}: {turn.get('content', '')}")
        history_ctx = "\nConversation so far:\n" + "\n".join(lines) + "\n"

    prompt = f"""You are evaluating a {difficulty_label} interview answer on {domain_label}.
{history_ctx}
Question: {question}
Answer: {answer}

Score 0-10 (9-10=exceptional, 7-8=good, 5-6=adequate, 3-4=weak, 0-2=incorrect).
Generate a follow-up question based on the candidate's answer.

Respond with this exact JSON schema (keep each string concise, max 15 words per item):
{{"score":0,"clarity":0,"positives":["string"],"negatives":["string"],"weak_topics":["string"],"improvement_points":["string"],"next_question":"string"}}"""

    try:
        raw = await _gemini(prompt, max_tokens=1024)
        data = _extract_json(raw)
        # Normalise and clamp numeric fields
        data["score"]   = max(0, min(10, int(data.get("score", 5))))
        data["clarity"] = max(0, min(10, int(data.get("clarity", 5))))
        # Ensure lists
        for key in ("positives", "negatives", "weak_topics", "improvement_points"):
            if not isinstance(data.get(key), list):
                data[key] = [str(data.get(key, ""))] if data.get(key) else []
        if not data.get("next_question"):
            data["next_question"] = "Can you elaborate further on your approach?"
        return data
    except Exception as e:
        logger.error("evaluate_answer failed: %s", e)
        return _fallback_evaluate(answer, domain)


async def finalize_report(request: dict[str, Any]) -> dict[str, Any]:
    """
    Batch evaluation: receives the full Q&A transcript and evaluates all answers at once.
    Returns per-answer scores (qa_evaluations) plus an overall report.
    """
    domain     = request.get("domain", "dsa")
    difficulty = request.get("difficulty", "medium")
    history: list[dict] = request.get("history", [])

    domain_label     = DOMAIN_LABELS.get(domain, domain)
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)

    # Extract ordered Q&A pairs from the transcript
    qa_pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(history):
        turn = history[i]
        if turn.get("role") == "assistant":
            question = turn.get("content", "")
            # Look for the next user reply
            if i + 1 < len(history) and history[i + 1].get("role") == "user":
                answer = history[i + 1].get("content", "")
                if question and answer:
                    qa_pairs.append((question, answer))
                i += 2
            else:
                i += 1
        else:
            i += 1

    if _model is None:
        return _fallback_report_batch(qa_pairs, domain, difficulty)

    # Build numbered Q&A list for the prompt
    qa_text = ""
    for idx, (q, a) in enumerate(qa_pairs, 1):
        # Truncate problem statements that are very long (DSA problems can be 400+ chars)
        q_display = q[:500] + ("…" if len(q) > 500 else "")
        a_display = a[:600] + ("…" if len(a) > 600 else "")
        qa_text += f"\n--- Exchange {idx} ---\nQ: {q_display}\nA: {a_display}\n"

    n = len(qa_pairs)
    domain_note = (
        "Note: This was a DSA session structured around 2 coding problems with follow-ups per problem. "
        "The initial question in each problem block is a full problem statement; subsequent questions "
        "are follow-ups (complexity, optimization, edge cases, code). Evaluate answers in context."
        if domain == "dsa" else ""
    )

    prompt = f"""You are a senior technical interviewer evaluating a completed {difficulty_label} interview on {domain_label}.
{domain_note}

Below are all {n} question-answer exchanges from the session:
{qa_text}

Your task:
1. For each exchange, score the candidate's answer:
   - score (0-10): technical correctness and depth
   - clarity (0-10): how clearly they communicated

   Scoring guide: 9-10=exceptional, 7-8=good, 5-6=adequate, 3-4=weak, 0-2=no answer/incorrect.
   For hint exchanges, score based on whether the candidate applied the hint productively.

2. Produce an overall performance report with concrete, actionable feedback.

Respond with this EXACT JSON schema (no extra text).
ALL numeric scores are on a 0-10 scale (not 0-100).

{{
  "qa_evaluations": [
    {{"question_num": 1, "score": 0, "clarity": 0}},
    {{"question_num": 2, "score": 0, "clarity": 0}}
  ],
  "average_score": 0.0,
  "clarity_score": 0.0,
  "summary": "2 sentence summary of overall performance, be specific",
  "strengths": ["specific strength 1", "specific strength 2"],
  "weaknesses": ["specific weakness 1", "specific weakness 2"],
  "weak_topics": ["topic 1", "topic 2"],
  "improvement_points": ["actionable advice 1", "actionable advice 2", "actionable advice 3"]
}}"""

    try:
        raw = await _gemini(prompt)
        data = _extract_json(raw)

        # Normalise qa_evaluations — clamp each individual score to 0-10
        qa_evals: list[dict] = data.get("qa_evaluations", [])
        for ev in qa_evals:
            ev["score"]   = max(0, min(10, int(ev.get("score",   5))))
            ev["clarity"] = max(0, min(10, int(ev.get("clarity", 5))))

        scores    = [ev["score"]   for ev in qa_evals]
        clarities = [ev["clarity"] for ev in qa_evals]

        if scores:
            # Authoritative: compute from the clamped per-answer scores
            avg_score   = round(mean(scores),    1)
            avg_clarity = round(mean(clarities), 1)
        else:
            # Gemini didn't return qa_evaluations — use its overall field but
            # clamp to 0-10. Gemini sometimes returns 0-100 range here.
            raw_avg  = float(data.get("average_score", 5.0))
            raw_clar = float(data.get("clarity_score",  5.0))
            # If value is > 10 it's on a 0-100 scale → divide by 10
            avg_score   = round(min(10.0, raw_avg  / 10 if raw_avg  > 10 else raw_avg),  1)
            avg_clarity = round(min(10.0, raw_clar / 10 if raw_clar > 10 else raw_clar), 1)

        data["average_score"]  = avg_score
        data["clarity_score"]  = avg_clarity
        data["qa_evaluations"] = qa_evals

        for key in ("strengths", "weaknesses", "weak_topics", "improvement_points"):
            if not isinstance(data.get(key), list):
                data[key] = [str(data.get(key, ""))] if data.get(key) else []
        if not data.get("summary"):
            data["summary"] = f"Average score {avg_score}/10. Focus on depth and clarity."
        return data
    except Exception as e:
        logger.error("finalize_report failed: %s", e)
        return _fallback_report_batch(qa_pairs, domain, difficulty)


# ── Fallbacks (used when API key is missing or Gemini call fails) ─────────────

def _fallback_question(domain: str, difficulty: str) -> dict[str, Any]:
    templates = {
        "dsa":             "Explain how a hash map handles collisions and what time complexity implications arise.",
        "cs_fundamentals": "What is the difference between a process and a thread? When would you choose one over the other?",
        "lld":             "Design a parking lot system. Walk me through the key classes, relationships, and edge cases.",
        "hld":             "Design a URL shortener like bit.ly. Discuss scalability, storage, and the hashing strategy.",
    }
    return {"question": templates.get(domain, f"Explain a core concept in {domain} with a practical example.")}


def _fallback_evaluate(answer: str, domain: str) -> dict[str, Any]:
    word_count = len(answer.split())
    score   = max(3, min(8, 3 + word_count // 5))
    clarity = max(3, min(8, 4 + word_count // 8))
    return {
        "score": score,
        "clarity": clarity,
        "positives": ["Attempted the question"],
        "negatives": ["Could not evaluate — AI service unavailable"],
        "weak_topics": [domain],
        "improvement_points": ["Re-try when AI service is configured"],
        "next_question": "Can you walk me through a related problem you have solved before?",
    }


def _fallback_report_batch(
    qa_pairs: list[tuple[str, str]],
    domain: str,
    difficulty: str,
) -> dict[str, Any]:
    """Fallback when Gemini is unavailable: basic heuristic scoring."""
    qa_evals = []
    total_score = 0
    total_clarity = 0
    for idx, (_q, a) in enumerate(qa_pairs, 1):
        wc = len(a.split())
        score   = max(3, min(8, 3 + wc // 10))
        clarity = max(3, min(8, 4 + wc // 15))
        qa_evals.append({"question_num": idx, "score": score, "clarity": clarity})
        total_score   += score
        total_clarity += clarity

    n = len(qa_pairs) or 1
    avg_score   = round(total_score   / n, 1)
    avg_clarity = round(total_clarity / n, 1)
    return {
        "qa_evaluations": qa_evals,
        "average_score": avg_score,
        "clarity_score": avg_clarity,
        "summary": f"Session completed. Average score {avg_score}/10 (heuristic — AI service unavailable).",
        "strengths": ["Completed the interview session"],
        "weaknesses": ["Detailed evaluation unavailable — configure GEMINI_API_KEY"],
        "weak_topics": [domain],
        "improvement_points": ["Configure AI service for detailed feedback"],
    }


# ── gRPC server ───────────────────────────────────────────────────────────────

def _decode(raw: bytes) -> dict[str, Any]:
    return json.loads(raw.decode("utf-8"))


def _encode(data: dict[str, Any]) -> bytes:
    return json.dumps(data).encode("utf-8")


class InterviewEngineGenericHandler(grpc.GenericRpcHandler):
    def service(self, handler_call_details: grpc.HandlerCallDetails):
        method = handler_call_details.method

        if method == "/interviewengine.InterviewEngineService/GenerateNextQuestion":
            return grpc.unary_unary_rpc_method_handler(
                lambda req, _: asyncio.run(generate_next_question(_decode(req))),
                request_deserializer=lambda b: b,
                response_serializer=lambda d: _encode(d),
            )
        if method == "/interviewengine.InterviewEngineService/EvaluateAnswer":
            return grpc.unary_unary_rpc_method_handler(
                lambda req, _: asyncio.run(evaluate_answer(_decode(req))),
                request_deserializer=lambda b: b,
                response_serializer=lambda d: _encode(d),
            )
        if method == "/interviewengine.InterviewEngineService/FinalizeInterviewReport":
            return grpc.unary_unary_rpc_method_handler(
                lambda req, _: asyncio.run(finalize_report(_decode(req))),
                request_deserializer=lambda b: b,
                response_serializer=lambda d: _encode(d),
            )
        return None


def create_server() -> grpc.Server:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    server.add_generic_rpc_handlers((InterviewEngineGenericHandler(),))
    return server
