/**
 * FormForge — FormService.gs
 * Google Form creation using FormApp.
 *
 * Verified against the official Apps Script Form service:
 *  FormApp.create(title), Form.setTitle/Description/ConfirmationMessage,
 *  setCollectsEmail, setLimitOneResponsePerUser, setAllowResponseEdits,
 *  addTextItem / addParagraphTextItem / addMultipleChoiceItem /
 *  addCheckboxItem / addListItem / addDateItem / addTimeItem / addScaleItem,
 *  Item.setTitle/setHelpText, typed item .setRequired / .setChoiceValues /
 *  ScaleItem.setBounds(lower, upper).setLowerLabel/.setUpperLabel,
 *  Form.setDestination(FormApp.DestinationType.SPREADSHEET, id),
 *  Form.getPublishedUrl / getEditUrl / getId / getDestinationId.
 */

function ffCreateForm_(normalized) {
  var form;
  try {
    form = FormApp.create(normalized.title);
  } catch (e) {
    throw new Error('Form creation failed: ' + ffSafeServiceMessage_(e));
  }

  try {
    form.setTitle(normalized.title);
    if (normalized.description) {
      form.setDescription(normalized.description);
    }
    // Confirmation message
    try {
      form.setConfirmationMessage(normalized.settings.confirmationMessage);
    } catch (e) {
      // Non-fatal: older behavior may differ; record as warning via property.
      ffLastWarnings_.push('Could not set confirmation message: ' + ffSafeServiceMessage_(e));
    }
    // Supported settings — each guarded so one failure doesn't abort creation.
    try { form.setCollectsEmail(normalized.settings.collectEmail); }
    catch (e) { ffLastWarnings_.push('Could not apply collectEmail: ' + ffSafeServiceMessage_(e)); }
    try { form.setLimitOneResponsePerUser(normalized.settings.limitOneResponse); }
    catch (e) { ffLastWarnings_.push('Could not apply limitOneResponse (requires Google sign-in collection): ' + ffSafeServiceMessage_(e)); }
    try { form.setAllowResponseEdits(normalized.settings.allowResponseEdits); }
    catch (e) { ffLastWarnings_.push('Could not apply allowResponseEdits: ' + ffSafeServiceMessage_(e)); }

    // Add questions in order.
    for (var i = 0; i < normalized.questions.length; i++) {
      ffAddQuestion_(form, normalized.questions[i]);
    }
  } catch (e) {
    // Attempt cleanup? Keep the form (user can delete) but surface error.
    // Do NOT delete silently — user may want to inspect. Report id for recovery.
    var fid = '';
    try { fid = form.getId(); } catch (ignored) {}
    throw new Error('Form configuration failed' + (fid ? ' (partial form id: ' + fid + ')' : '') + ': ' + ffSafeServiceMessage_(e));
  }

  return form;
}

function ffAddQuestion_(form, q) {
  var item;
  var required = q.required === true;
  var helpText = q.description || '';

  switch (q.type) {
    case 'SHORT_ANSWER': {
      var t = form.addTextItem();
      t.setTitle(q.title);
      if (helpText) t.setHelpText(helpText);
      t.setRequired(required);
      item = t;
      break;
    }
    case 'PARAGRAPH': {
      var p = form.addParagraphTextItem();
      p.setTitle(q.title);
      if (helpText) p.setHelpText(helpText);
      p.setRequired(required);
      item = p;
      break;
    }
    case 'MULTIPLE_CHOICE': {
      var mc = form.addMultipleChoiceItem();
      mc.setTitle(q.title);
      if (helpText) mc.setHelpText(helpText);
      mc.setChoiceValues(q.options);
      mc.setRequired(required);
      item = mc;
      break;
    }
    case 'CHECKBOXES': {
      var cb = form.addCheckboxItem();
      cb.setTitle(q.title);
      if (helpText) cb.setHelpText(helpText);
      cb.setChoiceValues(q.options);
      cb.setRequired(required);
      item = cb;
      break;
    }
    case 'DROPDOWN': {
      var li = form.addListItem();
      li.setTitle(q.title);
      if (helpText) li.setHelpText(helpText);
      li.setChoiceValues(q.options);
      li.setRequired(required);
      item = li;
      break;
    }
    case 'DATE': {
      var d = form.addDateItem();
      d.setTitle(q.title);
      if (helpText) d.setHelpText(helpText);
      d.setRequired(required);
      // NOTE: FormApp DateItem does not expose year/time toggles reliably
      // across versions; defaults are used. Documented in README.
      item = d;
      break;
    }
    case 'TIME': {
      var ti = form.addTimeItem();
      ti.setTitle(q.title);
      if (helpText) ti.setHelpText(helpText);
      ti.setRequired(required);
      item = ti;
      break;
    }
    case 'LINEAR_SCALE': {
      var sc = q.scaleConfig || { min: 1, max: 5, lowerLabel: '', upperLabel: '' };
      var s = form.addScaleItem();
      s.setTitle(q.title);
      if (helpText) s.setHelpText(helpText);
      s.setBounds(sc.min, sc.max);
      if (sc.lowerLabel) { try { s.setLowerLabel(sc.lowerLabel); } catch (e) {} }
      if (sc.upperLabel) { try { s.setUpperLabel(sc.upperLabel); } catch (e) {} }
      s.setRequired(required);
      item = s;
      break;
    }
    default:
      throw new Error('Unsupported question type "' + q.type + '" at creation time.');
  }
  return item;
}

/**
 * Retrieve verified URLs for a created form. Throws with safe message on failure.
 */
function ffGetFormUrls_(form) {
  var publishedUrl = '';
  var editUrl = '';
  var id = '';
  try { id = form.getId(); } catch (e) { throw new Error('Could not read form id: ' + ffSafeServiceMessage_(e)); }
  try { publishedUrl = form.getPublishedUrl(); } catch (e) { publishedUrl = ''; }
  try { editUrl = form.getEditUrl(); } catch (e) { editUrl = ''; }
  if (!publishedUrl) {
    // Published URL may be empty until accepting responses; still return id + edit url.
    ffLastWarnings_.push('Form published (respondent) URL was not returned by the Forms service. Use the edit URL to open the form and use Send.');
  }
  return { id: id, publishedUrl: publishedUrl, editUrl: editUrl };
}

/**
 * Strip internal details from Google service exceptions for user display.
 */
function ffSafeServiceMessage_(e) {
  var msg = '';
  try { msg = String((e && e.message) || e); } catch (ignored) { msg = 'Unknown service error'; }
  // Remove anything that looks like internal paths/ids beyond 300 chars.
  if (msg.length > 300) msg = msg.slice(0, 300) + '…';
  return msg;
}
