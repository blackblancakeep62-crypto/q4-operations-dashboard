// Add as a NEW file in the existing Apps Script project. Do not change Code.gs.
// Only secret needed here: Script Property Q4_GITHUB_PAT (fine-grained PAT).
const Q4_SCHED_REPO = 'blackblancakeep62-crypto/q4-operations-dashboard';
const Q4_SCHED_WORKFLOW = 'pages.yml';
const Q4_SCHED_ZONE = 'Asia/Shanghai';

function q4ScheduleProperties_() { return PropertiesService.getScriptProperties(); }

// Sanitize before truncating. Never log the request, raw exception object or stack.
function q4SafeDiagnostic_(value, token) {
  let text = String(value == null ? '' : value);
  [token, token && token.trim()].forEach(function (secret) {
    if (!secret) return;
    [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)].forEach(function (variant) {
      text = text.split(variant).join('[REDACTED]');
    });
  });
  text = text
    .replace(/github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/((?:proxy-)?authorization["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,}]+)/gi, '$1[REDACTED]')
    .replace(/\b(Bearer|Basic)\s+[^\s"',;}]+/gi, '$1 [REDACTED]')
    .replace(/((?:access_token|refresh_token|client_secret|password|api_key|Q4_GITHUB_PAT)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,}&]+)/gi, '$1[REDACTED]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
  return text.slice(0, 1200);
}

function q4GitHubRequest_(suffix, method, payload) {
  const token = q4ScheduleProperties_().getProperty('Q4_GITHUB_PAT');
  if (!token) throw new Error('Set Q4_GITHUB_PAT in Script Properties first.');
  if (/[\r\n]/.test(token) || token !== token.trim())
    throw new Error('Q4_GITHUB_PAT contains a line break or surrounding whitespace; correct the existing property, do not create a new token.');
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.github.com/repos/' + Q4_SCHED_REPO + suffix, {
      method: method, headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      contentType: 'application/json',
      ...(payload ? {payload: JSON.stringify(payload)} : {}),
      muteHttpExceptions: true, followRedirects: false
    });
  } catch (cause) {
    const type = q4SafeDiagnostic_(cause && cause.name || 'UnknownError', token);
    const reason = q4SafeDiagnostic_(cause && cause.message || cause, token);
    throw new Error('GitHub request exception [UrlFetchApp.fetch] type=' + type +
      '; reason=' + reason + '; HTTP response unavailable. Check Actions before retrying.');
  }
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    let reason = 'No JSON error message';
    try { reason = JSON.parse(response.getContentText()).message || reason; } catch (_) {}
    throw new Error('GitHub HTTP ' + status + '; reason=' + q4SafeDiagnostic_(reason, token) +
      '; check existing PAT permission/expiry and workflow.');
  }
  return response;
}

// Run once manually to authorize external requests and submit a real test run.
// This does NOT install timers or disable the existing GitHub cron.
function testGitHubDispatch() {
  q4Dispatch_('gas_test', 'test-' + Utilities.formatDate(new Date(), Q4_SCHED_ZONE, 'yyyyMMdd-HHmmss'));
}

function q4MorningTimer() { q4Timer_('AM'); }
function q4EveningTimer() { q4Timer_('PM'); }

function q4Timer_(period) {
  if (q4ScheduleProperties_().getProperty('Q4_TIMERS_ENABLED') !== 'true') return;
  const date = Utilities.formatDate(new Date(), Q4_SCHED_ZONE, 'yyyy-MM-dd');
  q4Dispatch_('gas_timer', date + '-' + period);
}

