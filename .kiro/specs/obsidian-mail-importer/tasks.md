# Tasks – Obsidian Email Importer Plugin

## Legende
- `[ ]` Offen  
- `[x]` Erledigt  
- `[~]` In Arbeit  
- `[!]` Blockiert

Anforderungs-IDs aus `requirements.md` sind in eckigen Klammern referenziert.

---

## Phase 1 – Projektsetup

### T-01 Repository & Boilerplate
- [x] **T-01.1** Boilerplate-Dateien bereinigen: `src/main.ts` und `src/settings.ts` auf leere Plugin-Grundstruktur reduzieren (Sample-Code, SampleModal und Demo-Commands entfernen)
- [x] **T-01.2** `manifest.json` anpassen: `id: "obsidian-mail-importer"`, `name: "Email Importer"`, `description`, `author`, `isDesktopOnly: true` [NF-06]
- [x] **T-01.3** `package.json` anpassen: `name: "obsidian-mail-importer"`, Skripte prüfen
- [x] **T-01.4** Dev-Umgebung verifizieren: `npm run build` muss fehlerfrei durchlaufen

### T-02 Abhängigkeiten installieren
- [x] **T-02.1** `npm install imapflow` – IMAP-Client
- [x] **T-02.2** `npm install mailparser` – E-Mail-Parser
- [x] **T-02.3** `npm install turndown turndown-plugin-gfm` – HTML→Markdown
- [x] **T-02.4** `npm install --save-dev @types/turndown` – TypeScript-Typen für Turndown; `@types/node` von `^16` auf `^20` upgraden (**Breaking Change**: danach `tsc --noEmit` ausführen und Typkonflikte prüfen)

### T-03 Build-Konfiguration verifizieren
- [x] **T-03.1** `esbuild.config.mjs` prüfen: `...builtinModules` und `electron` müssen in der `external`-Liste vorhanden sein – keine manuelle Auflistung einzelner Node.js-Module nötig (bereits korrekt konfiguriert, nur Verifikation erforderlich)
- [x] **T-03.2** Testbuild durchführen: `npm run build` muss ohne Bundling-Fehler abschließen

### T-04 Projektstruktur anlegen
- [x] **T-04.1** Neue Quelldateien anlegen: `src/imap-client.ts`, `src/mail-parser.ts`, `src/file-writer.ts`, `src/sync-service.ts`, `src/scheduler.ts` (jeweils mit leerem Export als Platzhalter)

---

## Phase 2 – Settings

### T-05 Settings-Interface & Defaults
- [x] **T-05.1** `EmailImporterSettings`-Interface in `src/settings.ts` definieren: `host`, `port`, `security`, `username`, `password`, `mailbox`, `importFolder`, `intervalMinutes` [F-31–F-38]
- [x] **T-05.2** `DEFAULT_SETTINGS`-Objekt implementieren: `host: ''`, `port: 993`, `security: 'tls'`, `mailbox: 'INBOX'`, `importFolder: 'Emails'`, `intervalMinutes: 0`

### T-06 SettingTab implementieren
- [x] **T-06.1** Klasse `EmailImporterSettingTab extends PluginSettingTab` in `src/settings.ts` anlegen
- [x] **T-06.2** Abschnitt „IMAP-Verbindung": Felder für Host, Port, Sicherheit (Dropdown: SSL/TLS | STARTTLS), Benutzername, Passwort [F-31–F-35]
- [x] **T-06.3** „Verbindung testen"-Button mit inline Ergebnisanzeige (✓ grün / Fehlermeldung rot) [F-39]
- [x] **T-06.4** Abschnitt „Mailbox": Ordner-Feld [F-36]
- [x] **T-06.5** Abschnitt „Import": Vault-Ordner-Feld, Intervall-Feld (Minuten), „Jetzt synchronisieren"-Button [F-37, F-38, F-40]
- [x] **T-06.6** Alle Felder speichern Änderungen sofort via `plugin.saveSettings()`
- [x] **T-06.7** Intervall-Änderung ruft `scheduler.restart()` auf und registriert neuen Timer via `this.registerInterval()` [F-12, F-13]

---

## Phase 3 – IMAP-Client

### T-07 Grundverbindung
- [x] **T-07.1** Klasse `ImapClient` in `src/imap-client.ts` anlegen
- [x] **T-07.2** Konstruktor mit `EmailImporterSettings`-Parameter
- [x] **T-07.3** `connect()`-Methode: TLS → `{ secure: true, socketTimeout: 30000, logger: false }`; STARTTLS → `{ secure: false, tls: { starttls: 'required' }, socketTimeout: 30000, logger: false }` [F-01, F-02, F-03, F-50, NF-05]
- [x] **T-07.4** `disconnect()`-Methode: Verbindung sauber trennen [F-05]
- [x] **T-07.5** `testConnection()`-Methode: intern connect + NOOP + disconnect [F-39]

