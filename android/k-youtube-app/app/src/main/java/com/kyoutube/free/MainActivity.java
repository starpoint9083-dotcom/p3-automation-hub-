package com.kyoutube.free;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://k-youtube-free-r0zsy7.v2.appdeploy.ai/";
    private static final String APP_HOST = "k-youtube-free-r0zsy7.v2.appdeploy.ai";
    private static final String CHROME_PACKAGE = "com.android.chrome";
    private static final String SAMSUNG_BROWSER_PACKAGE = "com.sec.android.app.sbrowser";
    private static final int REQUEST_RECORD_AUDIO = 5201;
    private static final int REQUEST_MEDIA_PROJECTION = 5202;
    private static final Pattern SHARED_YOUTUBE_URL = Pattern.compile(
            "https?://(?:www\\.|m\\.|music\\.)?(?:youtube\\.com|youtu\\.be)/[^\\s]+",
            Pattern.CASE_INSENSITIVE
    );

    private WebView webView;
    private Button dubbingButton;
    private boolean dubbingRequested = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        dubbingButton = new Button(this);
        dubbingButton.setText("한국어 자동음성");
        dubbingButton.setTextColor(Color.WHITE);
        dubbingButton.setTextSize(14f);
        dubbingButton.setAllCaps(false);
        dubbingButton.setBackgroundColor(Color.rgb(220, 55, 64));
        dubbingButton.setContentDescription("무료 한국어 자동음성 실험모드 시작");
        dubbingButton.setOnClickListener(v -> toggleLocalDubbing());

        FrameLayout.LayoutParams dubbingParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                dp(52)
        );
        dubbingParams.gravity = Gravity.END | Gravity.BOTTOM;
        dubbingParams.setMargins(dp(16), dp(16), dp(16), dp(24));
        root.addView(dubbingButton, dubbingParams);
        setContentView(root);

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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toggleLocalDubbing() {
        if (ProjectionDubbingService.isRunning() || dubbingRequested) {
            stopLocalDubbing();
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            Toast.makeText(this, "자동 한국어 음성은 Android 10 이상에서 지원됩니다.", Toast.LENGTH_LONG).show();
            return;
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
            return;
        }

        requestProjectionPermission();
    }

    private void requestProjectionPermission() {
        MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        dubbingRequested = true;
        dubbingButton.setText("오디오 승인 대기");
        startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION);
    }

    private void startLocalDubbing(int resultCode, Intent resultData) {
        Intent serviceIntent = new Intent(this, ProjectionDubbingService.class);
        serviceIntent.setAction(ProjectionDubbingService.ACTION_START);
        serviceIntent.putExtra(ProjectionDubbingService.EXTRA_RESULT_CODE, resultCode);
        serviceIntent.putExtra(ProjectionDubbingService.EXTRA_RESULT_DATA, resultData);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
        dubbingRequested = false;
        dubbingButton.setText("한국어 자동음성 중지");
        Toast.makeText(
                this,
                "무료 자동음성 엔진을 준비합니다. 첫 실행은 모델 다운로드 때문에 조금 걸릴 수 있습니다.",
                Toast.LENGTH_LONG
        ).show();
    }

    private void stopLocalDubbing() {
        dubbingRequested = false;
        Intent stopIntent = new Intent(this, ProjectionDubbingService.class);
        stopIntent.setAction(ProjectionDubbingService.ACTION_STOP);
        startService(stopIntent);
        dubbingButton.setText("한국어 자동음성");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                requestProjectionPermission();
            } else {
                dubbingRequested = false;
                Toast.makeText(this, "영상 소리를 인식하려면 오디오 권한이 필요합니다.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == RESULT_OK && data != null) {
                startLocalDubbing(resultCode, data);
            } else {
                dubbingRequested = false;
                dubbingButton.setText("한국어 자동음성");
                Toast.makeText(this, "오디오 캡처 승인이 취소되었습니다.", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (dubbingButton != null && !dubbingRequested) {
            dubbingButton.setText(
                    ProjectionDubbingService.isRunning() ? "한국어 자동음성 중지" : "한국어 자동음성"
            );
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadFromIntent(intent);
    }

    private void loadFromIntent(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri incoming = intent.getData();
            if (incoming != null && isHttpUrl(incoming) && !isYouTubeHost(incoming.getHost())) {
                openExternalBrowser(incoming);
                return;
            }
        }

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
            }

            Matcher matcher = SHARED_YOUTUBE_URL.matcher(sharedText);
            if (matcher.find()) return matcher.group();
        }

        return null;
    }

    private boolean isHttpUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
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

    private void openExternalBrowser(Uri uri) {
        if (tryOpenPackage(uri, CHROME_PACKAGE)) {
            finish();
            return;
        }

        if (tryOpenPackage(uri, SAMSUNG_BROWSER_PACKAGE)) {
            finish();
            return;
        }

        PackageManager packageManager = getPackageManager();
        Intent generic = new Intent(Intent.ACTION_VIEW, uri);
        List<ResolveInfo> candidates = packageManager.queryIntentActivities(generic, PackageManager.MATCH_DEFAULT_ONLY);

        for (ResolveInfo candidate : candidates) {
            if (candidate.activityInfo == null) continue;
            String packageName = candidate.activityInfo.packageName;
            if (getPackageName().equals(packageName)) continue;

            Intent explicit = new Intent(Intent.ACTION_VIEW, uri);
            explicit.setComponent(new ComponentName(packageName, candidate.activityInfo.name));
            startActivity(explicit);
            finish();
            return;
        }

        Toast.makeText(this, "일반 웹주소를 열 브라우저를 찾지 못했습니다.", Toast.LENGTH_LONG).show();
        webView.loadUrl(APP_URL);
    }

    private boolean tryOpenPackage(Uri uri, String packageName) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.setPackage(packageName);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException ignored) {
            return false;
        }
    }

    private void openBrowserFallback(String intentUrl) {
        try {
            Intent parsed = Intent.parseUri(intentUrl, Intent.URI_INTENT_SCHEME);
            String fallback = parsed.getStringExtra("browser_fallback_url");
            if (fallback != null) {
                openExternalBrowser(Uri.parse(fallback));
            }
        } catch (Exception ignored) {
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

    @Override
    protected void onDestroy() {
        if (isFinishing() && ProjectionDubbingService.isRunning()) {
            stopLocalDubbing();
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
