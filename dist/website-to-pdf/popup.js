// popup.js - Handles the popup UI: scanning links, selection, and triggering PDF generation

let allLinks = [];
let selectedLinks = new Set();
let filteredLinks = [];
let isGenerating = false;

// DOM elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const linkListEl = document.getElementById('linkList');
const emptyStateEl = document.getElementById('emptyState');
const searchInputEl = document.getElementById('searchInput');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const generateBtn = document.getElementById('generateBtn');
const selectedCountEl = document.getElementById('selectedCount');
const totalCountEl = document.getElementById('totalCount');
const progressOverlayEl = document.getElementById('progressOverlay');
const progressBarEl = document.getElementById('progressBar');
const progressTextEl = document.getElementById('progressText');
const progressDetailEl = document.getElementById('progressDetail');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const uploadStatusEl = document.getElementById('uploadStatus');
const cssClassInput = document.getElementById('cssClassInput');
const scanCssBtn = document.getElementById('scanCssBtn');
const cssStatusEl = document.getElementById('cssStatus');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Set up event listeners
  searchInputEl.addEventListener('input', handleSearch);
  selectAllBtn.addEventListener('click', selectAll);
  deselectAllBtn.addEventListener('click', deselectAll);
  generateBtn.addEventListener('click', generatePDF);
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileUpload);
  scanCssBtn.addEventListener('click', handleCssClassScan);
  cssClassInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCssClassScan();
  });

  // Scan the current page for links
  await scanCurrentPage();
}

/**
 * Handles uploading a text file containing URLs (one per line).
 * Parses the file, extracts URLs, and adds them to the link list.
 */
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  uploadStatusEl.textContent = 'Reading file...';

  try {
    const text = await file.text();
    const urls = parseUrlsFromText(text);

    if (urls.length === 0) {
      uploadStatusEl.textContent = 'No valid URLs found in file';
      fileInput.value = '';
      return;
    }

    // Create link objects for the uploaded URLs
    const newLinks = urls.map(url => ({
      url: url,
      text: url,
      title: '',
      isExternal: true,
      isButton: false
    }));

    // Merge with existing links (deduplicate by URL)
    const existingUrls = new Set(allLinks.map(l => l.url));
    let addedCount = 0;
    newLinks.forEach(link => {
      if (!existingUrls.has(link.url)) {
        allLinks.push(link);
        existingUrls.add(link.url);
        addedCount++;
      }
    });

    // Auto-select the newly added links
    newLinks.forEach(link => selectedLinks.add(link.url));

    // Re-render the link list
    renderLinks();
    updateCounts();

    uploadStatusEl.textContent = `Added ${addedCount} URL${addedCount !== 1 ? 's' : ''} from file`;
    setTimeout(() => { uploadStatusEl.textContent = ''; }, 3000);
  } catch (error) {
    console.error('Error reading file:', error);
    uploadStatusEl.textContent = 'Error reading file';
  }

  // Reset file input so the same file can be selected again
  fileInput.value = '';
}

/**
 * Scans the page for elements matching a CSS class and extracts their links.
 * Sends the CSS class to the content script which finds matching elements
 * and extracts their navigation targets.
 */
