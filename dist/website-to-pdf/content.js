// content.js - Scans the page for links, anchors, and buttons that lead to another page
// and sends the list to the popup.

(function () {
  // Listen for a request from the popup to scan the page
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'SCAN_LINKS') {
      const links = scanPage();
      sendResponse({ links });
    } else if (message && message.type === 'SCAN_CSS_CLASS') {
      const links = scanByCssClass(message.cssClass);
      sendResponse({ links });
    }
    return true; // Keep the message channel open for async response
  });

  /**
   * Scans the current page and returns a list of unique links
   * that lead to another page (anchors, links, and buttons with navigation).
   * Works on:
   * - Regular HTML pages (http/https)
   * - Local files (file://) - requires "Allow access to file URLs" in extension settings
   * - Plain text files (.txt) - extracts URLs from the raw text content
   */
  function scanPage() {
    const linkMap = new Map();
    const currentUrl = window.location.href;
    const currentOrigin = window.location.origin;

    // Helper to normalize a URL
    function normalizeUrl(href) {
      try {
        const url = new URL(href, currentUrl);
        // Remove hash fragments for deduplication
        url.hash = '';
        return url.href;
      } catch (e) {
        return null;
      }
    }

    // Helper to add a link to the map (deduplicated)
    function addLink(url, text, element) {
      if (!url) return;
      const normalized = normalizeUrl(url);
      if (!normalized) return;

      // Skip javascript: and mailto: and tel: links
      if (normalized.startsWith('javascript:') || normalized.startsWith('mailto:') || normalized.startsWith('tel:')) return;

      // Skip the current page itself (same URL without hash)
      const currentNormalized = normalizeUrl(currentUrl);
      if (currentNormalized && normalized === currentNormalized) return;

      if (!linkMap.has(normalized)) {
        linkMap.set(normalized, {
          url: normalized,
          text: text || normalized,
          title: element ? (element.getAttribute('title') || '') : '',
          isExternal: currentOrigin ? !normalized.startsWith(currentOrigin) : true,
          isButton: element ? (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button' || element.getAttribute('type') === 'button') : false
        });
      }
    }

    // 1. Collect all <a> tags with href (works on parsed HTML pages)
    const anchors = document.querySelectorAll('a[href]');
    anchors.forEach((a) => {
      const href = a.href;
      const text = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      addLink(href, text, a);
    });

    // 2. Collect buttons that have a data-href, data-url, or onclick that navigates
    const buttons = document.querySelectorAll('button[data-href], button[data-url], button[onclick], [role="button"][data-href], [role="button"][data-url]');
    buttons.forEach((btn) => {
      const dataHref = btn.getAttribute('data-href') || btn.getAttribute('data-url');
      if (dataHref) {
        const text = (btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
        addLink(dataHref, text, btn);
      } else {
        // Try to extract URL from onclick attribute
        const onclick = btn.getAttribute('onclick') || '';
        const urlMatch = onclick.match(/['"]([^'"]*(?:https?:\/\/|\/)[^'"]*)['"]/);
        if (urlMatch && urlMatch[1]) {
          const text = (btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
          addLink(urlMatch[1], text, btn);
        }
      }
    });

    // 3. Collect elements with data-href attributes (common in SPAs)
    const dataHrefElements = document.querySelectorAll('[data-href]');
    dataHrefElements.forEach((el) => {
      if (el.tagName === 'A' || el.tagName === 'BUTTON') return; // Already handled
      const href = el.getAttribute('data-href');
      if (href) {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
        addLink(href, text, el);
      }
    });

    // 4. If no links found via DOM (e.g., plain text file), extract URLs from raw text content
    if (linkMap.size === 0) {
      extractLinksFromText(linkMap, addLink);
    }

    // Convert map to array and sort by text
    const links = Array.from(linkMap.values());
    links.sort((a, b) => (a.text || '').localeCompare(b.text || ''));

    return links;
  }

  /**
   * Scans the page for elements matching a CSS class selector
   * and extracts their navigation targets (href, data-href, onclick, etc.).
   * This is useful for finding buttons/links that use CSS modules
   * with hashed class names.
   */
  function scanByCssClass(cssClass) {
    if (!cssClass) return [];

    const linkMap = new Map();
    const currentUrl = window.location.href;
    const currentOrigin = window.location.origin;

    // Helper to normalize a URL
    function normalizeUrl(href) {
      try {
        const url = new URL(href, currentUrl);
        url.hash = '';
        return url.href;
      } catch (e) {
        return null;
      }
    }

    // Helper to add a link to the map (deduplicated)
    function addLink(url, text, element) {
      if (!url) return;
      const normalized = normalizeUrl(url);
      if (!normalized) return;
      if (normalized.startsWith('javascript:') || normalized.startsWith('mailto:') || normalized.startsWith('tel:')) return;
      const currentNormalized = normalizeUrl(currentUrl);
      if (currentNormalized && normalized === currentNormalized) return;

      if (!linkMap.has(normalized)) {
        linkMap.set(normalized, {
          url: normalized,
          text: text || normalized,
          title: element ? (element.getAttribute('title') || '') : '',
          isExternal: currentOrigin ? !normalized.startsWith(currentOrigin) : true,
          isButton: element ? (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button' || element.getAttribute('type') === 'button') : false
        });
      }
    }

    // Clean up the CSS class input - remove leading dots and split by spaces
    const classNames = cssClass
      .replace(/^\./, '')
      .split(/\s+/)
      .filter(c => c && c !== '.');

    if (classNames.length === 0) return [];

    // Build a selector that matches elements with ALL the given classes
    const selector = classNames.map(c => `.${CSS.escape(c)}`).join('');

    // Find all elements matching the CSS class
    let elements = [];
    try {
      elements = document.querySelectorAll(selector);
    } catch (e) {
      // If the selector is invalid, try matching by class name individually
      try {
        elements = document.querySelectorAll(`[class*="${classNames[0]}"]`);
      } catch (e2) {
        return [];
      }
    }

    // For each matching element, extract the navigation target
    elements.forEach((el) => {
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);

      // 1. Check if the element itself is a link
      if (el.tagName === 'A' && el.href) {
        addLink(el.href, text, el);
        return;
      }

      // 2. Check for href attribute
      const href = el.getAttribute('href');
      if (href) {
        addLink(href, text, el);
        return;
      }

      // 3. Check for data-href / data-url attributes
      const dataHref = el.getAttribute('data-href') || el.getAttribute('data-url');
      if (dataHref) {
        addLink(dataHref, text, el);
        return;
      }

      // 4. Check for onclick attribute with URL
      const onclick = el.getAttribute('onclick') || '';
      const urlMatch = onclick.match(/['"]([^'"]*(?:https?:\/\/|\/)[^'"]*)['"]/);
      if (urlMatch && urlMatch[1]) {
        addLink(urlMatch[1], text, el);
        return;
      }

      // 5. Check for a nested <a> tag inside the element
      const nestedAnchor = el.querySelector('a[href]');
      if (nestedAnchor) {
        addLink(nestedAnchor.href, text || nestedAnchor.textContent, nestedAnchor);
        return;
      }

      // 6. Check for a parent <a> tag
      const parentAnchor = el.closest('a[href]');
      if (parentAnchor) {
        addLink(parentAnchor.href, text || parentAnchor.textContent, parentAnchor);
        return;
      }

      // 7. Check for data-action or data-target attributes
      const dataAction = el.getAttribute('data-action') || el.getAttribute('data-target');
      if (dataAction && (dataAction.startsWith('http') || dataAction.startsWith('/'))) {
        addLink(dataAction, text, el);
        return;
      }

      // 8. Check for aria-label or title that might contain a URL
      const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      const ariaUrlMatch = ariaLabel.match(/https?:\/\/[^\s<>"']+/);
      if (ariaUrlMatch) {
        addLink(ariaUrlMatch[0], text, el);
      }
    });

    // Convert map to array and sort by text
    const links = Array.from(linkMap.values());
    links.sort((a, b) => (a.text || '').localeCompare(b.text || ''));

    return links;
  }

  /**
   * Extracts URLs from the page's text content.
   * This handles cases where the page is a plain text file (.txt) or
   * the HTML is displayed as raw text rather than parsed.
   */
  function extractLinksFromText(linkMap, addLink) {
    // Get the raw text content of the page
    let textContent = '';
    try {
      textContent = document.body ? document.body.innerText || document.body.textContent : '';
    } catch (e) {
      textContent = '';
    }

    if (!textContent) return;

    // Extract URLs from href="..." attributes in raw HTML text
    // Include both absolute and relative URLs
    const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let hrefMatch;
    while ((hrefMatch = hrefRegex.exec(textContent)) !== null) {
      const href = hrefMatch[1];
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        // Try to find surrounding text for context
        const start = Math.max(0, hrefMatch.index - 100);
        const end = Math.min(textContent.length, hrefMatch.index + hrefMatch[0].length + 100);
        const context = textContent.substring(start, end);
        const titleMatch = context.match(/title\s*=\s*["']([^"']+)["']/i);
        const textMatch = context.match(/>([^<]{3,100})</);
        const label = (titleMatch && titleMatch[1]) || (textMatch && textMatch[1].trim()) || href;
        addLink(href, label.trim(), null);
      }
    }

    // Also extract bare URLs from text (http/https)
    if (linkMap.size === 0) {
      const urlRegex = /https?:\/\/[^\s<>"']+/g;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(textContent)) !== null) {
        const url = urlMatch[0].replace(/[),.;]+$/, '');
        if (url) {
          addLink(url, url, null);
        }
      }
    }
  }
})();