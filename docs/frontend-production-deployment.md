# Jibal frontend deployment on the production VPS

This runbook deploys the three Jibal frontend repositories as static sites on
the same VPS as the API. Host Nginx serves the frontend files; Docker is not
involved in frontend delivery.

| Public hostname | Repository | VPS document root |
| --- | --- | --- |
| `jibal-platform.com`, `www.jibal-platform.com` | `mohammedgameel12/home-home` | `/var/www/jibal/home` |
| `app.jibal-platform.com` | `mohammedgameel12/academy` | `/var/www/jibal/app` |
| `admin.jibal-platform.com` | `mohammedgameel12/ma-pro` | `/var/www/jibal/admin` |

The API is separately served at `api.jibal-platform.com` and is proxied by host
Nginx to the private Compose gateway at `127.0.0.1:13000`.

## Prerequisites

1. The DNS A records for all frontend names and `api.jibal-platform.com` point
   to the VPS public IP. Do not publish the Compose port, Redis, or PostgreSQL.
2. Nginx and Certbot are installed on the VPS. The existing
   `~/myOpsScripts/website_setup/add-ssl-to-server.sh` script manages
   certificates for enabled Nginx sites.
3. The API environment permits the three frontend origins before browser login
   is tested:

   ```dotenv
   CORS_ORIGINS=https://jibal-platform.com,https://app.jibal-platform.com,https://admin.jibal-platform.com
   COOKIE_SECURE=true
   COOKIE_SAME_SITE=lax
   ```

   After changing the API environment, recreate only the API and worker:

   ```sh
   cd ~/Shaheen-edu/deploy/production
   docker compose --env-file .env config --quiet
   docker compose up -d --no-deps --force-recreate api worker
   ```

The sites currently consist of committed `index.html` files and hashed static
assets. They do not require a Node.js runtime or a production build step on the
VPS.

## First deployment

Clone each repository into a deployment-only checkout. Do not make product
edits in these clones; routine updates reset them to their upstream `main`
branch.

```sh
mkdir -p ~/Jibal-frontends
git clone --depth 1 https://github.com/mohammedgameel12/home-home.git ~/Jibal-frontends/home
git clone --depth 1 https://github.com/mohammedgameel12/academy.git ~/Jibal-frontends/app
git clone --depth 1 https://github.com/mohammedgameel12/ma-pro.git ~/Jibal-frontends/admin
```

All frontend bundles must use `https://api.jibal-platform.com` as their API
origin. Correct any upstream frontend configuration before publishing; do not
apply deployment-only URL rewrites to generated assets.

Create the exact document-root directories and copy the static files. The
paths are explicit so the command cannot affect the API deployment or other
Nginx websites.

```sh
sudo install -d -m 0755 /var/www/jibal/home /var/www/jibal/app /var/www/jibal/admin
sudo cp -a ~/Jibal-frontends/home/. /var/www/jibal/home/
sudo cp -a ~/Jibal-frontends/app/. /var/www/jibal/app/
sudo cp -a ~/Jibal-frontends/admin/. /var/www/jibal/admin/
sudo chown -R root:root /var/www/jibal
```

## Nginx sites and certificates

Create `/etc/nginx/sites-available/jibal-frontends` with the following HTTP
configuration. The SPA fallback keeps direct links such as
`/dashboard` working after a browser refresh.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name jibal-platform.com www.jibal-platform.com;

    root /var/www/jibal/home;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name app.jibal-platform.com;

    root /var/www/jibal/app;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name admin.jibal-platform.com;

    root /var/www/jibal/admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable it and test the Nginx configuration before reload:

```sh
sudo ln -s /etc/nginx/sites-available/jibal-frontends /etc/nginx/sites-enabled/jibal-frontends
sudo nginx -t
sudo systemctl reload nginx
```

After every hostname serves HTTP, issue certificates through the existing host
automation:

```sh
cd ~/myOpsScripts/website_setup
sudo bash add-ssl-to-server.sh
```

The script scans enabled sites. Confirm it obtains/deploys certificates for
the root domain and `www`, `app.jibal-platform.com`, and
`admin.jibal-platform.com`. It may also report the already-issued API
certificates; that is expected.

## Routine frontend update

Use this deployment-only procedure whenever one or more frontend repositories
change. It resets the three checkout directories to upstream `main` and
synchronizes only the three explicit document roots. `rsync --delete` removes
obsolete hashed assets from those roots; it does not touch the backend
deployment.

```sh
set -euo pipefail

for site in home app admin; do
  git -C "$HOME/Jibal-frontends/$site" fetch origin main --depth=1
  git -C "$HOME/Jibal-frontends/$site" reset --hard origin/main
done

sudo rsync -a --delete "$HOME/Jibal-frontends/home/" /var/www/jibal/home/
sudo rsync -a --delete "$HOME/Jibal-frontends/app/" /var/www/jibal/app/
sudo rsync -a --delete "$HOME/Jibal-frontends/admin/" /var/www/jibal/admin/
sudo chown -R root:root /var/www/jibal
```

Nginx reads the replaced static files immediately, so it does not need a
reload for a content-only frontend release. Run `sudo nginx -t` and reload only
when changing an Nginx configuration.

## Verification

```sh
curl --fail --show-error --head https://jibal-platform.com
curl --fail --show-error --head https://www.jibal-platform.com
curl --fail --show-error --head https://app.jibal-platform.com
curl --fail --show-error --head https://admin.jibal-platform.com
curl --fail-with-body https://api.jibal-platform.com/health/ready
```

In a browser, verify each SPA's deep links by opening a non-root route and
refreshing the page. From the app and admin portals, complete login and a token
refresh. Requests must use credentials, and the API response must return a
`Secure`, `HttpOnly`, `SameSite=Lax` refresh cookie.

## Rollback

Before routine releases, record the currently deployed commit of each frontend
checkout:

```sh
for site in home app admin; do
  printf '%s: ' "$site"
  git -C "$HOME/Jibal-frontends/$site" rev-parse HEAD
done
```

To roll back one site, replace `<site>` and `<commit-sha>` below with the
recorded values and synchronize only that site's document root:

```sh
git -C "$HOME/Jibal-frontends/<site>" fetch origin <commit-sha> --depth=1
git -C "$HOME/Jibal-frontends/<site>" reset --hard <commit-sha>
sudo rsync -a --delete "$HOME/Jibal-frontends/<site>/" /var/www/jibal/<site>/
sudo chown -R root:root /var/www/jibal/<site>
```

Do not change the API Docker services for a static frontend-only rollback.
