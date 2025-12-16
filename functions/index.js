const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
console.log("Admin SDK Project ID:", admin.app().options.projectId);
const stripe = require("stripe")(functions.config().stripe.secret, {
  apiVersion: "2023-10-16", // Use a specific API version
});
const express = require("express");
const bodyParser = require("body-parser");

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
    const returnUrl = "https://tetoncountygis.com"; 
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
