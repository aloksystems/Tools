        const { PDFDocument, degrees } = PDFLib;
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const info = document.getElementById('info');
        const rotateBtn = document.getElementById('rotateBtn');
        const pageRangeInput = document.getElementById('pageRange');
        const angleBtns = document.querySelectorAll('.angle-group button');
        const fileNameDiv = document.getElementById('fileName');
        let pdfDoc, totalPages;
        let selectedAngle = 90;

        fileInput.addEventListener('change', loadFile);
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; loadFile({ target: fileInput });
            }
        });
        dropZone.addEventListener('click', () => fileInput.click());

        angleBtns.forEach(btn => btn.addEventListener('click', () => {
            angleBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
            selectedAngle = parseInt(btn.dataset.angle);
        }));

        async function loadFile(event) {
            const file = event.target.files[0]; if (!file) return;
            dropZone.querySelector('span').textContent = 'Processing...'; fileNameDiv.textContent = file.name;
            info.textContent = 'Loading PDF...'; info.className = '';
            try {
                const arrayBuffer = await file.arrayBuffer();
                pdfDoc = await PDFDocument.load(arrayBuffer);
                totalPages = pdfDoc.getPageCount();
                info.innerHTML = `<i class="fas fa-check"></i> Loaded: ${totalPages} pages ready to rotate!`;
                info.className = 'success'; rotateBtn.disabled = false; pageRangeInput.value = 'all';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Couldn't load PDF: ${e.message}`; info.className = 'error'; rotateBtn.disabled = true;
            }
        }

        function parseRange(rangeStr, total) {
            if (rangeStr.trim() === 'all') return Array.from({ length: total }, (_, i) => i);
            const pages = new Set();
            const parts = rangeStr.split(/,(?![^-])/).map(p => p.trim()).filter(Boolean);
            for (let part of parts) {
                if (part.includes('-')) {
                    const [startStr, endStr] = part.split('-');
                    const start = parseInt(startStr) || 1;
                    const end = parseInt(endStr) || total;
                    for (let i = start - 1; i < end; i++) if (i >= 0 && i < total) pages.add(i);
                } else {
                    const page = parseInt(part) - 1;
                    if (page >= 0 && page < total) pages.add(page);
                }
            }
            return Array.from(pages).sort((a, b) => a - b);
        }

        async function rotatePDF() {
            if (!pdfDoc) { info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Select a PDF first!'; info.className = 'error'; return; }
            const rangeStr = pageRangeInput.value.trim();
            let pageIndices = parseRange(rangeStr || 'all', totalPages);
            if (pageIndices.length === 0) { info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Invalid range!'; info.className = 'error'; return; }

            rotateBtn.disabled = true; rotateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rotating...'; info.textContent = 'Rotating pages...';
            try {
                const pages = pdfDoc.getPages();
                pageIndices.forEach(idx => {
                    const rotation = pages[idx].getRotation().angle + selectedAngle;
                    pages[idx].setRotation(degrees(rotation % 360));
                });
                const pdfBytes = await pdfDoc.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `rotated_${Date.now()}.pdf`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                info.innerHTML = `<i class="fas fa-check-circle"></i> Success! Rotated ${pageIndices.length} pages. Downloaded!`;
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Rotation failed: ${e.message}`; info.className = 'error';
            } finally {
                rotateBtn.disabled = false; rotateBtn.innerHTML = '<i class="fas fa-redo"></i> Rotate PDF';
            }
        }
        rotateBtn.disabled = true;
    
