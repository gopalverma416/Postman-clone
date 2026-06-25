# Deploying the API Client Platform (making it live)

The app is two services that must both be hosted:

| Part | What it is | Where to host |
|---|---|---|
| **Backend** | FastAPI proxy/runner + SQLite | **Render** (free web service) |
| **Frontend** | Next.js app | **Vercel** (free) — or Render |

> The frontend talks **only** to your backend (the backend proxies the real HTTP calls). So deploy the **backend first**, get its URL, then point the frontend at it.

The backend already sets `CORS_ORIGINS=*` in `render.yaml`, so you do **not** need to coordinate exact URLs for CORS — only the frontend needs to know the backend URL.

---

## Step 1 — Deploy the backend on Render

1. Go to **https://render.com** → sign up / log in (use "Continue with GitHub").
2. **New +** → **Web Service** → connect your GitHub and pick **`gopalverma416/Postman-clone`**.
3. Fill in:
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python -m app.seed; uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`
4. **Advanced → Environment Variables** — add:
   - `SAFE_MODE` = `true`
   - `CORS_ORIGINS` = `*`
   - `DATABASE_URL` = `sqlite:////var/data/app.db`
5. (Optional but recommended for persistence) **Advanced → Add Disk:** name `data`, mount path `/var/data`, size `1 GB`.
6. Click **Create Web Service**. Wait ~2–3 min for the build.
7. When it's live, **copy the URL** at the top — e.g. `https://postman-clone-backend.onrender.com`.
8. Test it: open `https://<your-backend>/api/health` — you should see `{"status":"ok",...}` and `/docs` shows the Swagger API.

> **Tip:** Render's free tier sleeps after 15 min idle; the first request after sleep takes ~30 s to wake. Fine for a demo.

---

## Step 2 — Deploy the frontend on Vercel

1. Go to **https://vercel.com** → log in with GitHub.
2. **Add New → Project** → import **`gopalverma416/Postman-clone`**.
3. Set **Root Directory** to `frontend` (click *Edit* next to the root directory).
4. Framework preset auto-detects **Next.js**. Leave build/output defaults.
5. **Environment Variables** — add:
   - `NEXT_PUBLIC_API_BASE_URL` = your backend URL from Step 1 (e.g. `https://postman-clone-backend.onrender.com`) — **no trailing slash**.
6. Click **Deploy**. ~1–2 min.
7. Open the resulting URL (e.g. `https://postman-clone.vercel.app`). The seeded collections load and **Send** hits real APIs through your backend.

> `NEXT_PUBLIC_*` is baked in at **build time**. If you change the backend URL later, update the env var **and redeploy** the frontend (Vercel → Deployments → Redeploy).

---

## Alternative — both on Render via the Blueprint

The repo includes `render.yaml`. In Render: **New + → Blueprint → pick this repo**. It creates both services. After the first deploy, set the frontend service's `NEXT_PUBLIC_API_BASE_URL` to the backend's live URL and **Manual Deploy → Clear build cache & deploy** the frontend (so the new URL is baked in).

---

## Quick local sanity check before deploying

```bash
# backend
cd backend && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --port 8000        # → http://localhost:8000/docs

# frontend (new terminal)
cd frontend
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > .env.local
npm install && npm run dev              # → http://localhost:3000
```

---

## After it's live — submit

- **GitHub repo:** https://github.com/gopalverma416/Postman-clone
- **Live demo:** your Vercel frontend URL (it uses the Render backend under the hood).

Paste the live frontend URL into the README's top section if you want it discoverable.
```
