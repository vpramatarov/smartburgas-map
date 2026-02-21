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