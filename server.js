/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 */
var UserRegistry = require('./user-registry.js');
var UserSession = require('./user-session.js');

// store global variables
var userRegistry = new UserRegistry();
var rooms = {};

var express = require('express');

// kurento required
var path = require('path');
var url = require('url');
var kurento = require('kurento-client');

// Constants
var settings = {
        WEBSOCKETURL: "http://localhost:8080/",
        KURENTOURL: "ws://localhost:8888/kurento"
};

// Singleton Kurento Client, gets set on first interaction
var kurentoClient = null;

/*
 * Server startup
 */
var app = express();
var asUrl = url.parse(settings.WEBSOCKETURL);
var port = asUrl.port;
var server = app.listen(port, function () {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});

var io = require('socket.io')(server);

/**
 * Message handlers
 */
io.on('connection', function (socket) {
    var userList = '';
    for (var userId in userRegistry.usersById) {
        userList += ' ' + userId + ',';
    }
    console.log('receive new client : ' + socket.id + ' currently have : ' + userList);
    socket.emit('id', socket.id);

    socket.on('error', function (data) {
        console.log('Connection: ' + socket.id + ' error : ' + data);
        leaveRoom(socket.id, function () {

        });
    });

    socket.on('disconnect', function (data) {
        console.log('Connection: ' + socket.id + ' disconnect : ' + data);
        leaveRoom(socket.id, function () {
            var userSession = userRegistry.getById(socket.id);
            stop(userSession.id);
        });
    });

    socket.on('message', function (message) {
        console.log('Connection: ' + socket.id + ' receive message: ' + message.id);

        switch (message.id) {
            case 'register':
                console.log('registering ' + socket.id);
                register(socket, message.name, function(){

                });

                break;
            case 'joinRoom':
                console.log(socket.id + ' joinRoom : ' + message.roomName);
                joinRoom(socket, message.roomName, function () {

                });
                break;
            case 'receiveVideoFrom':
                console.log(socket.id + ' receiveVideoFrom : ' + message.sender);
                receiveVideoFrom(socket, message.sender, message.sdpOffer, function () {

                });
                break;
            case 'leaveRoom':
                console.log(socket.id + ' leaveRoom');
                leaveRoom(socket.id);
                break;
            case 'call':
                console.log("Calling");
                call(socket.id, message.to, message.from);
                break;
            case 'onIceCandidate':
                addIceCandidate(socket, message);
                break;
            default:
                socket.emit({id: 'error', message: 'Invalid message ' + message});
        }
    });
});

/**
 * Register user to server
 * @param socket
 * @param name
 * @param callback
 */
function register(socket, name, callback){
    var userSession = new UserSession(socket.id, socket);
    userSession.name = name;
    userRegistry.register(userSession);
    userSession.sendMessage({
        id: 'registered',
        data: 'Successfully registered ' + socket.id
    });
    console.log(userRegistry);
}

/**
 * Gets and joins room
 * @param socket
 * @param roomName
 * @param callback
 */
function joinRoom(socket, roomName, callback) {
    getRoom(roomName, function (error, room) {
        if (error) {
            callback(error)
        }
        join(socket, room, function (error, user) {
            console.log('join success : ' + user.id);
        });
    });
}

/**
 * Gets room. Creates room if room does not exist
 * @param roomName
 * @param callback
 */
function getRoom(roomName, callback) {

    var room = rooms[roomName];

    if (room == null) {
        console.log('create new room : ' + roomName);
        getKurentoClient(function (error, kurentoClient) {
            if (error) {
                return callback(error);
            }

            // create pipeline for room
            kurentoClient.create('MediaPipeline', function (error, pipeline) {
                if (error) {
                    return callback(error);
                }

                room = {
                    name: roomName,
                    pipeline: pipeline,
                    participants: {}
                };
                rooms[roomName] = room;
                callback(null, room);
            });
        });
    } else {
        console.log('get existing room : ' + roomName);
        callback(null, room);
    }
}

/**
 * Join (conference) call room
 * @param socket
 * @param room
 * @param callback
 */
