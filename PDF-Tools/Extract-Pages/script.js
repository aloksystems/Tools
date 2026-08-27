        const { PDFDocument } = PDFLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        let selectedFile = null;
        let pdfDoc = null;
        let selectedPages = new Set();
        let totalPages = 0;

        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdfFile');
        const status = document.getElementById('status');
        const pagesGrid = document.getElementById('pagesGrid');
        const extractBtn = document.getElementById('extractBtn');
        const selectionControls = document.getElementById('selectionControls');

        // Drag and drop handlers
        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/pdf') {
                handleFileSelection(files[0]);
            } else {
                showStatus('Please drop a valid PDF file', 'error');
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
            }
        });

        async function handleFileSelection(file) {
            selectedFile = file;
            selectedPages.clear();
            
            try {
                showStatus('Loading PDF... Please wait', 'loading');
                
                const arrayBuffer = await file.arrayBuffer();
                pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                totalPages = pdfDoc.numPages;
                
                selectionControls.classList.add('show');
                await renderPages();
                
                showStatus(`âœ“ PDF loaded: ${totalPages} pages. Select pages to extract.`, 'success');
                updateSelectedCount();
                
            } catch (error) {
                console.error('Error loading PDF:', error);
                showStatus('Error loading PDF: ' + error.message, 'error');
            }
        }

        async function renderPages() {
            pagesGrid.innerHTML = '';
            
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 0.3 });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                
                const pageItem = document.createElement('div');
                pageItem.className = 'page-item';
                pageItem.dataset.page = pageNum;
                pageItem.innerHTML = `
                    <div class="selection-badge">${pageNum}</div>
                    <div class="page-number">Page ${pageNum}</div>
                `;
                pageItem.insertBefore(canvas, pageItem.firstChild);
                
                pageItem.addEventListener('click', () => togglePage(pageNum));
                pagesGrid.appendChild(pageItem);
            }
        }

        function togglePage(pageNum) {
            const pageItem = document.querySelector(`[data-page="${pageNum}"]`);
            
            if (selectedPages.has(pageNum)) {
                selectedPages.delete(pageNum);
                pageItem.classList.remove('selected');
            } else {
                selectedPages.add(pageNum);
                pageItem.classList.add('selected');
            }
            
            updateSelectedCount();
        }

        function selectAll() {
            selectedPages.clear();
            for (let i = 1; i <= totalPages; i++) {
                selectedPages.add(i);
            }
            updateUI();
        }

        function deselectAll() {
            selectedPages.clear();
            updateUI();
        }

        function selectOdd() {
            selectedPages.clear();
            for (let i = 1; i <= totalPages; i += 2) {
                selectedPages.add(i);
            }
            updateUI();
        }

        function selectEven() {
            selectedPages.clear();
            for (let i = 2; i <= totalPages; i += 2) {
                selectedPages.add(i);
            }
            updateUI();
        }

        function selectByRange() {
            const input = document.getElementById('pageRangeInput').value;
            const ranges = input.split(',');
            
            selectedPages.clear();
            
            ranges.forEach(range => {
                range = range.trim();
                if (range.includes('-')) {
                    const [start, end] = range.split('-').map(n => parseInt(n.trim()));
                    for (let i = start; i <= Math.min(end, totalPages); i++) {
                        if (i >= 1) selectedPages.add(i);
                    }
                } else {
                    const pageNum = parseInt(range);
                    if (pageNum >= 1 && pageNum <= totalPages) {
                        selectedPages.add(pageNum);
                    }
                }
            });
            
            updateUI();
        }

        function updateUI() {
            document.querySelectorAll('.page-item').forEach(item => {
                const pageNum = parseInt(item.dataset.page);
                if (selectedPages.has(pageNum)) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
            updateSelectedCount();
        }

        function updateSelectedCount() {
            const count = selectedPages.size;
            const countElement = document.getElementById('selectedCount');
            
            if (count === 0) {
                countElement.textContent = 'No pages selected';
                extractBtn.disabled = true;
            } else {
                countElement.textContent = `${count} page${count > 1 ? 's' : ''} selected`;
                extractBtn.disabled = false;
            }
        }

        extractBtn.addEventListener('click', extractPages);

        async function extractPages() {
            if (selectedPages.size === 0) {
                showStatus('Please select at least one page', 'error');
                return;
            }

            try {
                showStatus('Extracting pages... Please wait', 'loading');
                extractBtn.disabled = true;

                const arrayBuffer = await selectedFile.arrayBuffer();
                const srcDoc = await PDFDocument.load(arrayBuffer);
                const newDoc = await PDFDocument.create();

                // Sort pages and copy them
                const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
                
                for (const pageNum of sortedPages) {
                    const [copiedPage] = await newDoc.copyPages(srcDoc, [pageNum - 1]);
                    newDoc.addPage(copiedPage);
                }

                const pdfBytes = await newDoc.save();

                // Download
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedFile.name.replace('.pdf', '_extracted.pdf');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showStatus(`âœ“ Extracted ${selectedPages.size} pages successfully!`, 'success');

            } catch (error) {
                console.error('Error extracting pages:', error);
                showStatus('Error: ' + error.message, 'error');
            } finally {
                extractBtn.disabled = false;
            }
        }

        function showStatus(message, type) {
            status.textContent = message;
            status.className = `show ${type}`;
            
            if (type === 'success') {
                setTimeout(() => {
                    status.classList.remove('show');
                }, 5000);
            }
        }
    
