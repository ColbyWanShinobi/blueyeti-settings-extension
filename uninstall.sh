#!/usr/bin/env bash
# Remove the current user's locally installed Blue Yeti Settings extension.
set -euo pipefail

readonly UUID='blueyeti-settings@owljet.com'
readonly LEGACY_UUID='blueyeti-settings@colby'
command -v gnome-extensions >/dev/null || { echo 'Required command not found: gnome-extensions' >&2; exit 1; }

remove_uuid () {
  local uuid="$1"
  local extension_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
  local enabled_extensions updated_extensions

  gnome-extensions disable "$uuid" 2>/dev/null || true
  if gnome-extensions uninstall "$uuid" >/dev/null 2>&1; then
    echo "Uninstalled $uuid"
    return 0
  fi

  # Immediately after a local install, the running Shell can know the
  # directory while the CLI's extension manager does not yet know its UUID.
  if [[ ! -d "$extension_dir" ]]; then
    return 1
  fi

  # Remove only this UUID from enabled-extensions; leave other extensions.
  enabled_extensions="$(gsettings get org.gnome.shell enabled-extensions)"
  updated_extensions="$(printf '%s' "$enabled_extensions" | sed \
    -e "s/'$uuid', //" -e "s/, '$uuid'//" -e "s/'$uuid'//")"
  if [[ "$updated_extensions" != "$enabled_extensions" ]]; then
    gsettings set org.gnome.shell enabled-extensions "$updated_extensions"
  fi

  rm -rf -- "$extension_dir"
  echo "Uninstalled $uuid (local-directory fallback)"
  return 0
}

removed=false
remove_uuid "$UUID" && removed=true || true
# Also clean up the old identity, if it exists, after the UUID migration.
remove_uuid "$LEGACY_UUID" && removed=true || true
if [[ "$removed" != true ]]; then
  echo "Extension is not installed: $UUID" >&2
  exit 1
fi
