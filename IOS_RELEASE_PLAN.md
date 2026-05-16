# iOS Release Plan

## Current App

- Repository: `pastadeteatime-blip/ev-tracker`
- App type: static HTML/CSS/JavaScript
- Main files: `index.html`, `app.js`, `style.css`, `machines.js`
- Storage: browser `localStorage`
- Network dependency: none found

## Recommended Path

Use Capacitor to package the existing web app as an iOS app.

This keeps the current codebase mostly intact while adding an Xcode project for App Store submission.

## Why Capacitor

- Works well with existing HTML/CSS/JavaScript apps.
- Lets the web app run inside an iOS WebView.
- Allows future native features if needed.
- Lower rewrite cost than Swift or React Native.

## Release Workstream

1. Stabilize the web app for mobile Safari and iOS WebView.
2. Add app metadata: manifest, app name, icons, splash assets, status bar color.
3. Install Node.js LTS so `npm` and `npx` are available on the Mac.
4. Add Capacitor configuration and generate the iOS project.
5. Test on local browser, iOS Simulator, then a real iPhone.
6. Create Apple Developer account and App Store Connect app record.
7. Prepare privacy details, screenshots, description, keywords, support URL, and review notes.
8. Archive in Xcode and submit to App Store review.

## App Store Notes

Apple may reject apps that are only a thin web wrapper with little app-like functionality. The app should feel useful as an installed app, work reliably on iPhone, preserve user data, and provide a clear purpose beyond opening a website.

## Immediate Checklist

- [x] Connect Codex to GitHub.
- [x] Clone repository locally.
- [x] Add web app manifest.
- [x] Add service worker cache shell.
- [x] Add Capacitor package files.
- [x] Generate iOS project.
- [x] Verify layout on iPhone viewport.
- [x] Add export/backup path for local data.
- [x] Verify Debug and Release simulator builds.
- [ ] Add final affiliate links and confirm App Store privacy disclosure.
- [x] Install Node.js and verify `npm --version`.
- [x] Draft App Store Connect metadata.
- [x] Decide no subscription for first release.
- [ ] Select Apple Developer Team in Xcode Signing & Capabilities.
- [ ] Verify App Store archive signing.
- [ ] Prepare App Store assets and metadata.
