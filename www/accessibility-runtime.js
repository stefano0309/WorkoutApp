/* UI-03: progressive enhancement for controls rendered dynamically by index.js. */
(() => {
  const labelFormControl = (control) => {
    if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;

    const field = control.closest('.hts-field, .form-group, .mb-3, .mb-2');
    const label = field?.querySelector('label');
    if (label?.textContent?.trim()) {
      control.setAttribute('aria-label', label.textContent.trim());
      return;
    }

    const placeholder = control.getAttribute('placeholder');
    if (placeholder) control.setAttribute('aria-label', placeholder);
  };

  const enhance = (root = document) => {
    root.querySelectorAll?.('button, a, input, select, textarea').forEach((element) => {
      if (element.matches('input, select, textarea')) labelFormControl(element);

      if (element.matches('button, a')) {
        if (!element.getAttribute('aria-label') && element.getAttribute('title')) {
          element.setAttribute('aria-label', element.getAttribute('title'));
        }
        if (element.matches('.bottom-nav-item') && !element.getAttribute('aria-label')) {
          const visibleText = element.textContent.trim();
          if (visibleText) element.setAttribute('aria-label', visibleText);
        }
      }
    });

    root.querySelectorAll?.('button i.bi, a i.bi').forEach((icon) => {
      if (!icon.hasAttribute('aria-hidden')) icon.setAttribute('aria-hidden', 'true');
    });

    const modal = document.getElementById('appModal');
    const modalHeading = modal?.querySelector('h1, h2, h3, h4, h5, h6');
    if (modal && modalHeading) {
      modalHeading.id ||= 'modalTitle';
      modal.setAttribute('aria-labelledby', modalHeading.id);
    }
  };

  enhance();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
