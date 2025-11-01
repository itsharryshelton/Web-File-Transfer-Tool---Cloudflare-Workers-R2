export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // 1. Serve the HTML upload page
      if (pathname === "/" && request.method === "GET") {
        return new Response(getUploadHTML(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // 2. Handle the file upload
      if (pathname === "/upload" && request.method === "POST") {
        // Get the file from the form data
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return new Response("No file uploaded.", { status: 400 });
        }

        // Generate a unique key for the file
        const key = `${crypto.randomUUID()}/${file.name}`;

        // Set the 1-hour expiry time
        const expiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now

        // Upload the file to R2
        await env.FILE_BUCKET.put(key, file.stream(), {
          // This is the magic! R2 will automatically delete the object after this time
          deleteAfter: expiry,
          // Store the file's content type (e.g., "image/png")
          httpMetadata: {
            contentType: file.type,
          },
          // Store the original filename for the download
          customMetadata: {
            originalFilename: file.name,
          },
        });

        // Create the shareable URL
        const shareableUrl = `${url.origin}/file/${key}`;

        // Return the URL to the user
        return new Response(JSON.stringify({ success: true, url: shareableUrl }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // 3. Handle the file download
      if (pathname.startsWith("/file/") && request.method === "GET") {
        // Extract the key from the URL (e.g., "file/abc/image.png" -> "abc/image.png")
        const key = pathname.substring("/file/".length);

        // Get the object from R2
        const object = await env.FILE_BUCKET.get(key);

        if (object === null) {
          return new Response("File not found or has expired.", { status: 404 });
        }

        // Set headers for the download response
        const headers = new Headers();
        // Set Content-Type from the stored httpMetadata
        object.writeHttpMetadata(headers);
        
        // Get the original filename from customMetadata
        const filename = object.customMetadata?.originalFilename || "downloaded-file";
        
        // Tell the browser to download the file instead of displaying it
        headers.set("Content-Disposition", `attachment; filename="${filename}"`);

        // Stream the file body back to the client
        return new Response(object.body, {
          headers: headers,
        });
      }

      return new Response("Not found.", { status: 404 });

    } catch (error) {
      console.error(error);
      return new Response("An internal error occurred.", { status: 500 });
    }
  },
};

/**
 * Returns the HTML for the upload page.
 * This is served from the Worker itself.
 */
function getUploadHTML() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Web File Share</title>
      <link rel="icon" href="Favicon.ico" type="image/x-icon">
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; }
        .upload-box { transition: all 0.3s ease; }
        .upload-box:hover { 
          box-shadow: 0 0 15px 5px rgba(59, 130, 246, 0.2); 
          border-color: #3B82F6; /* hover:border-blue-500 */
          background-color: #EFF6FF; /* hover:bg-blue-100 */
        }
        #appAlert {
          transition: transform 0.3s ease-out;
          transform: translateY(-150%);
        }
        #appAlert.show {
          transform: translateY(0);
        }
      </style>
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center min-h-screen">
      
      <!-- Custom Alert Box -->
      <div id="appAlert" class="fixed top-0 left-0 right-0 p-4 z-50">
        <div id="appAlertContent" class="max-w-md mx-auto rounded-lg shadow-lg p-4 text-white font-medium text-center">
          <!-- Content injected by JS -->
        </div>
      </div>

      <div class="bg-white p-8 md:p-12 rounded-2xl shadow-2xl max-w-lg w-full m-4">
        
        <div class="flex flex-col items-center mb-6">
          <svg class="w-16 h-16 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.33-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
          </svg>
          <h1 class="text-3xl font-bold text-gray-900 mt-4">Share a File Temporarily</h1>
          <p class="text-gray-600 mt-2">Upload a file and get a link. The link will expire in <span class="font-semibold text-blue-600">1 hour</span>.</p>
          <p class="text-gray-600 mt-2">Data is stored within REGION X.</p>
        </div>
        
        
        <form id="uploadForm" class="space-y-6">
          <div>
            <div id="dropZone" class="upload-box flex justify-center items-center w-full h-48 px-6 py-10 border-2 border-blue-400 border-dashed rounded-xl bg-blue-50 cursor-pointer">
              <div class="text-center">
                <svg class="mx-auto h-12 w-12 text-blue-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <p id="dropText" class="mt-3 text-sm text-gray-600">
                  <span class="font-semibold text-blue-600">Drag and drop</span> or <span class="font-semibold text-blue-600">click to upload</span>
                </p>
                <p class="text-xs text-gray-500 mt-1">Max file size: 100MB</p>
              </div>
            </div>
            <input type="file" id="fileInput" class="hidden" required>
          </div>
          
          <button type="submit" id="uploadButton" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 transform transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
            <span id="buttonText">Upload</span>
            <svg id="buttonSpinner" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        </form>
        
        <!-- This section will show the response -->
        <div id="result" class="mt-6 hidden">
          <label class="block text-sm font-medium text-gray-700">Your link:</label>
          <div class="mt-2 flex rounded-lg shadow-sm">
            <input type="text" id="shareUrl" class="flex-1 block w-full min-w-0 rounded-none rounded-l-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-3 bg-gray-50" readonly>
            <button id="copyButton" class="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium">
              Copy
            </button>
          </div>
          <p id="copyFeedback" class="text-green-600 text-sm mt-2 hidden">Copied to clipboard!</p>
        </div>
      </div>

      <script>
        const form = document.getElementById('uploadForm');
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        const dropText = document.getElementById('dropText');
        const uploadButton = document.getElementById('uploadButton');
        const buttonText = document.getElementById('buttonText');
        const buttonSpinner = document.getElementById('buttonSpinner');
        const resultDiv = document.getElementById('result');
        const shareUrlInput = document.getElementById('shareUrl');
        const copyButton = document.getElementById('copyButton');
        const copyFeedback = document.getElementById('copyFeedback');
        const appAlert = document.getElementById('appAlert');
        const appAlertContent = document.getElementById('appAlertContent');
        let alertTimeout;

        // --- Custom Alert ---
        function showAppAlert(message, isError = false) {
          clearTimeout(alertTimeout);
          appAlertContent.textContent = message;
          if (isError) {
            appAlertContent.className = "max-w-md mx-auto rounded-lg shadow-lg p-4 text-white font-medium text-center bg-red-500";
          } else {
            appAlertContent.className = "max-w-md mx-auto rounded-lg shadow-lg p-4 text-white font-medium text-center bg-green-500";
          }
          appAlert.classList.add('show');
          alertTimeout = setTimeout(() => {
            appAlert.classList.remove('show');
          }, 3000);
        }

        // --- Drag and Drop Logic ---
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          dropZone.addEventListener(eventName, preventDefaults, false);
          document.body.addEventListener(eventName, preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
          dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
          dropZone.addEventListener(eventName, unhighlight, false);
        });

        dropZone.addEventListener('drop', handleDrop, false);
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect, false);

        function preventDefaults(e) {
          e.preventDefault();
          e.stopPropagation();
        }

        function highlight() {
          dropZone.classList.add('border-blue-500', 'bg-blue-100');
        }

        function unhighlight() {
          dropZone.classList.remove('border-blue-500', 'bg-blue-100');
        }

        function handleDrop(e) {
          const dt = e.dataTransfer;
          const files = dt.files;
          handleFiles(files);
        }
        
        function handleFileSelect(e) {
          handleFiles(e.target.files);
        }

        function handleFiles(files) {
          if (files.length > 0) {
            fileInput.files = files; // Set the input's files property
            dropText.textContent = files[0].name;
            dropZone.classList.add('border-green-500', 'bg-green-50');
            dropZone.classList.remove('border-blue-400', 'bg-blue-50');
          }
        }

        // --- Form Submission Logic ---
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          if (!fileInput.files || fileInput.files.length === 0) {
            showAppAlert('Please select a file to upload.', true);
            return;
          }

          // Show loading state
          uploadButton.disabled = true;
          buttonText.textContent = 'Uploading...';
          buttonSpinner.classList.remove('hidden');

          const formData = new FormData();
          formData.append('file', fileInput.files[0]);

          try {
            const response = await fetch('/upload', {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(\`Upload failed: \${errorText}\`);
            }

            const result = await response.json();
            
            if (result.success) {
              shareUrlInput.value = result.url;
              resultDiv.classList.remove('hidden');
              copyFeedback.classList.add('hidden');
            } else {
              throw new Error('Upload failed. Server did not return a URL.');
            }

          } catch (error) {
            console.error(error);
            showAppAlert(error.message, true);
          } finally {
            // Hide loading state
            uploadButton.disabled = false;
            buttonText.textContent = 'Upload';
            buttonSpinner.classList.add('hidden');
          }
        });

        // --- Copy to Clipboard Logic ---
        copyButton.addEventListener('click', () => {
          shareUrlInput.select();
          try {
            document.execCommand('copy'); // Use execCommand as fallback
            copyFeedback.classList.remove('hidden');
            setTimeout(() => copyFeedback.classList.add('hidden'), 2000);
          } catch (err) {
            console.error('Failed to copy text: ', err);
            showAppAlert('Failed to copy. Please copy manually.', true);
          }
        });
      </script>
    </body>
    </html>
  `;
}
