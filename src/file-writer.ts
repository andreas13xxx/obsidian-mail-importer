// Phase 5: File-Writer – Vault-Schreiboperationen
// T-13: Dateinamen-Logik, T-14: Ordner/Dateierstellung, T-15: Markdown-Generierung, T-16: Konsistenz & Cleanup

import { Vault } from 'obsidian';
import type { EmailImporterSettings } from './settings';
import type { ParsedMail } from './mail-parser';

// --- T-13.1: Forbidden characters and Windows-reserved names ---

const FORBIDDEN_CHARS_REGEX = /[/\\:*?"<>|]/g;

const WINDOWS_RESERVED_NAMES = new Set([
	'CON', 'PRN', 'AUX', 'NUL',
	'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
	'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * T-13.1: Sanitizes a filename by replacing forbidden characters with `-`
 * and defusing Windows-reserved names with a `-_` suffix.
 * [F-23, F-45]
 */
export function sanitizeFilename(input: string): string {
	// Replace forbidden characters with `-`
	let result = input.replace(FORBIDDEN_CHARS_REGEX, '-');

	// Check if the name (without extension) is a Windows-reserved name
	// We check the entire result since this is used for subjects/attachment names
	const upper = result.toUpperCase();
	// Also handle cases like "CON.txt" → check base name before first dot
	const dotIndex = upper.indexOf('.');
	const baseName = dotIndex >= 0 ? upper.substring(0, dotIndex) : upper;

	if (WINDOWS_RESERVED_NAMES.has(baseName) || WINDOWS_RESERVED_NAMES.has(upper)) {
		// Insert `-_` after the reserved base name (before extension if present)
		// This ensures idempotency: "CON.txt" → "CON-_.txt" → "CON-_.txt" (baseName = "CON-_", not reserved)
		if (dotIndex >= 0) {
			result = result.substring(0, dotIndex) + '-_' + result.substring(dotIndex);
		} else {
			result = result + '-_';
		}
	}

	return result;
}

/**
 * T-13.2: Truncates a filename to a maximum length (default 200),
 * cutting at the last space before the limit. Never cuts mid-word.
 * [F-41]
 */
export function truncateFilename(name: string, max = 200): string {
	if (name.length <= max) {
		return name;
	}

	// Find the last space at or before position `max`
	const lastSpace = name.lastIndexOf(' ', max);

	if (lastSpace > 0) {
		return name.substring(0, lastSpace);
	}

	// No space found before position max → hard cut at max
	return name.substring(0, max);
}

/**
 * T-13.3: Builds the base filename for a mail (without extension).
 * Schema: "YYYY-MM-DD HH-mm <Betreff>"
 * If subject is empty after sanitizing → "(kein Betreff)"
 * [F-22, F-47]
 */
export function buildBaseFilename(mail: ParsedMail): string {
	const d = mail.date;
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const hours = String(d.getHours()).padStart(2, '0');
	const minutes = String(d.getMinutes()).padStart(2, '0');

	const datePrefix = `${year}-${month}-${day} ${hours}-${minutes}`;

	// Sanitize and truncate the subject
	let sanitizedSubject = sanitizeFilename(mail.subject).trim();

	// If subject is empty after sanitizing → use fallback
	if (sanitizedSubject === '' || sanitizedSubject === '-_') {
		sanitizedSubject = '(kein Betreff)';
	}

	const fullBase = `${datePrefix} ${sanitizedSubject}`;

	// Truncate the full base filename
	return truncateFilename(fullBase);
}

/**
 * T-13.4, T-13.5: Resolves a unique filename in a folder by appending a counter.
 * base.ext → base (2).ext → base (3).ext …
 * [F-24, F-46]
 */
export async function resolveUniqueFilename(
	vault: Vault,
	folder: string,
	base: string,
	ext: string,
): Promise<string> {
	const candidate = `${folder}/${base}${ext}`;
	if (!vault.getAbstractFileByPath(candidate)) {
		return candidate;
	}

	let i = 2;
	while (true) {
		const numbered = `${folder}/${base} (${i})${ext}`;
		if (!vault.getAbstractFileByPath(numbered)) {
			return numbered;
		}
		i++;
	}
}

// --- T-14: Ordner- und Dateierstellung ---

/**
 * T-14.1: Ensures a folder exists in the vault, creating it if necessary.
 * [F-21, F-25]
 */
async function ensureFolder(vault: Vault, path: string): Promise<void> {
	const existing = vault.getAbstractFileByPath(path);
	if (!existing) {
		await vault.createFolder(path);
	}
}

// --- T-15: Markdown-Generierung ---

/**
 * Escapes a YAML value if it contains special characters.
 * Wraps in double quotes and escapes internal quotes/backslashes.
 */
function yamlValue(value: string): string {
	// If value contains characters that could break YAML, quote it
	if (
		value === '' ||
		value.includes(':') ||
		value.includes('#') ||
		value.includes('"') ||
		value.includes("'") ||
		value.includes('\n') ||
		value.includes('[') ||
		value.includes(']') ||
		value.includes('{') ||
		value.includes('}') ||
		value.includes(',') ||
		value.includes('&') ||
		value.includes('*') ||
		value.includes('!') ||
		value.includes('|') ||
		value.includes('>') ||
		value.includes('%') ||
		value.includes('@') ||
		value.includes('`') ||
		value.startsWith(' ') ||
		value.endsWith(' ')
	) {
		// Escape backslashes and double quotes inside the value
		const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
}

/**
 * Formats a Date as ISO 8601 with timezone offset.
 * Example: 2025-05-10T09:15:00+02:00
 * [F-51]
 */
function formatDateISO(date: Date): string {
	const offset = -date.getTimezoneOffset();
	const sign = offset >= 0 ? '+' : '-';
	const absOffset = Math.abs(offset);
	const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
	const offsetMinutes = String(absOffset % 60).padStart(2, '0');

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

/**
 * T-15.1: Builds the YAML frontmatter block.
 * [F-27, F-28, F-51]
 */
function buildFrontmatter(mail: ParsedMail, attachmentFilenames: string[]): string {
	const lines: string[] = ['---'];
	lines.push(`date: ${yamlValue(formatDateISO(mail.date))}`);
	lines.push(`from: ${yamlValue(mail.from)}`);
	lines.push(`to: ${yamlValue(mail.to)}`);
	lines.push(`cc: ${yamlValue(mail.cc)}`);
	lines.push(`subject: ${yamlValue(mail.subject)}`);
	lines.push(`messageId: ${yamlValue(mail.messageId)}`);

	if (attachmentFilenames.length === 0) {
		lines.push('attachments: []');
	} else {
		lines.push('attachments:');
		for (const name of attachmentFilenames) {
			lines.push(`  - ${yamlValue(name)}`);
		}
	}

	lines.push('---');
	return lines.join('\n');
}

/**
 * T-15.2, T-15.3: Replaces CID placeholders in the markdown body
 * with final vault paths as ![filename](path).
 * [F-20, F-29]
 */
function replaceCidPlaceholders(
	markdownBody: string,
	cidToVaultPath: Map<string, string>,
): string {
	let result = markdownBody;

	for (const [cid, vaultPath] of cidToVaultPath.entries()) {
		// Turndown converts <img src="cid:abc"> to ![](cid:abc) or ![alt](cid:abc)
		// We need to replace the cid:abc part with the vault path
		// Match patterns like ![...](cid:abc123)
		const cidPattern = new RegExp(
			`!\\[([^\\]]*)\\]\\(cid:${escapeRegex(cid)}\\)`,
			'g',
		);
		const filename = vaultPath.split('/').pop() || '';
		result = result.replace(cidPattern, `![${filename}](${vaultPath})`);
	}

	return result;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * T-15.4: Builds the attachments section at the end of the markdown file.
 * Non-inline attachments are listed as [[path]] wiki-links.
 * [F-30]
 */
function buildAttachmentsSection(
	nonInlineAttachments: { filename: string; vaultPath: string }[],
): string {
	if (nonInlineAttachments.length === 0) {
		return '';
	}

	const lines: string[] = ['', '---', '', '**Anhänge:**'];
	for (const att of nonInlineAttachments) {
		lines.push(`![[${att.vaultPath}]]`);
	}
	return lines.join('\n');
}

// --- FileWriter class ---

export class FileWriter {
	constructor(
		private vault: Vault,
		private settings: EmailImporterSettings,
	) {}

	/**
	 * T-16.1, T-16.2: Writes a complete mail to the vault.
	 * Order: attachments first, then markdown file.
	 * On error: best-effort cleanup of already-written attachments.
	 * [F-08, F-09]
	 */
	async writeMail(mail: ParsedMail): Promise<void> {
		const base = buildBaseFilename(mail);
		const mailPath = await resolveUniqueFilename(
			this.vault,
			this.settings.importFolder,
			base,
			'.md',
		);

		// The "mailname" for the attachment folder is the base filename
		// (same as the mail file without extension)
		const mailname = mailPath
			.substring(this.settings.importFolder.length + 1)
			.replace(/\.md$/, '');

		// T-14.2: Compute attachment folder path
		const attachmentFolder = `${this.settings.importFolder}/attachments/${mailname}`;

		// Track written files for cleanup on error
		const writtenPaths: string[] = [];

		try {
			// T-14.1: Ensure import folder exists
			await ensureFolder(this.vault, this.settings.importFolder);

			// T-16.1: Write attachments FIRST, then markdown
			const cidToVaultPath = new Map<string, string>();
			const nonInlineAttachments: { filename: string; vaultPath: string }[] = [];
			const allAttachmentFilenames: string[] = [];

			if (mail.attachments.length > 0) {
				// Ensure attachments folder structure exists
				await ensureFolder(this.vault, `${this.settings.importFolder}/attachments`);
				await ensureFolder(this.vault, attachmentFolder);

				// T-14.3, T-14.4: Write each attachment
				for (const att of mail.attachments) {
					const sanitizedName = sanitizeFilename(att.filename);
					// Split into name and extension
					const lastDot = sanitizedName.lastIndexOf('.');
					const nameWithoutExt = lastDot > 0 ? sanitizedName.substring(0, lastDot) : sanitizedName;
					const ext = lastDot > 0 ? sanitizedName.substring(lastDot) : '';

					// T-14.4: Resolve unique filename for attachment [F-46]
					const attPath = await resolveUniqueFilename(
						this.vault,
						attachmentFolder,
						nameWithoutExt,
						ext,
					);

					// Write binary data
					await this.vault.createBinary(attPath, att.content);
					writtenPaths.push(attPath);

					const attFilename = attPath.split('/').pop() || sanitizedName;
					allAttachmentFilenames.push(attFilename);

					// Build CID map for inline images
					if (att.isInline && att.contentId) {
						cidToVaultPath.set(att.contentId, attPath);
					} else {
						nonInlineAttachments.push({
							filename: attFilename,
							vaultPath: attPath,
						});
					}
				}
			}

			// T-15: Build markdown content
			const markdown = this.buildMarkdown(
				mail,
				cidToVaultPath,
				nonInlineAttachments,
				allAttachmentFilenames,
			);

			// T-15.5: Write the markdown file
			await this.vault.create(mailPath, markdown);
		} catch (err) {
			// T-16.2: Best-effort cleanup of already-written attachments
			for (const path of writtenPaths) {
				try {
					const file = this.vault.getAbstractFileByPath(path);
					if (file) {
						await this.vault.delete(file);
					}
				} catch {
					// Ignore cleanup errors – best-effort
				}
			}
			// Re-throw so SyncService knows the write failed
			throw err;
		}
	}

	/**
	 * T-15.1–T-15.4: Builds the complete markdown string for a mail.
	 */
	private buildMarkdown(
		mail: ParsedMail,
		cidToVaultPath: Map<string, string>,
		nonInlineAttachments: { filename: string; vaultPath: string }[],
		allAttachmentFilenames: string[],
	): string {
		// T-15.1: Build frontmatter
		const frontmatter = buildFrontmatter(mail, allAttachmentFilenames);

		// T-15.2, T-15.3: Replace CID placeholders with vault paths
		let body = replaceCidPlaceholders(mail.markdownBody, cidToVaultPath);

		// T-15.4: Append non-inline attachments as wiki-links
		const attachmentsSection = buildAttachmentsSection(nonInlineAttachments);

		return `${frontmatter}\n\n${body}${attachmentsSection}\n`;
	}
}
