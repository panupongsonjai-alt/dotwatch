import json
import os
from pathlib import Path
from typing import Iterable, List


class OfflineQueue:
    """Small JSONL queue for Raspberry Pi offline telemetry buffering.

    Appends are O(1) (one line written in append mode). The file is only
    rewritten when items are removed or when it grows past max_items, which
    keeps SD-card writes low while the backend is unreachable.
    """

    # Allow the file to grow a little past max_items before trimming so a long
    # outage does not rewrite the whole file on every append.
    TRIM_SLACK_RATIO = 0.1

    def __init__(self, path, max_items=1000):
        self.path = Path(path)
        try:
            self.max_items = max(0, int(max_items))
        except Exception:
            self.max_items = 1000
        self._line_count = None

    def _read_items(self) -> List[dict]:
        if not self.path.exists():
            return []

        items = []
        try:
            lines = self.path.read_text(encoding="utf-8").splitlines()
        except Exception:
            return []

        for line in lines:
            raw = line.strip()
            if not raw:
                continue
            try:
                item = json.loads(raw)
            except Exception:
                continue
            if isinstance(item, dict) and isinstance(item.get("metrics"), dict):
                items.append(item)

        return items

    def load(self) -> List[dict]:
        items = self._read_items()

        if self.max_items and len(items) > self.max_items:
            items = items[-self.max_items :]
            self.write(items)
        else:
            self._line_count = len(items)

        return items

    def peek(self, limit: int) -> List[dict]:
        """Return up to `limit` oldest items without modifying the queue."""
        return self.load()[: max(0, int(limit))]

    def drop_first(self, count: int) -> int:
        """Remove the `count` oldest items. Returns the number remaining."""
        items = self.load()
        remaining = items[max(0, int(count)) :]
        self.write(remaining)
        return len(remaining)

    def write(self, items: Iterable[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        clean_items = list(items)

        if self.max_items and len(clean_items) > self.max_items:
            clean_items = clean_items[-self.max_items :]

        if not clean_items:
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass
            self._line_count = 0
            return

        temp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8") as handle:
            for item in clean_items:
                handle.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
                handle.write("\n")

        os.replace(temp_path, self.path)
        self._line_count = len(clean_items)

    def append(self, item: dict) -> int:
        self.path.parent.mkdir(parents=True, exist_ok=True)

        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")

        if self._line_count is None:
            self._line_count = len(self._read_items())
        else:
            self._line_count += 1

        trim_at = self.max_items + max(1, int(self.max_items * self.TRIM_SLACK_RATIO))
        if self.max_items and self._line_count > trim_at:
            self.write(self._read_items())

        return self.size()

    def size(self) -> int:
        if self._line_count is None:
            self._line_count = len(self._read_items())
        if self.max_items:
            return min(self._line_count, self.max_items)
        return self._line_count

    def describe(self) -> dict:
        items = self.load()
        return {
            "path": str(self.path),
            "count": len(items),
            "maxItems": self.max_items,
            "oldestTimestamp": items[0].get("timestamp") if items else None,
            "newestTimestamp": items[-1].get("timestamp") if items else None,
        }
