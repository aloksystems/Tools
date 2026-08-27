        const { PDFDocument } = PDFLib;

        let selectedFile = null;
        let isProtected = false;
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdfFile');
        const fileInfo = document.getElementById('fileInfo');
        const unlockBtn = document.getElementById('unlockBtn');
        const status = document.getElementById('status');
        const passwordSection = document.getElementById('passwordSection');
        const pdfPassword = document.getElementById('pdfPassword');

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
            
            // Check if PDF is password protected
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                
                isProtected = false;
                document.getElementById('protectionStatus').innerHTML = 
                    '<strong>Protection:</strong> <span style="color: #10b981;">âœ“ No password</span>';
                passwordSection.classList.remove('show');
                unlockBtn.disabled = false;
                
            } catch (error) {
                // If error, likely password protected
                isProtected = true;
                document.getElementById('protectionStatus').innerHTML = 
                    '<strong>Protection:</strong> <span style="color: #dc2626;">ðŸ”’ Password protected</span>';
                passwordSection.classList.add('show');
                unlockBtn.disabled = true;
            }
            
            fileInfo.classList.add('show');
        }

        pdfPassword.addEventListener('input', () => {
            if (isProtected) {
                unlockBtn.disabled = pdfPassword.value.trim().length === 0;
            }
        });

        unlockBtn.addEventListener('click', unlockPDF);

        async function unlockPDF() {
            if (!selectedFile) {
                showStatus('Please select a PDF file first', 'error');
                return;
            }

            try {
                showStatus('Unlocking PDF... Please wait', 'loading');
                unlockBtn.disabled = true;

                const arrayBuffer = await selectedFile.arrayBuffer();
                let pdfDoc;

                if (isProtected) {
                    const password = pdfPassword.value.trim();
                    if (!password) {
                        showStatus('Please enter the PDF password', 'error');
                        unlockBtn.disabled = false;
                        return;
                    }

                    try {
                        pdfDoc = await PDFDocument.load(arrayBuffer, { 
                            password: password,
                            ignoreEncryption: false 
                        });
                    } catch (error) {
                        showStatus('âŒ Incorrect password. Please try again.', 'error');
                        unlockBtn.disabled = false;
                        return;
                    }
                } else {
                    pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                }

                // Save without encryption
                const pdfBytes = await pdfDoc.save();

                // Download the unlocked PDF
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedFile.name.replace('.pdf', '_unlocked.pdf');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showStatus('âœ“ PDF unlocked and downloaded successfully!', 'success');
                
                // Reset
                setTimeout(() => {
                    fileInfo.classList.remove('show');
                    passwordSection.classList.remove('show');
                    selectedFile = null;
                    fileInput.value = '';
                    pdfPassword.value = '';
                    unlockBtn.disabled = true;
                }, 2000);

            } catch (error) {
                console.error('Error unlocking PDF:', error);
                showStatus('Error: ' + error.message, 'error');
                unlockBtn.disabled = false;
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

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }
    
