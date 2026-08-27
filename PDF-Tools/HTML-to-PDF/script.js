        // Templates
        function loadTemplate(type) {
            let template = '';
            
            switch(type) {
                case 'basic':
                    template = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 30px; line-height: 1.6; }
        h1 { color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
        h2 { color: #64748b; margin-top: 20px; }
        p { margin: 15px 0; }
    </style>
</head>
<body>
    <h1>Document Title</h1>
    <h2>Section 1</h2>
    <p>Your content here...</p>
    <h2>Section 2</h2>
    <p>More content...</p>
</body>
</html>`;
                    break;
                
                case 'invoice':
                    template = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 30px; }
        .header { text-align: center; margin-bottom: 30px; }
        .company { font-size: 24px; font-weight: bold; color: #2563eb; }
        .invoice-info { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #2563eb; color: white; }
        .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="company">Your Company Name</div>
        <div>Invoice #12345</div>
    </div>
    <div class="invoice-info">
        <strong>Date:</strong> January 1, 2024<br>
        <strong>To:</strong> Customer Name
    </div>
    <table>
        <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
        </tr>
        <tr>
            <td>Item 1</td>
            <td>2</td>
            <td>$50.00</td>
            <td>$100.00</td>
        </tr>
        <tr>
            <td>Item 2</td>
            <td>1</td>
            <td>$75.00</td>
            <td>$75.00</td>
        </tr>
    </table>
    <div class="total">Total: $175.00</div>
</body>
</html>`;
                    break;
                
                case 'resume':
                    template = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 30px; line-height: 1.6; }
        .name { font-size: 28px; font-weight: bold; color: #2563eb; }
        .contact { color: #64748b; margin-bottom: 20px; }
        .section { margin: 20px 0; }
        .section-title { font-size: 20px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 10px; }
        .job-title { font-weight: bold; }
        .date { color: #64748b; font-style: italic; }
    </style>
</head>
<body>
    <div class="name">Your Name</div>
    <div class="contact">email@example.com | (123) 456-7890</div>
    
    <div class="section">
        <div class="section-title">Experience</div>
        <div class="job-title">Job Title - Company Name</div>
        <div class="date">January 2020 - Present</div>
        <p>Job description and responsibilities...</p>
    </div>
    
    <div class="section">
        <div class="section-title">Education</div>
        <div class="job-title">Degree - University Name</div>
        <div class="date">2015 - 2019</div>
    </div>
</body>
</html>`;
                    break;
            }
            
            document.getElementById('htmlContent').value = template;
        }

        // Convert HTML to PDF
        document.getElementById('convertBtn').addEventListener('click', async function() {
            const htmlContent = document.getElementById('htmlContent').value;
            if (!htmlContent.trim()) {
                showStatus('Please enter HTML content', 'error');
                return;
            }

            try {
                showStatus('Converting to PDF... Please wait', 'loading');
                this.disabled = true;

                const pageSize = document.getElementById('pageSize').value;
                const orientation = document.getElementById('orientation').value;
                const margin = parseInt(document.getElementById('margin').value);
                const filename = document.getElementById('filename').value;

                // Create a temporary element
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlContent;
                tempDiv.style.width = '100%';
                document.body.appendChild(tempDiv);

                const opt = {
                    margin: margin,
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: pageSize, orientation: orientation }
                };

                await html2pdf().set(opt).from(tempDiv).save();

                document.body.removeChild(tempDiv);
                showStatus('âœ“ PDF created successfully!', 'success');

            } catch (error) {
                console.error('Error converting to PDF:', error);
                showStatus('Error: ' + error.message, 'error');
            } finally {
                this.disabled = false;
            }
        });

        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = `show ${type}`;
            
            if (type === 'success') {
                setTimeout(() => {
                    status.classList.remove('show');
                }, 5000);
            }
        }
    
