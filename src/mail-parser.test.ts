// Phase 9a: Unit-Tests & Property-Tests for mail-parser.ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseRawMail } from './mail-parser';

// ============================================================
// T-21g: Property-Tests: parseRawMail (Eigenschaft 6)
// ============================================================

describe('parseRawMail – Property Tests', () => {
	// Feature: obsidian-mail-importer, Eigenschaft 6: Keine unkontrollierten Exceptions
	// **Validates: Requirements F-15**
	it('Eigenschaft 6: never throws unhandled exception for arbitrary buffers', async () => {
		await fc.assert(
			fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 1000 }), async (bytes) => {
				const buffer = Buffer.from(bytes);
				try {
					await parseRawMail(buffer);
					// Resolved successfully – that's fine
					return true;
				} catch (err) {
					// Rejected with an Error – that's also acceptable (controlled rejection)
					return err instanceof Error;
				}
			}),
			{ numRuns: 100 },
		);
	});
});

// ============================================================
// T-21h: Unit-Tests: Frontmatter & CID-Auflösung
// ============================================================

describe('parseRawMail – Frontmatter fields', () => {
	// Helper: create a minimal valid email buffer
	function createEmailBuffer(options: {
		from?: string;
		to?: string;
		cc?: string;
		subject?: string;
		date?: string;
		messageId?: string;
		html?: string;
		text?: string;
		attachments?: Array<{
			filename: string;
			content: string;
			contentType?: string;
			contentId?: string;
			contentDisposition?: string;
		}>;
	}): Buffer {
		const boundary = '----=_Part_123456';
		const lines: string[] = [];

		lines.push(`From: ${options.from || 'sender@example.com'}`);
		lines.push(`To: ${options.to || 'recipient@example.com'}`);
		if (options.cc) lines.push(`CC: ${options.cc}`);
		lines.push(`Subject: ${options.subject || 'Test Subject'}`);
		if (options.date) lines.push(`Date: ${options.date}`);
		if (options.messageId) lines.push(`Message-ID: ${options.messageId}`);
		lines.push(`MIME-Version: 1.0`);

		if (options.attachments && options.attachments.length > 0) {
			lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
			lines.push('');

			// Body part
			lines.push(`--${boundary}`);
			if (options.html) {
				lines.push('Content-Type: text/html; charset=utf-8');
				lines.push('');
				lines.push(options.html);
			} else {
				lines.push('Content-Type: text/plain; charset=utf-8');
				lines.push('');
				lines.push(options.text || 'Hello World');
			}

			// Attachment parts
			for (const att of options.attachments) {
				lines.push(`--${boundary}`);
				lines.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`);
				if (att.contentId) {
					lines.push(`Content-ID: <${att.contentId}>`);
				}
				lines.push(`Content-Disposition: ${att.contentDisposition || 'attachment'}; filename="${att.filename}"`);
				lines.push('Content-Transfer-Encoding: base64');
				lines.push('');
				lines.push(Buffer.from(att.content).toString('base64'));
			}

			lines.push(`--${boundary}--`);
		} else {
			if (options.html) {
				lines.push('Content-Type: text/html; charset=utf-8');
				lines.push('');
				lines.push(options.html);
			} else {
				lines.push('Content-Type: text/plain; charset=utf-8');
				lines.push('');
				lines.push(options.text || 'Hello World');
			}
		}

		return Buffer.from(lines.join('\r\n'));
	}

	// T-21h.1: Frontmatter enthält alle Pflichtfelder [F-28]
	it('parsed mail contains all required frontmatter fields: date, from, to, cc, subject, messageId, attachments', async () => {
		const buffer = createEmailBuffer({
			from: 'alice@example.com',
			to: 'bob@example.com',
			cc: 'carol@example.com',
			subject: 'Test Email',
			date: 'Mon, 10 May 2025 09:15:00 +0200',
			messageId: '<abc123@mail.example.com>',
		});

		const result = await parseRawMail(buffer);

		expect(result.from).toContain('alice@example.com');
		expect(result.to).toContain('bob@example.com');
		expect(result.cc).toContain('carol@example.com');
		expect(result.subject).toBe('Test Email');
		expect(result.messageId).toBe('<abc123@mail.example.com>');
		expect(result.date).toBeInstanceOf(Date);
		expect(result.attachments).toBeInstanceOf(Array);
	});

	// T-21h.2: date-Feld ist im ISO 8601 Format mit Zeitzone [F-51]
	it('date field is a valid Date object that can be formatted as ISO 8601 with timezone', async () => {
		const buffer = createEmailBuffer({
			date: 'Mon, 10 May 2025 09:15:00 +0200',
		});

		const result = await parseRawMail(buffer);

		expect(result.date).toBeInstanceOf(Date);
		// Verify the date is valid and can produce ISO string
		const isoString = result.date.toISOString();
		expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		// The parsed date should correspond to 2025-05-10T07:15:00Z (UTC)
		expect(result.date.getUTCFullYear()).toBe(2025);
		expect(result.date.getUTCMonth()).toBe(4); // May = 4 (0-indexed)
		expect(result.date.getUTCDate()).toBe(10);
	});
});

describe('parseRawMail – CID resolution (isInline logic)', () => {
	function createEmailWithInlineImage(options: {
		contentId: string;
		htmlReferencesCid: boolean;
		contentDisposition?: string;
	}): Buffer {
		const boundary = '----=_Part_789';
		const lines: string[] = [];

		lines.push('From: sender@example.com');
		lines.push('To: recipient@example.com');
		lines.push('Subject: CID Test');
		lines.push('Date: Mon, 10 May 2025 09:15:00 +0200');
		lines.push('Message-ID: <cid-test@example.com>');
		lines.push('MIME-Version: 1.0');
		lines.push(`Content-Type: multipart/related; boundary="${boundary}"`);
		lines.push('');

		// HTML body part
		lines.push(`--${boundary}`);
		lines.push('Content-Type: text/html; charset=utf-8');
		lines.push('');
		if (options.htmlReferencesCid) {
			lines.push(`<html><body><p>Hello</p><img src="cid:${options.contentId}"></body></html>`);
		} else {
			lines.push('<html><body><p>Hello, no inline image here</p></body></html>');
		}

		// Image attachment part
		lines.push(`--${boundary}`);
		lines.push(`Content-Type: image/png; name="logo.png"`);
		lines.push(`Content-ID: <${options.contentId}>`);
		lines.push(`Content-Disposition: ${options.contentDisposition || 'inline'}; filename="logo.png"`);
		lines.push('Content-Transfer-Encoding: base64');
		lines.push('');
		// Minimal PNG-like data (just some bytes for testing)
		lines.push(Buffer.from('fake-png-data').toString('base64'));

		lines.push(`--${boundary}--`);

		return Buffer.from(lines.join('\r\n'));
	}

	// T-21h.3: CID-Auflösung: isInline = true nur wenn CID vorhanden UND im HTML referenziert [F-19]
	it('isInline = true when CID is present AND referenced in HTML', async () => {
		const buffer = createEmailWithInlineImage({
			contentId: 'image001@example.com',
			htmlReferencesCid: true,
			contentDisposition: 'inline',
		});

		const result = await parseRawMail(buffer);

		expect(result.attachments.length).toBe(1);
		expect(result.attachments[0]!.isInline).toBe(true);
		expect(result.attachments[0]!.contentId).toBe('image001@example.com');
	});

	// T-21h.4: CID-Auflösung: Anhang mit contentDisposition: 'inline' aber ohne HTML-Referenz → isInline = false
	it('isInline = false when contentDisposition is inline but CID is NOT referenced in HTML', async () => {
		const buffer = createEmailWithInlineImage({
			contentId: 'image002@example.com',
			htmlReferencesCid: false, // CID not referenced in HTML
			contentDisposition: 'inline',
		});

		const result = await parseRawMail(buffer);

		expect(result.attachments.length).toBe(1);
		expect(result.attachments[0]!.isInline).toBe(false);
		// The CID is still present on the attachment
		expect(result.attachments[0]!.contentId).toBe('image002@example.com');
	});
});
