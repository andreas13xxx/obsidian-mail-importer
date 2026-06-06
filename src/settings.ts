import { App, PluginSettingTab, Setting } from 'obsidian';
import type EmailImporterPlugin from './main';

// T-05.1: Settings-Interface [F-31–F-38]
export interface EmailImporterSettings {
	host: string;
	port: number;
	security: 'tls' | 'starttls';
	username: string;
	password: string;
	mailbox: string;
	importFolder: string;
	intervalMinutes: number;
}

// T-05.2: Default-Werte
export const DEFAULT_SETTINGS: EmailImporterSettings = {
	host: '',
	port: 993,
	security: 'tls',
	username: '',
	password: '',
	mailbox: 'INBOX',
	importFolder: 'Emails',
	intervalMinutes: 0,
};

// T-06.1: SettingTab-Klasse
export class EmailImporterSettingTab extends PluginSettingTab {
	plugin: EmailImporterPlugin;

	constructor(app: App, plugin: EmailImporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// T-06.2: Abschnitt „IMAP-Verbindung"
		new Setting(containerEl).setName('IMAP connection').setHeading();

		new Setting(containerEl)
			.setName('Host')
			.setDesc('IMAP server address')
			.addText(text => text
				.setPlaceholder('imap.example.com')
				.setValue(this.plugin.settings.host)
				.onChange(async (value) => {
					this.plugin.settings.host = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Port')
			.setDesc('IMAP port (default: 993 for TLS, 143 for STARTTLS)')
			.addText(text => text
				.setPlaceholder('993')
				.setValue(String(this.plugin.settings.port))
				.onChange(async (value) => {
					const port = parseInt(value, 10);
					if (!isNaN(port) && port > 0 && port <= 65535) {
						this.plugin.settings.port = port;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Security')
			.setDesc('Encryption protocol')
			.addDropdown(dropdown => dropdown
				.addOption('tls', 'SSL/TLS')
				.addOption('starttls', 'STARTTLS')
				.setValue(this.plugin.settings.security)
				.onChange(async (value) => {
					this.plugin.settings.security = value as 'tls' | 'starttls';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Username')
			.setDesc('IMAP username')
			.addText(text => text
				.setPlaceholder('user@example.com')
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Password')
			.setDesc('IMAP password (stored in plaintext in data.json)')
			.addText(text => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('••••••••')
					.setValue(this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.password = value;
						await this.plugin.saveSettings();
					});
			});

		// T-06.3: „Verbindung testen"-Button mit inline Ergebnisanzeige
		const testConnectionSetting = new Setting(containerEl)
			.setName('Test connection')
			.setDesc('Verify the IMAP connection with the current settings');

		const testResultEl = containerEl.createEl('div', { cls: 'email-importer-test-result' });

		testConnectionSetting.addButton(button => button
			.setButtonText('Test connection')
			.onClick(async () => {
				testResultEl.empty();
				testResultEl.setText('Testing connection…');
				testResultEl.removeClass('email-importer-test-success', 'email-importer-test-error');
				try {
					await this.plugin.testConnection();
					testResultEl.setText('✓ Connection successful');
					testResultEl.addClass('email-importer-test-success');
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					testResultEl.setText(message);
					testResultEl.addClass('email-importer-test-error');
				}
			}));

		// T-06.4: Abschnitt „Mailbox"
		new Setting(containerEl).setName('Mailbox').setHeading();

		new Setting(containerEl)
			.setName('Folder')
			.setDesc('IMAP mailbox folder')
			.addText(text => text
				.setPlaceholder('INBOX')
				.setValue(this.plugin.settings.mailbox)
				.onChange(async (value) => {
					this.plugin.settings.mailbox = value;
					await this.plugin.saveSettings();
				}));

		// T-06.5: Abschnitt „Import"
		new Setting(containerEl).setName('Import').setHeading();

		new Setting(containerEl)
			.setName('Vault folder')
			.setDesc('Folder in your vault where emails are saved')
			.addText(text => text
				.setPlaceholder('Emails')
				.setValue(this.plugin.settings.importFolder)
				.onChange(async (value) => {
					this.plugin.settings.importFolder = value;
					await this.plugin.saveSettings();
				}));

		// T-06.7: Intervall-Änderung ruft restartScheduler() auf
		new Setting(containerEl)
			.setName('Interval')
			.setDesc('Auto-sync interval in minutes (0 = manual only)')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.plugin.settings.intervalMinutes))
				.onChange(async (value) => {
					const minutes = parseInt(value, 10);
					if (!isNaN(minutes) && minutes >= 0) {
						this.plugin.settings.intervalMinutes = minutes;
						await this.plugin.saveSettings();
						this.plugin.restartScheduler();
					}
				}));

		new Setting(containerEl)
			.setName('Sync now')
			.setDesc('Start an immediate sync')
			.addButton(button => button
				.setButtonText('Sync now')
				.onClick(async () => {
					await this.plugin.triggerSync();
				}));
	}
}
