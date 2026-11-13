#!/bin/sh
set -eu

script_url=${LDFORGE_ANALYTICS_SCRIPT_URL:-}
website_id=${LDFORGE_ANALYTICS_WEBSITE_ID:-}
if [ -n "$script_url" ] || [ -n "$website_id" ]; then
    if [ -z "$script_url" ] || [ -z "$website_id" ]; then
        echo 'Analytics requires both LDFORGE_ANALYTICS_SCRIPT_URL and LDFORGE_ANALYTICS_WEBSITE_ID.' >&2
        exit 1
    fi
    case "$script_url" in
        https://*|http://*) ;;
        *) echo 'Analytics script URL must use HTTP or HTTPS.' >&2; exit 1 ;;
    esac
fi

# /tmp is the only writable volume needed when the root filesystem is read-only.
mkdir -p /tmp/ldforge-site
cp -R /opt/ldforge-site/. /tmp/ldforge-site/
if [ -n "$script_url" ]; then
    export LDFORGE_ANALYTICS_SCRIPT_URL LDFORGE_ANALYTICS_WEBSITE_ID
    for page in /tmp/ldforge-site/*.html; do
        awk '
          function escape(value, output, i, character) {
            output = ""
            for (i = 1; i <= length(value); i++) {
              character = substr(value, i, 1)
              if (character == "&") output = output "&amp;"
              else if (character == "\"") output = output "&quot;"
              else if (character == "<") output = output "&lt;"
              else if (character == ">") output = output "&gt;"
              else output = output character
            }
            return output
          }
          /<\/head>/ {
            printf "    <script defer src=\"%s\" data-website-id=\"%s\"></script>\n", escape(ENVIRON["LDFORGE_ANALYTICS_SCRIPT_URL"]), escape(ENVIRON["LDFORGE_ANALYTICS_WEBSITE_ID"])
          }
          { print }
        ' "$page" > "$page.tmp"
        mv "$page.tmp" "$page"
    done
fi
exec "$@"
