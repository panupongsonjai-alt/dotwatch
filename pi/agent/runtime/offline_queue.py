import json
import os
from pathlib import Path
from typing import Iterable, List, Tuple


class OfflineQueue:
    """Small JSONL queue for Raspberry Pi offline telemetry buffering."""

    def __init__(self, path, max_items=1000):
        self.path = Path(path)
        try:
            self.max_items = max(0, int(max_items))
        except Exception:
            self.max_items = 1000

    def load(self) -> List[dict]:
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

        if self.max_items and len(items) > self.max_items:
            items = items[-self.max_items :]
            self.write(items)

        return items

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
            return

        temp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8") as handle:
            for item in clean_items:
                handle.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
                handle.write("\n")

        os.replace(temp_path, self.path)

    def append(self, item: dict) -> int:
        items = self.load()
        items.append(item)
        self.write(items)
        return self.size()

    def size(self) -> int:
        return len(self.load())

    def describe(self) -> dict:
        items = self.load()
        return {
            "path": str(self.path),
            "count": len(items),
            "maxItems": self.max_items,
            "oldestTimestamp": items[0].get("timestamp") if items else None,
            "newestTimestamp": items[-1].get("timestamp") if items else None,
        }
