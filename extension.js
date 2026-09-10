import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UUID = 'blueyeti-settings@owljet.com';

async function run(argv) {
    const process = Gio.Subprocess.new(argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    return new Promise((resolve, reject) => {
        process.communicate_utf8_async(null, null, (subprocess, result) => {
            try {
                const [, stdout, stderr] = subprocess.communicate_utf8_finish(result);
                if (!subprocess.get_successful())
                    throw new Error(`${argv[0]} failed: ${(stderr || stdout || 'unknown error').trim()}`);
                resolve(stdout);
            } catch (error) {
                reject(error);
            }
        });
    });
}

function percent(volume) {
    const channel = volume ? Object.values(volume)[0] : null;
    return typeof channel?.value_percent === 'string'
        ? Number.parseFloat(channel.value_percent) : null;
}

function monitorPlaybackEnabled(mixerOutput) {
    const playbackLine = mixerOutput.split('\n').find(line =>
        line.includes('Playback') && /\[(on|off)\]/i.test(line));
    const playbackState = playbackLine?.split('Capture')[0].match(/\[(on|off)\]\s*$/i);
    return playbackState?.[1].toLowerCase() === 'on';
}

// PopupMenu has no labelled slider item. This small menu item keeps each
// volume control readable while using Shell's native Slider implementation.
const VolumeMenuItem = GObject.registerClass(
class VolumeMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(label, callback) {
        super._init({reactive: false, can_focus: false});
        const box = new St.BoxLayout({vertical: true, x_expand: true});
        box.add_child(new St.Label({text: label, x_expand: true}));
        this._slider = new Slider(0);
        this._slider.accessible_name = label;
        const sliderBin = new St.Bin({
            style_class: 'slider-bin',
            child: this._slider,
            reactive: true,
            can_focus: true,
            x_expand: true,
        });
        sliderBin.connect('event', (actor, event) => this._slider.event(event, false));
        box.add_child(sliderBin);
        this.add_child(box);
        this._changedId = this._slider.connect('notify::value', () =>
            callback(Math.round(this._slider.value * 100)));
    }

    setPercent(value) {
        this._slider.block_signal_handler(this._changedId);
        this._slider.value = Math.min(100, Math.max(0, value)) / 100;
        this._slider.unblock_signal_handler(this._changedId);
    }
});

const BlueYetiPanelButton = GObject.registerClass(
class BlueYetiPanelButton extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Blue Yeti Settings', false);
        this._extension = extension;
        this._icon = new St.Icon({
            gicon: extension.getPanelIcon(),
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Blue Yeti', {
            reactive: false,
            can_focus: false,
        }));
        this._inputMute = new PopupMenu.PopupSwitchMenuItem('Microphone mute', false);
        this._monitor = new PopupMenu.PopupSwitchMenuItem('Direct monitor', false);
        this.menu.addMenuItem(this._inputMute);
        this.menu.addMenuItem(this._monitor);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._inputVolume = new VolumeMenuItem('Input volume', value =>
            extension.setNodeVolume('source', value));
        this._outputVolume = new VolumeMenuItem('Headphone output volume', value =>
            extension.setNodeVolume('sink', value));
        this._monitorVolume = new VolumeMenuItem('Direct monitor volume', value =>
            extension.setMonitorVolume(value));
        this.menu.addMenuItem(this._inputVolume);
        this.menu.addMenuItem(this._outputVolume);
        this.menu.addMenuItem(this._monitorVolume);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._settingsItem = new PopupMenu.PopupMenuItem('Settings');
        this.menu.addMenuItem(this._settingsItem);

        this._inputMuteId = this._inputMute.connect('toggled', (item, muted) =>
            extension.setInputMuted(muted));
        this._monitorId = this._monitor.connect('toggled', (item, enabled) =>
            extension.setMonitor(enabled));
        this._settingsItem.connect('activate', () => extension.openPreferences());
    }

    setIcon(icon) {
        this._icon.gicon = icon;
    }

    setAvailability(input, output, card) {
        // Keep the menu structure stable while PipeWire or a USB device is
        // refreshing. Actions already safely no-op until their node/card is
        // available, and leaving the controls visible avoids an empty menu.
        this._inputMute.visible = true;
        this._inputVolume.visible = true;
        this._monitor.visible = true;
        this._outputVolume.visible = true;
        this._monitorVolume.visible = true;
    }

    setInputMuted(muted) {
        this._inputMute.block_signal_handler(this._inputMuteId);
        this._inputMute.setToggleState(muted);
        this._inputMute.unblock_signal_handler(this._inputMuteId);
    }

    setMonitorEnabled(enabled) {
        this._monitor.block_signal_handler(this._monitorId);
        this._monitor.setToggleState(enabled);
        this._monitor.unblock_signal_handler(this._monitorId);
    }

    setInputVolume(value) {
        this._inputVolume.setPercent(value);
    }

    setOutputVolume(value) {
        this._outputVolume.setPercent(value);
    }

    setMonitorVolume(value) {
        this._monitorVolume.setPercent(value);
    }
});