### T-08 Mail-Abruf
- [x] **T-08.1** `fetchUnseenMails()`-Methode: Mailbox-Lock holen, `search({ seen: false })`, `fetch(uids, { source: true, uid: true })` [F-04, F-06]
- [x] **T-08.2** Rückgabe als `RawMail[]` mit `{ uid: number, source: Buffer }`
- [x] **T-08.3** `markAsSeen(uid: number)`-Methode: UID als `\Seen` flaggen [F-07]

### T-09 Fehlerbehandlung IMAP
- [x] **T-09.1** Verbindungsfehler und Timeout-Fehler abfangen und als typisierte Fehler weiterwerfen [F-50]
- [x] **T-09.2** Mailbox-Lock in `finally`-Block freigeben (auch bei Fehler)
- [x] **T-09.3** Sicherstellen, dass Passwort nicht in Error-Messages oder Logs erscheint [NF-05]

---

## Phase 4 – Mail-Parser

### T-10 Grundparsing
- [x] **T-10.1** Funktion `parseRawMail(buffer: Buffer): Promise<ParsedMail>` in `src/mail-parser.ts` implementieren
- [x] **T-10.2** `simpleParser(buffer)` aus `mailparser` aufrufen
- [x] **T-10.3** Metadaten extrahieren: `from`, `to`, `cc`, `date`, `subject`, `messageId` [F-15, F-16]
- [x] **T-10.4** Fallbacks setzen: `date ?? new Date()` [F-43], `subject ?? "(kein Betreff)"` [F-47], `cc ?? ""`, `messageId ?? ""`

### T-11 Anhang-Verarbeitung
- [x] **T-11.1** Alle Attachments aus geparster Mail in `ParsedAttachment[]` überführen
- [x] **T-11.2** `isInline`-Logik implementieren: CID-Map aufbauen → HTML-Body mit Regex auf `<img src="cid:...">` durchsuchen → `isInline = cid !== undefined && referencedCids.has(cid)` [F-19]
- [x] **T-11.3** Anhänge ohne Dateinamen mit Fallback-Namen versehen: `attachment_1`, `attachment_2`, … (Zähler pro Mail) [F-42]

### T-12 HTML-zu-Markdown-Konvertierung
- [x] **T-12.1** `TurndownService` instanziieren: `headingStyle: 'atx'`, `codeBlockStyle: 'fenced'`, `bulletListMarker: '-'`
- [x] **T-12.2** GFM-Plugin (`turndown-plugin-gfm`) aktivieren für Tabellen-Support
- [x] **T-12.3** HTML-Body mit Turndown konvertieren [F-17]
- [x] **T-12.4** Fallback auf Plaintext-Body wenn kein HTML vorhanden [F-18]
- [x] **T-12.5** CID-Referenzen (`cid:abc123`) im Markdown unverändert als Platzhalter belassen – Auflösung erfolgt in `file-writer.ts` [F-20]
- [x] **T-12.6** Externe Bild-URLs (`https://...`) im Markdown unverändert übernehmen (kein Download) [F-44]

---

## Phase 5 – File-Writer

### T-13 Dateinamen-Logik
- [x] **T-13.1** `sanitizeFilename(input: string): string` implementieren: verbotene Zeichen (`/ \ : * ? " < > |`) durch `-` ersetzen; Windows-reservierte Namen (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) mit Suffix `-_` entschärfen [F-23, F-45]
- [x] **T-13.2** `truncateFilename(name: string, max = 200): string` implementieren: am letzten Leerzeichen vor Position 200 kürzen, nie mitten im Wort [F-41]
- [x] **T-13.3** `buildBaseFilename(mail: ParsedMail): string` implementieren: Schema `YYYY-MM-DD HH-mm <Betreff>`; leerer Betreff nach Sanitizing → `(kein Betreff)` [F-22, F-47]
- [x] **T-13.4** `resolveUniqueFilename(folder: string, base: string, ext: string): Promise<string>` mit Zähler-Logik: `base.ext` → `base (2).ext` → `base (3).ext` … [F-24]
- [x] **T-13.5** Gleiche `resolveUniqueFilename`-Logik für Anhang-Dateinamen verwenden [F-46]