function join(socket, room, callback) {
    // create user session
    var userSession = userRegistry.getById(socket.id);
    userSession.setRoomName(room.name);

    room.pipeline.create('WebRtcEndpoint', function (error, outgoingMedia) {
        if (error) {
            console.error('no participant in room');
            // no participants in room yet release pipeline
            if (Object.keys(room.participants).length == 0) {
                room.pipeline.release();
            }
            return callback(error);
        }
        userSession.outgoingMedia = outgoingMedia;

        // add ice candidate the get sent before endpoint is established
        var iceCandidateQueue = userSession.iceCandidateQueue[socket.id];
        if (iceCandidateQueue) {
            while (iceCandidateQueue.length) {
                var message = iceCandidateQueue.shift();
                console.error('user : ' + userSession.id + ' collect candidate for outgoing media');
                userSession.outgoingMedia.addIceCandidate(message.candidate);
            }
        }

        userSession.outgoingMedia.on('OnIceCandidate', function (event) {
            console.log("generate outgoing candidate : " + userSession.id);
            var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
            userSession.sendMessage({
                id: 'iceCandidate',
                sessionId: userSession.id,
                candidate: candidate
            });
        });

        // notify other user that new user is joining
        var usersInRoom = room.participants;
        var data = {
            id: 'newParticipantArrived',
            new_user_id: userSession.id
        };

        // notify existing user
        for (var i in usersInRoom) {
            usersInRoom[i].sendMessage(data);
        }

        var existingUserIds = [];
        for (var i in room.participants) {
            existingUserIds.push(usersInRoom[i].id);
        }
        // send list of current user in the room to current participant
        userSession.sendMessage({
            id: 'existingParticipants',
            data: existingUserIds,
            roomName: room.name
        });

        // register user to room
        room.participants[userSession.id] = userSession;

        callback(null, userSession);
    });
}

/**
 * Leave (conference) call room
 * @param sessionId
 * @param callback
 */
function leaveRoom(sessionId, callback) {
    var userSession = userRegistry.getById(sessionId);

    if (!userSession) {
        return;
    }

    var room = rooms[userSession.roomName];

    if(!room){
        return;
    }

    console.log('notify all user that ' + userSession.id + ' is leaving the room ' + room.name);
    var usersInRoom = room.participants;
    delete usersInRoom[userSession.id];
    userSession.outgoingMedia.release();
    // release incoming media for the leaving user
    for (var i in userSession.incomingMedia) {
        userSession.incomingMedia[i].release();
        delete userSession.incomingMedia[i];
    }

    var data = {
        id: 'participantLeft',
        sessionId: userSession.id
    };
    for (var i in usersInRoom) {
        var user = usersInRoom[i];
        // release viewer from this
        user.incomingMedia[userSession.id].release();
        delete user.incomingMedia[userSession.id];

        // notify all user in the room
        user.sendMessage(data);
    }

    delete userSession.roomName;
}

/**
 * Unregister user
 * @param sessionId
 */
function stop(sessionId) {
    userRegistry.unregister(sessionId);
}

/**
 * Invite other user to a (conference) call
 * @param callerId
 * @param to
 * @param from
 */
function call(callerId, to, from) {
    if(to === from){
        return;
    }
    var roomName;
    var caller = userRegistry.getById(callerId);
    var rejectCause = 'User ' + to + ' is not registered';
    if (userRegistry.getByName(to)) {
        var callee = userRegistry.getByName(to);
        if(!caller.roomName){
            roomName = generateUUID();
            joinRoom(caller.socket, roomName);
        }
        else{
            roomName = caller.roomName;
        }
        callee.peer = from;
        caller.peer = to;
        var message = {
            id: 'incomingCall',
            from: from,
            roomName: roomName
        };
        try{
            return callee.sendMessage(message);
        } catch(exception) {
            rejectCause = "Error " + exception;
        }
    }
    var message  = {
        id: 'callResponse',
        response: 'rejected: ',
        message: rejectCause
    };
    caller.sendMessage(message);
}

