# Web File Transfer Tool - Cloudflare Workers & R2
A simple web interface template for transferring files via Cloudflare Workers &amp; R2 Bucket

**Pre-Req:** Cloudflare R2 Bucket; preferrably a custom domain on your Cloudflare.

### How to setup:

Clone or copy this Git; then adjust the wrangler.toml with your R2 Bucket name on line 10, adjust the name variable with your Worker name.

On index,js, within "function getUploadHTML()" is the HTML Page, I recommend going through and updating it, like the Title, Favicon and Region Message.

On Cloudflare, make a new worker, upload or link the repo for your wrangler and index.js.

Leave the build command as "npx wrangler deploy"

### Custom Domain

After deployment, on your Worker, go to Settings > Domains & Routes > Add > Add the custom domain you want.

### Security

I'd recommend you enable Cloudflare Access with a policy setup for this, block regions you don't want / log in requirement or service auth logging. Up to you :)

### Data Retention

Script is meant to keep the data for one hour, but I recommend making sure you enable lifecycle retention on the bucket itself to make it as low as you want it.
