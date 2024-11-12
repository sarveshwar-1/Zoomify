const socket = io('https://192.168.170.143:3000');

socket.on('connect', () => {
  console.log('Connected to socket server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

const ip = '192.168.170.143';
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined, {
  host: '192.168.170.143',
  port: '3001',
  path: '/myapp',
  secure: true 
});
myPeer.on('open', id => {
  console.log('Connected to PeerJS server with ID:', id);
});

myPeer.on('error', (error) => {
  console.error('PeerJS error:', error);
});
const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};
let stream;
let audioContext;
let source;
let destination;
let biquadFilter;
let filteredStream;
let noiseCancellationEnabled = true;

const chatInput = document.getElementById('chat-message');
const chatDisplay = document.getElementById('chat-display');
const sendButton = document.getElementById('send-button');


sendButton.addEventListener('click', () => {
  const message = chatInput.value;
  if (message) {
    socket.emit('message', message);
    chatInput.value = ''; 
    addMessageToChat('You', message);
  }
});


socket.on('createMessage', (message, userId) => {
  addMessageToChat(userId, message);
});


function addMessageToChat(sender, message) {
  const messageElement = document.createElement('p');
  messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatDisplay.append(messageElement);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}


navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(s => {
  stream = s;
  setupAudioProcessing();
  addVideoStream(myVideo, filteredStream);

  myPeer.on('call', call => {
    call.answer(filteredStream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream);
    });
  });

  socket.on('user-connected', userId => {
    connectToNewUser(userId, filteredStream);
  });
});

socket.on('user-disconnected', userId => {
  if (peers[userId]) peers[userId].close();
});

myPeer.on('open', id => {
  socket.emit('join-room', ROOM_ID, id);
});

function setupAudioProcessing() {
  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(stream);
  destination = audioContext.createMediaStreamDestination();

  biquadFilter = audioContext.createBiquadFilter();
  biquadFilter.type = 'lowshelf';
  biquadFilter.frequency.setValueAtTime(1000, audioContext.currentTime);
  biquadFilter.gain.setValueAtTime(-40, audioContext.currentTime);

  source.connect(biquadFilter);
  biquadFilter.connect(destination);

  filteredStream = new MediaStream();
  filteredStream.addTrack(stream.getVideoTracks()[0]);
  filteredStream.addTrack(destination.stream.getAudioTracks()[0]);
}

function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream);
  const video = document.createElement('video');
  call.on('stream', userVideoStream => {
    addVideoStream(video, userVideoStream);
  });
  call.on('close', () => {
    video.remove();
  });

  peers[userId] = call;
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => {
    video.play();
  });
  videoGrid.append(video);
}

document.getElementById('toggle-mic').addEventListener('click', () => {
  const audioTrack = stream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
});

document.getElementById('toggle-camera').addEventListener('click', () => {
  const videoTrack = stream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
});

document.getElementById('toggle-noise-cancellation').addEventListener('click', () => {
  noiseCancellationEnabled = !noiseCancellationEnabled;
  if (noiseCancellationEnabled) {
    source.connect(biquadFilter);
    biquadFilter.connect(destination);
  } else {
    source.disconnect(biquadFilter);
    source.connect(destination);
  }
});
