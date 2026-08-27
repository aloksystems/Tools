        const { PDFDocument } = PDFLib;

        // Elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const info = document.getElementById('info');
        const sizeInfo = document.getElementById('sizeInfo');
        const compressBtn = document.getElementById('compressBtn');
        const levelRadios = document.getElementsByName('level');
        const fileNameDiv = document.getElementById('fileName');

        let pdfDoc, originalSize;

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
                const arrayBuffer = await file.arrayBuffer();
                pdfDoc = await PDFDocument.load(arrayBuffer);
                originalSize = file.size;
                const totalPages = pdfDoc.getPageCount();
                sizeInfo.innerHTML = `Original: ${formatSize(originalSize)} | ${totalPages} pages`;
                info.innerHTML = `<i class="fas fa-check"></i> Loaded successfully!`;
                info.className = 'success';
                compressBtn.disabled = false;
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Load failed: ${e.message}`;
                info.className = 'error';
                compressBtn.disabled = true;
            }
        }

        function formatSize(bytes) {
            const units = ['B', 'KB', 'MB', 'GB'];
            let size = bytes;
            let unit = units[0];
            for (let i = 1; i < units.length; i++) {
                if (size < 1024) break;
                size /= 1024;
                unit = units[i];
            }
            return `${size.toFixed(1)} ${unit}`;
        }

        async function compressPDF() {
            if (!pdfDoc) {
                info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Select a PDF first!';
                info.className = 'error';
                return;
            }

            const level = document.querySelector('input[name="level"]:checked').value;

            compressBtn.disabled = true;
            compressBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Compressing...';
            info.textContent = 'Compressing PDF...';

            try {
                let kwargs = { compressStreams: true };
                if (level === 'medium') {
                    // Simulate medium: more aggressive streams
                    kwargs.objectStreamMode = 1;  // Generate object streams if supported
                } else if (level === 'high') {
                    // High: Basic lossless + note (no Ghostscript in JS, so fallback to medium)
                    info.innerHTML += '<br><small>(High mode uses lossless in browser; for aggressive, try desktop!)</small>';
                    kwargs = { ...kwargs, objectStreamMode: 1 };
                }
                // Low: defaults

                const compressedBytes = await pdfDoc.save(kwargs);
                const blob = new Blob([compressedBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `compressed_${Date.now()}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                const newSize = compressedBytes.length;
                const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);
                info.innerHTML = `<i class="fas fa-check-circle"></i> Compressed to ${formatSize(newSize)} (${savings}% saved)! Downloaded.`;
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Compression failed: ${e.message}`;
                info.className = 'error';
            } finally {
                compressBtn.disabled = false;
                compressBtn.innerHTML = '<i class="fas fa-fire"></i> Compress PDF';
            }
        }

        // Initial state
        compressBtn.disabled = true;
    
