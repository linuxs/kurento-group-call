/**
 * Created by eak on 9/14/15.
 */

function UserRegistry() {
    this.usersById = {};
    this.usersByName = {};
}

UserRegistry.prototype.register = function (user) {
    this.usersById[user.id] = user;
    this.usersByName[user.name] = user;
};

UserRegistry.prototype.unregister = function (id) {
    var user = this.getById(id);
    if (user)
        delete this.usersById[id];
    if (user && this.getByName(user.name))
        delete this.usersByName[user.name]
};

UserRegistry.prototype.getById = function (id) {
    return this.usersById[id];
};

UserRegistry.prototype.getByName = function (name) {
    return this.usersByName[name];
};

UserRegistry.prototype.removeById = function (id) {
    var userSession = this.usersById[id];
    if (!userSession)
        return;
    delete this.usersById[id];
    delete this.usersByName[userSession.name];
};

UserRegistry.prototype.getUsersByRoom = function (room) {
    var userList = this.usersByName;
    var usersInRoomList = [];
    for (var i in userList) {
        if (userList[i].room === room) {
            usersInRoomList.push(userList[i]);
        }
    }

    return usersInRoomList;
};

module.exports = UserRegistry;