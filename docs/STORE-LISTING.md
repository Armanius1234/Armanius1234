# Store listing pack (App Store + Google Play)

Draft texts and answers for the store forms, based on what the app **actually
does today**. Fill in the parts marked **[YOU]**.

> **Review needed before submission.** The privacy answers (sections 4 and 5)
> must match the final privacy policy. Have them checked together with
> `docs/PRIVACY-NOTES.md`.

---

## 1. Basics

| Field | Value |
|---|---|
| App name | **PL8** |
| Category | Social Networking (Apple) / Social (Google); secondary: Lifestyle |
| Price | Free, no in-app purchases |
| Age | **18+** (PL8's own rule; sign-up requires confirming 18+) |
| Languages | German, English |
| Support URL / email | **[YOU]**: needs the company domain |
| Privacy policy URL | **[YOU]**: lawyer-reviewed text on your website |
| Account deletion URL (Google requires a web page too) | **[YOU]**: a simple page explaining in-app deletion, plus an email for people who no longer have the app |

## 2. Texts: German

**Untertitel (Apple, max. 30):** Dein Auto. Deine Geschichte.

**Kurzbeschreibung (Google, max. 80):**
Die Auto-Community: Kennzeichen verifizieren, Autos zeigen, Leute vernetzen.

**Werbetext (Apple, max. 170):**
Verifiziere dein Kennzeichen, zeig deine Garage und lerne die Menschen hinter den Autos kennen. Kennzeichen sind nur auffindbar, wenn der Besitzer zustimmt.

**Keywords (Apple, max. 100):**
Auto,Autos,Kennzeichen,Nummernschild,Autoszene,Tuning,Treffen,Garage,Car Spotting,Autofotos

**Beschreibung:**

> Jedes Auto hat eine Geschichte. PL8 bringt sie zusammen.
>
> **Dein Kennzeichen, verifiziert**
> Füge dein Auto zu deiner Garage hinzu und verifiziere dein Kennzeichen mit
> Live-Fotos. Ein Mensch aus dem PL8-Team prüft jede Anfrage. Ob dein
> Kennzeichen in der PL8 Suche gefunden werden kann, entscheidest nur du – und
> ob dabei dein Profil angezeigt wird, auch.
>
> **Gesehen? Gesucht? Gefunden.**
> Ein Auto auf der Straße gesehen? Gib das Kennzeichen in die PL8 Suche ein. Hat
> der Besitzer es freigegeben, siehst du das Auto und kannst ihm schreiben.
>
> **Deine Garage und deine Beiträge**
> Zeig deine Autos mit Fotos und Details, teile Beiträge, folge anderen,
> kommentiere und speichere, was dir gefällt. Finde Leute und Autos nach Name,
> Marke oder Modell und erwähne Freunde mit @.
>
> **Nachrichten mit Anfragen**
> Fremde schicken zuerst eine Anfrage, die du annehmen oder ablehnen kannst. Du
> bestimmst, wer dir schreiben darf.
>
> **Sicher und fair**
> Blockieren und Melden mit einem Fingertipp, echte Menschen in der Moderation,
> Einspruch gegen Entscheidungen, private Profile, Daten-Download und
> Konto-Löschung direkt in der App.
>
> PL8 ist für Erwachsene ab 18 Jahren.

## 3. Texts: English

**Subtitle (Apple, max. 30):** Every car has a story.

**Short description (Google, max. 80):**
Verify your plate, show your car, meet the people behind the cars you spot.

**Promotional text (Apple, max. 170):**
Claim and verify your license plate, show your garage, and connect with the people behind the cars you spot. Plates are only findable if the owner says yes.

**Keywords (Apple, max. 100):**
car,cars,license plate,number plate,car community,car meet,tuning,garage,car spotting,car photos

**Description:**

> Every car has a story. PL8 brings them together.
>
> **Your plate, verified**
> Add your car to your garage and verify your license plate with live photos.
> A person on the PL8 team reviews every request. Only you decide whether your
> plate can be found in PL8 Search, and whether your profile is shown with it.
>
> **Seen it? Search it. Connect.**
> Spotted a car on the road? Enter the plate in PL8 Search. If the owner has
> made it findable, you see the car and can send them a message.
>
> **Your garage and your posts**
> Show your cars with photos and details, share posts, follow others, comment
> and save what you like. Find people and cars by name, make or model, and
> mention friends with @.
>
> **Messages with requests**
> Strangers first send a request you can accept or decline. You choose who may
> message you.
>
> **Safe and fair**
> Block and report in one tap, real people in moderation, appeals against
> decisions, private profiles, and data download and account deletion right in
> the app.
>
> PL8 is for adults aged 18 and over.

## 4. Apple "App Privacy" answers (draft)

- **Tracking:** No. There is no tracking across other companies' apps or
  websites, no advertising SDKs and no analytics SDKs.
- **Data collected and linked to the user, used only for app functionality:**

| Apple data type | What it is in PL8 |
|---|---|
| Contact Info → Email Address | login |
| Contact Info → Name | display name (may be a real name) |
| User Content → Photos or Videos | profile picture, car photos, post photos, verification photos (deleted after the decision) |
| User Content → Other User Content | posts, comments, reports, appeals, bio |
| User Content → Emails or Text Messages | direct messages between members |
| Identifiers → User ID | account ID, username |
| Other Data | cars, license plates (only findable with consent), settings |

- **Not collected:**
  - location
  - contacts
  - health and fitness
  - financial info
  - browsing and search history (plate searches are stored only as a
    30-day hashed log for abuse prevention, not linked to any profile)
  - usage data and analytics
  - diagnostics
  - purchases
- **To confirm with your adviser:**
  - whether the push token must be declared as "Device ID"
  - whether the hashed search log counts as "Search History"

## 5. Google Play "Data safety" answers (draft)

- **Data shared with third parties:** none. Supabase and Expo are service
  providers working for you; Google does not count that as sharing.
- **Data collected:**
  - Personal info: name, email address, user IDs
  - Photos and videos: photos
  - Messages: other in-app messages
  - App activity: other user-generated content; in-app actions (likes,
    follows, saves)
  - Device or other IDs: push token **(confirm)**
- **Purpose of every item:** App functionality and account management. None
  is used for advertising or analytics.
- **Encrypted in transit:** Yes (HTTPS).
- **Users can request deletion:** Yes. In the app (Settings → Delete
  account), plus the **web page [YOU]** that Google requires.
- **Required or optional:**
  - Required: email and the account ID.
  - Optional: photos, posts, messages and plates. People choose to add them.

## 6. Age rating questionnaires

- **Both stores:** say **yes** to user-generated content and to user-to-user
  communication.
- **Moderation tools to mention:** report and block on every profile, post,
  comment, message and car; human moderation; appeals.
- PL8 is set to **18+** in both stores.
- **Location sharing:** none.
- **Gambling, violence, sexual content and drugs:** none as part of the app.
  User content is moderated.

## 7. Notes for Apple App Review

- **[YOU]** Create a **demo account** (email and password) with a verified
  car, and give it to Apple. Apple can't receive a verification email or
  live-photo check.
- Explain in the notes:
  - "License plates are only searchable after the owner opts in; verification
    is reviewed by humans."
  - "Users can report and block from every content type; reports are reviewed
    in an internal moderation queue; decisions can be appealed in-app."
  - "Account deletion: Settings → Delete account."
- If Sign in with Apple is switched on, revoking the Apple sign-in on account
  deletion must be built first (docs/SOCIAL-LOGIN-SETUP.md).

## 8. Screenshots and graphics

Take them from the installed beta build (docs/BETA-DEPLOYMENT.md). Suggested
order:

1. Home feed
2. Car profile with verified plate
3. PL8 Search with a result
4. Garage
5. Chat with a message request
6. Privacy settings ("who can find my plate")

Required sizes (check the consoles for the current list):

- **App Store:** iPhone 6.9" screenshots.
- **Google Play:** phone screenshots, a 512×512 icon (`assets/images/icon.png`
  is 1024×1024) and a 1024×500 feature graphic **[YOU / designer]**.

## 9. Checklist before pressing "Submit"

- [ ] Company founded, domain live, support email working
- [ ] Privacy policy, terms and imprint published (lawyer-reviewed)
- [ ] Account deletion web page live (Google)
- [ ] App ID (bundle identifier) chosen and set in the first build
- [ ] Apple Developer Program / Google Play Console accounts (**paid, needs your approval**)
- [ ] Demo account for Apple review
- [ ] Privacy answers above confirmed by your adviser
- [ ] Screenshots from the beta build
- [ ] If Apple sign-in is on: token revocation built