async function handleCssClassScan() {
  const cssClass = cssClassInput.value.trim();
  if (!cssClass) {
    cssStatusEl.textContent = 'Please enter a CSS class';
    return;
  }

  cssStatusEl.textContent = 'Scanning for CSS class...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      cssStatusEl.textContent = 'No active tab';
      return;
    }

    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js']
      });
    } catch (e) {
      // Content script might already be injected - ignore
    }

    // Get all frames
    let frames = [{ frameId: 0 }];
    try {
      const allFrames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      if (allFrames && allFrames.length > 0) {
        frames = allFrames;
      }
    } catch (e) {
      // Fall back to main frame only
    }

    // Collect links from all frames
    const collectedLinks = [];
    for (const frame of frames) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_CSS_CLASS', cssClass }, { frameId: frame.frameId });
        if (response && response.links) {
          collectedLinks.push(...response.links);
        }
      } catch (e) {
        // Skip frames that don't have the content script
      }
    }

    // Deduplicate links
    const uniqueLinks = [];
    const seen = new Set();
    collectedLinks.forEach(link => {
      if (!seen.has(link.url)) {
        seen.add(link.url);
        uniqueLinks.push(link);
      }
    });

    if (uniqueLinks.length === 0) {
      cssStatusEl.textContent = 'No elements found with this CSS class';
      return;
    }

    // Merge with existing links
    const existingUrls = new Set(allLinks.map(l => l.url));
    let addedCount = 0;
    uniqueLinks.forEach(link => {
      if (!existingUrls.has(link.url)) {
        allLinks.push(link);
        existingUrls.add(link.url);
        addedCount++;
      }
    });

    // Auto-select the newly found links
    uniqueLinks.forEach(link => selectedLinks.add(link.url));

    // Re-render
    renderLinks();
    updateCounts();

    cssStatusEl.textContent = `Found ${uniqueLinks.length} element${uniqueLinks.length !== 1 ? 's' : ''} (added ${addedCount} new)`;
    setTimeout(() => { cssStatusEl.textContent = ''; }, 3000);
  } catch (error) {
    console.error('Error scanning CSS class:', error);
    cssStatusEl.textContent = 'Error scanning CSS class';
  }
}

/**
 * Parses a text file content and extracts URLs.
 * Handles:
 * - One URL per line
 * - Lines with labels like "Title - https://example.com"
 * - Lines with URLs embedded in text
 */
function parseUrlsFromText(text) {
  const lines = text.split(/\r?\n/);
  const urls = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let url = null;

    // Case 1: Line is a plain URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      url = trimmed;
    }
    // Case 2: Line contains a URL (e.g., "Title - https://example.com")
    else {
      const match = trimmed.match(/https?:\/\/[^\s<>"']+/);
      if (match) {
        url = match[0].replace(/[),.;]+$/, '');
      }
    }

    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

async function scanCurrentPage() {
  showStatus(true, 'Scanning page for links...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      showStatus(false, '');
      emptyStateEl.style.display = 'block';
      linkListEl.style.display = 'none';
      return;
    }

    // Allow http, https, and file:// URLs
    const isSupportedUrl = tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file://'));
    if (!isSupportedUrl) {
      showStatus(false, '');
      emptyStateEl.style.display = 'block';
      linkListEl.style.display = 'none';
      return;
    }

    // Ensure content script is injected into all frames (including iframes)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js']
      });
    } catch (e) {
      // Content script might already be injected - ignore
    }

    // Get all frames in the tab (main frame + iframes)
    let frames = [{ frameId: 0 }]; // Default to main frame
    try {
      const allFrames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      if (allFrames && allFrames.length > 0) {
        frames = allFrames;
      }
    } catch (e) {
      // webNavigation might not work - fall back to main frame only
    }

    // Collect links from all frames
    const collectedLinks = [];
    for (const frame of frames) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_LINKS' }, { frameId: frame.frameId });
        if (response && response.links) {
          collectedLinks.push(...response.links);
        }
      } catch (e) {
        // Skip frames that don't have the content script
      }
    }

    // Deduplicate links by URL
    const uniqueLinks = [];
    const seen = new Set();
    collectedLinks.forEach(link => {
      if (!seen.has(link.url)) {
        seen.add(link.url);
        uniqueLinks.push(link);
      }
    });

    if (uniqueLinks.length > 0) {
      allLinks = uniqueLinks;
      // Auto-select all links by default
      selectedLinks = new Set(allLinks.map(l => l.url));
      renderLinks();
      updateCounts();
      showStatus(false, '');
    } else {
      showStatus(false, '');
      emptyStateEl.style.display = 'block';
      linkListEl.style.display = 'none';
    }
  } catch (error) {
    console.error('Error scanning page:', error);
    showStatus(false, '');
    emptyStateEl.style.display = 'block';
    linkListEl.style.display = 'none';
  }
}

function showStatus(show, text) {
  statusEl.style.display = show ? 'flex' : 'none';
  if (text) statusTextEl.textContent = text;
}

