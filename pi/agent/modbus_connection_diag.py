#!/usr/bin/env python3
import glob
import json
import os
import socket
import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "modbus_config.json"


def run_cmd(args, timeout=8):
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return result.returncode, (result.stdout or result.stderr or "").strip()
    except Exception as error:
        return -1, str(error)


def print_section(title):
    print("")
    print("=" * 72)
    print(title)
    print("=" * 72)


def load_config():
    if not CONFIG_PATH.exists():
        raise RuntimeError(f"Config not found: {CONFIG_PATH}")

    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def list_serial_ports():
    ports = []
    for pattern in ["/dev/ttyUSB*", "/dev/ttyACM*", "/dev/serial/by-id/*"]:
        ports.extend(glob.glob(pattern))
    return sorted(set(ports))


def check_serial_port(port):
    print_section("RTU SERIAL PORT CHECK")
    print(f"Configured serial port: {port}")

    ports = list_serial_ports()
    print("")
    print("Detected serial ports:")

    if ports:
        for item in ports:
            try:
                real = os.path.realpath(item)
                print(f"  - {item} -> {real}")
            except Exception:
                print(f"  - {item}")
    else:
        print("  No /dev/ttyUSB*, /dev/ttyACM*, or /dev/serial/by-id/* found")

    print("")
    if not Path(port).exists():
        print(f"ERROR: {port} does not exist.")
        print("Possible fixes:")
        print("  1) Plug USB-RS485 adapter into Raspberry Pi")
        print("  2) Try another USB port")
        print("  3) Run: dmesg | tail -40")
        print("  4) Change RTU Serial Port in /modbus page to detected port")
        return False

    code, out = run_cmd(["ls", "-l", port])
    print("Port permission:")
    print(out or f"ls failed: {code}")

    code, out = run_cmd(["id"])
    print("")
    print("Current user groups:")
    print(out)

    if "dialout" not in out:
        print("")
        print("WARNING: user may not be in dialout group.")
        print("Fix:")
        print("  sudo usermod -aG dialout pi")
        print("  sudo reboot")

    return True


def check_tcp(host, port, timeout):
    print_section("TCP SOCKET CHECK")
    print(f"Configured host: {host}")
    print(f"Configured port: {port}")
    print(f"Timeout: {timeout}s")

    try:
        with socket.create_connection((host, int(port)), timeout=float(timeout)):
            print("TCP socket OK: connected")
            return True
    except Exception as error:
        print(f"ERROR: TCP connect failed: {error}")
        print("")
        print("Possible fixes:")
        print("  1) Check device IP address")
        print("  2) Check port 502")
        print("  3) Ping the device from Pi")
        print("  4) Check firewall / network route")
        print("  5) Confirm device supports Modbus TCP")
        return False


def get_client(config):
    from pymodbus.client import ModbusSerialClient, ModbusTcpClient

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
        print("")
        print("RTU params:")
        print(json.dumps(params, indent=2))

        try:
            return ModbusSerialClient(**params)
        except TypeError:
            return ModbusSerialClient(method="rtu", **params)

    tcp = config.get("tcp", {})
    params = {
        "host": tcp.get("host", "127.0.0.1"),
        "port": int(tcp.get("port", 502)),
        "timeout": float(tcp.get("timeout", 3)),
    }
    print("")
    print("TCP params:")
    print(json.dumps(params, indent=2))
    return ModbusTcpClient(**params)


def call_read(method, address, count, unit_id):
    variants = [
        {"address": address, "count": count, "slave": unit_id},
        {"address": address, "count": count, "device_id": unit_id},
        {"address": address, "count": count, "unit": unit_id},
    ]

    last = None

    for kwargs in variants:
        try:
            return method(**kwargs)
        except TypeError as error:
            last = error

    if last:
        raise last

    raise RuntimeError("Unsupported pymodbus read signature")


def test_first_register(config):
    print_section("MODBUS READ TEST")

    registers = [item for item in config.get("registers", []) if item.get("enabled", True)]

    if not registers:
        print("ERROR: No enabled registers in modbus_config.json")
        return False

    item = registers[0]
    function = str(item.get("function", "holding")).lower()
    address = int(item.get("address", 0))
    data_type = str(item.get("data_type", "uint16")).lower()
    unit_id = int(item.get("unit_id") or config.get("unit_id", 1))
    count = int(item.get("count", 2 if data_type in ("float32", "int32", "uint32") else 1))

    print("First enabled register:")
    print(json.dumps(item, ensure_ascii=False, indent=2))

    client = get_client(config)

    print("")
    print("Client connect() ...")
    connected = client.connect()
    print(f"connect result: {connected}")

    if not connected:
        print("")
        print("ERROR: client.connect() failed")
        print("For RTU this usually means serial port does not exist, permission denied, or adapter issue.")
        print("For TCP this usually means IP/Port unreachable.")
        return False

    try:
        if function in ("holding", "holding_registers", "hr", "fc3"):
            response = call_read(client.read_holding_registers, address, count, unit_id)
        elif function in ("input", "input_registers", "ir", "fc4"):
            response = call_read(client.read_input_registers, address, count, unit_id)
        elif function in ("coil", "coils", "fc1"):
            response = call_read(client.read_coils, address, count, unit_id)
        elif function in ("discrete", "discrete_inputs", "di", "fc2"):
            response = call_read(client.read_discrete_inputs, address, count, unit_id)
        else:
            print(f"ERROR: unsupported function: {function}")
            return False

        print("")
        print("Read response:")
        print(response)

        if hasattr(response, "isError") and response.isError():
            print("")
            print("ERROR: Modbus device returned error response.")
            print("Check Unit ID, function code, address, and count.")
            return False

        if hasattr(response, "registers"):
            print("")
            print(f"Raw registers: {response.registers}")

        if hasattr(response, "bits"):
            print("")
            print(f"Raw bits: {response.bits}")

        print("")
        print("SUCCESS: Modbus connection and first read OK")
        return True

    except Exception as error:
        print("")
        print(f"ERROR while reading: {error}")
        print("")
        print("Likely causes:")
        print("  - Wrong Unit ID / Slave ID")
        print("  - Wrong baudrate/parity/stopbits")
        print("  - A/B wires reversed")
        print("  - Wrong function code")
        print("  - Wrong register address")
        print("  - Device not powered or RS485 wiring issue")
        return False

    finally:
        try:
            client.close()
        except Exception:
            pass


def main():
    print_section("DOTWATCH MODBUS DIAGNOSTIC")
    print(f"Base dir: {BASE_DIR}")
    print(f"Config: {CONFIG_PATH}")
    print(f"Python: {sys.executable}")

    try:
        import pymodbus
        print(f"pymodbus: {getattr(pymodbus, '__version__', 'installed')}")
    except Exception as error:
        print(f"ERROR: pymodbus not installed: {error}")
        print("Fix: click Install Modbus Dependencies on /modbus page")
        return 2

    try:
        config = load_config()
    except Exception as error:
        print(f"ERROR: {error}")
        return 2

    print("")
    print("Current modbus_config.json:")
    print(json.dumps(config, ensure_ascii=False, indent=2))

    mode = str(config.get("mode", "tcp")).lower()

    if mode == "rtu":
        rtu = config.get("rtu", {})
        port = rtu.get("port", "/dev/ttyUSB0")
        check_serial_port(port)
    else:
        tcp = config.get("tcp", {})
        check_tcp(
            tcp.get("host", "127.0.0.1"),
            tcp.get("port", 502),
            tcp.get("timeout", 3),
        )

    ok = test_first_register(config)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
