/**
 * FormForge — SpreadsheetService.gs
 * Spreadsheet creation + linking as Form response destination.
 */

function ffCreateResponseSpreadsheet_(formTitle) {
  var base = String(formTitle || 'Untitled Form').trim() || 'Untitled Form';
  var title = base + ' (Responses)';
  if (title.length > FF_LIMITS.MAX_SPREADSHEET_TITLE_LEN) {
    title = title.slice(0, FF_LIMITS.MAX_SPREADSHEET_TITLE_LEN);
  }
  var ss;
  try {
    ss = SpreadsheetApp.create(title);
  } catch (e) {
    throw new Error('Spreadsheet creation failed: ' + ffSafeServiceMessage_(e));
  }
  return ss;
}

function ffLinkResponseDestination_(form, spreadsheetId) {
  try {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheetId);
  } catch (e) {
    throw new Error('Response-destination linking failed: ' + ffSafeServiceMessage_(e));
  }
  // Verify linkage.
  var destId = '';
  var destType = null;
  try { destType = form.getDestinationType(); } catch (e) { destType = null; }
  try { destId = form.getDestinationId(); } catch (e) { destId = ''; }
  var linked = (destId === spreadsheetId);
  return { linked: linked, destinationId: destId, destinationType: destType ? String(destType) : '' };
}

function ffGetSpreadsheetInfo_(ss) {
  var url = '';
  var id = '';
  try { id = ss.getId(); } catch (e) { throw new Error('Could not read spreadsheet id: ' + ffSafeServiceMessage_(e)); }
  try { url = ss.getUrl(); } catch (e) { url = ''; }
  if (!url) {
    url = 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
  }
  return { id: id, url: url };
}
