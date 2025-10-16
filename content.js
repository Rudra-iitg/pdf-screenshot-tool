// Content script for PDF Screenshot Helper
let selectionOverlay = null;
let isSelecting = false;

console.log('📸 PDF Screenshot Helper content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'selectArea') {
    startAreaSelection();
    sendResponse({ success: true });
  } else if (request.action === 'showFeedback') {
    showFeedback(request.message, request.isError);
    sendResponse({ success: true });
  } else if (request.action === 'downloadPdf') {
    downloadPdf(request.pdfBase64, request.filename);
    sendResponse({ success: true });
  }
  return true;
});

function startAreaSelection() {
  if (isSelecting) {
    cleanupSelection();
    return;
  }
  
  isSelecting = true;
  
  // Create overlay
  selectionOverlay = document.createElement('div');
  selectionOverlay.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    z-index: 2147483647;
    cursor: crosshair;
  `;
  
  document.body.appendChild(selectionOverlay);
  
  showFeedback('Drag to select NEW capture area. Press ESC to cancel.', false);
  
  // Events
  selectionOverlay.addEventListener('mousedown', startSelection);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cleanupSelection();
      showFeedback('Area selection cancelled', false);
    }
  });
}

function startSelection(e) {
  if (e.button !== 0) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const startX = e.clientX;
  const startY = e.clientY;
  
  const selectionRect = document.createElement('div');
  selectionRect.style.cssText = `
    position: fixed;
    border: 2px solid #ff0000;
    background: rgba(255, 0, 0, 0.2);
    z-index: 2147483646;
    pointer-events: none;
  `;
  
  selectionOverlay.appendChild(selectionRect);
  
  function onMouseMove(e) {
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    selectionRect.style.left = left + 'px';
    selectionRect.style.top = top + 'px';
    selectionRect.style.width = width + 'px';
    selectionRect.style.height = height + 'px';
  }
  
  function onMouseUp(e) {
    // Cleanup events
    selectionOverlay.removeEventListener('mousemove', onMouseMove);
    selectionOverlay.removeEventListener('mouseup', onMouseUp);
    
    if (e.button === 0) {
      const currentX = e.clientX;
      const currentY = e.clientY;
      
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      
      if (width > 10 && height > 10) {
        const newArea = { 
          x: Math.round(left), 
          y: Math.round(top), 
          width: Math.round(width), 
          height: Math.round(height) 
        };
        
        // Add debugging info
        console.log('🎯 SELECTED NEW AREA:', newArea);
        console.log('🎯 Device pixel ratio:', window.devicePixelRatio);
        console.log('🎯 Page scroll:', window.scrollX, window.scrollY);
        console.log('🎯 Viewport size:', window.innerWidth, window.innerHeight);
        
        // Send to background with confirmation
        chrome.runtime.sendMessage({
          action: 'setCaptureArea',
          area: newArea,
          meta: {
            dpr: window.devicePixelRatio || 1,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
          }
        }, (response) => {
          if (response && response.success) {
            showFeedback(`✅ NEW area set: ${width}×${height}. Use Ctrl+Shift+S to capture.`, false);
          } else {
            showFeedback('❌ Failed to set area', true);
          }
        });
      } else {
        showFeedback('Selection too small', true);
      }
    }
    
    cleanupSelection();
  }
  
  selectionOverlay.addEventListener('mousemove', onMouseMove);
  selectionOverlay.addEventListener('mouseup', onMouseUp);
}

function cleanupSelection() {
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }
  isSelecting = false;
}

function showFeedback(message, isError = false) {
  // Remove old feedback
  const oldFeedback = document.getElementById('screenshot-feedback');
  if (oldFeedback) oldFeedback.remove();
  
  const feedback = document.createElement('div');
  feedback.id = 'screenshot-feedback';
  feedback.textContent = message;
  feedback.style.cssText = `
    position: fixed;
    top: 20px; left: 50%;
    transform: translateX(-50%);
    background: ${isError ? '#dc3545' : '#28a745'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 2147483647;
    font-family: system-ui;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    text-align: center;
    border: 2px solid ${isError ? '#c82333' : '#218838'};
  `;
  
  document.body.appendChild(feedback);
  
  setTimeout(() => feedback.remove(), 3000);
}

function downloadPdf(pdfBase64, filename) {
  try {
    const byteCharacters = atob(pdfBase64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArray[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showFeedback('PDF downloaded!', false);
  } catch (error) {
    console.error('Download failed:', error);
    showFeedback('Download failed', true);
  }
}