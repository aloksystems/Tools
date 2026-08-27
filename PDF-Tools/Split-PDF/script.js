        const { PDFDocument } = PDFLib;

        // Elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const info = document.getElementById('info');
        const splitBtn = document.getElementById('splitBtn');
        const modeRadios = document.getElementsByName('mode');
        const rangeEntry = document.getElementById('rangeEntry');
        const fileNameDiv = document.getElementById('fileName');

        let pdfDoc, totalPages;

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

        // Mode toggle
        modeRadios.forEach(input => {
            input.addEventListener('change', (e) => {
                rangeEntry.style.display = e.target.value === 'custom' ? 'block' : 'none';
                if (e.target.value === 'custom') {
                    rangeEntry.value = '1-';
                } else {
                    rangeEntry.value = '';
                }
            });
        });
        rangeEntry.style.display = 'none';  // Default

        async function loadFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            dropZone.querySelector('span').textContent = 'Processing...';
            fileNameDiv.textContent = file.name;
            info.textContent = 'Loading PDF...';
            info.className = '';

            try {
                const arrayBuffer = await file.arrayBuffer();
                pdfDoc = await PDFDocument.load(arrayBuffer);
                totalPages = pdfDoc.getPageCount();
                info.innerHTML = `<i class="fas fa-check"></i> Loaded: ${totalPages} pages ready to split!`;
                info.className = 'success';
                splitBtn.disabled = false;
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Couldn't load PDF: ${e.message}`;
                info.className = 'error';
                splitBtn.disabled = true;
            }
        }

        function parseRange(rangeStr, totalPages) {
            const pages = new Set();
            const parts = rangeStr.split(/,(?![^-])/).map(p => p.trim()).filter(Boolean);
            for (let part of parts) {
                if (part.includes('-')) {
                    const [startStr, endStr] = part.split('-');
                    const start = parseInt(startStr) || 1;
                    const end = parseInt(endStr) || totalPages;
                    for (let i = start - 1; i < end; i++) {
                        if (i >= 0 && i < totalPages) pages.add(i);
                    }
                } else {
                    const page = parseInt(part) - 1;
                    if (page >= 0 && page < totalPages) pages.add(page);
                }
            }
            return Array.from(pages).sort((a, b) => a - b);
        }

        async function splitPDF() {
            if (!pdfDoc) {
                info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Select a PDF first!';
                info.className = 'error';
                return;
            }

            const mode = document.querySelector('input[name="mode"]:checked').value;
            let pageIndices;
            if (mode === 'all') {
                pageIndices = Array.from({ length: totalPages }, (_, i) => i);
            } else {
                const rangeStr = rangeEntry.value.trim();
                if (!rangeStr) {
                    info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Enter a range (e.g., 1-5,10)!';
                    info.className = 'error';
                    return;
                }
                pageIndices = parseRange(rangeStr, totalPages);
                if (pageIndices.length === 0) {
                    info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Invalid range â€“ no pages selected!';
                    info.className = 'error';
                    return;
                }
            }

            splitBtn.disabled = true;
            splitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Splitting...';
            info.textContent = 'Splitting PDF...';

            try {
                const zip = new JSZip();
                for (let idx of pageIndices) {
                    const pageNum = idx + 1;
                    const newDoc = await PDFDocument.create();
                    const [copiedPage] = await newDoc.copyPages(pdfDoc, [idx]);
                    newDoc.addPage(copiedPage);
                    const pdfBytes = await newDoc.save();
                    zip.file(`page_${pageNum.toString().padStart(3, '0')}.pdf`, pdfBytes);
                }

                const zipBlob = await zip.generateAsync({ type: 'blob' });
                saveAs(zipBlob, `split_pages_${Date.now()}.zip`);
                info.innerHTML = `<i class="fas fa-check-circle"></i> Success! Split ${pageIndices.length} pages into ZIP â€“ download complete!`;
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Split failed: ${e.message}`;
                info.className = 'error';
            } finally {
                splitBtn.disabled = false;
                splitBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i> Split PDF';
            }
        }

        // Initial state
        splitBtn.disabled = true;
    
