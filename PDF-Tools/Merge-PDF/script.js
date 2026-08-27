        const { PDFDocument } = PDFLib;

        // Elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const fileList = document.getElementById('fileList');
        const info = document.getElementById('info');
        const mergeBtn = document.getElementById('mergeBtn');

        let selectedFiles = [];  // Array of {file, pdfDoc}

        // Drag-drop events
        fileInput.addEventListener('change', handleFiles);
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
            if (files.length > 0) {
                handleFiles({ target: { files } });
            }
        });
        dropZone.addEventListener('click', () => fileInput.click());

        function handleFiles(event) {
            const files = Array.from(event.target.files).filter(f => f.type === 'application/pdf');
            if (files.length === 0) return;

            Promise.all(files.map(async (file) => {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdfDoc = await PDFDocument.load(arrayBuffer);
                    return { file, pdfDoc };
                } catch (e) {
                    console.error(`Failed to load ${file.name}:`, e);
                    return null;
                }
            })).then((loaded) => {
                const valid = loaded.filter(item => item !== null);
                selectedFiles.push(...valid);
                updateFileList();
                info.innerHTML = `<i class="fas fa-check"></i> Added ${valid.length} PDFs!`;
                info.className = 'success';
                mergeBtn.disabled = selectedFiles.length === 0;
            });
        }

        function addFiles() {
            fileInput.click();
        }

        function clearList() {
            selectedFiles = [];
            updateFileList();
            info.innerHTML = '<i class="fas fa-trash"></i> List cleared!';
            info.className = '';
            mergeBtn.disabled = true;
        }

        function updateFileList() {
            fileList.innerHTML = '';
            selectedFiles.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'file-item';
                div.innerHTML = `
                    <span class="file-name">${item.file.name}</span>
                    <button class="remove-btn" onclick="removeFile(${index})">Remove</button>
                `;
                fileList.appendChild(div);
            });
        }

        function removeFile(index) {
            selectedFiles.splice(index, 1);
            updateFileList();
            info.innerHTML = '<i class="fas fa-minus"></i> File removed!';
            info.className = '';
            mergeBtn.disabled = selectedFiles.length === 0;
        }

        async function mergePDFs() {
            if (selectedFiles.length === 0) {
                info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Add some PDFs first!';
                info.className = 'error';
                return;
            }

            mergeBtn.disabled = true;
            mergeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Merging...';
            info.textContent = 'Merging PDFs...';

            try {
                const mergedDoc = await PDFDocument.create();
                for (let item of selectedFiles) {
                    const copiedPages = await mergedDoc.copyPages(item.pdfDoc, item.pdfDoc.getPageIndices());
                    copiedPages.forEach(page => mergedDoc.addPage(page));
                }

                const mergedBytes = await mergedDoc.save();
                const blob = new Blob([mergedBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `merged_${Date.now()}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                info.innerHTML = `<i class="fas fa-check-circle"></i> Success! Merged ${selectedFiles.length} PDFs. Downloaded 'merged.pdf'!`;
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Merge failed: ${e.message}`;
                info.className = 'error';
            } finally {
                mergeBtn.disabled = false;
                mergeBtn.innerHTML = '<i class="fas fa-merge"></i> Merge PDFs';
            }
        }

        // Initial state
        mergeBtn.disabled = true;
    