### T-14 Ordner- und Dateierstellung
- [x] **T-14.1** `ensureFolder(path: string): Promise<void>` – Ordner per Vault-API anlegen falls nicht vorhanden [F-21, F-25]
- [x] **T-14.2** Anhang-Ordner-Pfad berechnen: `<importFolder>/attachments/<mailname>/`
- [x] **T-14.3** `writeAttachments(attachments, folderPath): Promise<Map<string, string>>` – Binärdaten per `vault.createBinary()` schreiben; Rückgabe: `cidToVaultPath`-Map [F-25]
- [x] **T-14.4** Dateinamen-Kollisionen bei Anhängen mit `resolveUniqueFilename` behandeln [F-46]

### T-15 Markdown-Generierung
- [x] **T-15.1** YAML-Frontmatter aufbauen mit allen Pflichtfeldern: `date` (ISO 8601 mit Zeitzone), `from`, `to`, `cc`, `subject`, `messageId`, `attachments` (Liste); syntaktisch korrektes YAML sicherstellen [F-27, F-28, F-51]
- [x] **T-15.2** `cid:abc123`-Platzhalter im Body durch finale Vault-Pfade aus `cidToVaultPath`-Map ersetzen [F-20]
- [x] **T-15.3** Ersetzte CID-Stellen als `![dateiname](pfad)` formulieren [F-29]
- [x] **T-15.4** Datei-Anhänge (nicht Inline-Bilder) als `[[pfad]]`-Wiki-Links am Dateiende anhängen [F-30]
- [x] **T-15.5** Gesamte Markdown-Datei per `vault.create()` schreiben

### T-16 Konsistenz & Cleanup
- [x] **T-16.1** Schreib-Reihenfolge einhalten: erst Anhänge schreiben, dann Markdown-Datei [F-08]
- [x] **T-16.2** Bei Fehler: bereits geschriebene Anhänge dieser Mail best-effort löschen; `markAsSeen()` wird nicht aufgerufen → Mail bleibt ungelesen [F-09]

---

## Phase 6 – Sync-Service

### T-17 Orchestrierungs-Logik
- [x] **T-17.1** Klasse `SyncService` in `src/sync-service.ts` anlegen
- [x] **T-17.2** `sync(): Promise<SyncResult>` implementieren [F-06, F-07, F-08, F-09]
- [x] **T-17.3** `imapClient.connect()` zu Beginn aufrufen; `disconnect()` im `finally`-Block [F-05, NF-04]
- [x] **T-17.4** Fortschritts-Callback nach jeder verarbeiteten Mail aufrufen [NF-03]
- [x] **T-17.5** Pro Mail: parse → write → markAsSeen (in dieser Reihenfolge) [F-08]
- [x] **T-17.6** Parse-Fehler abfangen: `skipped++`, Mail bleibt ungelesen, nächste Mail fortsetzen [F-49]
- [x] **T-17.7** Schreibfehler abfangen: `failed++`, Mail bleibt ungelesen, nächste Mail fortsetzen [F-09, F-49]
- [x] **T-17.8** `SyncResult` befüllen: `imported`, `failed`, `skipped`, `durationMs`, `errors`
- [x] **T-17.9** Netzwerkabbruch: bereits importierte Mails bleiben; Rest beim nächsten Lauf [F-48]

---

## Phase 7 – Scheduler

### T-18 Intervall-Verwaltung
- [x] **T-18.1** Klasse `SyncScheduler` in `src/scheduler.ts` implementieren
- [x] **T-18.2** `start(intervalMinutes, callback): number | null` – `window.setInterval` aufrufen, Timer-ID zurückgeben (damit `main.ts` via `this.registerInterval(id)` registrieren kann) [F-12, NF-04]
- [x] **T-18.3** `stop(): void` – `window.clearInterval(this.timerId)` aufrufen [NF-04]
- [x] **T-18.4** `restart(intervalMinutes, callback): number | null` – stop + start
- [x] **T-18.5** Intervall `0` → kein Timer setzen, `null` zurückgeben [F-13]

---

## Phase 8 – Plugin-Hauptdatei & UI

### T-19 main.ts fertigstellen
- [x] **T-19.1** `onload()`: Settings laden, `ImapClient`, `FileWriter`, `SyncService` initialisieren, UI registrieren, Scheduler starten und Timer via `this.registerInterval()` registrieren
- [x] **T-19.2** `onunload()`: Scheduler stoppen [NF-04]
- [x] **T-19.3** Ribbon-Icon (`mail`) mit `triggerSync()` verbinden [F-10]
- [x] **T-19.4** Command `email-importer:sync-now` registrieren [F-11]
- [x] **T-19.5** Status-Bar-Item erstellen und initialisieren [NF-03]

