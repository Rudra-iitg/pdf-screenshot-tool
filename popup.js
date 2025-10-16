document.addEventListener('DOMContentLoaded', function() {
  const selectAreaBtn = document.getElementById('selectArea');
  const selectAreaText = document.getElementById('selectAreaText');
  const createPdfBtn = document.getElementById('createPdf');
  const clearScreenshotsBtn = document.getElementById('clearScreenshots');
  const statusDiv = document.getElementById('status');
  const screenshotCount = document.getElementById('screenshotCount');
  const areaSize = document.getElementById('areaSize');
  const chunkSizeSelect = document.getElementById('chunkSize');
  const resetAreaCheckbox = document.getElementById('resetArea');

  // Update UI based on current state
  updateUI();

  selectAreaBtn.addEventListener('click', async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Try to send message to content script
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'selectArea' });
      } catch (error) {
        // If content script isn't ready, inject it first
        console.log('Injecting content script...');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        
        // Wait a bit for injection to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try sending message again
        await chrome.tabs.sendMessage(tab.id, { action: 'selectArea' });
      }
      
      window.close(); // Close popup
      
    } catch (error) {
      console.error('Error starting area selection:', error);
      showStatus('Error: Cannot select area on this page', 'error');
    }
  });

  createPdfBtn.addEventListener('click', async function() {
    showStatus('Creating PDF...', 'info');
    
    try {
      const chunkSize = Number(chunkSizeSelect?.value) || 100;
      // Persist preference
      chrome.storage.session.set({ pdfChunkSize: chunkSize });
      const response = await chrome.runtime.sendMessage({ action: 'createPdf', chunkSize });
      if (response && response.success) {
        const msg = response.chunks && response.chunks > 1
          ? `${response.count} screenshots exported in ${response.chunks} PDFs (up to ${response.chunkSize} pages each).`
          : `PDF with ${response.count} screenshots created!`;
        showStatus(msg, 'success');
      } else {
        showStatus('Failed to create PDF', 'error');
      }
    } catch (error) {
      console.error('Error creating PDF:', error);
      showStatus('PDF creation failed', 'error');
    }
  });

  clearScreenshotsBtn.addEventListener('click', async function() {
    try {
      const resetArea = !!resetAreaCheckbox?.checked;
      // Persist preference
      chrome.storage.session.set({ resetAreaOnClear: resetArea });
      const response = await chrome.runtime.sendMessage({ action: 'clearScreenshots', resetArea });
      if (response && response.success) {
        const msg = response.areaReset ? 'Screenshots cleared and area reset!' : 'Screenshots cleared!';
        showStatus(msg, 'success');
        updateUI();
      }
    } catch (error) {
      console.error('Error clearing screenshots:', error);
      showStatus('Failed to clear screenshots', 'error');
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  async function updateUI() {
    try {
      // Get data directly from background script
      const response = await chrome.runtime.sendMessage({ action: 'getScreenshots' });
      
      const screenshotCountValue = response ? (response.screenshotCount || 0) : 0;
      const captureArea = response ? response.lastCaptureArea : null;
      
      // Update counts
      screenshotCount.textContent = screenshotCountValue;
      
      // Update area size
      if (captureArea) {
        areaSize.textContent = `${captureArea.width}×${captureArea.height}`;
        selectAreaText.textContent = 'Change Capture Area';
      } else {
        areaSize.textContent = '-';
        selectAreaText.textContent = 'Select Capture Area';
      }
      
      // Update status message
      if (screenshotCountValue > 0) {
        showStatus(`${screenshotCountValue} screenshots ready for PDF`, 'info');
      }
      
      // Enable/disable buttons based on state
      createPdfBtn.disabled = screenshotCountValue === 0;
      clearScreenshotsBtn.disabled = screenshotCountValue === 0;
      
      // Restore UI prefs
      try {
        const prefs = await chrome.storage.session.get(['pdfChunkSize', 'resetAreaOnClear']);
        if (chunkSizeSelect && prefs.pdfChunkSize) {
          chunkSizeSelect.value = String(prefs.pdfChunkSize);
        }
        if (resetAreaCheckbox) {
          resetAreaCheckbox.checked = !!prefs.resetAreaOnClear;
        }
      } catch {}

      console.log('UI Updated - Screenshots:', screenshotCountValue, 'Area:', captureArea);
      
    } catch (error) {
      console.error('Error updating UI:', error);
      // Fallback to storage if direct message fails
      try {
        const result = await chrome.storage.session.get(['screenshotCount', 'lastCaptureArea']);
        const count = result.screenshotCount || 0;
        const area = result.lastCaptureArea;
        
        screenshotCount.textContent = count;
        areaSize.textContent = area ? `${area.width}×${area.height}` : '-';
        createPdfBtn.disabled = count === 0;
        clearScreenshotsBtn.disabled = count === 0;
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
  }

  // Listen for storage changes
  chrome.storage.session.onChanged.addListener((changes) => {
    console.log('Storage changed:', changes);
    updateUI();
  });

  // Update UI every time popup opens
  updateUI();
});