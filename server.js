var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
server.listen(3000);
app.use('/', express.static(__dirname + '/client'));

function Lobby(Players) {
    this.Columns = 7;
    this.Rows = 7;
    this.End = false;
    this.Turn = 1;
    this.Players = Players;
    this.Game = [];
    for (var x = 0; x < 7; x++) {
        for (var y = 0; y < 7; y++) {
            this.Game.push(new Case(x, y, 0));
        }
    }

    this.Players.forEach(function(p) {
        Players.forEach(function(pName) {
            if (p != pName)
                p.emit('go', {
                    ID: p.ID,
                    Name: pName.Name
                });
        });
    });

    this.EmitToOtherClient = function(_client, message, data) {
        this.Players.forEach(function(p) {
            if (p != _client)
                p.emit(message, data);
        });
    }

    this.getCaseClick = function(data) {

        if(data.X < 3)
        {
            Count = 3 - this.Game.filter(function(_c) {
                return _c.Y === data.Y && _c.Clicker === 0 && _c.X < 3
            }).length;
        }
        else
        {
            Count = this.Game.filter(function(_c) {
                return _c.Y === data.Y && _c.Clicker === 0 && _c.X >= 3
            }).length;
            Count = Count + 2;
        }
        return this.CaseXY(Count, data.Y);
    }

    this.CaseXY = function(x, y) {
        for (var i = 0; i < this.Game.length; i++) {
            if (this.Game[i].X === x && this.Game[i].Y === y) {
                return this.Game[i];
            }
        }
        return null;
    }

    this.UpdateGame = function(_case, ID) {
        if (!this.End) {
            _case.Clicker = this.Turn;
            this.EmitPlayers('getClick', _case);

            if (this.Turn < this.Players.length)
                this.Turn++;
            else
                this.Turn = 1;

            this.TestWin(_case);
        }
    }

    this.EmitPlayers = function(message, data) {
        this.Players.forEach(function(p) {
            if (p != null) {
                p.emit(message, data);
            }
        });
    }

    this.Click = function(client, _caseClicked) {
        var _case = this.getCaseClick(_caseClicked);
        if (this.Turn === client.ID && _case != null)
            this.UpdateGame(_case, client.ID);
        else if (!this.End)
            client.emit('errorClick', _caseClicked);
    }

    this.Hover = function(client, _case) {
        // if (this.Turn === client.ID && !this.End)
        //     this.EmitPlayers('getHover', {
        //         Case: this.getCaseClick(_case),
        //         Clicker: client.ID
        //     });
    }

    this.UnHover = function(client, _case) {
        // if (this.Turn === client.ID)
        //     this.EmitPlayers('getUnHover', this.getCaseClick(_case));
    }

    this.UpdateNames = function(client) {
        this.EmitToOtherClient(client, 'yourName', client.Name);
    }

    this.EndGame = function() {
        if(!this.End) {
            this.EmitPlayers('leave');
            this.End = true;
        }
    }

    this.TestWin = function(_case) {
        var Directions = [
            this.Game.filter(function(a) {
                return a.X == _case.X
            }),
            this.Game.filter(function(a) {
                return a.Y == _case.Y
            }),
            this.Game.filter(function(a) {
                return a.X - _case.X == a.Y - _case.Y
            }),
            this.Game.filter(function(a) {
                return -(a.X - _case.X) == a.Y - _case.Y
            })
        ];

        for (var i = 0; i < Directions.length; i++) {
            var lWin = [];
            for (var j = 0; j < Directions[i].length; j++) {
                if (Directions[i][j].Clicker === _case.Clicker) {
                    lWin.push(Directions[i][j]);
                    if (lWin.length >= 4) {
                        this.Players.forEach(function(p) {
                            p.emit('win', {
                                Status: _case.Clicker == p.ID ? 'win' : 'loose',
                                CasesWin: lWin
                            });
                        });
                        this.End = true;
                        break;
                    }
                } else lWin = [];
            }
        }

        if (this.Game.filter(function(a) {
                return a.Clicker > 0
            }).length >= this.Game.length) {
            this.End = true;
            this.EmitPlayers('win', 0);
        }
    }
}

function Case(X, Y, Clicker) {
    this.X = X;
    this.Y = Y;
    this.Clicker = Clicker;
}

var lClients = [];
var lLobby = [];

io.on('connection', function(client) {
    client.on('search', function(name) {
        if (lClients.indexOf(client) < 0) {
            lClients.push(client);
            client.Name = name;
            client.ID = lClients.length;
            client.LobbyID = null;
            if (lClients.length >= 2) {
                lClients.forEach(function(_c) { _c.LobbyID = lLobby.length; });
                lLobby.push(new Lobby(lClients));
                lClients = [];
            } else {
                client.emit('wait');
            }
        }
    });

    client.on('click', function(data) {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].Click(client, data);
    });

    client.on('nameUpdate', function(data) {
        client.Name = data;
        if(client.LobbyID != null)
            lLobby[client.LobbyID].UpdateNames(client);
    });

    client.on('hover', function(data) {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].Hover(client, data);
    });

    client.on('unhover', function(data) {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].UnHover(client, data);
    });

    client.on('disconnectPlayer', function() {
        Leave();
    });

    client.on('disconnect', function() {
        Leave();

        lClients.forEach(function(_c) {
            if (_c === client)
                lClients.splice(client, 1);
        });
    });

    function Leave() {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].EndGame();
    }
});
