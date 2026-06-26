#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Security patch deploy for gkvendor.gokwik.in
#
# Ships:
#   1. JSON 404 catch-all for /api/* paths (app/api/[[...notfound]]/route.ts)
#   2. proxy.ts middleware that lets /api/* self-enforce auth (handlers do it)
#   3. Hardened nginx server block with HSTS / X-Frame-Options / CSP /
#      Permissions-Policy / Referrer-Policy / X-Content-Type-Options
#      + rate limiting on /sign-in and /api
#      + defensive X-Forwarded-Host (overwritten so attackers can't poison)
#
# Run from the project root on your laptop. Requires VPN access to 10.10.172.28.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

KEY="${KEY:-/Users/suhag.vamja/Downloads/marcos.pem}"
HOST="${HOST:-ec2-user@10.10.172.28}"
SSH="ssh -i $KEY $HOST"

if [[ ! -f "$KEY" ]]; then
  echo "ERROR: missing key at $KEY (set KEY=... env var to override)"
  exit 1
fi

echo "▸ Probing SSH reachability…"
if ! ssh -i "$KEY" -o ConnectTimeout=8 -o BatchMode=yes "$HOST" 'echo ok' >/dev/null 2>&1; then
  echo "ERROR: can't reach $HOST — are you on the corp VPN?"
  exit 1
fi
echo "  ok"

# ─── Step 1: nginx server block ──────────────────────────────────────────────
echo "▸ Writing hardened nginx config…"
NGINX_TMP="$(mktemp)"
cat > "$NGINX_TMP" <<'EOF'
# Rate limit zones declared at server-level (referenced from location blocks).
limit_req_zone $binary_remote_addr zone=vendor_api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=vendor_auth:10m rate=5r/s;

server {
    listen 80;
    server_name gkvendor.gokwik.in;

    client_max_body_size 50M;
    server_tokens off;

    # Security headers (apply to every response, including errors).
    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com wss://*.clerk.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.clerk.accounts.dev https://*.clerk.com" always;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    location /_next/static/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location ~* ^/(sign-in|sign-up)(/|$) {
        limit_req zone=vendor_auth burst=10 nodelay;
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /api/uploads/ {
        limit_req zone=vendor_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 120s;
    }

    location /api/ {
        limit_req zone=vendor_api burst=60 nodelay;
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 90s;
    }

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 90s;
    }
}
EOF

# ─── Step 2: rsync source ────────────────────────────────────────────────────
echo "▸ Rsync source to /opt/vendor-dashboard…"
rsync -az \
  --exclude='node_modules' --exclude='.next' --exclude='.data' --exclude='.git' \
  --exclude='.env.local' --exclude='*.log' --exclude='scripts/deploy-security-patch.sh' \
  -e "ssh -i $KEY" \
  ./ "$HOST":/opt/vendor-dashboard/

# ─── Step 3: install nginx conf ──────────────────────────────────────────────
echo "▸ Install nginx server block…"
scp -i "$KEY" "$NGINX_TMP" "$HOST":/tmp/vendor.conf
rm -f "$NGINX_TMP"

$SSH '
  sudo mv /tmp/vendor.conf /etc/nginx/conf.d/vendor.conf
  sudo nginx -t
  sudo systemctl reload nginx
'

# ─── Step 4: rebuild + restart Next service ──────────────────────────────────
echo "▸ npm install + build on EC2 (this can take 2–3 min)…"
$SSH 'cd /opt/vendor-dashboard && npm ci --silent && npm run build 2>&1 | tail -3'

echo "▸ Restart vendor-dashboard service…"
$SSH 'sudo systemctl restart vendor-dashboard && sleep 2 && sudo ss -tlnp | grep :3002 || echo "WARN: :3002 not listening yet"'

# ─── Step 5: smoke tests ────────────────────────────────────────────────────
echo ""
echo "═══ SMOKE TESTS ═══"
$SSH '
  echo "--- 1. Undefined /api/* path should be JSON 404 ---"
  curl -s -H "Host: gkvendor.gokwik.in" -o /tmp/r -w "  status=%{http_code} type=%{content_type}\n" http://127.0.0.1/api/users
  head -c 80 /tmp/r; echo ""

  echo "--- 2. Page route should redirect unauth users ---"
  curl -s -H "Host: gkvendor.gokwik.in" -o /dev/null -w "  status=%{http_code} loc=%{redirect_url}\n" http://127.0.0.1/vendor/dashboard

  echo "--- 3. Security headers present ---"
  curl -sI -H "Host: gkvendor.gokwik.in" http://127.0.0.1/ | grep -iE "strict-transport|x-frame|x-content-type|referrer-policy|content-security-policy|permissions-policy" | sort

  echo "--- 4. /api/uploads/<garbage> → 401 (handler enforced, not middleware) ---"
  curl -s -H "Host: gkvendor.gokwik.in" -o /tmp/r -w "  status=%{http_code} type=%{content_type}\n" http://127.0.0.1/api/uploads/foo

  echo "--- 5. Rate limit zone exists (header response from auth path) ---"
  for i in $(seq 1 7); do
    curl -s -o /dev/null -w "%{http_code} " -H "Host: gkvendor.gokwik.in" http://127.0.0.1/sign-in
  done
  echo ""
'

echo ""
echo "✓ Deploy complete. Visit https://gkvendor.gokwik.in/ to confirm in browser."
