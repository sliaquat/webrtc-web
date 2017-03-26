'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');

var fileServer = new (nodeStatic.Server)();
var app = http.createServer(function (req, res) {
    fileServer.serve(req, res);
}).listen(8080);

var io = socketIO.listen(app);

io.sockets.on('connection', function (socket) {
    console.log("io.sockets.adapter.rooms: " + JSON.stringify(io.sockets.adapter.rooms));
    // convenience function to log server messages on the client
    function log() {
        var array = ['Message from server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    socket.on('message', function (message, clientName, room) {
        console.log('Client ' + clientName + ' said: ', message);
        log('Client ' + clientName + ' said: ', message);
        // for a real app, would be room-only (not broadcast)
        //SHL: The above line is deep. Right now, the message is sent to all except the receiver.
        //SHL: In actuality, it should be sent to members of a room only except the receiver.
        //SHL: eg: io.sockets.in(room).emit('message', message);
        //SHL: where room will be sent by the client.

        // socket.broadcast.emit('message', message);
        socket.broadcast.to(room).emit('message', message);

        if (message === 'bye' && io.sockets.sockets.length > 0) {
            socket.leave(room);
            socket.disconnect();
        }
    });

    socket.on('disconnect', function () {
        log('Received request to create or join room ');
    })

    socket.on('disconnect all', function (room) {
        io.sockets.sockets.forEach(function(s) {
            s.leave(room);
            s.disconnect(true);
        });

        console.log("After Disconnnect all - io.sockets.adapter.rooms: " + JSON.stringify(io.sockets.adapter.rooms));
        console.log("After Disconnect all - io.sockets.sockets.length: " + io.sockets.sockets.length)

    })

    socket.on('create or join', function (room) {

        log('Received request to create or join room ' + room);


        //Create room if not already created.
        if (typeof io.sockets.adapter.rooms[room] === 'undefined') {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room);
            socket.emit('created', room, socket.id);

        }
        else{ //Join already created Room
            log('Client ID ' + socket.id + ' joined room ' + room);
            io.sockets.in(room).emit('join requested', room);
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready');
        }
        // else { // max two clients
        //     socket.emit('full', room);
        // }
        //

    });

    socket.on('ipaddr', function () {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function (details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });


});

