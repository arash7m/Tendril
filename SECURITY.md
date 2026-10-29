# Security

Tendril keeps sensitive information on your own device. This page covers what protects it, what it can't protect against, and how to report a problem. What Tendril keeps and what leaves your device is in [PRIVACY.md](PRIVACY.md).

## Reporting a vulnerability

Please report it privately: on this repository's **Security** tab, choose **Report a vulnerability**. Don't open a public issue for it.

Please never include anyone's real personal or health information in a report.

## What protects your data

- **No server.** Tendril is static files. There's no account, database or backend to break into, and no copy of anyone's data exists outside their own device.
- **App lock (optional).** With a PIN set on the Your data page:
  - All app data, photos and recordings are encrypted on the device with AES-GCM, using a key made from your PIN with PBKDF2 (SHA-256, 600,000 iterations). Nothing readable is left in storage.
  - After unlocking, the key is kept only for the current session, so moving between pages doesn't ask again. Leaving the app starts a timer you choose (right away, 1 or 5 minutes), and coming back after it runs out locks again.
  - Five wrong PINs add a growing wait before the next try.
- **Encrypted backups (optional).** A backup made with a password is encrypted with AES-GCM, using a key made with PBKDF2 (SHA-256, 250,000 iterations).
- **Photos lose their metadata.** Location and camera details are removed when a photo is added.
- **No third-party code.** No analytics, ads, trackers, CDNs or font services. Everything Tendril runs is in this repository.
- **Discreet mode** covers sensitive cards on the home screen until they're tapped, for when someone might see your screen.

## What it can't protect against

- **A forgotten PIN can't be recovered.** The data is encrypted with it, so nobody can unlock it. The lock screen offers to erase everything and start over; restore a backup afterwards if you have one.
- **A short PIN is weak against special tools.** The lock keeps out people who pick up your phone, but someone who copies the browser's files could try every short PIN. Use 6 or more digits if that's a worry.
- **An unlocked, unattended phone.** While Tendril is unlocked, anyone holding the phone can see it. Lock your phone, and set Tendril's lock timer to "right away" if needed.
- **A compromised device.** Malware or someone with full control of your phone can see what you see.
- **Backups without a password** are readable by anyone who gets the file.

## Supported versions

Only the latest version is supported. The installed app shows an **Update** button when a new version is out.
