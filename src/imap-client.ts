import { ImapFlow } from 'imapflow';
import type { EmailImporterSettings } from './settings';

/**
 * Raw mail data fetched from the IMAP server.
 */
export interface RawMail {
	uid: number;
	source: Buffer; // vollständiger RFC 822 Inhalt
}

/**
 * Typed error for IMAP connection failures.
 * Ensures passwords are never exposed in error messages.
 */
export class ImapConnectionError extends Error {
	constructor(message: string) {
		super(sanitizeErrorMessage(message));
		this.name = 'ImapConnectionError';
	}
}

/**
 * Typed error for IMAP timeout failures.
 * Ensures passwords are never exposed in error messages.
 */
export class ImapTimeoutError extends Error {
	constructor(message: string) {
		super(sanitizeErrorMessage(message));
		this.name = 'ImapTimeoutError';
	}
}

/**
 * Removes any occurrence of the password from an error message
 * to prevent credential leakage in logs or UI notices (NF-05).
 */
function sanitizeErrorMessage(message: string, password?: string): string {
	if (!password || password.length === 0) {
		return message;
	}
	// Split and rejoin to replace all occurrences (ES5-compatible)
	return message.split(password).join('***');
}

/**
 * IMAP client wrapper around ImapFlow.
 * Handles connection lifecycle, mail fetching, and flag management.
 */
export class ImapClient {
	private client: ImapFlow | null = null;
	private settings: EmailImporterSettings;

	constructor(settings: EmailImporterSettings) {
		this.settings = settings;
	}

	/**
	 * Establishes an IMAP connection based on the configured security protocol.
	 * TLS: secure: true
	 * STARTTLS: secure: false, tls: { starttls: 'required' }
	 * Fixed 30-second timeout (F-50). Logger disabled (NF-05).
	 */
	async connect(): Promise<void> {
		const { host, port, security, username, password } = this.settings;

		const baseOptions = {
			host,
			port,
			auth: { user: username, pass: password },
			logger: false as const,
			socketTimeout: 30000,
		};

		if (security === 'tls') {
			this.client = new ImapFlow({ ...baseOptions, secure: true });
		} else {
			// STARTTLS: ImapFlow supports `tls.starttls` even though it's not in
			// the standard Node.js ConnectionOptions type definition.
			this.client = new ImapFlow({
				...baseOptions,
				secure: false,
				tls: { starttls: 'required' } as never,
			});
		}

		try {
			await this.client.connect();
		} catch (err: unknown) {
			this.client = null;
			const message = err instanceof Error ? err.message : String(err);
			const sanitized = sanitizeErrorMessage(message, password);

			if (isTimeoutError(err)) {
				throw new ImapTimeoutError(sanitized);
			}
			throw new ImapConnectionError(sanitized);
		}
	}

	/**
	 * Gracefully disconnects from the IMAP server (F-05).
	 */
	async disconnect(): Promise<void> {
		if (this.client) {
			try {
				await this.client.logout();
			} catch {
				// Best-effort: if logout fails, close the connection forcefully
				this.client.close();
			} finally {
				this.client = null;
			}
		}
	}

	/**
	 * Tests the IMAP connection: connect → NOOP → disconnect (F-39).
	 * Used by the "Verbindung testen" button in settings.
	 */
	async testConnection(): Promise<void> {
		await this.connect();
		try {
			await this.client!.noop();
		} finally {
			await this.disconnect();
		}
	}

	/**
	 * Fetches all unseen mails from the configured mailbox.
	 * Acquires a mailbox lock and releases it in a finally block (T-09.2).
	 * Does NOT connect/disconnect – lifecycle managed by SyncService.
	 */
	async fetchUnseenMails(): Promise<RawMail[]> {
		if (!this.client) {
			throw new ImapConnectionError('Nicht verbunden – bitte zuerst connect() aufrufen.');
		}

		const lock = await this.client.getMailboxLock(this.settings.mailbox);
		try {
			const uids = await this.client.search({ seen: false }, { uid: true });

			if (!uids || uids.length === 0) {
				return [];
			}

			const mails: RawMail[] = [];
			for await (const message of this.client.fetch(uids, { source: true, uid: true }, { uid: true })) {
				if (message.source) {
					mails.push({
						uid: message.uid,
						source: message.source,
					});
				}
			}

			return mails;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			const sanitized = sanitizeErrorMessage(message, this.settings.password);

			if (isTimeoutError(err)) {
				throw new ImapTimeoutError(sanitized);
			}
			throw new ImapConnectionError(sanitized);
		} finally {
			lock.release();
		}
	}

	/**
	 * Marks a mail as seen (\Seen flag) by UID (F-07).
	 * Acquires a mailbox lock and releases it in a finally block (T-09.2).
	 */
	async markAsSeen(uid: number): Promise<void> {
		if (!this.client) {
			throw new ImapConnectionError('Nicht verbunden – bitte zuerst connect() aufrufen.');
		}

		const lock = await this.client.getMailboxLock(this.settings.mailbox);
		try {
			await this.client.messageFlagsAdd({ uid: `${uid}` }, ['\\Seen'], { uid: true });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			const sanitized = sanitizeErrorMessage(message, this.settings.password);

			if (isTimeoutError(err)) {
				throw new ImapTimeoutError(sanitized);
			}
			throw new ImapConnectionError(sanitized);
		} finally {
			lock.release();
		}
	}
}

/**
 * Heuristic to detect timeout-related errors from ImapFlow.
 */
function isTimeoutError(err: unknown): boolean {
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		return msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout');
	}
	return false;
}