function q4Dispatch_(source, slot) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another dispatch is running; no duplicate submitted.');
  const props = q4ScheduleProperties_();
  const recordKey = 'Q4_LAST_' + (source === 'gas_test' ? 'TEST' : slot.slice(-2));
  try {
    const previous = JSON.parse(props.getProperty(recordKey) || 'null');
    if (previous && previous.slot === slot) {
      console.log('Duplicate slot skipped: ' + slot + '; previous status: ' + previous.status);
      return;
    }
    // Reserve BEFORE sending: a network timeout must not cause an automatic duplicate.
    const record = {source: source, slot: slot, attemptedAt: new Date().toISOString(), status: 'sending'};
    props.setProperty(recordKey, JSON.stringify(record));
    try {
      const response = q4GitHubRequest_('/actions/workflows/' + Q4_SCHED_WORKFLOW + '/dispatches', 'post', {
        ref: 'main', inputs: {source: source, slot: slot}
      });
      record.status = 'accepted';
      record.httpStatus = response.getResponseCode();
      console.log('GitHub accepted ' + source + ' / ' + slot + '. Check Actions for synchronized=true and deployment result.');
    } catch (error) {
      record.status = 'failed_or_unknown';
      throw error;
    } finally { props.setProperty(recordKey, JSON.stringify(record)); }
  } finally { lock.releaseLock(); }
}

// After gas_test succeeds, copy its Actions run ID to Q4_GAS_TEST_RUN_ID.
// Install only AFTER native schedule has been removed from pages.yml on main.
function installQ4Timers() {
  const props = q4ScheduleProperties_();
  const testRecord = JSON.parse(props.getProperty('Q4_LAST_TEST') || 'null');
  const runId = props.getProperty('Q4_GAS_TEST_RUN_ID') || '';
  if (!testRecord || testRecord.status !== 'accepted' || !/^\d+$/.test(runId))
    throw new Error('Run testGitHubDispatch, confirm its successful Actions run, then set Q4_GAS_TEST_RUN_ID.');
  const run = JSON.parse(q4GitHubRequest_('/actions/runs/' + runId, 'get').getContentText());
  if (run.event !== 'workflow_dispatch' || run.conclusion !== 'success' || run.head_branch !== 'main' ||
      run.path !== '.github/workflows/' + Q4_SCHED_WORKFLOW ||
      run.display_title.indexOf('gas_test') < 0 || run.display_title.indexOf(testRecord.slot) < 0)
    throw new Error('The specified run must match the successful gas_test from this script.');
  // Public source read needs no token. PAT remains limited to Actions permissions.
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + Q4_SCHED_REPO +
    '/contents/.github/workflows/' + Q4_SCHED_WORKFLOW + '?ref=main', {
      headers: {Accept: 'application/vnd.github.raw+json'}, muteHttpExceptions: true, followRedirects: false
    });
  if (response.getResponseCode() !== 200) throw new Error('Cannot verify the workflow configuration.');
  if (/^\s+schedule\s*:/m.test(response.getContentText()))
    throw new Error('Native GitHub schedule is still present. Remove it AFTER the test, then install timers.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    props.setProperty('Q4_TIMERS_ENABLED', 'false');
    q4DeleteOwnTimers_();
    try {
      ScriptApp.newTrigger('q4MorningTimer').timeBased().atHour(9).nearMinute(17).everyDays(1).inTimezone(Q4_SCHED_ZONE).create();
      ScriptApp.newTrigger('q4EveningTimer').timeBased().atHour(17).nearMinute(17).everyDays(1).inTimezone(Q4_SCHED_ZONE).create();
      props.setProperty('Q4_TIMERS_ENABLED', 'true');
    } catch (_) {
      q4DeleteOwnTimers_();
      throw new Error('Timer installation failed; timers remain disabled.');
    }
    console.log('Two daily timers installed. Times are approximate, not exact to the minute.');
  } finally { lock.releaseLock(); }
}

function q4DeleteOwnTimers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (['q4MorningTimer', 'q4EveningTimer'].indexOf(trigger.getHandlerFunction()) >= 0)
      ScriptApp.deleteTrigger(trigger);
  });
}

function removeQ4Timers() {
  q4ScheduleProperties_().setProperty('Q4_TIMERS_ENABLED', 'false');
  q4DeleteOwnTimers_();
}

// Safe status only: never logs the PAT or other script properties.
function showQ4SchedulerStatus() {
  const props = q4ScheduleProperties_();
  ['Q4_TIMERS_ENABLED', 'Q4_LAST_TEST', 'Q4_LAST_AM', 'Q4_LAST_PM'].forEach(function (name) {
    console.log(name + ': ' + (props.getProperty(name) || 'not set'));
  });
}
