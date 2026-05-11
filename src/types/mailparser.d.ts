declare module 'mailparser' {
	interface AddressObject {
		text: string;
		html: string;
		value: Array<{
			name: string;
			address: string;
		}>;
	}

	interface Attachment {
		filename?: string;
		contentType: string;
		contentDisposition?: string;
		contentId?: string;
		content: Buffer;
		size: number;
	}

	interface ParsedMail {
		from?: AddressObject;
		to?: AddressObject;
		cc?: AddressObject;
		bcc?: AddressObject;
		subject?: string;
		date?: Date;
		messageId?: string;
		html?: string | false;
		text?: string;
		textAsHtml?: string;
		attachments: Attachment[];
		headers: Map<string, unknown>;
		headerLines: Array<{ key: string; line: string }>;
	}

	interface SimpleParserOptions {
		skipImageLinks?: boolean;
		[key: string]: unknown;
	}

	function simpleParser(source: Buffer | string | NodeJS.ReadableStream, options?: SimpleParserOptions): Promise<ParsedMail>;

	export { simpleParser, ParsedMail, AddressObject, Attachment };
}
