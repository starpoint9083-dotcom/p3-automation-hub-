# K-YouTube Android + P3

## Purpose

K-YouTube Android is a small Android launcher for the existing K-YouTube Free web engine.
It receives YouTube links and shared YouTube URLs, then hands the exact URL to the web app through the `youtube` query parameter.

Production web engine:

- https://k-youtube-free-r0zsy7.v2.appdeploy.ai/

## V2 browser-gateway mode

V2 can also register as an Android browser gateway.
When the user chooses K-YouTube as the default browser for external links:

- YouTube URLs stay inside K-YouTube and are handed to the Korean-first web engine.
- Non-YouTube http/https URLs are immediately forwarded to Chrome when available.
- Samsung Internet is the second preferred fallback.
- Other installed browsers are used only if Chrome and Samsung Internet are unavailable.

This is designed to make external links from messaging apps, search results, email, and other apps enter K-YouTube first without turning K-YouTube into a general-purpose web browser.

## User flow

1. Tap an external web link or use Android Share.
2. If K-YouTube is configured as the default browser gateway, Android sends the link to K-YouTube first.
3. If the URL is YouTube, K-YouTube opens the existing web engine and passes the exact video URL automatically.
4. If the URL is not YouTube, K-YouTube forwards it to Chrome/Samsung Internet.
5. The K-YouTube web engine opens the official YouTube embed with Korean caption preference.

## Android limitation

YouTube owns and verifies its own `youtube.com` and `youtu.be` domains. A third-party app cannot publish YouTube's `assetlinks.json`, so K-YouTube cannot silently become the verified owner of those domains.

V2 avoids relying only on verified YouTube-domain ownership by offering the browser-gateway path. The user may choose K-YouTube as the Android default browser once, then normal external web links reach K-YouTube first. Non-YouTube links are forwarded to the real browser.

A link clicked from inside an already-open Chrome page can still stay inside Chrome because Chrome may treat that click as internal navigation instead of asking Android to resolve a new external app. This behavior cannot be forcibly overridden by a normal Android app without invasive accessibility/VPN-style interception.

The Share -> K-YouTube path remains available as a reliable fallback.

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

V2 package remains `com.kyoutube.free`, version `0.2.0` / versionCode `2`.
The current artifact is a debug APK for direct device testing. Because GitHub-hosted debug signing may change between clean CI runners, uninstalling the previous debug APK may be required before installing a newly built debug APK. A stable production signing key should be configured before normal in-place updates are distributed.
