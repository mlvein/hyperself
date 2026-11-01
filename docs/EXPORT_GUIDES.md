# Export Guides — download your data instead of linking

Linking is simulated in the demo, and real accounts cannot always connect. Every service listed in Import & Connect instead offers a data export; download it there, then upload it in **Import & Connect → “Can’t link? Export it yourself”**. Exports are unpacked and parsed on-device only.

| Service | Where to export | Arrives as | Hyperself reads |
|---|---|---|---|
| Notion | Settings → Export all workspace content (Markdown & CSV) | ZIP | `.zip .md .csv .html` |
| Google Drive | takeout.google.com → Drive (.docx/PDF) | ZIP | `.zip .docx .pdf .md .txt` |
| Gmail | takeout.google.com → Mail (MBOX) | ZIP with `.mbox` | `.zip .mbox .eml` |
| Slack | Workspace Settings → Import/Export Data → Export | ZIP of channel JSON | `.zip .json .html` |
| GitHub | Repo → Code → Download ZIP, or Settings → Account → export | ZIP | `.zip .md .json .txt` |
| LinkedIn | Settings & Privacy → Data privacy → Get a copy of your data | ZIP/CSV | `.zip .csv .txt` |
| X (Twitter) | Settings → Your account → Download an archive of your data | ZIP with `data/*.js` | `.zip .js .html` |
| Apple Health | Health app → profile → Export All Health Data | `export.zip` (XML) | `.zip .xml` (summarized by record type) |
| Calendar | Google Calendar Settings → Import & export → Export; Apple Calendar → File → Export | `.ics` (often in ZIP) | `.ics .zip` |
| Contacts | Google Contacts → Export → vCard; iCloud Contacts → Export vCard | `.vcf` | `.vcf .csv` |
| Family (school/care portals) | Each portal’s own download option | PDF/CSV per portal | `.pdf .csv .md .txt` |

Notes:

- ZIP uploads are unpacked locally (`fflate`, in-browser); readable text members are ingested, binaries are skipped.
- Gmail MBOX and Apple Health XML get dedicated parsers; X archive `.js` files are parsed as JSON data.
- Bank-statement CSVs should still be uploaded directly (not inside a ZIP) so the review-then-import flow can run.
