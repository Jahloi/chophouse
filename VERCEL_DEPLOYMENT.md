# Vercel Deployment

This project can run on Vercel by using the community PHP runtime configured in `vercel.json`.

## Required Services

- Vercel project
- Hosted MySQL or MariaDB database reachable from Vercel
- HTTPS domain for the website and ESP32 sensor requests

## Environment Variables

Copy `.env.example` into the Vercel project settings and fill in real values.

Required:

```text
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com
UPLOAD_STORAGE_DRIVER=database
SENSOR_API_KEY=<long random secret>
RESEND_API_KEY=<optional email provider API key>
```

Database:

```text
DATABASE_URL=mysql://user:password@host:4000/chophouse?sslaccept=strict
DB_SSL_MODE=require
```

or:

```text
DB_HOST=<database host>
DB_PORT=3306
DB_NAME=chophouse
DB_USER=<database user>
DB_PASS=<database password>
DB_SSL_MODE=require
```

The TiDB Vercel integration can also provide `TIDB_HOST`, `TIDB_PORT`, `TIDB_DATABASE`, `TIDB_USER`, and `TIDB_PASSWORD`; the app reads those automatically.

## Database

Import `sql/chophouse.sql` into the hosted database before deploying.

After import, change the default demo passwords or create new production admin/staff accounts.

The API can run lightweight schema checks on startup, so the production database user should have the required `CREATE` and `ALTER` permissions unless you remove those self-migration calls.

## Email

Set `APP_URL` to your production domain so reservation emails link to the deployed status page.

For production email, set:

```text
RESEND_API_KEY=<resend api key>
MAIL_FROM_ADDRESS=noreply@your-verified-domain.com
MAIL_FROM_NAME=ChopHouse Reservations
```

Without `RESEND_API_KEY`, the app falls back to PHP `mail()`, which is mostly useful for local hosting and is not reliable on serverless deployments.

## Uploads

For Vercel, keep:

```text
UPLOAD_STORAGE_DRIVER=database
```

This stores uploaded reservation documents and GCash QR images in MySQL because Vercel serverless file storage is not persistent.

For local XAMPP development, use:

```text
UPLOAD_STORAGE_DRIVER=local
```

or leave it unset.

## Sensors

The ESP32 must send the same `sensorId` saved in Admin Sensor Manager and include the production sensor key:

```http
X-Sensor-Key: <SENSOR_API_KEY>
```

POST URL after deployment:

```text
https://your-domain.com/api/status/
```

## Deploy

Install and deploy with Vercel:

```text
npm i -g vercel
vercel login
vercel
vercel --prod
```
