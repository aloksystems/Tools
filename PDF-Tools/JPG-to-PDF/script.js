        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const fileList = document.getElementById('fileList');
        const info = document.getElementById('info');
        const convertBtn = document.getElementById('convertBtn');
        let selectedFiles = [];

        fileInput.addEventListener('change', handleFiles);
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') && (f.type === 'image/jpeg' || f.type === 'image/png'));
            if (files.length > 0) {
                // Create a mock event object that handleFiles expects
                const mockEvent = { target: { files: files } };
                handleFiles(mockEvent);
            }
        });

        async function handleFiles(event) {
            const files = Array.from(event.target.files).filter(f => f.type === 'image/jpeg' || f.type === 'image/png');
            if (files.length === 0) return;
            selectedFiles.push(...files);
            updateFileList();
            info.innerHTML = `<i class="fas fa-check"></i> Added ${files.length} images!`;
            info.className = 'success';
            convertBtn.disabled = selectedFiles.length === 0;
        }

        function addFiles() { fileInput.click(); }
        function clearList() {
            selectedFiles = []; updateFileList();
            info.innerHTML = '<i class="fas fa-trash"></i> List cleared!';
            info.className = ''; convertBtn.disabled = true;
        }
        function updateFileList() {
            fileList.innerHTML = '';
            selectedFiles.forEach((file, index) => {
                const div = document.createElement('div');
                div.className = 'file-item';
                div.draggable = true;
                div.innerHTML = `
                    <span class="file-name">${file.name}</span>
                    <button class="remove-btn" onclick="removeFile(${index})">Remove</button>
                `;
                div.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', index));
                fileList.appendChild(div);
            });
            // Simple reorder on drop (basic drag-drop)
            fileList.addEventListener('dragover', (e) => e.preventDefault());
            fileList.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const rect = fileList.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const toIndex = Math.floor(y / (rect.height / selectedFiles.length));
                if (fromIndex !== toIndex) {
                    const [moved] = selectedFiles.splice(fromIndex, 1);
                    selectedFiles.splice(toIndex, 0, moved);
                    updateFileList();
                }
            });
        }
        function removeFile(index) {
            selectedFiles.splice(index, 1); updateFileList();
            info.innerHTML = '<i class="fas fa-minus"></i> Image removed!';
            info.className = ''; convertBtn.disabled = selectedFiles.length === 0;
        }

        async function convertToPDF() {
            if (selectedFiles.length === 0) { info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Add some images first!'; info.className = 'error'; return; }
            convertBtn.disabled = true; convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...'; info.textContent = 'Creating PDF...';
            try {
                const pdfDoc = await PDFLib.PDFDocument.create();
                const pages = [];
                for (let file of selectedFiles) {
                    const arrayBuffer = await file.arrayBuffer();
                    let embeddedImage;
                    if (file.type === 'image/jpeg') {
                        embeddedImage = await pdfDoc.embedJpg(arrayBuffer);
                    } else {
                        embeddedImage = await pdfDoc.embedPng(arrayBuffer);
                    }
                    const page = pdfDoc.addPage([PDFLib.PageSizes.A4[0], PDFLib.PageSizes.A4[1]]);
                    const { width, height } = embeddedImage.scale(1);
                    const scale = Math.min(PDFLib.PageSizes.A4[0] / width, PDFLib.PageSizes.A4[1] / height);
                    page.drawImage(embeddedImage, {
                        x: (PDFLib.PageSizes.A4[0] - width * scale) / 2,
                        y: (PDFLib.PageSizes.A4[1] - height * scale) / 2,
                        width: width * scale,
                        height: height * scale,
                    });
                    pages.push(page);
                }
                const pdfBytes = await pdfDoc.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `images_to_pdf_${Date.now()}.pdf`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                info.innerHTML = `<i class="fas fa-check-circle"></i> Success! Converted ${selectedFiles.length} images to PDF. Downloaded!`;
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Conversion failed: ${e.message}`;
                info.className = 'error';
            } finally {
                convertBtn.disabled = false; convertBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Convert to PDF';
            }
        }
        convertBtn.disabled = true;
    
