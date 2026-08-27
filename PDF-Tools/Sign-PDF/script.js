        const { PDFDocument, rgb } = PDFLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        let selectedFile = null;
        let pdfDoc = null;
        let currentSignatureType = 'draw';
        let signatureDataURL = null;
        let signatureColor = '#000000';
        let signatureFont = 'cursive';
        let isDrawing = false;

        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdfFile');
        const canvas = document.getElementById('signatureCanvas');
        const ctx = canvas.getContext('2d');
        const status = document.getElementById('status');

        // Setup canvas
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

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
            showStatus('PDF loaded successfully. Create your signature below.', 'success');
            document.getElementById('signatureOptions').style.display = 'block';
        }

        // Signature type selection
        document.querySelectorAll('.signature-type').forEach(type => {
            type.addEventListener('click', function() {
                document.querySelectorAll('.signature-type').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                currentSignatureType = this.dataset.type;

                document.getElementById('drawContainer').classList.remove('show');
                document.getElementById('typeContainer').classList.remove('show');

                if (currentSignatureType === 'draw') {
                    document.getElementById('drawContainer').classList.add('show');
                } else {
                    document.getElementById('typeContainer').classList.add('show');
                }
            });
        });

        // Canvas drawing
        let lastX = 0;
        let lastY = 0;

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events
        canvas.addEventListener('touchstart', handleTouch);
        canvas.addEventListener('touchmove', handleTouch);
        canvas.addEventListener('touchend', stopDrawing);

        function startDrawing(e) {
            isDrawing = true;
            [lastX, lastY] = [e.offsetX, e.offsetY];
        }

        function draw(e) {
            if (!isDrawing) return;
            ctx.strokeStyle = signatureColor;
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.stroke();
            [lastX, lastY] = [e.offsetX, e.offsetY];
        }

        function stopDrawing() {
            isDrawing = false;
        }

        function handleTouch(e) {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            if (e.type === 'touchstart') {
                isDrawing = true;
                [lastX, lastY] = [x, y];
            } else if (e.type === 'touchmove' && isDrawing) {
                ctx.strokeStyle = signatureColor;
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(x, y);
                ctx.stroke();
                [lastX, lastY] = [x, y];
            }
        }

        function clearCanvas() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Color selection
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                signatureColor = this.dataset.color;
            });
        });

        // Font selection
        document.querySelectorAll('.font-option').forEach(option => {
            option.addEventListener('click', function() {
                document.querySelectorAll('.font-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                signatureFont = this.dataset.font;
                document.getElementById('signatureText').style.fontFamily = signatureFont;
            });
        });

        // Add signature to PDF
        document.getElementById('addSignatureBtn').addEventListener('click', addSignatureToPDF);

        async function addSignatureToPDF() {
            if (!selectedFile) {
                showStatus('Please select a PDF file first', 'error');
                return;
            }

            try {
                showStatus('Adding signature to PDF...', 'loading');

                // Generate signature image
                let signatureImage;
                if (currentSignatureType === 'draw') {
                    signatureImage = canvas.toDataURL('image/png');
                } else {
                    // Create signature from text
                    const textCanvas = document.createElement('canvas');
                    textCanvas.width = 600;
                    textCanvas.height = 200;
                    const textCtx = textCanvas.getContext('2d');
                    textCtx.fillStyle = 'white';
                    textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
                    textCtx.fillStyle = signatureColor || '#000000';
                    textCtx.font = `60px ${signatureFont}`;
                    textCtx.textAlign = 'center';
                    textCtx.textBaseline = 'middle';
                    textCtx.fillText(document.getElementById('signatureText').value || 'Signature', 300, 100);
                    signatureImage = textCanvas.toDataURL('image/png');
                }

                // Load PDF
                const arrayBuffer = await selectedFile.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);

                // Embed signature
                const signatureImageBytes = await fetch(signatureImage).then(res => res.arrayBuffer());
                const signatureImg = await pdfDoc.embedPng(signatureImageBytes);

                // Add to last page (you can modify this to add on specific page)
                const pages = pdfDoc.getPages();
                const lastPage = pages[pages.length - 1];
                const { width, height } = lastPage.getSize();

                // Position signature at bottom right
                const sigWidth = 150;
                const sigHeight = 50;
                const x = width - sigWidth - 50;
                const y = 50;

                lastPage.drawImage(signatureImg, {
                    x: x,
                    y: y,
                    width: sigWidth,
                    height: sigHeight,
                });

                // Save PDF
                const pdfBytes = await pdfDoc.save();

                // Download
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedFile.name.replace('.pdf', '_signed.pdf');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showStatus('âœ“ PDF signed and downloaded successfully!', 'success');

            } catch (error) {
                console.error('Error signing PDF:', error);
                showStatus('Error: ' + error.message, 'error');
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
    
