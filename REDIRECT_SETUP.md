# Domain Redirect Setup Guide

## Canonical host: `communityview.ai` (no www)

Use the **apex** domain as the real site. Send `www` there with a permanent redirect.

### Namecheap (Advanced DNS) — www → apex

1. Open [Namecheap](https://ap.www.namecheap.com/) → Domain List → `communityview.ai` → **Advanced DNS**
2. Find any existing `www` record (A / CNAME / URL Redirect)
3. Set `www` to a **URL Redirect Record**:
   - Host: `www`
   - Value: `https://communityview.ai/`
   - Prefer **Permanent (301)** if Namecheap offers it
4. Keep apex (`@`) pointed at your live host (Firebase / GitHub Pages) — do **not** use the Domain tab “Redirect Domain” box for this; that forwards the whole domain elsewhere
5. In Google Search Console, use `https://communityview.ai` as the primary property and request indexing after deploy

The web app also soft-redirects `www.communityview.ai` → apex in the browser as a backup. DNS/hosting **301** is what transfers SEO.

---

## Redirecting tetoncountygis.com → communityview.ai

### Option 1: DNS/Hosting Provider Redirect (RECOMMENDED - Best for SEO)

Since you're using GitHub Pages, you need to set up the redirect at your DNS/hosting provider level:

#### If tetoncountygis.com is hosted on:

- **GitHub Pages**: Add a CNAME record pointing to your GitHub Pages site, then use a meta redirect (see Option 2)
- **Cloudflare**: Use Page Rules to redirect all traffic
- **Namecheap/GoDaddy/etc**: Use their domain redirect service
- **Custom hosting**: Set up 301 redirects in .htaccess (Apache) or nginx config

#### Cloudflare Setup (if using Cloudflare):

1. Go to Cloudflare Dashboard → Rules → Redirect Rules
2. Create a new rule:
  - Source URL: `tetoncountygis.com/`*
  - Destination URL: `https://communityview.ai/$1`
  - Status Code: 301 (Permanent Redirect)
  - Preserve Query String: Yes

### Option 2: Meta Redirect (Fallback - Not ideal for SEO)

If you can't set up server-level redirects, add this to the old site's index.html:

```html
<meta http-equiv="refresh" content="0; url=https://communityview.ai">
```

### Option 3: JavaScript Redirect (Last Resort)

```html
<script>
  window.location.replace("https://communityview.ai" + window.location.pathname + window.location.search);
</script>
```

---

## Firebase Configuration

### Step 1: Add communityview.ai to Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **tetoncountygis**
3. Go to: **Authentication** → **Settings** → **Authorized domains**
4. Click **Add domain**
5. Add:
  - `communityview.ai`
  - `www.communityview.ai`
  - `tetoncountygis.com` (keep this for redirects)

### Step 2: Update Firebase Hosting (if using Firebase Hosting)

If you're also hosting on Firebase, update `firebase.json`:

```json
{
  "hosting": {
    "public": "build",
    "site": "tetoncountygis",
    "redirects": [
      {
        "source": "https://tetoncountygis.com/**",
        "destination": "https://communityview.ai/**",
        "type": 301
      }
    ]
  }
}
```

### Step 3: Verify Firebase Works on New Domain

Your current Firebase config will work on `communityview.ai` once you:

- ✅ Add the domain to authorized domains (Step 1)
- ✅ The `authDomain` can stay as `tetoncountygis.firebaseapp.com` (this is fine)
- ✅ All Firebase services (Auth, Firestore, Functions) will work across both domains

---

## SEO Considerations

1. **301 Redirects**: Use 301 (permanent) redirects to preserve SEO value
2. **Update Sitemap**: Make sure your sitemap uses `communityview.ai` URLs
3. **Update Internal Links**: Change any hardcoded links from old domain to new
4. **Google Search Console**:
  - Add both properties
  - Submit change of address in old property pointing to new domain
  - This helps Google transfer ranking signals

---

## Testing

After setup, test:

1. Visit `www.communityview.ai` → should redirect to `communityview.ai`
2. Visit `tetoncountygis.com` → should redirect to `communityview.ai`
3. Visit `tetoncountygis.com/map` → should redirect to `communityview.ai/map`
4. Test Firebase Auth login on `communityview.ai` → should work
5. Check browser console for any Firebase errors
