// Vela Player Pro (#53): the answer of our purchase check (server/verify/worker.js), signed with our key. Only a
// verdict whose signature checks out with the public key below, for this app and product, not expired (and, when the
// purchase token is known, for that purchase) unlocks Pro. Plain Java, so it can be tested outside Android too.
package io.github.stanotermans.velaplayer;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class VelaVerdict {
    // the public half of the Worker's SIGNING_KEY (ECDSA P-256, SPKI, base64)
    static final String PUBLIC_KEY =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE6N+UFwvRENuP/xej5IgjKLINIsfer96RoWMfR0PJN9pdFlsEV5yfTPD/vQt4B4GnBcsjgPG76FW8worbsA8Zag==";
    static final String PACKAGE = "io.github.stanotermans.velaplayer";
    static final String PRODUCT = "vela_pro";

    public final boolean pro;
    public final String tok;
    public final long iat, exp;

    private VelaVerdict(boolean pro, String tok, long iat, long exp) { this.pro = pro; this.tok = tok; this.iat = iat; this.exp = exp; }

    // null unless the signature is ours and the verdict is for this app and product
    public static VelaVerdict read(String verdictB64, String sigB64) {
        try {
            final byte[] verdict = Base64.getDecoder().decode(verdictB64), sig = Base64.getDecoder().decode(sigB64);
            final PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(PUBLIC_KEY)));
            final Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(key);
            s.update(verdict);
            if (!s.verify(der(sig))) return null;
            final String j = new String(verdict, StandardCharsets.UTF_8);
            if (!PACKAGE.equals(str(j, "pkg")) || !PRODUCT.equals(str(j, "product"))) return null;
            return new VelaVerdict(j.contains("\"pro\":true"), str(j, "tok"), num(j, "iat"), num(j, "exp"));
        } catch (Exception e) {
            return null;
        }
    }

    // Pro now: a "pro" verdict that has not expired and, when the purchase token is known, is about that purchase
    public boolean unlocks(String purchaseToken, long nowSeconds) {
        return pro && nowSeconds < exp && (purchaseToken == null || hash(purchaseToken).equals(tok));
    }

    public static String hash(String s) {
        try {
            final StringBuilder b = new StringBuilder();
            for (byte x : MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8))) b.append(String.format("%02x", x));
            return b.toString();
        } catch (Exception e) {
            return "";
        }
    }

    // WebCrypto signs as r ‖ s (32 + 32 bytes); Java checks DER: SEQUENCE { INTEGER r, INTEGER s }
    static byte[] der(byte[] raw) {
        if (raw.length != 64) return raw;
        final byte[] r = new BigInteger(1, Arrays.copyOfRange(raw, 0, 32)).toByteArray();
        final byte[] s = new BigInteger(1, Arrays.copyOfRange(raw, 32, 64)).toByteArray();
        final byte[] out = new byte[6 + r.length + s.length];
        out[0] = 0x30; out[1] = (byte) (4 + r.length + s.length);
        out[2] = 0x02; out[3] = (byte) r.length; System.arraycopy(r, 0, out, 4, r.length);
        out[4 + r.length] = 0x02; out[5 + r.length] = (byte) s.length; System.arraycopy(s, 0, out, 6 + r.length, s.length);
        return out;
    }

    private static String str(String j, String k) {
        final Matcher m = Pattern.compile("\"" + k + "\":\"([^\"]*)\"").matcher(j);
        return m.find() ? m.group(1) : null;
    }
    private static long num(String j, String k) {
        final Matcher m = Pattern.compile("\"" + k + "\":(\\d+)").matcher(j);
        return m.find() ? Long.parseLong(m.group(1)) : 0;
    }
}
