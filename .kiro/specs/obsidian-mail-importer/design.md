# Design – Obsidian Email Importer Plugin

## 1. Architekturübersicht

Das Plugin folgt einer klar geschichteten Architektur. Jede Schicht hat eine einzige Verantwortung und kommuniziert nur mit der direkt angrenzenden Schicht.

```
┌─────────────────────────────────────────────┐
│                  main.ts                    │  Plugin-Lifecycle, UI-Koordination
├─────────────────────────────────────────────┤
│               scheduler.ts                  │  Intervall-Verwaltung
├─────────────────────────────────────────────┤
│              sync-service.ts                │  Orchestrierung des Sync-Ablaufs
├──────────────────┬──────────────────────────┤
│  imap-client.ts  │     mail-parser.ts        │  I/O & Parsing
├──────────────────┴──────────────────────────┤
│              file-writer.ts                 │  Vault-Schreiboperationen
├─────────────────────────────────────────────┤
│               settings.ts                   │  Konfiguration & SettingTab
└─────────────────────────────────────────────┘
```

---

## 2. Modulbeschreibungen

### 2.1 `main.ts` – Plugin-Einstiegspunkt

**Verantwortung:** Obsidian-Plugin-Lifecycle, Registrierung von Commands, Ribbon-Icon und Statusleiste.

```typescript
export default class EmailImporterPlugin extends Plugin {
  settings: EmailImporterSettings;
  private scheduler: SyncScheduler;
  private syncService: SyncService;
  private statusBarItem: HTMLElement;
  private isSyncing: boolean = false;

  async onload(): Promise<void>   // Settings laden, UI registrieren, Scheduler starten
  async onunload(): Promise<void> // Timer stoppen, laufenden Sync abbrechen
  async triggerSync(): Promise<void> // Mutex-geschützter Sync-Aufruf
  updateStatusBar(text: string): void
}
```

**Registrierte UI-Elemente:**
- Ribbon-Icon: `mail` → ruft `triggerSync()` auf
- Command: `email-importer:sync-now` → ruft `triggerSync()` auf
- Status-Bar-Item: zeigt Sync-Status und letzten Sync-Zeitpunkt

---

### 2.2 `settings.ts` – Konfiguration

**Datenstruktur:**

```typescript
interface EmailImporterSettings {
  // Verbindung
  host: string;             // Default: ""
  port: number;             // Default: 993
  security: 'tls' | 'starttls'; // Default: 'tls'
  username: string;         // Default: ""
  password: string;         // Default: ""
  mailbox: string;          // Default: "INBOX"
  // Import
  importFolder: string;     // Default: "Emails"
  intervalMinutes: number;  // Default: 0
}

const DEFAULT_SETTINGS: EmailImporterSettings = {
  host: '', port: 993, security: 'tls',
  username: '', password: '', mailbox: 'INBOX',
  importFolder: 'Emails', intervalMinutes: 0,
};
```

**SettingTab-Aufbau:**

```
Abschnitt: IMAP-Verbindung
  ├── Host          [Textfeld]
  ├── Port          [Zahlenfeld]
  ├── Sicherheit    [Dropdown: SSL/TLS | STARTTLS]
  ├── Benutzername  [Textfeld]
  ├── Passwort      [Passwortfeld]
  └── [Verbindung testen] → zeigt ✓ oder Fehlermeldung inline

Abschnitt: Mailbox
  └── Ordner        [Textfeld, Default: INBOX]

Abschnitt: Import
  ├── Vault-Ordner  [Textfeld, Default: Emails]
  ├── Intervall     [Zahlenfeld in Minuten, 0 = manuell]
  └── [Jetzt synchronisieren]
```

---

### 2.3 `imap-client.ts` – IMAP-Verbindung

**Bibliothek:** `imapflow`

**Schnittstelle:**

