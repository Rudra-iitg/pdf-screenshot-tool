importScripts('./jspdf.umd.min.js');

// Background script for PDF Screenshot Helper
let screenshots = [];
let currentArea = null;
let areaMeta = null; // { dpr, viewportWidth, viewportHeight }
let lastCaptureTime = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('🔥 Background received:', request.action, 'Area:', request.area);
  console.log('🔥 Current screenshots count:', screenshots.length);
  console.log('🔥 Current stored area:', currentArea);
  
  if (request.action === 'capture') {
    // Always capture using currentArea as the single source of truth
    handleCapture().then(sendResponse);
    return true;
  } else if (request.action === 'createPdf') {
    // Optional chunkSize can be passed from the popup; default handled in handleCreatePdf
    handleCreatePdf({ chunkSize: request.chunkSize }).then(sendResponse);
    return true;
  } else if (request.action === 'clearScreenshots') {
    const resetArea = !!request.resetArea;
    screenshots = [];
    if (resetArea) {
      currentArea = null;
      areaMeta = null;
    }
    updatePopupStorage();
    console.log('Screenshots cleared', resetArea ? 'and area reset' : '');
    sendResponse({ success: true, areaReset: resetArea });
  } else if (request.action === 'setCaptureArea') {
    console.log('🎯 SETTING NEW AREA - BEFORE:', currentArea);
    console.log('🎯 SETTING NEW AREA - NEW:', request.area);
    console.log('🎯 CLEARING SCREENSHOTS - BEFORE COUNT:', screenshots.length);
    
    currentArea = request.area;
    areaMeta = request.meta || null;
    // Clear old screenshots when setting a new area
    screenshots = [];
  async function handleAutoCapture() {
    try {
      console.log('🔘 Auto-capture triggered');
      if (!currentArea) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'showFeedback', message: 'No capture area set. Please select an area first.', isError: true });
        } catch {}
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      await handleCapture();
    } catch (error) {
      console.error('Auto capture failed:', error);
    }
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

  // DPR-aware cropping
  async function cropImage(dataUrl, area) {
    const canvas = new OffscreenCanvas(area.width, area.height);
    const ctx = canvas.getContext('2d');
    const blob = await (await fetch(dataUrl)).blob();
    const imageBitmap = await createImageBitmap(blob);
    const viewportW = areaMeta?.viewportWidth;
    const viewportH = areaMeta?.viewportHeight;
    const dpr = areaMeta?.dpr;
    const scaleX = viewportW ? (imageBitmap.width / viewportW) : (dpr || 1);
    const scaleY = viewportH ? (imageBitmap.height / viewportH) : (dpr || 1);
    const srcX = Math.round(area.x * scaleX);
    const srcY = Math.round(area.y * scaleY);
    const srcW = Math.round(area.width * scaleX);
    const srcH = Math.round(area.height * scaleY);
    ctx.drawImage(imageBitmap, srcX, srcY, srcW, srcH, 0, 0, area.width, area.height);
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(croppedBlob); });
  }

  // Full-bleed PDFs with page size matching each screenshot
  async function handleCreatePdf(options = {}) {
    try {
      const chunkSize = Math.max(1, Number(options.chunkSize) || 100);
      if (screenshots.length === 0) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: 'PDF Screenshot Helper', message: 'No screenshots to create PDF. Capture some screenshots first.' });
        return { success: false, message: 'No screenshots available' };
      }

      const downloadDataUri = (dataUri, filename) => new Promise(async (resolve) => {
        chrome.downloads.download({ url: dataUri, filename, saveAs: false }, async (downloadId) => {
          if (chrome.runtime.lastError) {
            try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); const pdfBase64 = dataUri.split(',')[1]; chrome.tabs.sendMessage(tab.id, { action: 'downloadPdf', pdfBase64, filename }); } catch {}
          }
          resolve();
        });
      });

      const total = screenshots.length;
      const totalChunks = Math.ceil(total / chunkSize);
      const dateStr = new Date().toISOString().split('T')[0];

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, total);
        const shots = screenshots.slice(start, end);

        const first = shots[0];
        const firstOrientation = first.width >= first.height ? 'landscape' : 'portrait';
        let doc = new jspdf.jsPDF({ orientation: firstOrientation, unit: 'px', format: [first.width, first.height] });

        for (let i = 0; i < shots.length; i++) {
          const shot = shots[i];
          if (i > 0) {
            const orient = shot.width >= shot.height ? 'landscape' : 'portrait';
            doc.addPage([shot.width, shot.height], orient);
          }
          // Full-bleed, no margins
          doc.addImage(shot.data, 'PNG', 0, 0, shot.width, shot.height);
        }

        const isSingle = totalChunks === 1;
        const filename = isSingle ? `screenshots-${dateStr}.pdf` : `screenshots-${dateStr}-part-${chunkIndex + 1}-of-${totalChunks}.pdf`;
        const pdfDataUri = doc.output('datauristring');
        await downloadDataUri(pdfDataUri, filename);
      }

      chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: totalChunks > 1 ? 'PDFs Created!' : 'PDF Created!', message: totalChunks > 1 ? `${total} screenshots exported in ${totalChunks} PDFs (up to ${chunkSize} pages each).` : `PDF with ${total} screenshots is downloading...` });
      return { success: true, count: total, chunks: totalChunks, chunkSize };
    } catch (error) {
      console.error('PDF creation failed:', error);
      chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: 'PDF Creation Failed', message: 'There was an error creating the PDF. Please try again.' });
      return { success: false, error: error.message };
    }
  }
          lastCaptureTime = Date.now();
          const cropped = await cropImage(dataUrl, currentArea);
          screenshots.push({ data: cropped, timestamp: Date.now(), width: currentArea.width, height: currentArea.height, area: { ...currentArea } });
          updatePopupStorage();
          try { await chrome.tabs.sendMessage(tab.id, { action: 'showFeedback', message: `Screenshot ${screenshots.length} captured!`, isError: false }); } catch {}
          return { success: true, count: screenshots.length };
        } catch (error) {
          console.error('❌ Capture failed:', error);
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          try { await chrome.tabs.sendMessage(tab.id, { action: 'showFeedback', message: error.message, isError: true }); } catch {}
          return { success: false, error: error.message };
        }
      }

      async function handleAutoCapture() {
        if (!currentArea) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          try { await chrome.tabs.sendMessage(tab.id, { action: 'showFeedback', message: 'No capture area set. Please select an area first.', isError: true }); } catch {}
          return;
        }
        await new Promise(r => setTimeout(r, 1000));
        await handleCapture();
      }

      // DPR-aware cropping
      async function cropImage(dataUrl, area) {
        const canvas = new OffscreenCanvas(area.width, area.height);
        const ctx = canvas.getContext('2d');
        const blob = await (await fetch(dataUrl)).blob();
        const imageBitmap = await createImageBitmap(blob);
        const viewportW = areaMeta?.viewportWidth;
        const viewportH = areaMeta?.viewportHeight;
        const dpr = areaMeta?.dpr;
        const scaleX = viewportW ? (imageBitmap.width / viewportW) : (dpr || 1);
        const scaleY = viewportH ? (imageBitmap.height / viewportH) : (dpr || 1);
        const srcX = Math.round(area.x * scaleX);
        const srcY = Math.round(area.y * scaleY);
        const srcW = Math.round(area.width * scaleX);
        const srcH = Math.round(area.height * scaleY);
        ctx.drawImage(imageBitmap, srcX, srcY, srcW, srcH, 0, 0, area.width, area.height);
        const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
        return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(croppedBlob); });
      }

      // Create PDFs with full-bleed pages sized to each screenshot
      async function handleCreatePdf(options = {}) {
        try {
          const chunkSize = Math.max(1, Number(options.chunkSize) || 100);
          if (screenshots.length === 0) {
            chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: 'PDF Screenshot Helper', message: 'No screenshots to create PDF. Capture some screenshots first.' });
            return { success: false, message: 'No screenshots available' };
          }

          const downloadDataUri = (dataUri, filename) => new Promise(async (resolve) => {
            chrome.downloads.download({ url: dataUri, filename, saveAs: false }, async (downloadId) => {
              if (chrome.runtime.lastError) {
                try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); const pdfBase64 = dataUri.split(',')[1]; chrome.tabs.sendMessage(tab.id, { action: 'downloadPdf', pdfBase64, filename }); } catch {}
              }
              resolve();
            });
          });

          const total = screenshots.length;
          const totalChunks = Math.ceil(total / chunkSize);
          const dateStr = new Date().toISOString().split('T')[0];

          for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, total);
            const shots = screenshots.slice(start, end);

            const first = shots[0];
            const firstOrientation = first.width >= first.height ? 'landscape' : 'portrait';
            let doc = new jspdf.jsPDF({ orientation: firstOrientation, unit: 'px', format: [first.width, first.height] });

            for (let i = 0; i < shots.length; i++) {
              const shot = shots[i];
              if (i > 0) {
                const orient = shot.width >= shot.height ? 'landscape' : 'portrait';
                doc.addPage([shot.width, shot.height], orient);
              }
              // Full-bleed image, no margins or scaling
              doc.addImage(shot.data, 'PNG', 0, 0, shot.width, shot.height);
            }

            const isSingle = totalChunks === 1;
            const filename = isSingle ? `screenshots-${dateStr}.pdf` : `screenshots-${dateStr}-part-${chunkIndex + 1}-of-${totalChunks}.pdf`;
            const pdfDataUri = doc.output('datauristring');
            await downloadDataUri(pdfDataUri, filename);
          }

          chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: totalChunks > 1 ? 'PDFs Created!' : 'PDF Created!', message: totalChunks > 1 ? `${total} screenshots exported in ${totalChunks} PDFs (up to ${chunkSize} pages each).` : `PDF with ${total} screenshots is downloading...` });
          return { success: true, count: total, chunks: totalChunks, chunkSize };
        } catch (error) {
          console.error('PDF creation failed:', error);
          chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: 'PDF Creation Failed', message: 'There was an error creating the PDF. Please try again.' });
          return { success: false, error: error.message };
        }
      }