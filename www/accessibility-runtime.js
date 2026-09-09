/* UI-03: progressive enhancement for controls rendered dynamically by index.js. */
(() => {
  const labelFormControl = (control) => {
    if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;

    const field = control.closest('.hts-field, .form-group, .mb-3, .mb-2');
    const label = field?.querySelector('label');
    if (label?.textContent?.trim()) {
      const labelId = label.id || `a11y-label-${Math.random().toString(36).slice(2, 9)}`;
      label.id = labelId;
      control.setAttribute('aria-labelledby', labelId);
      return;
    }

    const placeholder = control.getAttribute('placeholder');
    if (placeholder) control.setAttribute('aria-label', placeholder);
  };

  const enhance = (root = document) => {
    root.querySelectorAll?.('button, a, input, select, textarea, [role="button"]').forEach((element) => {
      if (element.matches('input, select, textarea')) labelFormControl(element);

      if (element.matches('button, a, [role="button"]')) {
        if (!element.getAttribute('aria-label') && element.getAttribute('title')) {
          element.setAttribute('aria-label', element.getAttribute('title'));
        }
        if (element.matches('.bottom-nav-item') && !element.getAttribute('aria-label')) {
          const visibleText = element.textContent.trim();
          if (visibleText) element.setAttribute('aria-label', visibleText);
        }

        if (element.getAttribute('role') === 'button' && !element.matches('button, a')) {
          element.setAttribute('tabindex', '0');
          if (!element.dataset.a11yKeyboard) {
            element.dataset.a11yKeyboard = 'true';
            element.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                element.click();
              }
            });
          }
        }
      }
    });

    root.querySelectorAll?.('button i.bi, a i.bi, [role="button"] i.bi').forEach((icon) => {
      if (!icon.hasAttribute('aria-hidden')) icon.setAttribute('aria-hidden', 'true');
    });

    const modal = document.getElementById('appModal');
    const modalHeading = modal?.querySelector('h1, h2, h3, h4, h5, h6');
    if (modal && modalHeading) {
      modalHeading.id ||= 'modalTitle';
      modal.setAttribute('aria-labelledby', modalHeading.id);
    }
  };

  const focusMainAfterNavigation = () => {
    const main = document.getElementById('app');
    if (!main || document.activeElement?.closest('#app')) return;
    main.focus({ preventScroll: true });
  };

  const initSaveFeedback = () => {
    const status = document.getElementById('saveStatus');
    if (!status || status.dataset.saveFeedbackReady === 'true') return;

    status.dataset.saveFeedbackReady = 'true';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');

    const baseClasses = 'badge w-100 mt-2 py-2';
    const states = {
      saving: {
        text: 'Salvataggio in corso…',
        classes: `${baseClasses} bg-warning bg-opacity-25 text-warning border border-warning`,
        busy: 'true',
      },
      saved: {
        classes: `${baseClasses} bg-success bg-opacity-25 text-success border border-success`,
        busy: 'false',
      },
      error: {
        text: 'Salvataggio: errore',
        classes: `${baseClasses} bg-danger bg-opacity-25 text-danger border border-danger`,
        busy: 'false',
      },
    };

    const setState = (name, text) => {
      const next = states[name];
      if (!next) return;
      status.className = next.classes;
      status.setAttribute('aria-busy', next.busy);
      if (typeof text === 'string' && status.textContent !== text) {
        status.textContent = text;
      }
      status.dataset.saveState = name;
    };

    window.__htsSaveFeedback = {
      setState,
      saving() {
        setState('saving');
      },
      saved(timeLabel) {
        const text = timeLabel ? `Salvato ${timeLabel}` : 'Salvato';
        setState('saved', text);
      },
      error() {
        setState('error');
      },
    };

    if (!window.__htsSaveFeedbackStoragePatched) {
      window.__htsSaveFeedbackStoragePatched = true;
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'hybridTrainingSystem') {
          window.__htsSaveFeedback?.saving();
        }
        return originalSetItem.call(this, key, value);
      };
    }

    const initialText = status.textContent.trim();
    if (initialText.startsWith('Salvato ')) {
      setState('saved', initialText);
    } else if (initialText === 'Salvataggio: errore') {
      setState('error');
    }
  };

  const enhanceSaveFeedback = () => {
    initSaveFeedback();
    const status = document.getElementById('saveStatus');
    if (!status || typeof window.updateSaveIndicator !== 'function' || window.__htsSaveIndicatorWrapped) return;

    const original = window.updateSaveIndicator;
    window.updateSaveIndicator = (saveState) => {
      if (saveState === 'error') {
        window.__htsSaveFeedback?.error();
      } else if (saveState === 'ok') {
        const savedAt = typeof window.state !== 'undefined' ? window.state?.lastSavedAt : null;
        const label = savedAt
          ? new Date(savedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
          : '';
        window.__htsSaveFeedback?.saved(label);
      }
      original(saveState);
    };
    window.__htsSaveIndicatorWrapped = true;
  };

  enhance();
  enhanceSaveFeedback();

  const observer = new MutationObserver((mutations) => {
    let contentChanged = false;
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          enhance(node);
          if (node.closest?.('#app') || node.id === 'app') contentChanged = true;
        }
      });
    }
    enhanceSaveFeedback();
    if (contentChanged) queueMicrotask(focusMainAfterNavigation);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