```typescript
interface RawMail {
  uid: number;
  source: Buffer; // vollständiger RFC 822 Inhalt
}

class ImapClient {
  constructor(settings: EmailImporterSettings)

  // Baut die IMAP-Verbindung auf (TLS oder STARTTLS je nach Settings).
  // Festes Timeout von 30 Sekunden (F-50); logger deaktiviert (NF-05).
  async connect(): Promise<void>

  // Gibt alle UNSEEN-Mails zurück; verbindet/trennt NICHT selbst
  async fetchUnseenMails(): Promise<RawMail[]>

  // Markiert eine Mail anhand ihrer UID als gelesen
  async markAsSeen(uid: number): Promise<void>

  // Trennt die Verbindung sauber
  async disconnect(): Promise<void>

  // Nur für den „Verbindung testen"-Button (connect + NOOP + disconnect intern)
  async testConnection(): Promise<void>
}
```

**Verbindungslogik:**

```
connect()
  └── security === 'tls'
        → new ImapFlow({ host, port, secure: true, auth, logger: false, socketTimeout: 30000 })
  └── security === 'starttls'
        → new ImapFlow({ host, port, secure: false, tls: { starttls: 'required' },
                         auth, logger: false, socketTimeout: 30000 })
  └── client.connect()
  // socketTimeout: 30000 → festes 30-Sekunden-Timeout (F-50, nicht konfigurierbar)
  // logger: false        → verhindert Ausgabe von Zugangsdaten in der Konsole (NF-05)

fetchUnseenMails()                     // Setzt aktive Verbindung voraus
  └── const lock = getMailboxLock(mailbox)
  └── try:
  │     search({ seen: false })        // UIDs aller UNSEEN-Mails
  │     fetch(uids, { source: true, uid: true })
  └── finally:
        lock.release()                 // Lock immer freigeben
  // KEIN connect/disconnect hier – Lifecycle-Verantwortung liegt bei SyncService
```

---

### 2.4 `mail-parser.ts` – E-Mail-Parsing & Konvertierung

**Bibliotheken:** `mailparser`, `turndown`

**Datenstrukturen:**

```typescript
interface ParsedAttachment {
  filename: string;        // Bereinigter Dateiname (Fallback: "attachment_N")
  contentId?: string;      // CID bei Inline-Bildern (ohne < >)
  content: Buffer;         // Binärinhalt
  isInline: boolean;       // true wenn CID vorhanden UND CID im HTML-Body als
                           // <img src="cid:..."> referenziert wird (F-19)
}

interface ParsedMail {
  messageId: string;       // Message-ID-Header (leer wenn nicht vorhanden)
  from: string;
  to: string;
  cc: string;
  date: Date;              // Fallback: Import-Zeitpunkt (new Date())
  subject: string;         // Fallback: "(kein Betreff)"
  markdownBody: string;    // konvertierter Body; CIDs als Platzhalter "cid:abc123" belassen
  attachments: ParsedAttachment[];
}
```

**`isInline`-Logik (F-19):**

Ein Anhang gilt genau dann als Inline-Bild, wenn **beide** Bedingungen erfüllt sind:
1. Der Anhang besitzt eine Content-ID (CID).
2. Diese CID wird im HTML-Body als `<img src="cid:...">` referenziert.

`contentDisposition === 'inline'` allein ist **nicht** ausreichend – ein Anhang mit `inline`-Disposition aber ohne CID-Referenz im HTML wird als normaler Datei-Anhang behandelt.

**Parsing-Ablauf:**

```
parseRawMail(buffer: Buffer): Promise<ParsedMail>
  │
  ├── simpleParser(buffer)                    // mailparser
  │
  ├── Metadaten extrahieren + Fallbacks:
  │   ├── date    ?? new Date()               // F-43
  │   ├── subject ?? "(kein Betreff)"         // F-47
  │   └── messageId ?? ""
  │
  ├── Anhang-Fallback-Namen vergeben:
  │   └── attachment ohne filename → "attachment_N" (Zähler pro Mail) // F-42
  │
  ├── HTML-Pfad (bevorzugt):
  │   ├── CID-Map aufbauen: { "abc123" → ParsedAttachment }
  │   ├── HTML-Body nach "cid:"-Referenzen durchsuchen:
  │   │   └── Regex auf <img src="cid:..."> anwenden → Set<string> der referenzierten CIDs
  │   ├── isInline = cid !== undefined && referencedCids.has(cid)   // F-19
  │   ├── turndown(html)                      // HTML → Markdown (Rohfassung)
  │   └── CID-Referenzen im Markdown belassen ("cid:abc123")
  │       → Auflösung zu finalem Pfad erfolgt in FileWriter  // Entkopplung
  │
  ├── Plaintext-Pfad (Fallback):
  │   └── text direkt verwenden
  │
  └── Rückgabe: ParsedMail
```

