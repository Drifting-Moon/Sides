document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const imageGrid = document.getElementById('image-grid');
    const targetSizeInput = document.getElementById('target-size');
    const targetSizeWrapper = document.getElementById('target-size-wrapper');
    const batchNameInput = document.getElementById('batch-name-input');
    const applySizeBtn = document.getElementById('apply-size-btn');
    const actionsFooter = document.getElementById('actions-footer');
    const totalCompressedText = document.getElementById('total-compressed');
    const downloadZipBtn = document.getElementById('download-zip');
    const downloadPdfBtn = document.getElementById('download-pdf');
    const clearAllBtn = document.getElementById('clear-all');
    const imageCardTemplate = document.getElementById('image-card-template');

    let processedFiles = new Map(); // id -> file data

    // Initialize
    initEvents();

    function initEvents() {
        // Drag and Drop
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragging');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragging');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            handleFiles(files);
        });

        // File Input
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
            handleFiles(files);
        });

        // Paste support
        window.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const files = [];
            for (let item of items) {
                if (item.type.indexOf('image') !== -1) {
                    files.push(item.getAsFile());
                }
            }
            if (files.length > 0) handleFiles(files);
        });

        // Target Size change logic
        const triggerProcessing = () => {
            for (const [id, data] of processedFiles) {
                const card = data.element;
                const file = data.originalFile;
                const name = data.originalName;
                processImage(id, file, name, card);
            }
        };

        targetSizeInput.addEventListener('change', triggerProcessing);
        applySizeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid double focus
            triggerProcessing();
            
            // Visual feedback
            applySizeBtn.style.transform = 'scale(0.8)';
            setTimeout(() => applySizeBtn.style.transform = '', 200);
        });

        // Make the whole wrapper clickable to focus input
        targetSizeWrapper.addEventListener('click', () => {
            targetSizeInput.focus();
        });

        // Clear All
        clearAllBtn.addEventListener('click', () => {
            imageGrid.innerHTML = '';
            processedFiles.clear();
            updateFooter();
        });

        // Download Actions
        downloadZipBtn.addEventListener('click', downloadZip);
        downloadPdfBtn.addEventListener('click', downloadPdf);
    }

    async function handleFiles(files) {
        if (files.length === 0) return;
        
        actionsFooter.classList.remove('hidden');

        for (const file of files) {
            const id = Math.random().toString(36).substr(2, 9);
            const originalName = file.name.split('.').slice(0, -1).join('.') || 'image';
            
            // Create Card UI
            const card = createImageCard(id, file, originalName);
            imageGrid.appendChild(card);
            
            // Process Image
            processImage(id, file, originalName, card);
        }
    }

    function createImageCard(id, file, originalName) {
        const clone = imageCardTemplate.content.cloneNode(true);
        const card = clone.querySelector('.image-card');
        card.dataset.id = id;

        const nameInput = card.querySelector('.file-name-input');
        nameInput.value = originalName;

        const originalSizeText = card.querySelector('.original-size');
        originalSizeText.textContent = formatBytes(file.size);

        const downloadBtn = card.querySelector('.download-card-btn');
        const handleDownload = (e) => {
            e.stopPropagation();
            const data = processedFiles.get(id);
            if (!data) return;
            const nameInput = card.querySelector('.file-name-input');
            const customName = nameInput.value || data.originalName;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(data.blob);
            link.download = `${customName}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        downloadBtn.addEventListener('click', handleDownload);

        const removeBtn = card.querySelector('.remove-btn');
        const handleRemove = () => {
            card.remove();
            processedFiles.delete(id);
            updateFooter();
        };
        removeBtn.addEventListener('click', handleRemove);

        return card;
}

    async function processImage(id, file, name, card) {
        const previewImg = card.querySelector('.preview-img');
        const compressedSizeText = card.querySelector('.compressed-size');
        const savingsBadge = card.querySelector('.savings-badge');
        const statusOverlay = card.querySelector('.status-overlay');
        const targetSizeKB = parseInt(targetSizeInput.value) || 500;
        const targetSizeBytes = targetSizeKB * 1024;

        statusOverlay.classList.add('active');

        try {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            ctx.drawImage(bitmap, 0, 0);

            const extensionText = card.querySelector('.extension');
            extensionText.textContent = '.jpg';
            
            const downloadBtn = card.querySelector('.download-card-btn');
            downloadBtn.title = 'Download JPEG';

            // Binary search or iterative approach for target size
            let quality = 0.95;
            let blob = await getBlob(canvas, quality);
            
            if (blob.size > targetSizeBytes) {
                // Quick iterative step-down if significantly larger
                let min = 0.05, max = 0.95;
                for (let i = 0; i < 7; i++) { // 7 steps of binary search is fine
                    quality = (min + max) / 2;
                    blob = await getBlob(canvas, quality);
                    if (blob.size > targetSizeBytes) {
                        max = quality;
                    } else {
                        min = quality;
                    }
                }
            }

            // Update UI
            const url = URL.createObjectURL(blob);
            previewImg.src = url;
            compressedSizeText.textContent = formatBytes(blob.size);
            
            // Calculate Savings
            const savings = Math.round((1 - (blob.size / file.size)) * 100);
            if (savings > 0) {
                savingsBadge.textContent = `-${savings}%`;
                savingsBadge.classList.remove('hidden');
            } else {
                savingsBadge.classList.add('hidden');
            }

            statusOverlay.classList.remove('active');

            // Store for download
            processedFiles.set(id, {
                blob,
                originalFile: file,
                originalName: name,
                element: card
            });

            updateFooter();
        } catch (err) {
            console.error('Processing error:', err);
            statusOverlay.innerHTML = '<span style="color:var(--danger)">Error</span>';
        }
    }

    function getBlob(canvas, quality) {
        return new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', quality);
        });
    }



    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function updateFooter() {
        const count = processedFiles.size;
        totalCompressedText.textContent = `${count} image${count === 1 ? '' : 's'} compressed`;
        if (count === 0) {
            actionsFooter.classList.add('hidden');
        } else {
            actionsFooter.classList.remove('hidden');
        }
    }

    async function downloadZip() {
        if (processedFiles.size === 0) return;

        const zip = new JSZip();
        const batchName = document.getElementById('batch-name-input').value.trim() || 'compressed_images';
        
        for (const [id, data] of processedFiles) {
            const nameInput = data.element.querySelector('.file-name-input');
            const customName = nameInput.value || data.originalName;
            zip.file(`${customName}.jpg`, data.blob);
        }

        const content = await zip.generateAsync({type: "blob"});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${batchName}.zip`;
        link.click();
    }

    async function downloadPdf() {
        if (processedFiles.size === 0) return;
        
        const batchName = document.getElementById('batch-name-input').value.trim() || 'compressed_images';
        
        const pdf = new window.jspdf.jsPDF({
            orientation: 'p',
            unit: 'px',
            format: 'a4'
        });
        
        let isFirstPage = true;
        let pageNum = 1;
        
        for (const [id, data] of processedFiles) {
            if (!isFirstPage) {
                pdf.addPage();
            }
            
            const base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(data.blob);
            });
            
            const img = new Image();
            img.src = base64Data;
            await new Promise(resolve => img.onload = resolve);
            
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            
            // Add padding
            const padding = 20;
            const pWidth = pageWidth - (padding * 2);
            const pHeight = pageHeight - (padding * 2) - 20; // extra space for page number
            
            const ratio = Math.min(pWidth / img.width, pHeight / img.height);
            const targetWidth = img.width * ratio;
            const targetHeight = img.height * ratio;
            
            const x = (pageWidth - targetWidth) / 2;
            const y = padding + (pHeight - targetHeight) / 2;
            
            pdf.addImage(base64Data, 'JPEG', x, y, targetWidth, targetHeight);
            
            // Add page number (e.g. "1")
            pdf.setFontSize(10);
            pdf.setTextColor(100);
            pdf.text(String(pageNum), pageWidth / 2, pageHeight - 15, { align: 'center' });
            
            isFirstPage = false;
            pageNum++;
        }
        
        pdf.save(`${batchName}.pdf`);
    }
});
