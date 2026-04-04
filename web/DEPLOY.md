# NatureFind Web — Cloudflare Pages Deployment

## What's in this folder

| File | Purpose |
|---|---|
| `index.html` | Main landing page |
| `privacy.html` | Privacy policy (required for App Store) |

No build step required — pure HTML/CSS, no dependencies.

---

## Step 1 — Register your domain

1. Go to [cloudflare.com](https://cloudflare.com) → log in or create a free account
2. In the left sidebar → **Domain Registration** → **Register Domains**
3. Search for `naturefind.app`
4. Purchase it (~$10–14/year for `.app`)

> **Note:** `.app` domains require HTTPS — Cloudflare Pages provides this automatically.

---

## Step 2 — Deploy to Cloudflare Pages

### Option A: Upload via dashboard (easiest, no git required)

1. In Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** tab
2. Click **"Upload assets"**
3. Name the project: `naturefind` (or `naturefind-web`)
4. Drag the entire `web/` folder contents (both `.html` files) onto the upload area
5. Click **Deploy site**
6. You'll get a free URL like `naturefind.pages.dev` — test it here first

### Option B: Connect GitHub (auto-deploys on every push)

1. Push the `web/` folder to a GitHub repo (e.g., `naturefind-web`)
2. In Cloudflare Pages → **Create** → **Connect to Git**
3. Select your repo
4. Build settings:
   - **Framework preset:** None
   - **Build command:** (leave blank)
   - **Build output directory:** `/` (or wherever the HTML files are)
5. Click **Save and Deploy**

---

## Step 3 — Connect your custom domain

1. After deploying, go to your Pages project → **Custom domains** tab
2. Click **Set up a custom domain**
3. Enter: `naturefind.app`
4. Cloudflare will auto-configure the DNS since you registered through them
5. Also add `www.naturefind.app` → redirect to `naturefind.app`

SSL certificate is provisioned automatically (usually within a few minutes).

---

## Step 4 — Update the App Store listing

Once live, add to your App Store Connect listing:

- **Marketing URL:** `https://naturefind.app`
- **Privacy Policy URL:** `https://naturefind.app/privacy.html`
- **Support URL:** `https://naturefind.app` (or a support email)

The App Store **requires** a privacy policy URL. Use:
```
https://naturefind.app/privacy.html
```

---

## Step 5 — Update email address

The privacy policy references `support@naturefind.app`. Once your domain is live:

1. In Cloudflare → **Email Routing** → enable it for `naturefind.app`
2. Add a route: `support@naturefind.app` → forward to your personal email
3. Free, no email hosting required

---

## Updating the site

To update content after deployment:

**Dashboard upload method:** Upload the new HTML files again via the Pages dashboard.

**GitHub method:** Push changes to the repo — Cloudflare auto-deploys within ~30 seconds.

---

## Cost summary

| Service | Cost |
|---|---|
| `naturefind.app` domain | ~$12/year |
| Cloudflare Pages hosting | Free |
| SSL certificate | Free |
| Email routing | Free |
| **Total** | **~$12/year** |
