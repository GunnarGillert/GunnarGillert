from datetime import datetime, timezone


class SystemClock:
    def utcnow(self) -> datetime:
        return datetime.now(timezone.utc)
