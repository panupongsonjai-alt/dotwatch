#pragma once

// Safe default: signed OTA is disabled until the owner generates a unique
// P-256 release key with `npm run ota:key:generate`.
#define DOTWATCH_OTA_SIGNING_KEY_CONFIGURED 0
#define DOTWATCH_OTA_SIGNING_KEY_ID "UNCONFIGURED"
#define DOTWATCH_OTA_SIGNING_PUBLIC_KEY_SHA256 "UNCONFIGURED"

static constexpr const char *DOTWATCH_OTA_SIGNING_PUBLIC_KEY_PEM = "";