> **Entkopplungsprinzip:** `mail-parser.ts` kennt keine Vault-Pfade. CID-Referenzen bleiben als `cid:abc123` im `markdownBody` erhalten. `file-writer.ts` ersetzt sie nach dem Schreiben der Anhänge durch die tatsächlichen relativen Vault-Pfade.

**Turndown-Konfiguration:**

```typescript
const td = new TurndownService({
  headingStyle: 'atx',         // # Heading
  codeBlockStyle: 'fenced',    // ```code```
  bulletListMarker: '-',
});
// Tabellen-Plugin aktivieren
td.use(turndownPluginGfm.gfm);
```

---

### 2.5 `file-writer.ts` – Vault-Schreiboperationen

**Schnittstelle:**

```typescript
class FileWriter {
  constructor(private vault: Vault, private settings: EmailImporterSettings)

  async writeMail(mail: ParsedMail): Promise<void>

  private buildMarkdown(mail: ParsedMail, cidToVaultPath: Map<string, string>): string
  private sanitizeFilename(input: string): string        // F-23, F-45
  private truncateFilename(name: string): string         // F-41: max 200 Zeichen, am Wortende
  private resolveUniqueFilename(base: string, ext: string): Promise<string>  // F-24, F-46
  private ensureFolder(path: string): Promise<void>
}
```

**Dateiname-Algorithmus (Mail):**

```
base = "YYYY-MM-DD HH-mm " + truncate(sanitize(subject))
// Sonderfall: sanitize() → leerer String → base = "YYYY-MM-DD HH-mm (kein Betreff)"
candidate = base + ".md"
if not exists → return candidate
i = 2; while exists(base + " (" + i + ").md") → i++
return base + " (" + i + ").md"
```

**Dateiname-Algorithmus (Anhänge):**

```
// Gleiche Logik wie bei Mails, jedoch ohne Datums-Prefix
sanitized = sanitize(attachment.filename)   // F-45
if not exists in folder → use sanitized
i = 2; while exists(name + " (" + i + ")" + ext) → i++   // F-46
```

**Schreib-Reihenfolge (best-effort konsistent pro Mail):**

```
1. Anhang-Ordner anlegen:  <importFolder>/attachments/<mailname>/
2. Für jeden Anhang:       vault.createBinary(pfad, buffer)
                           cidToVaultPath.set(cid, vaultPfad)  ← für Schritt 4
3. Markdown-String bauen:  CID-Platzhalter → finale Vault-Pfade ersetzen
4. vault.create(mailpfad, markdown)
// Erst DANACH → markAsSeen(uid) durch SyncService (F-08)
// Bei Fehler in Schritt 2–4: best-effort Cleanup der bereits geschriebenen Anhänge;
// markAsSeen() wird NICHT aufgerufen → Mail bleibt ungelesen (F-09)
```

**Markdown-Template:**

Das Template enthält alle Pflichtfelder des Frontmatters gemäß F-28, einschließlich `messageId`:

````markdown
---
date: 2025-05-10T09:15:00+02:00
from: absender@example.com
to: ich@example.com
cc: ""
subject: Rechnung Mai 2025
messageId: <abc123@mail.example.com>
attachments:
  - rechnung.pdf
  - logo.png
---

Hallo,

anbei die Rechnung für Mai 2025.

![logo.png](Emails/attachments/2025-05-10 09-15 Rechnung/logo.png)

Mit freundlichen Grüßen

---

**Anhänge:**
[[Emails/attachments/2025-05-10 09-15 Rechnung/rechnung.pdf]]
````

Pflichtfelder im Frontmatter (F-28): `date` (ISO 8601 mit Zeitzone, F-51), `from`, `to`, `cc`, `subject`, `messageId`, `attachments` (Liste).

---

### 2.6 `sync-service.ts` – Orchestrierung