export default class BlueYetiSettingsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._enabled = true;
        this._busy = false;
        this._createPanelButton();
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            if (key === 'panel-position')
                this._replacePanelButton();
            else if (key === 'icon-color')
                this._indicator?.setIcon(this.getPanelIcon());
            if (key === 'refresh-seconds')
                this._scheduleRefresh();
            this._refresh();
        });
        this._refresh();
        this._scheduleRefresh();
    }

    disable() {
        this._enabled = false;
        if (this._refreshId)
            GLib.Source.remove(this._refreshId);
        this._refreshId = null;
        if (this._settingsChangedId)
            this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }

    getPanelIcon() {
        const filename = this._settings.get_string('icon-color') === 'white'
            ? 'white-yeti-microphone.svg' : 'blue-yeti-microphone.svg';
        return new Gio.FileIcon({file: this.dir.get_child('icons').get_child(filename)});
    }

    _createPanelButton() {
        this._indicator = new BlueYetiPanelButton(this);
        Main.panel.addToStatusArea(UUID, this._indicator, 0,
            this._settings.get_string('panel-position'));
    }

    _replacePanelButton() {
        this._indicator.destroy();
        this._createPanelButton();
    }

    _scheduleRefresh() {
        if (this._refreshId)
            GLib.Source.remove(this._refreshId);
        this._refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            this._settings.get_uint('refresh-seconds'), () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _pattern() {
        try {
            return new RegExp(this._settings.get_string('device-match'), 'i');
        } catch (error) {
            console.warn(`${UUID}: invalid device-match expression: ${error.message}`);
            return /Blue Yeti|USB Advanced Audio Device/i;
        }
    }

    async _findNode(kind) {
        const nodes = JSON.parse(await run(['pactl', '-f', 'json', 'list', `${kind}s`]));
        const matches = this._pattern();
        return nodes.find(node => {
            if (kind === 'source' && node.name?.endsWith('.monitor'))
                return false;
            const properties = node.properties || {};
            const text = [node.name, node.description, properties['device.description'],
                properties['device.product.name'], properties['device.nick']].filter(Boolean).join('\n');
            return matches.test(text);
        }) ?? null;
    }

    async _findAlsaCard() {
        // amixer has no portable card-listing option. /proc/asound/cards is
        // maintained by ALSA and includes both the numeric card ID required by
        // amixer -c and the human-readable USB device description.
        const cards = await run(['cat', '/proc/asound/cards']);
        const pattern = this._pattern();
        const entries = cards.split(/\n(?=\s*\d+\s+\[[^\]]+\]:)/);
        for (const entry of entries) {
            const found = entry.match(/^\s*(\d+)\s+\[[^\]]+\]:/);
            if (found && pattern.test(entry))
                return found[1];
        }
        return null;
    }

    async _refresh() {
        if (this._busy || !this._enabled)
            return;
        this._busy = true;
        try {
            const results = await Promise.allSettled([
                this._findNode('source'), this._findNode('sink'), this._findAlsaCard(),
            ]);
            if (!this._enabled)
                return;
            const [inputResult, outputResult, cardResult] = results;
            const input = inputResult.status === 'fulfilled' ? inputResult.value : null;
            const output = outputResult.status === 'fulfilled' ? outputResult.value : null;
            const card = cardResult.status === 'fulfilled' ? cardResult.value : null;
            this._inputNode = input?.name ?? null;
            this._outputNode = output?.name ?? null;
            this._alsaCard = card;
            this._indicator.setAvailability(input, output, card);
            if (input) {
                this._indicator.setInputVolume(percent(input.volume) ?? 0);
                this._indicator.setInputMuted(Boolean(input.mute));
            }
            if (output)
                this._indicator.setOutputVolume(percent(output.volume) ?? 0);
            if (card) {
                try {
                    const monitor = await run(['amixer', '-c', card, 'get',
                        this._settings.get_string('monitor-control')]);
                    if (this._enabled) {
                        this._indicator.setMonitorEnabled(monitorPlaybackEnabled(monitor));
                        const volume = monitor.match(/Playback\s+\d+\s+\[(\d+)%\]/i);
                        if (volume)
                            this._indicator.setMonitorVolume(Number.parseInt(volume[1], 10));
                    }
                } catch (error) {
                    console.warn(`${UUID}: could not read direct monitor: ${error.message}`);
                }
            }
        } catch (error) {
            console.warn(`${UUID}: refresh failed: ${error.message}`);
        } finally {
            this._busy = false;
        }
    }

    async setInputMuted(muted) {
        if (!this._enabled)
            return;
        try {
            const node = this._inputNode ?? (await this._findNode('source'))?.name;
            if (!node) {
                console.warn(`${UUID}: no matching microphone source is available`);
                return;
            }
            this._inputNode = node;
            await run(['pactl', 'set-source-mute', node, muted ? '1' : '0']);
        } catch (error) {
            console.warn(`${UUID}: could not change microphone mute: ${error.message}`);
            this._refresh();
        }
    }

    async setMonitor(enabled) {
        if (!this._enabled)
            return;
        try {
            const card = this._alsaCard ?? await this._findAlsaCard();
            if (!card) {
                console.warn(`${UUID}: no matching ALSA card is available`);
                return;
            }
            this._alsaCard = card;
            await run(['amixer', '-c', card, 'set',
                this._settings.get_string('monitor-control'), 'playback',
                enabled ? 'unmute' : 'mute']);
        } catch (error) {
            console.warn(`${UUID}: could not change direct monitor: ${error.message}`);
            this._refresh();
        }
    }

    async setMonitorVolume(value) {
        if (!this._enabled)
            return;
        try {
            const card = this._alsaCard ?? await this._findAlsaCard();
            if (!card) {
                console.warn(`${UUID}: no matching ALSA card is available`);
                return;
            }
            this._alsaCard = card;
            await run(['amixer', '-c', card, 'set',
                this._settings.get_string('monitor-control'), 'playback', `${value}%`]);
        } catch (error) {
            console.warn(`${UUID}: could not change direct monitor volume: ${error.message}`);
        }
    }

    async setNodeVolume(kind, value) {
        if (!this._enabled)
            return;
        try {
            const cachedNode = kind === 'source' ? this._inputNode : this._outputNode;
            const node = cachedNode ?? (await this._findNode(kind))?.name;
            if (!node) {
                console.warn(`${UUID}: no matching ${kind} is available`);
                return;
            }
            if (kind === 'source')
                this._inputNode = node;
            else
                this._outputNode = node;
            await run(['pactl', `set-${kind}-volume`, node, `${value}%`]);
        } catch (error) {
            console.warn(`${UUID}: could not change ${kind} volume: ${error.message}`);
        }
    }
}
