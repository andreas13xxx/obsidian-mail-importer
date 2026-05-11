// T-10, T-11, T-12: Mail parsing, attachment processing, HTML-to-Markdown conversion
import { simpleParser, Attachment } from 'mailparser';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// --- Exported Interfaces ---

export interface ParsedAttachment {
	filename: string;        // Bereinigter Dateiname (Fallback: "attachment_N")
	contentId?: string;      // CID bei Inline-Bildern (ohne < >)
	content: Buffer;         // Binärinhalt
	isInline: boolean;       // true wenn CID vorhanden UND CID im HTML-Body als
	                         // <img src="cid:..."> referenziert wird (F-19)
}

export interface ParsedMail {
	messageId: string;       // Message-ID-Header (leer wenn nicht vorhanden)
	from: string;
	to: string;
	cc: string;
	date: Date;              // Fallback: Import-Zeitpunkt (new Date())
	subject: string;         // Fallback: "(kein Betreff)"
	markdownBody: string;    // konvertierter Body; CIDs als Platzhalter "cid:abc123" belassen
	attachments: ParsedAttachment[];
}

// --- Turndown Configuration (T-12.1, T-12.2) ---

function createTurndownService(): TurndownService {
	const td = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
	});
	td.use(gfm);
	return td;
}

// --- Helper: Extract referenced CIDs from HTML (T-11.2) ---

function extractReferencedCids(html: string): Set<string> {
	const referencedCids = new Set<string>();
	// Match <img src="cid:..."> patterns (case-insensitive, handles single/double quotes)
	const cidRegex = /<img[^>]+src=["']cid:([^"']+)["'][^>]*>/gi;
	let match: RegExpExecArray | null;
	while ((match = cidRegex.exec(html)) !== null) {
		if (match[1]) {
			referencedCids.add(match[1]);
		}
	}
	return referencedCids;
}

// --- Helper: Convert address objects to string ---

function addressToString(address: unknown): string {
	if (!address) return '';
	if (typeof address === 'string') return address;
	// mailparser returns AddressObject with .text property
	if (typeof address === 'object' && address !== null && 'text' in address) {
		return (address as { text: string }).text || '';
	}
	return String(address);
}

// --- Main Parse Function (T-10.1) ---

export async function parseRawMail(buffer: Buffer): Promise<ParsedMail> {
	try {
		// T-10.2: Call simpleParser
		// skipImageLinks: true prevents mailparser from replacing cid: references
		// with data: URIs, so our extractReferencedCids logic can detect them
		const parsed = await simpleParser(buffer, { skipImageLinks: true });

		// T-10.3: Extract metadata [F-15, F-16]
		const from = addressToString(parsed.from);
		const to = addressToString(parsed.to);
		const cc = addressToString(parsed.cc);
		const messageId = parsed.messageId || '';
		// T-10.4: Fallbacks [F-43, F-47]
		const date = parsed.date ?? new Date();
		const subject = parsed.subject || '(kein Betreff)';

		// T-11: Attachment processing
		const htmlBody = parsed.html || '';
		const textBody = parsed.text || '';

		// T-11.2: Build CID reference set from HTML body
		const referencedCids = htmlBody ? extractReferencedCids(htmlBody) : new Set<string>();

		// T-11.1, T-11.2, T-11.3: Process attachments
		let unnamedCounter = 0;
		const attachments: ParsedAttachment[] = (parsed.attachments || []).map((att: Attachment) => {
			// T-11.3: Fallback name for attachments without filename [F-42]
			let filename = att.filename;
			if (!filename) {
				unnamedCounter++;
				filename = `attachment_${unnamedCounter}`;
			}

			// CID: strip angle brackets if present
			const rawCid = att.contentId ? att.contentId.replace(/^<|>$/g, '') : undefined;

			// T-11.2: isInline logic [F-19]
			// An attachment is inline ONLY when BOTH conditions are met:
			// 1. The attachment has a Content-ID (CID)
			// 2. That CID is referenced in the HTML body as <img src="cid:...">
			const isInline = rawCid !== undefined && referencedCids.has(rawCid);

			return {
				filename,
				contentId: rawCid,
				content: att.content,
				isInline,
			};
		});

		// T-12: HTML-to-Markdown conversion
		let markdownBody: string;

		if (htmlBody) {
			// T-12.1, T-12.2, T-12.3: Convert HTML to Markdown with Turndown
			const td = createTurndownService();
			markdownBody = td.turndown(htmlBody);
			// T-12.5: CID references (cid:abc123) remain as placeholders in the markdown
			// Turndown will have converted <img src="cid:abc123"> to ![](cid:abc123)
			// which is exactly what we want – resolution happens in file-writer.ts [F-20]

			// T-12.6: External image URLs (https://...) are left unchanged by Turndown
			// No additional processing needed – Turndown preserves them as-is [F-44]
		} else {
			// T-12.4: Fallback to plaintext body when no HTML is available [F-18]
			markdownBody = textBody;
		}

		return {
			messageId,
			from,
			to,
			cc,
			date,
			subject,
			markdownBody,
			attachments,
		};
	} catch (err) {
		// Never throw unhandled exceptions – reject with a proper Error
		if (err instanceof Error) {
			return Promise.reject(new Error(`Failed to parse email: ${err.message}`));
		}
		return Promise.reject(new Error(`Failed to parse email: ${String(err)}`));
	}
}