```typescript
class SyncService {
  constructor(
    private imapClient: ImapClient,
    private fileWriter: FileWriter,
    private onProgress: (msg: string) => void
  )

  async sync(): Promise<SyncResult>
}

interface SyncResult {
  imported: number;
  failed: number;   // Fehler beim Schreiben in den Vault (Schreibversuch hat stattgefunden)
  skipped: number;  // Parse-Fehler – kein Schreibversuch hat stattgefunden
  durationMs: number;
  errors: string[];
}
```

**Unterscheidung `skipped` vs. `failed` (F-49):**

- **`skipped`**: `parseRawMail()` wirft eine Exception → die Mail konnte nicht geparst werden, es wurde kein Schreibversuch unternommen. Die Mail bleibt ungelesen.
- **`failed`**: `fileWriter.writeMail()` oder `markAsSeen()` wirft eine Exception → der Schreibversuch hat stattgefunden (ggf. teilweise), ist aber fehlgeschlagen.

**Ablauf:**

```
sync()
  ├── startTime = Date.now()
  ├── onProgress("Verbinde…")
  ├── imapClient.connect()               // wirft bei Verbindungsfehler
  ├── try:
  │   ├── mails = fetchUnseenMails()
  │   ├── onProgress(`0 / ${mails.length} importiert`)
  │   ├── for each mail:
  │   │   ├── try:
  │   │   │   ├── parsed = parseRawMail(mail.source)
  │   │   │   │   └── catch ParseError:
  │   │   │   │         skipped++          // Parse-Fehler, kein Schreibversuch (F-49)
  │   │   │   │         errors.push(...)
  │   │   │   │         continue           // nächste Mail
  │   │   │   ├── fileWriter.writeMail(parsed)    // best-effort konsistent
  │   │   │   ├── markAsSeen(mail.uid)            // nur bei Erfolg (F-08)
  │   │   │   ├── imported++
  │   │   │   └── onProgress(`${imported} / ${total} importiert`)
  │   │   └── catch WriteError:
  │   │         failed++                  // Schreibfehler (Schreibversuch hat stattgefunden)
  │   │         errors.push(message)
  │   │         // Mail bleibt ungelesen (F-09)
  └── finally:
      ├── imapClient.disconnect()        // immer ausführen (F-05, NF-04)
      └── return { imported, failed, skipped, durationMs: Date.now() - startTime, errors }
```

> **Netzwerkabbruch:** Bricht die Verbindung während des Syncs ab, wirft `markAsSeen()` oder `fetchUnseenMails()` eine Exception. Bereits erfolgreich importierte Mails bleiben importiert (und als gelesen markiert). Der Rest wird beim nächsten Sync-Lauf verarbeitet (F-48).

---

### 2.7 `scheduler.ts` – Intervall-Verwaltung

```typescript
class SyncScheduler {
  private timerId: number | null = null;

  start(intervalMinutes: number, callback: () => void): number | null
  stop(): void
  restart(intervalMinutes: number, callback: () => void): number | null
}
```

**Timer-Registrierung (Obsidian-konform):**

Obsidian-Plugins sollen Intervalle über `this.registerInterval(window.setInterval(...))` registrieren, damit der Timer beim Entladen des Plugins automatisch bereinigt wird (AGENTS.md, NF-04).

Da `SyncScheduler` keine Referenz auf die Plugin-Instanz hat, gibt `start()` die Timer-ID zurück. `main.ts` registriert den Timer anschließend selbst:

```typescript
// In main.ts → onload() / nach Settings-Änderung:
const timerId = this.scheduler.start(this.settings.intervalMinutes, () => this.triggerSync());
if (timerId !== null) {
  this.registerInterval(timerId);
}
```

`stop()` ruft `window.clearInterval(this.timerId)` auf und wird zusätzlich in `onunload()` aufgerufen, um den Timer explizit zu stoppen (defensiv, da `registerInterval` ihn ohnehin bereinigt).

---

## 3. Abhängigkeiten