function renderLinks() {
  const query = searchInputEl.value.toLowerCase().trim();

  filteredLinks = allLinks.filter(link => {
    if (!query) return true;
    return (link.text || '').toLowerCase().includes(query) ||
           link.url.toLowerCase().includes(query) ||
           (link.title || '').toLowerCase().includes(query);
  });

  linkListEl.innerHTML = '';

  if (filteredLinks.length === 0) {
    emptyStateEl.style.display = 'block';
    linkListEl.style.display = 'none';
    return;
  }

  emptyStateEl.style.display = 'none';
  linkListEl.style.display = 'block';

  filteredLinks.forEach(link => {
    const item = document.createElement('div');
    item.className = 'link-item' + (selectedLinks.has(link.url) ? ' selected' : '');
    item.dataset.url = link.url;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedLinks.has(link.url);
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleLink(link.url, checkbox.checked);
    });

    const info = document.createElement('div');
    info.className = 'link-info';

    const text = document.createElement('div');
    text.className = 'link-text';
    text.textContent = link.text || link.url;

    const url = document.createElement('div');
    url.className = 'link-url';
    url.textContent = link.url;

    info.appendChild(text);
    info.appendChild(url);

    // Add badges
    if (link.isExternal || link.isButton) {
      const badges = document.createElement('div');
      badges.className = 'link-badges';
      if (link.isExternal) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-external';
        badge.textContent = 'External';
        badges.appendChild(badge);
      }
      if (link.isButton) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-button';
        badge.textContent = 'Button';
        badges.appendChild(badge);
      }
      info.appendChild(badges);
    }

    item.appendChild(checkbox);
    item.appendChild(info);

    // Click on the item toggles selection
    item.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        const newState = !selectedLinks.has(link.url);
        checkbox.checked = newState;
        toggleLink(link.url, newState);
      }
    });

    linkListEl.appendChild(item);
  });

  updateCounts();
}

function toggleLink(url, isSelected) {
  if (isSelected) {
    selectedLinks.add(url);
  } else {
    selectedLinks.delete(url);
  }

  // Update the item's visual state
  const item = linkListEl.querySelector(`[data-url="${CSS.escape(url)}"]`);
  if (item) {
    item.classList.toggle('selected', isSelected);
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.checked = isSelected;
  }

  updateCounts();
}

function selectAll() {
  filteredLinks.forEach(link => selectedLinks.add(link.url));
  renderLinks();
}

function deselectAll() {
  filteredLinks.forEach(link => selectedLinks.delete(link.url));
  renderLinks();
}

function handleSearch() {
  renderLinks();
}

function updateCounts() {
  selectedCountEl.textContent = selectedLinks.size;
  totalCountEl.textContent = allLinks.length;
  generateBtn.disabled = selectedLinks.size === 0 || isGenerating;
}

async function generatePDF() {
  if (selectedLinks.size === 0 || isGenerating) return;

  isGenerating = true;
  generateBtn.disabled = true;
  progressOverlayEl.style.display = 'flex';
  progressBarEl.style.width = '0%';
  progressTextEl.textContent = 'Preparing...';
  progressDetailEl.textContent = '';

  const urls = allLinks.filter(link => selectedLinks.has(link.url)).map(link => link.url);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageTitle = tab.title || 'website';

    // Send message to background to generate the PDF
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_PDF',
      urls: urls,
      pageTitle: pageTitle
    });

    if (response && response.success) {
      progressBarEl.style.width = '100%';
      progressTextEl.textContent = 'PDF generated successfully!';
      progressDetailEl.textContent = response.filename || '';
      setTimeout(() => {
        progressOverlayEl.style.display = 'none';
        window.close();
      }, 1500);
    } else {
      progressTextEl.textContent = 'Error: ' + (response?.error || 'Unknown error');
      progressDetailEl.textContent = '';
      setTimeout(() => {
        progressOverlayEl.style.display = 'none';
        isGenerating = false;
        updateCounts();
      }, 3000);
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    progressTextEl.textContent = 'Error: ' + error.message;
    progressDetailEl.textContent = '';
    setTimeout(() => {
      progressOverlayEl.style.display = 'none';
      isGenerating = false;
      updateCounts();
    }, 3000);
  }
}

// Listen for progress updates from the background script
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'PDF_PROGRESS') {
    const percent = Math.round((message.current / message.total) * 100);
    progressBarEl.style.width = percent + '%';
    progressTextEl.textContent = `Capturing page ${message.current} of ${message.total}...`;
    progressDetailEl.textContent = message.url || '';
  }
});