package com.kyoutube.free;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
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
import android.widget.TextView;
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
    private Button subtitleButton;
    private TextView subtitleView;
    private boolean subtitleRequested = false;
    private boolean receiverRegistered = false;

    private final BroadcastReceiver subtitleReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String korean = intent.getStringExtra(ProjectionDubbingService.EXTRA_KOREAN);
            String status = intent.getStringExtra(ProjectionDubbingService.EXTRA_STATUS);

            if (korean != null && !korean.trim().isEmpty()) {
                subtitleView.setTextSize(20f);
                subtitleView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
                subtitleView.setText(korean.trim());
                subtitleView.setVisibility(View.VISIBLE);
                return;
            }

            if (status != null && !status.trim().isEmpty()) {
                subtitleView.setTextSize(15f);
                subtitleView.setTypeface(Typeface.DEFAULT, Typeface.NORMAL);
                subtitleView.setText(status.trim());
                subtitleView.setVisibility(View.VISIBLE);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        subtitleView = new TextView(this);
        subtitleView.setTextColor(Color.WHITE);
        subtitleView.setTextSize(20f);
        subtitleView.setGravity(Gravity.CENTER);
        subtitleView.setMaxLines(2);
        subtitleView.setPadding(dp(14), dp(9), dp(14), dp(9));
        subtitleView.setBackgroundColor(Color.argb(205, 0, 0, 0));
        subtitleView.setVisibility(View.GONE);
        subtitleView.setContentDescription("실시간 한국어 자막");

        FrameLayout.LayoutParams subtitleParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.gravity = Gravity.BOTTOM;
        subtitleParams.setMargins(dp(12), dp(12), dp(12), dp(92));
        root.addView(subtitleView, subtitleParams);

        subtitleButton = new Button(this);
        subtitleButton.setText("한국어 실시간 자막");
        subtitleButton.setTextColor(Color.WHITE);
        subtitleButton.setTextSize(14f);
        subtitleButton.setAllCaps(false);
        subtitleButton.setBackgroundColor(Color.rgb(220, 55, 64));
        subtitleButton.setContentDescription("영어 영상을 한국어 자막으로 보기");
        subtitleButton.setOnClickListener(v -> toggleLiveCaptions());

        FrameLayout.LayoutParams buttonParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                dp(52)
        );
        buttonParams.gravity = Gravity.END | Gravity.BOTTOM;
        buttonParams.setMargins(dp(16), dp(16), dp(16), dp(24));
        root.addView(subtitleButton, buttonParams);
        setContentView(root);

        registerSubtitleReceiver();

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

    private void registerSubtitleReceiver() {
        if (receiverRegistered) return;
        IntentFilter filter = new IntentFilter(ProjectionDubbingService.ACTION_SUBTITLE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(subtitleReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(subtitleReceiver, filter);
        }
        receiverRegistered = true;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toggleLiveCaptions() {
        if (ProjectionDubbingService.isRunning() || subtitleRequested) {
            stopLiveCaptions();
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            Toast.makeText(this, "실시간 한국어 자막은 Android 10 이상에서 지원됩니다.", Toast.LENGTH_LONG).show();
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
        subtitleRequested = true;
        subtitleButton.setText("오디오 승인 대기");
        subtitleView.setText("한국어 자막 준비 중...");
        subtitleView.setVisibility(View.VISIBLE);
        startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION);
    }

    private void startLiveCaptions(int resultCode, Intent resultData) {
        Intent serviceIntent = new Intent(this, ProjectionDubbingService.class);
        serviceIntent.setAction(ProjectionDubbingService.ACTION_START);
        serviceIntent.putExtra(ProjectionDubbingService.EXTRA_RESULT_CODE, resultCode);
        serviceIntent.putExtra(ProjectionDubbingService.EXTRA_RESULT_DATA, resultData);
        serviceIntent.putExtra(ProjectionDubbingService.EXTRA_DUBBING_MODE, ProjectionDubbingService.MODE_FAST);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
        subtitleRequested = false;
        subtitleButton.setText("한국어 자막 중지");
        subtitleView.setText("한국어 자막 준비 중...");
        subtitleView.setVisibility(View.VISIBLE);
    }

    private void stopLiveCaptions() {
        subtitleRequested = false;
        Intent stopIntent = new Intent(this, ProjectionDubbingService.class);
        stopIntent.setAction(ProjectionDubbingService.ACTION_STOP);
        startService(stopIntent);
        subtitleButton.setText("한국어 실시간 자막");
        subtitleView.setVisibility(View.GONE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                requestProjectionPermission();
            } else {
                subtitleRequested = false;
                Toast.makeText(this, "영상 소리를 인식하려면 오디오 권한이 필요합니다.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == RESULT_OK && data != null) {
                startLiveCaptions(resultCode, data);
            } else {
                subtitleRequested = false;
                subtitleButton.setText("한국어 실시간 자막");
                subtitleView.setVisibility(View.GONE);
                Toast.makeText(this, "오디오 캡처 승인이 취소되었습니다.", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (subtitleButton != null && !subtitleRequested) {
            boolean running = ProjectionDubbingService.isRunning();
            subtitleButton.setText(running ? "한국어 자막 중지" : "한국어 실시간 자막");
            if (!running && subtitleView != null) subtitleView.setVisibility(View.GONE);
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
            if (data != null && isYouTubeHost(data.getHost())) return data.toString();
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
            if (fallback != null) openExternalBrowser(Uri.parse(fallback));
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
            stopLiveCaptions();
        }
        if (receiverRegistered) {
            try {
                unregisterReceiver(subtitleReceiver);
            } catch (Exception ignored) {
            }
            receiverRegistered = false;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
