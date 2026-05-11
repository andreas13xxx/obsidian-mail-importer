// Phase 9a: Unit-Tests & Property-Tests for file-writer.ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeFilename, truncateFilename, resolveUniqueFilename } from './file-writer';

// ============================================================
// T-21b: Unit-Tests: sanitizeFilename
// ============================================================

describe('sanitizeFilename', () => {
	// T-21b.1: Verbotene Zeichen werden durch `-` ersetzt [F-23]
	it('replaces forbidden characters (/ \\ : * ? " < > |) with -', () => {
		expect(sanitizeFilename('hello/world')).toBe('hello-world');
		expect(sanitizeFilename('file\\name')).toBe('file-name');
		expect(sanitizeFilename('test:file')).toBe('test-file');
		expect(sanitizeFilename('star*file')).toBe('star-file');
		expect(sanitizeFilename('what?')).toBe('what-');
		expect(sanitizeFilename('"quoted"')).toBe('-quoted-');
		expect(sanitizeFilename('<angle>')).toBe('-angle-');
		expect(sanitizeFilename('pipe|char')).toBe('pipe-char');
		expect(sanitizeFilename('all/\\:*?"<>|chars')).toBe('all---------chars');
	});

	// T-21b.2: Windows-reservierte Namen werden entschärft [F-45]
	it('defuses Windows-reserved names with -_ suffix', () => {
		expect(sanitizeFilename('CON')).toBe('CON-_');
		expect(sanitizeFilename('PRN')).toBe('PRN-_');
		expect(sanitizeFilename('NUL')).toBe('NUL-_');
		expect(sanitizeFilename('COM1')).toBe('COM1-_');
		expect(sanitizeFilename('LPT1')).toBe('LPT1-_');
		expect(sanitizeFilename('con')).toBe('con-_');
		expect(sanitizeFilename('Con')).toBe('Con-_');
		// With extension
		expect(sanitizeFilename('CON.txt')).toBe('CON-_.txt');
	});

	// T-21b.3: Leere Eingabe bleibt leer; Eingabe ohne Sonderzeichen bleibt unverändert
	it('returns empty string for empty input', () => {
		expect(sanitizeFilename('')).toBe('');
	});

	it('returns input unchanged when no special characters present', () => {
		expect(sanitizeFilename('normal-filename')).toBe('normal-filename');
		expect(sanitizeFilename('hello world 123')).toBe('hello world 123');
		expect(sanitizeFilename('Rechnung Mai 2025')).toBe('Rechnung Mai 2025');
	});
});

// ============================================================
// T-21c: Unit-Tests: truncateFilename
// ============================================================

describe('truncateFilename', () => {
	// T-21c.1: String ≤ 200 Zeichen bleibt unverändert [F-41]
	it('returns string unchanged when length <= 200', () => {
		const short = 'Hello World';
		expect(truncateFilename(short)).toBe(short);

		const exactly200 = 'a'.repeat(200);
		expect(truncateFilename(exactly200)).toBe(exactly200);
	});

	// T-21c.2: String > 200 Zeichen wird am letzten Wortende vor Position 200 gekürzt [F-41]
	it('truncates at last word boundary before position 200', () => {
		// Create a string with words that exceeds 200 chars
		// "word " repeated = 5 chars each, 40 repetitions = 200 chars, 41 = 205 chars
		const words = 'word '.repeat(41).trim(); // 204 chars (41*5 - 1)
		const result = truncateFilename(words);
		expect(result.length).toBeLessThanOrEqual(200);
		// Should end at a word boundary (no trailing partial word)
		expect(result.endsWith('word')).toBe(true);
	});

	// T-21c.3: String ohne Leerzeichen vor Position 200 wird hart bei 200 Zeichen abgeschnitten
	it('hard-cuts at 200 when no space before position 200', () => {
		const noSpaces = 'a'.repeat(250);
		const result = truncateFilename(noSpaces);
		expect(result.length).toBe(200);
		expect(result).toBe('a'.repeat(200));
	});
});

// ============================================================
// T-21d: Property-Tests: sanitizeFilename (Eigenschaften 1 & 2)
// ============================================================

