import json
from datetime import datetime
from pathlib import Path

from sensors.modbus_sensor import load_modbus_config, read_modbus_metrics


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "modbus_config.json"


def main():
    try:
        config = load_modbus_config(CONFIG_PATH)
        metrics, errors = read_modbus_metrics(CONFIG_PATH)
        registers = config.get("registers", [])

        print(json.dumps({
            "ok": True,
            "time": datetime.now().isoformat(timespec="seconds"),
            "config_path": str(CONFIG_PATH),
            "mode": config.get("mode"),
            "metrics": metrics,
            "errors": errors,
            "registers": registers,
        }, ensure_ascii=False, indent=2))

    except Exception as error:
        print(json.dumps({
            "ok": False,
            "time": datetime.now().isoformat(timespec="seconds"),
            "config_path": str(CONFIG_PATH),
            "error": str(error),
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
