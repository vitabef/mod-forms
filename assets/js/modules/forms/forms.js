(() => {
  'use strict';

  // --- Toast logic ---
  const showToast = (toastId) => {
    const toastElement = document.getElementById(toastId);
    if (toastElement) {
      const toast = new bootstrap.Toast(toastElement);
      toast.show();
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

  const handleSubmit = async (form) => {
    if (!validateForm(form)) {
      return;
    }

    const formData = new FormData(form);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
      });

      const toastId = response.ok ? 'toastSuccess' : 'toastError';
      showToast(toastId);
    } catch (error) {
      showToast('toastError');
    } finally {
      resetForm(form);
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
