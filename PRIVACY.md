# Privacy

Tendril is for people whose information is sensitive: hormone doses, lab results, photos of a changing body, a journal, a new name. This page says exactly what Tendril keeps, where, and what leaves your device. For how that data is protected, see [SECURITY.md](SECURITY.md).

**In short:** everything you enter stays on your device, in your browser's own storage. Tendril has no server, no account, no analytics, no ads and no trackers. Nobody, including the people who make Tendril, can see your data.

## What Tendril keeps

Everything below is stored only in the browser on your device, under the address you opened Tendril from.

| What | Where on your device | Kept until |
|---|---|---|
| Journal entries, moods, tags and milestones | Browser storage (localStorage) | You delete them, or erase everything |
| Progress photos: a full image and a small copy of each | Browser database (IndexedDB) | You delete the photo or its entry |
| Voice recordings you choose to keep, and summaries of your practice sessions (average pitch, time in range) | Browser database and browser storage | You delete the session or clear your history |
| Medications, logged doses and injection sites | Browser storage | You delete them |
| Lab results and the target ranges you enter | Browser storage | You delete them |
| Appointments | Browser storage | You delete them |
| Body measurements | Browser storage | You delete them |
| Euphoria jar moments, coming-out drafts, name shortlist, kind words you add | Browser storage | You delete them |
| Trusted people's names and phone numbers in hard day mode | Browser storage | You remove them |
| Settings: target ranges, home screen layout, units, when you last made a backup | Browser storage | You change them, or erase everything |

**Photos** are redrawn when you add them, which removes their location and camera details. Photos taken in Tendril don't go to your phone's gallery.

**Your microphone** is only used while you practise or play. The audio is analysed on your device and never uploaded. If you turn off "Save the audio", nothing is recorded at all.

## What leaves your device

Nothing you enter is ever sent anywhere by Tendril. The only times anything goes over the internet:

- **Opening and updating the app.** Your device downloads Tendril's files from GitHub Pages, where it's hosted. Like any website, GitHub's servers see your IP address when that happens; see [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). After the first visit the app works offline and only checks for updates. Fonts are built in, so no font services are contacted.
- **Links you choose to open,** such as a support line's website in hard day mode. Those open in your browser and are ordinary visits to that site.
- **Calls and messages you start** from hard day mode go through your phone's own phone and messaging apps.
- **Read aloud** on the Names page uses your device's text-to-speech voice. Some browsers use online voices for some languages, which can send the sentence being read to the voice provider (for example Google). If that matters to you, don't use read aloud.
- **Calendar reminders** you add are downloaded as a file, which your calendar app then keeps and may sync. Calendars aren't private like Tendril, which is why Tendril suggests a neutral event name.
- **Backups** are files you download and keep yourself. Where they go after that is up to you.

## Deleting

- Delete any single entry, photo, recording, measurement or moment from where it appears.
- **Your data → Delete everything** erases all of Tendril's data on this device: storage, photos and recordings.
- Uninstalling the app, or clearing this site's data in your browser settings, also erases it.
- Backups you downloaded are copies outside Tendril's reach. Delete them yourself if you no longer want them.

There's no copy anywhere else, so deleted data can't be recovered unless you have a backup.

## Quick exit

On a keyboard, pressing **Esc** twice leaves Tendril for a weather search and replaces Tendril in the browser's history, so the Back button doesn't return to it.

## Changes

If Tendril ever changes what it keeps or sends, this page will say so first. It will never add analytics, ads or tracking.
