# 📦 How to Package & Publish Your Extension

This guide explains how to package the **Website to PDF** extension for distribution on the **Chrome Web Store** and **Microsoft Edge Add-ons**.

---

## 📁 What's Already Packaged

A ready-to-upload ZIP file has been created at:

```
c:\Users\c.r.advincula.jr\Projects\Website to PDF\dist\website-to-pdf.zip
```

This ZIP contains all the necessary files:
- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`, `popup.css`, `popup.js`
- `offscreen.html`, `offscreen.js`
- `icons/` (16, 32, 48, 128 + coffee avatar)
- `libs/pdf-lib.min.js`
- `README.md`

---

## 🧪 Step 1: Test Locally (Before Publishing)

Before uploading, test the extension locally:

1. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
2. Enable **Developer Mode** (toggle in top-right)
3. Click **"Load unpacked"**
4. Select the folder: `c:\Users\c.r.advincula.jr\Projects\Website to PDF\dist\website-to-pdf`
5. Test all features work correctly

---

## 🌐 Step 2: Publish to Chrome Web Store

### 2.1 Create a Developer Account
1. Go to [https://chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. Pay the **one-time $5 registration fee** (required to publish)

### 2.2 Create a New Item
1. Click **"New item"**
2. Upload the `website-to-pdf.zip` file
3. Fill in the store listing:

| Field | What to Enter |
|-------|---------------|
| **Name** | Website to PDF |
| **Summary** | Convert selected web pages into a single PDF file |
| **Description** | A powerful Chrome extension that scans the current page for all links, lets you select which ones to include, and generates a single PDF containing the full content of each selected page. Features include: link scanning, URL list upload, CSS class scanner, XHTML support, iframe support, and full-page capture with images and layouts preserved. |
| **Category** | Productivity |
| **Language** | English (United States) |

### 2.3 Upload Assets

| Asset | Requirements | What to Use |
|-------|-------------|-------------|
| **128x128 icon** | 128x128 PNG | `icons/icon128.png` |
| **Screenshot (1280x800)** | At least 1 screenshot | Take a screenshot of the popup open on a webpage |
| **Small promo tile (440x280)** | Optional | Create from the icon |
| **Marquee promo tile (1400x560)** | Optional | Create from the icon |

### 2.4 Privacy & Permissions
1. In the **Privacy** section:
   - Single purpose: "Generate PDF files from selected web pages"
   - Permission justification: Explain that the extension needs `debugger` permission to capture pages as PDF, `downloads` to save the PDF, and `scripting` to scan pages for links
2. In the **Permissions** section, list:
   - `activeTab` - Access the current tab to scan for links
   - `tabs` - Query tab information
   - `debugger` - Use DevTools Protocol to capture pages as PDF
   - `downloads` - Save the generated PDF file
   - `scripting` - Inject the content script
   - `offscreen` - Use offscreen document for downloads
   - `webNavigation` - Access iframe content
   - `<all_urls>` - Access any page the user navigates to

### 2.5 Submit for Review
1. Click **"Submit for review"**
2. Review typically takes **1-3 business days**
3. Once approved, your extension is live on the Chrome Web Store!

---

## 🦖 Step 3: Publish to Microsoft Edge Add-ons

### 3.1 Create a Developer Account
1. Go to [https://partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge)
2. Sign in with your Microsoft account
3. Complete the developer registration (free)

### 3.2 Create a New Extension
1. Click **"Create new"** → **"Extension"**
2. Upload the `website-to-pdf.zip` file
3. Fill in the listing (similar to Chrome Web Store)

### 3.3 Submit
1. Complete all required fields
2. Click **"Submit"**
3. Review typically takes **1-5 business days**

---

## 🔄 Step 4: Updating Your Extension

When you make changes to the extension:

1. **Update the version** in `manifest.json` (e.g., `1.0.0` → `1.0.1`)
2. Re-create the ZIP:
   ```
   Compress-Archive -Path "c:\Users\c.r.advincula.jr\Projects\Website to PDF\dist\website-to-pdf\*" -DestinationPath "c:\Users\c.r.advincula.jr\Projects\Website to PDF\dist\website-to-pdf.zip" -Force
   ```
3. Upload the new ZIP to the store
4. Submit for review again

---

## 📝 Important Notes for Store Review

### Why the extension needs `debugger` permission
The extension uses Chrome's DevTools Protocol (`Page.printToPDF`) to capture full pages as PDF with high fidelity - preserving images, layouts, backgrounds, and text. This is the same technology Chrome's built-in "Save as PDF" uses.

### Why the extension needs `<all_urls>` permission
The extension needs to scan links on any page the user visits and capture those pages as PDF. It only runs when the user clicks the extension icon.

### Single purpose
The extension has a single purpose: **generate PDF files from selected web pages**. This complies with Chrome Web Store's single-purpose policy.

---

## 🎯 Quick Reference

| Task | Command/URL |
|------|-------------|
| **Test locally** | `chrome://extensions/` → Load unpacked |
| **Chrome Web Store** | [https://chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) |
| **Edge Add-ons** | [https://partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge) |
| **ZIP location** | `c:\Users\c.r.advincula.jr\Projects\Website to PDF\dist\website-to-pdf.zip` |
| **Unpacked folder** | `c:\Users\c.r.advincula.jr\Projects\Website to PDF\dist\website-to-pdf` |

---

## 💡 Tips

- **Keep the ZIP small**: The current ZIP is ~590KB, well under the 2GB limit
- **Test on both browsers**: Chrome and Edge use the same extension format, so it should work on both
- **Include screenshots**: Good screenshots help with store approval
- **Respond to reviews**: Engage with users who leave feedback
- **Update regularly**: Fix bugs and add features to keep users happy