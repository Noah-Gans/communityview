const crypto = require("crypto");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

const COLLECTION = "marketingContacts";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function decodeEmailParam(encoded) {
  const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
  return Buffer.from(encoded + pad, "base64url").toString("utf8").trim().toLowerCase();
}

function getSecret() {
  const cfg = functions.config().marketing || {};
  return (
    cfg.unsubscribe_secret ||
    process.env.MARKETING_UNSUBSCRIBE_SECRET ||
    "change-me-set-in-email_senders.local.json"
  );
}

function makeToken(email, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(normalizeEmail(email))
    .digest("hex")
    .slice(0, 32);
}

function verifyToken(email, token, secret) {
  if (!email || !token) return false;
  const expected = makeToken(email, secret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(token).trim())
    );
  } catch (_err) {
    return false;
  }
}

function docId(email) {
  return normalizeEmail(email).replace(/[^a-z0-9@._+-]/g, "_");
}

async function recordUnsubscribe(email, source) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("Invalid email");
  }

  const ref = admin.firestore().collection(COLLECTION).doc(docId(normalized));
  await ref.set(
    {
      email: normalized,
      emailMarketingOptOut: true,
      unsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      unsubscribeSource: source || "link",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function htmlPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; background: #f7f7f7;
      margin: 0; padding: 40px 16px; }
    .card { max-width: 480px; margin: 0 auto; background: #fff;
      border-radius: 8px; padding: 28px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin: 0 0 12px; color: #111; }
    p { font-size: 15px; line-height: 1.55; color: #333; margin: 0 0 12px; }
    a { color: #006b45; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <p><a href="https://communityview.ai">communityview.ai</a></p>
  </div>
</body>
</html>`;
}

async function handleUnsubscribe(req, res) {
  const secret = getSecret();
  const encoded = String(req.query.e || "").trim();
  const token = String(req.query.t || "").trim();

  if (!encoded || !token) {
    res.status(400).send(htmlPage("Invalid link", "This unsubscribe link is missing required parameters."));
    return;
  }

  let email;
  try {
    email = decodeEmailParam(encoded);
  } catch (_err) {
    res.status(400).send(htmlPage("Invalid link", "This unsubscribe link could not be read."));
    return;
  }

  if (!verifyToken(email, token, secret)) {
    res.status(403).send(htmlPage("Invalid link", "This unsubscribe link is invalid or expired."));
    return;
  }

  const source = req.method === "POST" ? "one-click" : "link";
  await recordUnsubscribe(email, source);

  if (req.method === "POST") {
    res.status(200).send("");
    return;
  }

  res
    .status(200)
    .send(
      htmlPage(
        "You're unsubscribed",
        "You will no longer receive marketing emails from Community View at "
          + `<strong>${email}</strong>.`
      )
    );
}

exports.marketingUnsubscribe = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    await handleUnsubscribe(req, res);
  } catch (err) {
    console.error("marketingUnsubscribe failed:", err);
    res.status(500).send(htmlPage("Something went wrong", "Please reply to the email and ask to be removed."));
  }
});