| Paket                  | Version   | Zweck                                      |
|------------------------|-----------|--------------------------------------------|
| `imapflow`             | ^1.0      | IMAP-Client                                |
| `mailparser`           | ^3.7      | RFC 822 Parsing                            |
| `turndown`             | ^7.2      | HTML → Markdown                            |
| `turndown-plugin-gfm`  | ^1.0      | GFM-Tabellen in Turndown                   |
| `obsidian`             | latest    | Plugin-API (dev-dependency)                |
| `@types/node`          | ^20       | Node.js-Typen (dev) – **Breaking Change**: aktuelles `package.json` hat `^16.11.6`, Upgrade auf `^20` empfohlen |
| `@types/turndown`      | ^2.0      | TypeScript-Typen für Turndown (dev)        |
| `typescript`           | ^5        | Compiler (dev)                             |
| `esbuild`              | ^0.21     | Bundler (dev)                              |

> **Hinweis `@types/node`:** Das aktuelle `package.json` enthält `"@types/node": "^16.11.6"`. Ein Upgrade auf `^20` ist empfohlen, da Node 16 End-of-Life ist. Dies ist ein potenzieller **Breaking Change** – nach dem Upgrade sollte `tsc --noEmit` ausgeführt werden, um Typkonflikte zu prüfen.

> **Hinweis `@types/turndown`:** Wird benötigt, sobald `turndown` in T-02.4 installiert wird. Ohne dieses Paket fehlen TypeScript-Typen für `TurndownService`.

---

## 4. Fehlerbehandlung

| Szenario                              | Verhalten |
|---------------------------------------|-----------|
| Verbindung schlägt fehl               | `Notice` mit Fehlermeldung, kein Absturz |
| Verbindungs-Timeout (30 s)            | `socketTimeout` in ImapFlow wirft Exception; wird wie Verbindungsfehler behandelt (F-50) |
| Eine Mail kann nicht geparst werden   | Übersprungen, gezählt in `skipped` (kein Schreibversuch); nächste Mail wird versucht (F-49) |
| Vault-Schreibfehler                   | Bereits geschriebene Anhänge dieser Mail werden best-effort gelöscht; kein `markAsSeen`; gezählt in `failed`; Fehler in `Notice` (F-49) |
| Netzwerkabbruch während Sync          | `disconnect()` läuft im `finally`; bereits importierte Mails bleiben; Rest beim nächsten Lauf (F-48) |
| Sync läuft bereits                    | Neuer Trigger wird ignoriert (`isSyncing`-Guard) |
| `testConnection()` während Sync       | Wird durch denselben `isSyncing`-Guard blockiert (F-52) |
| Passwort/Host fehlt in Settings       | Frühzeitiger Abbruch mit `Notice`: „Bitte IMAP-Einstellungen konfigurieren" |

---

## 5. Dateistruktur im Vault (Beispiel)

```
Vault/
└── Emails/                              ← importFolder (konfigurierbar)
    ├── 2025-05-10 09-15 Rechnung.md
    ├── 2025-05-10 09-15 Rechnung (2).md ← Duplikat (gleicher Betreff, gleiche Minute)
    ├── 2025-05-10 14-30 Newsletter.md
    └── attachments/
        ├── 2025-05-10 09-15 Rechnung/
        │   ├── rechnung.pdf
        │   └── logo_cid_abc123.png
        └── 2025-05-10 14-30 Newsletter/
            └── banner.jpg
```

---

## 6. esbuild-Konfiguration

`imapflow` und `mailparser` nutzen Node.js-Built-ins (`net`, `tls`, `dns`, `stream` u.a.). Diese müssen als **external** markiert werden, da Electron sie nativ bereitstellt.

Das bestehende `esbuild.config.mjs` verwendet bereits `...builtinModules` aus `node:module`. Damit werden **automatisch alle Node.js-Built-in-Module** als external markiert – eine manuelle Auflistung einzelner Module (`net`, `tls`, `dns`, …) ist **nicht nötig** und sollte vermieden werden, da `builtinModules` die vollständige und stets aktuelle Liste enthält.

`electron` ist **kein** Node.js-Built-in und muss daher **explizit** in der `external`-Liste stehen (bereits vorhanden):

