#!/bin/bash
set -e

# Set SUID permissions on the chrome-sandbox binary for Electron's sandbox
# This is required for Electron apps to run properly when installed system-wide
if [ -f "/opt/Snapback/chrome-sandbox" ]; then
    chmod 4755 /opt/Snapback/chrome-sandbox
fi
