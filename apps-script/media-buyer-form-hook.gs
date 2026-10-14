/**
 * Media Buyer Desk — form hook
 *
 * Paste into the response sheet ("Meta and Google Ads Confirmation Form (Responses)"):
 *   Extensions → Apps Script → replace Code.gs with this file → Save.
 *
 * Then once:
 *   1. Project Settings → Script properties → add
 *        MB_INTAKE_URL     https://azlzgovrljdmqzghqcta.supabase.co/functions/v1/media-buyer-form-intake
 *        MB_FORM_SECRET    (same value as the MB_FORM_SECRET secret in Supabase)
 *   2. Run `installTrigger` (authorise when asked). New submissions now reach the app.
 *   3. Optional: run `backfill` to send past responses. Safe to run more than once —
 *      the app ignores rows it has already seen. Responses older than 30 days are
 *      imported as closed history, not as new requests.
 */

const SHEET_NAME = 'Form responses 1';

function installTrigger() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onFormSubmitHook')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onFormSubmitHook').forSpreadsheet(ss).onFormSubmit().create();
  Logger.log('Trigger installed.');
}

function onFormSubmitHook(e) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  send_([rowToSubmission_(sheet, row)]);
}

function backfill() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  const batch = [];
  for (let r = 2; r <= last; r++) {
    const s = rowToSubmission_(sheet, r);
    if (s) batch.push(s);
    if (batch.length === 50) { send_(batch.splice(0)); }
  }
  if (batch.length) send_(batch);
}

function rowToSubmission_(sheet, row) {
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const values = sheet.getRange(row, 1, 1, width).getValues()[0];
  const ts = values[0];
  if (!(ts instanceof Date)) return null;            // blank or malformed row
  const fields = {};
  headers.forEach((h, i) => {
    if (!h || i === 0) return;                         // skip Timestamp column
    const v = values[i];
    fields[String(h)] = v instanceof Date ? v.toISOString() : String(v);
  });
  // The real Date from the cell, not the display string, so timezones can't drift.
  return { submitted_at: ts.toISOString(), fields: fields };
}

function send_(submissions) {
  if (!submissions.length) return;
  const props = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(props.getProperty('MB_INTAKE_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-mb-form-secret': props.getProperty('MB_FORM_SECRET') },
    payload: JSON.stringify({ submissions: submissions }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
  if (res.getResponseCode() >= 400) {
    throw new Error('Media Buyer intake failed: ' + res.getContentText());
  }
}
