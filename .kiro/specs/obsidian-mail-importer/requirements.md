# Requirements – Obsidian Email Importer Plugin

## 1. Überblick

Das Plugin ermöglicht es, E-Mails aus einem IMAP-Postfach direkt in einen Obsidian-Vault zu importieren. Neue (ungelesene) Mails werden als Markdown-Dateien gespeichert, Anhänge und Inline-Bilder werden lokal abgelegt und in der Markdown-Datei verlinkt.

---

## 2. Zielplattform

| Kriterium         | Wert                          |
|-------------------|-------------------------------|
| Plattform         | Obsidian Desktop (Electron)   |
| Mobile Support    | Nicht erforderlich            |
| Min. Obsidian     | 1.0.0                         |
| Sprache           | TypeScript                    |

---

## 3. Funktionale Anforderungen

### 3.1 IMAP-Verbindung

| ID    | Anforderung |
|-------|-------------|
| F-01  | Das Plugin stellt eine Verbindung zu einem IMAP-Server her. |
| F-02  | Unterstützte Sicherheitsprotokolle: SSL/TLS (Port 993) und STARTTLS (Port 143). |
| F-03  | Authentifizierung erfolgt per Benutzername und Passwort. |
| F-04  | Der zu überwachende Mailbox-Ordner ist konfigurierbar (Standard: `INBOX`). |
| F-05  | Die Verbindung wird nach jedem Sync-Vorgang sauber getrennt. |

### 3.2 Mail-Abruf

| ID    | Anforderung |
|-------|-------------|
| F-06  | Es werden ausschließlich **ungelesene** Mails abgerufen. |
| F-07  | Nach erfolgreichem Import wird jede Mail auf dem Server als **gelesen** (`\Seen`) markiert. |
| F-08  | Das Flag wird erst nach vollständigem, fehlerfreiem Schreiben aller Dateien gesetzt. |
| F-09  | Schlägt der Import einer Mail fehl, bleibt diese ungelesen und wird beim nächsten Sync erneut versucht. |

### 3.3 Synchronisierung

| ID    | Anforderung |
|-------|-------------|
| F-10  | Der Sync kann manuell über ein Ribbon-Icon ausgelöst werden. |
| F-11  | Der Sync kann manuell über die Command Palette ausgelöst werden. |
| F-12  | Ein konfigurierbares Intervall (in Minuten) ermöglicht automatische Synchronisierung. |
| F-13  | Ein Intervall von `0` deaktiviert den automatischen Sync. |
| F-14  | Läuft bereits ein Sync, wird ein neuer Auslöser (manuell oder timer) ignoriert. |

### 3.4 E-Mail-Parsing

| ID    | Anforderung |
|-------|-------------|
| F-15  | Der vollständige RFC 822 E-Mail-Inhalt wird geparst. |
| F-16  | Folgende Metadaten werden extrahiert: `From`, `To`, `CC`, `Date`, `Subject`, `Message-ID`. |
| F-17  | HTML-Body wird in Markdown konvertiert. |
| F-18  | Ist kein HTML-Body vorhanden, wird der Plaintext-Body verwendet. |
| F-19  | Ein Anhang wird als Inline-Bild behandelt, wenn **beide** Bedingungen erfüllt sind: (1) der Anhang besitzt eine Content-ID (CID) **und** (2) diese CID wird im HTML-Body als `<img src="cid:...">` referenziert. |
| F-20  | CID-Referenzen im konvertierten Markdown werden durch lokale Dateipfade ersetzt. |

### 3.5 Datei-Ablage

| ID    | Anforderung |
|-------|-------------|
| F-21  | Alle importierten Mails werden **flach** in einem konfigurierbaren Vault-Ordner abgelegt. |
| F-22  | Dateiname-Schema: `YYYY-MM-DD HH-mm <Betreff>.md` |
| F-23  | Sonderzeichen im Betreff (`/ \ : * ? " < > \|`) werden durch `-` ersetzt. |
| F-24  | Existiert bereits eine Datei mit gleichem Namen, wird ein Zähler angehängt: `(2)`, `(3)`, … |
| F-25  | Anhänge und Inline-Bilder werden in einem Unterordner `attachments/<Dateiname>/` gespeichert. |
| F-26  | Der Ablageordner für Mails ist in den Einstellungen konfigurierbar (Standard: `Emails`). |
| F-41  | Ist der bereinigte Betreff länger als 200 Zeichen, wird er auf 200 Zeichen gekürzt (Kürzung am letzten Wortende vor dem Limit, kein Abschneiden mitten im Wort). |
| F-42  | Trägt ein Anhang keinen Dateinamen, wird ein Fallback-Name vergeben: `attachment_1`, `attachment_2`, … (Zähler pro Mail, aufsteigend). |

### 3.6 Markdown-Format