### T-20 Mutex & Feedback
- [x] **T-20.1** `isSyncing`-Guard implementieren: parallele Syncs und `testConnection()` während Sync verhindern [NF-01, F-14, F-52]
- [x] **T-20.2** Status-Bar während Sync aktualisieren: „Synchronisiere… (2/5)" [NF-03]
- [x] **T-20.3** `Notice` nach Sync: „5 Mails importiert" oder Fehlerzusammenfassung mit `failed`/`skipped`-Zähler [NF-02]
- [x] **T-20.4** `Notice` bei fehlenden Pflicht-Einstellungen (Host, Benutzername, Passwort leer) [NF-02]
- [x] **T-20.5** Letzten Sync-Zeitpunkt in Status-Bar anzeigen: „Letzter Sync: 14:30"

---

## Phase 9a – Automatisierte Tests (Vitest + fast-check)

### T-21a Test-Framework einrichten
- [x] **T-21a.1** `npm install --save-dev vitest fast-check` installieren
- [x] **T-21a.2** `vitest.config.ts` anlegen (environment: `node`, include: `src/**/*.test.ts`)
- [x] **T-21a.3** Test-Skript in `package.json` ergänzen: `"test": "vitest --run"`

### T-21b Unit-Tests: `sanitizeFilename`
- [x] **T-21b.1** Verbotene Zeichen (`/ \ : * ? " < > |`) werden durch `-` ersetzt [F-23]
- [x] **T-21b.2** Windows-reservierte Namen (`CON`, `PRN`, `NUL`, `COM1`, `LPT1`, …) werden entschärft [F-45]
- [x] **T-21b.3** Leere Eingabe bleibt leer; Eingabe ohne Sonderzeichen bleibt unverändert

### T-21c Unit-Tests: `truncateFilename`
- [x] **T-21c.1** String ≤ 200 Zeichen bleibt unverändert [F-41]
- [x] **T-21c.2** String > 200 Zeichen wird am letzten Wortende vor Position 200 gekürzt [F-41]
- [x] **T-21c.3** String ohne Leerzeichen vor Position 200 wird hart bei 200 Zeichen abgeschnitten

### T-21d Property-Tests: `sanitizeFilename` (Eigenschaften 1 & 2 aus design.md §7)
- [x] **T-21d.1** Eigenschaft 1: Für beliebige Strings enthält die Ausgabe keine verbotenen Zeichen (≥100 Iterationen)
- [x] **T-21d.2** Eigenschaft 2: Idempotenz – `sanitize(sanitize(s)) === sanitize(s)` für beliebige Strings (≥100 Iterationen)

### T-21e Property-Tests: `truncateFilename` (Eigenschaften 3 & 4 aus design.md §7)
- [x] **T-21e.1** Eigenschaft 3: Ausgabe ist immer ≤ 200 Zeichen für beliebige Strings (≥100 Iterationen)
- [x] **T-21e.2** Eigenschaft 4: Ausgabe endet an Wortgrenze wenn Leerzeichen vor Position 200 vorhanden (≥100 Iterationen)

### T-21f Property-Tests: `resolveUniqueFilename` (Eigenschaft 5 aus design.md §7)
- [x] **T-21f.1** Eigenschaft 5: Rückgabe ist nie in der Menge der existierenden Dateinamen (gemockte Vault-API, ≥100 Iterationen)

### T-21g Property-Tests: `parseRawMail` (Eigenschaft 6 aus design.md §7)
- [x] **T-21g.1** Eigenschaft 6: Für beliebige Buffer (zufällige Bytes, leer, groß) wirft `parseRawMail` keine unbehandelte Exception (≥100 Iterationen)

### T-21h Unit-Tests: Frontmatter & CID-Auflösung
- [x] **T-21h.1** Frontmatter enthält alle Pflichtfelder: `date`, `from`, `to`, `cc`, `subject`, `messageId`, `attachments` [F-28]
- [x] **T-21h.2** `date`-Feld ist im ISO 8601 Format mit Zeitzone [F-51]
- [x] **T-21h.3** CID-Auflösung: `isInline = true` nur wenn CID vorhanden UND im HTML referenziert [F-19]
- [x] **T-21h.4** CID-Auflösung: Anhang mit `contentDisposition: 'inline'` aber ohne HTML-Referenz → `isInline = false`

---

## Phase 9b – Manuelle Tests & Edge Cases

