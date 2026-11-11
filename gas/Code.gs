// Copy this entire file into Apps Script. No credentials or spreadsheet IDs in code.
const Q4_RANGES = ['T11:T12', 'A13:T16', 'A21:T23', 'A29:T31', 'A37:T39', 'A45:T47', 'A55:G74', 'A77:G79'];

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function sameKey_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b.length < 32 || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < b.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

// GET never returns sheet data, including when someone opens the URL in a browser.
function doGet() {
  return json_({ok: false, error: 'POST_REQUIRED'});
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body || body.length > 4096) return json_({ok: false, error: 'UNAUTHORIZED'});
    let request;
    try { request = JSON.parse(body); } catch (_) { return json_({ok: false, error: 'UNAUTHORIZED'}); }
    const properties = PropertiesService.getScriptProperties();
    if (!request || !sameKey_(request.key, properties.getProperty('Q4_SHARED_KEY')))
      return json_({ok: false, error: 'UNAUTHORIZED'});
    if (request.action !== 'readTargets') return json_({ok: false, error: 'INVALID_ACTION'});
    const id = properties.getProperty('Q4_SPREADSHEET_ID');
    if (!id) return json_({ok: false, error: 'NOT_CONFIGURED'});
    const book = SpreadsheetApp.openById(id);
    const sheet = book.getSheetByName('01_经营目标');
    if (!sheet) return json_({ok: false, error: 'SHEET_UNAVAILABLE'});
    const zone = book.getSpreadsheetTimeZone();
    // getValues returns formula results, not formula strings or formatted currency.
    // Dates use the spreadsheet timezone, avoiding an accidental business-day shift.
    const valueRanges = Q4_RANGES.map(function (range) {
      const values = sheet.getRange(range).getValues().map(function (row) {
        return row.map(function (value) {
          if (Object.prototype.toString.call(value) === '[object Date]')
            return Utilities.formatDate(value, zone, 'yyyy-MM-dd');
          return typeof value === 'boolean' ? String(value) : value;
        });
      });
      return {range: range, values: values};
    });
    return json_({ok: true, version: 1, valueRanges: valueRanges});
  } catch (_) {
    // Do not return exceptions, IDs, keys or raw sheet contents in error responses/logs.
    return json_({ok: false, error: 'READ_FAILED'});
  }
}

// Run once in the editor: create a key only if absent, then request spreadsheet authorization.
// Retrieve the key from Project Settings > Script Properties; nothing is logged.
function authorizeReader() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('Q4_SHARED_KEY'))
    properties.setProperty('Q4_SHARED_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  const id = properties.getProperty('Q4_SPREADSHEET_ID');
  if (!id) throw new Error('Set Q4_SPREADSHEET_ID in Script Properties first.');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('01_经营目标');
  if (!sheet) throw new Error('Required target sheet is unavailable.');
  sheet.getRange('T11').getValue();
}
