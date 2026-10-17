let nextId = 0;
const forms = new WeakMap();

// Keep native constraint validation, with a persistent inline explanation after blur.
export const fieldValidation = {
  mounted(form) {
    const fields = new Map();
    function scan() {
      for (const input of form.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea, select')) {
        if (fields.has(input) || !input.willValidate) continue;
        const group = input.closest('.form-group');
        if (!group) continue;
        const error = document.createElement('span');
        error.id = `field-feedback-${++nextId}`;
        error.className = 'ts-field-error';
        error.setAttribute('aria-live', 'polite');
        const description = input.getAttribute('aria-describedby');
        input.setAttribute('aria-describedby', [description, error.id].filter(Boolean).join(' '));
        group.append(error);
        fields.set(input, { error, touched: false, description });
      }
    }
    function validate(event) {
      const field = fields.get(event.target);
      if (!field || (event.type === 'input' && !field.touched)) return;
      field.touched = true;
      const message = event.target.validationMessage;
      field.error.textContent = message;
      event.target.setAttribute('aria-invalid', String(Boolean(message)));
    }
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(form, { childList: true, subtree: true });
    form.addEventListener('focusout', validate);
    form.addEventListener('input', validate);
    form.addEventListener('invalid', validate, true);
    forms.set(form, () => {
      observer.disconnect();
      form.removeEventListener('focusout', validate);
      form.removeEventListener('input', validate);
      form.removeEventListener('invalid', validate, true);
      for (const [input, field] of fields) {
        field.error.remove();
        if (field.description) input.setAttribute('aria-describedby', field.description);
        else input.removeAttribute('aria-describedby');
        input.removeAttribute('aria-invalid');
      }
    });
  },
  beforeUnmount(form) { forms.get(form)?.(); forms.delete(form); }
};
