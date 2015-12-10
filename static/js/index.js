/**
 * Created by eak on 9/14/15.
 */

var socket = io.connect();
var mainVideoCurrentId;
var mainVideo;
var sessionId;

var participants = {};

window.onbeforeunload = function () {
    socket.disconnect();
};

socket.on("id", function (id) {
    console.log("receive id : " + id);
    sessionId = id;
});

// message handler
socket.on("message", function (message) {
    switch (message.id) {
        case "registered":
            console.log(message.data);
            break;
        case "incomingCall":
            incomingCall(message);
            break;
        case "callResponse":
            console.log(message);
            console.log(message.message);
            break;
        case "existingParticipants":
            console.log("existingParticipants : " + message.data);
            onExistingParticipants(message);
            break;
        case "newParticipantArrived":
            console.log("newParticipantArrived : " + message.new_user_id);
            onNewParticipant(message);
            break;
        case "participantLeft":
            console.log("participantLeft : " + message.sessionId);
            onParticipantLeft(message);
            break;
        case "receiveVideoAnswer":
            console.log("receiveVideoAnswer from : " + message.sessionId);
            onReceiveVideoAnswer(message);
            break;
        case "iceCandidate":
            console.log("iceCandidate from : " + message.sessionId);
            var participant = participants[message.sessionId];
            if (participant != null) {
                console.log(message.candidate);
                participant.rtcPeer.addIceCandidate(message.candidate, function (error) {
                    if (error) {
                        if (message.sessionId === sessionId) {
                            console.error("Error adding candidate to self : " + error);
                        } else {
                            console.error("Error adding candidate : " + error);
                        }
                    }
                });
            } else {
                console.error('still does not establish rtc peer for : ' + message.sessionId);
            }
            break;
        default:
            console.error("Unrecognized message: ", message);
    }
});

function sendMessage(data) {
    socket.emit("message", data);
}

function register() {
    document.getElementById('userName').disabled = true;
    document.getElementById('register').disabled = true;
    document.getElementById('joinRoom').disabled = false;
    document.getElementById('roomName').disabled = false;
    document.getElementById('sendInvite').disabled = false;
    document.getElementById('otherUserName').disabled = false;
    mainVideo = document.getElementById("main_video");
    var data = {
        id: "register",
        name: document.getElementById('userName').value
    };
    sendMessage(data);
}

function joinRoom(roomName) {
    document.getElementById('roomName').disabled = true;
    document.getElementById('joinRoom').disabled = true;
    document.getElementById('sendInvite').disabled = false;
    document.getElementById('otherUserName').disabled = false;
    document.getElementById('joinRoom').disabled = false;
    if(!document.getElementById('roomName').value){
        document.getElementById('roomName').value = roomName;
    }

    var data = {
        id: "joinRoom",
        roomName: roomName
    };
    sendMessage(data);
}

function call() {
    var roomName;
    console.log(participants);
    console.log(Object.keys(participants).length);
    // Not currently in a room
    if(Object.keys(participants).length == 0){
        roomName = generateUUID();
        document.getElementById('roomName').value = roomName;
        var data = {
            id: "joinRoom",
            roomName: roomName
        };
        sendMessage(data);
        document.getElementById('roomName').disabled = true;
        document.getElementById('joinRoom').disabled = true;
    }
    // In a room
    else{
        roomName = document.getElementById('roomName').value
    }
    var message = {
        id : 'call',
        from : document.getElementById('userName').value,
        to : document.getElementById('otherUserName').value,
        roomName: roomName
    };
    sendMessage(message);
}

function leaveRoom(){
    var myNode = document.getElementById("video_list");
    while (myNode.firstChild) {
        myNode.removeChild(myNode.firstChild);
    }
    document.getElementById('leaveRoom').disabled = true;
    document.getElementById('roomName').disabled = false;
    document.getElementById('joinRoom').disabled = false;
    document.getElementById('sendInvite').disabled = false;
    document.getElementById('otherUserName').disabled = false;
    var message = {
        id: "leaveRoom"
    };
    sendMessage(message);
    participants = {};
}

