        const { PDFDocument } = PDFLib;

        let selectedFile = null;
        let pdfDoc = null;
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdfFile');
        const fileInfo = document.getElementById('fileInfo');
        const saveBtn = document.getElementById('saveBtn');
        const status = document.getElementById('status');
        const metadataSection = document.getElementById('metadataSection');

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
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = formatFileSize(file.size);
            fileInfo.classList.add('show');

            try {
                showStatus('Loading PDF metadata...', 'loading');
                const arrayBuffer = await file.arrayBuffer();
                pdfDoc = await PDFDocument.load(arrayBuffer);

                // Extract current metadata
                const title = pdfDoc.getTitle() || '';
                const author = pdfDoc.getAuthor() || '';
                const subject = pdfDoc.getSubject() || '';
                const keywords = pdfDoc.getKeywords() || '';
                const creator = pdfDoc.getCreator() || '';
                const producer = pdfDoc.getProducer() || '';
                const creationDate = pdfDoc.getCreationDate();
                const modDate = pdfDoc.getModificationDate();

                // Populate form with current values
                document.getElementById('title').value = title;
                document.getElementById('author').value = author;
                document.getElementById('subject').value = subject;
                document.getElementById('keywords').value = keywords;
                document.getElementById('creator').value = creator || producer;

                if (creationDate) {
                    document.getElementById('creationDate').value = formatDateForInput(creationDate);
                }
                if (modDate) {
                    document.getElementById('modificationDate').value = formatDateForInput(modDate);
                }

                // Show current values
                document.getElementById('currentTitle').textContent = title ? `Current: ${title}` : 'Current: (none)';
                document.getElementById('currentAuthor').textContent = author ? `Current: ${author}` : 'Current: (none)';
                document.getElementById('currentSubject').textContent = subject ? `Current: ${subject}` : 'Current: (none)';
                document.getElementById('currentKeywords').textContent = keywords ? `Current: ${keywords}` : 'Current: (none)';
                document.getElementById('currentCreator').textContent = (creator || producer) ? `Current: ${creator || producer}` : 'Current: (none)';
                document.getElementById('currentCreationDate').textContent = creationDate ? `Current: ${formatDateReadable(creationDate)}` : 'Current: (none)';
                document.getElementById('currentModDate').textContent = modDate ? `Current: ${formatDateReadable(modDate)}` : 'Current: (none)';

                metadataSection.classList.add('show');
                saveBtn.disabled = false;
                showStatus('âœ“ PDF loaded successfully. Edit metadata below.', 'success');

            } catch (error) {
                console.error('Error loading PDF:', error);
                showStatus('Error loading PDF: ' + error.message, 'error');
            }
        }

        saveBtn.addEventListener('click', saveMetadata);

        async function saveMetadata() {
            if (!pdfDoc) {
                showStatus('Please select a PDF file first', 'error');
                return;
            }

            try {
                showStatus('Saving metadata... Please wait', 'loading');
                saveBtn.disabled = true;

                // Set metadata
                const title = document.getElementById('title').value.trim();
                const author = document.getElementById('author').value.trim();
                const subject = document.getElementById('subject').value.trim();
                const keywords = document.getElementById('keywords').value.trim();
                const creator = document.getElementById('creator').value.trim();
                const creationDate = document.getElementById('creationDate').value;
                const modDate = document.getElementById('modificationDate').value;

                if (title) pdfDoc.setTitle(title);
                if (author) pdfDoc.setAuthor(author);
                if (subject) pdfDoc.setSubject(subject);
                if (keywords) pdfDoc.setKeywords(keywords.split(',').map(k => k.trim()));
                if (creator) {
                    pdfDoc.setCreator(creator);
                    pdfDoc.setProducer(creator);
                }
                
                if (creationDate) {
                    pdfDoc.setCreationDate(new Date(creationDate));
                }
                if (modDate) {
                    pdfDoc.setModificationDate(new Date(modDate));
                }

                // Save PDF
                const pdfBytes = await pdfDoc.save();

                // Download
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedFile.name.replace('.pdf', '_metadata.pdf');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showStatus('âœ“ Metadata saved and downloaded successfully!', 'success');

            } catch (error) {
                console.error('Error saving metadata:', error);
                showStatus('Error: ' + error.message, 'error');
            } finally {
                saveBtn.disabled = false;
            }
        }

        function formatDateForInput(date) {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function formatDateReadable(date) {
            return new Date(date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
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

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }
    
