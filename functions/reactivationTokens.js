const crypto = require("crypto");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

const TOKEN_COLLECTION = "reactivationTokens";
const DEFAULT_TOKEN_TTL_DAYS = 30;

function hasActiveSubscriptionStatus(status) {
  return status === "active" || status === "plus" || status === "regular";
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function generateTokenId() {
  return crypto.randomBytes(32).toString("hex");
}

async function getTokenRef(token) {
  const tokenId = String(token || "").trim();
  if (!tokenId || tokenId.length < 32) {
    return null;
  }
  return admin.firestore().collection(TOKEN_COLLECTION).doc(tokenId);
}

async function userHasActiveSubscription(uid, stripe) {
  const userDoc = await admin.firestore().collection("users").doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : {};

  if (hasActiveSubscriptionStatus(userData.subscriptionStatus)) {
    return true;
  }

  const customerId = userData.stripeCustomerId;
  if (!customerId || !stripe) {
    return false;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data.some(
    (sub) => sub.status === "active" || sub.status === "trialing"
  );
}

async function createReactivationTokenForEmail(email, options = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  let user;
  try {
    user = await admin.auth().getUserByEmail(normalizedEmail);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      return { email: normalizedEmail, error: "no_auth_user" };
    }
    throw err;
  }

  const ttlDays =
    typeof options.ttlDays === "number" ? options.ttlDays : DEFAULT_TOKEN_TTL_DAYS;
  const token = generateTokenId();
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + ttlDays * 86400000)
  );

  await admin
    .firestore()
    .collection(TOKEN_COLLECTION)
    .doc(token)
    .set({
      email: normalizedEmail,
      uid: user.uid,
      used: false,
      campaign: options.campaign || "winback",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });

  const baseUrl = options.baseUrl || "https://communityview.ai/signup";

  return {
    email: normalizedEmail,
    uid: user.uid,
    token,
    link: `${baseUrl}?token=${token}`,
    expiresAt: expiresAt.toDate().toISOString(),
  };
}

async function readValidTokenRecord(token, stripe) {
  const tokenRef = await getTokenRef(token);
  if (!tokenRef) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "This reactivation link is invalid."
    );
  }

  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "This reactivation link is invalid or has expired."
    );
  }

  const tokenData = tokenSnap.data();
  if (tokenData.used) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This reactivation link has already been used."
    );
  }

  const expiresAt = tokenData.expiresAt?.toDate?.();
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This reactivation link has expired."
    );
  }

  if (await userHasActiveSubscription(tokenData.uid, stripe)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This account already has an active subscription. Sign in to continue."
    );
  }

  return { tokenRef, tokenData };
}

async function validateReactivationTokenHandler(data, stripe) {
  const { token } = data;
  const { tokenData } = await readValidTokenRecord(token, stripe);

  const userDoc = await admin
    .firestore()
    .collection("users")
    .doc(tokenData.uid)
    .get();
  const profile = userDoc.exists ? userDoc.data() : {};

  return {
    valid: true,
    email: tokenData.email,
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
  };
}

async function reactivateAccountHandler(data, stripe) {
  const { token, password, firstName, lastName } = data;

  if (!password || String(password).length < 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Password must be at least 6 characters."
    );
  }

  const { tokenRef, tokenData } = await readValidTokenRecord(token, stripe);
  const uid = tokenData.uid;
  const normalizedEmail = tokenData.email;

  await admin.auth().updateUser(uid, { password: String(password) });

  await admin
    .firestore()
    .collection("users")
    .doc(uid)
    .set(
      {
        email: normalizedEmail,
        firstName: firstName || "",
        lastName: lastName || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  await tokenRef.update({
    used: true,
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const customToken = await admin.auth().createCustomToken(uid);

  return {
    customToken,
    email: normalizedEmail,
    uid,
  };
}

module.exports = {
  TOKEN_COLLECTION,
  DEFAULT_TOKEN_TTL_DAYS,
  createReactivationTokenForEmail,
  validateReactivationTokenHandler,
  reactivateAccountHandler,
};
