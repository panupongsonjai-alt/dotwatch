# ESP-IDF evaluates component CMakeLists.txt in script mode while resolving
# component requirements. Avoid CONFIGURE_DEPENDS and let clean builds refresh
# the recursive source list.
file(GLOB_RECURSE DOTWATCH_SOURCES "*.cpp")

# Do not add `arduino` to REQUIRES in PlatformIO mixed-framework builds.
# PlatformIO injects its Arduino package as an extra ESP-IDF component whose
# on-disk component name is framework-arduinoespressif32, and its official
# mixed-framework examples register the project component without an explicit
# Arduino dependency. PlatformIO supplies the Arduino build context itself.
idf_component_register(
  SRCS ${DOTWATCH_SOURCES}
  INCLUDE_DIRS "." "../include"
  REQUIRES
    app_update
    bootloader_support
    esp_http_client
    esp_system
    esp_wifi
    mbedtls
    nvs_flash
)
