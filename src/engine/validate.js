// Coerces and validates raw form/JSON input against a product's field schema.
// Returns { value, errors } so the API can report every problem at once.
function validateInput(fields, raw = {}) {
  const value = {};
  const errors = {};

  for (const f of fields) {
    let v = raw[f.key];
    const missing = v === undefined || v === null || v === '';

    if (missing) {
      if (f.required) errors[f.key] = `${f.label} is required`;
      else if (f.default !== undefined) value[f.key] = f.default;
      continue;
    }

    switch (f.type) {
      case 'number': {
        v = typeof v === 'number' ? v : Number(String(v).replace(/[,\s₹]/g, ''));
        if (!Number.isFinite(v)) errors[f.key] = `${f.label} must be a number`;
        else if (f.min !== undefined && v < f.min) errors[f.key] = `${f.label} must be at least ${f.min}`;
        else if (f.max !== undefined && v > f.max) errors[f.key] = `${f.label} must be at most ${f.max}`;
        else value[f.key] = v;
        break;
      }
      case 'boolean': {
        if (typeof v === 'boolean') value[f.key] = v;
        else if (['true', '1', 'yes', 'on'].includes(String(v).toLowerCase())) value[f.key] = true;
        else if (['false', '0', 'no', 'off'].includes(String(v).toLowerCase())) value[f.key] = false;
        else errors[f.key] = `${f.label} must be yes or no`;
        break;
      }
      case 'select': {
        v = String(v);
        if (!f.options.some((o) => o.value === v)) errors[f.key] = `${f.label} has an invalid option`;
        else value[f.key] = v;
        break;
      }
      default: {
        v = String(v).trim();
        if (f.maxLength && v.length > f.maxLength) errors[f.key] = `${f.label} is too long`;
        else if (f.pattern && !new RegExp(f.pattern).test(v)) errors[f.key] = f.patternMessage || `${f.label} is invalid`;
        else value[f.key] = v;
      }
    }
  }

  return { value, errors };
}

module.exports = { validateInput };
