# Blue Yeti Settings

A local GNOME Shell extension that adds a dedicated Blue Yeti panel item. It
does not modify or share the built-in system sound/Quick Settings widget:

- Its own persistent panel/status-area button with a custom blue microphone;
  click it to open the Yeti-only menu.
- **Yeti microphone mute** mutes/unmutes the microphone capture source without
  changing direct monitoring.
- **Yeti direct monitor** toggles the microphone's zero-latency hardware
  pass-through (the same `Mic` mixer control used by `mic-fix` and
  `mic-quiet`).
- **Direct monitor volume** changes the hardware monitor level independently
  of its mute state and the microphone capture volume. ALSA card discovery
  uses `/proc/asound/cards`, so it tracks the device even if its numeric card
  assignment changes.
- **Input volume** changes only the Blue Yeti PipeWire/PulseAudio source.
- **Headphone output volume** changes only the Blue Yeti PipeWire/PulseAudio
  sink.
- **Settings** opens the extension's preferences dialog.

The extension finds the device by description, so it does not depend on a
particular ALSA card number after a reboot or reconnect.

## Install

### Requirements

- GNOME Shell 45–50 (the supported versions declared in `metadata.json`).
- A Blue Yeti or compatible C-Media USB audio device, with both its capture
  source and headphone sink visible to PipeWire/PulseAudio.
- `pactl` (normally supplied by PipeWire's PulseAudio compatibility service),
  `amixer` (ALSA utilities), `glib-compile-schemas`, `gnome-extensions`, and
  `zip`.

Confirm the audio device is visible before installing:

```bash
pactl list short sources
pactl list short sinks
cat /proc/asound/cards
```

### Install from this checkout

```bash
./install.sh
```

This packages and installs the extension for the current user, compiles its
GSettings schema, and enables it when the running GNOME Shell discovers the
new extension. If GNOME reports that it cannot enable a newly installed UUID,
log out and back in, then run:

```bash
gnome-extensions enable blueyeti-settings@owljet.com
```

No GNOME Extensions registry account or upload is required. The installer
compiles the schema and installs only for the current user. It does not make
system-wide changes. Future Shell releases should be tested and added to
`metadata.json` before being claimed as supported.

Open the extension's Settings page from GNOME Extensions to choose the blue or
white microphone and place the panel button on the left, center, or right.

## Uninstall

```bash
./uninstall.sh
```

The uninstaller also handles the brief period after a local install when
`gnome-extensions` has not yet discovered the new UUID: it removes only this
extension's local directory and enabled-list entry. It also removes the old
`blueyeti-settings@colby` identity from the initial local version.

## Configuration

The preferences window controls the icon color and panel position. The
remaining settings are available through `gsettings`.

By default, device matching accepts `Blue Yeti` or `USB Advanced Audio Device`,
which covers the common C-Media device description. The value is a
case-insensitive regular expression matched against PipeWire/PulseAudio device
names and descriptions, plus ALSA card descriptions. To inspect or change it:

```bash
gsettings get org.gnome.shell.extensions.blueyeti-settings device-match
gsettings set org.gnome.shell.extensions.blueyeti-settings device-match 'Blue Yeti'
```

The direct monitor control defaults to `Mic`. Override it only when the Yeti's
simple mixer controls use a different name:

```bash
amixer -c <card-number> scontrols
gsettings set org.gnome.shell.extensions.blueyeti-settings monitor-control 'Mic'
```

The panel refreshes every three seconds by default. Use a value from 1 through
60 seconds if a different polling interval is preferable:

```bash
gsettings set org.gnome.shell.extensions.blueyeti-settings refresh-seconds 5
```

## Troubleshooting

- **The button is missing after installation:** log out and back in, then run
  `gnome-extensions enable blueyeti-settings@owljet.com`.
- **A control has no effect:** reconnect the microphone and verify the source,
  sink, and ALSA card using the three commands in the requirements section.
  Update `device-match` if your device has a different description.
- **Direct monitor does not toggle:** list the Yeti's ALSA controls with
  `amixer -c <card-number> scontrols`, set `monitor-control` to the matching
  control name, then reopen the menu or wait for the next refresh.
- **Need diagnostic messages:** inspect the GNOME Shell user log with
  `journalctl --user -b -o cat | grep blueyeti-settings`.
