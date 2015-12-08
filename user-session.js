/**
 * Created by eak on 9/14/15.
 */
function UserSession(id, socket) {
    this.id = id;
    this.socket = socket;
    this.outgoingMedia = null;
    this.incomingMedia = {};
    this.iceCandidateQueue = {};
}


UserSession.prototype.addIceCandidate = function (data, candidate) {
    // ice candidate for this user
    if (data.sender === this.id) {
        if (this.outgoingMedia) {
            console.log(' add candidate to self : ' + data.sender);
            this.outgoingMedia.addIceCandidate(candidate);
        } else {
            console.error(' still does not have outgoing endpoint for : ' + data.sender);
            this.iceCandidateQueue[data.sender].push({
                data: data,
                candidate: candidate
            });
        }
    } else {
        var webRtc = this.incomingMedia[data.sender];
        if (webRtc) {
            console.log(this.id + ' add candidate to from : ' + data.sender);
            webRtc.addIceCandidate(candidate);
        } else {
            console.error(this.id + ' still does not have endpoint for : ' + data.sender);
            if (!this.iceCandidateQueue[data.sender]) {
                this.iceCandidateQueue[data.sender] = [];
            }
            this.iceCandidateQueue[data.sender].push({
                data: data,
                candidate: candidate
            });
        }
    }
};

UserSession.prototype.sendMessage = function (data) {
    this.socket.emit('message', data);
};

UserSession.prototype.setRoomName = function (roomName){
    this.roomName = roomName;
}

module.exports = UserSession;