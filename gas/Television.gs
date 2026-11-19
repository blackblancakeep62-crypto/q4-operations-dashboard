// Add alongside Code.gs and Scheduler.gs. Reuses existing authorization and PAT.
function q4ReadTv_() {
  const sheet = SpreadsheetApp.openById('19mz6u9eRFfN0zCsbtHxWJ6Ib0WN5lZwdMq2nftULcgI').getSheetByName('电视投屏数据');
  if (!sheet || sheet.getSheetId() !== 118366337) return json_({ok: false, error: 'SHEET_UNAVAILABLE'});
  return json_({ok: true, version: 1, valueRanges: ['A3:F7', 'A12:C16'].map(function(range) {
    return {range: range, values: sheet.getRange(range).getValues().map(function(row) {
      return row.map(function(value) { return typeof value === 'number' || typeof value === 'string' ? value : null; });
    })};
  })});
}

// V2 adds formula results D12:E12. The legacy readTv ranges and response stay unchanged.
function q4ReadTvV2_() {
  const sheet = SpreadsheetApp.openById('19mz6u9eRFfN0zCsbtHxWJ6Ib0WN5lZwdMq2nftULcgI').getSheetByName('电视投屏数据');
  if (!sheet || sheet.getSheetId() !== 118366337) return json_({ok: false, error: 'SHEET_UNAVAILABLE'});
  return json_({ok: true, version: 2, valueRanges: ['A3:F7', 'A12:C16', 'D12:E12'].map(function(range) {
    return {range: range, values: sheet.getRange(range).getValues().map(function(row) {
      return row.map(function(value) { return typeof value === 'number' || typeof value === 'string' ? value : null; });
    })};
  })});
}

function testTvDispatch() { q4TvDispatch_('tv_test'); }
function q4TvHourlyTimer() {
  if (q4ScheduleProperties_().getProperty('Q4_TV_ENABLED') === 'true') q4TvDispatch_('tv_timer');
}
function q4TvDispatch_(source) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = q4ScheduleProperties_();
    const slot = Utilities.formatDate(new Date(), Q4_SCHED_ZONE, 'yyyy-MM-dd-HH');
    const key = source === 'tv_test' ? 'Q4_TV_TEST' : 'Q4_TV_LAST';
    const previous = JSON.parse(props.getProperty(key) || 'null');
    if (source === 'tv_timer' && previous && previous.slot === slot) return;
    const record = {slot: slot, attemptedAt: new Date().toISOString(), status: 'sending'};
    props.setProperty(key, JSON.stringify(record));
    try {
      q4GitHubRequest_('/actions/workflows/' + Q4_SCHED_WORKFLOW + '/dispatches', 'post', {ref: 'main', inputs: {source: source, slot: slot}});
      record.status = 'accepted';
    } catch (error) { record.status = 'failed_or_unknown'; throw error; }
    finally { props.setProperty(key, JSON.stringify(record)); }
  } finally { lock.releaseLock(); }
}

// Run after tv_test shows synchronized=true and successful Pages deployment.
function installTvHourlyTimer() {
  const props = q4ScheduleProperties_();
  props.setProperty('Q4_TV_ENABLED', 'false');
  removeTvHourlyTimer();
  ScriptApp.newTrigger('q4TvHourlyTimer').timeBased().everyHours(1).create();
  props.setProperty('Q4_TV_ENABLED', 'true');
}
function removeTvHourlyTimer() {
  q4ScheduleProperties_().setProperty('Q4_TV_ENABLED', 'false');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'q4TvHourlyTimer') ScriptApp.deleteTrigger(trigger);
  });
}
