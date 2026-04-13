# Mock Interview V1 Contracts

## Auth Model
- Access token: JWT signed with `JWT_SECRET`, includes `sub`, `email`, `role`, `exp`.
- Refresh token: opaque UUID stored server-side in Redis with TTL.
- Roles:
  - `user`: can manage own profile, interviews, schedules, and analytics.
  - `admin`: has all user permissions and access to platform analytics endpoints.

## Interview Lifecycle States
- `draft`: interview is created, not started.
- `scheduled`: interview has `scheduled_at` in the future.
- `in_progress`: active chat session.
- `completed`: interview finished with final report.
- `cancelled`: cancelled before completion.

Allowed transitions:
- `draft -> scheduled`
- `draft -> in_progress`
- `scheduled -> in_progress`
- `scheduled -> cancelled`
- `in_progress -> completed`
- `draft -> cancelled`

## REST API (`chat-service`)
Base path: `/api/v1`

### Auth
- `POST /auth/signup`
  - request: `{ "email": "x@y.com", "password": "...", "role": "user|admin" }`
  - response: `{ "id": "...", "email": "...", "role": "user" }`
- `POST /auth/login`
  - request: `{ "email": "...", "password": "..." }`
  - response: `{ "access_token": "...", "refresh_token": "...", "token_type": "bearer" }`
- `POST /auth/refresh`
  - request: `{ "refresh_token": "..." }`
  - response: `{ "access_token": "...", "token_type": "bearer" }`

### Profile
- `GET /profile/me`
- `PUT /profile/me`
  - request: `{ "years_experience": 2, "tech_stacks": ["python", "angular"], "target_role": "SDE-2", "target_company": "Any" }`

### Interviews
- `POST /interviews`
  - request: `{ "domain": "dsa|cs_fundamentals|lld|hld", "difficulty": "easy|medium|hard|expert", "scheduled_at": "optional-iso8601" }`
- `POST /interviews/{id}/start`
- `POST /interviews/{id}/messages`
  - request: `{ "content": "candidate answer..." }`
  - response includes rubric score + next question.
- `POST /interviews/{id}/end`
  - response includes final report.
- `GET /interviews/{id}/result`

### Scheduling
- `GET /schedules/upcoming`
- `PUT /schedules/{interview_id}/reschedule`
- `POST /schedules/{interview_id}/cancel`

### Analytics
- `GET /analytics/me`
- `GET /admin/analytics` (`admin` only)

## gRPC Contract (`ai-service`)
Service: `InterviewEngineService`
- `GenerateNextQuestion(GenerateNextQuestionRequest) returns (GenerateNextQuestionResponse)`
- `EvaluateAnswer(EvaluateAnswerRequest) returns (EvaluateAnswerResponse)`
- `FinalizeInterviewReport(FinalizeInterviewReportRequest) returns (FinalizeInterviewReportResponse)`

The `chat-service` is the only externally reachable service. All AI operations are proxied through gRPC.
