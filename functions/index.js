const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
console.log("Admin SDK Project ID:", admin.app().options.projectId);
const stripe = require("stripe")(functions.config().stripe.secret, {
  apiVersion: "2023-10-16", // Use a specific API version
});
const express = require("express");
const bodyParser = require("body-parser");
const {
  enrichNearbyTourFeatureCollection,
} = require("./nearbyTourEnrichment");
const {
  readAmenityFromTourCache,
  mergeTourNearbyCachePayload,
  buildSingleAmenityCachePayload,
  normalizeTourNearbyCache,
} = require("./tourNearbyCache");

// Helper function to get amount for plan (in cents)
function getAmountForPlan(plan) {
  const amounts = {
    "regular-monthly": 1800, // $18.00
    "regular-annual": 18000, // $180.00
    "plus-monthly": 2400,   // $24.00
    "plus-annual": 24000,   // $240.00
  };
  return amounts[plan] || 1800; // Default to regular monthly
}

const STRIPE_PRICE_IDS = {
  "regular-monthly": "price_1SM94mLhg9Kp46ldLKLOY4nx",
  "regular-annual": "price_1SM9E8Lhg9Kp46ldnbZoN6Jr",
  "plus-monthly": "price_1SM9WBLhg9Kp46ldz2SucHza",
  "plus-annual": "price_1SM9WXLhg9Kp46ld9yajWJnn",
};

function planFromPriceId(priceId) {
  for (const [planKey, id] of Object.entries(STRIPE_PRICE_IDS)) {
    if (id === priceId) {
      const [tierRaw, intervalRaw] = planKey.split("-");
      return {
        planKey,
        tier: tierRaw === "plus" ? "Plus" : "Regular",
        interval: intervalRaw === "annual" ? "Annual" : "Monthly",
        amountCents: getAmountForPlan(planKey),
      };
    }
  }
  return null;
}

function formatPlanFromFirestore(planField, subscriptionStatus) {
  if (planField && typeof planField === "string" && STRIPE_PRICE_IDS[planField]) {
    const parsed = planFromPriceId(STRIPE_PRICE_IDS[planField]);
    if (parsed) return parsed;
    const [tierRaw, intervalRaw] = planField.split("-");
    if (tierRaw && intervalRaw) {
      return {
        planKey: planField,
        tier: tierRaw === "plus" ? "Plus" : "Regular",
        interval: intervalRaw === "annual" ? "Annual" : "Monthly",
        amountCents: getAmountForPlan(planField),
      };
    }
  }
  if (subscriptionStatus === "plus" || subscriptionStatus === "active") {
    return { planKey: null, tier: "Plus", interval: null, amountCents: null };
  }
  if (subscriptionStatus === "regular") {
    return { planKey: null, tier: "Regular", interval: null, amountCents: null };
  }
  return null;
}

function formatCents(amountCents) {
  if (amountCents == null) return null;
  return `$${(amountCents / 100).toFixed(2)}`;
}