describe('sanitizeFilename – Property Tests', () => {
	// Feature: obsidian-mail-importer, Eigenschaft 1: Keine verbotenen Zeichen in der Ausgabe
	// **Validates: Requirements F-23, F-45**
	it('Eigenschaft 1: output never contains forbidden characters', () => {
		const forbiddenChars = /[/\\:*?"<>|]/;
		fc.assert(
			fc.property(fc.string(), (input) => {
				const result = sanitizeFilename(input);
				return !forbiddenChars.test(result);
			}),
			{ numRuns: 100 },
		);
	});

	// Feature: obsidian-mail-importer, Eigenschaft 2: Idempotenz
	// **Validates: Requirements F-23, F-45**
	it('Eigenschaft 2: sanitize(sanitize(s)) === sanitize(s) for all strings', () => {
		fc.assert(
			fc.property(fc.string(), (input) => {
				const once = sanitizeFilename(input);
				const twice = sanitizeFilename(once);
				return once === twice;
			}),
			{ numRuns: 100 },
		);
	});
});

// ============================================================
// T-21e: Property-Tests: truncateFilename (Eigenschaften 3 & 4)
// ============================================================

describe('truncateFilename – Property Tests', () => {
	// Feature: obsidian-mail-importer, Eigenschaft 3: Ausgabe ≤ 200 Zeichen
	// **Validates: Requirements F-41**
	it('Eigenschaft 3: output is always <= 200 characters', () => {
		fc.assert(
			fc.property(fc.string(), (input) => {
				const result = truncateFilename(input);
				return result.length <= 200;
			}),
			{ numRuns: 100 },
		);
	});

	// Feature: obsidian-mail-importer, Eigenschaft 4: Keine Kürzung mitten im Wort
	// **Validates: Requirements F-41**
	it('Eigenschaft 4: output ends at word boundary when space exists before position 200', () => {
		// Generate strings > 200 chars that have at least one space before position 200
		const longStringWithSpaces = fc.string({ minLength: 201 }).filter((s) => {
			const sub = s.substring(0, 200);
			return sub.includes(' ') && sub.lastIndexOf(' ') > 0;
		});

		fc.assert(
			fc.property(longStringWithSpaces, (input) => {
				const result = truncateFilename(input);
				// Result should be <= 200
				if (result.length > 200) return false;
				// If the result is shorter than the input, it was truncated
				// It should end at a space boundary (last char should not be a space,
				// and the next char in the original should be a space or the cut was at a word end)
				if (result.length < input.length) {
					// The character after the result in the original should be a space
					// OR the result ends where a word ends
					const nextCharInOriginal = input[result.length];
					return nextCharInOriginal === ' ' || result.endsWith(' ') === false;
				}
				return true;
			}),
			{ numRuns: 100 },
		);
	});
});

// ============================================================
// T-21f: Property-Tests: resolveUniqueFilename (Eigenschaft 5)
// ============================================================

describe('resolveUniqueFilename – Property Tests', () => {
	// Feature: obsidian-mail-importer, Eigenschaft 5: Rückgabe existiert noch nicht
	// **Validates: Requirements F-24, F-46**
	it('Eigenschaft 5: returned filename is never in the set of existing filenames', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('/') && !s.includes('\\')),
				fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.includes('/') && !s.includes('\\')),
				fc.array(fc.string({ minLength: 1, maxLength: 80 }), { minLength: 0, maxLength: 20 }),
				async (base, ext, existingNames) => {
					const folder = 'TestFolder';
					// Build the set of existing full paths
					const existingPaths = new Set(
						existingNames.map((name) => `${folder}/${name}`),
					);

					// Mock Vault with getAbstractFileByPath
					const mockVault = {
						getAbstractFileByPath: (path: string) => {
							return existingPaths.has(path) ? { path } : null;
						},
					} as any;

					const result = await resolveUniqueFilename(
						mockVault,
						folder,
						base,
						ext.startsWith('.') ? ext : `.${ext}`,
					);

					// The result must NOT be in the existing paths
					return !existingPaths.has(result);
				},
			),
			{ numRuns: 100 },
		);
	});
});