### T-22 Manuelle Integrationstests
- [ ] **T-22.1** Verbindungstest gegen echten IMAP-Server (TLS und STARTTLS)
- [ ] **T-22.2** Import einer reinen Text-Mail
- [ ] **T-22.3** Import einer HTML-Mail
- [ ] **T-22.4** Import einer Mail mit Datei-Anhang
- [ ] **T-22.5** Import einer HTML-Mail mit Inline-Bildern (CID)
- [ ] **T-22.6** Import einer Mail mit mehreren Anhängen unterschiedlicher Typen
- [ ] **T-22.7** Duplikat-Handling (zwei Mails mit gleichem Betreff in derselben Minute)
- [ ] **T-22.8** Verhalten bei Verbindungsabbruch während des Syncs [F-48]
- [ ] **T-22.9** Verhalten bei leerem Postfach
- [ ] **T-22.10** Automatischer Sync über Intervall verifizieren
- [ ] **T-22.11** Plugin deaktivieren/reaktivieren – kein Timer-Leak [NF-04]
- [ ] **T-22.12** Zweiter Sync-Trigger während laufendem Sync wird ignoriert [F-14, NF-01]
- [ ] **T-22.13** Netzwerkabbruch genau während `markAsSeen()`: Mail bleibt ungelesen, kein doppelter Import
- [ ] **T-22.14** `testConnection()` während laufendem Sync: wird blockiert [F-52]

### T-23 Edge Cases
- [ ] **T-23.1** Betreff mit Sonderzeichen (`/ : * ? < > |`) → korrekte Sanitization [F-23]
- [ ] **T-23.2** Betreff ist leer → Dateiname `YYYY-MM-DD HH-mm (kein Betreff).md` [F-47]
- [ ] **T-23.3** Betreff besteht nur aus Sonderzeichen (z.B. `//////`) → nach Sanitizing leer → Fallback [F-47]
- [ ] **T-23.4** Sehr langer Betreff (> 200 Zeichen) → Kürzen am letzten Wortende [F-41]
- [ ] **T-23.5** Anhang ohne Dateinamen → Fallback `attachment_1`, `attachment_2`, … [F-42]
- [ ] **T-23.6** Zwei Anhänge mit gleichem Dateinamen in einer Mail → Zähler-Suffix [F-46]
- [ ] **T-23.7** Mail ohne Body (nur Anhang) → leerer Markdown-Body, kein Fehler
- [ ] **T-23.8** Import-Ordner existiert noch nicht im Vault → wird angelegt [F-21]
- [ ] **T-23.9** Mail mit externen Bild-URLs (`<img src="https://...">`) → URL unverändert im Markdown [F-44]
- [ ] **T-23.10** Mail ohne gültiges Datum → Import-Zeitpunkt als Fallback [F-43]
- [ ] **T-23.11** Ungültige/gemischte Zeichencodierung (ISO-8859-1, kaputtes MIME) → kein Absturz
- [ ] **T-23.12** Windows-reservierter Dateiname als Betreff (`CON`, `PRN`, `NUL`, …) → entschärft [F-45]
- [ ] **T-23.13** Verbindungs-Timeout nach 30 Sekunden → Fehler-Notice, kein Absturz [F-50]

---

## Phase 10 – Finalisierung

### T-24 Dokumentation
- [x] **T-24.1** `README.md` schreiben: Installation, Konfiguration, Nutzung, Sicherheitshinweis (Passwort im Klartext)
- [x] **T-24.2** `CHANGELOG.md` anlegen

### T-25 Release-Vorbereitung
- [x] **T-25.1** Produktions-Build: `npm run build`
- [x] **T-25.2** Sicherstellen, dass `main.js`, `manifest.json`, `styles.css` im Build-Output vorhanden
- [ ] **T-25.3** Plugin-Ordner manuell in Test-Vault installieren und Smoke-Test durchführen

---

## Abhängigkeiten zwischen Tasks

```
T-01 → T-02 → T-03 → T-04
T-04 → T-05 → T-06
T-04 → T-07 → T-08 → T-09
T-04 → T-10 → T-11 → T-12
T-04 → T-13 → T-14 → T-15 → T-16
T-08, T-12, T-16 → T-17
T-04 → T-18          (Scheduler ist unabhängig vom SyncService)
T-05, T-17, T-18 → T-19 → T-20
T-13, T-10 → T-21a → T-21b → T-21c → T-21d → T-21e → T-21f → T-21g → T-21h
T-20 → T-22 → T-23
T-23 → T-24 → T-25
```
