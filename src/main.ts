// Phase 8: Plugin-Hauptdatei & UI
// T-19: main.ts fertigstellen, T-20: Mutex & Feedback

import { Notice, Plugin } from 'obsidian';
import { EmailImporterSettings, DEFAULT_SETTINGS, EmailImporterSettingTab } from './settings';
import { ImapClient } from './imap-client';
import { FileWriter } from './file-writer';
import { SyncService, SyncResult } from './sync-service';
import { SyncScheduler } from './scheduler';

export default class EmailImporterPlugin extends Plugin {
	settings: EmailImporterSettings;
	private scheduler: SyncScheduler;
	private syncService: SyncService;
	private statusBarItem: HTMLElement;
	private isSyncing = false;

	/**
	 * T-19.1: Plugin initialization.
	 * Loads settings, initializes services, registers UI elements, starts scheduler.
	 */
	async onload() {
		await this.loadSettings();

		// Initialize services
		const imapClient = new ImapClient(this.settings);
		const fileWriter = new FileWriter(this.app.vault, this.settings);
		this.syncService = new SyncService(
			imapClient,
			fileWriter,
			(msg: string) => this.updateStatusBar(msg),
		);

		// Initialize scheduler
		this.scheduler = new SyncScheduler();

		// T-19.5: Status-Bar-Item erstellen und initialisieren [NF-03]
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText('Email Importer: bereit');

		// Register settings tab
		this.addSettingTab(new EmailImporterSettingTab(this.app, this));

		// T-19.3: Ribbon-Icon mit triggerSync() verbinden [F-10]
		this.addRibbonIcon('mail', 'E-Mails synchronisieren', async () => {
			await this.triggerSync();
		});

		// T-19.4: Command registrieren [F-11]
		this.addCommand({
			id: 'email-importer:sync-now',
			name: 'E-Mails jetzt synchronisieren',
			callback: async () => {
				await this.triggerSync();
			},
		});

		// Start scheduler and register timer via this.registerInterval()
		const timerId = this.scheduler.start(
			this.settings.intervalMinutes,
			() => this.triggerSync(),
		);
		if (timerId !== null) {
			this.registerInterval(timerId);
		}
	}

	/**
	 * T-19.2: Plugin unload – stop scheduler [NF-04].
	 */
	onunload() {
		this.scheduler.stop();
	}

	/**
	 * T-20.1–T-20.5: Mutex-geschützter Sync-Aufruf mit Feedback.
	 */
	async triggerSync(): Promise<void> {
		// T-20.1: isSyncing guard – prevent parallel syncs [NF-01, F-14]
		if (this.isSyncing) {
			return;
		}

		// T-20.4: Check required settings [NF-02]
		if (!this.settings.host || !this.settings.username || !this.settings.password) {
			new Notice('Email Importer: Bitte IMAP-Einstellungen konfigurieren (Host, Benutzername, Passwort).');
			return;
		}

		// T-20.1: Set mutex
		this.isSyncing = true;

		try {
			// T-20.2: Update status bar during sync [NF-03]
			this.updateStatusBar('Synchronisiere…');

			// Execute sync
			const result: SyncResult = await this.syncService.sync();

			// T-20.3: Show Notice with result [NF-02]
			if (result.failed === 0 && result.skipped === 0) {
				new Notice(`Email Importer: ${result.imported} Mails importiert.`);
			} else {
				const parts: string[] = [];
				if (result.imported > 0) parts.push(`${result.imported} importiert`);
				if (result.failed > 0) parts.push(`${result.failed} fehlgeschlagen`);
				if (result.skipped > 0) parts.push(`${result.skipped} übersprungen`);
				new Notice(`Email Importer: ${parts.join(', ')}.`);
			}

			// T-20.5: Show last sync time in status bar
			const now = new Date();
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			this.updateStatusBar(`Letzter Sync: ${hours}:${minutes}`);
		} catch (err: unknown) {
			// Connection or other fatal error
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Email Importer: Fehler – ${message}`);
			this.updateStatusBar('Sync fehlgeschlagen');
		} finally {
			// T-20.1: Release mutex
			this.isSyncing = false;
		}
	}

	/**
	 * Updates the status bar text.
	 */
	updateStatusBar(text: string): void {
		if (this.statusBarItem) {
			this.statusBarItem.setText(`Email Importer: ${text}`);
		}
	}

	/**
	 * Tests the IMAP connection with current settings (F-39).
	 * T-20.1: Also guarded by isSyncing to prevent conflicts [F-52].
	 */
	async testConnection(): Promise<void> {
		// T-20.1: Block testConnection during sync [F-52]
		if (this.isSyncing) {
			throw new Error('Sync läuft bereits');
		}

		const client = new ImapClient(this.settings);
		await client.testConnection();
	}

	/**
	 * Restarts the scheduler with the current interval setting.
	 * Called from SettingTab when interval changes.
	 */
	restartScheduler(): void {
		const timerId = this.scheduler.restart(
			this.settings.intervalMinutes,
			() => this.triggerSync(),
		);
		if (timerId !== null) {
			this.registerInterval(timerId);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<EmailImporterSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
