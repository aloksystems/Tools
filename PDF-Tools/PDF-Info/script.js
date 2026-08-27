        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdfFile');
        const statusEl = document.getElementById('status');
        const reportSection = document.getElementById('reportSection');
        const fileCard = document.getElementById('fileCard');
        const docCard = document.getElementById('docCard');
        const metaCard = document.getElementById('metaCard');
        const pageTableBody = document.getElementById('pageTableBody');
        const tableCaption = document.getElementById('tableCaption');
        const downloadJsonBtn = document.getElementById('downloadJsonBtn');

        let latestReport = null;

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

        dropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            dropZone.classList.remove('dragover');
            const file = event.dataTransfer.files[0];
            if (file) {
                processFile(file);
            }
        });

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                processFile(file);
            }
        });

        downloadJsonBtn.addEventListener('click', () => {
            if (!latestReport) return;

            const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${latestReport.file.name.replace(/\.pdf$/i, '') || 'pdf'}_report.json`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        });

        async function processFile(file) {
            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                showStatus('Please upload a valid PDF file.', 'error');
                return;
            }

            showStatus('Analyzing PDF... Please wait.', 'loading');
            reportSection.style.display = 'none';
            downloadJsonBtn.disabled = true;

            try {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;
                const metadata = await readMetadata(pdf);
                const pageDetails = await readPageDetails(pdf);

                const portraitPages = pageDetails.filter((page) => page.orientation === 'Portrait').length;
                const landscapePages = pageDetails.length - portraitPages;

                latestReport = {
                    file: {
                        name: file.name,
                        sizeBytes: file.size,
                        sizeReadable: formatFileSize(file.size),
                        lastModified: new Date(file.lastModified).toISOString()
                    },
                    document: {
                        pageCount: pdf.numPages,
                        portraitPages,
                        landscapePages
                    },
                    metadata,
                    pages: pageDetails
                };

                renderReport(latestReport);
                showStatus('PDF analysis completed successfully.', 'success');
                reportSection.style.display = 'block';
                downloadJsonBtn.disabled = false;
            } catch (error) {
                console.error('Failed to analyze PDF:', error);
                showStatus('Could not read this PDF: ' + error.message, 'error');
            }
        }

        async function readMetadata(pdf) {
            try {
                const result = await pdf.getMetadata();
                const info = result.info || {};
                return {
                    title: info.Title || 'N/A',
                    author: info.Author || 'N/A',
                    subject: info.Subject || 'N/A',
                    keywords: info.Keywords || 'N/A',
                    creator: info.Creator || 'N/A',
                    producer: info.Producer || 'N/A',
                    creationDate: info.CreationDate || 'N/A',
                    modificationDate: info.ModDate || 'N/A'
                };
            } catch (error) {
                return {
                    title: 'N/A',
                    author: 'N/A',
                    subject: 'N/A',
                    keywords: 'N/A',
                    creator: 'N/A',
                    producer: 'N/A',
                    creationDate: 'N/A',
                    modificationDate: 'N/A'
                };
            }
        }

        async function readPageDetails(pdf) {
            const details = [];
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 1 });
                details.push({
                    page: pageNumber,
                    width: Number(viewport.width.toFixed(2)),
                    height: Number(viewport.height.toFixed(2)),
                    orientation: viewport.width >= viewport.height ? 'Landscape' : 'Portrait',
                    rotation: page.rotate || 0
                });
            }
            return details;
        }

        function renderReport(report) {
            fileCard.innerHTML = `
                <h3><i class="fas fa-file-pdf"></i> File Details</h3>
                ${statsRow('Name', report.file.name)}
                ${statsRow('Size', report.file.sizeReadable)}
                ${statsRow('Updated', new Date(report.file.lastModified).toLocaleString())}
            `;

            docCard.innerHTML = `
                <h3><i class="fas fa-layer-group"></i> Document Stats</h3>
                ${statsRow('Total Pages', report.document.pageCount)}
                ${statsRow('Portrait Pages', report.document.portraitPages)}
                ${statsRow('Landscape Pages', report.document.landscapePages)}
            `;

            metaCard.innerHTML = `
                <h3><i class="fas fa-tags"></i> Metadata</h3>
                ${statsRow('Title', report.metadata.title)}
                ${statsRow('Author', report.metadata.author)}
                ${statsRow('Subject', report.metadata.subject)}
                ${statsRow('Creator', report.metadata.creator)}
            `;

            const rows = report.pages.map((page) => `
                <tr>
                    <td>${page.page}</td>
                    <td>${page.width}</td>
                    <td>${page.height}</td>
                    <td>${page.orientation}</td>
                    <td>${page.rotation}Â°</td>
                </tr>
            `).join('');

            pageTableBody.innerHTML = rows;
            tableCaption.textContent = `Showing ${report.pages.length} page metrics.`;
        }

        function statsRow(label, value) {
            return `<div class="stats-row"><span>${label}</span><span>${escapeHtml(String(value))}</span></div>`;
        }

        function showStatus(message, type) {
            statusEl.textContent = message;
            statusEl.className = `status show ${type}`;
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const units = ['Bytes', 'KB', 'MB', 'GB'];
            const index = Math.floor(Math.log(bytes) / Math.log(1024));
            const value = bytes / Math.pow(1024, index);
            return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    
