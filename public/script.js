

function initializeMeeting() {
    const username = localStorage.getItem('username');
    document.getElementById('username-display').textContent = username;

    const host = window.location.hostname;
    const socket = io(`https://${host}:3000`, {
        reconnectionAttempts: 5,
        timeout: 10000,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to socket server');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
    });

    const videoGrid = document.getElementById('video-grid');
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };
    const peerConnections = {};
    const myVideo = document.createElement('video');
    myVideo.muted = true;
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
            addMessageToChat(username, message);
            socket.emit('createMessage', message, username);
            chatInput.value = ''; 
        }
    });

    // Add keypress event for Enter key
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const message = chatInput.value;
            if (message) {
                // Add message to sender's chat
                addMessageToChat(username, message);
                // Send message to other participants
                socket.emit('createMessage', message, username);
                chatInput.value = '';
            }
        }
    });

    socket.on('createMessage', (message, userId) => {
        console.log('Message received:', message, 'from', userId);
        addMessageToChat(userId, message);
    });

    function addMessageToChat(sender, message) {
        const messageElement = document.createElement('p');
        const isCurrentUser = sender === username;
        messageElement.className = `chat-message ${isCurrentUser ? 'sent' : 'received'}`;
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
        addVideoStream(myVideo, stream, 'me'); // Use original stream for video

        socket.on('user-connected', userId => {
            console.log('User connected:', userId);
            const peerConnection = new RTCPeerConnection(configuration);
            peerConnections[userId] = peerConnection;

            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('candidate', userId, event.candidate);
                }
            };

            // Modified ontrack handling
            let videoAdded = false;
            peerConnection.ontrack = event => {
                if (!videoAdded) {
                    const video = document.createElement('video');
                    addVideoStream(video, event.streams[0], userId);
                    videoAdded = true;
                }
            };

            peerConnection.createOffer().then(offer => {
                peerConnection.setLocalDescription(offer);
                socket.emit('offer', userId, offer);
            });
        });

        socket.on('offer', (userId, offer) => {
            const peerConnection = new RTCPeerConnection(configuration);
            peerConnections[userId] = peerConnection;

            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('candidate', userId, event.candidate);
                }
            };

            // Modified ontrack handling
            let videoAdded = false;
            peerConnection.ontrack = event => {
                if (!videoAdded) {
                    const video = document.createElement('video');
                    addVideoStream(video, event.streams[0], userId);
                    videoAdded = true;
                }
            };

            peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
                peerConnection.createAnswer().then(answer => {
                    peerConnection.setLocalDescription(answer);
                    socket.emit('answer', userId, answer);
                });
            });
        });

        socket.on('answer', (userId, answer) => {
            peerConnections[userId].setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('candidate', (userId, candidate) => {
            peerConnections[userId].addIceCandidate(new RTCIceCandidate(candidate));
        });

        socket.on('user-disconnected', userId => {
            console.log('User disconnected:', userId);
            if (peerConnections[userId]) {
                peerConnections[userId].close();
                delete peerConnections[userId];
                removeVideoElement(userId);
            }
        });

        socket.emit('join-room', ROOM_ID);
    }).catch(error => {
        console.error('Error accessing media devices.', error);
        alert('Unable to access camera/microphone. Please check permissions.');
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

    function addVideoStream(video, stream, userId) {
        video.srcObject = stream;
        video.setAttribute('data-peer-id', userId);
        video.addEventListener('loadedmetadata', () => {
            video.play();
        });
        videoGrid.append(video);
        updateLayoutForSharedScreen(userId);
    }

    function removeVideoElement(userId) {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (video.getAttribute('data-peer-id') === userId) {
                video.parentElement.removeChild(video);
            }
        });
    }

    const micButton = document.getElementById('toggle-mic');
    const cameraButton = document.getElementById('toggle-camera');
    const noiseCancelButton = document.getElementById('toggle-noise-cancellation');
    const screenShareButton = document.getElementById('toggle-screen-share');

    const micIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
    const micOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-off"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path><path d="M5 10v2a7 7 0 0 0 12 5"></path><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;

    const videoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video"><path d="m22 8-6 4 6 4V8Z"></path><rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect></svg>`;
    const videoOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video-off"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8"></path><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>`;

    const noiseCancelIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wand-2"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></svg>`;

    const screenShareIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>`;

    micButton.addEventListener('click', () => {
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        micButton.innerHTML = audioTrack.enabled 
            ? `${micIcon} Mute` 
            : `${micOffIcon} Unmute`;
    });

    cameraButton.addEventListener('click', () => {
        const videoTrack = stream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        cameraButton.innerHTML = videoTrack.enabled 
            ? `${videoIcon} Disable Video` 
            : `${videoOffIcon} Enable Video`;
    });

    noiseCancelButton.addEventListener('click', () => {
        noiseCancellationEnabled = !noiseCancellationEnabled;
        if (noiseCancellationEnabled) {
            source.connect(biquadFilter);
            biquadFilter.connect(destination);
            noiseCancelButton.innerHTML = `${noiseCancelIcon} Disable Noise Cancellation`;
        } else {
            source.disconnect(biquadFilter);
            source.connect(destination);
            noiseCancelButton.innerHTML = `${noiseCancelIcon} Enable Noise Cancellation`;
        }
    });

    let screenStream = null;

    async function toggleScreenShare() {
        if (!screenStream) {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                const videoTrack = screenStream.getVideoTracks()[0];
                Object.values(peerConnections).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                });
                const oldTrack = stream.getVideoTracks()[0];
                stream.removeTrack(oldTrack);
                stream.addTrack(videoTrack);
                myVideo.srcObject = stream;

                screenShareButton.innerHTML = `${screenShareIcon} Stop Sharing`;
                screenShareButton.classList.add('active');

                videoTrack.onended = () => {
                    stopScreenSharing();
                };
            } catch (err) {
                console.error('Error sharing screen:', err);
                alert('Unable to share screen');
            }
        } else {
            stopScreenSharing();
        }
    }

    function stopScreenSharing() {
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;

            navigator.mediaDevices.getUserMedia({ video: true })
                .then(camStream => {
                    const videoTrack = camStream.getVideoTracks()[0];
                    Object.values(peerConnections).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                    });

                    const oldTrack = stream.getVideoTracks()[0];
                    stream.removeTrack(oldTrack);
                    stream.addTrack(videoTrack);
                    myVideo.srcObject = stream;
                });

            screenShareButton.innerHTML = `${screenShareIcon} Share Screen`;
            screenShareButton.classList.remove('active');
        }
    }

    screenShareButton.addEventListener('click', toggleScreenShare);

    micButton.innerHTML = `${micIcon} Mute`;
    cameraButton.innerHTML = `${videoIcon} Disable Video`;
    noiseCancelButton.innerHTML = `${noiseCancelIcon} Disable Noise Cancellation`;
    screenShareButton.innerHTML = `${screenShareIcon} Share Screen`;

    window.addEventListener('beforeunload', () => {
        Object.values(peerConnections).forEach(pc => pc.close());
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
        }
        socket.disconnect();
    });
}