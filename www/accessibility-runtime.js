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

  enhance();

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
    if (contentChanged) queueMicrotask(focusMainAfterNavigation);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
