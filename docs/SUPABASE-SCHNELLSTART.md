# Supabase für PL8 einrichten: Schnellstart (ca. 15 Minuten, kostenlos)

Supabase ist der Server hinter PL8: Konten, Datenbank und Fotos. Danach hast du
die zwei Werte, nach denen PL8 fragt: **Project URL** und **Publishable Key**.

Die Namen der Menüpunkte bei Supabase können leicht abweichen.

## 1. Konto und Projekt anlegen

1. Öffne <https://supabase.com> und klicke **Start your project**. Melde dich
   an, am einfachsten mit **Continue with GitHub**.
2. Klicke **New project** und fülle aus:
   - **Organization:** wird beim ersten Mal angelegt. Plan: **Free**.
   - **Project name:** `pl8`
   - **Database Password:** auf **Generate a password** klicken und das
     Passwort in deinem Passwort-Manager speichern. PL8 braucht es nicht, aber
     du solltest es haben.
   - **Region:** **Central EU (Frankfurt)**. So bleiben die Daten in der EU.
3. Klicke **Create new project** und warte etwa 2 Minuten.

**Kosten:** 0 €. Nichts upgraden und keinen bezahlten Plan wählen.

## 2. Die zwei Werte finden

**Weg A:** Oben auf der Projektseite auf **Connect** klicken. Dort stehen beide
Werte.

**Weg B:** Links unten das Zahnrad **Project Settings**:

| Wert | Wo | Sieht so aus |
|---|---|---|
| **Project URL** | Project Settings → **Data API** | `https://abcdefghijkl.supabase.co` |
| **Publishable Key** | Project Settings → **API Keys** | beginnt mit `sb_publishable_…` |

Siehst du bei den API Keys nur **anon** und **service_role**? Dann ist **anon**
der richtige.

⚠️ **Niemals** den Key **secret** oder **service_role** verwenden. PL8 lehnt ihn
ab.

## 3. Datenbank einrichten (einmal)

1. Links **Database → Extensions**: nach **pg_net** suchen und einschalten.
   Danach **pg_cron** suchen und einschalten.
2. Links **SQL Editor** → **New query**.
3. Öffne die Datei **`PL8-Datenbank-komplett.sql`** mit dem Editor, nicht mit
   Doppelklick in einem anderen Programm.
4. **Strg+A** (alles markieren), **Strg+C** (kopieren), im SQL Editor **Strg+V**
   (einfügen).
5. Unten rechts **Run** klicken. Fragt Supabase vorher nach einer Bestätigung,
   bestätige sie.
6. Erwartet: **„Success. No rows returned“**.

Die Datei nur **einmal** und nur in einem **neuen** Projekt ausführen.

## 4. Anmelden mit 6-stelligem Code einstellen

PL8 schickt bei der Registrierung einen Code statt eines Links.

1. **Authentication → Sign In / Providers → Email:**
   - **Confirm email:** an
   - **Minimum password length:** `10`
   - **Save**
2. **Authentication → Emails → Templates** (manchmal: *Email Templates*).
   Ersetze zwei Vorlagen und speichere jede:

   **Confirm signup**: Betreff `Your PL8 code`, Inhalt:

   ```html
   <h2>Welcome to PL8</h2>
   <p>Your confirmation code is:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>Enter it in the PL8 app. If you did not sign up, ignore this email.</p>
   ```

   **Reset password**: Betreff `Your PL8 password reset code`, Inhalt:

   ```html
   <h2>Reset your PL8 password</h2>
   <p>Your reset code is:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>If you did not ask for this, ignore this email. Your password stays the same.</p>
   ```

## 5. In PL8 eintragen

- **Auf deinem PC:** „PL8 starten.bat“ starten. Das Formular erscheint. Trag
  **Project URL** und **Publishable Key** ein und klicke **Verbinden**.
- **Auf deiner Website:** oben in `index.html` im Block **„PL8TE SETTINGS“**.
- **In der Handy-App (Expo Go):** in die Datei `.env` (siehe README).

## 6. Optional: dich zum Admin machen

Erst in PL8 registrieren. Dann im **SQL Editor** ausführen und dabei deine
E-Mail eintragen:

```sql
insert into private.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'DEINE-EMAIL@example.com';
```

Danach die Seite neu laden. Unter **Einstellungen → Admin** prüfst du
Kennzeichen-Verifizierungen.

## Gut zu wissen

- **Test-E-Mails:** Supabase verschickt die Bestätigungs-E-Mails nur an Adressen
  aus deinem Supabase-Team, und nur wenige pro Stunde. Deine eigene Adresse
  funktioniert. Für eine zweite Test-Adresse lädst du sie unter
  **Organization → Team** ein.
- **Pause:** Ein kostenloses Projekt pausiert nach 7 Tagen ohne Nutzung. Dann
  im Dashboard auf **Restore** klicken. Es geht nichts verloren.
- **Backups:** Der kostenlose Plan hat keine automatischen Backups. Noch keine
  echten Nutzerdaten speichern.
- Die ausführliche englische Anleitung steht in `docs/SUPABASE-SETUP.md`.