/**
 * Retrieve sdpOffer from other user, required for WebRTC calls
 * @param socket
 * @param senderId
 * @param sdpOffer
 * @param callback
 */
function receiveVideoFrom(socket, senderId, sdpOffer, callback) {
    var userSession = userRegistry.getById(socket.id);
    var sender = userRegistry.getById(senderId);

    getEndpointForUser(userSession, sender, function (error, endpoint) {
        if (error) {
            callback(error);
        }

        endpoint.processOffer(sdpOffer, function (error, sdpAnswer) {
            console.log("process offer from : " + senderId + " to " + userSession.id);
            if (error) {
                return callback(error);
            }
            var data = {
                id: 'receiveVideoAnswer',
                sessionId: sender.id,
                sdpAnswer: sdpAnswer
            };
            userSession.sendMessage(data);

            endpoint.gatherCandidates(function (error) {
                if (error) {
                    return callback(error);
                }
            });
            return callback(null, sdpAnswer);
        });
    });
}

/**
 * Get user WebRTCEndPoint, Required for WebRTC calls
 * @param userSession
 * @param sender
 * @param callback
 */
function getEndpointForUser(userSession, sender, callback) {
    // request for self media
    if (userSession.id === sender.id) {
        callback(null, userSession.outgoingMedia);
        return;
    }

    var incoming = userSession.incomingMedia[sender.id];
    if (incoming == null) {
        console.log('user : ' + userSession.id + ' create endpoint to receive video from : ' + sender.id);
        getRoom(userSession.roomName, function (error, room) {
            if (error) {
                return callback(error);
            }

            room.pipeline.create('WebRtcEndpoint', function (error, incomingMedia) {
                if (error) {
                    // no participants in room yet release pipeline
                    if (Object.keys(room.participants).length == 0) {
                        room.pipeline.release();
                    }
                    return callback(error);
                }
                console.log('user : ' + userSession.id + ' successfully created pipeline');
                userSession.incomingMedia[sender.id] = incomingMedia;

                // add ice candidate the get sent before endpoint is established
                var iceCandidateQueue = userSession.iceCandidateQueue[sender.id];
                if (iceCandidateQueue) {
                    while (iceCandidateQueue.length) {
                        var message = iceCandidateQueue.shift();
                        console.log('user : ' + userSession.id + ' collect candidate for : ' + message.data.sender);
                        incomingMedia.addIceCandidate(message.candidate);
                    }
                }

                incomingMedia.on('OnIceCandidate', function (event) {
                    console.log("generate incoming media candidate : " + userSession.id + " from " + sender.id);
                    var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                    userSession.sendMessage({
                        id: 'iceCandidate',
                        sessionId: sender.id,
                        candidate: candidate
                    });
                });
                sender.outgoingMedia.connect(incomingMedia, function (error) {
                    if (error) {
                        callback(error);
                    }
                    callback(null, incomingMedia);
                });

            });
        });
    } else {
        console.log('user : ' + userSession.id + ' get existing endpoint to receive video from : ' + sender.id);
        sender.outgoingMedia.connect(incoming, function (error) {
            if (error) {
                callback(error);
            }
            callback(null, incoming);
        });
    }
}

/**
 * Add ICE candidate, required for WebRTC calls
 * @param socket
 * @param message
 */
function addIceCandidate(socket, message) {
    var user = userRegistry.getById(socket.id);
    if (user != null) {
        // assign type to IceCandidate
        var candidate = kurento.register.complexTypes.IceCandidate(message.candidate);
        user.addIceCandidate(message, candidate);
    } else {
        console.error('ice candidate with no user receive : ' + socket.id);
    }
}

/**
 * Retrieve Kurento Client to connect to Kurento Media Server, required for WebRTC calls
 * @param callback
 * @returns {*}
 */
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(settings.KURENTOURL, function (error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + settings.KURENTOURL;
            return callback(message + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

/**
 * Generate unique ID, used for generating new rooms
 * @returns {string}
 */
function generateUUID(){
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
}
app.use(express.static(path.join(__dirname, 'static')));
