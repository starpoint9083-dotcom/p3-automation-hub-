package com.kyoutube.free;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://k-youtube-free-r0zsy7.v2.appdeploy.ai/";
    private static final String APP_HOST = "k-youtube-free-r0zsy7.v2.appdeploy.ai";
    private static final Pattern SHARED_YOUTUBE_URL = Pattern.compile(
            "https?://(?:www\\.|m\\.|music\\.)?(?:youtube\\.com|youtu\\.be)/[^\\s]+",
            Pattern.CASE_INSENSITIVE
    );

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }
        });

        loadFromIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadFromIntent(intent);
    }

    private void loadFromIntent(Intent intent) {
        String youtubeUrl = extractIncomingYouTubeUrl(intent);
        if (youtubeUrl == null || youtubeUrl.isEmpty()) {
            webView.loadUrl(APP_URL);
            return;
        }

        String handoffUrl = APP_URL + "?youtube=" + Uri.encode(youtubeUrl);
        webView.loadUrl(handoffUrl);
    }

    private String extractIncomingYouTubeUrl(Intent intent) {
        if (intent == null) return null;

        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null && isYouTubeHost(data.getHost())) {
                return data.toString();
            }
        }

        if (Intent.ACTION_SEND.equals(action) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText == null) return null;

            String trimmed = sharedText.trim();
            try {
                Uri direct = Uri.parse(trimmed);
                if (isYouTubeHost(direct.getHost())) return trimmed;
            } catch (Exception ignored) {
                // Fall through to URL extraction from shared text.
            }

            Matcher matcher = SHARED_YOUTUBE_URL.matcher(sharedText);
            if (matcher.find()) return matcher.group();
        }

        return null;
    }

    private boolean isYouTubeHost(String host) {
        if (host == null) return false;
        String normalized = host.toLowerCase(Locale.ROOT);
        return normalized.equals("youtube.com")
                || normalized.equals("www.youtube.com")
                || normalized.equals("m.youtube.com")
                || normalized.equals("music.youtube.com")
                || normalized.equals("youtu.be");
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;

        String scheme = uri.getScheme();
        if ("intent".equalsIgnoreCase(scheme)) {
            try {
                Intent target = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                startActivity(target);
            } catch (ActivityNotFoundException missingApp) {
                openBrowserFallback(uri.toString());
            } catch (Exception ignored) {
                return true;
            }
            return true;
        }

        String host = uri.getHost();
        if (host != null && host.equalsIgnoreCase(APP_HOST)) return false;
        return false;
    }

    private void openBrowserFallback(String intentUrl) {
        try {
            Intent parsed = Intent.parseUri(intentUrl, Intent.URI_INTENT_SCHEME);
            String fallback = parsed.getStringExtra("browser_fallback_url");
            if (fallback != null) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
            }
        } catch (Exception ignored) {
            // Keep the K-YouTube screen open if no fallback is available.
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
