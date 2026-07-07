param(
  [string]$PiHost = "192.168.1.28",
  [string]$PiUser = "pi"
)

$ErrorActionPreference = "Stop"

$KeyPath = Join-Path $env:USERPROFILE ".ssh\dotwatch_pi"

ssh -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes "${PiUser}@${PiHost}" "echo '--- USB ---'; lsusb; echo ''; echo '--- Serial ports ---'; ls -l /dev/ttyUSB* /dev/ttyACM* /dev/serial/by-id/* 2>/dev/null || true; echo ''; echo '--- dmesg ---'; dmesg | tail -40"
