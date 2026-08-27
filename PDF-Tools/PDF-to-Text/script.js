        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const info = document.getElementById('info');
        const textConvertBtn = document.getElementById('textConvertBtn');
        const fileNameDiv = document.getElementById('fileName');

        let pdfDoc = null;

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
                pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
                info.innerHTML = `<i class="fas fa-check"></i> Loaded PDF with ${pdfDoc.numPages} pages!`;
                info.className = 'success';
                textConvertBtn.disabled = false;
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Couldn't load PDF: ${e.message}`;
                info.className = 'error';
                textConvertBtn.disabled = true;
                pdfDoc = null;
            } finally {
                dropZone.querySelector('span').textContent = 'Drop your PDF here or click to browse';
            }
        }

        async function convertToText() {
            if (!pdfDoc) {
                info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Select a PDF first!';
                info.className = 'error';
                return;
            }

            const format = document.querySelector('input[name="textFormat"]:checked').value;

            textConvertBtn.disabled = true;
            textConvertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting Text...';
            info.textContent = 'Extracting text from PDF...';
            info.className = '';

            try {
                let fullText = '';
                const numPages = pdfDoc.numPages;

                for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                    const page = await pdfDoc.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
                }

                if (format === 'txt') {
                    const blob = new Blob([fullText], { type: 'text/plain' });
                    saveAs(blob, `pdf_text_${Date.now()}.txt`);
                    info.innerHTML = `<i class="fas fa-check-circle"></i> Success! Extracted text from ${numPages} pages as TXT.`;
                } else {
                    // Create a basic Word document (simple RTF format)
                    const escapedText = fullText.replace(/\n/g, '\\par\n');
                    const rtfContent = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}}\n\\viewkind4\\uc1\\pard\\f0\\fs22\n${escapedText}\n}`;
                    const blob = new Blob([rtfContent], { type: 'application/rtf' });
                    saveAs(blob, `pdf_text_${Date.now()}.rtf`);
                    info.innerHTML = `<i class="fas fa-check-circle"></i> Success! Extracted text from ${numPages} pages as RTF (Word compatible).`;
                }
                
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Text extraction failed: ${e.message}`;
                info.className = 'error';
            } finally {
                textConvertBtn.disabled = false;
                textConvertBtn.innerHTML = '<i class="fas fa-file-export"></i> EXTRACT TEXT';
            }
        }

        // Initial state
        textConvertBtn.disabled = true;
    
