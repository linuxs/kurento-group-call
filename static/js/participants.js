/**
 * Created by eak on 9/15/15.
 */
function Participant(id) {
    this.id = id;
    this.rtcPeer = null;
    this.iceCandidateQueue = [];
}

Participant.prototype.offerToReceiveVideo = function (error, offerSdp) {
    if (error) {
        return console.error("sdp offer error");
    }
    var msg = {
        id: "receiveVideoFrom",
        sender: this.id,
        sdpOffer: offerSdp
    };
    console.log('Invoking SDP offer callback function ' + msg.sender);
    sendMessage(msg);
};

Participant.prototype.onIceCandidate = function (candidate) {
    console.log(this.id + " Local candidate" + JSON.stringify(candidate));

    var message = {
        id: 'onIceCandidate',
        candidate: candidate,
        sender: this.id
    };
    sendMessage(message);
};

Participant.prototype.dispose = function () {
    console.log('Disposing participant ' + this.id);
    this.rtcPeer.dispose();
    this.rtcPeer = null;
};