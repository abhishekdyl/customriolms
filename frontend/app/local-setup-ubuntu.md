# Local Setup — Ubuntu

Assumes Ubuntu 22.04 or 24.04 LTS, a non-root user with `sudo`, and this repo already unzipped/cloned somewhere like `~/code/solara-lms`.

Tool choices below are deliberate, not default — reasoning is inline where it matters.

---

## 1. System update and build tools

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git unzip software-properties-common
```

`build-essential` is needed because a couple of Python packages (e.g. `psycopg2-binary`'s dependencies, `bcrypt`) compile native extensions on install — skipping this now just means a cryptic compiler error later.

---

## 2. Python 3.12 via pyenv (not apt, not deadsnakes)

**Why pyenv, not `apt install python3.12` or the deadsnakes PPA:** apt ties you to whatever Python version Ubuntu decided to ship or a third-party PPA decided to backport — fine until you need two projects on two different Python versions, or Ubuntu drops the PPA. pyenv installs Python versions user-locally, never touches system Python, and lets this project pin its exact version independent of the OS.

```bash
curl https://pyenv.run | bash
```

Add to `~/.bashrc` (the installer prints this, but easy to miss):
```bash
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
```

```bash
source ~/.bashrc
sudo apt install -y libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev libffi-dev  # pyenv build deps
pyenv install 3.12.6
pyenv local 3.12.6   # run this from inside the repo — pins the version via .python-version
```

---

## 3. Node.js via nvm (not apt)

**Why nvm:** same reasoning as pyenv — apt's Node package lags, and the frontend monorepo may need a specific version pinned per-project later. nvm is also just the ecosystem standard here.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v   # confirm v20.x — Next.js 15 requires 18.18+, 20 LTS is the safe choice
```

---

## 4. Docker Engine + Compose plugin (not Docker Desktop, not snap)

**Why the official apt repo, not the `docker.io` snap or Docker Desktop:** the snap version has historically had networking/volume quirks on Ubuntu, and Docker Desktop is unnecessary GUI overhead for a server-only local dev need. The official Docker CE apt repo is the clean, standard install.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

**Run Docker without `sudo` every time** (standard, do this — otherwise every `docker compose` command needs `sudo` and `.env` file permissions get root-owned, which causes exactly the kind of permission headache already documented from the Plesk side):
```bash
sudo usermod -aG docker $USER
newgrp docker   # or just log out and back in
docker run hello-world   # should work without sudo now
```

---

## 5. Clone or unzip the repo

```bash
mkdir -p ~/code && cd ~/code
unzip ~/Downloads/solara-lms-repo.zip   # or: git clone <your-repo-url>
cd solara-lms
```

If this is going to live on GitHub (it should — Railway deploys from it):
```bash
git init   # skip if you cloned instead of unzipping
git add .
git commit -m "Initial scaffold + teams/invite module"
git branch -M main
git remote add origin git@github.com:<you>/solara-lms.git
git push -u origin main
```

If you haven't set up an SSH key for GitHub on this machine yet:
```bash
ssh-keygen -t ed25519 -C "you@example.com"
cat ~/.ssh/id_ed25519.pub   # paste this into GitHub → Settings → SSH Keys
```

---

## 6. Backend setup

```bash
cd ~/code/solara-lms/backend
pyenv local 3.12.6            # confirms the pin from step 2
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

cp .env.example .env          # then edit .env — at minimum set JWT_SECRET
openssl rand -hex 32          # generates a real secret, paste it into .env

docker compose up -d          # starts Postgres (pgvector) + Redis in the background
docker compose ps             # confirm both are "healthy" before continuing

alembic revision --autogenerate -m "initial schema"
alembic upgrade head

uvicorn app.main:app --reload
```

Confirm it's alive:
```bash
curl http://localhost:8000/health
# {"status":"ok","env":"development"}
```

Interactive API docs (FastAPI gives you this for free — genuinely useful for testing the Teams/Users endpoints by hand before the frontend is wired up): open `http://localhost:8000/docs` in a browser.

---

## 7. Frontend setup

New terminal tab (keep the backend running in the first one):

```bash
cd ~/code/solara-lms/frontend
nvm use 20
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

---

## 8. Daily workflow after this initial setup

```bash
# Terminal 1 — infra
cd ~/code/solara-lms/backend && docker compose up -d

# Terminal 2 — backend
cd ~/code/solara-lms/backend && source .venv/bin/activate && uvicorn app.main:app --reload

# Terminal 3 — frontend
cd ~/code/solara-lms/frontend && npm run dev
```

`docker compose up -d` only needs to be re-run after a reboot (or `docker compose down`) — the containers persist between terminal sessions otherwise. Postgres data survives container restarts because of the named volume in `docker-compose.yml`; it's only wiped by `docker compose down -v` (the `-v` is the dangerous part — don't run that unless you mean to lose local data).

---

## Common gotchas, so you don't lose an hour to them

| Symptom | Cause | Fix |
|---|---|---|
| `permission denied` on `docker` commands | Group membership from step 4 hasn't taken effect in this shell | `newgrp docker` or log out/in |
| `port 5432 already in use` | A system-wide Postgres is already running (common if you've done Laravel/PHP work on this machine before) | `sudo systemctl stop postgresql` (if you don't need it), or change the host port mapping in `docker-compose.yml` |
| `alembic` can't connect | `.env`'s `DATABASE_URL` still points somewhere else, or Docker containers aren't up yet | `docker compose ps` first, then re-check `.env` |
| `bcrypt`/`psycopg2` fails to install | Missing system headers | Re-run step 1's `apt install` line — it's the `build-essential`/dev headers that were skipped |
| Frontend can't reach the API (CORS error in console) | `CORS_ORIGINS` in backend `.env` doesn't include `http://localhost:3000` | Check `.env`, restart uvicorn (env vars are read once at startup) |

---

## Optional but worth it once the codebase grows

- **direnv** (`sudo apt install direnv`, then add the hook to `.bashrc`): auto-activates the Python venv and loads `.env` the moment you `cd` into the project — removes the "did I forget to activate the venv" class of mistake entirely.
- **pre-commit** (`pip install pre-commit` inside the venv): run linting/formatting checks before every commit instead of finding out in CI. Add once the project has agreed-upon lint rules — not urgent on day one, but cheap to add early rather than retrofitting onto a large diff later.
