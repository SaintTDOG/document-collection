// Netlify Function: sync-to-drive
// Triggered after an NCCP form submission from aip-homeownerassist.
// Downloads the single JSON blob the form wrote to Supabase storage and
// uploads it into the client's Google Drive folder under
// "2026 Prelim Fileinvites". No more multi-document loop — the portal is
// NCCP-only now.

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'node:stream';

const SUPABASE_URL = 'https://vhskfgmdiotjupmhhvkl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const GDRIVE_PARENT_FOLDER_ID = '1EooHoHyo_mb87Xr5uxdr_HfGYwczMnzD'; // 2026 Prelim Fileinvites
const BUCKET = 'client-documents';

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function getOrCreateClientFolder(drive, clientName) {
  const safe = clientName.replace(/'/g, "\\'");
  const query = `name = '${safe}' and '${GDRIVE_PARENT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing = await drive.files.list({ q: query, fields: 'files(id, name)' });
  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }
  const folder = await drive.files.create({
    requestBody: {
      name: clientName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [GDRIVE_PARENT_FOLDER_ID],
    },
    fields: 'id',
  });
  return folder.data.id;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { clientFolder, submissionId } = await req.json();
    if (!clientFolder || !submissionId) {
      return new Response(JSON.stringify({ error: 'Missing clientFolder or submissionId' }), { status: 400 });
    }

    const supabase = getSupabase();

    // Pull the row back so we have a canonical copy for Drive
    const { data: row, error: rowErr } = await supabase
      .from('nccp_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();
    if (rowErr) throw rowErr;

    const drive = getDriveClient();
    const folderName = row.app1_full_name || clientFolder;
    const driveFolderId = await getOrCreateClientFolder(drive, folderName);

    const filename = `NCCP-Client-Needs-Analysis-${folderName.replace(/[^a-z0-9]+/gi, '-')}-${submissionId.slice(0, 8)}.json`;
    const body = JSON.stringify(row, null, 2);

    await drive.files.create({
      requestBody: {
        name: filename,
        parents: [driveFolderId],
        mimeType: 'application/json',
      },
      media: {
        mimeType: 'application/json',
        body: Readable.from([body]),
      },
      fields: 'id, webViewLink',
    });

    // Record the drive folder on the submission row
    await supabase
      .from('nccp_submissions')
      .update({ drive_folder_url: `https://drive.google.com/drive/folders/${driveFolderId}` })
      .eq('id', submissionId);

    return new Response(JSON.stringify({ ok: true, driveFolderId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('sync-to-drive failed', err);
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
