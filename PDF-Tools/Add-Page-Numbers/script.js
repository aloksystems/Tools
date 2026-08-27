        const { PDFDocument, rgb, StandardFonts } = PDFLib;

        let selectedFile = null;
        let position = 'bottom-center';
        let format = '{n}';
        let fontSize = 12;
        let startFrom = 1;
        let totalPages = 0;

        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdfFile');
        const status = document.getElementById('status');
        const optionsSection = document.getElementById('optionsSection');

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
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                totalPages = pdfDoc.getPageCount();
                
                showStatus(`PDF loaded: ${totalPages} page(s). Configure settings below.`, 'success');
                optionsSection.classList.add('show');
                updatePreview();
            } catch (error) {
                showStatus('Error loading PDF: ' + error.message, 'error');
            }
        }

        // Position selection
        document.querySelectorAll('.position-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.position-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                position = this.dataset.position;
                updatePreview();
            });
        });

        // Format selection
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                format = this.dataset.format;
                updatePreview();
            });
        });

        // Font size
        document.getElementById('fontSize').addEventListener('input', function() {
            fontSize = parseInt(this.value);
            document.getElementById('fontSizeValue').textContent = fontSize;
            updatePreview();
        });

        // Start page
        document.getElementById('startPage').addEventListener('input', function() {
            startFrom = parseInt(this.value) || 1;
            updatePreview();
        });

        function updatePreview() {
            let previewText = format.replace('{n}', startFrom).replace('{total}', totalPages);
            document.getElementById('previewText').textContent = previewText;
            document.getElementById('previewText').style.fontSize = fontSize + 'px';
        }

        // Add page numbers
        document.getElementById('addNumbersBtn').addEventListener('click', addPageNumbers);

        async function addPageNumbers() {
            if (!selectedFile) {
                showStatus('Please select a PDF file first', 'error');
                return;
            }

            try {
                showStatus('Adding page numbers... Please wait', 'loading');
                document.getElementById('addNumbersBtn').disabled = true;

                const arrayBuffer = await selectedFile.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                const pages = pdfDoc.getPages();

                pages.forEach((page, index) => {
                    if (index + 1 < startFrom) return;

                    const { width, height } = page.getSize();
                    const pageNumber = index + 1;
                    const text = format.replace('{n}', pageNumber).replace('{total}', totalPages);
                    const textWidth = font.widthOfTextAtSize(text, fontSize);

                    let x, y;

                    // Calculate position
                    switch (position) {
                        case 'top-left':
                            x = 50;
                            y = height - 30;
                            break;
                        case 'top-center':
                            x = (width - textWidth) / 2;
                            y = height - 30;
                            break;
                        case 'top-right':
                            x = width - textWidth - 50;
                            y = height - 30;
                            break;
                        case 'bottom-left':
                            x = 50;
                            y = 30;
                            break;
                        case 'bottom-center':
                            x = (width - textWidth) / 2;
                            y = 30;
                            break;
                        case 'bottom-right':
                            x = width - textWidth - 50;
                            y = 30;
                            break;
                    }

                    page.drawText(text, {
                        x: x,
                        y: y,
                        size: fontSize,
                        font: font,
                        color: rgb(0, 0, 0),
                    });
                });

                const pdfBytes = await pdfDoc.save();

                // Download
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedFile.name.replace('.pdf', '_numbered.pdf');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showStatus('âœ“ Page numbers added successfully!', 'success');

            } catch (error) {
                console.error('Error adding page numbers:', error);
                showStatus('Error: ' + error.message, 'error');
            } finally {
                document.getElementById('addNumbersBtn').disabled = false;
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
    
