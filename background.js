// background.js - Service worker that handles PDF generation
// Uses Chrome DevTools Protocol to capture full pages as PDF, then merges them

importScripts('libs/pdf-lib.min.js');

let isProcessing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'GENERATE_PDF') {
    handleGeneratePDF(message, sendResponse);
    return true; // Keep the message channel open for async response
  }
});

async function handleGeneratePDF(message, sendResponse) {
  if (isProcessing) {
    sendResponse({ success: false, error: 'Another PDF generation is already in progress.' });
    return;
  }

  isProcessing = true;

  try {
    const { urls, pageTitle } = message;
    const pdfs = [];

    // Create a hidden tab to capture pages
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });

    // Attach debugger to the tab
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');

    try {
      // Enable Page domain
      await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable');

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        // Send progress update to popup
        chrome.runtime.sendMessage({
          type: 'PDF_PROGRESS',
          current: i + 1,
          total: urls.length,
          url: url
        });

        // Check if this is an XHTML file - if so, fetch and render the content
        // because browsers may render XHTML as raw XML or blank
        const isXHTML = isXHTMLFile(url);
        if (isXHTML) {
          await renderXHTMLContent(tab.id, url);
        } else {
          // Navigate to the URL
          await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.navigate', { url });

          // Wait for the page to load
          await waitForPageLoad(tab.id);

          // Give the page a moment to fully render (images, fonts, etc.)
          await sleep(1500);
        }

        // Capture the page as PDF
        const result = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.printToPDF', {
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: '<div style="font-size:8px; width:100%; text-align:center; color:#666; padding:0 40px;"><span class="title"></span></div>',
          footerTemplate: '<div style="font-size:8px; width:100%; text-align:center; color:#666; padding:0 40px;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
          marginTop: 0.4,
          marginBottom: 0.4,
          marginLeft: 0.4,
          marginRight: 0.4,
          paperWidth: 8.27,  // A4 width in inches
          paperHeight: 11.69, // A4 height in inches
          preferCSSPageSize: true,
          generateTaggedPDF: true,
          generateDocumentOutline: true
        });

        if (result && result.data) {
          // Convert base64 to Uint8Array
          const binary = atob(result.data);
          const bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) {
            bytes[j] = binary.charCodeAt(j);
          }
          pdfs.push(bytes);
        } else {
          throw new Error(`Failed to capture page: ${url}`);
        }
      }
    } finally {
      // Detach debugger and close the tab
      try {
        await chrome.debugger.detach({ tabId: tab.id });
      } catch (e) { /* ignore */ }
      await chrome.tabs.remove(tab.id);
    }

    // Merge all PDFs into one
    const mergedPdf = await mergePDFs(pdfs);

    // Trigger download
    const filename = sanitizeFilename(pageTitle) + '.pdf';
    await triggerDownload(mergedPdf, filename);

    sendResponse({ success: true, filename });
  } catch (error) {
    console.error('Error generating PDF:', error);
    sendResponse({ success: false, error: error.message || 'Unknown error occurred' });
  } finally {
    isProcessing = false;
  }
}

function waitForPageLoad(tabId) {
  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId = null;
    let onLoadEvent = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (onLoadEvent && chrome.debugger.onEvent) {
        chrome.debugger.onEvent.removeListener(onLoadEvent);
      }
    };

    const finish = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve();
      }
    };

    // Timeout after 30 seconds
    timeoutId = setTimeout(finish, 30000);

    // Listen for the load event
    onLoadEvent = (source, method) => {
      if (source.tabId === tabId && method === 'Page.loadEventFired') {
        finish();
      }
    };

    if (chrome.debugger.onEvent) {
      chrome.debugger.onEvent.addListener(onLoadEvent);
    }

    // Also poll as a fallback
    const checkLoadState = async () => {
      if (resolved) return;
      try {
        const docState = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true
        });

        if (docState.result && docState.result.value === 'complete') {
          finish();
        } else {
          setTimeout(checkLoadState, 500);
        }
      } catch (e) {
        finish(); // Resolve on error to avoid hanging
      }
    };

    // Start checking after a short delay
    setTimeout(checkLoadState, 500);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Checks if a URL points to an XHTML file.
 * XHTML files have .xhtml or .xml extensions, or serve as application/xhtml+xml.
 */
