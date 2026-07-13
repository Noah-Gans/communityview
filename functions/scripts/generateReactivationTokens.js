#!/usr/bin/env node
/**
 * Generate one-time win-back links for existing Firebase Auth users.
 *
 * Usage:
 *   node scripts/generateReactivationTokens.js emails.txt
 *   node scripts/generateReactivationTokens.js emails.txt --campaign spring-2026
 *   REACTIVATION_BASE_URL=http://localhost:3000/signup node scripts/generateReactivationTokens.js emails.txt
 *
 * emails.txt: one email per line (blank lines and # comments ignored)
 *
 * Requires Application Default Credentials, e.g.:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 * or: gcloud auth application-default login
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { createReactivationTokenForEmail } = require("../reactivationTokens");

if (!admin.apps.length) {
  admin.initializeApp();
}

function parseArgs(argv) {
  const args = { file: null, campaign: "winback", baseUrl: process.env.REACTIVATION_BASE_URL };
  const positional = [];

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--campaign" && argv[i + 1]) {
      args.campaign = argv[++i];
    } else if (arg === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[++i];
    } else {
      positional.push(arg);
    }
  }

  args.file = positional[0] || null;
  return args;
}

function readEmails(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function main() {
  const { file, campaign, baseUrl } = parseArgs(process.argv);

  if (!file) {
    console.error("Usage: node scripts/generateReactivationTokens.js <emails.txt> [--campaign name]");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const emails = readEmails(filePath);
  if (emails.length === 0) {
    console.error("No emails found in file.");
    process.exit(1);
  }

  console.log("email,token,link,expiresAt,status");

  for (const email of emails) {
    try {
      const result = await createReactivationTokenForEmail(email, {
        campaign,
        baseUrl: baseUrl || "https://communityview.ai/signup",
      });

      if (result.error) {
        console.log(`${email},,,,${result.error}`);
        continue;
      }

      const escapedLink = `"${result.link}"`;
      console.log(`${result.email},${result.token},${escapedLink},${result.expiresAt},ok`);
    } catch (err) {
      console.log(`${email},,,,error:${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
