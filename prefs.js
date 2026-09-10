import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function addChoiceRow(group, title, subtitle, values, current, onChanged) {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(values.map(value => value.label)),
        selected: values.findIndex(value => value.id === current),
    });
    row.connect('notify::selected', () => onChanged(values[row.selected].id));
    group.add(row);
}

export default class BlueYetiSettingsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Blue Yeti'});
        const group = new Adw.PreferencesGroup({
            title: 'Panel item',
            description: 'The Blue Yeti controls open from their own panel microphone button.',
        });
        page.add(group);

        addChoiceRow(group, 'Microphone icon', 'Choose the panel icon color.', [
            {id: 'blue', label: 'Blue'},
            {id: 'white', label: 'White'},
        ], settings.get_string('icon-color'), value =>
            settings.set_string('icon-color', value));

        addChoiceRow(group, 'Panel position', 'Choose where the Yeti button appears.', [
            {id: 'left', label: 'Left'},
            {id: 'center', label: 'Center'},
            {id: 'right', label: 'Right'},
        ], settings.get_string('panel-position'), value =>
            settings.set_string('panel-position', value));

        window.add(page);
    }
}
