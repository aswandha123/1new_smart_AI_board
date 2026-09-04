# 🚀 AI Smart Board Deployment Guide (Vercel & Render)

This guide provides step-by-step instructions for hosting the **AI Smart Board** frontend on **Vercel** and backend on **Render.com** for free.

---

## 🏗️ Architecture

- **Frontend**: Vite + TypeScript (Hosted on **Vercel** - Free Tier)
- **Backend**: FastAPI + Pix2Text + Tesseract OCR (Hosted on **Render.com Docker Web Service** - Free Tier)

---

## Step 1: Deploy Backend to Render (Free Docker Web Service)

1. Push your repository to GitHub / GitLab.
2. Sign in to [Render.com](https://render.com/).
3. Click **New +** -> **Web Service**.
4. Connect your GitHub/GitLab repository.
5. Select **Docker** as the Environment type:
   - **Name**: `ai-smart-board-backend`
   - **Region**: Select closest to your users (e.g. Oregon, Frankfurt, Singapore)
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: `backend` (or leave empty if using `render.yaml`)
   - **Docker Command / Path**: `./Dockerfile` (or `backend/Dockerfile`)
   - **Instance Type**: **Free**
6. Click **Create Web Service**. Render will automatically build the Docker image with Tesseract OCR and FastAPI.
7. Once deployed, copy your backend URL (e.g., `https://ai-smart-board-backend.onrender.com`).
8. Verify health endpoint by visiting:
   `https://ai-smart-board-backend.onrender.com/api/v1/health`
   (Should return `{"status": "ok"}`).

---

## Step 2: Deploy Frontend to Vercel (Free Static Hosting)

1. Sign in to [Vercel](https://vercel.com/).
2. Click **Add New...** -> **Project**.
3. Import your GitHub / GitLab repository.
4. Configure Project Settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand **Environment Variables**:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://ai-smart-board-backend.onrender.com` *(Replace with your actual Render backend URL)*
6. Click **Deploy**.

---

## 🌟 Alternative Backend: Hugging Face Spaces (Free Docker 16GB RAM)

If Render free tier experiences RAM limitations with heavy Pix2Text AI models:
1. Go to [Hugging Face Spaces](https://huggingface.co/spaces) and click **Create new Space**.
2. Set Space SDK to **Docker** (Blank template).
3. Push the `backend/` folder contents (`Dockerfile`, `main.py`, `requirements.txt`, etc.) to your Hugging Face Space repository.
4. Update `VITE_API_BASE_URL` on Vercel to your HF Space direct URL:
   `https://<username>-<spacename>.hf.space`

---

## 🧪 Verifying Deployment

1. Open your deployed Vercel application in your web browser.
2. Draw a mathematical equation (e.g., `2x + 5 = 15`) or write text on the board.
3. Select the content and click the **AI Recognition** button.
4. Ensure the backend analyzes and returns the OCR/Math solution directly to your whiteboard!
