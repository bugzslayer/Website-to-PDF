// offscreen.js - Handles downloading PDF files using Blob URLs
// This runs in an offscreen document to handle large files without memory issues

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'DOWNLOAD_PDF') {
    handleDownload(message, sendResponse);
    return true; // Keep the message channel open for async response
  }
});

async function handleDownload(message, sendResponse) {
  try {
    const { dataUrl, filename } = message;

    // Convert data URL to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create a blob URL and trigger download
    const blobUrl = URL.createObjectURL(blob);

    // Use chrome.downloads to save the file
    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });

    // Wait for the download to complete
    await new Promise((resolve, reject) => {
      const checkDownload = (delta) => {
        if (delta.id === downloadId) {
          if (delta.state && delta.state.current === 'complete') {
            chrome.downloads.onChanged.removeListener(checkDownload);
            URL.revokeObjectURL(blobUrl);
            resolve();
          } else if (delta.state && delta.state.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(checkDownload);
            URL.revokeObjectURL(blobUrl);
            reject(new Error('Download was interrupted'));
          }
        }
      };
      chrome.downloads.onChanged.addListener(checkDownload);

      // Timeout after 60 seconds
      setTimeout(() => {
        chrome.downloads.onChanged.removeListener(checkDownload);
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Download timed out'));
      }, 60000);
    });

    sendResponse({ success: true });
  } catch (error) {
    console.error('Error downloading PDF:', error);
    sendResponse({ success: false, error: error.message || 'Download failed' });
  }
}