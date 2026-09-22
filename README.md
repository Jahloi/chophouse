# ChopHouse v4

Clean deployment copy for Vercel.

## Deploy Checklist

1. Import `sql/chophouse.sql` into your hosted MySQL-compatible database.
2. In Vercel, set the variables from `.env.example`.
3. Set `APP_URL` to the final production URL.
4. Set `UPLOAD_STORAGE_DRIVER=database`.
5. Set `SENSOR_API_KEY` to a long random secret and use the same value in the ESP32 `X-Sensor-Key` header.
6. Set `RESEND_API_KEY` and a verified `MAIL_FROM_ADDRESS` if password reset and reservation emails should work in production.
7. After importing the schema, change the seeded demo admin/staff passwords or create fresh production accounts and deactivate the demo accounts.

## Important Files

- `vercel.json`: Vercel PHP runtime and API route mapping.
- `.env.example`: production environment variable template.
- `sql/chophouse.sql`: database schema and starter seed data.
- `api/`, `lib/`, `config/`: PHP backend.
- `*.html`, `*.css`, `*.js`, `assets/`: frontend.