function incomingCall(message) {
    var joinRoomMessage = message;
    if (confirm('User ' + message.from
            + ' is calling you. Do you accept the call?')) {
        leaveRoom();
        joinRoom(joinRoomMessage.roomName);
    } else {
        var response = {
            id : 'incomingCallResponse',
            from : message.from,
            callResponse : 'reject',
            message : 'user declined'
        };
        sendMessage(response);
    }
}

function onExistingParticipants(message) {
    var constraints = {
        audio: true,
        video: {
            mandatory: {
                maxWidth: 320,
                maxFrameRate: 15,
                minFrameRate: 15
            }
        }
    };
    console.log(sessionId + " register in room " + message.roomName);

    // create video for current user to send to server
    var localParticipant = new Participant(sessionId);
    participants[sessionId] = localParticipant;
    var video = mainVideo;

    // bind function so that calling 'this' in that function will receive the current instance
    var options = {
        localVideo: video,
        mediaConstraints: constraints,
        onicecandidate: localParticipant.onIceCandidate.bind(localParticipant)
    };


    localParticipant.rtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function (error) {
        if (error) {
            return console.error(error);
        }

        // initial main video to local first
        mainVideoCurrentId = sessionId;
        mainVideo.src = localParticipant.rtcPeer.localVideo.src;
        mainVideo.muted = true;

        console.log("local participant id : " + sessionId);
        this.generateOffer(localParticipant.offerToReceiveVideo.bind(localParticipant));
    });

    // get access to video from all the participants
    console.log(message.data);
    for (var i in message.data) {
        receiveVideoFrom(message.data[i]);
    }
}

function receiveVideoFrom(sender) {
    console.log(sessionId + " receive video from " + sender);
    var participant = new Participant(sender);
    participants[sender] = participant;

    var video = createVideoForParticipant(participant);

    // bind function so that calling 'this' in that function will receive the current instance
    var options = {
        remoteVideo: video,
        onicecandidate: participant.onIceCandidate.bind(participant)
    };

    participant.rtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function (error) {
        if (error) {
            return console.error(error);
        }
        this.generateOffer(participant.offerToReceiveVideo.bind(participant));
    });
}

function onNewParticipant(message) {
    receiveVideoFrom(message.new_user_id)
}

function onParticipantLeft(message) {
    var participant = participants[message.sessionId];
    participant.dispose();
    delete participants[message.sessionId];

    console.log("video-" + participant.id);
    // remove video tag
    //document.getElementById("video-" + participant.id).remove();
    var video = document.getElementById("video-" + participant.id);

    // Internet Explorer doesn't know element.remove(), does know this
    video.parentNode.removeChild(video);
}

function onReceiveVideoAnswer(message) {
    var participant = participants[message.sessionId];
    participant.rtcPeer.processAnswer(message.sdpAnswer, function (error) {
        if (error) {
            console.error(error);
        } else {
            participant.isAnswer = true;
            while (participant.iceCandidateQueue.length) {
                console.error("collected : " + participant.id + " ice candidate");
                var candidate = participant.iceCandidateQueue.shift();
                participant.rtcPeer.addIceCandidate(candidate);
            }
        }
    });
}

/**
 * Create video DOM element
 * @param participant
 * @returns {Element}
 */
function createVideoForParticipant(participant) {

    var videoId = "video-" + participant.id;
    var video = document.createElement('video');

    video.autoplay = true;
    video.id = videoId;
    video.poster = "img/webrtc.png";
    document.getElementById("video_list").appendChild(video);

    // return video element
    return document.getElementById(videoId);
}

function generateUUID(){
    var d = new Date().getTime();
    if(window.performance && typeof window.performance.now === "function"){
        d += performance.now();; //use high-precision timer if available
    }
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
}
