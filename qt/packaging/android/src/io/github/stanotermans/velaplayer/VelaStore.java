// Vela Player Pro on Google Play (#53): the one-time product "vela_pro" through Google Play Billing. Store.cpp makes
// one of these; every answer goes back to it through onState(known, pro, price, error).
// A purchase only counts once our purchase check (server/verify/worker.js) has asked Google about it and answered
// with a signed verdict (VelaVerdict): a faked Google Play answer on the phone (Lucky Patcher) gets no verdict. The
// verdict is kept for 30 days (Pro also works offline) and asked again after 7.
package io.github.stanotermans.velaplayer;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class VelaStore implements PurchasesUpdatedListener {
    static final String PRO = "vela_pro";
    // the purchase check (server/verify, Cloudflare Workers)
    static final String VERIFY_URL = "https://vela-verify.stanotermans.workers.dev/verify";
    static final long REFRESH = 7L * 24 * 3600;   // ask again after a week
    private static native void onState(boolean known, boolean pro, String price, String error);

    private final Activity activity;
    private BillingClient client;
    private ProductDetails details;
    private String price = "";

    public VelaStore(Activity a) {
        activity = a;
        final VelaVerdict v = cached();   // offline at once: the last verdict, if it still holds
        if (v != null && v.unlocks(null, now())) onState(true, true, "", "");
        activity.runOnUiThread(() -> {
            client = BillingClient.newBuilder(activity).setListener(this)
                    .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                    .enableAutoServiceReconnection().build();   // (Billing 8: connects again by itself)
            connect();
        });
    }

    private void connect() {
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { onState(false, false, "", r.getDebugMessage()); return; }
                query();
                restore();
            }
            @Override public void onBillingServiceDisconnected() { }   // connected again on the next buy or restore
        });
    }

    private void query() {
        QueryProductDetailsParams p = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder().setProductId(PRO).setProductType(BillingClient.ProductType.INAPP).build())).build();
        client.queryProductDetailsAsync(p, (r, result) -> {
            List<ProductDetails> list = result == null ? null : result.getProductDetailsList();
            if (list == null || list.isEmpty() || list.get(0).getOneTimePurchaseOfferDetails() == null) return;
            details = list.get(0);
            price = details.getOneTimePurchaseOfferDetails().getFormattedPrice();
            onState(false, false, price, "");
        });
    }

    // the purchases Google Play knows for this account: Pro on a new phone or after reinstalling
    public void restore() {
        activity.runOnUiThread(() -> {
            if (client == null) return;
            if (!client.isReady()) { connect(); return; }
            client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                    (r, purchases) -> { if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) handle(purchases, true); });
        });
    }

    public void buy() {
        activity.runOnUiThread(() -> {
            if (client == null || !client.isReady()) { if (client != null) connect(); onState(false, false, price, "Google Play is not ready yet. Try again in a moment."); return; }
            if (details == null) { onState(false, false, price, "Vela Player Pro is not available in your Google Play store."); return; }
            BillingFlowParams f = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).build())).build();
            client.launchBillingFlow(activity, f);
        });
    }

    @Override public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) handle(purchases, false);
        else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) restore();
        else if (code != BillingClient.BillingResponseCode.USER_CANCELED) onState(false, false, price, r.getDebugMessage());
    }

    // Pro once the purchase is paid (not while pending) and our purchase check confirmed it; Google refunds purchases
    // that are not acknowledged in 3 days
    private void handle(List<Purchase> purchases, boolean all) {
        String token = null;
        for (Purchase p : purchases) {
            if (!p.getProducts().contains(PRO) || p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            token = p.getPurchaseToken();
            if (!p.isAcknowledged())
                client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(), x -> { });
        }
        if (token != null) check(token);
        else if (all) { prefs().edit().clear().apply(); onState(true, false, price, ""); }   // (nothing bought: no verdict either)
    }

    // the verdict for this purchase: the kept one while it is less than a week old, otherwise our purchase check
    private void check(String token) {
        final VelaVerdict kept = cached();
        if (kept != null && kept.unlocks(token, now()) && now() - kept.iat < REFRESH) { onState(true, true, price, ""); return; }
        new Thread(() -> {
            final VelaVerdict v = ask(token);
            if (v != null) onState(true, v.unlocks(token, now()), price, v.pro ? "" : "Google Play doesn't know this purchase.");
            else if (kept != null && kept.unlocks(token, now())) onState(true, true, price, "");   // offline: the kept one still holds
            else onState(true, false, price, "Couldn't check your purchase. Check your internet connection and try Restore.");
        }).start();
    }

    // POST { token } to the purchase check; the verdict when its signature is ours (and kept for next time)
    private VelaVerdict ask(String token) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(VERIFY_URL).openConnection();
            c.setConnectTimeout(10000); c.setReadTimeout(15000);
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setRequestProperty("content-type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(("{\"token\":\"" + token.replace("\"", "") + "\"}").getBytes(StandardCharsets.UTF_8)); }
            if (c.getResponseCode() != 200) return null;
            final String body;
            try (InputStream in = c.getInputStream()) {   // (readAllBytes is Android 13+)
                final java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); final byte[] buf = new byte[4096];
                for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
                body = new String(b.toByteArray(), StandardCharsets.UTF_8);
            }
            final String verdict = field(body, "verdict"), sig = field(body, "sig");
            final VelaVerdict v = verdict == null || sig == null ? null : VelaVerdict.read(verdict, sig);
            if (v != null) prefs().edit().putString("verdict", verdict).putString("sig", sig).apply();
            return v;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private VelaVerdict cached() {
        final SharedPreferences p = prefs();
        final String verdict = p.getString("verdict", null), sig = p.getString("sig", null);
        return verdict == null || sig == null ? null : VelaVerdict.read(verdict, sig);
    }
    private SharedPreferences prefs() { return activity.getSharedPreferences("vela_store", Context.MODE_PRIVATE); }
    private static long now() { return System.currentTimeMillis() / 1000; }
    private static String field(String json, String k) {
        final Matcher m = Pattern.compile("\"" + k + "\"\\s*:\\s*\"([^\"]*)\"").matcher(json);
        return m.find() ? m.group(1) : null;
    }
}
