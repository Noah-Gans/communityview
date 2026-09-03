/**
 * Cloud Function: curate neighborhood-map amenity candidates with Gemini.
 * Key: firebase functions config listing.gemini_api_key (same as listing tools).
 */
const functions = require("firebase-functions");

function str(v) {
  return String(v == null ? "" : v).trim();
}

function getGeminiKey() {
  let cfg = {};
  try {
    cfg = functions.config() || {};
  } catch (_) {
    cfg = {};
  }
  return str(
    (cfg.listing && cfg.listing.gemini_api_key) ||
      (cfg.google && cfg.google.gemini_key) ||
      process.env.LISTING_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      ""
  );
}

function getGeminiModel() {
  let cfg = {};
  try {
    cfg = functions.config() || {};
  } catch (_) {
    cfg = {};
  }
  return str(
    (cfg.listing && cfg.listing.gemini_model) ||
      (cfg.google && cfg.google.gemini_model) ||
      process.env.GEMINI_MODEL ||
      "gemini-3.5-flash"
  );
}

/**
 * @param {object} payload
 * @param {string} payload.address
 * @param {string} [payload.placeLabel]
 * @param {Array<object>} payload.candidates
 * @param {'default'|'sparse'} [payload.density]
 */
async function callGeminiCurate(payload) {
  const key = getGeminiKey();
  if (!key) return null;

  const model = getGeminiModel();
  const address = str(payload.address) || "the subject property";
  const place = str(payload.placeLabel);
  const density = payload.density === "sparse" ? "sparse" : "default";
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!candidates.length) return null;

  const compact = candidates.map((c) => ({
    id: str(c.id),
    name: str(c.name),
    category: str(c.category || c.amenityKey),
    miles: c.miles != null ? Number(c.miles) : null,
    rating: c.rating != null ? Number(c.rating) : null,
    reviews: c.reviews != null ? Number(c.reviews) : null,
  }));

  const densityLines =
    density === "sparse"
      ? [
          "Target 12–16 places total — sparse enough that pins are readable and spread out.",
          "Hard cap: never return more than 16 placeIds.",
          "Prioritize geographic spread across the neighborhood (avoid stacking near the home).",
          "Prefer the best 1–2 per category over filling every slot.",
        ]
      : [
          "Target 20–26 places total — enough coverage without a wall of pins.",
        ];

  const prompt = [
    "You curate a real-estate neighborhood amenities map for a listing agent.",
    "Pick places a buyer would actually care about on a one-page neighborhood map.",
    "INCLUDE: well-known restaurants, cafes, grocery, parks, fitness, everyday essentials.",
    "EXCLUDE: random office buildings, HOAs, corporate HQs, coworking, unnamed establishments,",
    "generic 'point of interest', apartments, real-estate offices, parking garages, and anything",
    "that is not a useful lifestyle amenity for marketing the home.",
    "Prefer close + highly rated + well-reviewed. Prefer geographic spread (not all stacked).",
    "IMPORTANT: Include at least 1 place from EACH category that has candidates",
    "(Dining, Coffee, Grocery, Fitness, Parks, Essentials) when available.",
    ...densityLines,
    "Return ONLY valid JSON:",
    "{ \"placeIds\": [\"id1\",\"id2\",...], \"notes\": \"one short sentence\" }",
    "placeIds must be chosen from the candidate id list only, in preferred map order.",
    "",
    `Subject property: ${JSON.stringify(address)}`,
    place ? `Area context: ${JSON.stringify(place)}` : "",
    "Candidates JSON:",
    JSON.stringify(compact),
  ]
    .filter(Boolean)
    .join("\n");

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 240)}`);
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  // Prefer non-thought parts, but fall back to all text if needed.
  let text = parts
    .filter((p) => p && !p.thought)
    .map((p) => p.text || "")
    .join("");
  if (!str(text)) {
    text = parts.map((p) => p.text || "").join("");
  }
  const cleaned = String(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let placeIds = [];
  let notes = "";
  try {
    const parsed = JSON.parse(cleaned);
    placeIds = Array.isArray(parsed.placeIds)
      ? parsed.placeIds.map((id) => str(id)).filter(Boolean)
      : [];
    notes = str(parsed.notes);
  } catch (_) {
    const m = cleaned.match(/"placeIds"\s*:\s*\[([\s\S]*?)\]/);
    if (m) {
      placeIds = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => str(x[1])).filter(Boolean);
    }
    if (!placeIds.length) {
      throw new Error(
        `Gemini returned unparseable JSON (${cleaned.slice(0, 120)})`
      );
    }
  }
  if (density === "sparse") placeIds = placeIds.slice(0, 16);
  return {
    placeIds,
    notes,
    source: "gemini",
    model,
  };
}

/** Internal helper for marketing / HTTP pipelines (no auth). */
exports.curateNeighborhoodAmenityIds = callGeminiCurate;

exports.curateNeighborhoodAmenities = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Sign in to curate neighborhood amenities."
    );
  }

  const address = str(data?.address);
  const placeLabel = str(data?.placeLabel);
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  if (!candidates.length) {
    return { placeIds: [], source: "empty", notes: "" };
  }

  try {
    const ai = await callGeminiCurate({ address, placeLabel, candidates });
    if (ai && ai.placeIds.length) {
      try {
        const admin = require("firebase-admin");
        await admin.firestore().collection("marketingGenerations").add({
          uid: context.auth.uid,
          type: "neighborhood_amenity_curate",
          candidateCount: candidates.length,
          pickedCount: ai.placeIds.length,
          address: address || null,
          source: "gemini",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (_) {
        /* non-fatal */
      }
      return ai;
    }
  } catch (err) {
    console.warn("curateNeighborhoodAmenities Gemini failed:", err.message || err);
  }

  // Fallback: empty — client applies heuristic selection.
  return { placeIds: [], source: "fallback", notes: "AI unavailable" };
});
