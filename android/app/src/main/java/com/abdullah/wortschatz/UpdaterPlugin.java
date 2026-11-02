package com.abdullah.wortschatz;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.WebView;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Local Capacitor plugin: in-app updates.
 *
 * applyWeb({ url, sha256, build }): downloads a zip with the changed web files, builds files/web/<build>/ =
 *   bundled www (APK assets/public) + the zip on top, points the local server at it, persists that path and
 *   reloads the WebView → the app restarts already updated. A new APK (new versionCode) automatically falls
 *   back to its own bundled files (Capacitor's isNewBinary check).
 * ready(): the new web build booted fine. If a build never calls it, the next cold start rolls back to the
 *   bundled files (load()).
 * installApk({ url }): downloads an APK and opens Android's installer (needs "install unknown apps" once).
 * reset(): back to the bundled files. info(): versionCode / web build in use.
 * Progress: listener "progress" → { kind: 'web' | 'apk', pct }.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String PREFS = "WortschatzUpdater";
    private static final String KEY_PENDING = "pending";

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private SharedPreferences webPrefs() { return getContext().getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE); }
    private File webRoot() { return new File(getContext().getFilesDir(), "web"); }

    @Override
    public void load() {
        // runs before the bridge loads the WebView
        if (prefs().getString(KEY_PENDING, null) != null) {
            Logger.warn("Updater", "web update never reported ready - rolling back to the bundled files");
            prefs().edit().remove(KEY_PENDING).apply();
            webPrefs().edit().remove(WebView.CAP_SERVER_PATH).apply();
        }
        // remove builds that are not in use any more
        String keep = webPrefs().getString(WebView.CAP_SERVER_PATH, null);
        File[] dirs = webRoot().listFiles();
        if (dirs != null) for (File d : dirs) if (keep == null || !d.getAbsolutePath().equals(keep)) deleteRecursive(d);
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("versionName", pi.versionName);
            r.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception e) { /* ignore */ }
        String path = webPrefs().getString(WebView.CAP_SERVER_PATH, null);
        r.put("webPath", path == null ? "" : path);
        r.put("canInstall", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void ready(PluginCall call) {
        prefs().edit().remove(KEY_PENDING).apply();
        call.resolve();
    }

    @PluginMethod
    public void reset(PluginCall call) {
        prefs().edit().remove(KEY_PENDING).apply();
        webPrefs().edit().remove(WebView.CAP_SERVER_PATH).apply();
        call.resolve();
        getActivity().runOnUiThread(() -> getBridge().setServerAssetPath("public"));
    }

    @PluginMethod
    public void applyWeb(PluginCall call) {
        String url = call.getString("url");
        String sha = call.getString("sha256", "");
        Integer build = call.getInt("build", 0);
        if (url == null || url.isEmpty() || build == null || build <= 0) { call.reject("bad arguments"); return; }
        new Thread(() -> {
            File zip = new File(getContext().getCacheDir(), "web-" + build + ".zip");
            File tmp = new File(webRoot(), build + ".tmp");
            try {
                download(url, zip, "web");
                if (sha != null && !sha.isEmpty() && !sha.equalsIgnoreCase(sha256(zip))) throw new IOException("checksum mismatch");
                deleteRecursive(tmp);
                if (!tmp.mkdirs()) throw new IOException("cannot create " + tmp);
                copyAssets(getContext().getAssets(), "public", tmp);   // the app as it is inside the APK
                unzip(zip, tmp);                                       // + the changed files
                File dir = new File(webRoot(), String.valueOf(build));
                deleteRecursive(dir);
                if (!tmp.renameTo(dir)) throw new IOException("cannot rename " + tmp);
                String path = dir.getAbsolutePath();
                prefs().edit().putString(KEY_PENDING, String.valueOf(build)).apply();
                webPrefs().edit().putString(WebView.CAP_SERVER_PATH, path).apply();
                call.resolve();
                getActivity().runOnUiThread(() -> getBridge().setServerBasePath(path));   // reloads with the new files
            } catch (Exception e) {
                deleteRecursive(tmp);
                Logger.error("Updater", "web update failed", e);
                call.reject("update failed: " + e.getMessage());
            } finally {
                //noinspection ResultOfMethodCallIgnored
                zip.delete();
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("bad arguments"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.reject("allow installing apps from Wortschatz first", "PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "apk");
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                File apk = new File(dir, "update.apk");
                download(url, apk, "apk");
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                Logger.error("Updater", "apk download failed", e);
                call.reject("download failed: " + e.getMessage());
            }
        }).start();
    }

    // ---------- helpers ----------
    private void download(String url, File out, String kind) throws IOException {
        HttpURLConnection c = null;
        for (int hop = 0; hop < 5; hop++) {             // GitHub release links redirect to another host
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) { url = new URL(new URL(url), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
            if (code != 200) throw new IOException("HTTP " + code);
            break;
        }
        if (c == null) throw new IOException("too many redirects");
        long total = c.getContentLengthLong();
        long done = 0;
        int lastPct = -1;
        try (InputStream in = new BufferedInputStream(c.getInputStream()); OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
                done += n;
                int pct = total > 0 ? (int) (done * 100 / total) : -1;
                if (pct != lastPct) {
                    lastPct = pct;
                    JSObject ev = new JSObject();
                    ev.put("kind", kind);
                    ev.put("pct", pct);
                    notifyListeners("progress", ev);
                }
            }
        } finally {
            c.disconnect();
        }
        if (total > 0 && done != total) throw new IOException("incomplete download");
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static void copyAssets(AssetManager am, String path, File dest) throws IOException {
        String[] kids = am.list(path);
        if (kids == null || kids.length == 0) {           // a file
            try (InputStream in = am.open(path); OutputStream os = new FileOutputStream(dest)) { copy(in, os); }
            return;
        }
        if (!dest.exists() && !dest.mkdirs()) throw new IOException("cannot create " + dest);
        for (String k : kids) copyAssets(am, path + "/" + k, new File(dest, k));
    }

    private static void unzip(File zip, File dest) throws IOException {
        String base = dest.getCanonicalPath() + File.separator;
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                File out = new File(dest, e.getName());
                if (!out.getCanonicalPath().startsWith(base)) throw new IOException("bad zip entry " + e.getName());
                if (e.isDirectory()) { //noinspection ResultOfMethodCallIgnored
                    out.mkdirs(); continue; }
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("cannot create " + parent);
                try (OutputStream os = new FileOutputStream(out)) { copy(zis, os); }
            }
        }
    }

    private static void copy(InputStream in, OutputStream os) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
    }

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
