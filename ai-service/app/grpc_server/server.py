import asyncio
import json
from concurrent import futures
from statistics import mean

import grpc


async def generate_next_question(request: dict) -> dict:
    domain = request.get("domain", "general")
    difficulty = request.get("difficulty", "medium")
    return {"question": f"[{difficulty}] Explain one core concept in {domain} with an example."}


async def evaluate_answer(request: dict) -> dict:
    answer = request.get("answer", "")
    word_count = len(answer.split())
    score = max(35, min(95, 40 + word_count * 2))
    clarity = max(30, min(95, 45 + word_count))
    next_question = "What trade-offs would you consider in a production design?"
    return {
        "score": score,
        "clarity": clarity,
        "positives": ["good attempt", "clear structure"] if word_count > 8 else ["attempted response"],
        "negatives": ["needs deeper technical detail"] if word_count < 20 else ["minor gaps in depth"],
        "weak_topics": [request.get("domain", "general")] if word_count < 15 else ["advanced optimization"],
        "improvement_points": ["add complexity analysis", "justify design decisions"],
        "next_question": next_question,
    }


async def finalize_report(request: dict) -> dict:
    scores = request.get("scores", [50])
    clarity_scores = request.get("clarity_scores", [50])
    avg_score = int(mean(scores)) if scores else 0
    avg_clarity = int(mean(clarity_scores)) if clarity_scores else 0
    strengths = ["consistent participation", "good baseline understanding"]
    weaknesses = ["insufficient depth on follow-ups"] if avg_score < 70 else ["needs polish on communication"]
    return {
        "average_score": avg_score,
        "clarity_score": avg_clarity,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "weak_topics": request.get("weak_topics", ["system design"]),
        "improvement_points": request.get("improvement_points", ["practice concise reasoning"]),
        "summary": "Solid baseline. Focus on depth and explicit trade-off communication.",
    }


def _decode(raw: bytes) -> dict:
    return json.loads(raw.decode("utf-8"))


def _encode(data: dict) -> bytes:
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
    server = grpc.server(thread_pool=futures.ThreadPoolExecutor(max_workers=10))
    server.add_generic_rpc_handlers((InterviewEngineGenericHandler(),))
    return server
