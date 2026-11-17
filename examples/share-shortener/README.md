# Optional host-owned shortener

This standalone Node example uses Prisma ORM 6 and SQLite. It is not part of LDForge and is not started by the demo. The ORM calls follow the [Prisma 6 client reference](https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference).

From this directory:

```sh
npm install
export DATABASE_URL='file:./shares.db'
touch prisma/shares.db
npx prisma db push
npm start
```

The service listens on 127.0.0.1:4180. `EDITOR_URL` defaults to http://127.0.0.1:4173/ and restricts destination origin and pathname; `PUBLIC_URL` defaults to http://127.0.0.1:4180/. Set both to your externally accessible URLs when deploying behind a proxy. POST `/links` accepts `{ "url": "FULL_SHARE_URL" }` and returns `{ "url": "SHORT_URL" }`. GET `/s/:id` redirects to the stored full URL, or returns 404. Unknown routes, malformed input, oversized bodies and database failures return errors.

Use the callback from the integration guide with `http://127.0.0.1:4180/links` to try it locally. For deployment, the host owns authentication, quotas/rate limits, retention and HTTPS. Stored queries are accessible to anyone with their short link; do not place credentials in queries.

Run from this directory (Node 22):

```sh
npm install
export DATABASE_URL='file:./shares.db'
touch prisma/shares.db
npx prisma db push
npm start
```

By default, the editor recipient is `http://127.0.0.1:4173/` and short links use
`http://127.0.0.1:4180/s/:id`. Configure the integration callback to POST to
`http://127.0.0.1:4180/links`. Set `EDITOR_URL` and `PUBLIC_URL` for your host;
the server listens locally on port 4180. Short links redirect to the complete
stored URL, so the host can load its `query` parameter normally.

For deployment, supply authentication, rate limits, retention and HTTPS at your
application boundary. Queries are stored in the database and are readable by
anyone with a short link. The example limits JSON request bodies to 64 KiB.
LDForge has no ORM dependency or provider credentials.
