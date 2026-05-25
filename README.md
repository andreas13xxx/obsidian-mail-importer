# Email Importer

An Obsidian plugin that imports emails from an IMAP mailbox into your vault as Markdown notes. Unread emails are fetched, converted to Markdown with YAML frontmatter, and saved alongside their attachments.

## Features

- Connect to any IMAP server (SSL/TLS or STARTTLS)
- Import unread emails as Markdown notes with YAML frontmatter
- Convert HTML emails to Markdown (tables, headings, lists preserved)
- Save attachments and inline images locally, linked in the note
- Automatic sync on a configurable interval
- Manual sync via ribbon icon or command palette
- Duplicate filename handling with automatic numbering
- Status bar progress indicator during sync

## Installation

### Using BRAT Plugin

To make the installation as easy as possible use the BRAT Plugin.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create a folder in your vault: `<YourVault>/.obsidian/plugins/obsidian-mail-importer/`
3. Copy the three files into that folder.
4. Restart Obsidian or reload plugins.
5. Go to **Settings → Community plugins**, find "Email Importer", and enable it.

## Configuration

Open **Settings → Community plugins → Email Importer** to configure the plugin.

### IMAP Connection

| Setting    | Description                          | Default  |
|------------|--------------------------------------|----------|
| Host       | IMAP server hostname                 | *(empty)* |
| Port       | IMAP server port                     | `993`    |
| Security   | `SSL/TLS` (port 993) or `STARTTLS` (port 143) | `SSL/TLS` |
| Username   | Your email account username          | *(empty)* |
| Password   | Your email account password          | *(empty)* |

### Mailbox

| Setting | Description                    | Default |
|---------|--------------------------------|---------|
| Folder  | IMAP folder to monitor         | `INBOX` |

### Import

| Setting       | Description                                      | Default  |
|---------------|--------------------------------------------------|----------|
| Vault folder  | Folder in your vault where emails are saved      | `Emails` |
| Interval      | Auto-sync interval in minutes (`0` = manual only) | `0`      |

Use the **Test connection** button to verify your IMAP settings. Use **Sync now** to trigger an immediate import.

## Usage

### Manual Sync

- Click the **mail icon** in the ribbon (left sidebar), or
- Open the command palette (`Ctrl/Cmd + P`) and run **Email Importer: Sync now**

### Automatic Sync

Set the sync interval to a value greater than `0` in the plugin settings. The plugin will check for new emails at that interval (in minutes).

### What Happens During Sync

1. The plugin connects to your IMAP server.
2. All **unread** emails in the configured mailbox are fetched.
3. Each email is converted to a Markdown file with YAML frontmatter.
4. Attachments and inline images are saved to a subfolder.
5. Successfully imported emails are marked as **read** on the server.
6. The connection is closed.

If an email fails to import, it remains unread and will be retried on the next sync.

## File Format

Each imported email is saved as a Markdown file with the following structure:

### Filename

```
YYYY-MM-DD HH-mm <Subject>.md
```

Special characters in the subject (`/ \ : * ? " < > |`) are replaced with `-`. If a file with the same name already exists, a counter is appended: `(2)`, `(3)`, etc.

### Frontmatter

```yaml
---
date: 2025-05-10T09:15:00+02:00
from: sender@example.com
to: recipient@example.com
cc: ""
subject: Invoice May 2025
messageId: <abc123@mail.example.com>
attachments:
  - invoice.pdf
  - logo.png
---
```

### Body

The HTML body is converted to Markdown. Inline images are embedded as `![filename](path)`. File attachments are listed at the end as Obsidian wiki-links: `[[path]]`.

### Attachments

Attachments are stored in:

```
<ImportFolder>/attachments/<email-filename>/
```

## Security Notice

⚠️ **Password is stored in plaintext.** Your IMAP password is saved unencrypted in Obsidian's `data.json` file within the plugin folder. This is a known limitation. Take appropriate precautions:

- Use an app-specific password if your email provider supports it.
- Be aware that anyone with access to your vault files can read the password.
- Do not sync the `.obsidian/plugins/obsidian-mail-importer/data.json` file to untrusted locations.

The plugin disables IMAP client logging to prevent credentials from appearing in console output.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection timeout | Verify host/port are correct. The plugin has a fixed 30-second timeout. Check firewall settings. |
| No emails imported | Ensure there are **unread** emails in the configured mailbox folder. |
| Plugin not loading | Confirm `main.js` and `manifest.json` are in the plugin folder. Restart Obsidian. |
| Sync button does nothing | A sync may already be in progress. Wait for it to complete. |
| Garbled text | The plugin handles standard MIME encodings. Severely malformed emails may not parse correctly. |

## Requirements

- Obsidian Desktop (v1.0.0+)
- This plugin is **desktop only** — it requires Node.js APIs for IMAP connections.

## License

[0-BSD](LICENSE)
