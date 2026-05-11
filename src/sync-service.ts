// Phase 6: Sync-Service – Orchestrierung des Sync-Ablaufs
// T-17: Orchestrierungs-Logik [F-05, F-06, F-07, F-08, F-09, F-48, F-49, NF-03, NF-04]

import { ImapClient } from './imap-client';
import { FileWriter } from './file-writer';
import { parseRawMail } from './mail-parser';

/**
 * Result of a sync operation.
 */
export interface SyncResult {
	imported: number;
	failed: number;   // Fehler beim Schreiben (Schreibversuch hat stattgefunden)
	skipped: number;  // Parse-Fehler (kein Schreibversuch)
	durationMs: number;
	errors: string[];
}

/**
 * Orchestrates the sync flow: connect → fetch → parse → write → markAsSeen → disconnect.
 * Handles errors per-mail so that one failure doesn't abort the entire sync.
 */
export class SyncService {
	constructor(
		private imapClient: ImapClient,
		private fileWriter: FileWriter,
		private onProgress: (msg: string) => void,
	) {}

	/**
	 * T-17.2: Executes a full sync cycle.
	 * T-17.3: Connects at the start, disconnects in finally block.
	 * T-17.5: Per mail: parse → write → markAsSeen (in this order).
	 * T-17.6: Parse errors → skipped++, mail stays unread.
	 * T-17.7: Write errors → failed++, mail stays unread.
	 * T-17.8: Returns SyncResult with all counters.
	 * T-17.9: Network abort → already imported mails remain; rest on next run.
	 */
	async sync(): Promise<SyncResult> {
		const startTime = Date.now();
		let imported = 0;
		let failed = 0;
		let skipped = 0;
		const errors: string[] = [];

		// T-17.3: Connect at the start
		this.onProgress('Verbinde…');
		await this.imapClient.connect();

		try {
			// Fetch all unseen mails
			const mails = await this.imapClient.fetchUnseenMails();
			const total = mails.length;

			// T-17.4: Progress callback
			this.onProgress(`0 / ${total} importiert`);

			// T-17.5: Process each mail: parse → write → markAsSeen
			for (const mail of mails) {
				// T-17.6: Parse errors → skipped
				let parsed;
				try {
					parsed = await parseRawMail(mail.source);
				} catch (err: unknown) {
					skipped++;
					const message = err instanceof Error ? err.message : String(err);
					errors.push(`Parse-Fehler (UID ${mail.uid}): ${message}`);
					continue; // Mail bleibt ungelesen, nächste Mail
				}

				// T-17.7: Write errors → failed
				try {
					await this.fileWriter.writeMail(parsed);
					await this.imapClient.markAsSeen(mail.uid);
					imported++;
				} catch (err: unknown) {
					failed++;
					const message = err instanceof Error ? err.message : String(err);
					errors.push(`Schreibfehler (UID ${mail.uid}): ${message}`);
					// Mail bleibt ungelesen, nächste Mail fortsetzen
					continue;
				}

				// T-17.4: Progress callback after each processed mail
				this.onProgress(`${imported} / ${total} importiert`);
			}
		} finally {
			// T-17.3: Always disconnect in finally block [F-05, NF-04]
			await this.imapClient.disconnect();
		}

		// T-17.8: Return SyncResult
		return {
			imported,
			failed,
			skipped,
			durationMs: Date.now() - startTime,
			errors,
		};
	}
}
