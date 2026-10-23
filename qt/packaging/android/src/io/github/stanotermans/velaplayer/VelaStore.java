// Vela Player Pro on Google Play (#53): the one-time product "vela_pro" through Google Play Billing. Store.cpp makes
// one of these; every answer goes back to it through onState(known, pro, price, error).
package io.github.stanotermans.velaplayer;

import android.app.Activity;
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
import java.util.Collections;
import java.util.List;

public class VelaStore implements PurchasesUpdatedListener {
    static final String PRO = "vela_pro";
    private static native void onState(boolean known, boolean pro, String price, String error);

    private final Activity activity;
    private BillingClient client;
    private ProductDetails details;
    private String price = "";

    public VelaStore(Activity a) {
        activity = a;
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

    // Pro once the purchase is paid (not while pending); Google refunds purchases that are not acknowledged in 3 days
    private void handle(List<Purchase> purchases, boolean all) {
        boolean pro = false;
        for (Purchase p : purchases) {
            if (!p.getProducts().contains(PRO) || p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            pro = true;
            if (!p.isAcknowledged())
                client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), x -> { });
        }
        if (all || pro) onState(true, pro, price, "");
    }
}
