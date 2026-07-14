import json
import os
import struct
from pathlib import Path


DEFAULT_CONFIG = {
    "enabled": False,
    "mode": "tcp",
    "unit_id": 1,
    "tcp": {"host": "192.168.1.22", "port": 502, "timeout": 3},
    "rtu": {"port": "/dev/ttyUSB0", "baudrate": 9600, "parity": "N", "stopbits": 1, "bytesize": 8, "timeout": 3},
    "registers": [],
}


def load_modbus_config(path):
    config_path = Path(path)

    if not config_path.exists():
        return DEFAULT_CONFIG.copy()

    data = json.loads(config_path.read_text(encoding="utf-8"))

    merged = DEFAULT_CONFIG.copy()
    merged.update(data)
    merged["tcp"] = {**DEFAULT_CONFIG["tcp"], **data.get("tcp", {})}
    merged["rtu"] = {**DEFAULT_CONFIG["rtu"], **data.get("rtu", {})}
    merged["registers"] = data.get("registers", [])

    source = str(os.getenv("SENSOR_SOURCE", "")).strip().lower().replace("-", "_")
    if source == "modbus_tcp":
        merged["mode"] = "tcp"
    elif source == "modbus_rtu":
        merged["mode"] = "rtu"

    return merged


def create_client(config):
    try:
        from pymodbus.client import ModbusSerialClient, ModbusTcpClient
    except Exception as error:
        raise RuntimeError("pymodbus is not installed. Click Install Dependencies on the Modbus page.") from error

    mode = str(config.get("mode", "tcp")).lower()

    if mode == "rtu":
        rtu = config.get("rtu", {})
        params = {
            "port": rtu.get("port", "/dev/ttyUSB0"),
            "baudrate": int(rtu.get("baudrate", 9600)),
            "bytesize": int(rtu.get("bytesize", 8)),
            "parity": str(rtu.get("parity", "N")).upper(),
            "stopbits": int(rtu.get("stopbits", 1)),
            "timeout": float(rtu.get("timeout", 3)),
        }

        try:
            return ModbusSerialClient(**params)
        except TypeError:
            return ModbusSerialClient(method="rtu", **params)

    tcp = config.get("tcp", {})
    return ModbusTcpClient(
        host=tcp.get("host", "127.0.0.1"),
        port=int(tcp.get("port", 502)),
        timeout=float(tcp.get("timeout", 3)),
    )


def call_read(method, address, count, unit_id):
    variants = [
        {"address": address, "count": count, "slave": unit_id},
        {"address": address, "count": count, "device_id": unit_id},
        {"address": address, "count": count, "unit": unit_id},
    ]

    last_error = None

    for kwargs in variants:
        try:
            response = method(**kwargs)
            if hasattr(response, "isError") and response.isError():
                raise RuntimeError(str(response))
            return response
        except TypeError as error:
            last_error = error

    if last_error:
        raise last_error

    raise RuntimeError("Unsupported pymodbus read signature")


def signed16(value):
    value = int(value) & 0xFFFF
    return value - 0x10000 if value & 0x8000 else value


def registers_to_bytes(registers, byte_order="big", word_order="big"):
    if registers is None:
        raise RuntimeError("No registers returned")

    words = list(registers)

    if str(word_order).lower() == "little" and len(words) > 1:
        words = list(reversed(words))

    output = bytearray()

    for word in words:
        order = "little" if str(byte_order).lower() == "little" else "big"
        output.extend(int(word).to_bytes(2, order, signed=False))

    return bytes(output)


def decode_registers(registers, data_type, item):
    if not registers:
        raise RuntimeError("No register data returned")

    byte_order = item.get("byte_order", "big")
    word_order = item.get("word_order", "big")

    if data_type == "uint16":
        value = int(registers[0]) & 0xFFFF
    elif data_type == "int16":
        value = signed16(registers[0])
    elif data_type == "uint32":
        value = struct.unpack(">I", registers_to_bytes(registers[:2], byte_order, word_order))[0]
    elif data_type == "int32":
        value = struct.unpack(">i", registers_to_bytes(registers[:2], byte_order, word_order))[0]
    elif data_type == "float32":
        value = struct.unpack(">f", registers_to_bytes(registers[:2], byte_order, word_order))[0]
    elif data_type == "raw":
        value = int(registers[0])
    else:
        raise RuntimeError(f"Unsupported data_type: {data_type}")

    scale = float(item.get("scale", 1))
    offset = float(item.get("offset", 0))
    value = (float(value) * scale) + offset

    if item.get("round") not in (None, ""):
        value = round(value, int(item.get("round", 2)))

    return value


def read_one(client, item, default_unit_id):
    function = str(item.get("function", "holding")).lower()
    address = int(item.get("address", 0))
    data_type = str(item.get("data_type", "uint16")).lower()
    unit_id = int(item.get("unit_id") or default_unit_id or 1)
    count = int(item.get("count", 2 if data_type in ("float32", "int32", "uint32") else 1))

    if function in ("holding", "holding_registers", "hr", "fc3"):
        response = call_read(client.read_holding_registers, address, count, unit_id)
        return decode_registers(getattr(response, "registers", None), data_type, item)

    if function in ("input", "input_registers", "ir", "fc4"):
        response = call_read(client.read_input_registers, address, count, unit_id)
        return decode_registers(getattr(response, "registers", None), data_type, item)

    if function in ("coil", "coils", "fc1"):
        response = call_read(client.read_coils, address, count, unit_id)
        bits = getattr(response, "bits", None)
        if not bits:
            raise RuntimeError(f"No coil data returned at address {address}")
        return 1 if bool(bits[0]) else 0

    if function in ("discrete", "discrete_inputs", "di", "fc2"):
        response = call_read(client.read_discrete_inputs, address, count, unit_id)
        bits = getattr(response, "bits", None)
        if not bits:
            raise RuntimeError(f"No discrete input data returned at address {address}")
        return 1 if bool(bits[0]) else 0

    raise RuntimeError(f"Unsupported function: {function}")


def read_modbus_metrics(config_path):
    config = load_modbus_config(config_path)

    if not config.get("enabled", False):
        raise RuntimeError("Modbus is disabled in modbus_config.json")

    registers = config.get("registers", [])
    if not registers:
        raise RuntimeError("No Modbus registers configured")

    client = create_client(config)

    if not client.connect():
        raise RuntimeError("Cannot connect to Modbus device")

    metrics = {}
    errors = {}

    try:
        default_unit_id = int(config.get("unit_id", 1))

        for item in registers:
            if not item.get("enabled", True):
                continue

            metric_key = str(item.get("metric_key", "")).strip()
            if not metric_key:
                continue

            try:
                metrics[metric_key] = read_one(client, item, default_unit_id)
            except Exception as error:
                errors[metric_key] = str(error)

    finally:
        try:
            client.close()
        except Exception:
            pass

    if not metrics and errors:
        first_key = next(iter(errors))
        raise RuntimeError(f"{first_key}: {errors[first_key]}")

    if not metrics:
        raise RuntimeError("No values were read from Modbus")

    return metrics, errors
