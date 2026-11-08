(() => {
  'use strict';

  // A request that has not answered after this long is given up, so the form never stays busy forever.
  const SUBMIT_TIMEOUT_MS = 30000;
  // Turnstile's api.js loads async, and after turnstile.reset() the fresh token arrives asynchronously (or
  // only once the visitor solves an interactive challenge); a submit waits this long for a token, polling,
  // before giving up without sending.
  const TURNSTILE_TOKEN_WAIT_MS = 10000;
  const TURNSTILE_TOKEN_POLL_MS = 250;

  // --- Toast logic ---
  const showToast = (toastId) => {
    const toastElement = document.getElementById(toastId);
    if (toastElement) {
      bootstrap.Toast.getOrCreateInstance(toastElement).show();
    }
  };

  const hideToast = (toastId) => {
    const toastElement = document.getElementById(toastId);
    const toast = toastElement ? bootstrap.Toast.getInstance(toastElement) : null;
    if (toast) {
      toast.hide();
    }
  };

  // --- Conditional fields logic ---
  const toggleFieldVisibility = (field, shouldShow) => {
    const container = field.closest('.form-group') || field;
    container.classList.toggle('d-none', !shouldShow);
    container.classList.toggle('d-block', shouldShow);
  };

  const checkConditionals = (form) => {
    form.querySelectorAll('.form-field[data-conditional-field]').forEach(field => {
      const conditionalField = form.querySelector(`[name="${field.dataset.conditionalField}"]`);
      if (conditionalField) {
        const shouldShow = conditionalField.value === field.dataset.conditionalValue;
        toggleFieldVisibility(field, shouldShow);
      }
    });
  };

  const initConditionalFields = (form) => {
    checkConditionals(form);
  };

  // --- Form validation and submission logic ---
  const validateForm = (form) => {
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return false;
    }
    form.classList.add('was-validated');
    return true;
  };

  // While a request runs, the form is marked busy and its enabled submit button(s) are disabled, so a double
  // click or a second Enter sends nothing twice. Returns the buttons it disabled — only those are re-enabled.
  const markBusy = (form) => {
    const buttons = Array.from(form.elements).filter(element => element.type === 'submit' && !element.disabled);
    buttons.forEach(button => {
      button.disabled = true;
    });
    form.setAttribute('aria-busy', 'true');
    return buttons;
  };

  const markIdle = (form, buttons) => {
    buttons.forEach(button => {
      button.disabled = false;
    });
    form.removeAttribute('aria-busy');
  };

  // --- Cloudflare Turnstile ---
  const turnstileToken = (widget) => {
    if (!window.turnstile) {
      return ''; // api.js loads async and is not there yet
    }
    try {
      return window.turnstile.getResponse(widget) || '';
    } catch {
      return ''; // the widget has not rendered yet
    }
  };

  // Resolves the form's Turnstile token once there is one, '' when none arrived within
  // TURNSTILE_TOKEN_WAIT_MS, or null when the form has no Turnstile widget.
  const waitForTurnstileToken = async (form) => {
    const widget = form.querySelector('.cf-turnstile');
    if (!widget) {
      return null;
    }
    const deadline = Date.now() + TURNSTILE_TOKEN_WAIT_MS;
    let token = turnstileToken(widget);
    while (!token) {
      if (Date.now() >= deadline) {
        return '';
      }
      await new Promise(resolve => setTimeout(resolve, TURNSTILE_TOKEN_POLL_MS));
      token = turnstileToken(widget);
    }
    return token;
  };

  // A Turnstile token can be validated only once: after every attempt that sent one, the form's widget needs
  // a fresh one, or a retry would send the spent token and fail verification.
  const resetTurnstile = (form) => {
    const widget = form.querySelector('.cf-turnstile');
    if (widget && window.turnstile) {
      try {
        window.turnstile.reset(widget);
      } catch (error) {
        console.warn('Turnstile reset failed:', error);
      }
    }
  };

  const timeoutSignal = (ms) => {
    if (typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };

  const handleSubmit = async (form) => {
    if (form.getAttribute('aria-busy') === 'true') {
      return;
    }
    if (!validateForm(form)) {
      return;
    }

    const focused = document.activeElement;
    const disabledButtons = markBusy(form);
    let sent = false;

    try {
      const token = await waitForTurnstileToken(form);
      if (token === '') {
        // Without a token the server can only refuse: send nothing, keep every value, the visitor retries.
        showToast('toastError');
        return;
      }
      // A required field may have been cleared during the wait.
      if (!validateForm(form)) {
        return;
      }

      const formData = new FormData(form);
      if (token) {
        // Send the token getResponse() returned: Turnstile fills its hidden input only after a further
        // round-trip, so the input can still be empty here.
        formData.set('cf-turnstile-response', token);
      }
      sent = true;
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
        signal: timeoutSignal(SUBMIT_TIMEOUT_MS),
      });

      if (response.ok) {
        hideToast('toastError');
        showToast('toastSuccess');
        resetForm(form);
      } else {
        // Keep every value: the visitor retries instead of typing the inquiry again.
        showToast('toastError');
      }
    } catch {
      // Network failure or no answer within SUBMIT_TIMEOUT_MS: keep every value as well.
      showToast('toastError');
    } finally {
      markIdle(form, disabledButtons);
      // Disabling the focused submit button dropped focus to the page; give it back unless the visitor has
      // moved on meanwhile.
      if (focused && focused.type === 'submit' && document.activeElement === document.body) {
        focused.focus();
      }
      if (sent) {
        resetTurnstile(form);
      }
    }
  };

  const resetForm = (form) => {
    form.reset();
    form.classList.remove('was-validated');
    checkConditionals(form); // Update conditional fields after reset
  };

  // --- Form initialization ---
  const initForm = (form) => {
    if (!form) {
      console.error("Form with 'data-static-form-name' attribute not found!");
      return;
    }

    // Initialize conditional fields on load and value changes
    initConditionalFields(form);

    // Form submission handler
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await handleSubmit(form);
    });

    // Update conditional fields on form data change
    form.addEventListener('change', () => {
      checkConditionals(form);
    });
  };

  // --- Initialize on page load ---
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form[data-static-form-name]');
    initForm(form);
  });

})();
