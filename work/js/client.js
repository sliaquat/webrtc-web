'use strict';
console.log('version 11')
var isChannelReady = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

var pcConfig = {
    'iceServers': [{
        'url': 'stun:stun.l.google.com:19302'
    }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
    'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': true
    }
};

/////////////////////////////////////////////

document.getElementById('call').setAttribute("disabled", "disabled");
document.getElementById('leave-room').setAttribute("disabled", "disabled");

var room = 'foo';
var clientName;
//SHL: SHL Step 1 - Connect to socket.io server (Could provide a server address here. By default it is local host.)
var socket = io.connect();

socket.on('created', function (room) {
    //SHL: Client Log 4
    console.log(clientName + ': 4 - Created room ' + room);
    document.getElementById('call').removeAttribute("disabled");
    document.getElementById('leave-room').removeAttribute("disabled");

});

socket.on('full', function (room) {
    console.log(clientName + ': Room ' + room + ' is full');
});

socket.on('join requested', function (room) {
    console.log(clientName + ': Another peer made a request to join room ' + room);
    console.log(clientName + ': This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
});

socket.on('joined', function (room) {
    console.log(clientName + ': joined: ' + room);
    isChannelReady = true;
    document.getElementById('call').removeAttribute("disabled");
    document.getElementById('leave-room').removeAttribute("disabled");
});

socket.on('log', function (array) {
    console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
    //SHL: Client Log 5
    if (message.type !== 'candidate')
        console.log(clientName + ': Client ' + clientName + ' sending message: ', message);
    socket.emit('message', message, clientName, room);
}

// This client receives a message
socket.on('message', function (message) {
    if(message.type !== 'candidate')
        console.log(clientName + ': received message:', message);

    if (message.type === 'offer') {
        //SHL: Step 5 - initiate Stream. Will happen on second
        if (typeof pc === 'undefined')
            createPeerConnection();
        if (typeof localStream !== 'undefined')
            pc.addStream(localStream);

        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();

    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

////////////////////////////////////////////////////


var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

var constraints = {
    audio: true,
    video: true
};


//SHL: Step 4 - getUserMedia
function gotStream(stream) {
    //SHL: Client Log 3
    console.log(clientName + ': 3 - Adding local stream.');
    localVideo.src = window.URL.createObjectURL(stream);
    localStream = stream;
}


window.onbeforeunload = function () {
    sendMessage('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
    try {

        pc = new RTCPeerConnection(pcConfig);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log(clientName + ': Created RTCPeerConnnection');
    } catch (e) {
        console.log(clientName + ': Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    // console.log(clientName + ': icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log(clientName + ': End of candidates.');
    }
}

function handleCreateOfferError(event) {
    console.log(clientName + ': createOffer() error: ', event);
}

function doCall() {
    console.log(clientName + ': Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError, sdpConstraints);
}

function doAnswer() {
    console.log(clientName + ': Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    //  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    pc.setLocalDescription(sessionDescription);
    console.log(clientName + ': setLocalAndSendMessage sending message: ', sessionDescription);
    sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}


function handleRemoteStreamAdded(event) {
    console.log(clientName + ': Remote stream added.');
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
    console.log(clientName + ': Remote stream removed. Event: ', event);
}


function hangup() {
    console.log(clientName + ': Hanging up.');
    stop();
    sendMessage('bye');
}

function handleRemoteHangup() {
    console.log(clientName + ': Session terminated.');
    stop();
    sendMessage('bye');
}

function stop() {
    isStarted = false;
    // isAudioMuted = false;
    // isVideoMuted = false;
    if (pc) {
        pc.close();
        pc = null;
    }
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
    var sdpLines = sdp.split('\r\n');
    var mLineIndex;
    // Search for m line.
    for (var i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('m=audio') !== -1) {
            mLineIndex = i;
            break;
        }
    }
    if (mLineIndex === null) {
        return sdp;
    }

    // If Opus is available, set it as the default in m line.
    for (i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('opus/48000') !== -1) {
            var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
            if (opusPayload) {
                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
                    opusPayload);
            }
            break;
        }
    }

    // Remove CN in m line and sdp.
    sdpLines = removeCN(sdpLines, mLineIndex);

    sdp = sdpLines.join('\r\n');
    return sdp;
}

function extractSdp(sdpLine, pattern) {
    var result = sdpLine.match(pattern);
    return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
    var elements = mLine.split(' ');
    var newLine = [];
    var index = 0;
    for (var i = 0; i < elements.length; i++) {
        if (index === 3) { // Format of media starts from the fourth.
            newLine[index++] = payload; // Put target payload to the first.
        }
        if (elements[i] !== payload) {
            newLine[index++] = elements[i];
        }
    }
    return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
    var mLineElements = sdpLines[mLineIndex].split(' ');
    // Scan from end for the convenience of removing an item.
    for (var i = sdpLines.length - 1; i >= 0; i--) {
        var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
        if (payload) {
            var cnPos = mLineElements.indexOf(payload);
            if (cnPos !== -1) {
                // Remove CN payload from m line.
                mLineElements.splice(cnPos, 1);
            }
            // Remove CN line in sdp
            sdpLines.splice(i, 1);
        }
    }

    sdpLines[mLineIndex] = mLineElements.join(' ');
    return sdpLines;
}

function startLocalStream() {


    //SHL: Client Log 2
    console.log(clientName + ': 2 - Getting user media with constraints', constraints);

    navigator.mediaDevices.getUserMedia(constraints)
        .then(gotStream)
        .catch(function (e) {
            alert('getUserMedia() error: ' + e.name);
        });

}


document.getElementById('join-room').onclick = function () {
    // Could prompt for room name:
    clientName = prompt('Enter client name:', 'Unnamed Client');
    console.log('This clients name is: ' + clientName);

    if (room !== '') {
        socket.emit('create or join', room);
        //SHL: Client Log 1
        console.log(clientName + ': 1 - Client Attempted to create or  join room', room);
    }

    startLocalStream();
    document.getElementById('join-room').setAttribute("disabled", "disabled");
};


document.getElementById('call').onclick = function () {
    //SHL: Step 3 - getUserMedia

    createPeerConnection();

    if (typeof pc !== 'undefined' && typeof localStream !== 'undefined') {
        pc.addStream(localStream);
        doCall();
    }
    document.getElementById('call').setAttribute("disabled", "disabled");

};

document.getElementById('leave-room').onclick = function () {
    hangup();
};
