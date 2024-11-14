const express = require('express');
const { ExpressPeerServer } = require('peer');
const https = require('https');
const fs = require('fs');

const app = express();
const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};
const server = https.createServer(options, app);

const peerServer = ExpressPeerServer(server, {
  debug: true
});

app.use('/myapp', peerServer);

server.listen(3001, '0.0.0.0', () => {
  console.log(`PeerJS server is running on port 3001`);
});