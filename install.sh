#!/usr/bin/env bash
# Install this checkout for the current user; no extensions.gnome.org account is used.
set -euo pipefail

readonly UUID='blueyeti-settings@owljet.com'
readonly LEGACY_UUID='blueyeti-settings@colby'
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/blueyeti-settings.XXXXXX")"
trap 'rm -rf -- "$build_dir"' EXIT

for command in gnome-extensions glib-compile-schemas gsettings zip; do
  command -v "$command" >/dev/null || { echo "Required command not found: $command" >&2; exit 1; }
done

# The first local version used @colby. A UUID is an extension's identity, so
# remove that exact obsolete local copy before installing the @owljet.com one.
legacy_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$LEGACY_UUID"
gnome-extensions disable "$LEGACY_UUID" 2>/dev/null || true
gnome-extensions uninstall "$LEGACY_UUID" >/dev/null 2>&1 || true
if [[ -d "$legacy_dir" ]]; then
  rm -rf -- "$legacy_dir"
fi
legacy_enabled="$(gsettings get org.gnome.shell enabled-extensions)"
legacy_updated="$(printf '%s' "$legacy_enabled" | sed \
  -e "s/'$LEGACY_UUID', //" -e "s/, '$LEGACY_UUID'//" -e "s/'$LEGACY_UUID'//")"
if [[ "$legacy_updated" != "$legacy_enabled" ]]; then
  gsettings set org.gnome.shell enabled-extensions "$legacy_updated"
fi

if gnome-extensions info "$UUID" >/dev/null 2>&1; then
  gnome-extensions disable "$UUID" || true
fi

stage_dir="$build_dir/$UUID"
mkdir "$stage_dir"
cp -a "$script_dir/extension.js" "$script_dir/metadata.json" "$script_dir/prefs.js" "$script_dir/icons" "$script_dir/schemas" "$stage_dir/"
glib-compile-schemas --strict "$stage_dir/schemas"
(
  cd "$stage_dir"
  zip -qr "$build_dir/$UUID.shell-extension.zip" .
)
gnome-extensions install --force "$build_dir/$UUID.shell-extension.zip"

# A running Shell sometimes does not discover a brand-new UUID until its next
# start. Keep it enabled in GSettings in that case, so it loads after login.
if gnome-extensions info "$UUID" >/dev/null 2>&1; then
  gnome-extensions enable "$UUID"
  echo "Installed and enabled $UUID"
else
  enabled_extensions="$(gsettings get org.gnome.shell enabled-extensions)"
  if [[ "$enabled_extensions" != *"'$UUID'"* ]]; then
    if [[ "$enabled_extensions" == '@as []' ]]; then
      gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    else
      gsettings set org.gnome.shell enabled-extensions \
        "${enabled_extensions%]} , '$UUID']"
    fi
  fi
  echo "Installed $UUID. Log out and back in to load it."
fi
