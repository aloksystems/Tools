        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const info = document.getElementById('info');
        const imageConvertBtn = document.getElementById('imageConvertBtn');
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
                imageConvertBtn.disabled = false;
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Couldn't load PDF: ${e.message}`;
                info.className = 'error';
                imageConvertBtn.disabled = true;
                pdfDoc = null;
            } finally {
                dropZone.querySelector('span').textContent = 'Drop your PDF here or click to browse';
            }
        }

        async function convertToImages() {
            if (!pdfDoc) {
                info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Select a PDF first!';
                info.className = 'error';
                return;
            }

            const format = document.querySelector('input[name="imageFormat"]:checked').value;
            const quality = parseFloat(document.getElementById('jpegQuality').value);
            const scale = parseFloat(document.getElementById('scale').value);

            imageConvertBtn.disabled = true;
            imageConvertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting to Images...';
            info.textContent = 'Converting PDF pages to images...';
            info.className = '';

            try {
                const zip = new JSZip();
                const numPages = pdfDoc.numPages;

                for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                    const page = await pdfDoc.getPage(pageNum);
                    const viewport = page.getViewport({ scale });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport }).promise;

                    let imgData;
                    if (format === 'jpeg') {
                        imgData = canvas.toDataURL('image/jpeg', quality);
                    } else {
                        imgData = canvas.toDataURL('image/png');
                    }

                    const base64Data = imgData.replace(/^data:image\/\w+;base64,/, '');
                    const binary = atob(base64Data);
                    const array = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        array[i] = binary.charCodeAt(i);
                    }
                    
                    const extension = format === 'jpeg' ? 'jpg' : 'png';
                    zip.file(`page_${pageNum.toString().padStart(3, '0')}.${extension}`, array);
                }

                const zipBlob = await zip.generateAsync({ type: 'blob' });
                saveAs(zipBlob, `pdf_images_${Date.now()}.zip`);
                info.innerHTML = `<i class="fas fa-check-circle"></i> Success! Converted ${numPages} pages to ${format.toUpperCase()} images in ZIP.`;
                info.className = 'success';
            } catch (e) {
                info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Image conversion failed: ${e.message}`;
                info.className = 'error';
            } finally {
                imageConvertBtn.disabled = false;
                imageConvertBtn.innerHTML = '<i class="fas fa-file-image"></i> CONVERT TO IMAGES (ZIP)';
            }
        }

        // Initial state
        imageConvertBtn.disabled = true;
    
