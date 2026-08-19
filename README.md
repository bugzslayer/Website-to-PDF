# Website to PDF - Chrome Extension

A Chrome extension that scans the current page for all links, anchors, and buttons that lead to another page, lets you select which ones to include, and generates a single PDF file containing the full content of each selected page (including images, layouts, and text).

## Features

- 🔗 **Scans all links** on the current page - anchors, links, and buttons with navigation
- 📂 **Upload URL list** - upload a text file with URLs (one per line) to generate PDFs from
- 🎯 **CSS class scanner** - enter a CSS class to find and extract links from elements with that class
- ☕ **Buy Me a Coffee** - support the developer with a coffee donation (via Ko-fi)
- ✅ **Select/deselect** specific links to include in the PDF
- 🔍 **Search** through links to find specific ones
- 📄 **Full page capture** - uses Chrome's DevTools Protocol (`Page.printToPDF`) for high-fidelity rendering
- 🖼️ **Preserves layout, images, and text** exactly as they appear in the browser
- 📥 **Single merged PDF** - all selected pages are merged into one downloadable PDF file
- 📊 **Progress tracking** - shows real-time progress while capturing pages

## Installation

1. **Download or clone** this repository to a folder on your computer.

2. **Open Chrome** and navigate to `chrome://extensions/`.

3. **Enable Developer Mode** by toggling the switch in the top-right corner.

4. Click **"Load unpacked"** and select the folder containing this extension (the folder with `manifest.json`).

5. The extension should now appear in your toolbar. You may need to click the puzzle piece icon and pin it.

6. **Important for local files**: To scan links from local files (e.g., `.html` or `.txt` files opened from your computer), you must enable file URL access:
   - Go to `chrome://extensions/`
   - Find the "Website to PDF" extension
   - Click **"Details"**
   - Toggle **"Allow access to file URLs"** to ON
   - Reload the extension if needed

## Usage

1. Navigate to any web page you want to capture links from.

2. Click the **"Website to PDF"** extension icon in your toolbar.

3. The popup will scan the current page and display all links found.

4. **Select or deselect** the links you want to include in the PDF:
   - Click individual items to toggle their selection
   - Use "Select All" / "Deselect All" buttons
   - Use the search box to filter links

5. **Optional: Upload a URL list** - If the page doesn't have the links you need (e.g., links are inside a cross-origin iframe), you can upload a text file:
   - Click **"📂 Upload URL List"**
   - Select a `.txt` file with URLs (one per line)
   - The URLs will be added to the link list and auto-selected
   - Example file format:
     ```
     https://example.com/page1
     https://example.com/page2
     https://example.com/page3
     ```
   - You can also use lines with labels: `Chapter 1 - https://example.com/page1`

6. **Optional: Scan by CSS class** - If the page uses CSS modules with hashed class names (e.g., `button.Button---root---TwJp3`), you can find links by CSS class:
   - Enter the CSS class in the input field (e.g., `Button---root---TwJp3`)
   - Click **"🔍 Scan"** or press Enter
   - The extension finds all elements with that class and extracts their navigation targets
   - Found links are added to the list and auto-selected

7. Click **"Generate PDF"**.

8. The extension will:
   - Open each selected page in a hidden tab
   - Capture the full page content (including images, layouts, and text)
   - Merge all captured pages into a single PDF
   - Automatically download the PDF to your default Downloads folder

## Support

If you find this tool useful and want to support future free tools and apps, please feel free to [buy me a coffee](https://ko-fi.com/H1U725AVCQ)!

## How It Works

- **Link Scanning**: A content script scans the page for `<a>` tags, buttons with `data-href`/`data-url` attributes, and elements with navigation onclick handlers.
- **Page Capture**: Uses the Chrome DevTools Protocol (`Page.printToPDF`) to capture each page with full fidelity - backgrounds, images, fonts, and layouts are all preserved.
- **PDF Merging**: Uses [pdf-lib](https://pdf-lib.js.org/) to merge all individual page PDFs into a single document.
- **Download**: The merged PDF is saved to your Downloads folder with a filename based on the page title.

## File Structure

```
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker - handles PDF capture and merging
├── content.js             # Content script - scans page for links
├── popup.html             # Popup UI
├── popup.css              # Popup styles
├── popup.js               # Popup logic
├── offscreen.html         # Offscreen document for downloads
├── offscreen.js           # Download handler
├── libs/
│   └── pdf-lib.min.js     # PDF merging library
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── generate_icons.js      # Script to regenerate icons (optional)
```

## Permissions

The extension requires the following permissions:

- **activeTab** - Access the current tab to scan for links
- **tabs** - Query tab information
- **debugger** - Use DevTools Protocol to capture pages as PDF
- **downloads** - Save the generated PDF file
- **scripting** - Inject the content script if needed
- **offscreen** - Use offscreen document for downloads
- **host_permissions** (`<all_urls>`) - Access any page the user navigates to

## Notes

- The extension works best on pages that are publicly accessible (no login required).
- Pages that require authentication may not capture correctly.
- Very large pages or many selected links may take some time to process.
- The PDF is saved to your browser's default download location.
- **Local files**: The extension can scan links from local `.html` and `.txt` files. For `.txt` files containing HTML code, it extracts URLs from the raw text content. Make sure "Allow access to file URLs" is enabled in the extension settings.
- **Text file support**: If you open a `.txt` file containing HTML markup, the extension will extract all `href` attributes and URLs from the text content, even though the browser displays it as plain text.
- **XHTML support**: The extension automatically detects XHTML files (`.xhtml` or `.xml` extensions). Instead of relying on the browser to render XHTML (which may show blank pages), it fetches the XHTML content, removes the XML declaration, adds a `<base>` tag to resolve relative paths, and renders the content properly before capturing it as PDF. This ensures all text, images, and layouts are preserved.
- **Iframe support**: The extension scans links from both the main page and all iframes. If a website embeds content in iframes (e.g., e-book readers, embedded documents), the extension will find and list links from those iframes too. This is enabled via `all_frames: true` in the content script and the `webNavigation` permission.

## Troubleshooting

- **No links found**: Make sure you're on a regular web page (http/https), not a browser internal page (like `chrome://`).
- **PDF generation fails**: Some pages may block the debugger protocol. Try a different page.
- **Download doesn't start**: Check your browser's download settings and make sure downloads are allowed.

## License

MIT