// Export guides: when linking a service is not an option, every listed
// service lets you download your own data and upload it here instead.
// Steps describe each service's own export flow; Hyperself never sees the
// account — only the file the user downloaded and chose to upload.
import { PROVIDERS } from './connections';

export interface ExportGuide {
  /** Matches a Provider id in connections.ts. */
  providerId: string;
  service: string;
  /** Where the export lives in that service's UI, in one line. */
  where: string;
  steps: string[];
  /** File types the export produces that Hyperself can read. */
  formats: string[];
  /** What the download actually looks like. */
  arrivesAs: string;
}

export const EXPORT_GUIDES: ExportGuide[] = [
  {
    providerId: 'notion',
    service: 'Notion',
    where: 'Settings → Export all workspace content',
    steps: [
      'Open Notion and go to Settings (bottom-left), then Settings again for the workspace.',
      'Choose "Export all workspace content" and pick Markdown & CSV (HTML also works).',
      'Wait for the email/ download, save the ZIP to this device.',
      'Upload the ZIP below — Hyperself unpacks and reads it on this device.',
    ],
    formats: ['zip', 'md', 'csv', 'html'],
    arrivesAs: 'One ZIP of Markdown/CSV files — upload it as-is.',
  },
  {
    providerId: 'drive',
    service: 'Google Drive',
    where: 'takeout.google.com → Drive',
    steps: [
      'Go to takeout.google.com and deselect everything except Drive.',
      'In "Multiple formats", choose Microsoft Word (.docx) or PDF for documents.',
      'Create the export, wait for Google\'s email, and download the ZIP.',
      'Upload the ZIP below (or individual .docx/.pdf files).',
    ],
    formats: ['zip', 'docx', 'pdf', 'md', 'txt'],
    arrivesAs: 'One or more ZIPs of documents — upload as-is.',
  },
  {
    providerId: 'gmail',
    service: 'Gmail',
    where: 'takeout.google.com → Mail (MBOX)',
    steps: [
      'Go to takeout.google.com and deselect everything except Mail.',
      'Keep the MBOX format, create the export, and wait for Google\'s email (can take hours).',
      'Download the ZIP and upload it below — or unzip it and upload the .mbox file.',
      'Tip: export one label at a time in Takeout to keep mail focused.',
    ],
    formats: ['zip', 'mbox', 'eml'],
    arrivesAs: 'A ZIP containing an .mbox mailbox — upload either.',
  },
  {
    providerId: 'slack',
    service: 'Slack',
    where: 'Workspace Settings → Import/Export Data → Export',
    steps: [
      'In Slack on desktop, open your workspace menu → Settings & administration → Workspace settings.',
      'Open "Import/Export Data" → Export, pick a date range, and start the export.',
      'Download the ZIP when Slack emails you (public channels; DMs need a workspace-owner export on paid plans).',
      'Upload the ZIP below — channel JSON files are read automatically.',
    ],
    formats: ['zip', 'json', 'html'],
    arrivesAs: 'One ZIP of per-channel JSON files — upload it as-is.',
  },
  {
    providerId: 'github',
    service: 'GitHub',
    where: 'Repo → Code → Download ZIP, or Settings → Account → export',
    steps: [
      'For one project: open the repo, choose Code → Download ZIP.',
      'For everything: GitHub Settings → Account → "Start export" and wait for the archive email.',
      'Download the ZIP and upload it below; Markdown, issues text, and notes are read.',
      'Remove anything with tokens or secrets first — Hyperself will also flag them in Security.',
    ],
    formats: ['zip', 'md', 'json', 'txt'],
    arrivesAs: 'A ZIP of repositories/archives — upload it as-is.',
  },
  {
    providerId: 'linkedin',
    service: 'LinkedIn',
    where: 'Settings & Privacy → Data privacy → Get a copy of your data',
    steps: [
      'Open LinkedIn Settings & Privacy → Data privacy → "Get a copy of your data".',
      'Pick Connections and Messages (or the full archive) and request it.',
      'Download the ZIP/CSV files when LinkedIn emails you (about a day for the full archive).',
      'Upload the ZIP or the individual CSV files below.',
    ],
    formats: ['zip', 'csv', 'txt'],
    arrivesAs: 'ZIP/CSV files (Connections.csv, messages.csv) — upload either.',
  },
  {
    providerId: 'x',
    service: 'X (Twitter)',
    where: 'Settings → Your account → Download an archive of your data',
    steps: [
      'Open X Settings → Your account → "Download an archive of your data" and verify your password.',
      'Wait for the notification (usually a day), then download the ZIP.',
      'Upload the ZIP below — the data/*.js files inside (tweets, likes, DMs) are read automatically.',
    ],
    formats: ['zip', 'js', 'html'],
    arrivesAs: 'One ZIP with a data folder of .js files — upload it as-is.',
  },
  {
    providerId: 'health',
    service: 'Apple Health',
    where: 'Health app → your photo → Export All Health Data',
    steps: [
      'On iPhone, open Health, tap your photo (top-right), then "Export All Health Data".',
      'Share the export.zip to this device (AirDrop/Files/email to yourself).',
      'Upload the ZIP below — Hyperself summarizes the XML records (steps, sleep, workouts) on-device.',
    ],
    formats: ['zip', 'xml'],
    arrivesAs: 'export.zip with a large XML file — upload it as-is.',
  },
  {
    providerId: 'calendar',
    service: 'Calendar (Google / Apple)',
    where: 'Google Calendar Settings → Import & export → Export, or Calendar → File → Export',
    steps: [
      'Google: Calendar Settings (gear) → Import & export → Export downloads one .ics per calendar in a ZIP.',
      'Apple: Calendar app → File → Export saves a single .ics file.',
      'Upload the .ics or ZIP below — events become dated journal entries.',
    ],
    formats: ['ics', 'zip'],
    arrivesAs: '.ics files, sometimes inside a ZIP — upload either.',
  },
  {
    providerId: 'contacts',
    service: 'Contacts (Google / iCloud)',
    where: 'Google Contacts → Export → vCard, or iCloud Contacts → Export vCard',
    steps: [
      'Google Contacts: choose the export icon → vCard → Export.',
      'iCloud: Contacts on icloud.com → select all → gear → Export vCard.',
      'Upload the .vcf below — people become relationship entries you can tag.',
    ],
    formats: ['vcf', 'csv'],
    arrivesAs: 'A single .vcf file (or CSV from Google) — upload it below.',
  },
  {
    providerId: 'family',
    service: 'Family (school, care, medical portals)',
    where: 'Each portal’s own download/export option',
    steps: [
      'There is no single family export — school, pharmacy, and care portals each offer downloads.',
      'Save report cards, care summaries, and statements as PDF or CSV from those portals.',
      'Upload the PDFs/CSVs below; they arrive personal and stay on this device.',
    ],
    formats: ['pdf', 'csv', 'md', 'txt'],
    arrivesAs: 'Individual PDF/CSV files from each portal.',
  },
];

/** Every listed service has an export path; fail loudly in tests if one drifts. */
export function guideForProvider(providerId: string): ExportGuide | undefined {
  return EXPORT_GUIDES.find((g) => g.providerId === providerId);
}

export function servicesWithUploadGuides(): string[] {
  return PROVIDERS.map((p) => guideForProvider(p.id)?.service ?? p.name);
}
