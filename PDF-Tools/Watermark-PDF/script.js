      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      // Elements
      const dropZone = document.getElementById("dropZone");
      const fileInput = document.getElementById("fileInput");
      const info = document.getElementById("info");
      const fileNameDiv = document.getElementById("fileName");
      const watermarkOptions = document.getElementById("watermarkOptions");
      const downloadBtn = document.getElementById("downloadBtn");
      const previewCanvas = document.getElementById("previewCanvas");
      const textColorPreview = document.getElementById("textColorPreview");

      // Watermark type elements
      const textWatermarkType = document.getElementById("textWatermarkType");
      const imageWatermarkType = document.getElementById("imageWatermarkType");

      // Watermark options
      const watermarkText = document.getElementById("watermarkText");
      const fontSize = document.getElementById("fontSize");
      const textColor = document.getElementById("textColor");
      const opacity = document.getElementById("opacity");
      const rotation = document.getElementById("rotation");
      const position = document.getElementById("position");

      let pdfDoc = null;
      let originalFile = null;
      let watermarkType = "text"; // 'text' or 'image'

      // Set up color preview
      textColor.addEventListener("input", () => {
        textColorPreview.style.backgroundColor = textColor.value;
      });

      // Watermark type selection
      textWatermarkType.addEventListener("click", () => {
        textWatermarkType.classList.add("active");
        imageWatermarkType.classList.remove("active");
        watermarkType = "text";
        document.querySelector(".options-grid").style.display = "grid";
      });

      imageWatermarkType.addEventListener("click", () => {
        imageWatermarkType.classList.add("active");
        textWatermarkType.classList.remove("active");
        watermarkType = "image";
        document.querySelector(".options-grid").style.display = "none";
        info.innerHTML =
          '<i class="fas fa-info-circle"></i> Image watermark functionality coming soon. Currently only text watermarks are supported.';
        info.className = "";
      });

      // Drag-drop events
      fileInput.addEventListener("change", loadFile);
      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
      dropZone.addEventListener("dragleave", () =>
        dropZone.classList.remove("dragover")
      );
      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file && file.type === "application/pdf") {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          loadFile({ target: fileInput });
        }
      });

      async function loadFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        dropZone.querySelector("span").textContent = "Processing...";
        fileNameDiv.textContent = file.name;
        info.textContent = "Loading PDF...";
        info.className = "";

        try {
          // Store the original file to avoid ArrayBuffer detachment issues
          originalFile = file;
          const arrayBuffer = await file.arrayBuffer();
          pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;

          info.innerHTML = `<i class="fas fa-check"></i> Loaded PDF with ${pdfDoc.numPages} pages!`;
          info.className = "success";

          watermarkOptions.style.display = "block";
          downloadBtn.disabled = false;

          // Show initial preview
          await previewWatermark();
        } catch (e) {
          info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Couldn't load PDF: ${e.message}`;
          info.className = "error";
          pdfDoc = null;
          watermarkOptions.style.display = "none";
        } finally {
          dropZone.querySelector("span").textContent =
            "Drop your PDF here or click to browse";
        }
      }

      async function previewWatermark() {
        if (!pdfDoc) return;

        try {
          info.textContent = "Generating preview...";
          info.className = "";

          // Get the first page
          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });

          // Set canvas dimensions
          previewCanvas.width = viewport.width;
          previewCanvas.height = viewport.height;

          const context = previewCanvas.getContext("2d");

          // Render the PDF page
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          await page.render(renderContext).promise;

          // Draw watermark preview
          if (watermarkType === "text") {
            drawTextWatermark(
              context,
              previewCanvas.width,
              previewCanvas.height
            );
          } else {
            // Image watermark placeholder
            drawImageWatermarkPlaceholder(
              context,
              previewCanvas.width,
              previewCanvas.height
            );
          }

          info.innerHTML = '<i class="fas fa-check"></i> Preview updated!';
          info.className = "success";
        } catch (e) {
          info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Preview failed: ${e.message}`;
          info.className = "error";
        }
      }

      function drawTextWatermark(context, width, height) {
        const text = watermarkText.value || "WATERMARK";
        const size = parseInt(fontSize.value) || 50;
        const color = textColor.value || "#ff0000";
        const alpha = parseFloat(opacity.value) || 0.3;
        const angle = ((parseFloat(rotation.value) || 45) * Math.PI) / 180;
        const pos = position.value || "center";

        context.save();
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.font = `${size}px Arial`;
        context.textAlign = "center";
        context.textBaseline = "middle";

        let x, y;

        switch (pos) {
          case "center":
            x = width / 2;
            y = height / 2;
            break;
          case "top-left":
            x = width * 0.2;
            y = height * 0.2;
            context.textAlign = "left";
            break;
          case "top-right":
            x = width * 0.8;
            y = height * 0.2;
            context.textAlign = "right";
            break;
          case "bottom-left":
            x = width * 0.2;
            y = height * 0.8;
            context.textAlign = "left";
            break;
          case "bottom-right":
            x = width * 0.8;
            y = height * 0.8;
            context.textAlign = "right";
            break;
          case "tile":
            // For preview, just show one instance in center
            x = width / 2;
            y = height / 2;
            break;
          default:
            x = width / 2;
            y = height / 2;
        }

        context.translate(x, y);
        context.rotate(angle);
        context.fillText(text, 0, 0);
        context.restore();
      }

      function drawImageWatermarkPlaceholder(context, width, height) {
        // Draw a placeholder for image watermark
        context.save();
        context.globalAlpha = 0.5;
        context.fillStyle = "#94a3b8";
        context.font = "20px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("Image Watermark Preview", width / 2, height / 2);
        context.restore();
      }

      async function downloadWatermarkedPDF() {
        if (!originalFile) {
          info.innerHTML =
            '<i class="fas fa-exclamation-triangle"></i> No PDF loaded!';
          info.className = "error";
          return;
        }

        downloadBtn.disabled = true;
        downloadBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Adding Watermark...';
        info.textContent = "Adding watermark to PDF...";
        info.className = "";

        try {
          // Create a fresh ArrayBuffer from the original file each time
          const arrayBuffer = await originalFile.arrayBuffer();

          // Use PDFLib to add watermark
          const { PDFDocument, rgb, StandardFonts } = PDFLib;
          const pdfDoc = await PDFDocument.load(arrayBuffer);

          const pages = pdfDoc.getPages();
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

          const text = watermarkText.value || "WATERMARK";
          const size = parseInt(fontSize.value) || 50;
          const color = textColor.value || "#ff0000";
          const alpha = parseFloat(opacity.value) || 0.3;
          const angle = parseFloat(rotation.value) || 45;
          const pos = position.value || "center";

          // Convert hex color to RGB
          const r = parseInt(color.substr(1, 2), 16) / 255;
          const g = parseInt(color.substr(3, 2), 16) / 255;
          const b = parseInt(color.substr(5, 2), 16) / 255;
          const pdfColor = rgb(r, g, b);

          // Add watermark to each page
          for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const { width, height } = page.getSize();

            if (pos === "tile") {
              // Tile watermark across the page
              const spacing = size * 3;
              for (let x = 0; x < width; x += spacing) {
                for (let y = 0; y < height; y += spacing) {
                  page.drawText(text, {
                    x: x,
                    y: y,
                    size: size,
                    font: font,
                    color: pdfColor,
                    opacity: alpha,
                    rotate: PDFLib.degrees(angle),
                  });
                }
              }
            } else {
              // Single watermark
              let x, y;

              switch (pos) {
                case "center":
                  x = width / 2;
                  y = height / 2;
                  break;
                case "top-left":
                  x = width * 0.2;
                  y = height * 0.8;
                  break;
                case "top-right":
                  x = width * 0.8;
                  y = height * 0.8;
                  break;
                case "bottom-left":
                  x = width * 0.2;
                  y = height * 0.2;
                  break;
                case "bottom-right":
                  x = width * 0.8;
                  y = height * 0.2;
                  break;
                default:
                  x = width / 2;
                  y = height / 2;
              }

              page.drawText(text, {
                x: x,
                y: y,
                size: size,
                font: font,
                color: pdfColor,
                opacity: alpha,
                rotate: PDFLib.degrees(angle),
                xSkew: PDFLib.degrees(0),
                ySkew: PDFLib.degrees(0),
              });
            }
          }

          // Save the watermarked PDF
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = `watermarked_pdf_${Date.now()}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          info.innerHTML =
            '<i class="fas fa-check-circle"></i> Success! Watermarked PDF downloaded!';
          info.className = "success";
        } catch (e) {
          info.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Watermarking failed: ${e.message}`;
          info.className = "error";
          console.error("Watermarking error:", e);
        } finally {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML =
            '<i class="fas fa-download"></i> Download Watermarked PDF';
        }
      }

      // Initial state
      downloadBtn.disabled = true;
    
