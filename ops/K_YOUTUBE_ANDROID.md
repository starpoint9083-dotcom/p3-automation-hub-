# K-YouTube Android + P3

## Purpose

K-YouTube Android is a small Android launcher for the existing K-YouTube Free web engine.
It receives YouTube links and shared YouTube URLs, then hands the exact URL to the web app through the `youtube` query parameter.

Production web engine:

- https://k-youtube-free-r0zsy7.v2.appdeploy.ai/

## User flow

1. Tap a YouTube link or use Android Share.
2. Choose K-YouTube when Android offers an app choice.
3. K-YouTube opens the existing web engine and passes the video URL automatically.
4. The web engine opens the official YouTube embed with Korean caption preference.
5. If needed, use the in-app control to open the original YouTube app.

## Android default-link limitation

YouTube owns and verifies its own `youtube.com` and `youtu.be` domains. A third-party app cannot publish YouTube's `assetlinks.json`, so K-YouTube cannot silently become a verified owner of those domains.

On Android/Samsung devices the user may need to change app defaults once:

- Disable automatic supported-link handling for the official YouTube app if it always takes the link first.
- Enable supported-link handling for K-YouTube when Android exposes that option.
- The Share -> K-YouTube path remains available even when domain verification prevents automatic takeover.

This is an Android platform/domain-ownership restriction, not a P3 or K-YouTube failure.

## Safety and cost policy

- Existing AppDeploy production app must not be deleted, renamed, or replaced automatically.
- No paid translation API.
- No paid dubbing API.
- No paid TTS API.
- Android wrapper has no secret or paid API key.
- P3 builds the APK and verifies build output; web availability remains supervised by the existing K-YouTube supervisor.

## Build

GitHub Actions workflow: `P3 K-YouTube Android APK`

Expected artifact: `k-youtube-free-debug-apk`

The initial artifact is a debug APK for direct device testing. A production-signed APK/AAB can be added after the link flow is validated on the target Android device.