| ID    | Anforderung |
|-------|-------------|
| F-27  | Jede importierte Mail beginnt mit einem YAML-Frontmatter-Block. |
| F-28  | Frontmatter enthält als Pflichtfelder: `date`, `from`, `to`, `cc`, `subject`, `messageId`, `attachments` (Liste). |
| F-29  | Inline-Bilder werden als Standard-Markdown-Bildlinks eingebettet: `![dateiname](pfad)`. |
| F-30  | Datei-Anhänge (nicht Inline-Bilder) werden am Ende der Notiz als Obsidian-Wiki-Links verlinkt: `[[pfad]]` (kein Embed). |
| F-43  | Enthält eine Mail kein gültiges Datum, wird der Import-Zeitpunkt als `date`-Wert verwendet. |
| F-44  | Externe Bild-URLs in HTML-Mails (`<img src="https://...">`) werden unverändert in das konvertierte Markdown übernommen (kein Download). |
| F-45  | Anhang-Dateinamen werden analog zu Mail-Dateinamen bereinigt (Sonderzeichen ersetzen, Windows-reservierte Namen wie `CON`, `PRN`, `AUX` vermeiden). |
| F-46  | Existieren zwei Anhänge mit gleichem (bereinigtem) Dateinamen in derselben Mail, wird ein Zähler angehängt: `bild (2).png`, `bild (3).png`, … |
| F-47  | Nach dem Bereinigen des Betreffs wird geprüft, ob der Dateiname leer ist; in diesem Fall wird `(kein Betreff)` als Dateiname verwendet. |
| F-48  | Bei einem Netzwerkabbruch während des Syncs werden bereits importierte Mails nicht rückgängig gemacht; der Rest wird beim nächsten Sync-Lauf verarbeitet. |
| F-51  | Das `date`-Feld im Frontmatter wird im ISO 8601 Format mit Zeitzone gespeichert (Beispiel: `2025-05-10T09:15:00+02:00`). |

### 3.7 Einstellungen

| ID    | Anforderung |
|-------|-------------|
| F-31  | IMAP-Host (Freitextfeld) |
| F-32  | IMAP-Port (Zahlenfeld, Standard: 993) |
| F-33  | Sicherheitsprotokoll: SSL/TLS oder STARTTLS (Auswahl) |
| F-34  | Benutzername (Freitextfeld) |
| F-35  | Passwort (Passwortfeld, Klartext-Speicherung in `data.json`) |
| F-36  | Mailbox-Ordner (Freitextfeld, Standard: `INBOX`) |
| F-37  | Import-Ordner im Vault (Freitextfeld, Standard: `Emails`) |
| F-38  | Sync-Intervall in Minuten (Zahlenfeld, Standard: `0`) |
| F-39  | „Verbindung testen"-Button mit Ergebnisanzeige |
| F-40  | „Jetzt synchronisieren"-Button in den Einstellungen |

### 3.8 Fehlerklassifikation

| ID    | Anforderung |
|-------|-------------|
| F-49  | Im `SyncResult` werden zwei Fehlerkategorien unterschieden: `failed` zählt Mails, bei denen ein Fehler beim Schreiben in den Vault aufgetreten ist (Schreibversuch hat stattgefunden); `skipped` zählt Mails, die aufgrund eines Parse-Fehlers nicht verarbeitet werden konnten (kein Schreibversuch). |
| F-52  | `testConnection()` darf nicht ausgeführt werden, während ein Sync-Vorgang läuft; der gleiche `isSyncing`-Guard wie bei manuellen Sync-Auslösern wird verwendet. |

### 3.9 Verbindungsverhalten

| ID    | Anforderung |
|-------|-------------|
| F-50  | Der IMAP-Verbindungsaufbau hat ein festes Timeout von 30 Sekunden (nicht konfigurierbar). Bei Überschreitung wird die Verbindung abgebrochen und ein Fehler gemeldet. |

---

## 4. Nicht-funktionale Anforderungen

| ID    | Anforderung |
|-------|-------------|
| NF-01 | Kein gleichzeitiger Sync-Vorgang (Mutex/Lock). |
| NF-02 | Fehler werden per `Notice` in der Obsidian-UI angezeigt. |
| NF-03 | Fortschritt wird in der Statusleiste angezeigt (`Synchronisiere…`, `5 Mails importiert`). |
| NF-04 | Alle Ressourcen (Timer, IMAP-Verbindungen) werden in `onunload()` freigegeben. |
| NF-05 | Passwörter werden nicht in Logs oder Notices ausgegeben. Der `imapflow`-Logger muss explizit deaktiviert werden (`logger: false`), um zu verhindern, dass Zugangsdaten in Konsolenausgaben erscheinen. |
| NF-06 | Das Plugin ist als `isDesktopOnly: true` deklariert. Die `manifest.json` muss die Felder `id: "obsidian-mail-importer"`, `name: "Email Importer"` und `isDesktopOnly: true` enthalten. |
| NF-07 | E-Mails werden vollständig als `Buffer` in den Arbeitsspeicher geladen (kein Streaming). Bei sehr großen Anhängen kann der RAM-Verbrauch entsprechend hoch sein – dies ist eine bewusste Designentscheidung zugunsten von Einfachheit. |
| NF-08 | Die Funktion `resolveUniqueFilename` prüft die Existenz einer Datei und schreibt sie anschließend in zwei getrennten Schritten (check-then-write). Eine Race Condition zwischen diesen Schritten ist theoretisch möglich, wird jedoch bewusst in Kauf genommen, da das Plugin ausschließlich für den Einzelbenutzer-Betrieb ausgelegt ist und keine parallelen Schreibzugriffe zu erwarten sind. |

---

## 5. Explizit ausgeschlossene Features (Out of Scope)

- Mobile-Unterstützung
- OAuth2-Authentifizierung
- Größenlimit für Anhänge
- Filterung nach Absender, Betreff o.ä.
- Ordnerstruktur nach Datum/Absender
- Verschlüsselte Passwort-Speicherung
- Bidirektionale Synchronisierung (Antworten aus Obsidian)
- SMTP/Senden von Mails
- Streaming-basierter Anhang-Download (bewusst nicht implementiert, siehe NF-07)
- Persistierung von UIDs / UIDVALIDITY zur serverübergreifenden Duplikaterkennung
- Download externer Bilder aus HTML-Mails
- Konfigurierbares IMAP-Verbindungs-Timeout (fixer Wert 30 s, siehe F-50)
