        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const info = document.getElementById('info');
        const previewContainer = document.getElementById('previewContainer');
        const removeBtn = document.getElementById('removeBtn');
        let pdfDoc = null;
        let pageCheckboxes = [];  // {pageNum, checkbox}

        // Events
        fileInput.addEventListener('change', loadPDF);
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                fileInput.files = [file];
                loadPDF({ target: fileInput });
            }
        });

        async function loadPDF(event) {
            const file = event.target.files[0];
            if (!file) return;
            dropZone.innerHTML = `<p>Loading ${file.name}...</p>`;
            info.textContent = 'Loading PDF...';
            info.className = '';

            try {
                const arrayBuffer = await file.arrayBuffer();
                pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
                previewContainer.innerHTML = '';
                pageCheckboxes = [];
                await renderThumbnails();
                info.innerHTML = `<i class="fas fa-check"></i> Loaded ${pdfDoc.numPages} pages! Select to delete.`;
                info.className = 'success';
                removeBtn.disabled = false;
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation"></i> Error: ${e.message}`;
                info.className = 'error';
            }
        }

        async function renderThumbnails() {
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const scale = 0.5;  // Thumbnail scale
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.className = 'page-canvas';

                await page.render({ canvasContext: context, viewport }).promise;

                const div = document.createElement('div');
                div.className = 'page-preview';
                div.innerHTML = `
                    <canvas></canvas>
                    <div class="checkbox-row">
                        <label><input type="checkbox" data-page="${pageNum}"> Delete Page ${pageNum}</label>
                    </div>
                `;
                div.querySelector('canvas').replaceWith(canvas);

                const checkbox = div.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', (e) => togglePage(e.target.dataset.page, e.target.checked));
                pageCheckboxes.push({ pageNum: pageNum, checkbox: checkbox });

                previewContainer.appendChild(div);
            }
        }

        function togglePage(pageNum, checked) {
            // Just for tracking â€“ collect on remove
        }

        async function removeSelected() {
            const selected = Array.from(pageCheckboxes)
                .filter(item => item.checkbox.checked)
                .map(item => parseInt(item.pageNum));

            if (selected.length === 0) {
                alert('Select pages to remove!');
                return;
            }

            removeBtn.disabled = true;
            removeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            info.textContent = 'Removing pages...';

            try {
                const { PDFDocument } = PDFLib;
                const pdfBytes = await (await pdfDoc.getData()).buffer;  // Get original bytes
                let libDoc = await PDFDocument.load(pdfBytes);

                // Remove selected pages (reverse order to avoid index shift)
                selected.sort((a, b) => b - a).forEach(p => {
                    libDoc.removePage(p - 1);  // 0-based
                });

                const finalBytes = await libDoc.save();
                const blob = new Blob([finalBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `preview_removed_${new Date().getTime()}.pdf`;  // Unique name
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                info.innerHTML = `<i class="fas fa-check"></i> Removed ${selected.length} pages! Downloaded successfully.`;
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation"></i> Error: ${e.message}`;
                info.className = 'error';
            } finally {
                removeBtn.disabled = false;
                removeBtn.innerHTML = '<i class="fas fa-scissors"></i> Remove Selected & Download';
            }
        }
    