// 1) createCheckoutSession (Callable Function - v1)
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  const { email, userId, plan, firstName, lastName } = data;

  // Validate inputs
  if (!email || !plan) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing email or plan in request."
    );
  }

  // Use the provided userId (should always be authenticated now)
  if (!userId) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to create a checkout session."
    );
  }
  
  console.log("Creating checkout session for:", {
    email,
    userId: userId,
    plan,
    isAuthenticated: !!context.auth
  });

  // Map plan names to Stripe Price IDs (LIVE MODE)
  const priceIds = {
    "regular-monthly": "price_1SM94mLhg9Kp46ldLKLOY4nx", // $18/month ✅ LIVE
    "regular-annual": "price_1SM9E8Lhg9Kp46ldnbZoN6Jr",   // $180/year ✅ LIVE
    "plus-monthly": "price_1SM9WBLhg9Kp46ldz2SucHza",     // $24/month ✅ LIVE
    "plus-annual": "price_1SM9WXLhg9Kp46ld9yajWJnn",       // $240/year ✅ LIVE
  };

  const priceId = priceIds[plan];
  if (!priceId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Invalid plan: ${plan}`
    );
  }

  try {
    // Check if user already has a customer and active subscriptions
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const customerId = userData.stripeCustomerId;
      
      if (customerId) {
        // Get all active subscriptions for the customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
        });
        
        // Cancel all existing active subscriptions
        if (subscriptions.data.length > 0) {
          console.log(`Canceling ${subscriptions.data.length} existing subscriptions...`);
          for (const subscription of subscriptions.data) {
            await stripe.subscriptions.cancel(subscription.id);
            console.log(`Canceled subscription: ${subscription.id}`);
          }
        }
      }
    }

    // Create a Payment Intent for embedded checkout
    const paymentIntent = await stripe.paymentIntents.create({
      amount: getAmountForPlan(plan), // Calculate amount in cents
      currency: "usd",
      metadata: {
        firebaseUserId: userId,
        email: email,
        firstName: firstName || "",
        lastName: lastName || "",
        plan: plan,
      },
      setup_future_usage: "off_session",
    });

    // Return the client secret for embedded checkout
    console.log("Stripe client secret:", paymentIntent.client_secret);
    console.log("Client secret type:", typeof paymentIntent.client_secret);
    return { clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

// 2) stripeWebhook (HTTP Function - v1)
const app = express();

// Add raw body middleware for Stripe webhook validation
app.use(
  bodyParser.raw({
    type: "application/json",
  })
);

app.post("/", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      functions.config().stripe.webhook_secret
    );

            switch (event.type) {
              case "payment_intent.succeeded": {
                const paymentIntent = event.data.object;
                if (!paymentIntent.metadata?.firebaseUserId) {
                  throw new Error("Missing Firebase User ID in payment intent metadata");
                }
                
                const userId = paymentIntent.metadata.firebaseUserId;
                const email = paymentIntent.metadata.email;
                const firstName = paymentIntent.metadata.firstName || "";
                const lastName = paymentIntent.metadata.lastName || "";
                const plan = paymentIntent.metadata.plan || "unknown";
              
                // Create Stripe customer
                const customer = await stripe.customers.create({
                  email: email,
                  name: `${firstName} ${lastName}`.trim(),
                  metadata: {
                    firebaseUserId: userId,
                    plan: plan,
                  },
                });

                // Create subscription
                const priceIds = {
                  "regular-monthly": "price_1SM94mLhg9Kp46ldLKLOY4nx",
                  "regular-annual": "price_1SM9E8Lhg9Kp46ldnbZoN6Jr",
                  "plus-monthly": "price_1SM9WBLhg9Kp46ldz2SucHza",
                  "plus-annual": "price_1SM9WXLhg9Kp46ld9yajWJnn",
                };

                const priceId = priceIds[plan];
                if (priceId) {
                  await stripe.subscriptions.create({
                    customer: customer.id,
                    items: [{ price: priceId }],
                    trial_period_days: 14,
                    metadata: {
                      firebaseUserId: userId,
                      email: email,
                      plan: plan,
                    },
                  });
                }
              
                // Determine subscription tier based on plan
                let subscriptionStatus;
                if (plan.includes("plus")) {
                  subscriptionStatus = "plus"; // Plus tier
                } else if (plan.includes("regular")) {
                  subscriptionStatus = "regular"; // Regular tier
                } else {
                  subscriptionStatus = "active"; // Legacy, treat as plus
                }
              
                // Get existing user data to merge with subscription info
                const userDoc = await admin.firestore().collection("users").doc(userId).get();
                const existingData = userDoc.exists ? userDoc.data() : {};
                
                // Update user document in Firestore with complete subscription info
                const userData = {
                  email: email,
                  firstName: firstName || existingData.firstName || "",
                  lastName: lastName || existingData.lastName || "",
                  subscriptionStatus: subscriptionStatus,
                  stripeCustomerId: customer.id,
                  plan: plan,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  // Add createdAt if it doesn't exist
                  ...(existingData.createdAt ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
                };

                await admin.firestore().collection("users").doc(userId).set(
                  userData,
                  { merge: true }
                );
              
                console.log("Payment succeeded and subscription created:", {
                  userId,
                  email,
                  plan,
                  subscriptionStatus,
                  customer: customer.id
                });
                break;
              }
      

      case "invoice.payment_failed": {
        const failedInvoice = event.data.object;
        console.log("Payment failed for invoice:", failedInvoice.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        if (!subscription.metadata || !subscription.metadata.firebaseUserId) {
          throw new Error("Missing Firebase User ID in subscription metadata");
        }

        const userId = subscription.metadata.firebaseUserId;
        await admin.firestore().collection("users").doc(userId).set(
          { subscriptionStatus: "canceled" },
          { merge: true }
        );
        console.log("Subscription canceled for user:", userId);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        if (!subscription.metadata || !subscription.metadata.firebaseUserId) {
          throw new Error("Missing Firebase User ID in subscription metadata");
        }
      
        const userId = subscription.metadata.firebaseUserId;
      
        // Check the subscription's status
        // (e.g., if subscription.status === "active", set Firestore to "active")
        if (subscription.status === "active") {
          await admin.firestore().collection("users").doc(userId).set(
            { subscriptionStatus: "active" },
            { merge: true }
          );
          console.log("Subscription re-activated for user:", userId);
        } else {
          // Optionally handle other states like "past_due", "incomplete", etc.
          console.log("Subscription updated with status:", subscription.status);
        }
        break;
      }
      

      default:
        console.warn(`Unhandled event type: ${event.type}`);
    }

    res.status(200).send("Webhook processed successfully");
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

exports.stripeWebhook = functions.https.onRequest(app);

exports.getSubscriptionDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated."
    );
  }

  const userId = context.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "User doc not found.");
  }

  const userData = userDoc.data();
  const subscriptionStatus = userData.subscriptionStatus || "none";
  const firestorePlan = formatPlanFromFirestore(userData.plan, subscriptionStatus);

  const base = {
    email: userData.email || context.auth.token.email || null,
    subscriptionStatus,
    firestorePlan: firestorePlan
      ? {
          tier: firestorePlan.tier,
          interval: firestorePlan.interval,
          planKey: firestorePlan.planKey,
          amountDisplay: formatCents(firestorePlan.amountCents),
        }
      : null,
    hasStripeCustomer: !!userData.stripeCustomerId,
    stripe: null,
  };

  if (!userData.stripeCustomerId) {
    return base;
  }

  try {
    const customerId = userData.stripeCustomerId;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
      expand: ["data.default_payment_method", "data.items.data.price"],
    });

    const subscription =
      subscriptions.data.find(
        (s) => s.status === "active" || s.status === "trialing"
      ) || subscriptions.data[0];

    let paymentMethod = null;
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });

    const defaultPm =
      customer.invoice_settings?.default_payment_method ||
      subscription?.default_payment_method;

    if (defaultPm && typeof defaultPm === "object" && defaultPm.card) {
      paymentMethod = {
        brand: defaultPm.card.brand,
        last4: defaultPm.card.last4,
        expMonth: defaultPm.card.exp_month,
        expYear: defaultPm.card.exp_year,
      };
    }

    if (!subscription) {
      return base;
    }

    const priceId = subscription.items?.data?.[0]?.price?.id;
    const planInfo = planFromPriceId(priceId) || firestorePlan;
    const interval =
      subscription.items?.data?.[0]?.price?.recurring?.interval || null;

    base.stripe = {
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      tier: planInfo?.tier || null,
      interval:
        planInfo?.interval ||
        (interval === "year" ? "Annual" : interval === "month" ? "Monthly" : null),
      amountDisplay: formatCents(
        subscription.items?.data?.[0]?.price?.unit_amount ??
          planInfo?.amountCents
      ),
      paymentMethod,
    };

    return base;
  } catch (err) {
    console.error("getSubscriptionDetails error:", err);
    throw new functions.https.HttpsError("unknown", err.message);
  }
});

exports.createSetupIntent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated."
    );
  }

  const userId = context.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "User doc not found.");
  }

  const userData = userDoc.data();
  let customerId = userData.stripeCustomerId;

  if (!customerId) {
    const email = userData.email || context.auth.token.email;
    if (!email) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No billing profile found. Subscribe to a plan first."
      );
    }
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
      await admin.firestore().collection("users").doc(userId).set(
        { stripeCustomerId: customerId },
        { merge: true }
      );
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { firebaseUserId: userId },
      });
      customerId = customer.id;
      await admin.firestore().collection("users").doc(userId).set(
        { stripeCustomerId: customerId },
        { merge: true }
      );
    }
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      metadata: { firebaseUserId: userId },
    });

    if (!setupIntent.client_secret) {
      throw new Error("Stripe did not return a client secret.");
    }

    return { clientSecret: setupIntent.client_secret };
  } catch (err) {
    console.error("createSetupIntent error:", err);
    throw new functions.https.HttpsError("unknown", err.message);
  }
});

exports.createPortalSession = functions.https.onCall(async (data, context) => {
  // Ensure user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to access the billing portal."
    );
  }

  const userId = context.auth.uid; // The Firebase Auth UID
  // Fetch the user's doc from Firestore
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "User doc not found.");
  }

  const userData = userDoc.data();
  const customerId = userData.stripeCustomerId;
  if (!customerId) {
    throw new functions.https.HttpsError("failed-precondition", "No Stripe customer ID found for this user.");
  }

  try {
    // Create a portal session
    const returnUrl = "https://communityview.ai"; 
    // The URL to which Stripe will redirect after they manage subscription
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: portalSession.url };
  } catch (err) {
    console.error("Error creating billing portal session:", err);
    throw new functions.https.HttpsError("unknown", err.message);
  }
});

exports.cancelSubscription = functions.https.onCall(async (data, context) => {
  // Ensure user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to cancel subscription."
    );
  }

  const userId = context.auth.uid;
  
  // Fetch the user's doc from Firestore
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "User doc not found.");
  }

  const userData = userDoc.data();
  const customerId = userData.stripeCustomerId;
  if (!customerId) {
    throw new functions.https.HttpsError("failed-precondition", "No Stripe customer ID found for this user.");
  }

  try {
    // Get all subscriptions for the customer (not just active)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
    });

    console.log(
      `Found ${subscriptions.data.length} subscriptions for customer:`,
      subscriptions.data.map(s => ({ id: s.id, status: s.status }))
    );

    // Find active or trialing subscriptions
    const activeSubscription = subscriptions.data.find(
      sub => sub.status === "active" || sub.status === "trialing"
    );

    if (!activeSubscription) {
      // No active subscription in Stripe, just update Firestore
      await admin.firestore().collection("users").doc(userId).set(
        { subscriptionStatus: "canceled", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { success: true, message: "Subscription canceled locally (no Stripe subscription found)" };
    }

    // Cancel the subscription in Stripe
    await stripe.subscriptions.cancel(activeSubscription.id);

    console.log("Subscription canceled:", activeSubscription.id);

    // Update Firestore
    await admin.firestore().collection("users").doc(userId).set(
      { subscriptionStatus: "canceled", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { success: true };
  } catch (err) {
    console.error("Error canceling subscription:", err);
    throw new functions.https.HttpsError("unknown", err.message);
  }
});

// 4) deleteAccount (Callable Function)
exports.deleteAccount = functions.https.onCall(async (data, context) => {
  console.log("🗑️ deleteAccount function called");
  
  // Ensure user is logged in
  if (!context.auth) {
    console.error("❌ deleteAccount: No authentication context");
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to delete account."
    );
  }

  const userId = context.auth.uid;
  console.log("🗑️ Deleting account for user ID:", userId);
  
  try {
    // Fetch the user's doc from Firestore
    console.log("📖 Fetching user document from Firestore...");
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const customerId = userData.stripeCustomerId;
    
    console.log("📊 User data found:", {
      hasUserDoc: userDoc.exists,
      hasCustomerId: !!customerId,
      customerId: customerId
    });

    // 1. Cancel any active Stripe subscriptions
    if (customerId) {
      console.log("💳 Processing Stripe subscriptions for customer:", customerId);
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
        });

        console.log(`📋 Found ${subscriptions.data.length} subscriptions`);

        // Cancel all active or trialing subscriptions
        for (const subscription of subscriptions.data) {
          if (subscription.status === "active" || subscription.status === "trialing") {
            console.log(`❌ Canceling subscription: ${subscription.id} (status: ${subscription.status})`);
            await stripe.subscriptions.cancel(subscription.id);
            console.log(`✅ Canceled subscription: ${subscription.id}`);
          }
        }

        // Optionally delete the Stripe customer (commented out to preserve payment history)
        // await stripe.customers.del(customerId);
        // console.log(`✅ Deleted Stripe customer: ${customerId}`);
      } catch (stripeError) {
        console.warn("⚠️ Error handling Stripe data (continuing with deletion):", stripeError);
        // Continue with deletion even if Stripe operations fail
      }
    } else {
      console.log("ℹ️ No Stripe customer ID found, skipping Stripe cleanup");
    }

    // 2. Delete user data from Firestore
    console.log("🗄️ Deleting user data from Firestore...");
    try {
      await admin.firestore().collection("users").doc(userId).delete();
      console.log("✅ User data deleted from Firestore");
    } catch (firestoreError) {
      console.error("❌ Error deleting Firestore data:", firestoreError);
      // Continue with account deletion even if Firestore delete fails
    }

    // 3. Delete the Firebase Auth user account
    console.log("🔐 Deleting Firebase Auth user account...");
    try {
      await admin.auth().deleteUser(userId);
      console.log("✅ Firebase Auth user account deleted");
    } catch (authError) {
      console.error("❌ Error deleting Firebase Auth user:", authError);
      throw new functions.https.HttpsError("unknown", `Failed to delete user account: ${authError.message}`);
    }

    console.log("✅ Account deletion completed successfully for user:", userId);
    return { success: true, message: "Account deleted successfully" };
  } catch (err) {
    console.error("❌ Error deleting account:", err);
    console.error("❌ Error stack:", err.stack);
    throw new functions.https.HttpsError("internal", `Failed to delete account: ${err.message}`);
  }
});

// =============== Map Functions ===============

// Helper function to generate unique share token
function generateShareToken() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

const EMPTY_LISTING_AGENT = {
  name: "",
  email: "",
  phone: "",
  photoUrl: "",
  logoUrl: "",
};

/** Load account profile contact/branding from Firestore users/{uid}. */
async function getOwnerListingAgent(userId) {
  if (!userId) return { ...EMPTY_LISTING_AGENT };
  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    if (!userDoc.exists) return { ...EMPTY_LISTING_AGENT };
    const u = userDoc.data() || {};
    const name = [u.firstName, u.lastName]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ");
    return {
      name,
      email: String(u.contactEmail || u.email || "").trim(),
      phone: String(u.contactPhone || "").trim(),
      photoUrl: String(u.profilePhotoUrl || "").trim(),
      logoUrl: String(u.firmLogoUrl || "").trim(),
    };
  } catch (err) {
    console.warn("getOwnerListingAgent failed:", err.message || err);
    return { ...EMPTY_LISTING_AGENT };
  }
}

function mergeListingAgent(liveAgent, snapshotAgent) {
  const snap = snapshotAgent && typeof snapshotAgent === "object" ? snapshotAgent : {};
  const live = liveAgent && typeof liveAgent === "object" ? liveAgent : EMPTY_LISTING_AGENT;
  return {
    name: live.name || String(snap.name || "").trim(),
    email: live.email || String(snap.email || "").trim(),
    phone: live.phone || String(snap.phone || "").trim(),
    photoUrl: live.photoUrl || String(snap.photoUrl || "").trim(),
    logoUrl: live.logoUrl || String(snap.logoUrl || "").trim(),
  };
}

function listingAgentResponseFields(listingAgent) {
  const agent = listingAgent || EMPTY_LISTING_AGENT;
  return {
    listingAgent: agent,
    agentName: agent.name,
    agentEmail: agent.email,
    agentPhone: agent.phone,
    agentPhotoUrl: agent.photoUrl,
    agentLogoUrl: agent.logoUrl,
  };
}

// Save a new map
exports.saveMap = functions.https.onCall(async (data, context) => {
  // Ensure user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to save maps."
    );
  }

  const userId = context.auth.uid;
  const { mapData } = data;

  if (!mapData) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Map data is required."
    );
  }

  try {
    const shareToken = generateShareToken();
    
    const mapDoc = {
      userId: userId,
      title: mapData.title || `Map ${new Date().toLocaleDateString()}`,
      description: mapData.description || "",
      schemaVersion: mapData.schemaVersion || 2,
      viewport: mapData.viewport || null,
      basemap: mapData.basemap || "high-def-3inch",
      layers: mapData.layers || {
        status: {},
        order: [],
        labels: {},
      },
      printSettings: mapData.printSettings || {
        paperSize: "full",
        orientation: "full",
      },
      printElements: Array.isArray(mapData.printElements) ? mapData.printElements : [],
      isPublic: false,
      shareToken: shareToken,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await admin.firestore()
      .collection("maps")
      .add(mapDoc);

    await userMapIndexRef(userId, docRef.id).set(buildMapIndexPayload(docRef.id, mapDoc));

    console.log("Map saved:", { mapId: docRef.id, userId, shareToken });

    return {
      mapId: docRef.id,
      shareToken: shareToken,
    };
  } catch (error) {
    console.error("Error saving map:", error);
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

// Update an existing map
exports.updateMap = functions.https.onCall(async (data, context) => {
  // Ensure user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to update maps."
    );
  }

  const userId = context.auth.uid;
  const { mapId, mapData } = data;

  if (!mapId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Map ID is required."
    );
  }

  if (!mapData) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Map data is required."
    );
  }

  try {
    // Verify ownership
    const mapDoc = await admin.firestore().collection("maps").doc(mapId).get();
    
    if (!mapDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Map not found.");
    }

    if (mapDoc.data().userId !== userId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have permission to update this map."
      );
    }

    // Prepare update data (only include fields that are provided)
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (mapData.title !== undefined) updateData.title = mapData.title;
    if (mapData.description !== undefined) updateData.description = mapData.description;
    if (mapData.schemaVersion !== undefined) updateData.schemaVersion = mapData.schemaVersion;
    if (mapData.viewport !== undefined) updateData.viewport = mapData.viewport;
    if (mapData.basemap !== undefined) updateData.basemap = mapData.basemap;
    if (mapData.layers !== undefined) updateData.layers = mapData.layers;
    if (mapData.printSettings !== undefined) updateData.printSettings = mapData.printSettings;
    if (mapData.printElements !== undefined) {
      updateData.printElements = Array.isArray(mapData.printElements) ? mapData.printElements : [];
    }
    if (mapData.isPublic !== undefined) {
      updateData.isPublic = mapData.isPublic;
      if (mapData.isPublic === true) {
        updateData.listingAgent = await getOwnerListingAgent(userId);
      }
    }

    await admin.firestore().collection("maps").doc(mapId).update(updateData);

    const indexPatch = { updatedAt: updateData.updatedAt };
    if (mapData.title !== undefined) indexPatch.title = mapData.title;
    if (mapData.description !== undefined) indexPatch.description = mapData.description;
    if (mapData.basemap !== undefined) indexPatch.basemap = mapData.basemap;
    if (mapData.isPublic !== undefined) indexPatch.isPublic = mapData.isPublic;
    await userMapIndexRef(userId, mapId).set(indexPatch, { merge: true });

    console.log("Map updated:", { mapId, userId });

    return { success: true };
  } catch (error) {
    console.error("Error updating map:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

function timestampToMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  return null;
}

function userMapIndexRef(userId, mapId) {
  return admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("mapIndex")
    .doc(mapId);
}

/** Build small index doc (stored under users/{uid}/mapIndex/{mapId}). */
function buildMapIndexPayload(mapId, d) {
  return {
    mapId,
    title: d.title || "",
    description: d.description || "",
    basemap: d.basemap || "high-def-3inch",
    isPublic: !!d.isPublic,
    shareToken: d.shareToken || null,
    updatedAt: d.updatedAt || admin.firestore.FieldValue.serverTimestamp(),
    createdAt: d.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  };
}

/** Lightweight row for the saved-maps dashboard (no printElements / layers payload). */
function mapSummaryFromDoc(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    title: d.title || "",
    description: d.description || "",
    basemap: d.basemap || "high-def-3inch",
    isPublic: !!d.isPublic,
    shareToken: d.shareToken || null,
    updatedAt: timestampToMillis(d.updatedAt),
    createdAt: timestampToMillis(d.createdAt),
  };
}

function mapSummaryFromIndexDoc(doc) {
  const d = doc.data();
  const mapId = d.mapId || doc.id;
  return {
    id: mapId,
    title: d.title || "",
    description: d.description || "",
    basemap: d.basemap || "high-def-3inch",
    isPublic: !!d.isPublic,
    shareToken: d.shareToken || null,
    updatedAt: timestampToMillis(d.updatedAt),
    createdAt: timestampToMillis(d.createdAt),
  };
}

async function backfillUserMapIndex(userId, mapDocs) {
  if (!mapDocs.length) return;
  const batch = admin.firestore().batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  mapDocs.forEach((doc) => {
    const d = doc.data();
    batch.set(userMapIndexRef(userId, doc.id), {
      ...buildMapIndexPayload(doc.id, d),
      updatedAt: d.updatedAt || now,
      createdAt: d.createdAt || now,
    });
  });
  await batch.commit();
}

/** Prefer small mapIndex docs; fall back to full maps query + one-time backfill. */
async function fetchUserMapSummaries(userId) {
  const indexCol = admin.firestore().collection("users").doc(userId).collection("mapIndex");
  let indexSnap;
  try {
    indexSnap = await indexCol.orderBy("updatedAt", "desc").get();
  } catch (indexError) {
    if (indexError.code === 9 || String(indexError.message || "").includes("index")) {
      indexSnap = await indexCol.get();
    } else {
      throw indexError;
    }
  }

  if (indexSnap && !indexSnap.empty) {
    let maps = indexSnap.docs.map((doc) => mapSummaryFromIndexDoc(doc));
    if (maps.length > 0 && maps[0].updatedAt == null) {
      maps.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return maps;
  }

  let snapshot;
  try {
    snapshot = await admin
      .firestore()
      .collection("maps")
      .where("userId", "==", userId)
      .orderBy("updatedAt", "desc")
      .get();
  } catch (indexError) {
    if (indexError.code === 9 || String(indexError.message || "").includes("index")) {
      snapshot = await admin
        .firestore()
        .collection("maps")
        .where("userId", "==", userId)
        .get();
    } else {
      throw indexError;
    }
  }

  const maps = snapshot.docs.map((doc) => mapSummaryFromDoc(doc));
  if (maps.length > 0 && maps[0].updatedAt != null) {
    maps.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  try {
    await backfillUserMapIndex(userId, snapshot.docs);
  } catch (err) {
    console.warn("mapIndex backfill failed (list still returned):", err.message);
  }

  return maps;
}

/** Full map document for edit / restore (owner only). */
function mapDetailFromDoc(doc) {
  const m = doc.data();
  const tourNearbyCache = normalizeTourNearbyCache(m.tourNearbyCache);
  return {
    id: doc.id,
    title: m.title || "",
    description: m.description || "",
    schemaVersion: m.schemaVersion || 2,
    viewport: m.viewport || null,
    basemap: m.basemap || "high-def-3inch",
    layers: m.layers || { status: {}, order: [], labels: {} },
    printSettings: m.printSettings || { paperSize: "full", orientation: "full" },
    printElements: Array.isArray(m.printElements) ? m.printElements : [],
    isPublic: !!m.isPublic,
    shareToken: m.shareToken || null,
    tourNearbyCache,
    updatedAt: timestampToMillis(m.updatedAt),
    createdAt: timestampToMillis(m.createdAt),
  };
}

// Get all maps for the current user
exports.getUserMaps = functions.https.onCall(async (data, context) => {
  // Ensure user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to view maps."
    );
  }

  const userId = context.auth.uid;

  try {
    const maps = await fetchUserMapSummaries(userId);
    console.log(`Retrieved ${maps.length} map summaries for user:`, userId);
    return maps;
  } catch (error) {
    console.error("Error getting user maps:", error);
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

/** Load one owned map with full state (for edit mode). */
exports.getMapById = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to load maps."
    );
  }

  const userId = context.auth.uid;
  const mapId = data && data.mapId;

  if (!mapId || typeof mapId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "mapId is required.");
  }

  try {
    const mapDoc = await admin.firestore().collection("maps").doc(mapId).get();

    if (!mapDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Map not found.");
    }

    if (mapDoc.data().userId !== userId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have permission to view this map."
      );
    }

    return mapDetailFromDoc(mapDoc);
  } catch (error) {
    console.error("Error getMapById:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

/** Public shared map doc by share token (isPublic). */
async function findPublicMapDocByShareToken(token) {
  const snap = await admin
    .firestore()
    .collection("maps")
    .where("shareToken", "==", token)
    .limit(5)
    .get();

  const doc = snap.docs.find((d) => d.data().isPublic === true);
  if (!doc) return null;
  return { id: doc.id, ref: doc.ref, data: doc.data() };
}

/**
 * Public read: load a map by share token (must be isPublic).
 * Callable without sign-in for client share links.
 */
exports.getSharedMapByToken = functions.https.onCall(async (data) => {
  const token = data && data.shareToken;
  if (!token || typeof token !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "shareToken is required."
    );
  }

  try {
    const found = await findPublicMapDocByShareToken(token);
    if (!found) {
      throw new functions.https.HttpsError(
        "not-found",
        "Map not found or not shared."
      );
    }

    const m = found.data;
    const tourNearbyCache = normalizeTourNearbyCache(m.tourNearbyCache);
    const liveAgent = await getOwnerListingAgent(m.userId);
    const listingAgent = mergeListingAgent(liveAgent, m.listingAgent);
    return {
      id: found.id,
      title: m.title || "",
      description: m.description || "",
      schemaVersion: m.schemaVersion || 2,
      viewport: m.viewport || null,
      basemap: m.basemap || "high-def-3inch",
      layers: m.layers || { status: {}, order: [], labels: {} },
      printSettings: m.printSettings || { paperSize: "full", orientation: "full" },
      printElements: Array.isArray(m.printElements) ? m.printElements : [],
      shareToken: m.shareToken,
      tourNearbyCache,
      updatedAt: m.updatedAt && m.updatedAt.toMillis ? m.updatedAt.toMillis() : null,
      ...listingAgentResponseFields(listingAgent),
    };
  } catch (error) {
    console.error("Error getSharedMapByToken:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

/**
 * Persist tour nearby amenity GeoJSON on the shared map (public tours).
 * Callable without sign-in; only updates `tourNearbyCache` on a public map.
 */
exports.saveTourNearbyCache = functions.https.onCall(async (data) => {
  const token = data && data.shareToken;
  const incoming = data && data.tourNearbyCache;
  if (!token || typeof token !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "shareToken is required.");
  }
  if (!incoming || typeof incoming !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "tourNearbyCache is required.");
  }

  try {
    const found = await findPublicMapDocByShareToken(token);
    if (!found) {
      throw new functions.https.HttpsError("not-found", "Map not found or not shared.");
    }

    const merged = mergeTourNearbyCachePayload(found.data.tourNearbyCache, incoming);
    if (!merged) {
      throw new functions.https.HttpsError("invalid-argument", "tourNearbyCache payload is invalid.");
    }

    await found.ref.update({
      tourNearbyCache: merged,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("saveTourNearbyCache", {
      mapId: found.id,
      amenityKeys: Object.keys(merged.byAmenity || {}),
    });

    return { success: true, tourNearbyCache: merged };
  } catch (error) {
    console.error("Error saveTourNearbyCache:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

// Delete a map
exports.deleteMap = functions.https.onCall(async (data, context) => {
  // Ensure user is logged in
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to delete maps."
    );
  }

  const userId = context.auth.uid;
  const { mapId } = data;

  if (!mapId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Map ID is required."
    );
  }

  try {
    // Verify ownership
    const mapDoc = await admin.firestore().collection("maps").doc(mapId).get();
    
    if (!mapDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Map not found.");
    }

    if (mapDoc.data().userId !== userId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have permission to delete this map."
      );
    }

    await admin.firestore().collection("maps").doc(mapId).delete();
    await userMapIndexRef(userId, mapId).delete().catch(() => {});

    try {
      const bucket = admin.storage().bucket();
      await bucket.deleteFiles({
        prefix: `users/${userId}/maps/${mapId}/photos/`,
      });
    } catch (storageErr) {
      console.warn("Map photo storage cleanup:", storageErr.message || storageErr);
    }

    console.log("Map deleted:", { mapId, userId });

    return { success: true };
  } catch (error) {
    console.error("Error deleting map:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("unknown", error.message);
  }
});

const {
  AMENITIES_WITH_LENIENT_FALLBACK,
  isAllowedGooglePlaceForAmenity,
} = require("./nearbyAmenityFilters");
const { fetchTourNearbyPlacesNew } = require("./placesApiNew");

/** Keep in sync with `src/utils/propertyTourSlides.js` / `tourNearbyRanking.js`. */
const NEARBY_FETCH_RADIUS_METERS = 25000;
const NEARBY_TOUR_DATA_VERSION = 26;

/** Tour vicinity: Places API (New) `includedTypes` per amenity key. */
const NEARBY_TYPES_BY_AMENITY = {
  parks_rec: ["park"],
  grocery: ["supermarket", "grocery_store"],
  schools: ["primary_school", "secondary_school", "school"],
  fitness: ["gym"],
  trailheads: ["hiking_area", "gym"],
  essentials: ["pharmacy", "drugstore", "hardware_store", "bank"],
  coffee: ["cafe", "coffee_shop"],
  transit: ["subway_station", "train_station", "bus_station", "transit_station"],
  airport: ["airport"],
};

/** Exclude Google Places rows that are heliports / helipads even when returned under airport search. */
function isRealAirportGooglePlace(place) {
  const types = Array.isArray(place.types) ? place.types : [];
  if (types.includes("heliport")) return false;
  if (types.includes("helistop")) return false;
  const name = String(place.name || "").toLowerCase();
  if (/\bhelipad\b|\bheliport\b|\bhelistop\b/.test(name)) return false;
  return types.includes("airport");
}

/**
 * Public callable: nearby POIs for shared property tour (no sign-in required).
 *
 * Returns GeoJSON with per-place:
 * - `rating`, `user_ratings_total` (Google Nearby Search)
 * - `distanceText`, `driveMinutesEst`, `straightLineMiles` (server straight-line estimate;
 *   the web app may refine distance/time via Mapbox when `REACT_APP_MAPBOX_ACCESS_TOKEN` is set)
 *
 * Configure: `firebase functions:config:set google.places_key="YOUR_KEY"`
 * Enable **Places API (New)** on the key in Google Cloud (not legacy Places API only).
 */
function buildNearbyFeaturesFromGoogleResults(all, amenityKey, options = {}) {
  const lenient = options.lenient === true;
  const seen = new Set();
  const features = [];
  for (const r of all) {
    if (!r.place_id || seen.has(r.place_id)) continue;
    if (amenityKey === "airport" && !isRealAirportGooglePlace(r)) continue;
    if (!isAllowedGooglePlaceForAmenity(r, amenityKey, r.name, { lenient })) continue;
    seen.add(r.place_id);
    const loc = r.geometry && r.geometry.location;
    const plat = Number(loc && loc.lat);
    const plng = Number(loc && loc.lng);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;

    const displayName = String(r.name || r.vicinity || "").trim();
    if (!displayName) continue;
    if (r.business_status === "CLOSED_PERMANENTLY") continue;

    const placeId = String(r.place_id || "").trim();
    const props = {
      name: displayName,
      amenityKey,
      place_id: placeId,
      placeId,
    };
    if (typeof r.rating === "number" && Number.isFinite(r.rating)) {
      props.rating = r.rating;
    }
    if (typeof r.user_ratings_total === "number" && Number.isFinite(r.user_ratings_total)) {
      props.user_ratings_total = r.user_ratings_total;
    }
    if (r.vicinity != null && String(r.vicinity).trim()) {
      props.vicinity = String(r.vicinity).trim();
    }
    if (r.business_status != null && String(r.business_status).trim()) {
      props.business_status = String(r.business_status).trim();
    }
    if (Array.isArray(r.types) && r.types.length) {
      props.googleTypes = r.types.map((t) => String(t));
    }
    if (r.photoUrl != null && String(r.photoUrl).trim()) {
      props.photoUrl = String(r.photoUrl).trim();
    }

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [plng, plat] },
      properties: props,
    });
  }
  return features;
}

exports.getNearbyGooglePlaces = functions.https.onCall(async (data) => {
  const lat = Number(data && data.lat);
  const lng = Number(data && data.lng);
  const fetchRadiusMeters = Math.min(
    50000,
    Math.max(500, Number(data && data.radiusMeters) || NEARBY_FETCH_RADIUS_METERS)
  );
  const amenityKey = data && data.amenityKey != null ? String(data.amenityKey).trim() : "";
  const shareToken =
    data && data.shareToken != null ? String(data.shareToken).trim() : "";
  const searchCenter = { lat, lng };

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !amenityKey) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "lat, lng, and amenityKey are required."
    );
  }

  let mapRef = null;
  let mapData = null;
  if (shareToken) {
    const found = await findPublicMapDocByShareToken(shareToken);
    if (found) {
      mapRef = found.ref;
      mapData = found.data;
      const cached = readAmenityFromTourCache(mapData, amenityKey, searchCenter);
      if (cached) {
        console.log("getNearbyGooglePlaces cache hit", { amenityKey, shareToken });
        return cached;
      }
    }
  }

  const key =
    (functions.config().google && functions.config().google.places_key) ||
    process.env.GOOGLE_PLACES_KEY ||
    "";
  if (!key) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Google Places API key is not configured. " +
        "Run: firebase functions:config:set google.places_key=\"YOUR_KEY\" then redeploy."
    );
  }

  console.log("getNearbyGooglePlaces request", {
    amenityKey,
    lat,
    lng,
    fetchRadiusMeters,
    shareToken: shareToken || null,
    keyConfigured: key.length > 10,
  });

  const types = NEARBY_TYPES_BY_AMENITY[amenityKey];
  if (!Array.isArray(types) || !types.length) {
    return { type: "FeatureCollection", features: [] };
  }

  let all = [];
  try {
    all = await fetchTourNearbyPlacesNew(lat, lng, fetchRadiusMeters, key, types);
  } catch (placesErr) {
    console.error("getNearbyGooglePlaces Places API (New) error:", placesErr);
    throw new functions.https.HttpsError(
      "failed-precondition",
      placesErr?.message || "Places API (New) request failed"
    );
  }

  let features = buildNearbyFeaturesFromGoogleResults(all, amenityKey, { lenient: false });
  if (!features.length && all.length && AMENITIES_WITH_LENIENT_FALLBACK.has(amenityKey)) {
    features = buildNearbyFeaturesFromGoogleResults(all, amenityKey, { lenient: true });
  }

  if (!features.length && all.length && amenityKey === "parks_rec") {
    const fallbackSeen = new Set();
    for (const r of all) {
      if (!r.place_id || fallbackSeen.has(r.place_id)) continue;
      if (r.business_status === "CLOSED_PERMANENTLY") continue;
      const loc = r.geometry && r.geometry.location;
      const plat = Number(loc && loc.lat);
      const plng = Number(loc && loc.lng);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
      const displayName = String(r.name || r.vicinity || "").trim();
      if (!displayName) continue;
      fallbackSeen.add(r.place_id);
      const placeId = String(r.place_id || "").trim();
      const props = {
        name: displayName,
        amenityKey,
        place_id: placeId,
        placeId,
      };
      if (Array.isArray(r.types) && r.types.length) {
        props.googleTypes = r.types.map((t) => String(t));
      }
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [plng, plat] },
        properties: props,
      });
      if (features.length >= 12) break;
    }
  }

  const out = enrichNearbyTourFeatureCollection(
    { lat, lng },
    { type: "FeatureCollection", features },
    amenityKey
  );
  console.log("getNearbyGooglePlaces result", {
    amenityKey,
    rawFromGoogle: all.length,
    featuresBuilt: features.length,
    featuresReturned: out.features?.length ?? 0,
    nearbyDataVersion: NEARBY_TOUR_DATA_VERSION,
  });

  const response = { ...out, nearbyDataVersion: NEARBY_TOUR_DATA_VERSION };

  if (mapRef && shareToken) {
    const payload = buildSingleAmenityCachePayload(searchCenter, amenityKey, response);
    if (payload) {
      const merged = mergeTourNearbyCachePayload(mapData && mapData.tourNearbyCache, payload);
      if (merged) {
        try {
          await mapRef.update({
            tourNearbyCache: merged,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log("getNearbyGooglePlaces cache saved", { amenityKey, shareToken });
        } catch (cacheErr) {
          console.error("getNearbyGooglePlaces cache save failed:", cacheErr);
        }
      }
    }
  }

  return response;
});

const { regridApi } = require("./regridHandlers");
exports.regridApi = regridApi;
exports.regridTileProxy = require("./regridTileProxy").regridTileProxy;
