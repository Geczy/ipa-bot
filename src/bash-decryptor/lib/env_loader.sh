#!/bin/bash

# Load environment variables from .env file
if [ -f ".env" ]; then
  source src/bash-decryptor/lib/setenv.sh
else
  echo "❌ .env file not found."
  exit 1
fi

reload_nvm() {
  export NVM_DIR="$HOME/.nvm"
  unset PREFIX # Unset the "PREFIX" environment variable
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null 2>&1
}

check_node_version() {
  local nvmrc_path
  local node_version
  local current_version

  nvmrc_path=".nvmrc"
  node_version=$(cat "$nvmrc_path" 2>/dev/null)
  current_version=$(node -v)

  if [[ "$current_version" != "$node_version" ]]; then
    echo "❌ Node.js version mismatch. Expected: $node_version, found: $current_version"
    exit 1
  fi
}

# Create directories
mkdir -p ipa-files/encrypted ipa-files/decrypted

# Check if the required environment variables exist
if [[ -z "$SSH_USERNAME" || -z "$SSH_PASSWORD" ]]; then
  echo "❌ SSH_USERNAME or SSH_PASSWORD is not set."
  exit 1
fi

# Check if the required environment variables exist
if [[ -z "$ITUNES_PASS" || -z "$ITUNES_USER" ]]; then
  echo "❌ ITUNES_PASS or ITUNES_USER is not set."
  exit 1
fi

# Set paths
ipatool="src/bash-decryptor/bin/ipatool-2.1.3-linux-arm64"
if [[ "$OSTYPE" == "darwin"* ]]; then
  ipatool="src/bash-decryptor/bin/ipatool-2.1.3-macos-arm64"
fi
chmod +x "$ipatool"

authResponse=$("$ipatool" --keychain-passphrase "$SSH_PASSWORD" --non-interactive auth info --format json)
if [[ "$authResponse" != *"success\":true"* ]]; then
  echo "$authResponse"
  loginResponse=$("$ipatool" --keychain-passphrase "$SSH_PASSWORD" --non-interactive auth login -e "$ITUNES_USER" -p "$ITUNES_PASS" --format json)
  if [[ "$loginResponse" != *"success"* ]]; then
    echo "$loginResponse"
    echo "❌ Login to iTunes failed."
    exit 1
  fi
  exit 1
fi

reload_nvm
check_node_version
