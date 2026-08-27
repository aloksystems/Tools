        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const info = document.getElementById('info');
        const fileNameDiv = document.getElementById('fileName');
        const pagesContainer = document.getElementById('pagesContainer');
        const pagesGrid = document.getElementById('pagesGrid');
        const pageCountSpan = document.getElementById('pageCount');
        const downloadBtn = document.getElementById('downloadBtn');

        let pdfDoc = null;
        let originalFile = null;
        let pageOrder = [];

        // Drag-drop events
        fileInput.addEventListener('change', loadFile);
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                loadFile({ target: fileInput });
            }
        });

        async function loadFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            dropZone.querySelector('span').textContent = 'Processing...';
            fileNameDiv.textContent = file.name;
            info.textContent = 'Loading PDF...';
            info.className = '';

            try {
                // Store the original file to avoid ArrayBuffer detachment issues
                originalFile = file;
                const arrayBuffer = await file.arrayBuffer();
                pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
                
                pageOrder = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
                
                info.innerHTML = `<i class="fas fa-check"></i> Loaded PDF with ${pdfDoc.numPages} pages!`;
                info.className = 'success';
                
                await renderPages();
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Couldn't load PDF: ${e.message}`;
                info.className = 'error';
                pdfDoc = null;
            } finally {
                dropZone.querySelector('span').textContent = 'Drop your PDF here or click to browse';
            }
        }

        async function renderPages() {
            if (!pdfDoc) return;

            pagesGrid.innerHTML = '';
            pageCountSpan.textContent = `(${pdfDoc.numPages} pages)`;
            pagesContainer.style.display = 'block';

            for (let i = 0; i < pdfDoc.numPages; i++) {
                const pageNum = i + 1;
                const page = await pdfDoc.getPage(pageNum);
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                const viewport = page.getViewport({ scale: 1.5 });
                
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                const pageItem = document.createElement('div');
                pageItem.className = 'page-item';
                pageItem.draggable = true;
                pageItem.dataset.pageNumber = pageNum;
                
                pageItem.innerHTML = `
                    <canvas></canvas>
                    <div class="page-number">Page ${pageNum}</div>
                `;
                
                // Copy canvas content
                const pageCanvas = pageItem.querySelector('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = canvas.height;
                pageCanvas.getContext('2d').drawImage(canvas, 0, 0);
                
                // Add drag events
                pageItem.addEventListener('dragstart', handleDragStart);
                pageItem.addEventListener('dragover', handleDragOver);
                pageItem.addEventListener('dragenter', handleDragEnter);
                pageItem.addEventListener('dragleave', handleDragLeave);
                pageItem.addEventListener('drop', handleDrop);
                pageItem.addEventListener('dragend', handleDragEnd);
                
                pagesGrid.appendChild(pageItem);
            }
            
            downloadBtn.disabled = false;
        }

        // Drag and drop functionality
        let draggedItem = null;

        function handleDragStart(e) {
            draggedItem = this;
            setTimeout(() => this.classList.add('dragging'), 0);
        }

        function handleDragOver(e) {
            e.preventDefault();
        }

        function handleDragEnter(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        }

        function handleDragLeave() {
            this.classList.remove('drag-over');
        }

        function handleDrop(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            
            if (draggedItem !== this) {
                const allItems = Array.from(pagesGrid.children);
                const draggedIndex = allItems.indexOf(draggedItem);
                const targetIndex = allItems.indexOf(this);
                
                if (draggedIndex < targetIndex) {
                    pagesGrid.insertBefore(draggedItem, this.nextSibling);
                } else {
                    pagesGrid.insertBefore(draggedItem, this);
                }
                
                // Update page order array
                updatePageOrder();
                
                info.innerHTML = '<i class="fas fa-check"></i> Page order updated! Drag more pages or download.';
                info.className = 'success';
            }
        }

        function handleDragEnd() {
            this.classList.remove('dragging');
            draggedItem = null;
        }

        function updatePageOrder() {
            const items = pagesGrid.querySelectorAll('.page-item');
            pageOrder = Array.from(items).map(item => parseInt(item.dataset.pageNumber));
        }

        async function downloadRearrangedPDF() {
            if (!originalFile || pageOrder.length === 0) {
                info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No PDF loaded!';
                info.className = 'error';
                return;
            }

            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating PDF...';
            info.textContent = 'Creating rearranged PDF...';
            info.className = '';

            try {
                // Create a fresh ArrayBuffer from the original file each time
                const arrayBuffer = await originalFile.arrayBuffer();
                
                // Use PDFLib directly without destructuring
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
                
                // Create a new PDF document
                const newPdfDoc = await PDFLib.PDFDocument.create();
                
                // Copy pages in the new order
                for (const pageNumber of pageOrder) {
                    const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageNumber - 1]);
                    newPdfDoc.addPage(copiedPage);
                }
                
                // Save the new PDF
                const pdfBytes = await newPdfDoc.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `rearranged_pdf_${Date.now()}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                info.innerHTML = '<i class="fas fa-check-circle"></i> Success! PDF with rearranged pages downloaded!';
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> PDF creation failed: ${e.message}`;
                info.className = 'error';
                console.error('PDF creation error:', e); // Log error for debugging
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download Rearranged PDF';
            }
        }

        function resetAll() {
            fileInput.value = '';
            fileNameDiv.textContent = '';
            info.textContent = '';
            info.className = '';
            pagesContainer.style.display = 'none';
            pagesGrid.innerHTML = '';
            pdfDoc = null;
            originalFileArrayBuffer = null;
            pageOrder = [];
            downloadBtn.disabled = true;
            dropZone.querySelector('span').textContent = 'Drop your PDF here or click to browse';
        }
    
