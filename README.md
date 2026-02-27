# Prerequisites

* Docker

# Run the project

### DEV

From the root directory run `docker compose up -d`

To shut down the project use: `docker compose down`


### Production
For Production run `docker build -t smartburgas-map .`


### Pull & Run docker image

1. Pull the latest image from GitHub<br>
`docker pull ghcr.io/vpramatarov/smartburgas-map:master`

2. Stop and remove the old container (if running)<br>
`docker stop smartburgas-map || true`
`docker rm smartburgas-map || true`

3. Run the new image
<br>Make sure to pass in your .env variables or mount an env file<br>
`docker run -d --name smartburgas-map -p 3000:3000 --env-file .env ghcr.io/vpramatarov/smartburgas-map:master`


### Sending/receiving postMessage communication via iframe to/from underlying map.

Website where iframe is integrated sample code (HTML/JS):

```html
<iframe id="smart-burgas-map" src="https://url.to.map" width="100%" height="600" style="border:none;"></iframe>

<button onclick="changeMapLanguage('en')">Switch Map to English</button>
<button onclick="toggleMapLayer('toggle-traffic', false)">Hide Traffic Layer</button>

<script>
    const mapIframe = document.getElementById('smart-burgas-map');

    // 1. Send Commands TO the Map
    function changeMapLanguage(lang) {
        mapIframe.contentWindow.postMessage({ 
            action: 'SET_LANGUAGE', 
            payload: lang 
        }, '*');
    }

    function toggleMapLayer(layerId, isVisible) {
        mapIframe.contentWindow.postMessage({ 
            action: 'SET_LAYER', 
            payload: { layerId: layerId, visible: isVisible } 
        }, '*');
    }

    // 2. Listen for Events FROM the Map
    window.addEventListener('message', (event) => {
        const msg = event.data;
        
        if (msg.event === 'MAP_READY') {
            console.log("The interactive map has finished loading!");
        } else if (msg.event === 'SENSOR_SELECTED') {
            console.log("User clicked a sensor:", msg.payload.name);
        }
    });
</script>
```


### Run tests inside container

run inside docker container.

1. Backend & API tests: run `npm test`
2. E2E tests
   * Install dependencies: run `npx playwright install chromium` & `npx playwright install-deps chromium`
   * Run tests: `npm run test:e2e` or `npx playwright test e2e/app.spec.ts --trace on` to generate trace files in `test-results` folder.