function isXHTMLFile(url) {
  const lower = url.toLowerCase();
  return lower.endsWith('.xhtml') || lower.endsWith('.xml') || lower.includes('application/xhtml+xml');
}

/**
 * Fetches the XHTML content and renders it in the tab.
 * This is needed because browsers may render XHTML files as raw XML or blank,
 * causing Page.printToPDF to capture an empty page.
 */
async function renderXHTMLContent(tabId, url) {
  try {
    // Fetch the XHTML content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch XHTML: ${response.status} ${response.statusText}`);
    }
    const content = await response.text();

    // Navigate to a blank page first
    await chrome.debugger.sendCommand({ tabId }, 'Page.navigate', { url: 'about:blank' });
    await waitForPageLoad(tabId);

    // Get the main frame ID
    const frameTree = await chrome.debugger.sendCommand({ tabId }, 'Page.getFrameTree');
    const frameId = frameTree.frameTree.frame.id;

    // Prepare the HTML content for rendering
    let html = content;

    // Remove XML declaration (e.g., <?xml version="1.0" encoding="utf-8"?>)
    html = html.replace(/<\?xml[^>]*\?>/i, '');

    // Add a <base> tag to resolve relative paths (CSS, images, etc.)
    const baseTag = `<base href="${url}">`;
    if (/<head[^>]*>/i.test(html)) {
      // Insert base tag right after the opening <head> tag
      html = html.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}`);
    } else if (/<html[^>]*>/i.test(html)) {
      // No <head> tag - add one with the base tag
      html = html.replace(/<html[^>]*>/i, (match) => `${match}<head>${baseTag}</head>`);
    } else {
      // No <html> tag at all - wrap the content
      html = `<html><head>${baseTag}</head><body>${html}</body></html>`;
    }

    // Set the document content in the tab
    await chrome.debugger.sendCommand({ tabId }, 'Page.setDocumentContent', {
      frameId: frameId,
      html: html
    });

    // Wait for the content to render (images, fonts, CSS, etc.)
    await sleep(2500);
  } catch (error) {
    console.error('Error rendering XHTML content:', error);
    // Fallback: navigate directly to the URL
    await chrome.debugger.sendCommand({ tabId }, 'Page.navigate', { url });
    await waitForPageLoad(tabId);
    await sleep(1500);
  }
}

async function mergePDFs(pdfBytesArray) {
  if (pdfBytesArray.length === 1) {
    return pdfBytesArray[0];
  }

  const { PDFDocument } = PDFLib;
  const mergedPdf = await PDFDocument.create();

  for (const pdfBytes of pdfBytesArray) {
    try {
      const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    } catch (e) {
      console.error('Error merging PDF:', e);
      // Skip this PDF if it can't be loaded
    }
  }

  const mergedBytes = await mergedPdf.save();
  return mergedBytes;
}

function sanitizeFilename(name) {
  // Remove invalid filename characters
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'website';
}

async function triggerDownload(data, filename) {
  // Convert Uint8Array to base64
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  const base64 = btoa(binary);
  const dataUrl = `data:application/pdf;base64,${base64}`;

  // Use offscreen document for download to handle large files
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_PDF',
    dataUrl: dataUrl,
    filename: filename
  });

  if (!response || !response.success) {
    // Fallback: use chrome.downloads directly
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
  }
}

let offscreenDocumentReady = false;

async function ensureOffscreenDocument() {
  if (offscreenDocumentReady) return;

  const offscreenUrl = chrome.runtime.getURL('offscreen.html');

  // Check if offscreen document already exists (Chrome 116+)
  if (chrome.runtime.getContexts) {
    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });

      if (existingContexts.length > 0) {
        offscreenDocumentReady = true;
        return;
      }
    } catch (e) {
      // Fall through to create
    }
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Download PDF files generated by the extension'
  });

  offscreenDocumentReady = true;
}