```javascript
// esbuild.config.mjs (relevanter Ausschnitt)
import { builtinModules } from 'node:module';

external: [
  'obsidian',
  'electron',          // explizit: kein Node.js-Built-in, aber von Electron bereitgestellt
  '@codemirror/...',   // Obsidian-interne Pakete
  // ...
  ...builtinModules,   // deckt alle Node.js-Built-ins ab (net, tls, dns, stream, crypto, …)
                       // KEINE manuelle Liste nötig
]
```

> **Fazit:** Die aktuelle `esbuild.config.mjs` ist bereits korrekt konfiguriert. T-03.1 erfordert keine Änderungen – nur eine Verifikation, dass `...builtinModules` und `electron` vorhanden sind.

---

## 7. Korrektheitseigenschaften

*Eine Eigenschaft (Property) ist eine Charakteristik oder ein Verhalten, das für alle gültigen Ausführungen eines Systems gelten soll. Eigenschaften dienen als Brücke zwischen menschenlesbaren Spezifikationen und maschinell verifizierbaren Korrektheitsnachweisen.*

Die folgenden Eigenschaften eignen sich für Property-Based Testing, da sie reine Funktionen betreffen. Empfohlene Bibliothek: [`fast-check`](https://fast-check.dev/) (TypeScript-nativ).

---

### Eigenschaft 1: `sanitizeFilename` – Keine verbotenen Zeichen in der Ausgabe

*Für jeden* beliebigen String als Eingabe darf die Ausgabe von `sanitizeFilename` keines der verbotenen Zeichen enthalten: `/ \ : * ? " < > |`

**Validiert: F-23, F-45**

---

### Eigenschaft 2: `sanitizeFilename` – Idempotenz

*Für jeden* beliebigen String `s` gilt: `sanitizeFilename(sanitizeFilename(s)) === sanitizeFilename(s)`. Zweimaliges Bereinigen liefert dasselbe Ergebnis wie einmaliges Bereinigen.

**Validiert: F-23, F-45**

---

### Eigenschaft 3: `truncateFilename` – Ausgabe überschreitet nie 200 Zeichen

*Für jeden* beliebigen String als Eingabe gilt: `truncateFilename(s).length <= 200`

**Validiert: F-41**

---

### Eigenschaft 4: `truncateFilename` – Keine Kürzung mitten im Wort

*Für jeden* String, der länger als 200 Zeichen ist und mindestens ein Leerzeichen vor Position 200 enthält, gilt: Die Ausgabe von `truncateFilename` endet an einer Wortgrenze.

**Validiert: F-41**

---

### Eigenschaft 5: `resolveUniqueFilename` – Rückgabe existiert noch nicht

*Für jede* Kombination aus Basisname und Menge bereits existierender Dateinamen (gemockte Vault-Existenzprüfung) gibt `resolveUniqueFilename` immer einen Dateinamen zurück, der **nicht** in der Menge der existierenden Namen enthalten ist.

**Validiert: F-24, F-46**

---

### Eigenschaft 6: `parseRawMail` – Keine unkontrollierten Exceptions

*Für jeden* beliebigen `Buffer` (zufällige Bytes, leerer Buffer, sehr großer Buffer) wirft `parseRawMail` niemals eine unbehandelte Exception. Die Funktion gibt entweder ein gültiges `ParsedMail`-Objekt zurück oder signalisiert einen definierten Fehler (`Promise.reject` mit einem `Error`-Objekt).

**Validiert: F-15**

---

### Teststrategie

**Dualer Ansatz:**
- **Unit-Tests**: Spezifische Beispiele, Randfälle und Fehlerbedingungen.
- **Property-Tests**: Universelle Eigenschaften über alle Eingaben (Eigenschaften 1–6 oben).

**Property-Test-Konfiguration:**
- Mindestens **100 Iterationen** pro Property-Test (Standard bei `fast-check`).
- Tag-Format: `// Feature: obsidian-mail-importer, Eigenschaft {N}: {Eigenschaftstext}`

**Nicht für Property-Based Testing geeignet:**
- IMAP-Verbindungsaufbau (externe Infrastruktur)
- Vault-Schreiboperationen (Obsidian-API, I/O-gebunden) → Mock-basierte Unit-Tests
- UI-Elemente (Ribbon, StatusBar, SettingTab) → manuelle Tests
