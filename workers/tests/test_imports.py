def test_worker_modules_import() -> None:
    from app.jobs.analytics_job import process_analytics_job  # noqa: F401
    from app.jobs.reminder_job import process_reminder_job  # noqa: F401
