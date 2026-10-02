# Security Policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Instead, report them privately
through GitHub: go to the repository's **Security** tab and choose **Report a
vulnerability**.

Include what you found, how to reproduce it, and the impact you expect. You'll get a reply
as soon as possible, and a fix will be released before details are made public.

## Scope

TxRadar runs locally and only reads public blockchain data. Areas that matter most:

- Leaking server-side API keys to the browser
- Bypassing the Content-Security-Policy or injecting script
- Input that crashes the server or causes unbounded upstream requests
- CSV export producing executable spreadsheet formulas

## Supported versions

Only the latest release on `main` receives fixes.
